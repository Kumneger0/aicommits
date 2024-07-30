import Groq from 'groq-sdk';

export async function getGroqChatCompletion(
	GROQ_API_KEY: string,
	messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
	model: string
) {
	const groq = new Groq({ apiKey: GROQ_API_KEY });

	return groq.chat.completions.create({
		messages,
		model,
	});
}
