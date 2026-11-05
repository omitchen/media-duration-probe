/** A finite, randomly readable media source. End offsets are exclusive. */
export interface ByteSource {
  readonly size: number;
  read(start: number, end: number): Promise<Uint8Array>;
}

/** Options shared by all ISO-BMFF probes. */
export interface ProbeOptions {
  /** Number of bytes inspected at the start of the source. Default: 2048. */
  readonly headSize?: number;
  /** Initial number of bytes inspected from the moov box. Default: 1024. */
  readonly moovPreviewSize?: number;
  /** Maximum accepted moov box size. Default: 16 MiB. */
  readonly maxMoovSize?: number;
}

/** Metadata resolved from an ISO-BMFF movie header. */
export interface MediaDurationResult {
  readonly durationSeconds: number;
  readonly timescale: number;
  readonly fileSize: number;
  readonly bytesRead: number;
  readonly container: 'iso-bmff';
  readonly moovPosition: 'head' | 'tail';
}

/** Options used when probing an HTTP URL. */
export interface UrlProbeOptions extends ProbeOptions {
  /** Request timeout in milliseconds. Default: 15000. */
  readonly timeoutMs?: number;
  /** Fetch implementation, useful for custom runtimes and tests. */
  readonly fetch?: typeof globalThis.fetch;
  /** Additional request headers. Range is controlled by the library. */
  readonly headers?: Readonly<Record<string, string>>;
}
