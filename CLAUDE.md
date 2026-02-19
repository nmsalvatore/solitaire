# CLAUDE.md

This is a simple Klondike Solitaire game built with HTML, CSS, and Vanilla JS.

## Running the Game

No build step. Open `index.html` directly in a browser:

```
open index.html
```

There are no dependencies to install, no dev server, and no bundler. The only external resource is Google Fonts (Silkscreen) loaded via CDN.

## Architecture

Three vanilla JS files are loaded as plain `<script>` tags in this order (order matters — each depends on the previous):

1. **`js/game.js`** — Pure game logic and state. Exports `window.Game`. No DOM access. Manages the single `state` object: `{ stock, waste, foundations[4], tableau[7] }`. Cards are `{ suit, rank, faceUp }` with ranks 1–13 (1=Ace, 13=King).

2. **`js/render.js`** — DOM rendering only. Exports `window.Render`. Reads `window.Game` for helpers. Called via `Render.renderGame(state, selection)` to fully re-render the board on every state change.

3. **`js/main.js`** — Event handling and UI coordination. No exports. Owns `selection` state (click-to-select flow) and `dragState` (drag-and-drop flow). Calls `Game.*` to mutate state, then `redraw()` which calls `Render.renderGame`.

`index.html` contains the full static HTML structure including the help modal (7-slide carousel) and win screen overlay. `style.css` contains all styles — pixel art aesthetic using the "Silkscreen" font.

## Key Patterns

- **Global communication**: Modules talk via `window.Game` and `window.Render` — no ES modules or bundler.
- **Immutable re-render**: `redraw()` tears down and rebuilds all card DOM nodes on every state change. There is no incremental DOM update.
- **Card identity**: Cards are identified by `{ suit, rank }` pair. `resolveCard(cardEl)` in main.js bridges DOM → state object.
- **Tableau stacks**: In `state.tableau[colIndex]`, the bottom card is index 0, the top card is the last element. Moving a stack picks up from a given index to the end of the array.
- **Stock/waste**: `state.stock` top = last element (array used as a stack). Drawing pops from stock and pushes to waste. Recycling reverses waste back to stock.
- **Foundation index**: `state.foundations[i]` where `i` corresponds to `SUITS` order: `['spades', 'hearts', 'diamonds', 'clubs']`.
- **`suppressClickUntil`**: A timestamp in main.js that suppresses clicks within 50ms after a drag-end to prevent the browser's synthetic click from being misinterpreted. Uses a timestamp instead of a boolean flag so stale state can't eat later genuine clicks.
- **Manual double-click detection**: Native `dblclick` events don't fire reliably because `redraw()` rebuilds the DOM between clicks, so the two clicks target different DOM nodes. Instead, `handleClick` tracks `lastClickedCardInfo` and `lastClickTime` to detect double-clicks manually. Detection runs before selection/tryDrop logic so it works regardless of prior selection state.

## Testing

- Tests are in `js/game.test.js` — a self-contained file with a minimal inline test runner (`test()`, `assert()`, `assertEqual()`).
- No dependencies needed. Tests run by opening `test.html` in a browser, or via Node: `node -e "global.window = {}; eval(require('fs').readFileSync('js/game.js', 'utf-8')); global.Game = window.Game; eval(require('fs').readFileSync('js/game.test.js', 'utf-8'));"`
- Tests cover `game.js` only (pure logic, no DOM). `render.js` and `main.js` are not unit-tested.
- **Coverage scope**: All public `Game.*` functions have direct test coverage — validation (`canMoveToFoundation`, `canMoveToTableau`), actions (`moveToFoundation`, `moveToTableau`, `drawFromStock`), setup (`initGame`), and win detection (`checkWin`). Internal helpers (`_removeFromSource`, `_flipTopIfNeeded`) are tested indirectly through the action functions across all three source types (waste, tableau, foundation). `isRed` and `foundationIndex` are trivial and covered indirectly.
- **IMPORTANT**: For any new feature that affects game logic, write a test first.
