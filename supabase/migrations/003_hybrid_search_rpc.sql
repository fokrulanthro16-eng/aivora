-- Migration 003: Hybrid search RPC function
-- Combines vector similarity (cosine) and keyword similarity (trigram) into a
-- single hybrid_score, then returns the top-N most relevant chunks.

create or replace function match_document_chunks_hybrid(
  query_embedding     vector(384),
  query_text          text,
  match_count         int     default 8,
  similarity_threshold float  default 0.35,
  filter_tags         text[]  default null,
  filter_document_ids uuid[]  default null
)
returns table (
  chunk_id          uuid,
  document_id       uuid,
  content           text,
  title             text,
  source_url        text,
  file_name         text,
  page_number       int,
  tags              text[],
  vector_similarity float,
  keyword_similarity float,
  hybrid_score      float,
  metadata          jsonb
)
language sql
stable
as $$
  select
    dc.id                                                           as chunk_id,
    dc.document_id,
    dc.content,
    d.title,
    d.source_url,
    d.file_name,
    dc.page_number,
    d.tags,
    -- Cosine similarity: 1 = identical, 0 = orthogonal
    (1 - (dc.embedding <=> query_embedding))                        as vector_similarity,
    -- Trigram similarity: 0..1, 1 = exact match
    coalesce(similarity(dc.content, query_text), 0.0)              as keyword_similarity,
    -- Hybrid score: 70% vector + 30% keyword
    (
      0.70 * (1 - (dc.embedding <=> query_embedding))
      + 0.30 * coalesce(similarity(dc.content, query_text), 0.0)
    )                                                               as hybrid_score,
    dc.metadata
  from document_chunks dc
  join documents        d  on d.id = dc.document_id
  where
    dc.embedding is not null
    -- Vector pre-filter: only rows whose cosine similarity clears the threshold
    and (1 - (dc.embedding <=> query_embedding)) >= similarity_threshold
    -- Optional tag filter
    and (filter_tags         is null or d.tags && filter_tags)
    -- Optional document-ID filter
    and (filter_document_ids is null or dc.document_id = any(filter_document_ids))
  order by hybrid_score desc
  limit match_count;
$$;

-- Grant execute to authenticated and service roles
grant execute on function match_document_chunks_hybrid to authenticated, service_role;
