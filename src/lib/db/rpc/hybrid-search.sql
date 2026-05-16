-- Hybrid search RPC — reference copy (identical to migration 003).
-- Run this directly in the Supabase SQL editor if you prefer not to use migrations.

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
    (1 - (dc.embedding <=> query_embedding))                        as vector_similarity,
    coalesce(similarity(dc.content, query_text), 0.0)              as keyword_similarity,
    (
      0.70 * (1 - (dc.embedding <=> query_embedding))
      + 0.30 * coalesce(similarity(dc.content, query_text), 0.0)
    )                                                               as hybrid_score,
    dc.metadata
  from document_chunks dc
  join documents        d  on d.id = dc.document_id
  where
    dc.embedding is not null
    and (1 - (dc.embedding <=> query_embedding)) >= similarity_threshold
    and (filter_tags         is null or d.tags && filter_tags)
    and (filter_document_ids is null or dc.document_id = any(filter_document_ids))
  order by hybrid_score desc
  limit match_count;
$$;
