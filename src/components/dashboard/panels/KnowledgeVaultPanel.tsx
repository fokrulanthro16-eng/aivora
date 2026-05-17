'use client';

import { useState, useRef } from 'react';
import { Upload, CheckCircle, AlertCircle, Loader2, HardDrive } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils/cn';

type UploadState =
  | { status: 'idle' }
  | { status: 'uploading' }
  | { status: 'success'; fileName: string; fileType: string; chunkCount: number }
  | { status: 'error'; message: string };

const FILE_TYPE_LABEL: Record<string, string> = {
  txt: 'TXT',
  markdown: 'MD',
  pdf: 'PDF',
  docx: 'DOCX',
};

type Props = { className?: string };

export function KnowledgeVaultPanel({ className }: Props) {
  const [result, setResult] = useState<UploadState>({ status: 'idle' });
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
      const data = (await res.json()) as {
        error?: string;
        fileName?: string;
        fileType?: string;
        chunkCount?: number;
      };

      if (!res.ok) {
        setResult({ status: 'error', message: data.error ?? 'Upload failed.' });
      } else {
        setResult({
          status: 'success',
          fileName: data.fileName ?? file.name,
          fileType: data.fileType ?? 'txt',
          chunkCount: data.chunkCount ?? 0,
        });
        setTitle('');
        if (fileRef.current) fileRef.current.value = '';
      }
    } catch {
      setResult({ status: 'error', message: 'Network error — please try again.' });
    }
  }

  return (
    <div className={cn('flex flex-col h-full overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 flex-shrink-0 border-b border-white/5">
        <div className="flex items-center gap-2">
          <HardDrive className="w-3.5 h-3.5 text-cyan-400/70" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-400/80">
            Knowledge Vault
          </span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-400/20">
          <span className="text-[9px] font-mono text-cyan-300">pgvector</span>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 custom-scrollbar">
        <p className="text-[11px] text-white/30 leading-relaxed">
          Upload .txt, .md, .pdf, or .docx files to index them into Supabase pgvector.
          Files are chunked and embedded locally — no external API required.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* File picker */}
          <div>
            <label className="block text-[10px] text-white/40 uppercase tracking-wider mb-1.5">
              File
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.md,.pdf,.docx"
              required
              className="block w-full text-[11px] text-white/50
                file:mr-2.5 file:py-1 file:px-2.5
                file:rounded-lg file:border-0
                file:text-[10px] file:font-medium
                file:bg-cyan-500/15 file:text-cyan-300
                hover:file:bg-cyan-500/25 cursor-pointer"
            />
            <p className="text-white/20 text-[9px] mt-1 font-mono">
              .txt · .md · .pdf · .docx &nbsp;|&nbsp; max 10 MB
            </p>
          </div>

          {/* Optional title */}
          <div>
            <label className="block text-[10px] text-white/40 uppercase tracking-wider mb-1.5">
              Title{' '}
              <span className="text-white/20 normal-case">(optional)</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Defaults to file name"
              maxLength={500}
              className="w-full bg-white/4 border border-white/8 rounded-xl px-3 py-2
                text-[11px] text-white/70 placeholder-white/15
                focus:outline-none focus:border-cyan-400/30 focus:bg-white/6
                transition-colors"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={result.status === 'uploading'}
            className="w-full flex items-center justify-center gap-2 py-2 px-4
              bg-cyan-500/12 hover:bg-cyan-500/20 border border-cyan-400/20
              text-cyan-300 text-[11px] font-mono rounded-xl
              transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {result.status === 'uploading' ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Indexing document…
              </>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5" />
                Upload &amp; Index
              </>
            )}
          </button>
        </form>

        {/* Result feedback */}
        <AnimatePresence mode="wait">
          {result.status === 'success' && (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="flex items-start gap-2.5 bg-emerald-500/8 border border-emerald-500/15 rounded-xl p-3"
            >
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-emerald-300 text-[11px] font-semibold">Indexed successfully</p>
                <p className="text-white/40 text-[10px] mt-0.5">
                  <span className="text-white/60">{result.fileName}</span>
                  {' · '}
                  <span className="text-cyan-400/60 font-mono">
                    {FILE_TYPE_LABEL[result.fileType] ?? result.fileType.toUpperCase()}
                  </span>
                  {' · '}
                  {result.chunkCount} chunk{result.chunkCount !== 1 ? 's' : ''} inserted
                </p>
                <p className="text-white/25 text-[10px] mt-1.5 leading-snug italic">
                  Now ask Aivora about this document.
                </p>
              </div>
            </motion.div>
          )}

          {result.status === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="flex items-start gap-2.5 bg-red-500/8 border border-red-500/15 rounded-xl p-3"
            >
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-red-300 text-[11px]">{result.message}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
