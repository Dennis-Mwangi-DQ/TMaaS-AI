import { createHash, randomUUID } from 'crypto';

export function generateSessionId(seed?: string): string {
  if (!seed) {
    return randomUUID();
  }

  const hash = createHash('sha256').update(seed).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '4' + hash.slice(13, 16),
    '8' + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join('-');
}

export function generateSequenceId(prefix: string, datePart: string, sequence: number, digits: number): string {
  return `${prefix}-${datePart}-${sequence.toString().padStart(digits, '0')}`;
}
