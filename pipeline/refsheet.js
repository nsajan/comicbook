import path from 'path';
import { fileURLToPath } from 'url';
import { withRetry, downloadImage, logProgress, logDone } from '../utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Step 2 — Generate a character reference sheet image using nano-banana.
 * All characters in one image, labeled, clean background.
 * Returns: { url, localPath }
 */
export async function generateCharacterSheet(replicate, characters, style) {
  logProgress('Generating character reference sheet with nano-banana...');

  const charList = characters
    .map((c) => `${c.name}: ${c.description}`)
    .join('\n');

  const imageStyle = style?.imageStyle ??
    'Cinematic 3D animation style, Pixar aesthetic, vibrant saturated colors, thick bold black ink outlines, cel-shaded, high detail';

  const prompt =
    `Character reference sheet. ${characters.length} characters standing in a row, each clearly labeled with their name below them. ` +
    `Full body, white background, no overlapping. Characters:\n${charList}\n` +
    `${imageStyle}, clean character designs, reference sheet layout.`;

  const output = await withRetry(() =>
    replicate.run('google/nano-banana', {
      input: {
        prompt,
        aspect_ratio: '16:9',
        output_format: 'jpg',
      },
    })
  , 'character sheet');

  const url = typeof output === 'string' ? output : String(output);

  const localPath = path.join(__dirname, '..', 'panels', 'character-sheet.jpg');
  await downloadImage(url, localPath);

  logDone();
  return { url, localPath: 'panels/character-sheet.jpg' };
}
