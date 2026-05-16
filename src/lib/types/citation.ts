export type SourceCitation = {
  sourceId: string;
  documentTitle: string;
  chunkId: string;
  pageNumber?: number;
  sourceUrl?: string;
  fileName?: string;
  quotedText: string;
  relevanceScore: number;
};
