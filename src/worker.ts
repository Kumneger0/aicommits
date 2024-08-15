import { encoding_for_model } from '@dqbd/tiktoken';

import { parentPort } from 'worker_threads';

parentPort?.on('message', async (message) => {
	const { currentToken } = calculateToken(message);
	parentPort?.postMessage({
		result: currentToken,
	});
});

export const calculateToken = (diff: string) => {
	// TODO: try to find other appraoach to calculate the token this approach may not be a good option
	const encoder = encoding_for_model('gpt-4');

	const encoded = encoder.encode(diff);
	const currentToken = encoded.length;
	return {
		currentToken, //
	};
};
