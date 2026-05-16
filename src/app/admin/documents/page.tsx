import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Document Manager',
};

export default function AdminDocumentsPage() {
  return (
    <div className="min-h-screen bg-[#020617] text-white flex flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-300 to-violet-400 bg-clip-text text-transparent">
        Document Manager
      </h1>
      <p className="text-white/40 text-sm max-w-md text-center">
        Upload documents via{' '}
        <code className="text-cyan-400/70 font-mono bg-white/5 px-1.5 py-0.5 rounded">
          POST /api/documents/upload
        </code>{' '}
        with a JSON body containing <code className="text-cyan-400/70 font-mono bg-white/5 px-1.5 py-0.5 rounded">title</code> and <code className="text-cyan-400/70 font-mono bg-white/5 px-1.5 py-0.5 rounded">content</code>.
        A full admin UI is coming soon.
      </p>
    </div>
  );
}
