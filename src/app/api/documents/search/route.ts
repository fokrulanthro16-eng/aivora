import { z } from 'zod';
import { retrieve } from '@/lib/ai/retrieval/hybrid-retriever';
import { buildCitation, deduplicateCitations } from '@/lib/ai/citations/source-schema';
import { AIVORA_CONFIG } from '@/config/aivora';

export const runtime = 'nodejs';

const SearchSchema = z.object({
  query: z.string().min(1).max(AIVORA_CONFIG.ai.maxQueryLength),
  matchCount: z.number().int().min(1).max(20).optional(),
  similarityThreshold: z.number().min(0).max(1).optional(),
  tags: z.array(z.string()).optional(),
  documentIds: z.array(z.string().uuid()).optional(),
});

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = SearchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'Validation failed.', details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const { query, matchCount, similarityThreshold, tags, documentIds } = parsed.data;

  try {
    const { chunks } = await retrieve(query, {
      matchCount,
      similarityThreshold,
      filterTags: tags,
      filterDocumentIds: documentIds,
    });

    const citations = deduplicateCitations(chunks.map(buildCitation));

    return Response.json({ query, results: citations, count: citations.length }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search failed';
    console.error('[/api/documents/search]', message);
    return Response.json({ error: message }, { status: 500 });
  }
}
