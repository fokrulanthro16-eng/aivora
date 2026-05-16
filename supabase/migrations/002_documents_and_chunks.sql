-- Migration 002: Documents and document_chunks tables
-- Run after 001_enable_pgvector.sql

-- ─── Documents ────────────────────────────────────────────────────────────────

create table if not exists documents (
  id          uuid        primary key default gen_random_uuid(),
  title       text        not null,
  source_type text,                          -- 'pdf' | 'docx' | 'txt' | 'html' | 'markdown' | 'url' | 'manual'
  source_url  text,
  file_name   text,
  tags        text[]      not null default '{}',
  metadata    jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_documents_created_at
  on documents (created_at desc);

create index if not exists idx_documents_tags
  on documents using gin (tags);

-- ─── Document Chunks ──────────────────────────────────────────────────────────

create table if not exists document_chunks (
  id          uuid        primary key default gen_random_uuid(),
  document_id uuid        not null references documents (id) on delete cascade,
  chunk_index int         not null,
  content     text        not null,
  embedding   vector(384),                   -- Xenova/all-MiniLM-L6-v2 dimension
  token_count int,
  page_number int,
  metadata    jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- HNSW index for fast approximate nearest-neighbour vector search.
create index if not exists idx_chunks_embedding
  on document_chunks using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- GIN trigram index for keyword similarity (used by the hybrid RPC).
create index if not exists idx_chunks_content_trgm
  on document_chunks using gin (content gin_trgm_ops);

create index if not exists idx_chunks_document_id
  on document_chunks (document_id);

create index if not exists idx_chunks_created_at
  on document_chunks (created_at desc);

-- ─── Row-Level Security ───────────────────────────────────────────────────────
-- Enable RLS but keep open policies; tighten per your auth strategy.

alter table documents        enable row level security;
alter table document_chunks  enable row level security;

-- Service-role key bypasses RLS automatically.
-- For anon/user reads, add policies as needed, e.g.:
-- create policy "public read documents" on documents for select using (true);
