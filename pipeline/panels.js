import { GoogleGenAI } from '@google/genai';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { withRetry, logProgress, logDone } from '../utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * Build the character identity block for the prompt.
 */
function buildCharacterBlock(characters) {
  return characters
    .map((c) => `${c.name} is ${c.description}.`)
    .join('\n');
}

/**
 * Build speech bubble instructions from structured data.
 */
function buildSpeechBubbleBlock(speechBubbles, caption) {
  const lines = [];

  speechBubbles.forEach((bubble, i) => {
    const borderStyle = 'White comic speech bubble with thick black border';
    const fontDesc = i === 0
      ? 'soft small bold black comic font inside'
      : 'bold black comic font inside';

    if (bubble.bubble_type === 'thought') {
      lines.push(
        `White thought cloud bubble with thick black border pointing to ${bubble.character}, ${fontDesc} reads: "${bubble.text}"`
      );
    } else if (bubble.bubble_type === 'shout') {
      lines.push(
        `Jagged yellow explosion speech bubble with thick black border pointing to ${bubble.character}, large bold black comic font inside reads: "${bubble.text}"`
      );
    } else {
      const position = i > 0 ? `, ${i === 1 ? 'second' : 'third'} bubble below` : '';
      lines.push(
        `${borderStyle} pointing to ${bubble.character}${position}, ${fontDesc} reads: "${bubble.text}"`
      );
    }
  });

  if (caption) {
    lines.push(
      `Black caption box at bottom of panel, white bold text inside reads: "${caption}"`
    );
  }

  return lines.join('\n');
}

/**
 * Generate a single panel image using Gemini with reference image.
 */
async function generatePanelImage(scene, characters, refImageUrl, imageStyle, mood) {
  const charBlock = buildCharacterBlock(characters);
  const bubbleBlock = buildSpeechBubbleBlock(scene.speech_bubbles || [], scene.caption);

  const prompt = [
    `Use the attached reference image for all characters.`,
    charBlock,
    `Keep all characters exactly as shown in the reference.`,
    ``,
    `SCENE: ${scene.scene}`,
    ``,
    bubbleBlock ? `SPEECH BUBBLES: ${bubbleBlock}` : '',
    ``,
    `${imageStyle}, ${scene.lighting || mood}, clean white speech bubbles with bold black rounded borders, bold readable uppercase comic font inside all bubbles.`,
  ].filter(Boolean).join('\n');

  // Build content parts with reference image
  const parts = [];

  if (refImageUrl) {
    let imgBase64;
    if (refImageUrl.startsWith('data:')) {
      imgBase64 = refImageUrl.split(',')[1];
    } else {
      const imgRes = await fetch(refImageUrl);
      const imgBuf = Buffer.from(await imgRes.arrayBuffer());
      imgBase64 = imgBuf.toString('base64');
    }
    parts.push({
      inlineData: { mimeType: 'image/png', data: imgBase64 },
    });
  }

  parts.push({ text: prompt });

  const response = await withRetry(() =>
    genai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: [{ role: 'user', parts }],
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
        responseMimeType: 'text/plain',
      },
    })
  , `panel ${scene.panel}`);

  // Extract image from response
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return part.inlineData.data;
    }
  }

  // Fallback: Imagen without reference
  const imagenResponse = await withRetry(() =>
    genai.models.generateImages({
      model: 'imagen-3.0-generate-001',
      prompt,
      config: { numberOfImages: 1 },
    })
  , `panel ${scene.panel} imagen`);

  if (imagenResponse.generatedImages?.[0]?.image?.imageBytes) {
    return imagenResponse.generatedImages[0].image.imageBytes;
  }

  throw new Error(`No image generated for panel ${scene.panel}`);
}

/**
 * Step 4 — Generate all 7 panel images using Google GenAI.
 * Sends character reference sheet image with every panel prompt.
 */
export async function generatePanels(_unused, story, characters, refImageUrl, style) {
  console.log('  Generating all 7 panels in parallel...');

  const imageStyle = style?.imageStyle ??
    'Cinematic 3D comic book art style, Pixar-meets-graphic-novel aesthetic, thick bold ink outlines, cel-shaded characters';

  const panelsDir = path.join(__dirname, '..', 'panels');
  if (!fs.existsSync(panelsDir)) fs.mkdirSync(panelsDir, { recursive: true });

  const results = await Promise.all(
    story.story.map(async (scene) => {
      logProgress(`Panel ${scene.panel} starting...`);

      const imgBase64 = await generatePanelImage(scene, characters, refImageUrl, imageStyle, story.mood);

      const localPath = path.join(panelsDir, `panel-${scene.panel}.png`);
      fs.writeFileSync(localPath, Buffer.from(imgBase64, 'base64'));

      logDone();
      return { ...scene, localPath: `panels/panel-${scene.panel}.png` };
    })
  );

  return results.sort((a, b) => a.panel - b.panel);
}
