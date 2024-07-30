import { command } from 'cleye';
import Groq from 'groq-sdk';
import { red } from 'kolorist';
import { getConfig, setConfigs } from '../utils/config.js';
import { KnownError, handleCliError } from '../utils/error.js';
import { select, log } from '@clack/prompts';

const getMaxWidth = (
	data: Groq.Models.Model[],
	key: keyof Groq.Models.Model
) => {
	return Math.max(
		...data.map((item) => String(item[key]).length),
		key.length + 50
	);
};

export default command(
	{
		name: 'models',
		parameters: ['<mode>'],
	},
	(argv) => {
		(async () => {
			const { mode } = argv._;

			if (mode === 'select') {
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
				const models = await groq.models.list();

				if (!models.data.length) {
					throw new KnownError('No models found.');
				}
				const message = 'Select Your Prefferd Model';
				const selectedModelID = await select({
					message,
					options: models.data.map((model) => {
						return {
							label: `${model.id} by ${model.owned_by}`,
							value: model.id,
						};
					}),
				});
				if (!selectedModelID) return;
				await setConfigs([['AICG_MODEL', String(selectedModelID)]]);
			} else {
				throw new KnownError(`Invalid mode: ${mode}`);
			}
		})().catch((error) => {
			console.error(`${red('✖')} ${error.message}`);
			handleCliError(error);
			process.exit(1);
		});
	}
);
