/**
 * Character style presets.
 * Each preset has:
 *   characterPrompt — injected into the LLM character-designer prompt
 *   imageStyle      — appended to every nano-banana image prompt
 */
export const STYLES = {
  kawaii: {
    id: 'kawaii',
    label: 'Kawaii',
    emoji: '🌸',
    description: 'Chibi proportions, huge sparkly eyes, pastel candy colors',
    characterPrompt:
      'Style: KAWAII CHIBI. Characters must have oversized round heads, tiny compact bodies, ' +
      'enormous sparkling eyes with highlights and thick lashes, rosy cheeks, tiny button noses, ' +
      'exaggerated cute expressions. Pastel and candy-bright color palettes. Every character must ' +
      'look irresistibly adorable — even villains should be cute-menacing, not scary.',
    imageStyle:
      'kawaii chibi art style, huge sparkling expressive eyes, round cute chibi proportions, ' +
      'pastel candy colors, rosy cheeks, soft cel-shading, adorable expressive faces, ' +
      'Japanese cute aesthetic, clean thick outlines',
  },

  pixar: {
    id: 'pixar',
    label: 'Pixar 3D',
    emoji: '🎬',
    description: 'Cinematic 3D animation, expressive faces, dramatic lighting',
    characterPrompt:
      'Style: PIXAR 3D ANIMATION. Characters have expressive faces capable of a wide emotional range, ' +
      'stylised-but-grounded proportions (slightly enlarged eyes and head), memorable silhouettes, ' +
      'richly textured clothing and accessories. Think the character design quality of Pixar films — ' +
      'each character instantly readable and emotionally resonant.',
    imageStyle:
      'Cinematic Pixar 3D animation style, expressive characters, dramatic cinematic lighting, ' +
      'high detail subsurface skin, cel-shaded with soft GI, vibrant saturated colors, ' +
      'thick bold ink outlines, Pixar-meets-graphic-novel aesthetic',
  },

  manga: {
    id: 'manga',
    label: 'Manga',
    emoji: '⚡',
    description: 'Bold black-ink lines, screentones, dynamic anime expressions',
    characterPrompt:
      'Style: MANGA / ANIME. Characters have large expressive eyes with detailed iris and catchlights, ' +
      'dramatic spiky or flowing hair with strong shape, slim anime proportions, exaggerated emotional ' +
      'expressions. Describe clothing with clear silhouette (school uniform, armour, streetwear). ' +
      'Each character should look like they belong in a top-selling manga series.',
    imageStyle:
      'Black and white manga art style, bold dynamic ink lines, screentone shading, ' +
      'dramatic speed lines and impact effects, large expressive anime eyes, ' +
      'high-contrast inking, manga panel composition, action manga aesthetic',
  },

  storybook: {
    id: 'storybook',
    label: 'Storybook',
    emoji: '📖',
    description: 'Soft watercolor, warm cozy palette, classic illustrated children\'s book',
    characterPrompt:
      'Style: ILLUSTRATED STORYBOOK. Characters are warm, rounded, and immediately loveable — ' +
      'soft simple shapes, friendly wide eyes, gentle expressions. Clothing is charming and textured ' +
      '(knitted scarves, worn boots, patchwork). Think classic illustrated children\'s books like ' +
      'Beatrix Potter or modern picture books. Characters feel hand-painted and full of heart.',
    imageStyle:
      'Soft watercolor storybook illustration, hand-painted texture, warm earthy and pastel palette, ' +
      'gentle ink outlines, whimsical charming characters, golden-hour glow, ' +
      'classic children\'s picture-book aesthetic',
  },

  retrocomic: {
    id: 'retrocomic',
    label: 'Retro Comic',
    emoji: '💥',
    description: 'Bold primaries, halftone dots, golden-age American comic book',
    characterPrompt:
      'Style: GOLDEN-AGE AMERICAN COMIC BOOK. Characters are bold and archetypal — strong-jawed heroes, ' +
      'dramatic villains, vivid costumes in primary colors (red, blue, yellow). Muscular heroes, ' +
      'caped figures, femme fatales in pencil skirts. Descriptions should mention bold costume colors ' +
      'and graphic silhouettes. Think 1950s–60s DC/Marvel aesthetic.',
    imageStyle:
      'Classic golden-age American comic book style, bold primary colors, Ben-Day halftone dot pattern, ' +
      'thick black ink outlines, vintage 1960s print aesthetic, flat graphic color fills, ' +
      'dramatic shadow hatching, retro superhero comic book look',
  },

  ghibli: {
    id: 'ghibli',
    label: 'Ghibli',
    emoji: '🌿',
    description: 'Studio Ghibli anime — painterly, soulful, lush and naturalistic',
    characterPrompt:
      'Style: STUDIO GHIBLI ANIME. Characters have soulful expressive eyes with visible depth and emotion, ' +
      'natural believable hair with movement, practical lived-in clothing (aprons, capes, adventure gear). ' +
      'Even fantasy characters feel grounded and real. Faces are gentle and emotionally complex — ' +
      'capable of joy, sadness, wonder and determination. Think Spirited Away, Princess Mononoke, Howl\'s Moving Castle.',
    imageStyle:
      'Studio Ghibli anime art style, lush painterly backgrounds, soft hand-drawn animation aesthetic, ' +
      'soulful expressive eyes, natural warm diffused lighting, detailed environmental storytelling, ' +
      'Ghibli color palette of warm greens blues and earth tones',
  },
};

export const DEFAULT_STYLE_ID = 'pixar';
export function getStyle(id) {
  return STYLES[id] ?? STYLES[DEFAULT_STYLE_ID];
}
