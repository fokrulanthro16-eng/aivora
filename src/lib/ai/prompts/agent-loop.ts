import type { HybridSearchResult } from '@/lib/types/document';

export function buildPlanningPrompt(query: string): string {
  return `User query: "${query}"

Produce the planning JSON object now.`;
}

export function buildReflectionPrompt(
  query: string,
  chunks: HybridSearchResult[]
): string {
  const chunkSummary = chunks
    .slice(0, 5)
    .map((c, i) => `[${i + 1}] (score ${c.hybrid_score.toFixed(2)}) ${c.content.slice(0, 150)}`)
    .join('\n');

  return `User query: "${query}"

Retrieved chunks (top ${Math.min(chunks.length, 5)}):
${chunkSummary}

Assess the retrieval quality and produce the reflection JSON object now.`;
}

export function buildAnswerPrompt(
  query: string,
  chunks: HybridSearchResult[]
): string {
  const context = chunks
    .map((c) => `--- [source:${c.chunk_id}] from "${c.title}" ---\n${c.content}`)
    .join('\n\n');

  return `Retrieved context:
${context}

User question: ${query}

Write your grounded answer now, citing sources with [source:CHUNK_ID].`;
}

export function buildQueryRewritePrompt(originalQuery: string, reflection: string): string {
  return `The original query did not retrieve sufficient context.
Original query: "${originalQuery}"
Reflection: ${reflection}

Rewrite the query to be broader and more likely to retrieve relevant chunks.
Respond with only the rewritten query string, no quotes or explanation.`;
}
