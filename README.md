# Solitaire

A classic Klondike Solitaire card game with a pixel art aesthetic. Play it at [solitaire.yess.lol](https://solitaire.yess.lol/).

## Play

No install, no build step. Just open `index.html` in a browser:

```
open index.html
```

## Features

- **Click or drag** — pick up cards with a click, then click to place, or drag and drop
- **Double-click** to send a card straight to its foundation
- **Draw 1 or Draw 3** — flip one card at a time, or three for a challenge (3 passes through the stock in Draw 3 mode)
- **Lazy / Sisyphus modes** — Lazy auto-moves cards with a single click; Sisyphus makes you pick and place every card yourself
- **Undo** — rewind as many moves as you want with the undo button or `Cmd+Z`
- **Move counter** — tracks your moves
- **Help carousel** — 7-slide tutorial built into the game

## Tech

Vanilla HTML, CSS, and JS — no frameworks, no bundler, no dependencies. The only external resource is [Silkscreen](https://fonts.google.com/specimen/Silkscreen) from Google Fonts.

Three scripts loaded in order:

| File | Role |
|------|------|
| `js/game.js` | Pure game logic and state (no DOM) |
| `js/render.js` | DOM rendering |
| `js/main.js` | Event handling and UI coordination |

## Tests

Tests live in `js/game.test.js` and cover all game logic. Run them with Node:

```
node -e "global.window = {}; eval(require('fs').readFileSync('js/game.js', 'utf-8')); global.Game = window.Game; eval(require('fs').readFileSync('js/game.test.js', 'utf-8'));"
```

Or open `test.html` in a browser.
