import { embedText } from '@/lib/ai/embeddings/local-embedder';
import { hybridSearch } from '@/lib/db/vector/vector-store';
import type { HybridSearchResult } from '@/lib/types/document';
import { AIVORA_CONFIG } from '@/config/aivora';

export type RetrieverOptions = {
  matchCount?: number;
  similarityThreshold?: number;
  filterTags?: string[];
  filterDocumentIds?: string[];
};

export type RetrievalResult = {
  chunks: HybridSearchResult[];
  queryEmbedding: number[];
};

/**
 * Run a hybrid vector+keyword search.
 * - Generates local embeddings (privacy-preserving, no external API).
 * - Calls Supabase RPC match_document_chunks_hybrid.
 * - Returns ranked chunks with combined hybrid scores.
 */
export async function retrieve(
  query: string,
  options: RetrieverOptions = {}
): Promise<RetrievalResult> {
  const {
    matchCount = AIVORA_CONFIG.retrieval.defaultMatchCount,
    similarityThreshold = AIVORA_CONFIG.retrieval.similarityThreshold,
    filterTags,
    filterDocumentIds,
  } = options;

  // When the query is scoped to specific documents, use a very permissive
  // threshold (0.05) so generic action prompts like "Summarize this document"
  // always return the best available chunks from the targeted document rather
  // than silently returning zero results due to low query-chunk cosine similarity.
  const effectiveThreshold = filterDocumentIds?.length
    ? 0.05
    : similarityThreshold;

  const queryEmbedding = await embedText(query);

  const chunks = await hybridSearch({
    queryEmbedding,
    queryText: query,
    matchCount,
    similarityThreshold: effectiveThreshold,
    filterTags,
    filterDocumentIds,
  });

  return { chunks, queryEmbedding };
}

/**
 * Retry retrieval with a rewritten query.
 * Used by the self-correction step when initial context is weak.
 */
export async function retrieveWithRetry(
  originalQuery: string,
  rewrittenQuery: string,
  options: RetrieverOptions = {}
): Promise<RetrievalResult> {
  // First attempt with the original query.
  const first = await retrieve(originalQuery, options);

  if (isContextSufficient(first.chunks)) return first;

  // If insufficient, retry with the rewritten query.
  const second = await retrieve(rewrittenQuery, {
    ...options,
    // Slightly lower threshold for the retry.
    similarityThreshold: (options.similarityThreshold ?? AIVORA_CONFIG.retrieval.similarityThreshold) - 0.05,
  });

  // Merge and re-rank, preferring higher hybrid_score.
  const merged = mergeAndDedup([...first.chunks, ...second.chunks]);
  return { chunks: merged, queryEmbedding: second.queryEmbedding };
}

export function isContextSufficient(chunks: HybridSearchResult[]): boolean {
  if (chunks.length === 0) return false;
  const topScore = chunks[0]?.hybrid_score ?? 0;
  return topScore >= AIVORA_CONFIG.retrieval.weakContextThreshold;
}

export function detectConflictingChunks(chunks: HybridSearchResult[]): boolean {
  if (chunks.length < 2) return false;
  const [top, second] = chunks;
  // Scores too close and both high → potential conflicting sources.
  return (
    Math.abs(top.hybrid_score - second.hybrid_score) < AIVORA_CONFIG.retrieval.conflictScoreGap &&
    top.document_id !== second.document_id &&
    top.hybrid_score > 0.6
  );
}

function mergeAndDedup(chunks: HybridSearchResult[]): HybridSearchResult[] {
  const seen = new Map<string, HybridSearchResult>();
  for (const c of chunks) {
    const existing = seen.get(c.chunk_id);
    if (!existing || c.hybrid_score > existing.hybrid_score) {
      seen.set(c.chunk_id, c);
    }
  }
  return [...seen.values()].sort((a, b) => b.hybrid_score - a.hybrid_score);
}
