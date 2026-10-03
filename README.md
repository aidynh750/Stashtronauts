# Vaultcore (working title)

A beginner-friendly money tracker for people who find finance apps intimidating. Plain-English wording, no account, no bank connection: all data stays on the user's device.

## Features
- **What you have:** track accounts and see "what you have minus what you owe"
- **Goals and limits:** savings goals with a projected finish date, plus monthly spending limits that drain as you spend
- **Debts and payoff plan:** compares "highest interest first" vs. "smallest balance first" with debt-free date and total interest, and shows what extra payments save

## Run it
1. Open this folder in VS Code
2. Install the **Live Server** extension
3. Right-click `index.html` > Open with Live Server

## Deploy (free)
Push to GitHub, then Settings > Pages > deploy from the `main` branch.

## How it works
- Plain HTML, CSS and JavaScript, no frameworks
- `sim()` in `app.js` runs a month-by-month payoff simulation with compounding interest and rolled-over payments
- State is saved with `localStorage`, so there is no backend

## Roadmap: the planet world
Replace the tabs with a space scene where each goal is a planet.
- Fixed planet names from mythology/astronomy plus a user label (e.g. "Elysium: Car fund")
- Planet looks built from layers: ~6 biomes x ~5 landmark themes x variation seeded from the planet's name
- Residents built from mix-and-match parts, with idle routines (walk, fish, build) and moods that follow saving habits
- Deposits land as cargo pods; transfers fly between planets by spaceship; planned withdrawals leave as supply ships; unplanned ones arrive as asteroids that leave craters which heal as savings rebuild
- An emergency fund acts as a planet shield
- A guide character the user names, plus a nameable universe, with a short onboarding flow
- Later: AI chat guide (needs a small backend), shared universes for couples

## Notes
- Name "Orbitly" was rejected after a web search found several existing products using it; pick and check a new name (USPTO, domain, GitHub, socials) before launch.
- This is a tracking tool, not financial advice.
