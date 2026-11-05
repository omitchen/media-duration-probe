import { open } from 'node:fs/promises';
import { MediaProbeError } from './errors.js';
import { probeMediaDuration } from './probe.js';
import type { ByteSource, MediaDurationResult, ProbeOptions } from './types.js';

/** Probes duration from a local file without loading the whole file into memory. */
export async function probeMediaDurationFromPath(path: string, options: ProbeOptions = {}): Promise<MediaDurationResult> {
  const file = await open(path, 'r');
  try {
    const stats = await file.stat();
    if (!Number.isSafeInteger(stats.size)) throw new MediaProbeError('INVALID_SOURCE', 'File is too large for safe random access');
    const source: ByteSource = {
      size: stats.size,
      async read(start: number, end: number): Promise<Uint8Array> {
        const buffer = new Uint8Array(end - start);
        const { bytesRead } = await file.read(buffer, 0, buffer.byteLength, start);
        return buffer.subarray(0, bytesRead);
      },
    };
    return await probeMediaDuration(source, options);
  } finally {
    await file.close();
  }
}

export { MediaProbeError } from './errors.js';
export type { MediaDurationResult, ProbeOptions } from './types.js';
