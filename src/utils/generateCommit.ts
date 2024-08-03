import type { CommitType } from './config.js';
import { KnownError } from './error.js';
import { generatePrompt } from './prompt.js';

import { getGroqChatCompletion } from './groq.js';

const deduplicateMessages = (array: string[]) => Array.from(new Set(array));

export const generateCommitMessage = async (
	GROQ_API_KEY: string,
	model: string,
	locale: string,
	diff: string | string[],
	maxLength: number,
	type: CommitType
) => {
	let previosCommists: string | string[] = '';
	try {
		if (diff && Array.isArray(diff)) {
			for (let i in diff) {
				const result = await getGroqChatCompletion(
					GROQ_API_KEY,
					[
						{
							content: generatePrompt(
								locale,
								maxLength,
								type,
								previosCommists as string
							),
							role: 'system',
						},
						{
							role: 'user',
							content: diff[i],
						},
					],
					model
				);
				previosCommists =
					Number(i) !== diff.length - 1
						? (previosCommists += result.choices
								?.map(({ message }) => message.content as string)
								.join(''))
						: result.choices?.map(({ message }) => message.content as string);
			}

			return Array.isArray(previosCommists)
				? previosCommists
				: [previosCommists];
		}

		const result = await getGroqChatCompletion(
			GROQ_API_KEY,
			[
				{
					content: generatePrompt(locale, maxLength, type, previosCommists),
					role: 'system',
				},
				{
					role: 'user',
					content: diff,
				},
			],
			model
		);

		if (!result.choices.length) {
			console.error('failed to generate commit messages please try agin');
			process.exit(1);
		}

		const messages = result.choices?.map(
			({ message }) => message.content as string
		);

		return deduplicateMessages(messages);
	} catch (error) {
		const errorAsAny = error as any;
		if (errorAsAny.code === 'ENOTFOUND') {
			throw new KnownError(
				`Error connecting to ${errorAsAny.hostname} (${errorAsAny.syscall}). Are you connected to the internet?`
			);
		}

		throw errorAsAny;
	}
};
