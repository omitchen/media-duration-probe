import { MediaProbeError } from './errors.js';
import type { ByteSource, MediaDurationResult, ProbeOptions } from './types.js';

interface AtomInfo {
  readonly name: string;
  readonly size: number;
  readonly headerLength: number;
}

interface AtomLocation {
  readonly start: number;
  readonly size: number;
  readonly position: 'head' | 'tail';
}

interface MvhdInfo {
  readonly durationSeconds: number;
  readonly timescale: number;
}

const DEFAULT_HEAD_SIZE = 2048;
const DEFAULT_MOOV_PREVIEW_SIZE = 1024;
const DEFAULT_MAX_MOOV_SIZE = 16 * 1024 * 1024;
const ATOM_HEADER_SIZE = 8;
const EXTENDED_ATOM_HEADER_SIZE = 16;
const WORD_SIZE = 4;
const MOOV_ATOM = 'moov';
const MDAT_ATOM = 'mdat';
const MOOF_ATOM = 'moof';
const MVHD_ATOM = 'mvhd';

class CountingSource implements ByteSource {
  readonly size: number;
  bytesRead = 0;
  constructor(private readonly source: ByteSource) {
    this.size = source.size;
  }
  async read(start: number, end: number): Promise<Uint8Array> {
    const buffer = await this.source.read(start, end);
    const expectedLength = end - start;
    if (buffer.byteLength !== expectedLength) {
      throw new MediaProbeError('INVALID_SOURCE', `Source returned ${buffer.byteLength} bytes; expected ${expectedLength}`);
    }
    this.bytesRead += buffer.byteLength;
    return buffer;
  }
}

/** Probes duration from any finite random-access byte source. */
export async function probeMediaDuration(source: ByteSource, options: ProbeOptions = {}): Promise<MediaDurationResult> {
  validateSource(source);
  const headSize = readPositiveInteger(options.headSize, DEFAULT_HEAD_SIZE, 'headSize');
  const previewSize = readPositiveInteger(options.moovPreviewSize, DEFAULT_MOOV_PREVIEW_SIZE, 'moovPreviewSize');
  const maxMoovSize = readPositiveInteger(options.maxMoovSize, DEFAULT_MAX_MOOV_SIZE, 'maxMoovSize');
  const countingSource = new CountingSource(source);
  const head = await countingSource.read(0, Math.min(headSize, source.size));
  const moov = await locateMoov(countingSource, head);
  if (moov.size > maxMoovSize) {
    throw new MediaProbeError('MOOV_TOO_LARGE', `moov box is ${moov.size} bytes; maximum is ${maxMoovSize}`);
  }
  const preview = await readAtomBytes(countingSource, head, moov, Math.min(previewSize, moov.size));
  let movieHeader: MvhdInfo;
  try {
    movieHeader = parseMvhd(preview);
  } catch (error) {
    if (!(error instanceof MediaProbeError) || error.code !== 'INVALID_BOX' || preview.byteLength === moov.size) throw error;
    const fullMoov = await readAtomBytes(countingSource, head, moov, moov.size);
    movieHeader = parseMvhd(fullMoov);
  }
  return {
    durationSeconds: movieHeader.durationSeconds,
    timescale: movieHeader.timescale,
    fileSize: source.size,
    bytesRead: countingSource.bytesRead,
    container: 'iso-bmff',
    moovPosition: moov.position,
  };
}

function validateSource(source: ByteSource): void {
  if (!Number.isSafeInteger(source.size) || source.size < ATOM_HEADER_SIZE) {
    throw new MediaProbeError('INVALID_SOURCE', 'Source size must be a safe integer of at least 8 bytes');
  }
}

function readPositiveInteger(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new MediaProbeError('INVALID_ARGUMENT', `${name} must be a positive safe integer`);
  }
  return resolved;
}

async function locateMoov(source: ByteSource, head: Uint8Array): Promise<AtomLocation> {
  let offset = 0;
  while (offset + ATOM_HEADER_SIZE <= head.byteLength) {
    const atom = readAtomInfo(head, offset, source.size - offset);
    if (atom.name === MOOV_ATOM) return { start: offset, size: atom.size, position: 'head' };
    ensureNotFragmented(atom.name);
    if (atom.name === MDAT_ATOM) return locateMoovAfter(source, offset + atom.size);
    if (offset + atom.size > head.byteLength) return locateMoovAfter(source, offset + atom.size);
    offset += atom.size;
  }
  if (offset + ATOM_HEADER_SIZE <= source.size) return locateMoovAfter(source, offset);
  throw new MediaProbeError('UNSUPPORTED_FORMAT', 'moov box was not found');
}

async function locateMoovAfter(source: ByteSource, start: number): Promise<AtomLocation> {
  let offset = start;
  while (offset + ATOM_HEADER_SIZE <= source.size) {
    const end = Math.min(offset + EXTENDED_ATOM_HEADER_SIZE, source.size);
    const buffer = await source.read(offset, end);
    const atom = readAtomInfo(buffer, 0, source.size - offset);
    if (atom.name === MOOV_ATOM) return { start: offset, size: atom.size, position: 'tail' };
    ensureNotFragmented(atom.name);
    offset += atom.size;
  }
  throw new MediaProbeError('UNSUPPORTED_FORMAT', 'moov box was not found');
}

function ensureNotFragmented(name: string): void {
  if (name === MOOF_ATOM) {
    throw new MediaProbeError('FRAGMENTED_MEDIA', 'Fragmented ISO-BMFF media is not supported');
  }
}

async function readAtomBytes(source: ByteSource, head: Uint8Array, atom: AtomLocation, length: number): Promise<Uint8Array> {
  const end = atom.start + length;
  if (end <= head.byteLength) return head.subarray(atom.start, end);
  return source.read(atom.start, end);
}

function parseMvhd(moov: Uint8Array): MvhdInfo {
  const moovInfo = readAtomInfo(moov, 0, moov.byteLength);
  if (moovInfo.name !== MOOV_ATOM) throw new MediaProbeError('INVALID_BOX', 'Expected a moov box');
  let offset = moovInfo.headerLength;
  while (offset + ATOM_HEADER_SIZE <= moov.byteLength) {
    const atom = readAtomInfo(moov, offset, moov.byteLength - offset, true);
    if (atom.name === MVHD_ATOM) return parseMvhdBox(moov, offset, atom);
    if (offset + atom.size > moov.byteLength) break;
    offset += atom.size;
  }
  throw new MediaProbeError('INVALID_BOX', 'mvhd box was not found in the available moov bytes');
}

function parseMvhdBox(buffer: Uint8Array, offset: number, atom: AtomInfo): MvhdInfo {
  const payloadOffset = offset + atom.headerLength;
  requireBytes(buffer, payloadOffset, 4);
  const version = buffer[payloadOffset];
  if (version !== 0 && version !== 1) throw new MediaProbeError('INVALID_BOX', `Unsupported mvhd version: ${version}`);
  const timescaleOffset = payloadOffset + (version === 1 ? 20 : 12);
  const durationOffset = payloadOffset + (version === 1 ? 24 : 16);
  requireBytes(buffer, durationOffset, version === 1 ? 8 : 4);
  const timescale = readU32(buffer, timescaleOffset);
  if (timescale === 0) throw new MediaProbeError('INVALID_BOX', 'mvhd timescale must be greater than zero');
  const rawDuration = version === 1 ? readU64(buffer, durationOffset) : readU32(buffer, durationOffset);
  const durationSeconds = rawDuration / timescale;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new MediaProbeError('FRAGMENTED_MEDIA', 'mvhd duration is zero or invalid');
  }
  return { durationSeconds, timescale };
}

function readAtomInfo(buffer: Uint8Array, offset: number, remainingSourceBytes: number, allowIncomplete = false): AtomInfo {
  requireBytes(buffer, offset, ATOM_HEADER_SIZE);
  const sizeField = readU32(buffer, offset);
  const headerLength = sizeField === 1 ? EXTENDED_ATOM_HEADER_SIZE : ATOM_HEADER_SIZE;
  if (headerLength === EXTENDED_ATOM_HEADER_SIZE) requireBytes(buffer, offset, headerLength);
  const size = sizeField === 0 ? remainingSourceBytes : sizeField === 1 ? readU64(buffer, offset + ATOM_HEADER_SIZE) : sizeField;
  if (!Number.isSafeInteger(size) || size < headerLength || (!allowIncomplete && size > remainingSourceBytes)) {
    throw new MediaProbeError('INVALID_BOX', `Invalid ${readAtomName(buffer, offset)} box size: ${size}`);
  }
  return { name: readAtomName(buffer, offset), size, headerLength };
}

function requireBytes(buffer: Uint8Array, offset: number, length: number): void {
  if (offset < 0 || offset + length > buffer.byteLength) {
    throw new MediaProbeError('INVALID_BOX', 'Media box is truncated');
  }
}

function readAtomName(buffer: Uint8Array, offset: number): string {
  return String.fromCharCode(...buffer.subarray(offset + 4, offset + 8));
}

function readU32(buffer: Uint8Array, offset: number): number {
  requireBytes(buffer, offset, 4);
  return ((buffer[offset]! << 24) | (buffer[offset + 1]! << 16) | (buffer[offset + 2]! << 8) | buffer[offset + 3]!) >>> 0;
}

function readU64(buffer: Uint8Array, offset: number): number {
  const value = (BigInt(readU32(buffer, offset)) << 32n) | BigInt(readU32(buffer, offset + WORD_SIZE));
  const numberValue = Number(value);
  if (!Number.isSafeInteger(numberValue)) throw new MediaProbeError('INVALID_BOX', '64-bit value exceeds JavaScript safe integer range');
  return numberValue;
}
