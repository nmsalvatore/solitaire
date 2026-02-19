'use strict';

// ── Selection state ───────────────────────────────
// { source: { type, colIndex? }, cards: Card[] }
let selection = null;

// Last card resolved by handleClick — used by handleDblClick to avoid
// relying on e.target after the DOM has been rebuilt by redraw().
let lastClickedCardInfo = null;

// ── Drag state ────────────────────────────────────
// { cards, source, cardEls }  (cardEls: DOM nodes to mark .dragging)
let dragState = null;
// Suppress the click that fires right after a drag ends
let suppressNextClick = false;

// ── Touch state ───────────────────────────────────
// null when idle; during a touch drag:
// { cards, source, startX, startY, isDragging, ghostEl, offsetX, offsetY, currentTarget }
let touchState = null;

// ── Helpers ───────────────────────────────────────

function redraw() {
  Render.renderGame(Game.getState(), selection);
}

function clearSelection() {
  selection = null;
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
  const touch = e.changedTouches[0];
  const cardEl = touch.target.closest('.card');
  if (!cardEl || cardEl.dataset.faceUp !== '1') return;

  const resolved = resolveCard(cardEl);
  if (!resolved) return;

  touchState = {
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
  const touch = e.changedTouches[0];

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
  selection = { source: touchState.source, cards: touchState.cards };
  if (touchState.currentTarget) {
    tryDrop(touchState.currentTarget); // handles move, clearSelection, redraw, checkWin
  } else {
    clearSelection();
  }

  suppressNextClick = true;
  touchState = null;
  redraw();
}

function handleTouchCancel(e) {
  if (!touchState) return;
  if (touchState.ghostEl) touchState.ghostEl.remove();
  document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  touchState = null;
  redraw();
}

// ── Drag handlers ─────────────────────────────────

function handleDragStart(e) {
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
      const moved = Game.moveToFoundation(dragState.cards[0], dragState.source);
      if (moved && Game.checkWin()) showWin();
    }
  } else if (pileEl.classList.contains('tableau-col')) {
    const colIndex = parseInt(pileEl.dataset.col);
    Game.moveToTableau(dragState.cards, colIndex, dragState.source);
  }

  dragState = null;
  suppressNextClick = true;
  redraw();
}

function handleDragEnd() {
  dragState = null;
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
  suppressNextClick = true;
  redraw();
}

// ── Click handler ─────────────────────────────────

function handleClick(e) {
  if (suppressNextClick) { suppressNextClick = false; return; }
  lastClickedCardInfo = null;
  const cardEl = e.target.closest('.card');
  const pileEl = e.target.closest('.pile');

  // ── Stock click
  if (pileEl && pileEl.id === 'stock') {
    clearSelection();
    Game.drawFromStock();
    redraw();
    return;
  }

  // ── Card click
  if (cardEl) {
    const faceUp = cardEl.dataset.faceUp === '1';

    if (!faceUp) {
      // Clicking a face-down card clears any active selection; auto-flip happens via _flipTopIfNeeded after moves
      clearSelection();
      redraw();
      return;
    }

    // If something is already selected, try to move selection TO this card's pile
    if (selection) {
      // Attempt drop on this card's pile
      const pileEl2 = cardEl.closest('.pile');
      if (tryDrop(pileEl2)) return;
    }

    // Select / re-select
    const resolved = resolveCard(cardEl);
    if (!resolved) return;

    lastClickedCardInfo = resolved;

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
    }
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
      clearSelection();
      redraw();
      return true; // consumed click, invalid move
    }
    const moved = Game.moveToFoundation(selection.cards[0], selection.source);
    clearSelection();
    if (moved && Game.checkWin()) showWin();
    redraw();
    return true;
  }

  // Tableau drop
  if (pileEl.classList.contains('tableau-col')) {
    const colIndex = parseInt(pileEl.dataset.col);
    const moved = Game.moveToTableau(selection.cards, colIndex, selection.source);
    if (moved) {
      clearSelection();
      redraw();
      return true;
    }
    return false; // invalid move → fall through to select the clicked card
  }

  return false;
}

// ── Double-click: auto-move to foundation ─────────

function handleDblClick(e) {
  const info = lastClickedCardInfo;
  lastClickedCardInfo = null;
  if (!info || info.cards.length !== 1) return;

  clearSelection();
  const moved = Game.moveToFoundation(info.card, info.source);
  if (moved && Game.checkWin()) showWin();
  redraw();
}

// ── Win screen ────────────────────────────────────

function showWin() {
  document.getElementById('win-screen').removeAttribute('hidden');
}

function hideWin() {
  document.getElementById('win-screen').setAttribute('hidden', '');
}

// ── Init ──────────────────────────────────────────

function startNewGame() {
  clearSelection();
  hideWin();
  Game.initGame();
  redraw();
}

document.getElementById('new-game-btn').addEventListener('click', startNewGame);
document.getElementById('play-again-btn').addEventListener('click', startNewGame);

(function HelpSlider() {
  const TOTAL = 4;
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
board.addEventListener('dblclick', handleDblClick);
board.addEventListener('dragstart', handleDragStart);
board.addEventListener('dragover', handleDragOver);
board.addEventListener('dragleave', handleDragLeave);
board.addEventListener('drop', handleDrop);
board.addEventListener('dragend', handleDragEnd);

board.addEventListener('touchstart',  handleTouchStart,  { passive: false });
board.addEventListener('touchmove',   handleTouchMove,   { passive: false });
board.addEventListener('touchend',    handleTouchEnd,    { passive: false });
board.addEventListener('touchcancel', handleTouchCancel, { passive: true });

// Kick off
startNewGame();
