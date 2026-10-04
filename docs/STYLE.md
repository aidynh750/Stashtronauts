# Stashtronauts art style

Everything is built in code with three.js on a `<canvas>`. There are no image files, models or borrowed assets.

## The feeling
Calm, chunky and friendly. Space should feel like a cozy place you want to visit, never a scary or busy one. Money is stressful enough. The art should lower the temperature.

We take inspiration from the *mood* of the calm, chunky worlds of Astroneer and the round, expressive characters of Tomodachi Life. We do not copy their characters, shapes, logos or assets. Every design here is original.

## Shapes
- **Chunky and low-detail.** Big simple forms, flat color patches, a few sizes of detail. If a detail is too small to see on a phone, leave it out.
- **Round over sharp.** Rounded hulls, soft lumpy terrain, circles for heads and bodies. Sharp points only for small accents like fins.
- **Soft outlines.** A thin, semi-transparent dark outline (`rgba(10,12,40,0.35)`), never solid black.

## Light and shading
- **One sun.** A single far-off light, so every planet has a clear lit side and a dark side. A faint cool fill keeps dark sides from going fully black.
- **Faceted, flat shading.** Planets are low-poly spheres where every face has one flat color, with stepped terrain so land looks chunky.
- **Glows are soft and additive** (atmospheres, the sun, engine flames). Keep them gentle.

## Color
- **Background:** deep navy with stars in every direction, a faint galaxy band, and far-off purple, teal and rose nebula clouds.
- **Biomes:** each planet uses one calm set: meadow green, ocean blue, dune sand, frost white, coral pink or crystal violet. Mid-tone and slightly warm. Avoid neon and pure saturated primaries.
- **UI accents:** mint `#7FE0C2` for progress and buttons, warm gold `#FFC56B` for "goal reached".
- **Text** is always light (`#EEF3FF`) with a soft dark shadow so it reads over anything.

## Generated from names
A planet's look comes from its mythology name (Elysium, Atlas, and so on). The name is turned into a number that seeds a repeatable random generator, so the same name always gives the same biome, size, terrain, ring and moon. New layered parts (landmarks, ship decals, character pieces) should follow the same rule: same seed in, same look out.

## Characters (later phases)
Round, expressive and built from layered parts (body, eyes, mouth, hair or hat, accessory) so they can be mixed and matched. Big readable faces. Emotion comes from eyes and mouth shape, not detail.

## Motion
- Ease in and out. Things speed up gently and slow down to land.
- Keep it calm: nothing in space moves on its own except the planets' slow spin. The ship moves only when you fly it, and its flame and trail show only while thrusting.
- **Respect `prefers-reduced-motion`.** When it is on, planets stop spinning and the camera moves in steps instead of gliding.

## Tone
Worry is allowed to be funny, never shaming. Any warning the art or the guide gives comes with a calm next step.
