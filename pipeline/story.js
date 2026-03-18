import Anthropic from '@anthropic-ai/sdk';
import { logProgress, logDone } from '../utils.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Step 3 — Uses Claude to write the 7-panel story, anchored to the shared premise.
 * Returns: { title, tagline, genre, mood, story: [{ panel, scene, speech_bubbles, caption, lighting }] }
 */
export async function generateStory(_replicate, premise, characters) {
  logProgress('Writing 7-panel story with Claude...');

  const charBlock = characters
    .map((c) => `${c.name} (${c.role}): ${c.storyRole}. Looks like: ${c.description}`)
    .join('\n');

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3500,
    messages: [{
      role: 'user',
      content: `STORY PREMISE:
${premise}

CHARACTERS (use ONLY these, no new characters):
${charBlock}

Write a 7-panel comic that directly executes the premise above.
Panel 1 = setup, Panel 4 = turning point / climax, Panel 7 = resolution.
Return ONLY valid JSON — no other text.

{
  "title": "Comic title that reflects the premise",
  "tagline": "Short punchy tagline",
  "genre": "genre",
  "mood": "overall visual mood (e.g. tense noir, vibrant adventure, hopeful dawn)",
  "story": [
    {
      "panel": 1,
      "scene": "Detailed visual scene: location, time of day, which characters are present, what they are doing, camera angle (wide shot / close-up / over-shoulder / bird's eye). Be very specific.",
      "speech_bubbles": [
        { "character": "Name", "text": "Short dialogue max 10 words", "bubble_type": "speech" }
      ],
      "caption": "Narrative caption (1 punchy sentence or empty string)",
      "lighting": "specific lighting for this panel"
    }
  ]
}

Rules:
- Exactly 7 panels — each must directly advance the PREMISE
- Every character used must be from the character list
- speech_bubbles: 1-3 per panel, max 10 words each, or empty array []
- bubble_type: "speech" | "thought" | "shout" | "whisper"
- Varied camera angles — don't repeat the same angle twice in a row`,
    }],
    system: 'You are a comic book writer. Output ONLY valid JSON.',
  });

  const text = message.content[0].text;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Could not parse story JSON:\n' + text);

  const result = JSON.parse(match[0]);
  logDone();

  console.log(`\n  Title: "${result.title}"`);
  console.log(`  Genre: ${result.genre} | Mood: ${result.mood}`);

  return result;
}
