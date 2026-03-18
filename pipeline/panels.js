import path from 'path';
import { fileURLToPath } from 'url';
import { withRetry, downloadImage, logProgress, logDone } from '../utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Build the character identity block for the prompt (matches the sample format).
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
 * Step 4 — Generate all 7 panel images using google/nano-banana.
 * Sends character reference sheet image with every panel prompt.
 */
export async function generatePanels(replicate, story, characters, refImageUrl, style) {
  console.log('  Generating all 7 panels in parallel...');

  const imageStyle = style?.imageStyle ??
    'Cinematic 3D comic book art style, Pixar-meets-graphic-novel aesthetic, thick bold ink outlines, cel-shaded characters';

  const results = await Promise.all(
    story.story.map(async (scene) => {
      logProgress(`Panel ${scene.panel} starting...`);

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
        `${imageStyle}, ${scene.lighting || story.mood}, clean white speech bubbles with bold black rounded borders, bold readable uppercase comic font inside all bubbles.`,
      ].filter(Boolean).join('\n');

      const output = await withRetry(() =>
        replicate.run('google/nano-banana', {
          input: { prompt, image_input: [refImageUrl], aspect_ratio: '4:3', output_format: 'jpg' },
        })
      , `panel ${scene.panel}`);

      const imageUrl = typeof output === 'string' ? output : String(output);
      const localPath = path.join(__dirname, '..', 'panels', `panel-${scene.panel}.jpg`);
      await downloadImage(imageUrl, localPath);

      logDone();
      return { ...scene, localPath: `panels/panel-${scene.panel}.jpg` };
    })
  );

  return results.sort((a, b) => a.panel - b.panel);
}
