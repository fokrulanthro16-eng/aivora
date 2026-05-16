import type { HybridSearchResult } from '@/lib/types/document';

/**
 * Simple score-based reranker.
 * Future: replace with a Rust/WASM cross-encoder for higher accuracy.
 */
export function rerank(
  chunks: HybridSearchResult[],
  topK: number = 5
): HybridSearchResult[] {
  return [...chunks]
    .sort((a, b) => b.hybrid_score - a.hybrid_score)
    .slice(0, topK);
}
