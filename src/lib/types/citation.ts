export type SourceCitation = {
  sourceId: string;
  documentTitle: string;
  chunkId: string;
  /** Ordinal position of the chunk within the document (0-based). */
  chunkIndex?: number;
  /** Real page number — only set when the document stores page metadata. Never fabricated. */
  pageNumber?: number;
  /** Human-readable file type label derived from the file extension (e.g. 'PDF', 'TXT'). */
  fileType?: string;
  sourceUrl?: string;
  fileName?: string;
  /** Representative prose excerpt extracted directly from the chunk. Never invented. */
  quotedText: string;
  /** Hybrid relevance score: 0.70 × vector + 0.30 × keyword. */
  relevanceScore: number;
  /** Raw cosine (vector) similarity component. */
  vectorScore?: number;
  /** Raw trigram (keyword) similarity component. */
  keywordScore?: number;
};
