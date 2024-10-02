import { encoding_for_model } from '@dqbd/tiktoken';
import { execa } from 'execa';

import {
	confirm,
	intro,
	isCancel,
	log,
	outro,
	select,
	spinner,
} from '@clack/prompts';
import { bgCyan, black, dim, green, red } from 'kolorist';
import os from 'node:os';
import { getConfig } from '../utils/config.js';
import { KnownError, handleCliError } from '../utils/error.js';
import { generateCommitMessage } from '../utils/generateCommit.js';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'worker_threads';
import {
	assertGitRepo,
	getDetectedMessage,
	getStagedDiff,
	getStagedDiffForEachFileSeparately,
} from '../utils/git.js';
import { models } from '../utils/models.js';

export function getCurrentModelTotalSupportedToken(
	modelID: (typeof models)[number]['id']
) {
	const model = models.find(({ id }) => modelID == id);
	return (model?.context_window ?? 5000) - 1000;
}

export const calculateToken = (diff: string) => {
	// TODO: try to find other appraoach to calculate the token this approach may not be a good option
	const encoder = encoding_for_model('gpt-4');

	const encoded = encoder.encode(diff);
	const currentToken = encoded.length;
	return {
		currentToken :10000000, //
	};
};

type GitDiffType = {
	diff: string;
	token: number;
	path: string;
}[];

export function getOrganizedDiff(
	diffs: GitDiffType,
	totalSupportedTokenByModel: number
): (typeof diffs)[] {
	const veryLargeDiffs: typeof diffs = [];
	const reducedDiff = diffs.reduce<
		{ diff: string; token: number; path: string }[]
	>(
		(acc, { diff, path, token }) => {
			const lastDiff = acc.at(-1)!;
			const isLargeFile = token > totalSupportedTokenByModel;

			if (isLargeFile) {
				veryLargeDiffs.push({ diff, path, token });
				return acc;
			}
			const currentToken = lastDiff.token + token;
			if (currentToken < totalSupportedTokenByModel) {
				const lastIndex = acc.length - 1;
				acc[lastIndex].diff += diff;
				acc[lastIndex].token += Number(token);
			} else {
				acc.push({ diff, token, path: path });
			}

			return acc;
		},
		[{ diff: '', token: 0, path: '' }]
	);

	return [reducedDiff, veryLargeDiffs];
}



async function showMessageWhenCalledFromHook(message: string) {
	console.log(message);
	return true;
}


export async function getUserConfrimationIfCodeBaseIsLarge(
	[diff, largeDiffs]: ReturnType<typeof getOrganizedDiff>,
	isCalledFromHook = false
) {
	if (Array.isArray(diff) && diff.length > 1) {
		console.log(
			"Hey Developer 👋, you've made a large change to your codebase"
		);
		if (largeDiffs.length) {
			console.log(
				'Some of the files in your codebase have changes that are larger than the AI model can process in a single request'
			);

			largeDiffs.forEach(({ path }) => log.message(`- ${path}`));

			const isUserAgreedToFilterOutFilesLargerThanSupputedTokenLimit =
				isCalledFromHook
					? showMessageWhenCalledFromHook(
							'The AI model has limitations on the amount of code it can process at once. Would you like to proceed with generating commit messages for the remaining changes, excluding the larger files mentioned above? you can cancel with ctrl + c'
					  )
					: await confirm({
							message: `The AI model has limitations on the amount of code it can process at once. Would you like to proceed with generating commit messages for the remaining changes, excluding the larger files mentioned above?

You can choose to cancel and consider breaking down the larger files into smaller chunks before trying again.`,
					  });

			if (!isUserAgreedToFilterOutFilesLargerThanSupputedTokenLimit) {
				console.log('Commit message generation cancelled.');
				process.exit(0);
			}
		}
		const isUserAgreedToMakeThoseApiRequests = isCalledFromHook
			? await showMessageWhenCalledFromHook(
					'It looks like your codebase has a significant number of changes (${diff.length} chunks). Processing these changes will require making multiple API requests to the AI model, which may impact your daily API usage limit. you can cancel with ctrl + c'
			  )
			: await confirm({
					message: `It looks like your codebase has a significant number of changes (${diff.length} chunks). Processing these changes will require making multiple API requests to the AI model, which may impact your daily API usage limit.
            Would you like to proceed with generating commit messages for all these changes?`,
			  });

		if (!isUserAgreedToMakeThoseApiRequests) {
			console.log('Aborted');
			process.exit(0);
		}
	}
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function splitGitDiff({
	diff,
	excludeFiles,
	model,
}: {
	model: string;
	diff: string;
	excludeFiles?: string[];
}) {
	const workers: Worker[] = [];

	const getCurrentCpuUsage = () => os.cpus().length - workers.length;

	const totalSupportedTokenByModel = getCurrentModelTotalSupportedToken(
		model as (typeof models)[number]['id']
	);

	const { currentToken } = calculateToken(diff);

	const isCurrentTokenLargerThanSupportedToken =
		currentToken > totalSupportedTokenByModel;

	if (!isCurrentTokenLargerThanSupportedToken) return [diff];

	const s = spinner();
	s.start('Breaking down your changes into smaller chunks.');

	const eachFIleGitDiff = await getStagedDiffForEachFileSeparately(
		excludeFiles
	);

	const eachDiffAlongWithToken = await Promise.all(
		eachFIleGitDiff.map(async ({ diff, filePath }, i) => {
			const waitUntil = (res: (arg: boolean) => void) => {
				interval = setInterval(() => {
					if (getCurrentCpuUsage() > 0) {
						res(true);
					}
				}, 200);
			};

			let interval: NodeJS.Timeout;

			getCurrentCpuUsage() &&
				(await new Promise<boolean>((res) => waitUntil(res)));

			const worker = new Worker(path.join(__dirname, './worker.mjs'));

			workers.push(worker);

			return {
				diff: diff,
				token: await new Promise<number>((res) => {
					worker.postMessage(diff);
					worker?.on('message', ({ result }: { result: number }) => {
						res(result);
						worker.terminate();
						clearInterval(interval);
						workers.pop();
					});
				}),
				path: filePath,
			};
		})
	);

	workers.forEach((worker) => worker?.terminate());
	s.stop();
	return getOrganizedDiff(
		eachDiffAlongWithToken as {
			diff: string;
			token: number;
			path: string;
		}[],
		totalSupportedTokenByModel
	);
}

export default async (
	generate: number | undefined,
	excludeFiles: string[],
	stageAll: boolean,
	commitType: string | undefined,
	model: string | undefined,
	rawArgv: string[]
) =>
	(async () => {
		intro(bgCyan(black(' aicg ')));
		await assertGitRepo();

		const detectingFiles = spinner();

		if (stageAll) {
			await execa('git', ['add', '--update']);
		}

		detectingFiles.start('Detecting staged files');
		const staged = await getStagedDiff(excludeFiles);

		if (!staged) {
			detectingFiles.stop('Detecting staged files');
			throw new KnownError(
				'No staged changes found. Stage your changes manually, or automatically stage all changes with the `--all` flag.'
			);
		}

		detectingFiles.stop(
			`${getDetectedMessage(staged.files)}:\n${staged.files
				.map((file) => `     ${file}`)
				.join('\n')}`
		);

		const { env } = process;
		const config = await getConfig({
			GROQ_API_KEY: env.GROQ_API_KEY,
			AICG_MODEL: env.AICG_MODEL,
			proxy:
				env.https_proxy || env.HTTPS_PROXY || env.http_proxy || env.HTTP_PROXY,
			generate: generate?.toString(),
			type: commitType?.toString(),
		});

		const [organizedDiff, largeDiffs] = await splitGitDiff({
			diff: staged.diff,
			excludeFiles,
			model: (model ?? config.AICG_MODEL) as (typeof models)[number]['id'],
		});

		if (!config.skip_user_confirimation && Array.isArray(organizedDiff)) {
			await getUserConfrimationIfCodeBaseIsLarge([
				organizedDiff,
				Array.isArray(largeDiffs) ? largeDiffs : [],
			]);
		}

		const s = spinner();
		s.start('The AI is analyzing your changes');
		let messages: string[];
		try {
			messages = await generateCommitMessage(
				config?.GROQ_API_KEY,
				model ?? config.AICG_MODEL,
				config.locale,
				organizedDiff,
				config['max-length'],
				config.type
			);
		} finally {
			s.stop('Changes analyzed');
		}

		if (messages.length === 0) {
			throw new KnownError('No commit messages were generated. Try again.');
		}

		let message: string;
		if (messages.length === 1) {
			[message] = messages;
			const confirmed = await confirm({
				message: `Use this commit message?\n\n   ${message}\n`,
			});

			if (!confirmed || isCancel(confirmed)) {
				outro('Commit cancelled');
				return;
			}
		} else {
			const selected = await select({
				message: `Pick a commit message to use: ${dim('(Ctrl+c to exit)')}`,
				options: messages.map((value) => ({ label: value, value })),
			});

			if (isCancel(selected)) {
				outro('Commit cancelled');
				return;
			}

			message = selected as string;
		}

		await execa('git', ['commit', '-m', message, ...rawArgv]);

		outro(`${green('✔')} Successfully committed!`);
	})().catch((error) => {
		outro(`${red('✖')} ${error.message}`);
		handleCliError(error);
		process.exit(1);
	});
