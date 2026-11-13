# Studio Arcade

Browser builds of **GRAZEFIRE**, **HOLLOW CROWN**, and **BRIGHTFIELD**, meant to be served from GitHub Pages as a single site.

Open the Pages URL (or `index.html` on any static host) and pick a game. Each one is plain HTML and JavaScript with procedural art and Web Audio — no extra assets, accounts, or install.

## Games

- [GRAZEFIRE](grazefire/) — v0.17.0. Neon vertical shmup. Keyboard: arrows move, Z fire, X Overdrive, C Clutch, V Focus / Wrath. Esc pauses.
- [HOLLOW CROWN](hollow-crown/) — v0.5.2. Storybook auto-battler. Mouse to recruit and place; R reroll, F freeze, U upgrade, Space battle, S speed, M mute.
- [BRIGHTFIELD](brightfield/) — v0.6.2. Kid-friendly city builder from smog to solarpunk. Mouse or touch: tap a card, then a hex. 1/2/3 pick a card, Esc deselect, M mute.

## GitHub Pages

Serve the repository root from the `main` branch (Settings → Pages → Deploy from a branch → `main` / `/`). A `.nojekyll` file is included so Pages leaves the files alone.

Project-site URLs (`https://<user>.github.io/<repo>/`) work; every link and script path is relative.
