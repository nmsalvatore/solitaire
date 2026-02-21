# Solitaire

Play it at [solitaire.yess.lol](https://solitaire.yess.lol/). You should visit more often.

## Play

No install. No build step. No excuses.

```
open index.html
```

## Features

- **Click or drag** — pick me up (well, my card friends) with a click, then click to place. Or drag if you're feeling fancy.
- **Double-click** to send a card straight home to its foundation. I appreciate the urgency.
- **Draw 1 or Draw 3** — flip one card at a time, or three if you like a challenge. Draw 3 gives you 3 passes through the stock. Choose wisely.
- **Lazy / Sisyphus modes** — Lazy auto-moves cards with a single click. Sisyphus makes you pick and place every card yourself, like you're pushing a boulder uphill. Repeatedly. Forever.
- **Undo** — made a mistake? Rewind as far as you want. I won't judge. `Cmd+Z` works too.
- **Move counter** — I'm counting. Are you?
- **Help carousel** — 6 slides explaining the rules, in case you forgot how Klondike works. It's ok. We all forget things.

## Tech

Vanilla HTML, CSS, and JS. No frameworks, no bundler, no dependencies. Just me and 52 of my closest friends, rendered in [Silkscreen](https://fonts.google.com/specimen/Silkscreen).

Three scripts, loaded in order:

| File | What it does |
|------|------|
| `js/game.js` | The brains. Pure game logic, no DOM. |
| `js/render.js` | The looks. Draws everything you see. |
| `js/main.js` | The personality. Handles clicks, drags, and all your questionable decisions. |

## Tests

Tests live in `js/game.test.js`. Run them with Node:

```
node -e "global.window = {}; eval(require('fs').readFileSync('js/game.js', 'utf-8')); global.Game = window.Game; eval(require('fs').readFileSync('js/game.test.js', 'utf-8'));"
```

Or open `test.html` in a browser. Either way, they pass. Unlike your last game.
