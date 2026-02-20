'use strict';

// ── Selection state ───────────────────────────────
// { source: { type, colIndex? }, cards: Card[] }
let selection = null;

// Track last click for manual double-click detection (the native dblclick
// event doesn't fire reliably because redraw() rebuilds the DOM between clicks).
let lastClickedCardInfo = null;
let lastClickTime = 0;
const DBLCLICK_THRESHOLD = 400; // ms

// ── Drag state ────────────────────────────────────
// { cards, source, cardEls }  (cardEls: DOM nodes to mark .dragging)
let dragState = null;
// Suppress the click that fires right after a drag ends.
// Uses a timestamp so a stale flag can't eat a later genuine click.
let suppressClickUntil = 0;

// ── Storage helpers ──────────────────────────────
function storageGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function storageSet(k, v) { try { localStorage.setItem(k, v); } catch {} }

// ── Draw count preference ────────────────────────
const savedDraw = parseInt(storageGet('drawCount')) || 1;
Game.setDrawCount(savedDraw === 3 ? 3 : 1);

// ── Touch state ───────────────────────────────────
// null when idle; during a touch drag:
// { cards, source, startX, startY, isDragging, ghostEl, offsetX, offsetY, currentTarget }
let touchState = null;

// ── Auto-complete state ──────────────────────────
let autoCompleting = false;

// ── Lazy mode state ──────────────────────────────
let lazyMode = storageGet('lazyMode') === 'on';

// ── Helpers ───────────────────────────────────────

function redraw() {
  Render.renderGame(Game.getState(), selection);
  Game.consumeAnimations();
  document.getElementById('move-counter').textContent = 'MOVES: ' + Game.getMoveCount();
  if (!autoCompleting && Game.canAutoComplete()) {
    runAutoComplete();
  }
}

function clearSelection() {
  selection = null;
}

function shakeCards(cards) {
  for (const card of cards) {
    const el = document.querySelector(`.card[data-suit="${card.suit}"][data-rank="${card.rank}"]`);
    if (!el) continue;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
    el.addEventListener('animationend', () => el.classList.remove('shake'), { once: true });
  }
}

// Given a card element, find its card object + source descriptor.
// Returns null if not found or card is face-down.
function resolveCard(cardEl) {
  const suit = cardEl.dataset.suit;
  const rank = parseInt(cardEl.dataset.rank);
  const faceUp = cardEl.dataset.faceUp === '1';
  if (!faceUp) return null;

  const state = Game.getState();

  // Check waste
  if (state.waste.length > 0) {
    const top = state.waste[state.waste.length - 1];
    if (top.suit === suit && top.rank === rank) {
      return { card: top, cards: [top], source: { type: 'waste' } };
    }
  }

  // Check foundations
  for (const fi of [0, 1, 2, 3]) {
    const pile = state.foundations[fi];
    if (pile.length > 0) {
      const top = pile[pile.length - 1];
      if (top.suit === suit && top.rank === rank) {
        return {
          card: top,
          cards: [top],
          source: { type: 'foundation' },
        };
      }
    }
  }

  // Check tableau — card + everything below it in the column
  for (let ci = 0; ci < 7; ci++) {
    const col = state.tableau[ci];
    const idx = col.findIndex(c => c.suit === suit && c.rank === rank);
    if (idx !== -1) {
      const cards = col.slice(idx); // card and all below
      return { card: col[idx], cards, source: { type: 'tableau', colIndex: ci } };
    }
  }

  return null;
}

// ── Touch ghost ───────────────────────────────────

function createTouchGhost(touch) {
  const { cards, source } = touchState;

  // Locate source pile element
  let pileEl;
  if (source.type === 'waste') {
    pileEl = document.getElementById('waste');
  } else if (source.type === 'foundation') {
    pileEl = document.querySelector(`.foundation[data-suit="${cards[0].suit}"]`);
  } else {
    pileEl = document.querySelector(`.tableau-col[data-col="${source.colIndex}"]`);
  }
  if (!pileEl) return;

  // Find first card's DOM element
  const firstCard = cards[0];
  const firstCardEl = pileEl.querySelector(`.card[data-suit="${firstCard.suit}"][data-rank="${firstCard.rank}"]`);
  if (!firstCardEl) return;

  const firstCardRect = firstCardEl.getBoundingClientRect();
  const cardW = firstCardRect.width;
  const cardH = firstCardRect.height;
  const firstTopOffset = parseInt(firstCardEl.style.top) || 0;

  // Compute ghost height to contain the whole stack
  let ghostHeight = cardH;
  if (cards.length > 1) {
    const lastCard = cards[cards.length - 1];
    const lastCardEl = pileEl.querySelector(`.card[data-suit="${lastCard.suit}"][data-rank="${lastCard.rank}"]`);
    if (lastCardEl) {
      const lastTopOffset = parseInt(lastCardEl.style.top) || 0;
      ghostHeight = (lastTopOffset - firstTopOffset) + cardH;
    }
  }

  // Create ghost container
  const ghost = document.createElement('div');
  ghost.id = 'touch-ghost';
  ghost.style.width = cardW + 'px';
  ghost.style.height = ghostHeight + 'px';

  // Clone each card, adjusting top so the first card starts at top:0
  cards.forEach(card => {
    const cardEl = pileEl.querySelector(`.card[data-suit="${card.suit}"][data-rank="${card.rank}"]`);
    if (!cardEl) return;
    const clone = cardEl.cloneNode(true);
    const originalTop = parseInt(cardEl.style.top) || 0;
    clone.style.top = (originalTop - firstTopOffset) + 'px';
    clone.style.zIndex = cardEl.style.zIndex;
    clone.classList.remove('flip-reveal', 'card-land', 'selected', 'dragging');
    ghost.appendChild(clone);
  });

  // Compute offset from touch point to ghost top-left
  const offsetX = touch.clientX - firstCardRect.left;
  const offsetY = touch.clientY - firstCardRect.top;
  touchState.offsetX = offsetX;
  touchState.offsetY = offsetY;

  // Position and insert ghost
  ghost.style.left = (touch.clientX - offsetX) + 'px';
  ghost.style.top = (touch.clientY - offsetY) + 'px';
  document.body.appendChild(ghost);
  touchState.ghostEl = ghost;

  // Fade source cards
  cards.forEach(card => {
    const cardEl = pileEl.querySelector(`.card[data-suit="${card.suit}"][data-rank="${card.rank}"]`);
    if (cardEl) cardEl.classList.add('dragging');
  });
}

// ── Touch handlers ────────────────────────────────

function handleTouchStart(e) {
  if (autoCompleting) return;
  if (touchState) return; // ignore additional fingers while one is active
  const touch = e.changedTouches[0];
  const cardEl = touch.target.closest('.card');
  if (!cardEl || cardEl.dataset.faceUp !== '1') return;

  const resolved = resolveCard(cardEl);
  if (!resolved) return;

  touchState = {
    touchId: touch.identifier,
    cards: resolved.cards,
    source: resolved.source,
    startX: touch.clientX,
    startY: touch.clientY,
    isDragging: false,
    ghostEl: null,
    offsetX: 0,
    offsetY: 0,
    currentTarget: null,
  };
  // Do NOT call e.preventDefault() — preserves synthetic click for taps
}

function handleTouchMove(e) {
  if (!touchState) return;
  const touch = Array.from(e.changedTouches).find(t => t.identifier === touchState.touchId);
  if (!touch) return;

  if (!touchState.isDragging) {
    const dx = touch.clientX - touchState.startX;
    const dy = touch.clientY - touchState.startY;
    if (Math.hypot(dx, dy) < 8) return;
    touchState.isDragging = true;
    clearSelection();
    createTouchGhost(touch);
  }

  e.preventDefault(); // block scroll while dragging

  // Reposition ghost
  const ghost = touchState.ghostEl;
  if (ghost) {
    ghost.style.left = (touch.clientX - touchState.offsetX) + 'px';
    ghost.style.top  = (touch.clientY - touchState.offsetY) + 'px';
  }

  // Hit-test: hide ghost so elementFromPoint sees through it
  if (ghost) ghost.style.display = 'none';
  const el = document.elementFromPoint(touch.clientX, touch.clientY);
  if (ghost) ghost.style.display = '';

  const pileEl = el ? el.closest('.pile') : null;

  // Validate drop target
  let newTarget = null;
  if (pileEl) {
    const state = Game.getState();
    if (pileEl.classList.contains('foundation')) {
      if (touchState.cards.length === 1) {
        const fi = Game.SUITS.indexOf(pileEl.dataset.suit);
        if (Game.canMoveToFoundation(touchState.cards[0], state.foundations[fi])) {
          newTarget = pileEl;
        }
      }
    } else if (pileEl.classList.contains('tableau-col')) {
      const colIndex = parseInt(pileEl.dataset.col);
      if (Game.canMoveToTableau(touchState.cards[0], state.tableau[colIndex])) {
        newTarget = pileEl;
      }
    }
  }

  // Update drag-over highlight
  if (touchState.currentTarget && touchState.currentTarget !== newTarget) {
    touchState.currentTarget.classList.remove('drag-over');
  }
  if (newTarget && newTarget !== touchState.currentTarget) {
    newTarget.classList.add('drag-over');
  }
  touchState.currentTarget = newTarget;
}

function handleTouchEnd(e) {
  if (!touchState) return;
  const touch = Array.from(e.changedTouches).find(t => t.identifier === touchState.touchId);
  if (!touch) return;

  if (!touchState.isDragging) {
    // Treat as tap — let the synthetic click event handle it
    touchState = null;
    return;
  }

  // Remove ghost
  if (touchState.ghostEl) touchState.ghostEl.remove();

  // Clean up visual states
  document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));

  // Execute drop by bridging into existing selection/tryDrop logic
  const touchCards = touchState.cards;
  const hadTarget = !!touchState.currentTarget;
  selection = { source: touchState.source, cards: touchCards };
  if (hadTarget) {
    tryDrop(touchState.currentTarget); // handles move, clearSelection, redraw, checkWin
  } else {
    clearSelection();
  }

  suppressClickUntil = Date.now() + 50;
  touchState = null;
  redraw();
  if (!hadTarget) shakeCards(touchCards);
}

function handleTouchCancel(e) {
  if (!touchState) return;
  const touch = Array.from(e.changedTouches).find(t => t.identifier === touchState.touchId);
  if (!touch) return;
  if (touchState.ghostEl) touchState.ghostEl.remove();
  document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  touchState = null;
  redraw();
}

// ── Drag handlers ─────────────────────────────────

function handleDragStart(e) {
  if (autoCompleting) { e.preventDefault(); return; }
  const cardEl = e.target.closest('.card');
  if (!cardEl || cardEl.dataset.faceUp !== '1') { e.preventDefault(); return; }

  const resolved = resolveCard(cardEl);
  if (!resolved) { e.preventDefault(); return; }

  dragState = { cards: resolved.cards, source: resolved.source };
  clearSelection();

  // Required for Firefox; carry suit+rank so we can identify the drag
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', `${cardEl.dataset.suit}:${cardEl.dataset.rank}`);

  // Fade the dragged card(s) after the browser has captured the ghost image
  requestAnimationFrame(() => {
    if (!dragState) return;
    // Mark all cards in the drag stack
    const colEl = cardEl.closest('.tableau-col');
    if (colEl) {
      const allCards = colEl.querySelectorAll('.card');
      allCards.forEach(el => {
        const suit = el.dataset.suit, rank = parseInt(el.dataset.rank);
        if (dragState.cards.some(c => c.suit === suit && c.rank === rank)) {
          el.classList.add('dragging');
        }
      });
    } else {
      cardEl.classList.add('dragging');
    }
  });
}

function handleDragOver(e) {
  if (!dragState) return;
  const pileEl = e.target.closest('.pile');
  if (!pileEl) return;

  const state = Game.getState();
  let valid = false;

  if (pileEl.classList.contains('foundation')) {
    if (dragState.cards.length === 1) {
      const fi = Game.SUITS.indexOf(pileEl.dataset.suit);
      valid = Game.canMoveToFoundation(dragState.cards[0], state.foundations[fi]);
    }
  } else if (pileEl.classList.contains('tableau-col')) {
    const colIndex = parseInt(pileEl.dataset.col);
    valid = Game.canMoveToTableau(dragState.cards[0], state.tableau[colIndex]);
  }

  if (valid) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    pileEl.classList.add('drag-over');
  }
}

function handleDragLeave(e) {
  const pileEl = e.target.closest('.pile');
  if (!pileEl) return;
  // Only remove highlight when truly leaving the pile (not moving to a child)
  if (!pileEl.contains(e.relatedTarget)) {
    pileEl.classList.remove('drag-over');
  }
}

function handleDrop(e) {
  e.preventDefault();
  if (!dragState) return;

  const pileEl = e.target.closest('.pile');
  if (!pileEl) return;
  pileEl.classList.remove('drag-over');

  if (pileEl.classList.contains('foundation')) {
    if (dragState.cards.length === 1) {
      const card = dragState.cards[0];
      const fi = Game.foundationIndex(card.suit);
      if (Game.canMoveToFoundation(card, Game.getState().foundations[fi])) {
        Game.saveSnapshot();
        Game.moveToFoundation(card, dragState.source);
        if (Game.checkWin()) showWin();
      }
    }
  } else if (pileEl.classList.contains('tableau-col')) {
    const colIndex = parseInt(pileEl.dataset.col);
    Game.saveSnapshot();
    if (!Game.moveToTableau(dragState.cards, colIndex, dragState.source)) {
      Game.undo();
    }
  }

  dragState = null;
  suppressClickUntil = Date.now() + 50;
  redraw();
}

function handleDragEnd(e) {
  const droppedCards = dragState ? dragState.cards : null;
  const didDrop = e.dataTransfer.dropEffect !== 'none';
  dragState = null;
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
  suppressClickUntil = Date.now() + 50;
  redraw();
  if (!didDrop && droppedCards) shakeCards(droppedCards);
}

// ── Click handler ─────────────────────────────────

function handleClick(e) {
  if (autoCompleting) return;
  const cardEl = e.target.closest('.card');
  const pileEl = e.target.closest('.pile');

  // ── Stock click — always handle, even right after a drag
  if (pileEl && pileEl.id === 'stock') {
    suppressClickUntil = 0;
    clearSelection();
    Game.saveSnapshot();
    if (!Game.drawFromStock()) {
      Game.undo();
    }
    redraw();
    return;
  }

  if (Date.now() < suppressClickUntil) return;

  // ── Card click
  if (cardEl) {
    const faceUp = cardEl.dataset.faceUp === '1';

    if (!faceUp) {
      // Clicking a face-down card clears any active selection; auto-flip happens via _flipTopIfNeeded after moves
      clearSelection();
      redraw();
      return;
    }

    const resolved = resolveCard(cardEl);
    if (!resolved) return;

    // Manual double-click detection — checked first, before selection/tryDrop,
    // so it works regardless of prior selection state.
    const now = Date.now();
    if (
      lastClickedCardInfo &&
      now - lastClickTime < DBLCLICK_THRESHOLD &&
      lastClickedCardInfo.card.suit === resolved.card.suit &&
      lastClickedCardInfo.card.rank === resolved.card.rank
    ) {
      lastClickedCardInfo = null;
      lastClickTime = 0;
      autoMoveToFoundation(resolved);
      return;
    }

    lastClickedCardInfo = resolved;
    lastClickTime = now;

    // ── Lazy mode: single click auto-moves
    if (lazyMode) {
      const dest = Game.findBestMove(resolved.card, resolved.source);
      if (dest) {
        clearSelection();
        Game.saveSnapshot();
        let moved;
        if (dest.type === 'foundation') {
          moved = Game.moveToFoundation(resolved.card, resolved.source);
          if (moved && Game.checkWin()) showWin();
        } else {
          moved = Game.moveToTableau(resolved.cards, dest.colIndex, resolved.source);
        }
        if (!moved) Game.undo();
        redraw();
        return;
      }
      // No valid move — shake to indicate
      clearSelection();
      redraw();
      shakeCards([resolved.card]);
      return;
    }

    // If something is already selected, try to move selection TO this card's pile
    if (selection) {
      // Attempt drop on this card's pile
      const pileEl2 = cardEl.closest('.pile');
      if (tryDrop(pileEl2)) return;
    }

    if (
      selection &&
      selection.source.type === resolved.source.type &&
      selection.source.colIndex === resolved.source.colIndex &&
      selection.cards[0].suit === resolved.cards[0].suit &&
      selection.cards[0].rank === resolved.cards[0].rank
    ) {
      // Clicking same card → deselect
      clearSelection();
    } else {
      selection = { source: resolved.source, cards: resolved.cards };
    }

    redraw();
    return;
  }

  // ── Empty pile click (no card child)
  if (pileEl) {
    if (selection) {
      if (tryDrop(pileEl)) return;
      const shakeTargets = selection.cards;
      clearSelection();
      redraw();
      shakeCards(shakeTargets);
      return;
    }
    clearSelection();
    redraw();
    return;
  }

  // Clicking empty board space deselects
  if (selection) {
    clearSelection();
    redraw();
  }
}

// Try to drop the current selection onto a pile element.
// Returns true if the move was made.
function tryDrop(pileEl) {
  if (!selection || !pileEl) return false;
  const state = Game.getState();

  // Foundation drop
  if (pileEl.classList.contains('foundation')) {
    if (selection.cards.length !== 1) {
      const shakeTargets = selection.cards;
      clearSelection();
      redraw();
      shakeCards(shakeTargets);
      return true; // consumed click, invalid move
    }
    const card = selection.cards[0];
    const fi = Game.foundationIndex(card.suit);
    if (!Game.canMoveToFoundation(card, state.foundations[fi])) {
      clearSelection();
      redraw();
      shakeCards([card]);
      return true;
    }
    Game.saveSnapshot();
    Game.moveToFoundation(card, selection.source);
    clearSelection();
    if (Game.checkWin()) showWin();
    redraw();
    return true;
  }

  // Tableau drop
  if (pileEl.classList.contains('tableau-col')) {
    const colIndex = parseInt(pileEl.dataset.col);
    Game.saveSnapshot();
    const moved = Game.moveToTableau(selection.cards, colIndex, selection.source);
    if (!moved) {
      Game.undo();
      return false; // invalid move → fall through to select the clicked card
    }
    clearSelection();
    redraw();
    return true;
  }

  return false;
}

// ── Auto-move to foundation (triggered by manual double-click detection) ──

function autoMoveToFoundation(info) {
  const card = info.card;

  if (info.source.type === 'tableau') {
    const col = Game.getState().tableau[info.source.colIndex];
    if (col[col.length - 1] !== card) return;
  }

  clearSelection();
  const fi = Game.foundationIndex(card.suit);
  if (!Game.canMoveToFoundation(card, Game.getState().foundations[fi])) {
    redraw();
    shakeCards([card]);
    return;
  }
  Game.saveSnapshot();
  Game.moveToFoundation(card, info.source);
  if (Game.checkWin()) showWin();
  redraw();
}

// ── Auto-complete ─────────────────────────────────

function runAutoComplete() {
  autoCompleting = true;
  clearSelection();
  autoCompleteStep();
}

function autoCompleteStep() {
  if (!autoCompleting) return;
  const state = Game.getState();

  // Try waste top card first
  if (state.waste.length > 0) {
    const card = state.waste[state.waste.length - 1];
    const fi = Game.foundationIndex(card.suit);
    if (Game.canMoveToFoundation(card, state.foundations[fi])) {
      Game.moveToFoundation(card, { type: 'waste' }, { skipCount: true });
      Render.renderGame(Game.getState(), null);
      Game.consumeAnimations();
      setTimeout(autoCompleteStep, 80);
      return;
    }
  }

  // Try tableau column top cards
  for (let ci = 0; ci < 7; ci++) {
    const col = state.tableau[ci];
    if (col.length === 0) continue;
    const card = col[col.length - 1];
    const fi = Game.foundationIndex(card.suit);
    if (Game.canMoveToFoundation(card, state.foundations[fi])) {
      Game.moveToFoundation(card, { type: 'tableau', colIndex: ci }, { skipCount: true });
      Render.renderGame(Game.getState(), null);
      Game.consumeAnimations();
      setTimeout(autoCompleteStep, 80);
      return;
    }
  }

  // No more moves — done
  autoCompleting = false;
  if (Game.checkWin()) showWin();
}

// ── Win screen ────────────────────────────────────

function showWin() {
  document.getElementById('win-moves').textContent = `${Game.getMoveCount()} MOVES`;
  document.getElementById('win-screen').removeAttribute('hidden');
}

function hideWin() {
  document.getElementById('win-screen').setAttribute('hidden', '');
}

// ── Init ──────────────────────────────────────────

function startNewGame() {
  autoCompleting = false;
  clearSelection();
  hideWin();
  Game.initGame();
  redraw();
}

document.getElementById('new-game-btn').addEventListener('click', startNewGame);
document.getElementById('play-again-btn').addEventListener('click', startNewGame);

(function HelpSlider() {
  const TOTAL = 7;
  let cur = 0;
  const screen   = document.getElementById('help-screen');
  const prevBtn  = document.getElementById('help-prev');
  const nextBtn  = document.getElementById('help-next');
  const dots     = document.querySelectorAll('.help-dot');
  const numEl    = document.getElementById('help-slide-num');

  function goTo(n) {
    cur = Math.max(0, Math.min(TOTAL - 1, n));
    document.querySelectorAll('.help-slide').forEach((s, i) => s.classList.toggle('active', i === cur));
    numEl.textContent = cur + 1;
    dots.forEach((d, i) => d.classList.toggle('active', i === cur));
    prevBtn.disabled = cur === 0;
    nextBtn.disabled = cur === TOTAL - 1;
  }

  function open() {
    goTo(0);
    screen.removeAttribute('hidden');
  }

  function close() { screen.setAttribute('hidden', ''); }

  prevBtn.addEventListener('click', () => goTo(cur - 1));
  nextBtn.addEventListener('click', () => goTo(cur + 1));
  dots.forEach((d, i) => d.addEventListener('click', () => goTo(i)));
  document.getElementById('help-btn').addEventListener('click', open);
  document.getElementById('help-close-btn').addEventListener('click', close);
  screen.addEventListener('click', e => { if (e.target === screen) close(); });
  document.addEventListener('keydown', e => {
    if (screen.hasAttribute('hidden')) return;
    if (e.key === 'ArrowRight') goTo(cur + 1);
    if (e.key === 'ArrowLeft')  goTo(cur - 1);
    if (e.key === 'Escape')     close();
  });

  goTo(0);
}());

const board = document.getElementById('board');
board.addEventListener('click', handleClick);
board.addEventListener('dragstart', handleDragStart);
board.addEventListener('dragover', handleDragOver);
board.addEventListener('dragleave', handleDragLeave);
board.addEventListener('drop', handleDrop);
board.addEventListener('dragend', handleDragEnd);

board.addEventListener('touchstart',  handleTouchStart,  { passive: true });
board.addEventListener('touchmove',   handleTouchMove,   { passive: false });
board.addEventListener('touchend',    handleTouchEnd,    { passive: false });
board.addEventListener('touchcancel', handleTouchCancel, { passive: true });

document.getElementById('undo-btn').addEventListener('click', () => {
  if (autoCompleting) return;
  if (Game.canUndo()) {
    Game.undo();
    clearSelection();
    redraw();
  }
});

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    if (autoCompleting) return;
    if (Game.canUndo()) {
      Game.undo();
      clearSelection();
      redraw();
    }
  }
});

// Re-render on resize so JS-computed offsets match new card dimensions
let resizeRaf = null;
window.addEventListener('resize', () => {
  if (resizeRaf) return;
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = null;
    redraw();
  });
});

// Draw toggle
document.getElementById('draw-toggle').addEventListener('click', (e) => {
  e.stopPropagation();
  const option = e.target.closest('.draw-option');
  if (!option) return;
  const next = parseInt(option.dataset.draw);
  if (next === Game.getDrawCount()) return;
  Game.setDrawCount(next);
  storageSet('drawCount', next);
  startNewGame();
});

// Lazy toggle
document.getElementById('lazy-toggle').addEventListener('click', (e) => {
  e.stopPropagation();
  const option = e.target.closest('.lazy-option');
  if (!option) return;
  const next = option.dataset.lazy;
  lazyMode = next === 'on';
  storageSet('lazyMode', lazyMode ? 'on' : 'off');
  clearSelection();
  redraw();
});

// Kick off
startNewGame();
