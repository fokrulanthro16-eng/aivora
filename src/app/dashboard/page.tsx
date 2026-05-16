import type { Metadata } from 'next';
import { AivoraShell } from '@/components/dashboard/core/AivoraShell';

export const metadata: Metadata = {
  title: 'Aivora — Autonomous AI OS',
  description: 'Super-Intelligent Autonomous Multimodal AI OS by Fokrul Islam',
};

// Dashboard is fully dynamic (agent queries, live citations).
export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  return <AivoraShell />;
}
