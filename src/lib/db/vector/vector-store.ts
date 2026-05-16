import { supabaseServer } from '../supabase/server';
import type { DocumentChunkInsert, DocumentInsert, HybridSearchResult } from '@/lib/types/document';

export async function insertDocument(doc: DocumentInsert): Promise<string> {
  const { data, error } = await supabaseServer
    .from('documents')
    .insert(doc)
    .select('id')
    .single();

  if (error) throw new Error(`Failed to insert document: ${error.message}`);
  return data.id as string;
}

export async function insertChunks(chunks: DocumentChunkInsert[]): Promise<void> {
  if (chunks.length === 0) return;
  const { error } = await supabaseServer.from('document_chunks').insert(chunks);
  if (error) throw new Error(`Failed to insert chunks: ${error.message}`);
}

export async function deleteDocument(documentId: string): Promise<void> {
  const { error } = await supabaseServer
    .from('documents')
    .delete()
    .eq('id', documentId);

  if (error) throw new Error(`Failed to delete document: ${error.message}`);
}

export type HybridSearchParams = {
  queryEmbedding: number[];
  queryText: string;
  matchCount?: number;
  similarityThreshold?: number;
  filterTags?: string[];
  filterDocumentIds?: string[];
};

export async function hybridSearch(params: HybridSearchParams): Promise<HybridSearchResult[]> {
  const {
    queryEmbedding,
    queryText,
    matchCount = 8,
    similarityThreshold = 0.35,
    filterTags,
    filterDocumentIds,
  } = params;

  const { data, error } = await supabaseServer.rpc('match_document_chunks_hybrid', {
    query_embedding: queryEmbedding,
    query_text: queryText,
    match_count: matchCount,
    similarity_threshold: similarityThreshold,
    filter_tags: filterTags ?? null,
    filter_document_ids: filterDocumentIds ?? null,
  });

  if (error) throw new Error(`Hybrid search RPC failed: ${error.message}`);
  return (data ?? []) as HybridSearchResult[];
}

export async function listDocuments(limit = 50, offset = 0) {
  const { data, error } = await supabaseServer
    .from('documents')
    .select('id, title, source_type, source_url, file_name, tags, metadata, created_at')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(`Failed to list documents: ${error.message}`);
  return data ?? [];
}

export async function getDocument(documentId: string) {
  const { data, error } = await supabaseServer
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single();

  if (error) throw new Error(`Document not found: ${error.message}`);
  return data;
}
