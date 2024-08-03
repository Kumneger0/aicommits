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
	let previousCommits: string = '';
	const generateAndProcessResult = async (diffItem: string) => {
		const result = await getGroqChatCompletion(
			GROQ_API_KEY,
			[
				{
					content: generatePrompt(locale, maxLength, type, previousCommits),
					role: 'system',
				},
				{
					role: 'user',
					content: diffItem,
				},
			],
			model
		);

		if (!result.choices.length) {
			console.error('Failed to generate commit messages. Please try again.');
			process.exit(1);
		}

		return result.choices
			.map(({ message }) => message.content as string)
			.join('');
	};

	try {
		if (Array.isArray(diff)) {
			for (const i in diff) {
				const resultContent = await generateAndProcessResult(diff[i]);
				if (Number(i) !== diff.length - 1) {
					previousCommits += resultContent;
				} else {
					previousCommits = resultContent;
				}
			}

			return [previousCommits];
		} else {
			const resultContent = await generateAndProcessResult(diff);
			return deduplicateMessages([resultContent]);
		}
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
