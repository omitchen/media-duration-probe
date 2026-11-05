import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { probeMediaDurationFromUrl } from '../src/index.js';

let media: Uint8Array;

beforeAll(async () => {
  media = new Uint8Array(await readFile(new URL('fixtures/head-moov.mp4', import.meta.url)));
});

function createRangeFetch(): typeof globalThis.fetch {
  return vi.fn(async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const range = new Headers(init?.headers).get('range');
    const match = /^bytes=(\d+)-(\d+)$/.exec(range ?? '');
    if (!match) return new Response(null, { status: 400 });
    const start = Number(match[1]);
    const end = Math.min(Number(match[2]), media.byteLength - 1);
    const body = media.slice(start, end + 1).buffer;
    return new Response(body, {
      status: 206,
      headers: { 'Content-Range': `bytes ${start}-${end}/${media.byteLength}` },
    });
  }) as typeof globalThis.fetch;
}

describe('probeMediaDurationFromUrl', () => {
  it('probes media through validated HTTP range responses', async () => {
    const fetchMock = createRangeFetch();
    const result = await probeMediaDurationFromUrl('https://example.com/media.mp4', {
      fetch: fetchMock,
      headSize: 64,
    });
    expect(result.durationSeconds).toBe(1);
    expect(result.bytesRead).toBeLessThan(result.fileSize);
    expect(fetchMock).toHaveBeenCalled();
  });

  it('rejects servers that ignore range requests', async () => {
    const fetchMock = vi.fn(async (): Promise<Response> => new Response(media.slice().buffer as ArrayBuffer, { status: 200 })) as typeof globalThis.fetch;
    await expect(probeMediaDurationFromUrl('https://example.com/media.mp4', { fetch: fetchMock })).rejects.toMatchObject({
      code: 'RANGE_NOT_SUPPORTED',
    });
  });

  it('rejects an invalid Content-Range response', async () => {
    const fetchMock = vi.fn(async (): Promise<Response> => new Response(media.slice(0, 8).buffer, {
      status: 206,
      headers: { 'Content-Range': `bytes 1-8/${media.byteLength}` },
    })) as typeof globalThis.fetch;
    await expect(probeMediaDurationFromUrl('https://example.com/media.mp4', { fetch: fetchMock })).rejects.toMatchObject({
      code: 'INVALID_RANGE_RESPONSE',
    });
  });
});
