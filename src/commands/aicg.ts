import { execa } from 'execa';
import { get_encoding, encoding_for_model } from '@dqbd/tiktoken';

import { black, dim, green, red, bgCyan } from 'kolorist';
import {
	intro,
	outro,
	spinner,
	select,
	confirm,
	isCancel,
	log,
} from '@clack/prompts';
import {
	assertGitRepo,
	getStagedDiff,
	getDetectedMessage,
	getStagedDiffForEachFileSeparatly,
} from '../utils/git.js';
import { getConfig } from '../utils/config.js';
import { generateCommitMessage } from '../utils/generateCommit.js';
import { KnownError, handleCliError } from '../utils/error.js';
import { models } from '../utils/models.js';

export function getCurrentModelTotalSupportedToken(
	modelID: (typeof models)[number]['id']
) {
	return models.find(({ id }) => modelID == id)?.context_window ?? 5000;
}

export const calculateToken = (diff: string) => {
	//TODO: use tiktoken to tokenize and calcuate the number of tokens may be not good option but untill i found good solutions lets use this
	const encoder = encoding_for_model('gpt-3.5-turbo');

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
	let tempDiff = '';
	const diffsWillBeUsedForPrompt = [];
	for (let i in diffs) {
		const shuldAppednd =
			diffs[i].token + (diffs[Number(i) + 1]?.token ?? 0) <
			totalSupportedTokenByModel;
		if (shuldAppednd) {
			tempDiff += diffs[i].diff;
		}
		if (!shuldAppednd) {
			diffsWillBeUsedForPrompt.push(tempDiff);
			tempDiff = '';
		}
	}
	return diffsWillBeUsedForPrompt;
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

		const eachDiffAlongWithToken = (
			await getStagedDiffForEachFileSeparatly(excludeFiles)
		)?.map(({ diff }) => {
			return {
				diff,
				token: calculateToken(diff).currentToken,
			};
		});

		const diff =
			currentToken > totalSupportedTokenByModel
				? getOrganizedDiff(eachDiffAlongWithToken, totalSupportedTokenByModel)
				: staged.diff;

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
