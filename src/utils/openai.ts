import { type TiktokenModel } from '@dqbd/tiktoken';
import type { ClientRequest, IncomingMessage } from 'http';
import https from 'https';
import type { CommitType } from './config.js';
import { KnownError } from './error.js';
import { generatePrompt } from './prompt.js';

import Groq from 'groq-sdk';
import { getGroqChatCompletion } from './groq.js';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
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
					`Time out error: request took over ms. Try increasing the \`timeout\` config, or checking the GEMNI API status https://status.openai.com`
				)
			);
		});

		request.write(postContent);
		request.end();
	});

const createChatCompletion = async (apikey: string, json: Object) => {
	const { response, data } = await httpsPost(
		'generativelanguage.googleapis.com',
		`/v1beta/models/gemini-pro:generateContent?key=${apikey}`,
		json
	);

	if (
		!response.statusCode ||
		response.statusCode < 200 ||
		response.statusCode > 299
	) {
		let errorMessage = `GEMNI API Error: ${response.statusCode} - ${response.statusMessage}`;

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
		// const completion = await createChatCompletion(apiKey, {
		// 	model,
		// 	contents: [
		// 		{
		// 			parts: [
		// 				{
		// 					text: generatePrompt(locale, maxLength, type),
		// 				},
		// 				{
		// 					text: diff,
		// 				},
		// 			],
		// 		},
		// 	],
		// });

		const completios2 = await getGroqChatCompletion(
			[
				{ content: generatePrompt(locale, maxLength, type), role: 'assistant' },
				{ role: 'assistant', content: diff },
			],
			'llama3-8b-8192'
		);

		if (!completios2.choices.length) {
			console.error('failed to generate commit messages please try agin');
			process.exit(1);
		}

		const messages = completios2.choices?.map(
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
