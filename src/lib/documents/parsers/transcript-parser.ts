/**
 * Parses SRT and WebVTT transcript files into plain text.
 * Strips cue numbers, timestamps, VTT headers, NOTE blocks, and inline tags.
 */
export function parseTranscript(buffer: Buffer): string {
  const raw = buffer.toString('utf-8');
  const lines = raw.split(/\r?\n/);
  const textLines: string[] = [];
  let skipBlock = false;

  for (const line of lines) {
    const t = line.trim();

    // VTT file header
    if (t.startsWith('WEBVTT')) continue;

    // VTT NOTE / STYLE / REGION blocks — skip until blank line
    if (/^(NOTE|STYLE|REGION)\b/.test(t)) { skipBlock = true; continue; }
    if (t === '' && skipBlock) { skipBlock = false; continue; }
    if (skipBlock) continue;

    // Timestamp line — "HH:MM:SS,ms --> HH:MM:SS,ms" or "HH:MM:SS.ms --> ..."
    if (/^\d{2}:\d{2}:\d{2}[,\.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,\.]\d{3}/.test(t)) continue;

    // Short-form VTT timestamps "MM:SS.ms --> MM:SS.ms"
    if (/^\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}\.\d{3}/.test(t)) continue;

    // SRT sequence number (bare integer)
    if (/^\d+$/.test(t)) continue;

    // Blank line
    if (t === '') continue;

    // Strip HTML/VTT inline tags and SSA style overrides
    const cleaned = t
      .replace(/<[^>]+>/g, '')
      .replace(/\{[^}]+\}/g, '')
      .trim();

    if (cleaned.length > 0) textLines.push(cleaned);
  }

  const text = textLines.join(' ').replace(/\s{2,}/g, ' ').trim();
  if (text.length < 10) {
    throw new Error('No readable text found in this transcript file.');
  }
  return text;
}
