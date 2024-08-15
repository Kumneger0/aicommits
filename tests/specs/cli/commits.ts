import { testSuite, expect } from 'manten';
import {
	assertOpenAiToken,
	createFixture,
	createGit,
	files,
} from '../../utils.js';
import { getOrganizedDiff } from '../../../src/commands/aicg.js';

export default testSuite(({ describe }) => {
	if (process.platform === 'win32') {
		// https://github.com/nodejs/node/issues/31409
		console.warn(
			'Skipping tests on Windows because Node.js spawn cant open TTYs'
		);
		return;
	}

	assertOpenAiToken();

	describe('Commits', async ({ test, describe }) => {
		test('Excludes files', async () => {
			const { fixture, aicg } = await createFixture(files);
			const git = await createGit(fixture.path);

			await git('add', ['data.json']);
			const statusBefore = await git('status', [
				'--porcelain',
				'--untracked-files=no',
			]);
			expect(statusBefore.stdout).toBe('A  data.json');

			const { stdout, exitCode } = await aicg(['--exclude', 'data.json'], {
				reject: false,
			});
			expect(exitCode).toBe(1);
			expect(stdout).toMatch('No staged changes found.');
			await fixture.rm();
		});

		test('Generates commit message', async () => {
			const { fixture, aicg } = await createFixture(files);
			const git = await createGit(fixture.path);

			await git('add', ['data.json']);

			const committing = aicg();
			committing.stdout!.on('data', (buffer: Buffer) => {
				const stdout = buffer.toString();
				if (stdout.match('└')) {
					committing.stdin!.write('y');
					committing.stdin!.end();
				}
			});

			await committing;

			const statusAfter = await git('status', [
				'--porcelain',
				'--untracked-files=no',
			]);
			expect(statusAfter.stdout).toBe('');

			const { stdout: commitMessage } = await git('log', [
				'--pretty=format:%s',
			]);
			console.log({
				commitMessage,
				length: commitMessage?.length ?? 0,
			});
			expect(commitMessage?.length ?? 0).toBeLessThanOrEqual(50);

			await fixture.rm();
		});

		test('Generated commit message must be under 20 characters', async () => {
			const { fixture, aicg } = await createFixture({
				...files,
				'.aicg': `${files['.aicg']}\nmax-length=20`,
			});

			const git = await createGit(fixture.path);

			await git('add', ['data.json']);

			const committing = aicg();
			committing.stdout!.on('data', (buffer: Buffer) => {
				const stdout = buffer.toString();
				if (stdout.match('└')) {
					committing.stdin!.write('y');
					committing.stdin!.end();
				}
			});

			await committing;

			const { stdout: commitMessage } = await git('log', [
				'--pretty=format:%s',
			]);
			console.log({
				commitMessage,
				length: commitMessage?.length,
			});
			expect(commitMessage?.length).toBeLessThanOrEqual(20);

			await fixture.rm();
		});

		test('Accepts --all flag, staging all changes before commit', async () => {
			const { fixture, aicg } = await createFixture(files);
			const git = await createGit(fixture.path);

			await git('add', ['data.json']);
			await git('commit', ['-m', 'wip']);

			// Change tracked file
			await fixture.writeFile('data.json', 'Test');

			const statusBefore = await git('status', ['--short']);
			expect(statusBefore.stdout).toBe(' M data.json\n?? .aicg');

			const committing = aicg(['--all']);
			committing.stdout!.on('data', (buffer: Buffer) => {
				const stdout = buffer.toString();
				if (stdout.match('└')) {
					committing.stdin!.write('y');
					committing.stdin!.end();
				}
			});

			await committing;

			const statusAfter = await git('status', ['--short']);
			expect(statusAfter.stdout).toBe('?? .aicg');

			const { stdout: commitMessage } = await git('log', [
				'-n1',
				'--pretty=format:%s',
			]);
			console.log({
				commitMessage,
				length: commitMessage?.length,
			});
			expect(commitMessage?.length).toBeLessThanOrEqual(50);

			await fixture.rm();
		});

		test('Accepts --generate flag, overriding config', async ({
			onTestFail,
		}) => {
			const { fixture, aicg } = await createFixture({
				...files,
				'.aicg': `${files['.aicg']}\ngenerate=4`,
			});
			const git = await createGit(fixture.path);

			await git('add', ['data.json']);

			// Generate flag should override generate config
			const committing = aicg(['--generate', '2']);

			// Hit enter to accept the commit message
			committing.stdout!.on('data', function onPrompt(buffer: Buffer) {
				const stdout = buffer.toString();
				if (stdout.match('└')) {
					committing.stdin!.write('\r');
					committing.stdin!.end();
					committing.stdout?.off('data', onPrompt);
				}
			});

			const { stdout } = await committing;
			//@ts-ignore
			const countChoices = stdout?.match(/ {2}[●○]/g)?.length ?? 0;

			onTestFail(() => console.log({ stdout }));
			expect(countChoices).toBe(2);

			const statusAfter = await git('status', [
				'--porcelain',
				'--untracked-files=no',
			]);
			expect(statusAfter.stdout).toBe('');

			const { stdout: commitMessage } = await git('log', [
				'--pretty=format:%s',
			]);
			console.log({
				commitMessage,
				length: commitMessage?.length,
			});
			expect(commitMessage?.length).toBeLessThanOrEqual(50);

			await fixture.rm();
		});

		test('Generates Japanese commit message via locale config', async () => {
			// https://stackoverflow.com/a/15034560/911407
			const japanesePattern =
				/[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uFF00-\uFF9F\u4E00-\u9FAF\u3400-\u4DBF]/;

			const { fixture, aicg } = await createFixture({
				...files,
				'.aicg': `${files['.aicg']}\nlocale=ja`,
			});
			const git = await createGit(fixture.path);

			await git('add', ['data.json']);

			const committing = aicg();

			committing.stdout!.on('data', (buffer: Buffer) => {
				const stdout = buffer.toString();
				if (stdout.match('└')) {
					committing.stdin!.write('y');
					committing.stdin!.end();
				}
			});

			await committing;

			const statusAfter = await git('status', [
				'--porcelain',
				'--untracked-files=no',
			]);
			expect(statusAfter.stdout).toBe('');

			const { stdout: commitMessage } = await git('log', [
				'--pretty=format:%s',
			]);
			console.log({
				commitMessage,
				length: commitMessage?.length,
			});
			expect(commitMessage).toMatch(japanesePattern);
			expect(commitMessage?.length).toBeLessThanOrEqual(50);

			await fixture.rm();
		});

		describe('commit types', ({ test }) => {
			test('Should not use conventional commits by default', async () => {
				const conventionalCommitPattern =
					/(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test):\s/;
				const { fixture, aicg } = await createFixture({
					...files,
				});
				const git = await createGit(fixture.path);

				await git('add', ['data.json']);

				const committing = aicg();

				committing.stdout!.on('data', (buffer: Buffer) => {
					const stdout = buffer.toString();
					if (stdout.match('└')) {
						committing.stdin!.write('y');
						committing.stdin!.end();
					}
				});

				await committing;

				const statusAfter = await git('status', [
					'--porcelain',
					'--untracked-files=no',
				]);
				expect(statusAfter.stdout).toBe('');

				const { stdout: commitMessage } = await git('log', ['--oneline']);
				console.log('Committed with:', commitMessage);
				expect(commitMessage).not.toMatch(conventionalCommitPattern);

				await fixture.rm();
			});

			test('Conventional commits', async () => {
				const conventionalCommitPattern =
					/(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test):\s/;
				const { fixture, aicg } = await createFixture({
					...files,
					'.aicg': `${files['.aicg']}\ntype=conventional`,
				});
				const git = await createGit(fixture.path);

				await git('add', ['data.json']);

				const committing = aicg();

				committing.stdout!.on('data', (buffer: Buffer) => {
					const stdout = buffer.toString();
					if (stdout.match('└')) {
						committing.stdin!.write('y');
						committing.stdin!.end();
					}
				});

				await committing;

				const statusAfter = await git('status', [
					'--porcelain',
					'--untracked-files=no',
				]);
				expect(statusAfter.stdout).toBe('');

				const { stdout: commitMessage } = await git('log', ['--oneline']);
				console.log('Committed with:', commitMessage);
				expect(commitMessage).toMatch(conventionalCommitPattern);

				await fixture.rm();
			});

			test('Accepts --type flag, overriding config', async () => {
				const conventionalCommitPattern =
					/(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test):\s/;
				const { fixture, aicg } = await createFixture({
					...files,
					'.aicg': `${files['.aicg']}\ntype=other`,
				});
				const git = await createGit(fixture.path);

				await git('add', ['data.json']);

				// Generate flag should override generate config
				const committing = aicg(['--type', 'conventional']);

				committing.stdout!.on('data', (buffer: Buffer) => {
					const stdout = buffer.toString();
					if (stdout.match('└')) {
						committing.stdin!.write('y');
						committing.stdin!.end();
					}
				});

				await committing;

				const statusAfter = await git('status', [
					'--porcelain',
					'--untracked-files=no',
				]);
				expect(statusAfter.stdout).toBe('');

				const { stdout: commitMessage } = await git('log', ['--oneline']);
				console.log('Committed with:', commitMessage);
				expect(commitMessage).toMatch(conventionalCommitPattern);

				await fixture.rm();
			});

			test('Accepts empty --type flag', async () => {
				const conventionalCommitPattern =
					/(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test):\s/;
				const { fixture, aicg } = await createFixture({
					...files,
					'.aicg': `${files['.aicg']}\ntype=conventional`,
				});
				const git = await createGit(fixture.path);

				await git('add', ['data.json']);

				const committing = aicg(['--type', '']);

				committing.stdout!.on('data', (buffer: Buffer) => {
					const stdout = buffer.toString();
					if (stdout.match('└')) {
						committing.stdin!.write('y');
						committing.stdin!.end();
					}
				});

				await committing;

				const statusAfter = await git('status', [
					'--porcelain',
					'--untracked-files=no',
				]);
				expect(statusAfter.stdout).toBe('');

				const { stdout: commitMessage } = await git('log', ['--oneline']);
				console.log('Committed with:', commitMessage);
				expect(commitMessage).not.toMatch(conventionalCommitPattern);

				await fixture.rm();
			});
		});

		describe('proxy', ({ test }) => {
			test('Fails on invalid proxy', async () => {
				const { fixture, aicg } = await createFixture({
					...files,
					'.aicg': `${files['.aicg']}\nproxy=http://localhost:1234`,
				});
				const git = await createGit(fixture.path);

				await git('add', ['data.json']);

				const committing = aicg([], {
					reject: false,
				});

				committing.stdout!.on('data', (buffer: Buffer) => {
					const stdout = buffer.toString();
					if (stdout.match('└')) {
						committing.stdin!.write('y');
						committing.stdin!.end();
					}
				});

				const { stdout, exitCode } = await committing;

				expect(exitCode).toBe(1);
				expect(stdout).toMatch('connect ECONNREFUSED');

				await fixture.rm();
			});

			test('Connects with config', async () => {
				const { fixture, aicg } = await createFixture({
					...files,
					'.aicg': `${files['.aicg']}\nproxy=http://localhost:8888`,
				});
				const git = await createGit(fixture.path);

				await git('add', ['data.json']);

				const committing = aicg();

				committing.stdout!.on('data', (buffer: Buffer) => {
					const stdout = buffer.toString();
					if (stdout.match('└')) {
						committing.stdin!.write('y');
						committing.stdin!.end();
					}
				});

				await committing;

				const statusAfter = await git('status', [
					'--porcelain',
					'--untracked-files=no',
				]);
				expect(statusAfter.stdout).toBe('');

				const { stdout: commitMessage } = await git('log', [
					'--pretty=format:%s',
				]);
				console.log({
					commitMessage,
					length: commitMessage?.length,
				});
				expect(commitMessage?.length).toBeLessThanOrEqual(50);

				await fixture.rm();
			});

			test('Connects with env variable', async () => {
				const { fixture, aicg } = await createFixture(files);
				const git = await createGit(fixture.path);

				await git('add', ['data.json']);

				const committing = aicg([], {
					env: {
						HTTP_PROXY: 'http://localhost:8888',
					},
				});

				committing.stdout!.on('data', (buffer: Buffer) => {
					const stdout = buffer.toString();
					if (stdout.match('└')) {
						committing.stdin!.write('y');
						committing.stdin!.end();
					}
				});

				await committing;

				const statusAfter = await git('status', [
					'--porcelain',
					'--untracked-files=no',
				]);
				expect(statusAfter.stdout).toBe('');

				const { stdout: commitMessage } = await git('log', [
					'--pretty=format:%s',
				]);
				console.log({
					commitMessage,
					length: commitMessage?.length,
				});
				expect(commitMessage?.length).toBeLessThanOrEqual(50);

				await fixture.rm();
			});
			// Organizes diffs into smaller chunks when total tokens are within the supported limit
			test('should organize diffs into smaller chunks when total tokens are within the supported limit', () => {
				const diffs = [
					{ diff: 'diff1', token: 50, path: 'file1' },
					{ diff: 'diff2', token: 30, path: 'file2' },
					{ diff: 'diff3', token: 20, path: 'file3' },
				];
				const totalSupportedTokenByModel = 100;
				const result = getOrganizedDiff(diffs, totalSupportedTokenByModel);
				expect(result[0]).toEqual([
					{ diff: 'diff1diff2diff3', token: 100, path: '' },
				]);
				expect(result[1]).toEqual([]);
			});
		});
	});
});
