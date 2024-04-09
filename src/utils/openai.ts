import { type TiktokenModel } from '@dqbd/tiktoken';
import type { ClientRequest, IncomingMessage } from 'http';
import https from 'https';
import type { CommitType } from './config.js';
import { KnownError } from './error.js';
import { generatePrompt } from './prompt.js';

interface Candidate {
	content: {
		parts: {
			text: string;
		}[];
		role: string;
	};
	finishReason: string;
	index: number;
	safetyRatings: {
		category: string;
		probability: string;
	}[];
}

interface GoogleAICompletion {
	candidates: Candidate[];
}

const httpsPost = async (hostname: string, path: string, json: unknown) =>
	new Promise<{
		request: ClientRequest;
		response: IncomingMessage;
		data: string;
	}>((resolve, reject) => {
		const postContent = JSON.stringify(json);
		const request = https.request(
			{
				port: 443,
				hostname,
				path,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Content-Length': Buffer.byteLength(postContent),
				},
			},
			(response) => {
				const body: Buffer[] = [];
				response.on('data', (chunk) => body.push(chunk));
				response.on('end', () => {
					resolve({
						request,
						response,
						data: Buffer.concat(body).toString(),
					});
				});
			}
		);
		request.on('error', reject);
		request.on('timeout', () => {
			request.destroy();
			reject(
				new KnownError(
					`Time out error: request took over ms. Try increasing the \`timeout\` config, or checking the OpenAI API status https://status.openai.com`
				)
			);
		});

		request.write(postContent);
		request.end();
	});

const createChatCompletion = async (json: Object) => {
	const { response, data } = await httpsPost(
		'generativelanguage.googleapis.com',
		'/v1beta/models/gemini-pro:generateContent?key=AIzaSyC8yDhnaSAL0t8vpaL38ZZXqzpAS5U3dVM',
		json
	);

	if (
		!response.statusCode ||
		response.statusCode < 200 ||
		response.statusCode > 299
	) {
		let errorMessage = `OpenAI API Error: ${response.statusCode} - ${response.statusMessage}`;

		if (data) {
			errorMessage += `\n\n${data}`;
		}

		if (response.statusCode === 500) {
			errorMessage += '\n\nCheck the API status: https://status.openai.com';
		}

		throw new KnownError(errorMessage);
	}

	return JSON.parse(data) as GoogleAICompletion;
};

const sanitizeMessage = (message: string) =>
	message
		.trim()
		.replace(/[\n\r]/g, '')
		.replace(/(\w)\.$/, '$1');

const deduplicateMessages = (array: string[]) => Array.from(new Set(array));

// const generateStringFromLength = (length: number) => {
// 	let result = '';
// 	const highestTokenChar = 'z';
// 	for (let i = 0; i < length; i += 1) {
// 		result += highestTokenChar;
// 	}
// 	return result;
// };

// const getTokens = (prompt: string, model: TiktokenModel) => {
// 	const encoder = encoding_for_model(model);
// 	const tokens = encoder.encode(prompt).length;
// 	// Free the encoder to avoid possible memory leaks.
// 	encoder.free();
// 	return tokens;
// };

export const generateCommitMessage = async (
	apiKey: string,
	model: TiktokenModel,
	locale: string,
	diff: string,
	completions: number,
	maxLength: number,
	type: CommitType,
	timeout: number,
	proxy?: string
) => {
	try {
		const completion = await createChatCompletion({
			model,
			contents: [
				{
					parts: [
						{
							text: generatePrompt(locale, maxLength, type),
						},
						{
							text: diff,
						},
					],
				},
			],
		});

		const messages = completion.candidates
			.map(({ content }) => content?.parts?.map(({ text }) => text))
			.flat();

		return deduplicateMessages(messages);
	} catch (error) {
		const errorAsAny = error as any;
		if (errorAsAny.code === 'ENOTFOUND') {
			throw new KnownError(
				`Error connecting to ${errorAsAny.hostname} (${errorAsAny.syscall}). Are you connected to the internet?`
			);
		}
		return ['message one', 'message two'];

		throw errorAsAny;
	}
};
