import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function getGroqChatCompletion(
	messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
	model: string
) {
	return groq.chat.completions.create({
		messages,
		model,
	});
}
