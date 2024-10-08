import { command } from "cleye";
import { green, red } from "kolorist";
import { getConfig } from "../utils/config.js";
import { handleCliError, KnownError } from "../utils/error.js";
import { getCommitMessages } from "../utils/getCommitMessagesForPrGen.js";
import { getGroqChatCompletion } from "../utils/groq.js";
import { getPrGenPrompt } from "../utils/prompt.js";
import fs from 'node:fs';
import { join } from 'node:path';
import { outro, spinner } from '@clack/prompts';

export default command(
	{
		name: 'prgen',
		help: {
			description:
				'Automatically generate a pull request description based on commit messages',
		},
		flags: {
			from: {
				type: String,
				description:
					'Specify the starting commit (default: last merged commit)',
				default: null,
			},
			to: {
				type: String,
				description: 'Specify the ending commit (default: latest commit)',
				default: null,
			},
			currentUserOnly: {
				type: Boolean,
				description: 'Filter commits for the current user only',
				default: false,
				alias: 'u',
			},
		},
		ignoreArgv: (type) => type === 'unknown-flag' || type === 'argument',
	},
	(argv) => {
		(async () => {
			const config = await getConfig(
				{
					GROQ_API_KEY: process.env.GROQ_API_KEY,
					AICG_MODEL: process.env.AICG_MODEL,
				},
				true
			);
			const GROQ_API_KEY = config.GROQ_API_KEY;
			const modelId = config.AICG_MODEL;

			if (!GROQ_API_KEY) {
				throw new KnownError(
					'Please set your GROQ API key via `aicg config set GROQ_API_KEY=<your API key>`'
				);
			}
			const { from, to, currentUserOnly } = argv.flags;
			if (!from) {
				outro(
					`${red(
						'✖'
					)} Error: Please specify a starting commit ID using the '--from' flag.`
				);
				return;
			}
			const s = spinner();
			s.start('Generating pull request title and description');

			const msgs = await getCommitMessages(from, to, currentUserOnly);
			const prompt = getPrGenPrompt(msgs);
			const { choices } = await getGroqChatCompletion(
				GROQ_API_KEY,
				[
					{
						role: 'user',
						content: prompt,
					},
				],
				modelId
			);

			const json = choices?.[0].message.content;
			const wdr = process.cwd();
			const aicgDir = join(wdr, '.aicg');

			if (!fs.existsSync(aicgDir)) {
				fs.mkdirSync(aicgDir);
			}

			fs.writeFileSync(
				join(aicgDir, 'pr.json'),
				json || '{"title":"error", "description":"failed to generate"}',
				{ encoding: 'utf8' }
			);

			s.stop();
			outro(`${green('✔')} Successfully generated PR description!`);
		})().catch((error) => {
			console.error(`${red('✖')} ${error.message}`);
			handleCliError(error);
			process.exit(1);
		});
	}
);

