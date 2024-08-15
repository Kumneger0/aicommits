import type { CommitType } from './config.js';
import { KnownError } from './error.js';
import { generatePrompt, generatePromptForMultipleDiffs } from './prompt.js';

import { getGroqChatCompletion } from './groq.js';

const deduplicateMessages = (array: string[]) => Array.from(new Set(array));

export const generateCommitMessage = async (
	GROQ_API_KEY: string,
	model: string,
	locale: string,
	diff:
		| string
		| {
				diff: string;
				token: number;
				path: string;
		  }[],
	maxLength: number,
	type: CommitType
) => {
	let previousCommits: string = '';
	const generateAndProcessResult = async (
		diffItem: string,
		isSingle = false
	) => {
		const result = await getGroqChatCompletion(
			GROQ_API_KEY,
			[
				{
					content: isSingle
						? generatePrompt(locale, maxLength, type)
						: generatePromptForMultipleDiffs(
								locale,
								maxLength,
								type,
								previousCommits
						  ),
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

	if (Array.isArray(diff)) {
		for (const i in diff) {
			try {
				console.log(`  
					Generated ${i} out of ${diff.length}`);
				const resultContent = await generateAndProcessResult(diff[i].diff);
				previousCommits = resultContent;
			} catch (error) {
				const errorAsAny = error as any;
				if (errorAsAny.code === 'ENOTFOUND') {
					throw new KnownError(
						`Error connecting to ${errorAsAny.hostname} (${errorAsAny.syscall}). Are you connected to the internet?`
					);
				}
				throw errorAsAny;
			}
		}
		return [previousCommits];
	} else {
		const resultContent = await generateAndProcessResult(diff, true);
		return deduplicateMessages([resultContent]);
	}
};
