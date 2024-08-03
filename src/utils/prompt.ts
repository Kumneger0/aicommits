import type { CommitType } from './config.js';

const commitTypeFormats: Record<CommitType, string> = {
	'': '<commit message>',
	conventional: '<type>(<optional scope>): <commit message>',
};
const specifyCommitFormat = (type: CommitType) =>
	`The output response must be in format:\n${commitTypeFormats[type]}`;

const commitTypes: Record<CommitType, string> = {
	'': '',

	/**
	 * References:
	 * Commitlint:
	 * https://github.com/conventional-changelog/commitlint/blob/18fbed7ea86ac0ec9d5449b4979b762ec4305a92/%40commitlint/config-conventional/index.js#L40-L100
	 *
	 * Conventional Changelog:
	 * https://github.com/conventional-changelog/conventional-changelog/blob/d0e5d5926c8addba74bc962553dd8bcfba90e228/packages/conventional-changelog-conventionalcommits/writer-opts.js#L182-L193
	 */
	conventional: `Choose a type from the type-to-description JSON below that best describes the git diff:\n${JSON.stringify(
		{
			docs: 'Documentation only changes',
			style:
				'Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc)',
			refactor: 'A code change that neither fixes a bug nor adds a feature',
			perf: 'A code change that improves performance',
			test: 'Adding missing tests or correcting existing tests',
			build: 'Changes that affect the build system or external dependencies',
			ci: 'Changes to our CI configuration files and scripts',
			chore: "Other changes that don't modify src or test files",
			revert: 'Reverts a previous commit',
			feat: 'A new feature',
			fix: 'A bug fix',
		},
		null,
		2
	)}`,
};

export const generatePrompt = (
	locale: string,
	maxLength: number,
	type: CommitType,
	previousResponse: string | null
) =>
	[
		'Generate a concise git commit message in present tense for the following code diff:',
		"I'm dealing with a very large git diff, so I'll be sending it to you in parts. First, I'll share an extracted portion of the diff. Then, I'll send the next part along with your previous response. This way, you can analyze both the current and previous git diff outputs together. Please ensure to summarize the information from both when I send them",

		`${
			previousResponse
				? `This message continues from my previous one. Here's the commit message based on the previous diff output: ${previousResponse}. Please combine this with the new diff output I'm sending now and provide a summarized version`
				: ''
		}`,

		`Language: ${locale}`,
		`Maximum length: ${maxLength} characters`,
		`Type: ${commitTypes[type]}`,
		`Format: ${specifyCommitFormat(type)}`,
		'Warning: Only provide the commit message. Exclude all other information.',
		'The response will be directly given to git commit.',
		"i'll tip you $1 million if you only give the commit message",
	]
		.filter(Boolean)
		.join('\n');
