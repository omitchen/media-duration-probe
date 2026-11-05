import { MediaProbeError } from './errors.js';
import { probeMediaDuration } from './probe.js';
import type { ByteSource, MediaDurationResult, UrlProbeOptions } from './types.js';

const DEFAULT_TIMEOUT_MS = 15_000;

/** Probes duration from an HTTP URL using byte range requests. */
export async function probeMediaDurationFromUrl(url: string | URL, options: UrlProbeOptions = {}): Promise<MediaDurationResult> {
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new MediaProbeError('INVALID_ARGUMENT', 'Only HTTP and HTTPS URLs are supported');
  }
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  if (!fetchImplementation) throw new MediaProbeError('INVALID_ARGUMENT', 'A fetch implementation is required');
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new MediaProbeError('INVALID_ARGUMENT', 'timeoutMs must be a positive safe integer');
  const { source, initialBytesRead } = await createUrlSource(parsedUrl, fetchImplementation, timeoutMs, options.headers);
  const result = await probeMediaDuration(source, options);
  return { ...result, bytesRead: result.bytesRead + initialBytesRead };
}

async function createUrlSource(url: URL, fetchImplementation: typeof globalThis.fetch, timeoutMs: number, headers: Readonly<Record<string, string>> = {}): Promise<{ source: ByteSource; initialBytesRead: number }> {
  let knownSize: number | undefined;
  const read = async (start: number, end: number): Promise<Uint8Array> => {
    const response = await fetchImplementation(url, {
      headers: { ...headers, Range: `bytes=${start}-${end - 1}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status !== 206) throw new MediaProbeError('RANGE_NOT_SUPPORTED', `Server returned HTTP ${response.status} instead of 206`);
    const contentRange = parseContentRange(response.headers.get('content-range'));
    if (contentRange.start !== start || contentRange.end !== end - 1) throw new MediaProbeError('INVALID_RANGE_RESPONSE', 'Content-Range does not match the requested range');
    if (knownSize !== undefined && knownSize !== contentRange.size) throw new MediaProbeError('INVALID_RANGE_RESPONSE', 'Remote file size changed between requests');
    knownSize = contentRange.size;
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength !== end - start) throw new MediaProbeError('INVALID_RANGE_RESPONSE', 'Response body length does not match Content-Range');
    return buffer;
  };
  const firstResponse = await fetchImplementation(url, {
    headers: { ...headers, Range: 'bytes=0-7' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (firstResponse.status !== 206) throw new MediaProbeError('RANGE_NOT_SUPPORTED', `Server returned HTTP ${firstResponse.status} instead of 206`);
  const firstRange = parseContentRange(firstResponse.headers.get('content-range'));
  knownSize = firstRange.size;
  const firstBytes = new Uint8Array(await firstResponse.arrayBuffer());
  if (firstRange.start !== 0 || firstRange.end !== 7 || firstBytes.byteLength !== 8) throw new MediaProbeError('INVALID_RANGE_RESPONSE', 'Invalid initial range response');
  return {
    initialBytesRead: firstBytes.byteLength,
    source: {
      size: knownSize,
      async read(start: number, end: number): Promise<Uint8Array> {
        if (start === 0 && end === 8) return firstBytes;
        return read(start, end);
      },
    },
  };
}

function parseContentRange(value: string | null): { start: number; end: number; size: number } {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(value ?? '');
  if (!match) throw new MediaProbeError('INVALID_RANGE_RESPONSE', 'Missing or invalid Content-Range header');
  const start = Number(match[1]);
  const end = Number(match[2]);
  const size = Number(match[3]);
  if (![start, end, size].every(Number.isSafeInteger) || start > end || end >= size) throw new MediaProbeError('INVALID_RANGE_RESPONSE', 'Invalid Content-Range values');
  return { start, end, size };
}
