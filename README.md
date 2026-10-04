# Stashtronauts
# Stashtronauts (working title)

Turn your savings goals into planets you can watch grow. A friendly money tracker for people who find finance apps intimidating, growing into a playable space world.

**Live demo:** https://YOUR-USERNAME.github.io/money-world/

**Status:** The tracker works today, and the first space view is live: your savings goals appear as planets you can pan, zoom and tap. The rest of the planet world is in active development.

## What it does today
- **What you have:** track your accounts and see what you have minus what you owe
- **Goals and limits:** savings goals with a projected finish date, plus monthly spending limits that drain as you spend
- **Debts and payoff plan:** compares paying highest interest first vs. smallest balance first, with a debt-free date, total interest, and what extra payments save
- **Plain-English wording** throughout, with a guided start for first-time users

## Privacy first
No account, no bank connection, no server. Everything is saved in your browser on your own device.

## The vision
Replace the tabs with a free-flying space scene.
- Each goal is a planet with a fixed mythology-inspired name plus your own label, like "Elysium: Car fund"
- Planet looks are generated from layers (biome, landmarks, variation seeded from the name), so no two look the same
- Tap a planet to zoom in and meet its residents, who have personalities and moods that follow your saving habits
- Deposits arrive as cargo pods, transfers fly between planets by spaceship, planned withdrawals leave as supply ships, and unplanned ones arrive as asteroids that leave craters which heal as savings rebuild
- An emergency fund acts as a planet shield
- A paranoid, never-landing guide in a cluttered ship spots asteroids first and walks new users through a hands-on tutorial

**Art direction:** original designs inspired by the calm, chunky worlds of Astroneer and the expressive characters of Tomodachi Life, built entirely in code.

## Roadmap
- [x] Working tracker: accounts, goals, budgets, debt payoff planner
- [x] Live on GitHub Pages
- [x] Space view with pan and zoom
- [x] Procedurally generated planets
- [ ] Zoom into planets and meet residents
- [ ] Money events: deposits, withdrawals, transfers
- [ ] The guide and onboarding tutorial
- [ ] Debt planet and spending belt
- [ ] Later: AI-powered guide, shared universes for couples

## Technical highlights
- Plain HTML, CSS, and JavaScript with no frameworks
- A month-by-month payoff simulation (`sim()` in `tracker.js`) with compounding interest and rolled-over payments
- State saved with `localStorage`, so there is no backend
- A canvas space view (`space.js`) with parallax stars, pan and pinch zoom, and planets generated from a seed so the same name always gives the same planet
- Respects `prefers-reduced-motion`

## Files
- `index.html`, `space.css`, `space.js`: the space view (home page)
- `tracker.html`, `tracker.css`, `tracker.js`: the money tracker
- `docs/STYLE.md`: the art style guide

## Run it locally
1. Open this folder in VS Code
2. Install the Live Server extension
3. Right-click `index.html` and choose Open with Live Server (the tracker is at `tracker.html`)

## Disclaimer
This is a tracking tool, not financial advice.
