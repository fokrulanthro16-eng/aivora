import { recognize } from 'tesseract.js';

/**
 * Extract text from an image buffer using Tesseract OCR.
 * Language data is downloaded automatically on first use and cached locally.
 * Throws if no readable text is found (< 5 characters after trimming).
 */
export async function parseImage(buffer: Buffer): Promise<string> {
  let text: string;
  try {
    const result = await recognize(buffer, 'eng', {
      logger: () => undefined, // suppress progress logs in server output
    });
    text = (result.data.text ?? '').trim();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'OCR engine error';
    throw new Error(`Image OCR failed: ${msg}`);
  }

  if (text.length < 5) {
    throw new Error('No readable text found in this image.');
  }

  return text;
}
