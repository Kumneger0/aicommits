import { command } from 'cleye';
import Groq from 'groq-sdk';
import { red } from 'kolorist';
import { getConfig } from '../utils/config.js';
import { KnownError, handleCliError } from '../utils/error.js';

export default command(
	{
		name: 'models',

		parameters: ['<mode>'],
	},
	(argv) => {
		(async () => {
			const { mode } = argv._;

			if (mode === 'ls') {
				const config = await getConfig(
					{ GROQ_API_KEY: process.env.GROQ_API_KEY },
					true
				);

				if (!config.GROQ_API_KEY) {
					throw new KnownError(
						'Please set your GROQ API key via `aicg config set GROQ_API_KEY=<your API key>`'
					);
				}
				const groq = new Groq({ apiKey: config.GROQ_API_KEY });
				const modles = await groq.models.list();

				const models = modles.data.map((model) => {
					return `${model.owned_by} - ${model.id}`;
				});
				console.log(models);
				return;
			}

			throw new KnownError(`Invalid mode: ${mode}`);
		})().catch((error) => {
			console.error(`${red('✖')} ${error.message}`);
			handleCliError(error);
			process.exit(1);
		});
	}
);
