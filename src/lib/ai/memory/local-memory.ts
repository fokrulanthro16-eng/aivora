// Browser-only local memory backed by IndexedDB via Dexie.
// Stores conversation history, reasoning traces, and user preferences.
// No backend required — completely private to the user's device.

import Dexie, { type Table } from 'dexie';
import type { SourceCitation } from '@/lib/types/citation';
import type { ReasoningTrace } from '@/lib/types/agent';

export interface StoredMessage {
  id?: number;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  systemMode?: string;
  confidence?: number;
  citations?: SourceCitation[];
  reasoningTrace?: ReasoningTrace;
}

export interface StoredPreference {
  key: string;
  value: unknown;
}

class AivoraLocalDB extends Dexie {
  messages!: Table<StoredMessage, number>;
  preferences!: Table<StoredPreference, string>;

  constructor() {
    super('AivoraLocalDB');
    this.version(1).stores({
      messages: '++id, conversationId, timestamp',
      preferences: 'key',
    });
  }
}

const db = new AivoraLocalDB();

export async function saveConversationMessage(
  msg: Omit<StoredMessage, 'id'>
): Promise<void> {
  await db.messages.add(msg);
}

export async function getConversationHistory(
  conversationId: string,
  limit = 50
): Promise<StoredMessage[]> {
  return db.messages
    .where('conversationId')
    .equals(conversationId)
    .limit(limit)
    .sortBy('timestamp');
}

export async function clearLocalMemory(): Promise<void> {
  await db.messages.clear();
  await db.preferences.clear();
}

export async function getMessageCount(): Promise<number> {
  return db.messages.count();
}

export async function saveUserPreference(key: string, value: unknown): Promise<void> {
  await db.preferences.put({ key, value });
}

export async function getUserPreference<T>(key: string, defaultValue: T): Promise<T> {
  const pref = await db.preferences.get(key);
  return pref !== undefined ? (pref.value as T) : defaultValue;
}
