import Anthropic from '@anthropic-ai/sdk';
import { logProgress, logDone } from '../utils.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Step 1 — Uses Claude to crystallise a story premise and design 4-6 characters.
 * Returns: { premise, characters: [{ name, role, storyRole, description, personality }] }
 */
export async function generateCharacters(_replicate, userIdea, style) {
  logProgress('Designing characters and story premise with Claude...');

  const styleBlock = style
    ? `\nCHARACTER ART STYLE DIRECTIVE (must be reflected in every description):\n${style.characterPrompt}\n`
    : '';

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1800,
    messages: [{
      role: 'user',
      content: `A user wants a comic book about: "${userIdea}"
${styleBlock}
Your job is to:
1. Write a tight STORY PREMISE — the actual narrative spine (2-3 sentences: who wants what, what stands in the way, what is at stake).
2. Design 4 to 6 characters who each play a SPECIFIC ROLE in that premise, drawn in the style directive above.

Return ONLY valid JSON — no other text.

{
  "premise": "2-3 sentence story arc. Specific: who, wants what, obstacle, stakes.",
  "characters": [
    {
      "name": "Short memorable first name",
      "role": "hero | villain | sidekick | mentor | comic-relief | antagonist",
      "storyRole": "What THIS character specifically does in the premise (1 sentence)",
      "description": "Vivid physical appearance in the given art style: body type, species if non-human, distinctive features, clothing colors, accessories. Must reflect the style directive.",
      "personality": "2-3 words"
    }
  ]
}

Rules:
- premise must drive ALL character choices — every character must serve the story
- 4 to 6 characters, each visually VERY different (size, color, silhouette, species)
- storyRole must be concrete, not generic
- description is appearance ONLY
- descriptions MUST match the art style directive`,
    }],
    system: 'You are a comic book story editor and character designer. Output ONLY valid JSON.',
  });

  const text = message.content[0].text;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Could not parse characters JSON:\n' + text);

  const result = JSON.parse(match[0]);
  logDone();

  console.log(`\n  Premise: ${result.premise}`);
  console.log('\n  Characters:');
  result.characters.forEach((c) => {
    console.log(`    • ${c.name} (${c.role}) — ${c.storyRole}`);
  });

  return { premise: result.premise, characters: result.characters };
}
