'use client';

import { useState, useRef } from 'react';
import { Upload, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

type UploadResult =
  | { status: 'idle' }
  | { status: 'uploading' }
  | { status: 'success'; fileName: string; fileType: string; chunksInserted: number }
  | { status: 'error'; message: string };

const ACCEPT = '.txt,.md,.pdf,.docx';

const FILE_TYPE_LABEL: Record<string, string> = {
  txt: 'Plain Text',
  markdown: 'Markdown',
  pdf: 'PDF',
  docx: 'DOCX',
};

export default function AdminDocumentsPage() {
  const [result, setResult] = useState<UploadResult>({ status: 'idle' });
  const [title, setTitle] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setResult({ status: 'uploading' });

    const form = new FormData();
    form.append('file', file);
    if (title.trim()) form.append('title', title.trim());

    try {
      const res = await fetch('/api/documents/upload', { method: 'POST', body: form });

      let data: { ok?: boolean; error?: string; fileName?: string; fileType?: string; chunksInserted?: number };
      try {
        data = (await res.json()) as typeof data;
      } catch {
        const text = await res.text().catch(() => '');
        setResult({
          status: 'error',
          message: text ? `Server error: ${text.slice(0, 200)}` : `HTTP ${res.status} — unexpected response`,
        });
        return;
      }

      if (!res.ok || data.ok === false) {
        setResult({ status: 'error', message: data.error ?? `Upload failed (HTTP ${res.status}).` });
      } else {
        setResult({
          status: 'success',
          fileName: data.fileName ?? file.name,
          fileType: data.fileType ?? 'txt',
          chunksInserted: data.chunksInserted ?? 0,
        });
        setTitle('');
        if (fileRef.current) fileRef.current.value = '';
      }
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : 'Network error';
      setResult({ status: 'error', message: `Network error — ${msg}` });
    }
  }

  return (
    <div className="min-h-screen bg-[#020617] text-white flex flex-col items-center justify-center gap-6 p-8">
      <div className="w-full max-w-lg">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-300 to-violet-400 bg-clip-text text-transparent mb-1">
          Document Manager
        </h1>
        <p className="text-white/40 text-sm mb-6">
          Upload .txt, .md, .pdf, or .docx files to the Knowledge Vault. Files are chunked,
          embedded locally, and indexed for hybrid RAG retrieval.
        </p>

        <form
          onSubmit={handleSubmit}
          className="bg-white/[0.04] border border-white/10 rounded-xl p-6 space-y-4"
        >
          {/* File input */}
          <div>
            <label className="block text-xs text-white/50 uppercase tracking-wide mb-1.5">
              File
            </label>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              required
              className="block w-full text-sm text-white/70
                file:mr-3 file:py-1.5 file:px-3
                file:rounded-lg file:border-0
                file:text-xs file:font-medium
                file:bg-cyan-500/20 file:text-cyan-300
                hover:file:bg-cyan-500/30 cursor-pointer"
            />
            <p className="text-white/30 text-xs mt-1.5">
              Supported: .txt &nbsp;·&nbsp; .md &nbsp;·&nbsp; .pdf &nbsp;·&nbsp; .docx
              &nbsp;&nbsp;|&nbsp;&nbsp; Max 10 MB
            </p>
          </div>

          {/* Optional title override */}
          <div>
            <label className="block text-xs text-white/50 uppercase tracking-wide mb-1.5">
              Title{' '}
              <span className="text-white/25 normal-case">(optional — defaults to file name)</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Company Handbook Q1 2025"
              maxLength={500}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2
                text-sm text-white placeholder-white/20
                focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={result.status === 'uploading'}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4
              bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30
              text-cyan-300 text-sm font-medium rounded-lg
              transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {result.status === 'uploading' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Parsing &amp; indexing…
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Upload &amp; Index
              </>
            )}
          </button>
        </form>

        {/* Success banner */}
        {result.status === 'success' && (
          <div className="mt-4 flex items-start gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-emerald-300 text-sm font-medium">Indexed successfully</p>
              <p className="text-white/50 text-xs mt-0.5">
                <span className="text-white/70">{result.fileName}</span>
                &nbsp;·&nbsp;
                <span className="uppercase text-cyan-400/70">
                  {FILE_TYPE_LABEL[result.fileType] ?? result.fileType}
                </span>
                &nbsp;·&nbsp;
                {result.chunksInserted} chunk{result.chunksInserted !== 1 ? 's' : ''} inserted
              </p>
            </div>
          </div>
        )}

        {/* Error banner */}
        {result.status === 'error' && (
          <div className="mt-4 flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-4">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <p className="text-red-300 text-sm">{result.message}</p>
          </div>
        )}

        <p className="text-white/20 text-xs mt-6 text-center">
          Also available via API:{' '}
          <code className="text-cyan-400/50 font-mono text-[11px]">
            POST /api/documents/upload
          </code>{' '}
          with <code className="text-cyan-400/50 font-mono text-[11px]">multipart/form-data</code>
        </p>
      </div>
    </div>
  );
}
