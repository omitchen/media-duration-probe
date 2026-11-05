import { resolve } from 'node:path';
import { MediaProbeError, probeMediaDurationFromUrl } from '../src/index.js';
import { probeMediaDurationFromPath } from '../src/node.js';
import type { MediaDurationResult } from '../src/types.js';

async function probeInput(input: string): Promise<MediaDurationResult> {
  if (/^https?:\/\//i.test(input)) return probeMediaDurationFromUrl(input);
  return probeMediaDurationFromPath(resolve(input));
}

async function executeProbe(): Promise<void> {
  const input = process.argv.slice(2).find(argument => argument !== '--');
  if (!input) {
    console.error('Usage: pnpm probe -- <file-path-or-url>');
    process.exitCode = 1;
    return;
  }
  try {
    const result = await probeInput(input);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    if (error instanceof MediaProbeError) {
      console.error(`${error.code}: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

await executeProbe();
