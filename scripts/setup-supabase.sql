-- Aivora Supabase Setup Script
-- Run this in the Supabase SQL editor to set up the full schema in one shot.
-- Equivalent to running all three migrations in order.

-- ── Step 1: Extensions ────────────────────────────────────────────────────────

create extension if not exists vector;
create extension if not exists pg_trgm;

-- ── Step 2: Documents table ───────────────────────────────────────────────────

create table if not exists documents (
  id          uuid        primary key default gen_random_uuid(),
  title       text        not null,
  source_type text,
  source_url  text,
  file_name   text,
  tags        text[]      not null default '{}',
  metadata    jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_documents_created_at on documents (created_at desc);
create index if not exists idx_documents_tags on documents using gin (tags);

-- ── Step 3: Document chunks table ─────────────────────────────────────────────

create table if not exists document_chunks (
  id          uuid        primary key default gen_random_uuid(),
  document_id uuid        not null references documents (id) on delete cascade,
  chunk_index int         not null,
  content     text        not null,
  embedding   vector(384),
  token_count int,
  page_number int,
  metadata    jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_chunks_embedding     on document_chunks using hnsw (embedding vector_cosine_ops) with (m = 16, ef_construction = 64);
create index if not exists idx_chunks_content_trgm  on document_chunks using gin (content gin_trgm_ops);
create index if not exists idx_chunks_document_id   on document_chunks (document_id);
create index if not exists idx_chunks_created_at    on document_chunks (created_at desc);

alter table documents       enable row level security;
alter table document_chunks enable row level security;

-- ── Step 4: Hybrid search RPC ─────────────────────────────────────────────────

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
language sql stable as $$
  select
    dc.id,
    dc.document_id,
    dc.content,
    d.title,
    d.source_url,
    d.file_name,
    dc.page_number,
    d.tags,
    (1 - (dc.embedding <=> query_embedding))                        as vector_similarity,
    coalesce(similarity(dc.content, query_text), 0.0)              as keyword_similarity,
    (0.70 * (1 - (dc.embedding <=> query_embedding)) + 0.30 * coalesce(similarity(dc.content, query_text), 0.0)) as hybrid_score,
    dc.metadata
  from document_chunks dc
  join documents d on d.id = dc.document_id
  where
    dc.embedding is not null
    and (1 - (dc.embedding <=> query_embedding)) >= similarity_threshold
    and (filter_tags is null or d.tags && filter_tags)
    and (filter_document_ids is null or dc.document_id = any(filter_document_ids))
  order by hybrid_score desc
  limit match_count;
$$;

grant execute on function match_document_chunks_hybrid to authenticated, service_role;
