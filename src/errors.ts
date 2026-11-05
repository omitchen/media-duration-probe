export type MediaProbeErrorCode =
  | 'INVALID_ARGUMENT'
  | 'INVALID_SOURCE'
  | 'INVALID_BOX'
  | 'UNSUPPORTED_FORMAT'
  | 'FRAGMENTED_MEDIA'
  | 'MOOV_TOO_LARGE'
  | 'RANGE_NOT_SUPPORTED'
  | 'INVALID_RANGE_RESPONSE';

/** An expected media probing failure with a stable machine-readable code. */
export class MediaProbeError extends Error {
  readonly code: MediaProbeErrorCode;
  constructor(code: MediaProbeErrorCode, message: string) {
    super(message);
    this.name = 'MediaProbeError';
    this.code = code;
  }
}
