import 'dotenv/config';
import express from 'express';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateCharacters } from './pipeline/characters.js';
import { generateStory } from './pipeline/story.js';
import { withRetry, sleep } from './utils.js';
import { STYLES, getStyle } from './styles.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// ── Persistent storage ────────────────────────────────────────────────────────
// Railway: mount a volume at /data. Locally falls back to ./data/
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'comics')
  : path.join(__dirname, 'data', 'comics');
fs.mkdirSync(DATA_DIR, { recursive: true });

function comicPath(id) { return path.join(DATA_DIR, `${id}.html`); }
function saveComic(id, html) { fs.writeFileSync(comicPath(id), html, 'utf8'); }
function loadComic(id) {
  try { return fs.readFileSync(comicPath(id), 'utf8'); } catch { return null; }
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── In-memory session store ───────────────────────────────────────────────────
// shape: { idea, style, characters, refImageUrl, story, panels, status }
const sessions = new Map();

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ── Shared HTML shell ─────────────────────────────────────────────────────────
function shell(title, body, extraHead = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title} — Comic Book AI</title>
  <link href="https://fonts.googleapis.com/css2?family=Bangers&family=Comic+Neue:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet"/>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --ink: #0d0d0d;
      --gold: #ffd700;
      --red: #e63946;
      --cream: #fffdf0;
      --bg: #12121e;
      --card: #1e1e30;
    }
    body { background: var(--bg); font-family: 'Comic Neue', cursive; color: #fff; min-height: 100vh; }
    a { color: var(--gold); text-decoration: none; }

    /* Nav */
    nav {
      display: flex; align-items: center; gap: 12px;
      padding: 14px 28px;
      border-bottom: 3px solid #222;
      background: #0d0d1a;
    }
    nav .logo {
      font-family: 'Bangers', cursive;
      font-size: 1.5rem; letter-spacing: 3px; color: var(--gold);
    }
    nav .logo span { color: var(--red); }

    /* Steps indicator */
    .steps {
      display: flex; gap: 0; align-items: center;
      padding: 0 28px; background: #0d0d1a;
      border-bottom: 3px solid #222;
      font-family: 'Bangers', cursive;
      font-size: .85rem; letter-spacing: 2px;
      overflow-x: auto;
    }
    .step-item {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 16px;
      color: #444;
      border-bottom: 3px solid transparent;
      margin-bottom: -3px;
      white-space: nowrap;
    }
    .step-item.active  { color: var(--gold); border-bottom-color: var(--gold); }
    .step-item.done    { color: #22c55e; }
    .step-num {
      width: 22px; height: 22px;
      border-radius: 50%;
      background: #333; color: #888;
      display: flex; align-items: center; justify-content: center;
      font-size: .75rem;
    }
    .step-item.active .step-num  { background: var(--gold); color: #000; }
    .step-item.done   .step-num  { background: #22c55e; color: #000; }
    .step-arrow { color: #333; padding: 0 4px; }

    /* Page body */
    .page { max-width: 960px; margin: 0 auto; padding: 48px 24px 80px; }

    /* Heading */
    .page-title {
      font-family: 'Bangers', cursive;
      font-size: clamp(2rem, 6vw, 3.5rem);
      color: var(--gold); letter-spacing: 3px;
      margin-bottom: 8px;
    }
    .page-sub { color: #888; font-size: .95rem; margin-bottom: 40px; }

    /* Buttons */
    .btn {
      display: inline-flex; align-items: center; gap: 8px;
      font-family: 'Bangers', cursive;
      font-size: 1.2rem; letter-spacing: 2px;
      padding: 12px 28px;
      border: 3px solid var(--ink);
      cursor: pointer;
      transition: transform .1s, box-shadow .1s;
      text-decoration: none;
    }
    .btn:hover   { transform: translate(-2px,-2px); box-shadow: 4px 4px 0 rgba(0,0,0,.5); }
    .btn:active  { transform: translate(1px,1px);  box-shadow: 1px 1px 0 rgba(0,0,0,.5); }
    .btn-primary { background: var(--red); color: #fff; box-shadow: 3px 3px 0 #000; }
    .btn-ghost   { background: transparent; color: #aaa; border-color: #444; }
    .btn-ghost:hover { color: #fff; border-color: #888; box-shadow: 4px 4px 0 rgba(255,255,255,.1); }
    .btn-green   { background: #16a34a; color: #fff; box-shadow: 3px 3px 0 #000; }

    /* Input */
    .input-wrap { position: relative; margin-bottom: 20px; }
    textarea, input[type=text] {
      width: 100%;
      background: #1e1e30;
      border: 3px solid #333;
      color: #fff;
      font-family: 'Comic Neue', cursive;
      font-size: 1.1rem;
      padding: 16px;
      outline: none;
      transition: border-color .2s;
    }
    textarea { height: 110px; resize: vertical; }
    textarea:focus, input:focus { border-color: var(--gold); }

    /* Chips */
    .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 28px; }
    .chip {
      background: #1e1e30; border: 2px solid #333;
      color: #aaa; font-size: .82rem;
      padding: 6px 14px; cursor: pointer;
      transition: all .15s;
    }
    .chip:hover { border-color: var(--gold); color: var(--gold); background: #2a2a1a; }

    /* Spinner */
    .spinner {
      display: inline-block;
      width: 18px; height: 18px;
      border: 3px solid #333;
      border-top-color: var(--gold);
      border-radius: 50%;
      animation: spin .7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Progress list */
    .progress-list { display: flex; flex-direction: column; gap: 12px; max-width: 500px; }
    .prog-item {
      display: flex; align-items: center; gap: 14px;
      background: var(--card); border: 2px solid #2a2a3e;
      padding: 14px 18px;
      transition: border-color .3s, background .3s;
    }
    .prog-item.active { border-color: var(--gold); background: #2a2a18; }
    .prog-item.done   { border-color: #22c55e;     background: #182a18; }
    .prog-item.error  { border-color: var(--red);  background: #2a1818; }
    .prog-icon { font-size: 1.4rem; width: 28px; text-align: center; flex-shrink: 0; }
    .prog-text { flex: 1; }
    .prog-label { font-weight: 700; font-size: .9rem; }
    .prog-sub   { font-size: .75rem; color: #666; margin-top: 2px; }
    .prog-item.active .prog-sub { color: #aaa; }
    .prog-item.done   .prog-sub { color: #4ade80; }
    .prog-status { flex-shrink: 0; }

    /* Character card grid */
    .char-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 16px;
      margin: 28px 0;
    }
    .char-card {
      background: var(--card);
      border: 3px solid #2a2a3e;
      padding: 18px;
      transition: border-color .2s, transform .2s;
    }
    .char-card:hover { border-color: var(--gold); transform: translateY(-3px); }
    .char-role {
      font-size: .7rem; text-transform: uppercase;
      letter-spacing: 2px; color: var(--red);
      margin-bottom: 4px; font-weight: 700;
    }
    .char-name {
      font-family: 'Bangers', cursive;
      font-size: 1.6rem; letter-spacing: 1px;
      color: var(--gold); margin-bottom: 8px;
    }
    .char-personality {
      font-size: .75rem; color: #888;
      margin-bottom: 8px; font-style: italic;
    }
    .char-desc { font-size: .8rem; color: #bbb; line-height: 1.5; }

    /* Reference image */
    .ref-image-wrap {
      border: 4px solid #2a2a3e;
      margin-bottom: 28px;
      position: relative;
      overflow: hidden;
    }
    .ref-image-wrap img { width: 100%; display: block; }
    .ref-image-label {
      position: absolute; top: 0; left: 0;
      background: var(--red); color: #fff;
      font-family: 'Bangers', cursive;
      font-size: .85rem; letter-spacing: 2px;
      padding: 4px 12px;
    }

    /* Approval action bar */
    .action-bar {
      display: flex; gap: 16px; align-items: center;
      flex-wrap: wrap;
      padding: 24px;
      background: var(--card);
      border: 3px solid #2a2a3e;
      margin-top: 32px;
    }
    .action-bar p { color: #aaa; font-size: .9rem; flex: 1; min-width: 200px; }

    /* Comic grid */
    .comic-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
    }
    .comic-panel { background: #fff; border: 3px solid var(--ink); color: var(--ink); overflow: hidden; }
    .comic-panel:nth-child(4) { grid-column: 1 / -1; }
    .panel-header { background: var(--red); color: #fff; padding: 4px 12px; border-bottom: 3px solid var(--ink); }
    .panel-num { font-family: 'Bangers', cursive; font-size: .8rem; letter-spacing: 3px; }
    .panel-img img { width: 100%; display: block; border-bottom: 3px solid var(--ink); }
    .panel-body { padding: 12px 14px; background: #fffdf0; }
    .bubble {
      display: inline-block;
      background: #fff; border: 3px solid var(--ink);
      border-radius: 16px; padding: 6px 12px;
      font-weight: 700; font-size: .85rem;
      margin-bottom: 6px; max-width: 100%;
    }
    .bubble--shout   { background: #fff7a0; border-color: #e6a400; }
    .bubble--thought { border-radius: 40px; font-style: italic; }
    .caption { font-style: italic; font-size: .82rem; color: #555; line-height: 1.5; margin-top: 4px; }

    @media (max-width: 600px) {
      .comic-grid { grid-template-columns: 1fr; }
      .comic-panel:nth-child(4) { grid-column: 1; }
    }
  </style>
  ${extraHead}
</head>
<body>
  <nav>
    <a href="/" class="logo">COMIC<span>AI</span></a>
  </nav>
  ${body}
</body>
</html>`;
}

function stepsBar(active) {
  const steps = [
    { n: 1, label: 'Your Idea' },
    { n: 2, label: 'Meet the Cast' },
    { n: 3, label: 'Drawing Panels' },
    { n: 4, label: 'Your Comic' },
  ];
  const items = steps.map((s) => {
    const cls = s.n === active ? 'active' : s.n < active ? 'done' : '';
    const icon = s.n < active ? '✓' : s.n;
    return `<div class="step-item ${cls}"><div class="step-num">${icon}</div>${s.label}</div>
    ${s.n < steps.length ? '<span class="step-arrow">›</span>' : ''}`;
  }).join('');
  return `<div class="steps">${items}</div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — Landing / idea input
// ─────────────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  const styleCards = Object.values(STYLES).map(s => `
    <label class="style-card" for="style-${s.id}">
      <input type="radio" name="style" id="style-${s.id}" value="${s.id}" ${s.id === 'pixar' ? 'checked' : ''} />
      <div class="style-card-inner">
        <div class="style-emoji">${s.emoji}</div>
        <div class="style-label">${s.label}</div>
        <div class="style-desc">${s.description}</div>
      </div>
    </label>`).join('');

  res.send(shell('Your Idea', `
    ${stepsBar(1)}
    <div class="page" style="max-width:780px">
      <h1 class="page-title">WHAT'S YOUR STORY?</h1>
      <p class="page-sub">Pick a style, write your idea — we'll build the cast, get your approval, then draw your comic.</p>
      <form action="/start" method="POST">

        <div style="margin-bottom:28px">
          <div style="font-family:'Bangers',cursive;letter-spacing:3px;font-size:.9rem;color:#aaa;margin-bottom:14px">CHOOSE YOUR ART STYLE</div>
          <div class="style-grid">${styleCards}</div>
        </div>

        <div style="font-family:'Bangers',cursive;letter-spacing:3px;font-size:.9rem;color:#aaa;margin-bottom:10px">YOUR STORY IDEA</div>
        <div class="input-wrap">
          <textarea name="idea" id="idea" placeholder="e.g. A robot chef discovers their recipes grant superpowers to whoever eats them..." required></textarea>
        </div>
        <div class="chips">
          <span class="chip" onclick="setIdea(this)">Space explorer finds an ancient alien city on Mars</span>
          <span class="chip" onclick="setIdea(this)">Street artist whose graffiti comes alive at night</span>
          <span class="chip" onclick="setIdea(this)">A detective who talks to ghosts solves their own murder</span>
          <span class="chip" onclick="setIdea(this)">Kids discover their school is built on a dragon's nest</span>
        </div>
        <button type="submit" class="btn btn-primary">BUILD MY CHARACTERS →</button>
      </form>
    </div>
    <script>
      function setIdea(el) { document.getElementById('idea').value = el.innerText; }
    </script>
  `, `<style>
    .style-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 4px;
    }
    .style-card input[type=radio] { display: none; }
    .style-card-inner {
      background: var(--card);
      border: 3px solid #2a2a3e;
      padding: 16px 14px;
      cursor: pointer;
      transition: border-color .15s, background .15s, transform .15s;
      text-align: center;
      height: 100%;
    }
    .style-card input:checked + .style-card-inner {
      border-color: var(--gold);
      background: #2a2a18;
      transform: translateY(-2px);
    }
    .style-card-inner:hover { border-color: #666; }
    .style-emoji { font-size: 2rem; margin-bottom: 6px; }
    .style-label { font-family: 'Bangers', cursive; font-size: 1.1rem; letter-spacing: 2px; color: var(--gold); margin-bottom: 4px; }
    .style-desc  { font-size: .72rem; color: #888; line-height: 1.4; }
    @media (max-width: 540px) { .style-grid { grid-template-columns: repeat(2, 1fr); } }
  </style>`));
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2a — Start character generation
// ─────────────────────────────────────────────────────────────────────────────
app.post('/start', (req, res) => {
  const idea = (req.body.idea || '').trim();
  const style = getStyle(req.body.style);
  if (!idea) return res.redirect('/');
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  sessions.set(id, { idea, style, status: 'building_characters' });
  res.redirect(`/cast/${id}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2b — Cast page (shows spinner then characters for approval)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/cast/:id', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.redirect('/');
  const { id } = req.params;

  // Already approved / done? Skip forward
  if (session.status === 'generating_comic' || session.status === 'done') {
    return res.redirect(`/making/${id}`);
  }

  // Characters ready for approval
  if (session.status === 'cast_ready') {
    return res.redirect(`/approve/${id}`);
  }

  // Show loading page; SSE will redirect when ready
  res.send(shell('Building Your Cast', `
    ${stepsBar(2)}
    <div class="page" style="max-width:540px">
      <h1 class="page-title">BUILDING YOUR CAST</h1>
      <p class="page-sub" style="margin-bottom:32px">"${escHtml(session.idea)}"</p>
      <div class="progress-list" id="plist">
        <div class="prog-item" id="p1">
          <span class="prog-icon">💡</span>
          <div class="prog-text">
            <div class="prog-label">Designing Characters</div>
            <div class="prog-sub" id="p1s">Creating unique cast for your story…</div>
          </div>
          <div class="prog-status" id="p1i"></div>
        </div>
        <div class="prog-item" id="p2">
          <span class="prog-icon">🎨</span>
          <div class="prog-text">
            <div class="prog-label">Drawing Reference Sheet</div>
            <div class="prog-sub" id="p2s">Google Imagen renders your full cast</div>
          </div>
          <div class="prog-status" id="p2i"></div>
        </div>
      </div>
    </div>
    <script>
      const id = ${JSON.stringify(id)};
      const es = new EventSource('/cast-stream/' + id);

      function activate(n) {
        const el = document.getElementById('p'+n);
        el.classList.add('active');
        document.getElementById('p'+n+'i').innerHTML = '<div class="spinner"></div>';
      }
      function done(n, note) {
        const el = document.getElementById('p'+n);
        el.classList.remove('active'); el.classList.add('done');
        document.getElementById('p'+n+'i').innerHTML = '<span style="color:#22c55e;font-size:1.2rem">✓</span>';
        if (note) document.getElementById('p'+n+'s').textContent = note;
      }

      es.addEventListener('step',     e => activate(JSON.parse(e.data).step));
      es.addEventListener('stepdone', e => { const d = JSON.parse(e.data); done(d.step, d.note); });
      es.addEventListener('redirect', e => { es.close(); window.location.href = JSON.parse(e.data).url; });
      es.addEventListener('error_event', e => {
        const { msg } = JSON.parse(e.data);
        document.getElementById('plist').insertAdjacentHTML('beforeend',
          '<div style="color:#e63946;margin-top:16px;font-weight:700">Error: ' + msg + '</div>');
        es.close();
      });
    </script>
  `));
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2c — SSE: run character gen + ref sheet
// ─────────────────────────────────────────────────────────────────────────────
app.get('/cast-stream/:id', async (req, res) => {
  const { id } = req.params;
  const session = sessions.get(id);
  if (!session) { res.end(); return; }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sse = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  try {
    // Step 1: Characters + premise (one call, shared narrative anchor)
    sse('step', { step: 1 });
    const { premise, characters } = await generateCharacters(null, session.idea, session.style);
    session.premise = premise;
    session.characters = characters;
    sse('stepdone', { step: 1, note: `${characters.length} characters · premise locked` });

    // Step 2: Reference sheet
    sse('step', { step: 2 });
    const refImageUrl = await buildRefSheet(characters, session.style);
    session.refImageUrl = refImageUrl;
    session.status = 'cast_ready';
    sse('stepdone', { step: 2, note: 'Reference sheet drawn' });

    sse('redirect', { url: `/approve/${id}` });
  } catch (err) {
    console.error(err);
    sse('error_event', { msg: err.message });
  } finally {
    res.end();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2d — Approval page
// ─────────────────────────────────────────────────────────────────────────────
app.get('/approve/:id', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session || !session.characters) return res.redirect('/');
  const { id } = req.params;

  const charCards = session.characters.map(c => `
    <div class="char-card">
      <div class="char-role">${escHtml(c.role)}</div>
      <div class="char-name">${escHtml(c.name)}</div>
      <div class="char-personality">${escHtml(c.personality)}</div>
      <div style="font-size:.72rem;color:#e8a020;margin-bottom:6px;font-style:italic">${escHtml(c.storyRole || '')}</div>
      <div class="char-desc">${escHtml(c.description)}</div>
    </div>`).join('');

  res.send(shell('Meet Your Cast', `
    ${stepsBar(2)}
    <div class="page">
      <h1 class="page-title">MEET YOUR CAST</h1>

      <div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:24px;flex-wrap:wrap">
        <div style="background:#1e1e30;border-left:4px solid var(--gold);padding:16px 20px;flex:1;min-width:260px">
          <div style="font-size:.7rem;text-transform:uppercase;letter-spacing:3px;color:var(--gold);margin-bottom:6px;font-family:'Bangers',cursive">Story Premise</div>
          <p style="color:#ddd;font-size:.95rem;line-height:1.6">${escHtml(session.premise || '')}</p>
        </div>
        <div style="background:#1e1e30;border:3px solid #2a2a3e;padding:16px 20px;text-align:center;min-width:120px">
          <div style="font-size:2rem">${escHtml(session.style?.emoji || '🎬')}</div>
          <div style="font-family:'Bangers',cursive;font-size:1rem;letter-spacing:2px;color:var(--gold);margin-top:4px">${escHtml(session.style?.label || 'Pixar 3D')}</div>
          <div style="font-size:.7rem;color:#666;margin-top:4px">art style</div>
        </div>
      </div>

      <div class="ref-image-wrap">
        <span class="ref-image-label">CHARACTER REFERENCE SHEET</span>
        <img src="${escHtml(session.refImageUrl)}" alt="Character reference sheet" />
      </div>

      <div class="char-grid">${charCards}</div>

      <div class="action-bar">
        <p>These characters are built for this story. Approve to generate all 7 panels.</p>
        <a href="/start-over/${id}" class="btn btn-ghost">↺ New Characters</a>
        <form action="/generate/${id}" method="POST" style="margin:0">
          <button type="submit" class="btn btn-green">GENERATE MY COMIC →</button>
        </form>
      </div>
    </div>
  `));
});

// Regenerate — keep idea, redo characters
app.get('/start-over/:id', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.redirect('/');
  session.status = 'building_characters';
  session.characters = null;
  session.refImageUrl = null;
  res.redirect(`/cast/${req.params.id}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3a — Kick off comic generation after approval
// ─────────────────────────────────────────────────────────────────────────────
app.post('/generate/:id', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.redirect('/');
  session.status = 'generating_comic';
  res.redirect(`/making/${req.params.id}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3b — Making page (progress during panel generation)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/making/:id', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.redirect('/');
  const { id } = req.params;

  if (session.status === 'done' || loadComic(id)) return res.redirect(`/comic/${id}`);

  const panelItems = Array.from({ length: 7 }, (_, i) => `
    <div class="prog-item" id="pp${i+1}">
      <span class="prog-icon">🖼</span>
      <div class="prog-text">
        <div class="prog-label">Panel ${i+1}</div>
        <div class="prog-sub" id="pp${i+1}s">Waiting…</div>
      </div>
      <div class="prog-status" id="pp${i+1}i"></div>
    </div>`).join('');

  res.send(shell('Drawing Your Comic', `
    ${stepsBar(3)}
    <div class="page" style="max-width:580px">
      <h1 class="page-title">DRAWING YOUR COMIC</h1>
      <p class="page-sub" style="margin-bottom:32px">"${escHtml(session.idea)}"</p>

      <div class="progress-list" id="plist">
        <div class="prog-item" id="ps">
          <span class="prog-icon">📖</span>
          <div class="prog-text">
            <div class="prog-label">Writing the Story</div>
            <div class="prog-sub" id="pss">Scripting 7 panels with dialogue…</div>
          </div>
          <div class="prog-status" id="psi"></div>
        </div>
        ${panelItems}
      </div>
    </div>
    <script>
      const id = ${JSON.stringify(id)};
      const es = new EventSource('/make-stream/' + id);

      function activate(el) {
        el.classList.add('active');
        el.querySelector('.prog-status').innerHTML = '<div class="spinner"></div>';
      }
      function done(el, note) {
        el.classList.remove('active'); el.classList.add('done');
        el.querySelector('.prog-status').innerHTML = '<span style="color:#22c55e;font-size:1.2rem">✓</span>';
        if (note) el.querySelector('.prog-sub').textContent = note;
      }
      function setNote(el, note) { el.querySelector('.prog-sub').textContent = note; }

      es.addEventListener('story_start',  () => activate(document.getElementById('ps')));
      es.addEventListener('story_done',   e  => done(document.getElementById('ps'), JSON.parse(e.data).title));
      es.addEventListener('panel_start',  e  => {
        const n = JSON.parse(e.data).panel;
        activate(document.getElementById('pp'+n));
        setNote(document.getElementById('pp'+n), 'Google GenAI drawing with char reference…');
      });
      es.addEventListener('panel_done',   e  => {
        const { panel, imgUrl } = JSON.parse(e.data);
        const el = document.getElementById('pp'+panel);
        done(el, 'Done');
        // Show thumbnail inline
        el.insertAdjacentHTML('afterend',
          '<img src="'+imgUrl+'" style="width:100%;border:2px solid #22c55e;margin-bottom:4px" loading="lazy"/>');
      });
      es.addEventListener('redirect',     e  => { es.close(); window.location.href = JSON.parse(e.data).url; });
      es.addEventListener('error_event',  e  => {
        const { msg } = JSON.parse(e.data);
        document.getElementById('plist').insertAdjacentHTML('beforeend',
          '<div style="color:#e63946;margin-top:16px;font-weight:700">Error: '+msg+'</div>');
        es.close();
      });
    </script>
  `));
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3c — SSE: story + panels
// ─────────────────────────────────────────────────────────────────────────────
app.get('/make-stream/:id', async (req, res) => {
  const { id } = req.params;
  const session = sessions.get(id);
  if (!session) { res.end(); return; }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sse = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  try {
    const { characters, refImageUrl, premise } = session;

    // Story — uses the SAME premise that was used to design the characters
    sse('story_start', {});
    const story = await generateStory(null, premise, characters);
    session.story = story;
    sse('story_done', { title: story.title });

    // Panels — all 7 fire in parallel
    story.story.forEach((scene) => sse('panel_start', { panel: scene.panel }));
    const panelResults = await Promise.all(
      story.story.map(async (scene) => {
        const imgUrl = await buildPanel(scene, story, characters, refImageUrl, session.style);
        sse('panel_done', { panel: scene.panel, imgUrl });
        return { ...scene, localPath: imgUrl };
      })
    );
    // Restore panel order (Promise.all preserves order, but be explicit)
    const panels = panelResults.sort((a, b) => a.panel - b.panel);
    session.panels = panels;

    // Build final HTML and persist to disk (survives restarts / volume mounts)
    const html = buildComicHTML(story, characters, refImageUrl, panels);
    saveComic(id, html);
    session.status = 'done';

    sse('redirect', { url: `/comic/${id}` });
  } catch (err) {
    console.error(err);
    sse('error_event', { msg: err.message });
  } finally {
    res.end();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4 — Final comic
// ─────────────────────────────────────────────────────────────────────────────
app.get('/comic/:id', (req, res) => {
  const session = sessions.get(req.params.id);
  // Try disk first (persists across restarts), then fall back to in-progress session check
  const html = loadComic(req.params.id);
  if (!html) return res.redirect('/');
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline helpers
// ─────────────────────────────────────────────────────────────────────────────

async function generateImage(prompt, aspectRatio = '1:1', referenceImageUrl = null) {
  const contents = [];

  // If we have a reference image, fetch it and include as inline data
  if (referenceImageUrl) {
    const imgRes = await fetch(referenceImageUrl);
    const imgBuf = Buffer.from(await imgRes.arrayBuffer());
    contents.push({
      inlineData: { mimeType: 'image/jpeg', data: imgBuf.toString('base64') },
    });
  }

  contents.push({ text: prompt });

  const response = await withRetry(() =>
    genai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: [{ role: 'user', parts: contents }],
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
        responseMimeType: 'text/plain',
      },
    })
  , 'image gen');

  // Extract image from response parts
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      const b64 = part.inlineData.data;
      const mime = part.inlineData.mimeType || 'image/png';
      return `data:${mime};base64,${b64}`;
    }
  }

  // Fallback: try Imagen 3 directly
  const imagenResponse = await withRetry(() =>
    genai.models.generateImages({
      model: 'imagen-3.0-generate-001',
      prompt,
      config: { numberOfImages: 1 },
    })
  , 'imagen fallback');

  if (imagenResponse.generatedImages?.[0]?.image?.imageBytes) {
    const b64 = imagenResponse.generatedImages[0].image.imageBytes;
    return `data:image/png;base64,${b64}`;
  }

  throw new Error('No image generated');
}

async function buildRefSheet(characters, style) {
  const charList = characters.map((c) => `${c.name}: ${c.description}`).join('\n');
  const imageStyle = style?.imageStyle ?? 'Cinematic 3D animation, Pixar aesthetic, vibrant saturated colors, thick bold black ink outlines, cel-shaded, high detail';
  const prompt =
    `Character reference sheet. ${characters.length} characters standing in a row, each clearly labeled with name below. ` +
    `Full body, white background, no overlap.\n${charList}\n` +
    `${imageStyle}.`;

  return generateImage(prompt, '16:9');
}

async function buildPanel(scene, story, characters, refImageUrl, style) {
  const imageStyle = style?.imageStyle ?? 'Cinematic 3D comic book art style, Pixar-meets-graphic-novel aesthetic, thick bold ink outlines, cel-shaded characters';
  const charBlock = characters.map((c) => `${c.name} is ${c.description}.`).join('\n');
  const bubbleBlock = (scene.speech_bubbles || []).map((b, i) => {
    const pos = i > 0 ? `, ${i === 1 ? 'second' : 'third'} bubble below` : '';
    if (b.bubble_type === 'shout')
      return `Jagged yellow explosion speech bubble pointing to ${b.character}, large bold black font reads: "${b.text}"`;
    if (b.bubble_type === 'thought')
      return `White thought cloud bubble pointing to ${b.character}${pos}, italic font reads: "${b.text}"`;
    return `White comic speech bubble with thick black border pointing to ${b.character}${pos}, bold black comic font reads: "${b.text}"`;
  }).concat(scene.caption ? [`Black caption box at bottom, white bold text reads: "${scene.caption}"`] : []).join('\n');

  const prompt = [
    `Use the attached reference image for all characters.`,
    charBlock,
    `Keep all characters exactly as shown in the reference.`,
    ``,
    `SCENE: ${scene.scene}`,
    bubbleBlock ? `\nSPEECH BUBBLES: ${bubbleBlock}` : '',
    ``,
    `${imageStyle}, ${scene.lighting || story.mood}, clean white speech bubbles with bold black rounded borders, bold readable uppercase comic font inside all bubbles.`,
  ].filter(Boolean).join('\n');

  return generateImage(prompt, '4:3', refImageUrl);
}

function buildComicHTML(story, characters, refImageUrl, panels) {
  const charRoster = characters.map(c => `
    <div class="char-card">
      <div class="char-role">${escHtml(c.role)}</div>
      <div class="char-name">${escHtml(c.name)}</div>
      <div class="char-personality">${escHtml(c.personality)}</div>
      <div class="char-desc">${escHtml(c.description)}</div>
    </div>`).join('');

  const panelCards = panels.map(p => {
    const bubbles = (p.speech_bubbles || []).map(b =>
      `<div class="bubble bubble--${b.bubble_type||'speech'}">${escHtml(b.text)}</div>`
    ).join('');
    return `
    <div class="comic-panel">
      <div class="panel-header"><span class="panel-num">PANEL ${p.panel}</span></div>
      <div class="panel-img"><img src="${p.localPath}" alt="Panel ${p.panel}" loading="lazy"/></div>
      <div class="panel-body">
        ${bubbles}
        ${p.caption ? `<p class="caption">${escHtml(p.caption)}</p>` : ''}
      </div>
    </div>`;
  }).join('');

  return shell(story.title, `
    <div style="background:linear-gradient(135deg,#0d0d2b,#1a0a2e,#0d1a2b);padding:80px 24px 60px;text-align:center;border-bottom:5px solid #000">
      <p style="font-family:'Bangers',cursive;font-size:.9rem;letter-spacing:6px;color:var(--red);margin-bottom:12px">${escHtml(story.genre)}</p>
      <h1 style="font-family:'Bangers',cursive;font-size:clamp(3rem,10vw,7rem);color:var(--gold);text-shadow:5px 5px 0 #000,8px 0 0 var(--red);letter-spacing:4px;line-height:1">${escHtml(story.title)}</h1>
      <p style="font-family:'Bangers',cursive;font-size:1.4rem;letter-spacing:3px;color:#fff;margin-top:16px;opacity:.85">${escHtml(story.tagline)}</p>
      <a href="/" style="display:inline-block;margin-top:28px;font-family:'Bangers',cursive;letter-spacing:2px;font-size:1rem;color:var(--gold);border:2px solid var(--gold);padding:8px 20px">← MAKE ANOTHER</a>
    </div>

    <div style="background:var(--cream);color:var(--ink);border-bottom:4px solid #000;padding:40px 24px">
      <div style="max-width:1100px;margin:0 auto">
        <h2 style="font-family:'Bangers',cursive;font-size:2rem;letter-spacing:4px;text-align:center;margin-bottom:24px">CAST OF CHARACTERS</h2>
        <div style="max-width:900px;margin:0 auto 28px;border:4px solid #000;box-shadow:8px 8px 0 #000">
          <img src="${escHtml(refImageUrl)}" style="width:100%;display:block" alt="Character reference sheet"/>
        </div>
        <div class="char-grid" style="max-width:900px;margin:0 auto">${charRoster}</div>
      </div>
    </div>

    <div style="padding:50px 24px 80px">
      <div style="max-width:1200px;margin:0 auto">
        <h2 style="font-family:'Bangers',cursive;font-size:2rem;letter-spacing:4px;color:var(--gold);text-align:center;margin-bottom:32px">THE STORY</h2>
        <div class="comic-grid">${panelCards}</div>
      </div>
    </div>
  `);
}

// ─────────────────────────────────────────────────────────────────────────────
function escHtml(str = '') {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

app.listen(PORT, () => console.log(`Comic Book AI running on http://localhost:${PORT}`));
