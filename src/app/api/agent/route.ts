import { z } from 'zod';
import { runAivoraAgent } from '@/lib/ai/agents/aivora-agent';
import { AIVORA_CONFIG } from '@/config/aivora';

export const runtime = 'nodejs';

// Allow time for the embedding model to load on first request.
export const maxDuration = 120;

const AgentRequestSchema = z.object({
  query: z
    .string()
    .min(1, 'Query must not be empty.')
    .max(AIVORA_CONFIG.ai.maxQueryLength, `Query must not exceed ${AIVORA_CONFIG.ai.maxQueryLength} characters.`),
  conversationId: z.string().optional(),
  userId: z.string().optional(),
  filters: z
    .object({
      tags: z.array(z.string()).optional(),
      documentIds: z.array(z.string().uuid()).optional(),
    })
    .optional(),
});

// Error-safe fallback — always a valid AivoraAgentResponse so the client can render it.
function errorSafeResponse(message: string) {
  return {
    answer:
      'Aivora encountered an unexpected server error. Check the server logs and ensure all dependencies are installed (`npm install`).',
    reasoningTrace: {
      plan: ['Unexpected server error — check server logs.'],
      retrievalSummary: 'N/A',
      reflection: message,
      corrections: [],
    },
    citations: [],
    confidence: 0,
    needsMoreContext: true,
    demoMode: true,
  };
}

export async function POST(request: Request): Promise<Response> {
  // Outer guard: ensures a JSON response is ALWAYS returned — even if imports,
  // module-level code, or unhandled rejections escape the inner try/catch.
  try {
    return await handlePost(request);
  } catch (fatal) {
    const msg = fatal instanceof Error ? fatal.message : 'Internal server error';
    console.error('[/api/agent] Fatal unhandled error:', msg);
    return Response.json(errorSafeResponse(msg), { status: 200 });
  }
}

async function handlePost(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: 'Invalid JSON body.' },
      { status: 400 },
    );
  }

  const parsed = AgentRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'Validation failed.', details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  try {
    const result = await runAivoraAgent(parsed.data);
    return Response.json(result, { status: 200 });
  } catch (err) {
    // runAivoraAgent catches internal errors and returns built-in responses;
    // this path only fires for truly unexpected failures (e.g. import errors).
    const message = err instanceof Error ? err.message : 'Internal error';
    console.error('[/api/agent] Unexpected error:', message);
    return Response.json(errorSafeResponse(message), { status: 200 });
  }
}
