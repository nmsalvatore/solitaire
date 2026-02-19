# CLAUDE.md

This is a simple Klondike Solitaire game built with HTML, CSS, and Vanilla JS.

## Running the Game

No build step. Open `index.html` directly in a browser:

```
open index.html
```

There are no dependencies to install, no dev server, and no bundler. The only external resource is Google Fonts (Press Start 2P) loaded via CDN.

## Architecture

Three vanilla JS files are loaded as plain `<script>` tags in this order (order matters — each depends on the previous):

1. **`js/game.js`** — Pure game logic and state. Exports `window.Game`. No DOM access. Manages the single `state` object: `{ stock, waste, foundations[4], tableau[7] }`. Cards are `{ suit, rank, faceUp }` with ranks 1–13 (1=Ace, 13=King).

2. **`js/render.js`** — DOM rendering only. Exports `window.Render`. Reads `window.Game` for helpers. Called via `Render.renderGame(state, selection)` to fully re-render the board on every state change.

3. **`js/main.js`** — Event handling and UI coordination. No exports. Owns `selection` state (click-to-select flow) and `dragState` (drag-and-drop flow). Calls `Game.*` to mutate state, then `redraw()` which calls `Render.renderGame`.

`index.html` contains the full static HTML structure including the help modal (4-slide carousel) and win screen overlay. `style.css` contains all styles — pixel art aesthetic using the "Press Start 2P" font.

## Key Patterns

- **Global communication**: Modules talk via `window.Game` and `window.Render` — no ES modules or bundler.
- **Immutable re-render**: `redraw()` tears down and rebuilds all card DOM nodes on every state change. There is no incremental DOM update.
- **Card identity**: Cards are identified by `{ suit, rank }` pair. `resolveCard(cardEl)` in main.js bridges DOM → state object.
- **Tableau stacks**: In `state.tableau[colIndex]`, the bottom card is index 0, the top card is the last element. Moving a stack picks up from a given index to the end of the array.
- **Stock/waste**: `state.stock` top = last element (array used as a stack). Drawing pops from stock and pushes to waste. Recycling reverses waste back to stock.
- **Foundation index**: `state.foundations[i]` where `i` corresponds to `SUITS` order: `['spades', 'hearts', 'diamonds', 'clubs']`.
- **`suppressNextClick`**: A flag in main.js that prevents the click event that fires immediately after a drag-end from being misinterpreted as a card selection.

## Testing

- Tests are in `game.tests.js`
- No dependencies needed for testing strategy.
- Tests are run by opening `test.html` in the browser.
- **IMPORTANT**: For any new feature implemented that affects game, write a test first.
