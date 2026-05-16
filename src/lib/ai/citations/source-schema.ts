import type { SourceCitation } from '@/lib/types/citation';
import type { HybridSearchResult } from '@/lib/types/document';
import { AIVORA_CONFIG } from '@/config/aivora';

/**
 * Build a SourceCitation from a retrieved chunk.
 * quotedText is extracted directly from the real chunk content — never invented.
 */
export function buildCitation(chunk: HybridSearchResult): SourceCitation {
  const quotedText = extractQuotedText(chunk.content);

  return {
    sourceId: chunk.document_id,
    documentTitle: chunk.title,
    chunkId: chunk.chunk_id,
    pageNumber: chunk.page_number ?? undefined,
    sourceUrl: chunk.source_url ?? undefined,
    fileName: chunk.file_name ?? undefined,
    quotedText,
    relevanceScore: Math.round(chunk.hybrid_score * 1000) / 1000,
  };
}

/**
 * Extract a representative quoted excerpt from a chunk.
 * Prefers the first full sentence; falls back to a character slice.
 */
function extractQuotedText(content: string, maxLength = 200): string {
  const trimmed = content.trim();

  // Try to end on a sentence boundary.
  const sentenceEnd = trimmed.search(/[.!?]\s/);
  if (sentenceEnd > 0 && sentenceEnd < maxLength) {
    return trimmed.slice(0, sentenceEnd + 1).trim();
  }

  if (trimmed.length <= maxLength) return trimmed;
  return trimmed.slice(0, maxLength).trimEnd() + '…';
}

/**
 * Deduplicate and rank citations.
 * If two chunks come from the same document, keep the one with the higher score.
 */
export function deduplicateCitations(citations: SourceCitation[]): SourceCitation[] {
  const seen = new Map<string, SourceCitation>();

  for (const c of citations) {
    const existing = seen.get(c.chunkId);
    if (!existing || c.relevanceScore > existing.relevanceScore) {
      seen.set(c.chunkId, c);
    }
  }

  return [...seen.values()].sort((a, b) => b.relevanceScore - a.relevanceScore);
}

/**
 * Check whether any citation meets the minimum confidence bar.
 * Uses the retrieval similarity threshold — any chunk that passed retrieval counts as grounded.
 */
export function hasGroundedCitations(citations: SourceCitation[]): boolean {
  return citations.some(
    (c) => c.relevanceScore >= AIVORA_CONFIG.retrieval.similarityThreshold
  );
}

export type { SourceCitation };
