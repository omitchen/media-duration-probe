import { MediaProbeError } from './errors.js';
import type { ByteSource } from './types.js';

function validateReadRange(size: number, start: number, end: number): void {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > size) {
    throw new MediaProbeError('INVALID_ARGUMENT', `Invalid byte range: ${start}-${end}`);
  }
}

/** Creates a random-access source backed by an in-memory byte array. */
export function createBufferSource(buffer: Uint8Array): ByteSource {
  return {
    size: buffer.byteLength,
    async read(start: number, end: number): Promise<Uint8Array> {
      validateReadRange(buffer.byteLength, start, end);
      return buffer.subarray(start, end);
    },
  };
}

/** Creates a random-access source backed by a browser Blob or File. */
export function createBlobSource(blob: Blob): ByteSource {
  return {
    size: blob.size,
    async read(start: number, end: number): Promise<Uint8Array> {
      validateReadRange(blob.size, start, end);
      return new Uint8Array(await blob.slice(start, end).arrayBuffer());
    },
  };
}
