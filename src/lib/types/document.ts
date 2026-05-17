export type SourceType = 'pdf' | 'docx' | 'txt' | 'html' | 'markdown' | 'url' | 'manual' | 'image' | 'transcript';

export type Document = {
  id: string;
  title: string;
  source_type: SourceType | null;
  source_url: string | null;
  file_name: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: string;
};

export type DocumentChunk = {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  embedding: number[] | null;
  token_count: number | null;
  page_number: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type DocumentInsert = Omit<Document, 'id' | 'created_at'>;
export type DocumentChunkInsert = Omit<DocumentChunk, 'id' | 'created_at'>;

export type HybridSearchResult = {
  chunk_id: string;
  document_id: string;
  chunk_index?: number;
  content: string;
  title: string;
  source_url: string | null;
  file_name: string | null;
  page_number: number | null;
  tags: string[];
  vector_similarity: number;
  keyword_similarity: number;
  hybrid_score: number;
  metadata: Record<string, unknown>;
};

export type ChunkingOptions = {
  maxTokens?: number;
  overlap?: number;
  minChunkLength?: number;
};

export type ParsedDocument = {
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  pageCount?: number;
};
