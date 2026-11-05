import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createBlobSource, createBufferSource, probeMediaDuration } from '../src/index.js';
import { probeMediaDurationFromPath } from '../src/node.js';

const fixtureUrl = (name: string): URL => new URL(`fixtures/${name}`, import.meta.url);

describe('real ISO-BMFF fixtures', () => {
  it('probes an MP4 whose moov box is before mdat', async () => {
    const bytes = new Uint8Array(await readFile(fixtureUrl('head-moov.mp4')));
    const result = await probeMediaDuration(createBufferSource(bytes), { headSize: 64 });
    expect(result.durationSeconds).toBe(1);
    expect(result.moovPosition).toBe('head');
    expect(result.bytesRead).toBeLessThan(bytes.byteLength);
  });

  it('probes an MP4 whose moov box is after mdat', async () => {
    const path = fileURLToPath(fixtureUrl('tail-moov.mp4'));
    const result = await probeMediaDurationFromPath(path, { headSize: 64 });
    expect(result.durationSeconds).toBe(1);
    expect(result.moovPosition).toBe('tail');
    expect(result.bytesRead).toBeLessThan(result.fileSize);
  });

  it('probes an audio-only M4A through a Blob source', async () => {
    const bytes = await readFile(fixtureUrl('audio.m4a'));
    const result = await probeMediaDuration(createBlobSource(new Blob([bytes])), { headSize: 64 });
    expect(result.durationSeconds).toBe(1);
    expect(result.container).toBe('iso-bmff');
  });

  it('rejects a real fragmented MP4', async () => {
    const bytes = new Uint8Array(await readFile(fixtureUrl('fragmented.mp4')));
    await expect(probeMediaDuration(createBufferSource(bytes), { headSize: 64 })).rejects.toMatchObject({
      code: 'FRAGMENTED_MEDIA',
    });
  });
});
