import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: {
    default: 'Aivora — Autonomous AI OS',
    template: '%s | Aivora',
  },
  description:
    'Aivora is a Super-Intelligent Autonomous Multimodal AI OS built on Hybrid-Cloud RAG, local embeddings, and Supabase pgvector.',
  authors: [{ name: 'Fokrul Islam' }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full bg-[#020617] text-white">
        {children}
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'rgba(15,23,42,0.95)',
              border: '1px solid rgba(34,211,238,0.2)',
              color: 'rgba(255,255,255,0.8)',
              fontSize: '13px',
              backdropFilter: 'blur(16px)',
            },
          }}
        />
      </body>
    </html>
  );
}
