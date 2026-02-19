'use strict';

// Card: { suit, rank, faceUp }
// Suits: 'spades', 'hearts', 'diamonds', 'clubs'
// Ranks: 1–13  (1=Ace, 11=J, 12=Q, 13=K)

const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
const RED_SUITS = new Set(['hearts', 'diamonds']);

// ── Deck ──────────────────────────────────────────

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank++) {
      deck.push({ suit, rank, faceUp: false });
    }
  }
  return deck;
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// ── State ─────────────────────────────────────────

let state = null;
let snapshot = null;
let moveCount = 0;
let drawCount = 1;

function saveSnapshot() {
  snapshot = { state: JSON.parse(JSON.stringify(state)), moveCount };
}

function undo() {
  if (snapshot) {
    state = snapshot.state;
    moveCount = snapshot.moveCount;
    snapshot = null;
    return true;
  }
  return false;
}

function canUndo() {
  return snapshot !== null;
}

function initGame() {
  const deck = shuffle(createDeck());
  const tableau = [[], [], [], [], [], [], []];

  let idx = 0;
  for (let col = 0; col < 7; col++) {
    for (let row = 0; row <= col; row++) {
      const card = deck[idx++];
      card.faceUp = (row === col); // only top card face-up
      tableau[col].push(card);
    }
  }

  state = {
    stock: deck.slice(idx).reverse(), // remaining cards, top of stack = last element
    waste: [],
    foundations: [[], [], [], []], // index matches SUITS order
    tableau,
  };

  snapshot = null;
  moveCount = 0;

  return state;
}

function getState() {
  return state;
}

// ── Helpers ───────────────────────────────────────

function isRed(card) {
  return RED_SUITS.has(card.suit);
}

function foundationIndex(suit) {
  return SUITS.indexOf(suit);
}

// ── Move validation ───────────────────────────────

function canMoveToFoundation(card, foundationPile) {
  if (foundationPile.length === 0) {
    return card.rank === 1; // must be Ace
  }
  const top = foundationPile[foundationPile.length - 1];
  return card.suit === top.suit && card.rank === top.rank + 1;
}

function canMoveToTableau(card, targetCol) {
  if (targetCol.length === 0) {
    return card.rank === 13; // only King to empty column
  }
  const top = targetCol[targetCol.length - 1];
  if (!top.faceUp) return false;
  return isRed(card) !== isRed(top) && card.rank === top.rank - 1;
}

// ── Actions ───────────────────────────────────────

function setDrawCount(n) {
  drawCount = n;
}

function getDrawCount() {
  return drawCount;
}

function drawFromStock() {
  moveCount++;
  if (state.stock.length === 0) {
    // Flip waste back to stock
    state.stock = state.waste.reverse().map(c => ({ ...c, faceUp: false }));
    state.waste = [];
  } else {
    const toDraw = Math.min(drawCount, state.stock.length);
    for (let i = 0; i < toDraw; i++) {
      const card = state.stock.pop();
      card.faceUp = true;
      state.waste.push(card);
    }
  }
}

// Move cards from source to tableau column
// cards: array (may be a stack from tableau)
// source: { type: 'waste'|'tableau'|'foundation', colIndex? }
function moveToTableau(cards, targetColIndex, source) {
  const targetCol = state.tableau[targetColIndex];
  if (!canMoveToTableau(cards[0], targetCol)) return false;

  moveCount++;
  _removeFromSource(cards, source);
  for (const card of cards) {
    targetCol.push(card);
  }
  _flipTopIfNeeded(source);
  return true;
}

function moveToFoundation(card, source, options) {
  const fi = foundationIndex(card.suit);
  if (!canMoveToFoundation(card, state.foundations[fi])) return false;

  if (!options || !options.skipCount) moveCount++;
  _removeFromSource([card], source);
  state.foundations[fi].push(card);
  card._landAnim = true;
  _flipTopIfNeeded(source);
  return true;
}

// ── Internal helpers ──────────────────────────────

function _removeFromSource(cards, source) {
  if (source.type === 'waste') {
    // cards is always [topOfWaste]
    state.waste.pop();
  } else if (source.type === 'tableau') {
    const col = state.tableau[source.colIndex];
    col.splice(col.length - cards.length, cards.length);
  } else if (source.type === 'foundation') {
    const fi = foundationIndex(cards[0].suit);
    state.foundations[fi].pop();
  }
}

function _flipTopIfNeeded(source) {
  if (source.type === 'tableau') {
    const col = state.tableau[source.colIndex];
    if (col.length > 0 && !col[col.length - 1].faceUp) {
      col[col.length - 1].faceUp = true;
      col[col.length - 1]._flipAnim = true;
    }
  }
}

// ── Win check ─────────────────────────────────────

function canAutoComplete() {
  if (state.stock.length > 0) return false;
  if (state.waste.length > 0) return false;
  return state.tableau.every(col => col.every(c => c.faceUp));
}

function checkWin() {
  return state.foundations.every(f => f.length === 13);
}

// ── Exports (globals, no module system) ───────────
// Attached to window so render.js / main.js can use them.

window.Game = {
  SUITS,
  initGame,
  getState,
  isRed,
  foundationIndex,
  canMoveToFoundation,
  canMoveToTableau,
  drawFromStock,
  moveToTableau,
  moveToFoundation,
  getMoveCount() { return moveCount; },
  setDrawCount,
  getDrawCount,
  canAutoComplete,
  checkWin,
  saveSnapshot,
  undo,
  canUndo,
};
