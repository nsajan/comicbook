import { GoogleGenAI } from '@google/genai';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { withRetry, logProgress, logDone } from '../utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * Step 2 — Generate a character reference sheet image using Google Imagen.
 * All characters in one image, labeled, clean background.
 * Returns: { url, localPath }
 */
export async function generateCharacterSheet(_unused, characters, style) {
  logProgress('Generating character reference sheet with Google Imagen...');

  const charList = characters
    .map((c) => `${c.name}: ${c.description}`)
    .join('\n');

  const imageStyle = style?.imageStyle ??
    'Cinematic 3D animation style, Pixar aesthetic, vibrant saturated colors, thick bold black ink outlines, cel-shaded, high detail';

  const prompt =
    `Character reference sheet. ${characters.length} characters standing in a row, each clearly labeled with their name below them. ` +
    `Full body, white background, no overlapping. Characters:\n${charList}\n` +
    `${imageStyle}, clean character designs, reference sheet layout.`;

  const response = await withRetry(() =>
    genai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt,
      config: { numberOfImages: 1 },
    })
  , 'character sheet');

  const imgData = response.generatedImages?.[0]?.image?.imageBytes;
  if (!imgData) throw new Error('No image generated for character sheet');

  // Save locally
  const panelsDir = path.join(__dirname, '..', 'panels');
  if (!fs.existsSync(panelsDir)) fs.mkdirSync(panelsDir, { recursive: true });
  const localPath = path.join(panelsDir, 'character-sheet.png');
  fs.writeFileSync(localPath, Buffer.from(imgData, 'base64'));

  const dataUrl = `data:image/png;base64,${imgData}`;

  logDone();
  return { url: dataUrl, localPath: 'panels/character-sheet.png' };
}
