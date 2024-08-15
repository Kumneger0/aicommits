import { encoding_for_model } from '@dqbd/tiktoken';
import { execa } from 'execa';

import {
	confirm,
	intro,
	isCancel,
	outro,
	select,
	spinner,
} from '@clack/prompts';
import { bgCyan, black, dim, green, red } from 'kolorist';
import { getConfig } from '../utils/config.js';
import { KnownError, handleCliError } from '../utils/error.js';
import { generateCommitMessage } from '../utils/generateCommit.js';
import {
	assertGitRepo,
	getDetectedMessage,
	getStagedDiff,
	getStagedDiffForEachFileSeparatly,
} from '../utils/git.js';
import { models } from '../utils/models.js';

export function getCurrentModelTotalSupportedToken(
	modelID: (typeof models)[number]['id']
) {
	return models.find(({ id }) => modelID == id)?.context_window ?? 5000;
}

export const calculateToken = (diff: string) => {
	// TODO: try to find other appraoach to calculate the token this approach may not be a good option
	const encoder = encoding_for_model('gpt-4');

	const encoded = encoder.encode(diff);
	const currentToken = encoded.length;
	return {
		currentToken, //
	};
};
export function getOrganizedDiff(
	diffs: {
		diff: string;
		token: number;
	}[],
	totalSupportedTokenByModel: number
) {
	console.log(diffs);

	let tempDiff = [{ diff: '', token: 0 }];
	let currentIndex = 0;

	for (let i = 0; i < diffs.length; i++) {
		const currentDiff = diffs[i];
		const currentTokenCount = tempDiff[currentIndex].token + currentDiff.token;

		if (currentTokenCount <= totalSupportedTokenByModel) {
			tempDiff[currentIndex].diff += currentDiff.diff;
			tempDiff[currentIndex].token += currentDiff.token;
		} else {
			tempDiff.push({ diff: currentDiff.diff, token: currentDiff.token });
			currentIndex++;
		}
	}

	return tempDiff.map(({ diff }) => diff);
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
			// This should be equivalent behavior to `git commit --all`
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
		const totalSupportedTokenByModel = getCurrentModelTotalSupportedToken(
			model as (typeof models)[number]['id']
		);


		const { currentToken } = calculateToken(staged?.diff);

		const isCurrentLargerThanSupportedToken =
			currentToken > totalSupportedTokenByModel;

		const eachDiffAlongWithToken = (
			await getStagedDiffForEachFileSeparatly(excludeFiles)
		)?.map((diff) => {
			if (isCurrentLargerThanSupportedToken)
				return {
					diff: diff.diff,
					token: calculateToken(diff.diff).currentToken,
				};
			return diff;
		});

		const diff = isCurrentLargerThanSupportedToken
			? getOrganizedDiff(
					eachDiffAlongWithToken as { diff: string; token: number }[],
					totalSupportedTokenByModel
			  )
			: staged.diff;



		console.log(diff);

		return [];

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

		const s = spinner();
		s.start('The AI is analyzing your changes');
		let messages: string[];
		try {
			messages = await generateCommitMessage(
				config?.GROQ_API_KEY,
				model ?? config.AICG_MODEL,
				config.locale,
				diff,
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
