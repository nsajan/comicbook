/**
 * Step 5 — Render the final HTML comic book (CLI mode).
 */
export function generateHTML(story, characters, refSheetPath, panels) {
  const charRoster = characters
    .map(
      (c) => `
      <div class="char-card">
        <div class="char-role">${c.role}</div>
        <div class="char-name">${c.name}</div>
        <div class="char-desc">${c.description}</div>
      </div>`
    )
    .join('');

  const panelCards = panels.map((p) => {
    const bubbles = (p.speech_bubbles || [])
      .map(
        (b) => `<div class="bubble bubble--${b.bubble_type || 'speech'}">${b.text}</div>`
      )
      .join('');

    return `
    <div class="panel panel--${p.panel === 4 ? 'wide' : 'normal'}">
      <div class="panel-header">
        <span class="panel-num">PANEL ${p.panel}</span>
      </div>
      <div class="panel-image-wrap">
        <img src="${p.localPath}" alt="Panel ${p.panel}" loading="lazy" />
      </div>
      <div class="panel-body">
        ${bubbles}
        ${p.caption ? `<p class="caption">${p.caption}</p>` : ''}
      </div>
    </div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${story.title} — Cute Comic Factory</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Nunito:ital,wght@0,400;0,600;0,700;0,800;1,400&display=swap" rel="stylesheet" />
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

    body {
      background: var(--bg);
      font-family: 'Nunito', sans-serif;
      color: var(--text);
      -webkit-font-smoothing: antialiased;
      transition: background .3s, color .3s;
    }
    .theme-toggle-float {
      position: fixed; top: 16px; right: 16px; z-index: 100;
      background: var(--card); border: 2px solid var(--border);
      border-radius: 50px; padding: 8px 14px; cursor: pointer;
      font-size: 1.1rem; line-height: 1; box-shadow: var(--shadow);
      transition: background .2s, border-color .2s;
    }
    .theme-toggle-float:hover { border-color: var(--purple-light); }

    /* ── Hero ── */
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

    /* ── Character Roster ── */
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
    .ref-sheet-wrap img {
      width: 100%;
      display: block;
    }
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
      font-size: .7rem;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: var(--pink);
      font-weight: 700;
      margin-bottom: 4px;
    }
    .char-name {
      font-family: 'Fredoka', sans-serif;
      font-weight: 700;
      font-size: 1.3rem;
      color: var(--purple);
      margin-bottom: 6px;
    }
    .char-desc {
      font-size: .82rem;
      line-height: 1.5;
      color: var(--text-desc);
    }

    /* ── Comic Grid ── */
    .comic-section {
      padding: 50px 24px 80px;
    }
    .comic-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 24px;
      max-width: 1200px;
      margin: 0 auto;
    }
    .panel--wide {
      grid-column: 1 / -1;
    }

    .panel {
      background: var(--card);
      border: 2px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
      box-shadow: var(--shadow);
      transition: transform .2s, box-shadow .2s;
    }
    .panel:hover {
      transform: translateY(-4px);
      box-shadow: var(--shadow-lg);
    }
    .panel-header {
      background: linear-gradient(135deg, var(--purple), var(--pink));
      padding: 6px 16px;
    }
    .panel-num {
      font-family: 'Fredoka', sans-serif;
      font-weight: 600;
      font-size: .85rem;
      letter-spacing: 2px;
      color: #fff;
    }
    .panel-image-wrap img {
      width: 100%;
      display: block;
    }
    .panel-body {
      padding: 14px 18px;
    }

    /* Speech bubbles */
    .bubble {
      display: inline-block;
      background: var(--bubble-bg);
      border: 2px solid var(--purple-light);
      border-radius: 20px;
      padding: 8px 14px;
      font-family: 'Nunito', sans-serif;
      font-weight: 700;
      font-size: .85rem;
      margin-bottom: 6px;
      max-width: 100%;
      color: var(--text);
    }
    .bubble--thought {
      border-radius: 50px;
      font-style: italic;
      background: var(--bubble-thought-bg);
      border-color: var(--pink);
    }
    .bubble--shout {
      background: var(--bubble-shout-bg);
      border-color: var(--yellow);
      font-size: .95rem;
    }
    .bubble--whisper {
      opacity: .75;
      font-size: .82rem;
      border-style: dashed;
    }

    .caption {
      font-style: italic;
      font-size: .85rem;
      color: var(--text-soft);
      line-height: 1.6;
      margin-top: 6px;
    }

    /* ── Footer ── */
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
      .panel--wide { grid-column: 1; }
    }
  </style>
</head>
<body>

  <header class="hero">
    <p class="hero-genre">${story.genre}</p>
    <h1 class="hero-title">${story.title}</h1>
    <p class="hero-tagline">${story.tagline}</p>
  </header>

  <section class="roster-section">
    <h2 class="section-title">Cast of Characters</h2>
    <div class="ref-sheet-wrap">
      <img src="${refSheetPath}" alt="Character Reference Sheet" />
    </div>
    <div class="char-grid">
      ${charRoster}
    </div>
  </section>

  <section class="comic-section">
    <h2 class="section-title" style="margin-bottom:32px;">The Story</h2>
    <div class="comic-grid">
      ${panelCards}
    </div>
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
