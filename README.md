# media-duration-probe

Probe the duration of MP4, M4A, MOV, and related ISO-BMFF media without reading the entire file.

The package locates the `moov` box and parses its `mvhd` movie header. It works with remote URLs, browser `Blob`/`File` objects, in-memory bytes, and local Node.js files. It has no runtime dependencies.

## Install

```bash
pnpm add media-duration-probe
```

## Remote URL

The server must support HTTP range requests and return a valid `Content-Range` header.

```ts
import { probeMediaDurationFromUrl } from 'media-duration-probe';

const result = await probeMediaDurationFromUrl('https://example.com/audio.m4a');
console.log(result.durationSeconds);
console.log(result.bytesRead);
```

## Browser File or Blob

```ts
import { createBlobSource, probeMediaDuration } from 'media-duration-probe';

const result = await probeMediaDuration(createBlobSource(file));
```

## In-memory bytes

```ts
import { createBufferSource, probeMediaDuration } from 'media-duration-probe';

const result = await probeMediaDuration(createBufferSource(bytes));
```

## Node.js file

```ts
import { probeMediaDurationFromPath } from 'media-duration-probe/node';

const result = await probeMediaDurationFromPath('/path/to/video.mp4');
```

## Custom source

Implement `ByteSource` to read from object storage, a database, or another random-access medium. End offsets are exclusive.

```ts
import { probeMediaDuration, type ByteSource } from 'media-duration-probe';

const source: ByteSource = {
  size: 123456,
  async read(start, end) {
    return readMyStorage(start, end);
  },
};

const result = await probeMediaDuration(source);
```

## Current limitations

- Only ISO-BMFF containers are supported. MP3, WAV, FLAC, Ogg, and WebM require different parsers.
- Fragmented MP4 files are not supported because their `mvhd` duration is commonly zero and the effective duration is stored in fragment boxes such as `moof`/`trun`. The probe throws a `MediaProbeError` with code `FRAGMENTED_MEDIA` for these files.
- URL probing requires byte range support.
- When accepting user-controlled URLs on a server, validate them and block private networks and unsafe redirects to prevent SSRF. This library does not enforce an application-specific network policy.

## Tests

The test suite includes tiny real MP4 and M4A fixtures with head and tail `moov` layouts. Tests do not require FFmpeg. Maintainers can regenerate the fixtures with FFmpeg by running:

```bash
pnpm fixtures:generate
```

## Local development

Probe a local file or remote URL directly from the TypeScript source without building first:

```bash
pnpm probe -- ./test/fixtures/tail-moov.mp4
pnpm probe -- 'https://example.com/video.mp4?token=value&expires=123'
```

Always quote URLs in shell commands. Characters such as `?`, `&`, `*`, and `$` have special meanings in shells such as zsh and Bash.

A successful probe prints JSON:

```json
{
  "durationSeconds": 1,
  "timescale": 1000,
  "fileSize": 1830,
  "bytesRead": 1830,
  "container": "iso-bmff",
  "moovPosition": "head"
}
```

The included fragmented fixture is expected to fail:

```bash
pnpm probe -- ./test/fixtures/fragmented.mp4
```

```text
FRAGMENTED_MEDIA: mvhd duration is zero or invalid
```

The development CLI exits with status `1` when probing fails, so it can also be used in scripts and CI checks.

Use watch mode while changing the source. The probe reruns whenever an imported source file changes:

```bash
pnpm dev -- ./test/fixtures/tail-moov.mp4
```

## License

MIT
