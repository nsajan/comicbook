/**
 * Step 5 — Render the final HTML comic book.
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
  <title>${story.title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Bangers&family=Comic+Neue:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --ink: #0d0d0d;
      --gold: #ffd700;
      --red: #e63946;
      --cream: #fffdf0;
      --bg: #12121e;
    }

    body {
      background: var(--bg);
      font-family: 'Comic Neue', cursive;
      color: var(--ink);
    }

    /* ── Hero ── */
    .hero {
      position: relative;
      background: linear-gradient(135deg, #0d0d2b 0%, #1a0a2e 50%, #0d1a2b 100%);
      padding: 80px 24px 60px;
      text-align: center;
      border-bottom: 6px solid var(--ink);
      overflow: hidden;
    }
    .hero::before {
      content: '';
      position: absolute; inset: 0;
      background: radial-gradient(ellipse at 50% 0%, rgba(255,215,0,.15) 0%, transparent 70%);
      pointer-events: none;
    }
    .hero-genre {
      font-family: 'Bangers', cursive;
      font-size: 1rem;
      letter-spacing: 6px;
      color: var(--red);
      margin-bottom: 16px;
      text-transform: uppercase;
    }
    .hero-title {
      font-family: 'Bangers', cursive;
      font-size: clamp(3.5rem, 10vw, 8rem);
      color: var(--gold);
      text-shadow: 5px 5px 0 var(--ink), -2px -2px 0 var(--ink), 8px 0 0 var(--red);
      letter-spacing: 4px;
      line-height: 1;
    }
    .hero-tagline {
      font-family: 'Bangers', cursive;
      font-size: clamp(1.1rem, 3vw, 1.6rem);
      color: #fff;
      letter-spacing: 3px;
      margin-top: 18px;
      opacity: .85;
    }

    /* ── Character Roster ── */
    .roster-section {
      background: var(--cream);
      border-bottom: 5px solid var(--ink);
      padding: 40px 24px;
    }
    .section-title {
      font-family: 'Bangers', cursive;
      font-size: 2.2rem;
      letter-spacing: 4px;
      color: var(--ink);
      text-align: center;
      margin-bottom: 24px;
    }
    .ref-sheet-wrap {
      max-width: 900px;
      margin: 0 auto 32px;
      border: 4px solid var(--ink);
      box-shadow: 8px 8px 0 var(--ink);
    }
    .ref-sheet-wrap img {
      width: 100%;
      display: block;
    }
    .char-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
      max-width: 1100px;
      margin: 0 auto;
    }
    .char-card {
      background: #fff;
      border: 3px solid var(--ink);
      box-shadow: 4px 4px 0 var(--ink);
      padding: 14px 16px;
      border-radius: 2px;
    }
    .char-role {
      font-size: .7rem;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: var(--red);
      font-weight: 700;
      margin-bottom: 4px;
    }
    .char-name {
      font-family: 'Bangers', cursive;
      font-size: 1.5rem;
      letter-spacing: 1px;
      margin-bottom: 6px;
    }
    .char-desc {
      font-size: .78rem;
      line-height: 1.5;
      color: #444;
    }

    /* ── Comic Grid ── */
    .comic-section {
      padding: 50px 24px 80px;
    }
    .comic-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 28px;
      max-width: 1300px;
      margin: 0 auto;
    }
    /* Wide panel for panel 4 (midpoint climax) */
    .panel--wide {
      grid-column: 1 / -1;
    }

    .panel {
      background: #fff;
      border: 4px solid var(--ink);
      box-shadow: 8px 8px 0 var(--ink);
      overflow: hidden;
      transition: transform .15s, box-shadow .15s;
    }
    .panel:hover {
      transform: translate(-4px, -4px);
      box-shadow: 12px 12px 0 var(--ink);
    }
    .panel-header {
      background: var(--red);
      padding: 4px 12px;
      border-bottom: 3px solid var(--ink);
    }
    .panel-num {
      font-family: 'Bangers', cursive;
      font-size: .85rem;
      letter-spacing: 3px;
      color: #fff;
    }
    .panel-image-wrap img {
      width: 100%;
      display: block;
      border-bottom: 3px solid var(--ink);
    }
    .panel-body {
      padding: 14px 16px;
      background: var(--cream);
    }

    /* Speech bubbles */
    .bubble {
      display: inline-block;
      background: #fff;
      border: 3px solid var(--ink);
      border-radius: 18px;
      padding: 7px 14px;
      font-family: 'Comic Neue', cursive;
      font-weight: 700;
      font-size: .9rem;
      margin-bottom: 8px;
      max-width: 100%;
      position: relative;
    }
    .bubble::after {
      content: '';
      position: absolute;
      bottom: -13px; left: 22px;
      border: 7px solid transparent;
      border-top-color: var(--ink);
    }
    .bubble--thought {
      border-radius: 50px;
      font-style: italic;
    }
    .bubble--shout {
      background: #fff7a0;
      border-color: #e6a400;
      font-size: 1rem;
    }
    .bubble--whisper {
      opacity: .8;
      font-size: .82rem;
      border-style: dashed;
    }

    .caption {
      font-style: italic;
      font-size: .88rem;
      color: #333;
      line-height: 1.5;
      margin-top: 6px;
    }

    /* ── Footer ── */
    footer {
      text-align: center;
      padding: 32px;
      font-family: 'Bangers', cursive;
      font-size: 1.1rem;
      color: var(--gold);
      letter-spacing: 4px;
      opacity: .7;
      border-top: 4px solid #2a2a3e;
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
    <h2 class="section-title">CAST OF CHARACTERS</h2>
    <div class="ref-sheet-wrap">
      <img src="${refSheetPath}" alt="Character Reference Sheet" />
    </div>
    <div class="char-grid">
      ${charRoster}
    </div>
  </section>

  <section class="comic-section">
    <h2 class="section-title" style="color:var(--gold); margin-bottom:32px;">THE STORY</h2>
    <div class="comic-grid">
      ${panelCards}
    </div>
  </section>

  <footer>THE END &mdash; Generated by Comic Book AI Agent</footer>

</body>
</html>`;
}
