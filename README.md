# Comic Book AI

AI-powered comic book generator that creates full visual stories from a single idea.

**Live app:** [fabulous-friendship-production-606e.up.railway.app](https://fabulous-friendship-production-606e.up.railway.app)

**GitHub:** [github.com/nsajan/comicbook](https://github.com/nsajan/comicbook)

## How It Works

1. **Enter your idea** and pick an art style
2. **Meet your cast** — Claude designs 4-6 characters with detailed descriptions, Google Imagen draws a reference sheet
3. **Approve or regenerate** — review the characters before committing
4. **Watch it draw** — 7 panels generated in parallel with character consistency via reference image
5. **Read your comic** — full visual story with speech bubbles, captions, and narrative arc

## Art Styles

| Style | Vibe |
|-------|------|
| Kawaii | Chibi proportions, sparkly eyes, pastel candy colors |
| Pixar 3D | Cinematic animation, expressive faces, dramatic lighting |
| Manga | Bold ink lines, screentones, dynamic anime expressions |
| Storybook | Soft watercolor, warm cozy palette, children's book feel |
| Retro Comic | Bold primaries, halftone dots, golden-age American comic |
| Ghibli | Painterly, soulful, lush and naturalistic |

## Architecture

```
User Idea
    |
    v
[Claude Sonnet] --> Characters + Premise (JSON)
    |
    v
[Google Imagen 3] --> Character Reference Sheet
    |
    v
[Claude Sonnet] --> 7-Panel Story with Dialogue
    |
    v
[Gemini 2.5 Flash Image] --> 7 Panels (parallel, with ref image)
    |
    v
HTML Comic Book
```

### Tech Stack

- **Text/Story:** [Claude Sonnet](https://docs.anthropic.com/en/docs/about-claude/models) via `@anthropic-ai/sdk`
- **Images:** [Google Imagen 3](https://cloud.google.com/vertex-ai/generative-ai/docs/image/overview) + [Gemini 2.5 Flash](https://ai.google.dev/gemini-api/docs) via `@google/genai`
- **Server:** Express 5 with SSE progress streaming
- **Hosting:** [Railway](https://railway.com)
- **Secrets:** [Cloudflare Secrets Store](https://developers.cloudflare.com/workers/configuration/secrets/)

### Project Structure

```
comicbook/
  server.js              # Express web server (SSE, multi-step UX)
  index.js               # CLI entry point
  styles.js              # 6 art style presets
  utils.js               # Retry logic, helpers
  pipeline/
    characters.js        # Claude: character + premise generation
    story.js             # Claude: 7-panel story scripting
    refsheet.js          # Imagen: character reference sheet
    panels.js            # Gemini: 7 panel images with ref
    render.js            # HTML comic renderer
```

## Setup

```bash
# Clone
git clone https://github.com/nsajan/comicbook.git
cd comicbook

# Install
npm install

# Configure
cp .env.example .env
# Add your keys:
#   ANTHROPIC_API_KEY=sk-ant-...
#   GEMINI_API_KEY=AIza...

# Run locally
npm start          # web server on http://localhost:3000
npm run dev        # CLI mode
```

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Claude API for character/story generation |
| `GEMINI_API_KEY` | Google Imagen + Gemini for image generation |
| `PORT` | Server port (default: 3000, Railway sets 8080) |

## Deploy to Railway

```bash
npm install -g @railway/cli
railway login
railway init
railway variables set ANTHROPIC_API_KEY=sk-ant-...
railway variables set GEMINI_API_KEY=AIza...
railway up
railway domain   # get your public URL
```

## License

ISC
