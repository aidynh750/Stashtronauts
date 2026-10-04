# Stashtronauts

A friendly money tracker where savings goals are planets in a calm 3D space scene.

## Platform: desktop first
- Design and test for a wide landscape browser window with a mouse and keyboard (check at about 1440 by 900).
- Do not design screens like a phone: no bottom sheets, slide-up tabs, or single-column stacks as the main layout.
- A phone layout is a separate, later task. Until then, narrow windows only get a plain fallback so nothing breaks (the `max-width:900px` block in `console.css`).

## How it's built
- Plain HTML, CSS and JavaScript ES modules. No build step and no framework. three.js loads from a CDN through the import map in `index.html`.
- `space.js`: the 3D world. Planets come from saved goals and are generated from their mythology name.
- `console.js` / `console.css`: the ship console, a tablet that opens over the world. Money is entered in the keypad dialog (`#pad`).
- `money.js`: saved data, plain-English money formatting and the payoff simulation (`sim()`), shared by both.
- The console and the world talk through window events: `stash:change`, `stash:show`, `stash:thumb`, `stash:thumbs`.

## Rules worth keeping
- Saved data lives in `localStorage` under `stashtronauts-v1` (older data under `vaultcore-v3` is migrated). Never break existing saved data.
- Plain-English wording, warm and never shaming. Explain any finance term in friendly words.
- Every field has a label, focus stays inside open dialogs, and `prefers-reduced-motion` is respected.
- Art direction is in `docs/STYLE.md`.
