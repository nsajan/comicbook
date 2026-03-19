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
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'comics')
  : path.join(__dirname, 'data', 'comics');
fs.mkdirSync(DATA_DIR, { recursive: true });

function comicPath(id) { return path.join(DATA_DIR, `${id}.html`); }
const INDEX_PATH = path.join(DATA_DIR, 'index.json');

function loadIndex() {
  try { return JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8')); } catch { return []; }
}
function saveIndex(index) { fs.writeFileSync(INDEX_PATH, JSON.stringify(index), 'utf8'); }

function saveComic(id, html, meta = {}) {
  fs.writeFileSync(comicPath(id), html, 'utf8');
  const index = loadIndex();
  index.unshift({ id, title: meta.title || '', genre: meta.genre || '', style: meta.style || '', createdAt: Date.now() });
  // Keep only last 10
  while (index.length > 10) index.pop();
  saveIndex(index);
}
function loadComic(id) {
  try { return fs.readFileSync(comicPath(id), 'utf8'); } catch { return null; }
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessions = new Map();
const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ── Shared HTML shell ─────────────────────────────────────────────────────────
function shell(title, body, extraHead = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title} — Cute Comic Factory</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Nunito:ital,wght@0,400;0,600;0,700;0,800;1,400&display=swap" rel="stylesheet"/>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root, [data-theme="light"] {
      --purple: #7c3aed;
      --purple-light: #a78bfa;
      --pink: #ec4899;
      --mint: #34d399;
      --yellow: #fbbf24;
      --orange: #fb923c;
      --bg: #faf7ff;
      --card: #ffffff;
      --card-alt: #f5f3ff;
      --text: #1e1b4b;
      --text-soft: #6b7280;
      --text-desc: #555;
      --border: #e5e7eb;
      --nav-bg: rgba(255,255,255,.92);
      --step-bg: #fff;
      --step-num-bg: #f3f0ff;
      --step-num-color: #c4b5d4;
      --input-bg: #fff;
      --chip-bg: #fff;
      --bubble-bg: #f5f3ff;
      --bubble-thought-bg: #fdf2f8;
      --bubble-shout-bg: #fef3c7;
      --radius: 16px;
      --radius-lg: 24px;
      --shadow: 0 4px 24px rgba(124,58,237,.08);
      --shadow-lg: 0 8px 40px rgba(124,58,237,.12);
    }
    [data-theme="dark"] {
      --bg: #0f0d1a;
      --card: #1a1726;
      --card-alt: #231f33;
      --text: #e8e4f0;
      --text-soft: #9690a8;
      --text-desc: #b0aac0;
      --border: #2d2840;
      --nav-bg: rgba(15,13,26,.92);
      --step-bg: #1a1726;
      --step-num-bg: #2d2840;
      --step-num-color: #6b6580;
      --input-bg: #1a1726;
      --chip-bg: #1a1726;
      --bubble-bg: #231f33;
      --bubble-thought-bg: #2a1f2e;
      --bubble-shout-bg: #2a2518;
      --shadow: 0 4px 24px rgba(0,0,0,.3);
      --shadow-lg: 0 8px 40px rgba(0,0,0,.4);
    }
    @media (prefers-color-scheme: dark) {
      :root:not([data-theme="light"]) {
        --bg: #0f0d1a;
        --card: #1a1726;
        --card-alt: #231f33;
        --text: #e8e4f0;
        --text-soft: #9690a8;
        --text-desc: #b0aac0;
        --border: #2d2840;
        --nav-bg: rgba(15,13,26,.92);
        --step-bg: #1a1726;
        --step-num-bg: #2d2840;
        --step-num-color: #6b6580;
        --input-bg: #1a1726;
        --chip-bg: #1a1726;
        --bubble-bg: #231f33;
        --bubble-thought-bg: #2a1f2e;
        --bubble-shout-bg: #2a2518;
        --shadow: 0 4px 24px rgba(0,0,0,.3);
        --shadow-lg: 0 8px 40px rgba(0,0,0,.4);
      }
    }
    body {
      background: var(--bg);
      font-family: 'Nunito', sans-serif;
      color: var(--text);
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
      transition: background .3s, color .3s;
    }
    a { color: var(--purple); text-decoration: none; }

    nav {
      display: flex; align-items: center; gap: 12px;
      padding: 16px 28px;
      background: var(--nav-bg);
      border-bottom: 1px solid var(--border);
      position: sticky; top: 0; z-index: 100;
      backdrop-filter: blur(12px);
    }
    nav .logo {
      font-family: 'Fredoka', sans-serif;
      font-weight: 700;
      font-size: 1.4rem;
      background: linear-gradient(135deg, var(--purple), var(--pink));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      flex: 1;
    }
    .theme-toggle {
      background: var(--card-alt);
      border: 2px solid var(--border);
      border-radius: 50px;
      padding: 6px 12px;
      cursor: pointer;
      font-size: 1.1rem;
      line-height: 1;
      transition: background .2s, border-color .2s;
    }
    .theme-toggle:hover { border-color: var(--purple-light); }

    .steps {
      display: flex; gap: 0; align-items: center; justify-content: center;
      padding: 12px 28px;
      background: var(--step-bg);
      border-bottom: 1px solid var(--border);
      font-family: 'Fredoka', sans-serif;
      font-size: .85rem; font-weight: 500;
      overflow-x: auto;
    }
    .step-item {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 18px;
      color: var(--step-num-color);
      white-space: nowrap;
      transition: color .2s;
    }
    .step-item.active { color: var(--purple); }
    .step-item.done   { color: var(--mint); }
    .step-num {
      width: 26px; height: 26px;
      border-radius: 50%;
      background: var(--step-num-bg); color: var(--step-num-color);
      display: flex; align-items: center; justify-content: center;
      font-size: .78rem; font-weight: 700;
      transition: all .2s;
    }
    .step-item.active .step-num { background: var(--purple); color: #fff; }
    .step-item.done   .step-num { background: var(--mint); color: #fff; }
    .step-arrow { color: #ddd; padding: 0 4px; font-size: .8rem; }

    .page { max-width: 960px; margin: 0 auto; padding: 48px 24px 80px; }

    .page-title {
      font-family: 'Fredoka', sans-serif;
      font-weight: 700;
      font-size: clamp(2rem, 5vw, 3rem);
      background: linear-gradient(135deg, var(--purple), var(--pink));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin-bottom: 8px;
    }
    .page-sub { color: var(--text-soft); font-size: 1rem; margin-bottom: 40px; line-height: 1.6; }

    .btn {
      display: inline-flex; align-items: center; gap: 8px;
      font-family: 'Fredoka', sans-serif;
      font-weight: 600;
      font-size: 1.05rem;
      padding: 14px 28px;
      border: none;
      border-radius: 50px;
      cursor: pointer;
      transition: transform .15s, box-shadow .15s;
      text-decoration: none;
    }
    .btn:hover  { transform: translateY(-2px); box-shadow: var(--shadow-lg); }
    .btn:active { transform: translateY(0); }
    .btn-primary {
      background: linear-gradient(135deg, var(--purple), var(--pink));
      color: #fff;
      box-shadow: 0 4px 16px rgba(124,58,237,.3);
    }
    .btn-ghost { background: #f3f0ff; color: var(--purple); }
    .btn-ghost:hover { background: #ede9fe; }
    .btn-green {
      background: linear-gradient(135deg, var(--mint), #2dd4bf);
      color: #fff;
      box-shadow: 0 4px 16px rgba(52,211,153,.3);
    }

    .input-wrap { position: relative; margin-bottom: 20px; }
    textarea, input[type=text] {
      width: 100%;
      background: var(--input-bg);
      border: 2px solid var(--border);
      color: var(--text);
      font-family: 'Nunito', sans-serif;
      font-size: 1.05rem;
      padding: 16px 20px;
      border-radius: var(--radius);
      outline: none;
      transition: border-color .2s, box-shadow .2s;
    }
    textarea { height: 120px; resize: vertical; }
    textarea:focus, input:focus {
      border-color: var(--purple-light);
      box-shadow: 0 0 0 4px rgba(124,58,237,.1);
    }

    .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 28px; }
    .chip {
      background: var(--chip-bg); border: 2px solid var(--border);
      color: var(--text-soft); font-size: .85rem;
      padding: 8px 16px; border-radius: 50px; cursor: pointer;
      transition: all .15s;
    }
    .chip:hover { border-color: var(--purple); color: var(--purple); background: var(--card-alt); }

    .spinner {
      display: inline-block;
      width: 20px; height: 20px;
      border: 3px solid var(--border);
      border-top-color: var(--purple);
      border-radius: 50%;
      animation: spin .7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
    @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.6; } }

    .progress-list { display: flex; flex-direction: column; gap: 12px; max-width: 500px; }
    .prog-item {
      display: flex; align-items: center; gap: 14px;
      background: var(--card); border: 2px solid var(--border);
      border-radius: var(--radius);
      padding: 16px 20px;
      transition: border-color .3s, background .3s, box-shadow .3s;
      animation: fadeUp .4s ease both;
    }
    .prog-item.active { border-color: var(--purple-light); background: var(--card-alt); box-shadow: 0 0 0 4px rgba(124,58,237,.06); }
    .prog-item.done   { border-color: var(--mint); background: var(--card); }
    .prog-item.error  { border-color: #f87171; background: var(--card); }
    .prog-icon { font-size: 1.5rem; width: 32px; text-align: center; flex-shrink: 0; }
    .prog-text { flex: 1; }
    .prog-label { font-weight: 700; font-size: .95rem; }
    .prog-sub   { font-size: .8rem; color: var(--text-soft); margin-top: 2px; }
    .prog-item.active .prog-sub { color: var(--purple); }
    .prog-item.done   .prog-sub { color: var(--mint); }
    .prog-status { flex-shrink: 0; }

    .char-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 16px;
      margin: 28px 0;
    }
    .char-card {
      background: var(--card);
      border: 2px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
      transition: border-color .2s, transform .2s, box-shadow .2s;
    }
    .char-card:hover { border-color: var(--purple-light); transform: translateY(-4px); box-shadow: var(--shadow); }
    .char-role {
      font-size: .7rem; text-transform: uppercase;
      letter-spacing: 2px; color: var(--pink);
      margin-bottom: 4px; font-weight: 700;
    }
    .char-name {
      font-family: 'Fredoka', sans-serif;
      font-weight: 700;
      font-size: 1.4rem;
      color: var(--purple); margin-bottom: 8px;
    }
    .char-personality {
      font-size: .8rem; color: var(--text-soft);
      margin-bottom: 8px; font-style: italic;
    }
    .char-desc { font-size: .85rem; color: var(--text-desc); line-height: 1.6; }

    .ref-image-wrap {
      border: 2px solid var(--border);
      border-radius: var(--radius-lg);
      margin-bottom: 28px;
      position: relative;
      overflow: hidden;
      box-shadow: var(--shadow);
    }
    .ref-image-wrap img { width: 100%; display: block; }
    .ref-image-label {
      position: absolute; top: 12px; left: 12px;
      background: linear-gradient(135deg, var(--purple), var(--pink));
      color: #fff;
      font-family: 'Fredoka', sans-serif;
      font-weight: 600;
      font-size: .8rem; letter-spacing: 1px;
      padding: 6px 14px;
      border-radius: 50px;
    }

    .action-bar {
      display: flex; gap: 16px; align-items: center;
      flex-wrap: wrap;
      padding: 24px;
      background: var(--card);
      border: 2px solid var(--border);
      border-radius: var(--radius-lg);
      margin-top: 32px;
    }
    .action-bar p { color: var(--text-soft); font-size: .95rem; flex: 1; min-width: 200px; }

    .comic-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
    }
    .comic-panel {
      background: var(--card); border: 2px solid var(--border);
      border-radius: var(--radius); color: var(--text);
      overflow: hidden; box-shadow: var(--shadow);
      transition: transform .2s, box-shadow .2s;
    }
    .comic-panel:hover { transform: translateY(-4px); box-shadow: var(--shadow-lg); }
    .comic-panel:nth-child(4) { grid-column: 1 / -1; }
    .panel-header {
      background: linear-gradient(135deg, var(--purple), var(--pink));
      color: #fff; padding: 6px 16px;
    }
    .panel-num { font-family: 'Fredoka', sans-serif; font-weight: 600; font-size: .85rem; letter-spacing: 2px; }
    .panel-img img { width: 100%; display: block; }
    .panel-body { padding: 14px 18px; }
    .bubble {
      display: inline-block;
      background: var(--bubble-bg); border: 2px solid var(--purple-light);
      border-radius: 20px; padding: 8px 14px;
      font-weight: 700; font-size: .85rem;
      margin-bottom: 6px; max-width: 100%;
      color: var(--text);
    }
    .bubble--shout   { background: var(--bubble-shout-bg); border-color: var(--yellow); }
    .bubble--thought { border-radius: 50px; font-style: italic; background: var(--bubble-thought-bg); border-color: var(--pink); }
    .caption { font-style: italic; font-size: .85rem; color: var(--text-soft); line-height: 1.6; margin-top: 4px; }

    @media (max-width: 600px) {
      .comic-grid { grid-template-columns: 1fr; }
      .comic-panel:nth-child(4) { grid-column: 1; }
      .page { padding: 32px 16px 60px; }
    }
  </style>
  ${extraHead}
</head>
<body>
  <nav>
    <a href="/" class="logo">Cute Comic Factory</a>
    <button class="theme-toggle" onclick="toggleTheme()" aria-label="Toggle theme" id="themeBtn"></button>
  </nav>
  ${body}
  <script>
    (function(){
      const stored = localStorage.getItem('theme');
      if (stored) document.documentElement.setAttribute('data-theme', stored);
      updateIcon();
    })();
    function toggleTheme() {
      const current = document.documentElement.getAttribute('data-theme');
      const isDark = current === 'dark' || (!current && window.matchMedia('(prefers-color-scheme: dark)').matches);
      const next = isDark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
      updateIcon();
    }
    function updateIcon() {
      const current = document.documentElement.getAttribute('data-theme');
      const isDark = current === 'dark' || (!current && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.getElementById('themeBtn').textContent = isDark ? '\\u2600\\uFE0F' : '\\uD83C\\uDF19';
    }
  </script>
</body>
</html>`;
}

function stepsBar(active) {
  const steps = [
    { n: 1, label: 'Your Idea' },
    { n: 2, label: 'Meet the Cast' },
    { n: 3, label: 'Drawing Panels' },
    { n: 4, label: 'Your Comic!' },
  ];
  const items = steps.map((s) => {
    const cls = s.n === active ? 'active' : s.n < active ? 'done' : '';
    const icon = s.n < active ? '&#10003;' : s.n;
    return `<div class="step-item ${cls}"><div class="step-num">${icon}</div>${s.label}</div>
    ${s.n < steps.length ? '<span class="step-arrow">&#8250;</span>' : ''}`;
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

  const recentComics = loadIndex();
  const galleryHtml = recentComics.length ? `
    <div class="page" style="max-width:780px;padding-top:0">
      <div style="border-top:1px solid var(--border);padding-top:40px">
        <h2 style="font-family:'Fredoka',sans-serif;font-weight:700;font-size:1.4rem;color:var(--purple);margin-bottom:6px">Recent Comics</h2>
        <p style="color:var(--text-soft);font-size:.9rem;margin-bottom:20px">Check out what others have created!</p>
        <div class="gallery-grid">
          ${recentComics.map(c => `
            <a href="/comic/${escHtml(c.id)}" class="gallery-card">
              <div class="gallery-genre">${escHtml(c.genre)}</div>
              <div class="gallery-title">${escHtml(c.title)}</div>
              <div class="gallery-meta">${escHtml(c.style)}</div>
            </a>`).join('')}
        </div>
      </div>
    </div>` : '';

  res.send(shell('Your Idea', `
    ${stepsBar(1)}
    <div class="page" style="max-width:780px">
      <h1 class="page-title">What's your story about?</h1>
      <p class="page-sub">Pick an art style, describe your idea, and we'll create an awesome comic book just for you!</p>
      <form action="/start" method="POST">

        <div style="margin-bottom:28px">
          <div style="font-family:'Fredoka',sans-serif;font-weight:600;font-size:.9rem;color:var(--text-soft);margin-bottom:14px">Choose your art style</div>
          <div class="style-grid">${styleCards}</div>
        </div>

        <div style="font-family:'Fredoka',sans-serif;font-weight:600;font-size:.9rem;color:var(--text-soft);margin-bottom:10px">Your story idea</div>
        <div class="input-wrap">
          <textarea name="idea" id="idea" placeholder="e.g. A robot chef discovers their recipes give superpowers to whoever eats them..." required></textarea>
        </div>
        <div class="chips">
          <span class="chip" onclick="setIdea(this)">Space explorer finds an ancient alien city on Mars</span>
          <span class="chip" onclick="setIdea(this)">Street artist whose graffiti comes alive at night</span>
          <span class="chip" onclick="setIdea(this)">A detective who talks to ghosts solves their own mystery</span>
          <span class="chip" onclick="setIdea(this)">Kids discover their school is built on a dragon's nest</span>
        </div>
        <button type="submit" class="btn btn-primary">Create My Characters</button>
      </form>
    </div>
    ${galleryHtml}
    <script>
      function setIdea(el) { document.getElementById('idea').value = el.innerText; }
    </script>
  `, `<style>
    .style-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 4px;
    }
    .style-card { flex: 0 0 auto; }
    .style-card input[type=radio] { display: none; }
    .style-card-inner {
      background: var(--card);
      border: 2px solid var(--border);
      border-radius: 50px;
      padding: 8px 16px;
      cursor: pointer;
      transition: border-color .15s, background .15s, box-shadow .15s;
      display: flex; align-items: center; gap: 8px;
      white-space: nowrap;
    }
    .style-card input:checked + .style-card-inner {
      border-color: var(--purple);
      background: var(--card-alt);
      box-shadow: var(--shadow);
    }
    .style-card-inner:hover { border-color: var(--purple-light); }
    .style-emoji { font-size: 1.2rem; }
    .style-label { font-family: 'Fredoka', sans-serif; font-weight: 600; font-size: .85rem; color: var(--purple); }
    .style-desc  { display: none; }

    .gallery-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px;
    }
    .gallery-card {
      display: block;
      background: var(--card);
      border: 2px solid var(--border);
      border-radius: var(--radius);
      padding: 16px 18px;
      text-decoration: none;
      transition: border-color .2s, transform .2s, box-shadow .2s;
    }
    .gallery-card:hover { border-color: var(--purple-light); transform: translateY(-3px); box-shadow: var(--shadow); }
    .gallery-genre { font-size: .7rem; text-transform: uppercase; letter-spacing: 2px; color: var(--pink); font-weight: 700; margin-bottom: 4px; }
    .gallery-title { font-family: 'Fredoka', sans-serif; font-weight: 700; font-size: 1.05rem; color: var(--purple); margin-bottom: 6px; line-height: 1.3; }
    .gallery-meta { font-size: .75rem; color: var(--text-soft); }
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

  if (session.status === 'generating_comic' || session.status === 'done') {
    return res.redirect(`/making/${id}`);
  }
  if (session.status === 'cast_ready') {
    return res.redirect(`/approve/${id}`);
  }

  res.send(shell('Building Your Cast', `
    ${stepsBar(2)}
    <div class="page" style="max-width:540px">
      <h1 class="page-title">Creating your characters...</h1>
      <p class="page-sub" style="margin-bottom:32px">"${escHtml(session.idea)}"</p>
      <div class="progress-list" id="plist">
        <div class="prog-item" id="p1">
          <span class="prog-icon">&#9997;&#65039;</span>
          <div class="prog-text">
            <div class="prog-label">Designing Characters</div>
            <div class="prog-sub" id="p1s">Dreaming up a unique cast for your story...</div>
          </div>
          <div class="prog-status" id="p1i"></div>
        </div>
        <div class="prog-item" id="p2">
          <span class="prog-icon">&#127912;</span>
          <div class="prog-text">
            <div class="prog-label">Drawing Reference Sheet</div>
            <div class="prog-sub" id="p2s">Bringing your characters to life...</div>
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
        document.getElementById('p'+n+'i').innerHTML = '<span style="color:var(--mint);font-size:1.2rem">&#10003;</span>';
        if (note) document.getElementById('p'+n+'s').textContent = note;
      }

      es.addEventListener('step',     e => activate(JSON.parse(e.data).step));
      es.addEventListener('stepdone', e => { const d = JSON.parse(e.data); done(d.step, d.note); });
      es.addEventListener('redirect', e => { es.close(); window.location.href = JSON.parse(e.data).url; });
      es.addEventListener('error_event', e => {
        const { msg } = JSON.parse(e.data);
        document.getElementById('plist').insertAdjacentHTML('beforeend',
          '<div style="color:#ef4444;margin-top:16px;font-weight:700;border-radius:12px;background:#fef2f2;padding:16px">Oops! ' + msg + '</div>');
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
    sse('step', { step: 1 });
    const { premise, characters } = await generateCharacters(null, session.idea, session.style);
    session.premise = premise;
    session.characters = characters;
    sse('stepdone', { step: 1, note: `${characters.length} characters ready!` });

    sse('step', { step: 2 });
    const refImageUrl = await buildRefSheet(characters, session.style);
    session.refImageUrl = refImageUrl;
    session.status = 'cast_ready';
    sse('stepdone', { step: 2, note: 'Reference sheet complete!' });

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
      <div style="font-size:.78rem;color:var(--orange);margin-bottom:6px;font-style:italic">${escHtml(c.storyRole || '')}</div>
      <div class="char-desc">${escHtml(c.description)}</div>
    </div>`).join('');

  res.send(shell('Meet Your Cast', `
    ${stepsBar(2)}
    <div class="page">
      <h1 class="page-title">Meet your characters!</h1>

      <div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:24px;flex-wrap:wrap">
        <div style="background:var(--card);border:2px solid var(--border);border-radius:var(--radius);border-left:4px solid var(--purple);padding:18px 22px;flex:1;min-width:260px">
          <div style="font-size:.75rem;text-transform:uppercase;letter-spacing:2px;color:var(--purple);margin-bottom:6px;font-family:'Fredoka',sans-serif;font-weight:600">Story Premise</div>
          <p style="color:var(--text);font-size:.95rem;line-height:1.6">${escHtml(session.premise || '')}</p>
        </div>
        <div style="background:var(--card);border:2px solid var(--border);border-radius:var(--radius);padding:18px 22px;text-align:center;min-width:120px">
          <div style="font-size:2.2rem">${escHtml(session.style?.emoji || '&#127916;')}</div>
          <div style="font-family:'Fredoka',sans-serif;font-weight:600;font-size:1rem;color:var(--purple);margin-top:4px">${escHtml(session.style?.label || 'Pixar 3D')}</div>
          <div style="font-size:.75rem;color:var(--text-soft);margin-top:4px">art style</div>
        </div>
      </div>

      <div class="ref-image-wrap">
        <span class="ref-image-label">Character Reference Sheet</span>
        <img src="${escHtml(session.refImageUrl)}" alt="Character reference sheet" />
      </div>

      <div class="char-grid">${charCards}</div>

      <div class="action-bar">
        <p>Happy with your characters? Let's make your comic!</p>
        <a href="/start-over/${id}" class="btn btn-ghost">Try New Characters</a>
        <form action="/generate/${id}" method="POST" style="margin:0">
          <button type="submit" class="btn btn-green">Make My Comic!</button>
        </form>
      </div>
    </div>
  `));
});

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
    <div class="prog-item" id="pp${i+1}" style="animation-delay:${(i+1)*0.05}s">
      <span class="prog-icon">&#128444;&#65039;</span>
      <div class="prog-text">
        <div class="prog-label">Panel ${i+1}</div>
        <div class="prog-sub" id="pp${i+1}s">Waiting...</div>
      </div>
      <div class="prog-status" id="pp${i+1}i"></div>
    </div>`).join('');

  res.send(shell('Drawing Your Comic', `
    ${stepsBar(3)}
    <div class="page" style="max-width:580px">
      <h1 class="page-title">Drawing your comic!</h1>
      <p class="page-sub" style="margin-bottom:32px">"${escHtml(session.idea)}"</p>

      <div class="progress-list" id="plist">
        <div class="prog-item" id="ps">
          <span class="prog-icon">&#128214;</span>
          <div class="prog-text">
            <div class="prog-label">Writing the Story</div>
            <div class="prog-sub" id="pss">Scripting 7 panels with dialogue...</div>
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
        el.querySelector('.prog-status').innerHTML = '<span style="color:var(--mint);font-size:1.2rem">&#10003;</span>';
        if (note) el.querySelector('.prog-sub').textContent = note;
      }
      function setNote(el, note) { el.querySelector('.prog-sub').textContent = note; }

      es.addEventListener('story_start',  () => activate(document.getElementById('ps')));
      es.addEventListener('story_done',   e  => done(document.getElementById('ps'), JSON.parse(e.data).title));
      es.addEventListener('panel_start',  e  => {
        const n = JSON.parse(e.data).panel;
        activate(document.getElementById('pp'+n));
        setNote(document.getElementById('pp'+n), 'Drawing with character reference...');
      });
      es.addEventListener('panel_done',   e  => {
        const { panel, imgUrl } = JSON.parse(e.data);
        const el = document.getElementById('pp'+panel);
        done(el, 'Done!');
        el.insertAdjacentHTML('afterend',
          '<img src="'+imgUrl+'" style="width:100%;border-radius:12px;margin-bottom:4px;box-shadow:var(--shadow)" loading="lazy"/>');
      });
      es.addEventListener('redirect',     e  => { es.close(); window.location.href = JSON.parse(e.data).url; });
      es.addEventListener('error_event',  e  => {
        const { msg } = JSON.parse(e.data);
        document.getElementById('plist').insertAdjacentHTML('beforeend',
          '<div style="color:#ef4444;margin-top:16px;font-weight:700;border-radius:12px;background:#fef2f2;padding:16px">Oops! '+msg+'</div>');
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

    sse('story_start', {});
    const story = await generateStory(null, premise, characters);
    session.story = story;
    sse('story_done', { title: story.title });

    story.story.forEach((scene) => sse('panel_start', { panel: scene.panel }));
    const panelResults = await Promise.all(
      story.story.map(async (scene) => {
        const imgUrl = await buildPanel(scene, story, characters, refImageUrl, session.style);
        sse('panel_done', { panel: scene.panel, imgUrl });
        return { ...scene, localPath: imgUrl };
      })
    );
    const panels = panelResults.sort((a, b) => a.panel - b.panel);
    session.panels = panels;

    const html = buildComicHTML(story, characters, refImageUrl, panels);
    saveComic(id, html, { title: story.title, genre: story.genre, style: session.style?.label || '' });
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

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      const b64 = part.inlineData.data;
      const mime = part.inlineData.mimeType || 'image/png';
      return `data:${mime};base64,${b64}`;
    }
  }

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

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${escHtml(story.title)} — Cute Comic Factory</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Nunito:ital,wght@0,400;0,600;0,700;0,800;1,400&display=swap" rel="stylesheet"/>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root, [data-theme="light"] {
      --purple: #7c3aed;
      --purple-light: #a78bfa;
      --pink: #ec4899;
      --mint: #34d399;
      --yellow: #fbbf24;
      --orange: #fb923c;
      --bg: #faf7ff;
      --card: #ffffff;
      --card-alt: #f5f3ff;
      --text: #1e1b4b;
      --text-soft: #6b7280;
      --text-desc: #555;
      --border: #e5e7eb;
      --bubble-bg: #f5f3ff;
      --bubble-thought-bg: #fdf2f8;
      --bubble-shout-bg: #fef3c7;
      --radius: 16px;
      --radius-lg: 24px;
      --shadow: 0 4px 24px rgba(124,58,237,.08);
      --shadow-lg: 0 8px 40px rgba(124,58,237,.12);
    }
    [data-theme="dark"] {
      --bg: #0f0d1a; --card: #1a1726; --card-alt: #231f33;
      --text: #e8e4f0; --text-soft: #9690a8; --text-desc: #b0aac0;
      --border: #2d2840;
      --bubble-bg: #231f33; --bubble-thought-bg: #2a1f2e; --bubble-shout-bg: #2a2518;
      --shadow: 0 4px 24px rgba(0,0,0,.3);
      --shadow-lg: 0 8px 40px rgba(0,0,0,.4);
    }
    @media (prefers-color-scheme: dark) {
      :root:not([data-theme="light"]) {
        --bg: #0f0d1a; --card: #1a1726; --card-alt: #231f33;
        --text: #e8e4f0; --text-soft: #9690a8; --text-desc: #b0aac0;
        --border: #2d2840;
        --bubble-bg: #231f33; --bubble-thought-bg: #2a1f2e; --bubble-shout-bg: #2a2518;
        --shadow: 0 4px 24px rgba(0,0,0,.3);
        --shadow-lg: 0 8px 40px rgba(0,0,0,.4);
      }
    }
    body { background: var(--bg); font-family: 'Nunito', sans-serif; color: var(--text); -webkit-font-smoothing: antialiased; transition: background .3s, color .3s; }
    a { color: var(--purple); text-decoration: none; }
    .theme-toggle-float {
      position: fixed; top: 16px; right: 16px; z-index: 100;
      background: var(--card); border: 2px solid var(--border);
      border-radius: 50px; padding: 8px 14px; cursor: pointer;
      font-size: 1.1rem; line-height: 1; box-shadow: var(--shadow);
      transition: background .2s, border-color .2s;
    }
    .theme-toggle-float:hover { border-color: var(--purple-light); }

    .hero {
      position: relative;
      background: linear-gradient(135deg, #7c3aed 0%, #ec4899 50%, #fb923c 100%);
      padding: 80px 24px 60px;
      text-align: center;
      overflow: hidden;
    }
    .hero::before {
      content: '';
      position: absolute; inset: 0;
      background: radial-gradient(ellipse at 50% 0%, rgba(255,255,255,.2) 0%, transparent 70%);
      pointer-events: none;
    }
    .hero-genre {
      font-family: 'Fredoka', sans-serif;
      font-weight: 600;
      font-size: .9rem;
      letter-spacing: 4px;
      color: rgba(255,255,255,.85);
      margin-bottom: 16px;
      text-transform: uppercase;
    }
    .hero-title {
      font-family: 'Fredoka', sans-serif;
      font-weight: 700;
      font-size: clamp(3rem, 9vw, 6rem);
      color: #fff;
      text-shadow: 0 4px 24px rgba(0,0,0,.15);
      line-height: 1.1;
    }
    .hero-tagline {
      font-family: 'Nunito', sans-serif;
      font-weight: 600;
      font-size: clamp(1rem, 2.5vw, 1.4rem);
      color: rgba(255,255,255,.9);
      margin-top: 18px;
    }
    .hero-btn {
      display: inline-block;
      margin-top: 28px;
      font-family: 'Fredoka', sans-serif;
      font-weight: 600;
      font-size: 1rem;
      color: #fff;
      border: 2px solid rgba(255,255,255,.4);
      padding: 10px 24px;
      border-radius: 50px;
      transition: background .2s;
    }
    .hero-btn:hover { background: rgba(255,255,255,.15); }

    .roster-section {
      background: var(--card);
      padding: 50px 24px;
    }
    .section-title {
      font-family: 'Fredoka', sans-serif;
      font-weight: 700;
      font-size: 2rem;
      background: linear-gradient(135deg, var(--purple), var(--pink));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      text-align: center;
      margin-bottom: 28px;
    }
    .ref-sheet-wrap {
      max-width: 900px;
      margin: 0 auto 32px;
      border: 2px solid var(--border);
      border-radius: var(--radius-lg);
      overflow: hidden;
      box-shadow: var(--shadow-lg);
    }
    .ref-sheet-wrap img { width: 100%; display: block; }
    .char-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      max-width: 1100px;
      margin: 0 auto;
    }
    .char-card {
      background: var(--card);
      border: 2px solid var(--border);
      border-radius: var(--radius);
      padding: 18px;
      transition: transform .2s, box-shadow .2s;
    }
    .char-card:hover { transform: translateY(-4px); box-shadow: var(--shadow); }
    .char-role {
      font-size: .7rem; text-transform: uppercase;
      letter-spacing: 2px; color: var(--pink);
      font-weight: 700; margin-bottom: 4px;
    }
    .char-name {
      font-family: 'Fredoka', sans-serif;
      font-weight: 700; font-size: 1.3rem;
      color: var(--purple); margin-bottom: 6px;
    }
    .char-personality {
      font-size: .8rem; color: var(--text-soft);
      font-style: italic; margin-bottom: 6px;
    }
    .char-desc { font-size: .82rem; line-height: 1.5; color: var(--text-desc); }

    .comic-section { padding: 50px 24px 80px; }
    .comic-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 24px;
      max-width: 1200px;
      margin: 0 auto;
    }
    .comic-panel {
      background: var(--card);
      border: 2px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
      box-shadow: var(--shadow);
      transition: transform .2s, box-shadow .2s;
    }
    .comic-panel:hover { transform: translateY(-4px); box-shadow: var(--shadow-lg); }
    .comic-panel:nth-child(4) { grid-column: 1 / -1; }
    .panel-header {
      background: linear-gradient(135deg, var(--purple), var(--pink));
      padding: 6px 16px;
    }
    .panel-num {
      font-family: 'Fredoka', sans-serif;
      font-weight: 600; font-size: .85rem;
      letter-spacing: 2px; color: #fff;
    }
    .panel-img img { width: 100%; display: block; }
    .panel-body { padding: 14px 18px; }
    .bubble {
      display: inline-block;
      background: var(--bubble-bg); border: 2px solid var(--purple-light);
      border-radius: 20px; padding: 8px 14px;
      font-weight: 700; font-size: .85rem;
      margin-bottom: 6px; max-width: 100%;
      color: var(--text);
    }
    .bubble--shout { background: var(--bubble-shout-bg); border-color: var(--yellow); }
    .bubble--thought { border-radius: 50px; font-style: italic; background: var(--bubble-thought-bg); border-color: var(--pink); }
    .bubble--whisper { opacity: .75; font-size: .82rem; border-style: dashed; }
    .caption { font-style: italic; font-size: .85rem; color: var(--text-soft); line-height: 1.6; margin-top: 4px; }

    footer {
      text-align: center;
      padding: 32px;
      font-family: 'Fredoka', sans-serif;
      font-weight: 600;
      font-size: 1rem;
      color: var(--purple-light);
      border-top: 1px solid var(--border);
    }

    @media (max-width: 640px) {
      .comic-grid { grid-template-columns: 1fr; }
      .comic-panel:nth-child(4) { grid-column: 1; }
    }
  </style>
</head>
<body>

  <header class="hero">
    <p class="hero-genre">${escHtml(story.genre)}</p>
    <h1 class="hero-title">${escHtml(story.title)}</h1>
    <p class="hero-tagline">${escHtml(story.tagline)}</p>
    <a href="/" class="hero-btn">Make Another Comic</a>
  </header>

  <section class="roster-section">
    <h2 class="section-title">Cast of Characters</h2>
    <div class="ref-sheet-wrap">
      <img src="${escHtml(refImageUrl)}" alt="Character reference sheet"/>
    </div>
    <div class="char-grid">${charRoster}</div>
  </section>

  <section class="comic-section">
    <h2 class="section-title" style="margin-bottom:32px">The Story</h2>
    <div class="comic-grid">${panelCards}</div>
  </section>

  <footer>The End &mdash; Made with Cute Comic Factory</footer>

  <button class="theme-toggle-float" onclick="toggleTheme()" aria-label="Toggle theme" id="themeBtn"></button>
  <script>
    (function(){
      var stored = localStorage.getItem('theme');
      if (stored) document.documentElement.setAttribute('data-theme', stored);
      updateIcon();
    })();
    function toggleTheme() {
      var current = document.documentElement.getAttribute('data-theme');
      var isDark = current === 'dark' || (!current && window.matchMedia('(prefers-color-scheme: dark)').matches);
      var next = isDark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
      updateIcon();
    }
    function updateIcon() {
      var current = document.documentElement.getAttribute('data-theme');
      var isDark = current === 'dark' || (!current && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.getElementById('themeBtn').textContent = isDark ? '\\u2600\\uFE0F' : '\\uD83C\\uDF19';
    }
  </script>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
function escHtml(str = '') {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

app.listen(PORT, () => console.log(`Cute Comic Factory running on http://localhost:${PORT}`));
