import { z } from 'zod';
import { insertDocument, insertChunks } from '@/lib/db/vector/vector-store';
import { chunkText } from '@/lib/documents/chunking/semantic-chunker';
import { parseTextContent } from '@/lib/documents/parsers/text-parser';
import { extractMetadata } from '@/lib/documents/metadata/extract-metadata';
import { embedBatch } from '@/lib/ai/embeddings/local-embedder';
import { parsePdf } from '@/lib/documents/parsers/pdf-parser';
import { parseDocx } from '@/lib/documents/parsers/docx-parser';
import { parseImage } from '@/lib/documents/parsers/image-parser';
import type { DocumentChunkInsert, SourceType } from '@/lib/types/document';

export const runtime = 'nodejs';

// Give the embedder time to initialise on first request.
export const maxDuration = 120;

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_EXT: Record<string, SourceType> = {
  '.txt':  'txt',
  '.md':   'markdown',
  '.pdf':  'pdf',
  '.docx': 'docx',
  '.png':  'image',
  '.jpg':  'image',
  '.jpeg': 'image',
  '.webp': 'image',
};

const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov', '.avi', '.mkv']);

const LegacyBodySchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string().min(10).max(500_000),
  source_type: z.enum(['pdf', 'docx', 'txt', 'html', 'markdown', 'url', 'manual']).optional(),
  source_url: z.string().url().optional(),
  file_name: z.string().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function err(message: string, status = 400): Response {
  console.error('[/api/documents/upload]', message);
  return Response.json({ ok: false, error: message }, { status });
}

// ── Shared ingestion pipeline ──────────────────────────────────────────────────

async function ingestText(
  rawText: string,
  opts: {
    title: string;
    source_type: SourceType | null;
    source_url?: string | null;
    file_name?: string | null;
    tags?: string[];
    metadata?: Record<string, unknown>;
  },
): Promise<{ documentId: string; chunksInserted: number }> {
  const parsedDoc = parseTextContent(rawText);
  const docMeta = extractMetadata(parsedDoc.content, {
    title: opts.title,
    file_name: opts.file_name ?? undefined,
    source_url: opts.source_url ?? undefined,
  });

  const documentId = await insertDocument({
    title: opts.title,
    source_type: opts.source_type,
    source_url: opts.source_url ?? null,
    file_name: opts.file_name ?? null,
    tags: opts.tags ?? [],
    metadata: { ...docMeta, ...(opts.metadata ?? {}) },
  });

  const chunks = chunkText(parsedDoc.content);
  const embeddings = await embedBatch(chunks.map((c) => c.content));

  const chunkRows: DocumentChunkInsert[] = chunks.map((c, i) => ({
    document_id: documentId,
    chunk_index: c.index,
    content: c.content,
    embedding: embeddings[i] ?? null,
    token_count: c.tokenCount,
    page_number: null,
    metadata: {},
  }));

  await insertChunks(chunkRows);
  return { documentId, chunksInserted: chunkRows.length };
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  try {
    return await handlePost(request);
  } catch (fatal) {
    const msg = fatal instanceof Error ? fatal.message : 'Unexpected server error';
    console.error('[/api/documents/upload] Unhandled:', msg);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}

async function handlePost(request: Request): Promise<Response> {
  // ── Try multipart first (file upload) ─────────────────────────────────────
  // Attempt formData() regardless of the Content-Type header value so that
  // browser quirks with boundary formatting never silently fall through to the
  // JSON branch.
  let form: FormData | null = null;
  try {
    const ct = request.headers.get('content-type') ?? '';
    if (ct.includes('multipart/form-data') || ct.includes('form-data')) {
      form = await request.formData();
    }
  } catch {
    // Content-Type was multipart but formData() failed — propagate the error.
    return err('Could not parse multipart form data.');
  }

  if (form !== null) {
    // ── File upload path ────────────────────────────────────────────────────
    const file = form.get('file');
    if (!(file instanceof File)) {
      return err('No file provided.');
    }

    if (file.size === 0) {
      return err('The selected file is empty.');
    }

    if (file.size > MAX_FILE_BYTES) {
      return err('File exceeds the 10 MB limit.', 413);
    }

    const fileName = file.name;
    const dotIdx = fileName.lastIndexOf('.');
    const ext = dotIdx >= 0 ? fileName.slice(dotIdx).toLowerCase() : '';

    if (VIDEO_EXT.has(ext)) {
      return err(
        'Video ingestion requires transcript extraction. Please upload a transcript .txt or .md for now.',
        415,
      );
    }

    if (!(ext in ALLOWED_EXT)) {
      return err(
        `Unsupported file type "${ext || '(none)'}". Allowed: .txt .md .pdf .docx .png .jpg .jpeg .webp`,
        415,
      );
    }

    const sourceType = ALLOWED_EXT[ext]!;
    const titleFromForm = (form.get('title') as string | null)?.trim();
    const documentTitle = titleFromForm || (dotIdx > 0 ? fileName.slice(0, dotIdx) : fileName);

    let buffer: Buffer;
    try {
      buffer = Buffer.from(await file.arrayBuffer());
    } catch {
      return err('Failed to read file bytes — the file may be corrupt.');
    }

    let rawText: string;
    try {
      if (ext === '.pdf') {
        rawText = await parsePdf(buffer);
      } else if (ext === '.docx') {
        rawText = await parseDocx(buffer);
      } else if (sourceType === 'image') {
        rawText = await parseImage(buffer); // throws with user-friendly message if no text
      } else {
        rawText = buffer.toString('utf-8');
      }
    } catch (parseErr) {
      const msg = parseErr instanceof Error ? parseErr.message : 'Extraction failed';
      // parseImage already gives a clear message; wrap others
      return err(sourceType === 'image' ? msg : `Failed to extract text from file: ${msg}`, 422);
    }

    if (!rawText || rawText.trim().length < 10) {
      return err(
        sourceType === 'image'
          ? 'No readable text found in this image.'
          : 'Extracted text is empty or too short. The file may be image-only, password-protected, or corrupt.',
        422,
      );
    }

    try {
      const { chunksInserted } = await ingestText(rawText, {
        title: documentTitle,
        source_type: sourceType,
        file_name: fileName,
      });
      return Response.json(
        { ok: true, documentTitle, fileName, fileType: sourceType, chunksInserted },
        { status: 201 },
      );
    } catch (ingestErr) {
      const msg = ingestErr instanceof Error ? ingestErr.message : 'Indexing failed';
      return err(msg, 500);
    }
  }

  // ── Legacy JSON path ──────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return err('Invalid request body — expected multipart/form-data or JSON.');
  }

  const parsed = LegacyBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: 'Validation failed.', details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { title, content, source_type, source_url, file_name, tags, metadata } = parsed.data;

  try {
    const { chunksInserted } = await ingestText(content, {
      title,
      source_type: source_type ?? null,
      source_url: source_url ?? null,
      file_name: file_name ?? null,
      tags,
      metadata,
    });
    return Response.json(
      { ok: true, documentTitle: title, fileName: file_name ?? null, fileType: source_type ?? 'txt', chunksInserted },
      { status: 201 },
    );
  } catch (ingestErr) {
    const msg = ingestErr instanceof Error ? ingestErr.message : 'Upload failed';
    return err(msg, 500);
  }
}
