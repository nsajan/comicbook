import fs from 'fs';
import path from 'path';

export async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Light retry — Google API rarely 429s, so keep it fast.
// 3 attempts max, short waits (1s, 2s, 4s).
export async function withRetry(fn, label = 'request', maxAttempts = 3) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      const isRetryable = err.message?.includes('429') || err.status === 429
        || err.message?.includes('503') || err.status === 503
        || err.message?.includes('RESOURCE_EXHAUSTED');

      if (isRetryable && attempt < maxAttempts) {
        attempt++;
        const wait = 1000 * 2 ** (attempt - 1); // 1s, 2s, 4s
        process.stdout.write(` [retry ${label} ${attempt}/${maxAttempts}, ${(wait/1000).toFixed(0)}s]`);
        await sleep(wait);
      } else {
        throw err;
      }
    }
  }
}

export async function downloadImage(url, destPath) {
  const dir = path.dirname(destPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download image: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buf);
  return destPath;
}

export function log(step, msg) {
  const icons = { '1': '💡', '2': '🎨', '3': '📖', '4': '🖼 ', '5': '✨' };
  const icon = icons[step] || '▸';
  console.log(`\n${icon} [Step ${step}] ${msg}`);
}

export function logProgress(msg) {
  process.stdout.write(`  ${msg}`);
}

export function logDone() {
  process.stdout.write(' ✓\n');
}
