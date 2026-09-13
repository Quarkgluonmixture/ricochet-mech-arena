You are generating art assets for a small Three.js first-person mech game. Use your image generation tool (GPT Image 2.5 if selectable, otherwise the best available image model). Generate the SIX images below, one at a time, and save each as a PNG at the exact path given (directory ./assets-src/ — create it if needed). Do not edit or create any other file. Style across all six: clean sci-fi, dark navy/steel palette with cyan accent light, matte surfaces, no text, no logos, no watermarks.

1. ./assets-src/floor.png — 1024x1024. SEAMLESS TILEABLE texture, strictly top-down orthographic, even flat lighting, no perspective, no vignette. Dark blue-grey steel deck plates: a 2x2 grid of large panels with thin recessed seams, subtle brushed-metal grain and light scratches, tiny recessed bolts at panel corners, one faint cyan emissive micro-dot at each seam intersection. Edges must wrap perfectly.

2. ./assets-src/wall-side.png — 1536x1024 (landscape). SEAMLESS HORIZONTALLY TILEABLE texture of a sci-fi bulkhead wall, straight-on front view, even flat lighting, no perspective. Brushed dark steel with vertical structural ribs every ~1/4 of the width, a thin cyan light line running the full width near the top edge, small recessed vents low down. Left and right edges must wrap perfectly.

3. ./assets-src/wall-top.png — 1024x1024. SEAMLESS TILEABLE top-down texture of dark steel grating/trim: fine anti-slip diamond plate or narrow grate pattern, very dark charcoal-blue, subtle wear, no perspective, even lighting. Edges wrap perfectly.

4. ./assets-src/hull.png — 1024x1024. SEAMLESS TILEABLE texture of mech armour plating, straight-on, even lighting: light grey-blue matte composite plates with clean panel lines, a few small hexagonal bolts, faint scuffs, one thin diagonal stripe. Mid-brightness so it can be tinted. Edges wrap perfectly.

5. ./assets-src/sky.png — 1536x1024 (landscape). A 360-degree panoramic backdrop (equirectangular feel: horizon line exactly at the vertical middle, no obvious single vanishing point) of the inside of a vast dark hangar arena at night: very dark navy ceiling structure fading to black at the top, distant floodlights and cyan strip lights along the far walls near the horizon, thin atmospheric haze, the bottom half fading to near black. No floor detail, no characters, no text.

6. ./assets-src/keyart.png — 1536x1024 (landscape). Key art: two bipedal walker mechs, one blue-accented and one red-accented, facing each other across a neon-lit steel maze arena with low walls, glowing white shells ricocheting off the walls leaving light trails, low dramatic camera angle, cinematic lighting, painterly-realistic, dark navy palette with cyan and warm red accents. No text, no logos.

When all six exist, print a summary with one line per file: `FILE <path> <width>x<height>` and a final line `MODEL <image model actually used>`.
