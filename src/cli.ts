import { cli } from 'cleye';
import { description, version } from '../package.json';
import aicg from './commands/aicg.js';
import prepareCommitMessageHook from './commands/prepare-commit-msg-hook.js';
import configCommand from './commands/config.js';
import hookCommand, { isCalledFromGitHook } from './commands/hook.js';
import modelsCommand from './commands/models.js';

const rawArgv = process.argv.slice(2);

cli(
	{
		name: 'aicg',

		version,

		/**
		 * Since this is a wrapper around `git commit`,
		 * flags should not overlap with it
		 * https://git-scm.com/docs/git-commit
		 */
		flags: {
			generate: {
				type: Number,
				description:
					'Number of messages to generate (Warning: generating multiple costs more) (default: 1)',
				alias: 'g',
			},
			exclude: {
				type: [String],
				description: 'Files to exclude from AI analysis',
				alias: 'x',
			},
			all: {
				type: Boolean,
				description:
					'Automatically stage changes in tracked files for the commit',
				alias: 'a',
				default: false,
			},
			type: {
				type: String,
				description: 'Type of commit message to generate',
				alias: 't',
			},
			model: {
				type: String,
				description: 'Specify Model',
				alias: 'k',
			},
		},

		commands: [configCommand, hookCommand, modelsCommand],

		help: {
			description,
		},

		ignoreArgv: (type) => type === 'unknown-flag' || type === 'argument',
	},
	(argv) => {
		if (isCalledFromGitHook) {
			prepareCommitMessageHook(argv.flags.model);
		} else {
			aicg(
				argv.flags.generate,
				argv.flags.exclude,
				argv.flags.all,
				argv.flags.type,
				argv.flags.model,
				rawArgv
			);
		}
	},
	rawArgv
);
