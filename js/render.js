"use strict";

// Suit symbols
const SUIT_SYMBOLS = {
    spades: "♠",
    hearts: "♥",
    diamonds: "♦",
    clubs: "♣",
};

const RANK_LABELS = {
    1: "A",
    11: "J",
    12: "Q",
    13: "K",
};

function rankLabel(rank) {
    return RANK_LABELS[rank] || String(rank);
}

// ── Card element factory ──────────────────────────

function makeCard(card) {
    const el = document.createElement("div");
    el.className = "card";
    el.dataset.suit = card.suit;
    el.dataset.rank = card.rank;

    if (!card.faceUp) {
        el.classList.add("face-down");
        return el;
    }

    el.classList.add(Game.isRed(card) ? "red" : "black");
    el.dataset.faceUp = "1";
    el.draggable = true;

    const label = rankLabel(card.rank);
    const sym = SUIT_SYMBOLS[card.suit];

    el.innerHTML = `
    <span class="rank-tl">${label}</span>
    <span class="suit-center">${sym}</span>
    <span class="rank-br">${label}</span>
  `;

    if (card._flipAnim) {
        el.classList.add("flip-reveal");
        delete card._flipAnim;
    }
    if (card._landAnim) {
        el.classList.add("card-land");
        delete card._landAnim;
    }

    return el;
}

// ── Stack layout helpers ──────────────────────────

const OFFSET_FACEDOWN = 11; // px per face-down card
const OFFSET_FACEUP = 22; // px per face-up card

function stackCards(pile, cards, selection) {
    // Clear previous contents
    pile.innerHTML = "";

    let top = 0;
    cards.forEach((card, i) => {
        const el = makeCard(card);
        el.style.top = top + "px";
        el.style.zIndex = i + 1;

        if (selection && selection.cards.includes(card)) {
            el.classList.add("selected");
        }

        pile.appendChild(el);

        if (i < cards.length - 1) {
            top += card.faceUp ? OFFSET_FACEUP : OFFSET_FACEDOWN;
        }
    });

    // Adjust pile min-height so column is fully clickable
    if (cards.length > 0) {
        const lastCard = cards[cards.length - 1];
        const cardH =
            parseInt(
                getComputedStyle(document.documentElement).getPropertyValue(
                    "--card-h",
                ),
            ) || 140;
        pile.style.minHeight = top + cardH + "px";
    } else {
        pile.style.minHeight = "";
    }
}

// ── Full render ───────────────────────────────────

function renderGame(state, selection) {
    const { stock, waste, foundations, tableau } = state;

    // ── Stock
    const stockEl = document.getElementById("stock");
    stockEl.innerHTML = "";
    if (stock.length === 0) {
        stockEl.classList.add("empty");
    } else {
        stockEl.classList.remove("empty");
        const ghostCount = Math.min(stock.length - 1, 2);
        for (let i = ghostCount; i >= 1; i--) {
            const ghost = document.createElement("div");
            ghost.className = "stock-ghost";
            ghost.style.top = "0";
            ghost.style.left = `${i * 3}px`;
            ghost.style.zIndex = String(ghostCount - i);
            stockEl.appendChild(ghost);
        }
        const el = makeCard({ suit: "spades", rank: 1, faceUp: false });
        el.style.top = "0";
        el.style.left = "0";
        el.style.zIndex = String(ghostCount + 1);
        stockEl.appendChild(el);
    }

    // ── Waste — show top 3 cards fanned to the right
    const wasteEl = document.getElementById("waste");
    wasteEl.innerHTML = "";
    wasteEl.style.minHeight = "";
    if (waste.length > 0) {
        const showCount = Math.min(waste.length, 3);
        for (let i = showCount - 1; i >= 0; i--) {
            const card = waste[waste.length - 1 - i];
            const el = makeCard(card);
            el.style.top = "0";
            el.style.left = `${i * 20}px`;
            el.style.zIndex = String(showCount - i);
            if (i > 0) el.style.pointerEvents = "none";
            if (i === 0 && selection && selection.cards.includes(card)) {
                el.classList.add("selected");
            }
            wasteEl.appendChild(el);
        }
    }

    // ── Foundations
    document.querySelectorAll(".foundation.pile").forEach((foundEl) => {
        const suit = foundEl.dataset.suit;
        const fi = Game.SUITS.indexOf(suit);
        const pile = foundations[fi];

        // Remove old cards but keep the ::before pseudo-element (CSS handles it)
        foundEl.innerHTML = "";
        foundEl.style.minHeight = "";

        if (pile.length > 0) {
            const card = pile[pile.length - 1];
            const el = makeCard(card);
            el.style.top = "0";
            el.style.zIndex = "1";
            if (selection && selection.cards.includes(card)) {
                el.classList.add("selected");
            }
            foundEl.appendChild(el);
        }
    });

    // ── Tableau
    document.querySelectorAll(".tableau-col").forEach((colEl) => {
        const colIndex = parseInt(colEl.dataset.col);
        stackCards(colEl, tableau[colIndex], selection);
    });
}

window.Render = { renderGame };
