import 'dotenv/config';
import Replicate from 'replicate';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import { exec } from 'child_process';

import { generateCharacters } from './pipeline/characters.js';
import { generateCharacterSheet } from './pipeline/refsheet.js';
import { generateStory } from './pipeline/story.js';
import { generatePanels } from './pipeline/panels.js';
import { generateHTML } from './pipeline/render.js';
import { log } from './utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Setup ──────────────────────────────────────────────────────────────────────

if (!process.env.REPLICATE_API_TOKEN) {
  console.error('Missing REPLICATE_API_TOKEN in .env');
  process.exit(1);
}

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

async function getUserInput() {
  const arg = process.argv.slice(2).join(' ').trim();
  if (arg) return arg;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question('Enter your comic book idea: ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ── Pipeline ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║     COMIC BOOK AI AGENT  v2          ║');
  console.log('╚══════════════════════════════════════╝\n');

  const userIdea = await getUserInput();
  if (!userIdea) { console.error('Please provide a comic book idea.'); process.exit(1); }

  console.log(`\nIdea: "${userIdea}"\n`);
  console.log('Pipeline: Characters → Reference Sheet → Story → Panels → Render\n');
  console.log('─'.repeat(50));

  // ── Step 1: Characters + premise ────────────────────────────────────────────
  log('1', 'Designing characters and locking story premise');
  const { premise, characters } = await generateCharacters(replicate, userIdea);
  console.log(`\n  Premise: ${premise}`);

  // ── Step 2: Character Reference Sheet ──────────────────────────────────────
  log('2', 'Generating character reference sheet (nano-banana)');
  const { url: refImageUrl, localPath: refSheetPath } = await generateCharacterSheet(replicate, characters);
  console.log(`  Reference image URL: ${refImageUrl}`);

  // ── Step 3: Story ───────────────────────────────────────────────────────────
  log('3', 'Writing the story from premise');
  const story = await generateStory(replicate, premise, characters);

  // ── Step 4: Panel Images ────────────────────────────────────────────────────
  log('4', 'Generating 7 panels with nano-banana (using character reference)');
  const panels = await generatePanels(replicate, story, characters, refImageUrl);

  // ── Step 5: Render HTML ─────────────────────────────────────────────────────
  log('5', 'Rendering comic book HTML');
  const html = generateHTML(story, characters, refSheetPath, panels);

  const outputPath = path.join(__dirname, 'comic.html');
  fs.writeFileSync(outputPath, html);

  console.log('\n' + '═'.repeat(50));
  console.log(`  Comic saved: ${outputPath}`);
  console.log('  Opening in browser...');
  console.log('═'.repeat(50) + '\n');

  exec(`open "${outputPath}"`);
}

main().catch((err) => {
  console.error('\n[Error]', err.message);
  process.exit(1);
});
