import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { parseOfficeAsync } from 'officeparser';

export async function loadDocument(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
  const mimeLower = mimeType.toLowerCase();
  let text = '';

  try {
    if (mimeLower === 'application/pdf') {
      const pdfData = await pdfParse(buffer);
      text = pdfData.text;
    } else if (
      mimeLower === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeLower === 'application/msword'
    ) {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else if (
      mimeLower === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
      mimeLower === 'application/vnd.ms-powerpoint'
    ) {
      // officeparser parseOfficeAsync requires a path or buffer
      text = await parseOfficeAsync(buffer);
    } else if (mimeLower === 'text/plain' || mimeLower === 'text/markdown' || mimeLower === 'text/csv') {
      text = buffer.toString('utf8');
    } else {
      throw new Error(`Unsupported MIME type: ${mimeType}`);
    }

    return text.trim();
  } catch (err) {
    console.error(`Failed to load document ${filename}:`, err);
    throw new Error(`Failed to extract text from document ${filename}`);
  }
}
