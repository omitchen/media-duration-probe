import { describe, expect, it } from 'vitest';
import { MediaProbeError, createBufferSource, probeMediaDuration } from '../src/index.js';

function u32(value: number): number[] {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

function box(name: string, payload: number[]): number[] {
  const size = 8 + payload.length;
  return [...u32(size), ...Array.from(name).map(character => character.charCodeAt(0)), ...payload];
}

function createMvhd(timescale = 1_000, duration = 12_500): number[] {
  return box('mvhd', [0, 0, 0, 0, ...u32(0), ...u32(0), ...u32(timescale), ...u32(duration)]);
}

function createMedia(moovAtEnd = false): Uint8Array {
  const ftyp = box('ftyp', [0, 0, 0, 0]);
  const moov = box('moov', createMvhd());
  const mdat = box('mdat', new Array(64).fill(1));
  return new Uint8Array(moovAtEnd ? [...ftyp, ...mdat, ...moov] : [...ftyp, ...moov, ...mdat]);
}

describe('probeMediaDuration', () => {
  it('reads an mvhd version 0 duration from a head moov box', async () => {
    const result = await probeMediaDuration(createBufferSource(createMedia()), { headSize: 32 });
    expect(result.durationSeconds).toBe(12.5);
    expect(result.timescale).toBe(1_000);
    expect(result.moovPosition).toBe('head');
    expect(result.container).toBe('iso-bmff');
  });

  it('finds a moov box after mdat', async () => {
    const media = createMedia(true);
    const result = await probeMediaDuration(createBufferSource(media), { headSize: 16 });
    expect(result.durationSeconds).toBe(12.5);
    expect(result.moovPosition).toBe('tail');
    expect(result.bytesRead).toBeLessThan(media.byteLength);
  });

  it('rejects a zero timescale', async () => {
    const media = new Uint8Array(box('moov', createMvhd(0, 100)));
    await expect(probeMediaDuration(createBufferSource(media))).rejects.toMatchObject({ code: 'INVALID_BOX' } satisfies Partial<MediaProbeError>);
  });

  it('rejects fragmented media', async () => {
    const media = new Uint8Array([...box('ftyp', []), ...box('moof', [])]);
    await expect(probeMediaDuration(createBufferSource(media))).rejects.toMatchObject({ code: 'FRAGMENTED_MEDIA' } satisfies Partial<MediaProbeError>);
  });
});
