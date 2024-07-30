import { type TiktokenModel } from '@dqbd/tiktoken';
import type { CommitType } from './config.js';
import { KnownError } from './error.js';
import { generatePrompt } from './prompt.js';

import { getGroqChatCompletion } from './groq.js';

const deduplicateMessages = (array: string[]) => Array.from(new Set(array));

export const generateCommitMessage = async (
	GROQ_API_KEY: string,
	model: string,
	locale: string,
	diff: string,
	maxLength: number,
	type: CommitType
) => {
	try {
		const completios2 = await getGroqChatCompletion(
			GROQ_API_KEY,
			[
				{
					content: generatePrompt(locale, maxLength, type, diff),
					role: 'assistant',
				},
			],
			model
		);

		if (!completios2.choices.length) {
			console.error('failed to generate commit messages please try agin');
			process.exit(1);
		}

		const messages = completios2.choices?.map(
			({ message }) => message.content as string
		);

		console.log(messages);

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
