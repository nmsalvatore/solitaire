'use strict';

// ── Minimal test runner ───────────────────────────

let _passed = 0;
let _failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    _passed++;
  } catch (err) {
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err.message}`);
    _failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// ── Tests ─────────────────────────────────────────

// createDeck
test('createDeck produces 52 cards', () => {
  const deck = _createDeck();
  assertEqual(deck.length, 52);
});

test('createDeck produces 52 unique suit+rank pairs', () => {
  const deck = _createDeck();
  const keys = new Set(deck.map(c => `${c.suit}:${c.rank}`));
  assertEqual(keys.size, 52);
});

// shuffle
test('shuffle returns all 52 cards (no loss or duplication)', () => {
  const deck = _shuffle(_createDeck());
  assertEqual(deck.length, 52);
  const keys = new Set(deck.map(c => `${c.suit}:${c.rank}`));
  assertEqual(keys.size, 52);
});

// initGame
test('initGame deals correct card counts per tableau column', () => {
  const state = Game.initGame();
  for (let col = 0; col < 7; col++) {
    assertEqual(state.tableau[col].length, col + 1, `column ${col} should have ${col + 1} cards`);
  }
});

test('initGame: only the top card of each tableau column is face-up', () => {
  const state = Game.initGame();
  for (let col = 0; col < 7; col++) {
    const column = state.tableau[col];
    for (let i = 0; i < column.length - 1; i++) {
      assert(!column[i].faceUp, `col ${col} card ${i} should be face-down`);
    }
    assert(column[column.length - 1].faceUp, `col ${col} top card should be face-up`);
  }
});

test('initGame stock + tableau = 52 cards', () => {
  const state = Game.initGame();
  const tableauCount = state.tableau.reduce((sum, col) => sum + col.length, 0);
  assertEqual(tableauCount + state.stock.length, 52);
});

// canMoveToFoundation
test('canMoveToFoundation: Ace to empty pile', () => {
  const ace = { suit: 'hearts', rank: 1, faceUp: true };
  assert(Game.canMoveToFoundation(ace, []));
});

test('canMoveToFoundation: non-Ace to empty pile returns false', () => {
  const two = { suit: 'hearts', rank: 2, faceUp: true };
  assert(!Game.canMoveToFoundation(two, []));
});

test('canMoveToFoundation: sequential same-suit accepted', () => {
  const ace  = { suit: 'spades', rank: 1, faceUp: true };
  const two  = { suit: 'spades', rank: 2, faceUp: true };
  assert(Game.canMoveToFoundation(two, [ace]));
});

test('canMoveToFoundation: wrong rank rejected', () => {
  const ace   = { suit: 'spades', rank: 1, faceUp: true };
  const three = { suit: 'spades', rank: 3, faceUp: true };
  assert(!Game.canMoveToFoundation(three, [ace]));
});

test('canMoveToFoundation: wrong suit rejected', () => {
  const ace      = { suit: 'spades', rank: 1, faceUp: true };
  const twoHeart = { suit: 'hearts', rank: 2, faceUp: true };
  assert(!Game.canMoveToFoundation(twoHeart, [ace]));
});

// canMoveToTableau
test('canMoveToTableau: King to empty column', () => {
  const king = { suit: 'spades', rank: 13, faceUp: true };
  assert(Game.canMoveToTableau(king, []));
});

test('canMoveToTableau: non-King to empty column returns false', () => {
  const queen = { suit: 'spades', rank: 12, faceUp: true };
  assert(!Game.canMoveToTableau(queen, []));
});

test('canMoveToTableau: alternating color descending accepted', () => {
  const redQueen  = { suit: 'hearts',   rank: 12, faceUp: true };
  const blackJack = { suit: 'spades',   rank: 11, faceUp: true };
  assert(Game.canMoveToTableau(blackJack, [redQueen]));
});

test('canMoveToTableau: same color rejected', () => {
  const redQueen = { suit: 'hearts',   rank: 12, faceUp: true };
  const redJack  = { suit: 'diamonds', rank: 11, faceUp: true };
  assert(!Game.canMoveToTableau(redJack, [redQueen]));
});

test('canMoveToTableau: face-down top card rejected', () => {
  const faceDown = { suit: 'hearts', rank: 12, faceUp: false };
  const jack     = { suit: 'spades', rank: 11, faceUp: true };
  assert(!Game.canMoveToTableau(jack, [faceDown]));
});

// drawFromStock
test('drawFromStock moves top stock card to waste', () => {
  const state = Game.initGame();
  const originalStockLen = state.stock.length;
  const topCard = state.stock[state.stock.length - 1];
  Game.drawFromStock();
  const s = Game.getState();
  assertEqual(s.stock.length, originalStockLen - 1);
  assertEqual(s.waste.length, 1);
  assertEqual(s.waste[0].suit, topCard.suit);
  assertEqual(s.waste[0].rank, topCard.rank);
  assert(s.waste[0].faceUp);
});

test('drawFromStock recycles waste back to stock when stock is empty', () => {
  // Drain entire stock first
  const state = Game.initGame();
  while (Game.getState().stock.length > 0) {
    Game.drawFromStock();
  }
  const wasteLen = Game.getState().waste.length;
  assert(wasteLen > 0, 'waste should have cards before recycling');
  // Calling drawFromStock on empty stock recycles waste → stock (no simultaneous draw)
  Game.drawFromStock();
  const s = Game.getState();
  assertEqual(s.waste.length, 0, 'waste should be empty after recycle');
  assertEqual(s.stock.length, wasteLen, 'stock should have all recycled cards');
  // Cards should be face-down after recycle
  assert(s.stock.every(c => !c.faceUp), 'recycled cards should be face-down');
});

// moveToFoundation
test('moveToFoundation: Ace moves correctly, returns true', () => {
  const state = Game.initGame();
  // Inject an Ace of spades into waste for easy access
  const ace = { suit: 'spades', rank: 1, faceUp: true };
  state.waste.push(ace);
  const moved = Game.moveToFoundation(ace, { type: 'waste' });
  assert(moved, 'should return true');
  assertEqual(Game.getState().foundations[0].length, 1);
  assertEqual(Game.getState().waste.length, 0);
});

test('moveToFoundation: invalid move returns false', () => {
  const state = Game.initGame();
  const two = { suit: 'spades', rank: 2, faceUp: true };
  state.waste.push(two);
  const moved = Game.moveToFoundation(two, { type: 'waste' });
  assert(!moved, 'should return false for invalid move');
});

// moveToTableau
test('moveToTableau: moves a single card to valid target', () => {
  const state = Game.initGame();
  // Empty col 0, put a King of hearts in waste
  state.tableau[0] = [];
  const king = { suit: 'hearts', rank: 13, faceUp: true };
  state.waste.push(king);
  const moved = Game.moveToTableau([king], 0, { type: 'waste' });
  assert(moved, 'should return true');
  assertEqual(Game.getState().tableau[0].length, 1);
  assertEqual(Game.getState().waste.length, 0);
});

test('moveToTableau: moves a multi-card stack', () => {
  const state = Game.initGame();
  // Put a red Queen and black Jack stack in waste-like fashion via tableau
  state.tableau[0] = [];
  const redQueen  = { suit: 'hearts',  rank: 12, faceUp: true };
  const blackJack = { suit: 'spades',  rank: 11, faceUp: true };
  // Place them in col 1 as a stack
  state.tableau[1] = [redQueen, blackJack];
  // Put a black King in col 0
  const blackKing = { suit: 'spades', rank: 13, faceUp: true };
  state.tableau[0] = [blackKing];

  // Move queen+jack stack from col 1 index 0 onto col 0
  // canMoveToTableau(redQueen, [blackKing]) — red on black, 12 on 13 → valid
  const moved = Game.moveToTableau([redQueen, blackJack], 0, { type: 'tableau', colIndex: 1 });
  assert(moved, 'should return true');
  assertEqual(Game.getState().tableau[0].length, 3, 'col 0 should have king+queen+jack');
  assertEqual(Game.getState().tableau[1].length, 0, 'col 1 should be empty');
});

test('moveToTableau: invalid move returns false', () => {
  const state = Game.initGame();
  state.tableau[0] = [];
  const queen = { suit: 'hearts', rank: 12, faceUp: true };
  state.waste.push(queen);
  // Queen to empty col requires King
  const moved = Game.moveToTableau([queen], 0, { type: 'waste' });
  assert(!moved, 'should return false');
});

// checkWin
test('checkWin returns false mid-game', () => {
  Game.initGame();
  assert(!Game.checkWin());
});

test('checkWin returns true when all foundations have 13 cards', () => {
  const state = Game.initGame();
  // Fill all foundations manually
  const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
  SUITS.forEach((suit, i) => {
    state.foundations[i] = [];
    for (let rank = 1; rank <= 13; rank++) {
      state.foundations[i].push({ suit, rank, faceUp: true });
    }
  });
  assert(Game.checkWin());
});

// ── Summary ───────────────────────────────────────

window._testResults = { passed: _passed, failed: _failed };
const total = _passed + _failed;
console.log('');
console.log(`Results: ${_passed}/${total} passed${_failed > 0 ? ` — ${_failed} FAILED` : ' — all green'}`);

// ── Private helpers (not exported by game.js) ────
// Re-implement locally so tests are self-contained.

function _createDeck() {
  const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
  const deck = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank++) {
      deck.push({ suit, rank, faceUp: false });
    }
  }
  return deck;
}

function _shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
