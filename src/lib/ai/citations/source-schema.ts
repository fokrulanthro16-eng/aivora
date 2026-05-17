import type { SourceCitation } from '@/lib/types/citation';
import type { HybridSearchResult } from '@/lib/types/document';
import { AIVORA_CONFIG } from '@/config/aivora';

/**
 * Build a SourceCitation from a retrieved chunk.
 * All fields are derived from real chunk data — nothing is fabricated.
 * pageNumber is only set when the chunk actually stores it; chunk_index is
 * used as the fallback location reference instead of inventing page numbers.
 */
export function buildCitation(chunk: HybridSearchResult): SourceCitation {
  return {
    sourceId:      chunk.document_id,
    documentTitle: chunk.title,
    chunkId:       chunk.chunk_id,
    chunkIndex:    chunk.chunk_index,
    pageNumber:    chunk.page_number   ?? undefined,
    fileType:      fileTypeFromFileName(chunk.file_name),
    sourceUrl:     chunk.source_url    ?? undefined,
    fileName:      chunk.file_name     ?? undefined,
    quotedText:    extractQuotedText(chunk.content),
    relevanceScore: Math.round(chunk.hybrid_score        * 1000) / 1000,
    vectorScore:    Math.round(chunk.vector_similarity   * 1000) / 1000,
    keywordScore:   Math.round(chunk.keyword_similarity  * 1000) / 1000,
  };
}

/**
 * Derive a short uppercase file-type label from a file name's extension.
 * Returns undefined when the name is absent or the extension is unrecognised.
 */
function fileTypeFromFileName(fileName: string | null | undefined): string | undefined {
  if (!fileName) return undefined;
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (!ext) return undefined;
  const map: Record<string, string> = {
    txt: 'TXT', md: 'MD', pdf: 'PDF', docx: 'DOCX', html: 'HTML',
  };
  return map[ext];
}

/**
 * Extract a representative prose excerpt from chunk content.
 * Strips markdown headings and code fences, then collects 1–2 complete
 * sentences up to maxLength characters.  Falls back to a character slice.
 * The text is never modified beyond stripping — no paraphrasing.
 */
function extractQuotedText(content: string, maxLength = 280): string {
  const cleaned = content
    .replace(/^#{1,6}\s+.+$/gm, '')   // strip heading lines
    .replace(/```[\s\S]*?```/g, '')    // strip fenced code blocks
    .replace(/\*\*(.+?)\*\*/g, '$1')  // unwrap bold markers
    .replace(/\*(.+?)\*/g, '$1')      // unwrap italic markers
    .replace(/\n{2,}/g, ' ')          // collapse paragraph breaks to a space
    .trim();

  // Collect up to 2 complete sentences within maxLength.
  let end = 0;
  let sentences = 0;
  for (let i = 0; i < cleaned.length && i < maxLength; i++) {
    const ch = cleaned[i];
    if (ch === '.' || ch === '!' || ch === '?') {
      const next = cleaned[i + 1];
      if (next === undefined || next === ' ' || next === '\n') {
        end = i + 1;
        sentences++;
        if (sentences >= 2) break;
      }
    }
  }

  if (end > 0) return cleaned.slice(0, end).trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength).trimEnd() + '…';
}

/**
 * Deduplicate citations by chunkId, keeping the highest-scoring entry.
 * Sorts descending by relevanceScore so the strongest sources appear first.
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
 * Returns true when at least one citation clears the retrieval similarity
 * threshold — meaning the answer is genuinely grounded in knowledge documents.
 */
export function hasGroundedCitations(citations: SourceCitation[]): boolean {
  return citations.some(
    (c) => c.relevanceScore >= AIVORA_CONFIG.retrieval.similarityThreshold,
  );
}

export type { SourceCitation };
