import fs from 'fs/promises';
import { intro, outro, spinner } from '@clack/prompts';
import { black, green, red, bgCyan } from 'kolorist';
import {
	getStagedDiff,
	getStagedDiffForEachFileSeparately,
} from '../utils/git.js';
import { getConfig } from '../utils/config.js';
import { generateCommitMessage } from '../utils/generateCommit.js';
import { KnownError, handleCliError } from '../utils/error.js';
import {
	calculateToken,
	getCurrentModelTotalSupportedToken,
	getOrganizedDiff,
	getUserConfrimationIfCodeBaseIsLarge,
	splitGitDiff,
} from './aicg.js';
import { models } from '../utils/models.js';

const [messageFilePath, commitSource] = process.argv.slice(2);

export default (model?: string) =>
	(async () => {
		if (!messageFilePath) {
			throw new KnownError(
				'Commit message file path is missing. This file should be called from the "prepare-commit-msg" git hook'
			);
		}

		// If a commit message is passed in, ignore
		if (commitSource) {
			return;
		}

		// All staged files can be ignored by our filter
		const staged = await getStagedDiff();

		const stagedArr = await getStagedDiffForEachFileSeparately();

		if (!staged) {
			return;
		}
		const totalSupportedTokenByModel = getCurrentModelTotalSupportedToken(
			model as (typeof models)[number]['id']
		);

		const { currentToken } = calculateToken(staged?.diff);

		const eachDiffAlongWithToken = (
			await getStagedDiffForEachFileSeparately()
		)?.map(({ diff, filePath }) => {
			return {
				diff,
				token: calculateToken(diff).currentToken,
				path: filePath,
			};
		});

		const [diff] =
			currentToken > totalSupportedTokenByModel
				? getOrganizedDiff(eachDiffAlongWithToken, totalSupportedTokenByModel)
				: [staged.diff];

		intro(bgCyan(black(' aicg ')));

		const { env } = process;
		const config = await getConfig({
			AICG_MODEL: env.AICG_MODEL,
			proxy:
				env.https_proxy || env.HTTPS_PROXY || env.http_proxy || env.HTTP_PROXY,
		});

		const [organizedDiff, largeDiffs] = await splitGitDiff({
			diff: staged.diff,
			model: (model ?? config.AICG_MODEL) as (typeof models)[number]['id'],
		});

		if (Array.isArray(organizedDiff)) {
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

		/**
		 * When `--no-edit` is passed in, the base commit message is empty,
		 * and even when you use pass in comments via #, they are ignored.
		 *
		 * Note: `--no-edit` cannot be detected in argvs so this is the only way to check
		 */
		const baseMessage = await fs.readFile(messageFilePath, 'utf8');
		const supportsComments = baseMessage !== '';
		const hasMultipleMessages = messages.length > 1;

		let instructions = '';

		if (supportsComments) {
			instructions = `# 🤖 AI generated commit${
				hasMultipleMessages ? 's' : ''
			}\n`;
		}

		if (hasMultipleMessages) {
			if (supportsComments) {
				instructions +=
					'# Select one of the following messages by uncommeting:\n';
			}
			instructions += `\n${messages
				.map((message) => `# ${message}`)
				.join('\n')}`;
		} else {
			if (supportsComments) {
				instructions += '# Edit the message below and commit:\n';
			}
			instructions += `\n${messages[0]}\n`;
		}

		await fs.appendFile(messageFilePath, instructions);
		outro(`${green('✔')} Saved commit message!`);
	})().catch((error) => {
		outro(`${red('✖')} ${error.message}`);
		handleCliError(error);
		process.exit(1);
	});
