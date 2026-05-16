import { AIVORA_CONFIG } from '@/config/aivora';

export type LLMCallOptions = {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
};

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

/**
 * Thin wrapper around an OpenAI-compatible chat completions endpoint.
 * Configured via AI_CHAT_BASE_URL, AI_CHAT_API_KEY, AI_CHAT_MODEL.
 */
export async function callLLM(options: LLMCallOptions): Promise<string> {
  const { system, user, maxTokens = 1024, temperature = 0.2 } = options;

  const baseUrl = process.env.AI_CHAT_BASE_URL;
  const apiKey = process.env.AI_CHAT_API_KEY;
  const model = process.env.AI_CHAT_MODEL ?? AIVORA_CONFIG.ai.chatModel;

  if (!baseUrl || !apiKey) {
    console.info('[callLLM] No server LLM configured — browser WebLLM will handle generation.');
    return '__DEMO_LLM_UNAVAILABLE__';
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];

  const endpoint = baseUrl.endsWith('/') ? `${baseUrl}chat/completions` : `${baseUrl}/chat/completions`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM API error ${response.status}: ${errorText}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  return data.choices?.[0]?.message?.content ?? '';
}
