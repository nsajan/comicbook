import fs from 'fs';
import path from 'path';

export async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Exponential backoff with full jitter — safe for parallel callers.
// Jitter prevents the "thundering herd": when 7 panels all hit a 429
// simultaneously, they each wait a different random amount so they
// don't all retry at the same instant and immediately 429 again.
export async function withRetry(fn, label = 'request', maxAttempts = 7) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      const is429 = err.message?.includes('429') || err.status === 429;
      const retryAfterMs = parseRetryAfter(err) ?? null;

      if (is429 && attempt < maxAttempts) {
        attempt++;
        // Base: retry_after hint OR exponential (10s, 20s, 40s…), cap at 90s
        const base = retryAfterMs ?? Math.min(10000 * 2 ** (attempt - 1), 90000);
        // Full jitter: random between 0 and base, avoids all retries firing together
        const wait = Math.floor(Math.random() * base) + base * 0.5;
        process.stdout.write(` [429 ${label} attempt ${attempt}/${maxAttempts}, wait ${(wait/1000).toFixed(1)}s]`);
        await sleep(wait);
      } else {
        throw err;
      }
    }
  }
}

function parseRetryAfter(err) {
  try {
    // Replicate embeds retry_after seconds in the error message JSON
    const match = err.message?.match(/"retry_after"\s*:\s*(\d+)/);
    if (match) return parseInt(match[1], 10) * 1000;
  } catch (_) {}
  return null;
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

export function toReplicateUrl(output) {
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) return String(output[0]);
  return String(output);
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
