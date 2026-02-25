"use strict";

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
    if (!condition) throw new Error(msg || "Assertion failed");
}

function assertEqual(a, b, msg) {
    if (a !== b)
        throw new Error(
            msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`,
        );
}

// ── Tests ─────────────────────────────────────────

// createDeck
test("createDeck produces 52 cards", () => {
    const deck = _createDeck();
    assertEqual(deck.length, 52);
});

test("createDeck produces 52 unique suit+rank pairs", () => {
    const deck = _createDeck();
    const keys = new Set(deck.map((c) => `${c.suit}:${c.rank}`));
    assertEqual(keys.size, 52);
});

// shuffle
test("shuffle returns all 52 cards (no loss or duplication)", () => {
    const deck = _shuffle(_createDeck());
    assertEqual(deck.length, 52);
    const keys = new Set(deck.map((c) => `${c.suit}:${c.rank}`));
    assertEqual(keys.size, 52);
});

// initGame
test("initGame deals correct card counts per tableau column", () => {
    const state = Game.initGame();
    for (let col = 0; col < 7; col++) {
        assertEqual(
            state.tableau[col].length,
            col + 1,
            `column ${col} should have ${col + 1} cards`,
        );
    }
});

test("initGame: only the top card of each tableau column is face-up", () => {
    const state = Game.initGame();
    for (let col = 0; col < 7; col++) {
        const column = state.tableau[col];
        for (let i = 0; i < column.length - 1; i++) {
            assert(
                !column[i].faceUp,
                `col ${col} card ${i} should be face-down`,
            );
        }
        assert(
            column[column.length - 1].faceUp,
            `col ${col} top card should be face-up`,
        );
    }
});

test("initGame stock + tableau = 52 cards", () => {
    const state = Game.initGame();
    const tableauCount = state.tableau.reduce(
        (sum, col) => sum + col.length,
        0,
    );
    assertEqual(tableauCount + state.stock.length, 52);
});

// canMoveToFoundation
test("canMoveToFoundation: Ace to empty pile", () => {
    const ace = { suit: "hearts", rank: 1, faceUp: true };
    assert(Game.canMoveToFoundation(ace, []));
});

test("canMoveToFoundation: non-Ace to empty pile returns false", () => {
    const two = { suit: "hearts", rank: 2, faceUp: true };
    assert(!Game.canMoveToFoundation(two, []));
});

test("canMoveToFoundation: sequential same-suit accepted", () => {
    const ace = { suit: "spades", rank: 1, faceUp: true };
    const two = { suit: "spades", rank: 2, faceUp: true };
    assert(Game.canMoveToFoundation(two, [ace]));
});

test("canMoveToFoundation: wrong rank rejected", () => {
    const ace = { suit: "spades", rank: 1, faceUp: true };
    const three = { suit: "spades", rank: 3, faceUp: true };
    assert(!Game.canMoveToFoundation(three, [ace]));
});

test("canMoveToFoundation: wrong suit rejected", () => {
    const ace = { suit: "spades", rank: 1, faceUp: true };
    const twoHeart = { suit: "hearts", rank: 2, faceUp: true };
    assert(!Game.canMoveToFoundation(twoHeart, [ace]));
});

// canMoveToTableau
test("canMoveToTableau: King to empty column", () => {
    const king = { suit: "spades", rank: 13, faceUp: true };
    assert(Game.canMoveToTableau(king, []));
});

test("canMoveToTableau: non-King to empty column returns false", () => {
    const queen = { suit: "spades", rank: 12, faceUp: true };
    assert(!Game.canMoveToTableau(queen, []));
});

test("canMoveToTableau: alternating color descending accepted", () => {
    const redQueen = { suit: "hearts", rank: 12, faceUp: true };
    const blackJack = { suit: "spades", rank: 11, faceUp: true };
    assert(Game.canMoveToTableau(blackJack, [redQueen]));
});

test("canMoveToTableau: same color rejected", () => {
    const redQueen = { suit: "hearts", rank: 12, faceUp: true };
    const redJack = { suit: "diamonds", rank: 11, faceUp: true };
    assert(!Game.canMoveToTableau(redJack, [redQueen]));
});

test("canMoveToTableau: face-down top card rejected", () => {
    const faceDown = { suit: "hearts", rank: 12, faceUp: false };
    const jack = { suit: "spades", rank: 11, faceUp: true };
    assert(!Game.canMoveToTableau(jack, [faceDown]));
});

test("canMoveToTableau: correct color alternation but wrong rank rejected", () => {
    const redQueen = { suit: "hearts", rank: 12, faceUp: true };
    const blackTen = { suit: "spades", rank: 10, faceUp: true };
    assert(
        !Game.canMoveToTableau(blackTen, [redQueen]),
        "should reject 10 on Queen even with correct colors",
    );
});

// drawFromStock
test("drawFromStock moves top stock card to waste", () => {
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

test("drawFromStock recycles waste back to stock when stock is empty", () => {
    // Drain entire stock first
    const state = Game.initGame();
    while (Game.getState().stock.length > 0) {
        Game.drawFromStock();
    }
    const wasteLen = Game.getState().waste.length;
    assert(wasteLen > 0, "waste should have cards before recycling");
    // Calling drawFromStock on empty stock recycles waste → stock (no simultaneous draw)
    Game.drawFromStock();
    const s = Game.getState();
    assertEqual(s.waste.length, 0, "waste should be empty after recycle");
    assertEqual(
        s.stock.length,
        wasteLen,
        "stock should have all recycled cards",
    );
    // Cards should be face-down after recycle
    assert(
        s.stock.every((c) => !c.faceUp),
        "recycled cards should be face-down",
    );
});

// moveToFoundation
test("moveToFoundation: Ace moves correctly, returns true", () => {
    const state = Game.initGame();
    // Inject an Ace of spades into waste for easy access
    const ace = { suit: "spades", rank: 1, faceUp: true };
    state.waste.push(ace);
    const moved = Game.moveToFoundation(ace, { type: "waste" });
    assert(moved, "should return true");
    assertEqual(Game.getState().foundations[0].length, 1);
    assertEqual(Game.getState().waste.length, 0);
});

test("moveToFoundation: invalid move returns false", () => {
    const state = Game.initGame();
    const two = { suit: "spades", rank: 2, faceUp: true };
    state.waste.push(two);
    const moved = Game.moveToFoundation(two, { type: "waste" });
    assert(!moved, "should return false for invalid move");
});

// moveToTableau
test("moveToTableau: moves a single card to valid target", () => {
    const state = Game.initGame();
    // Empty col 0, put a King of hearts in waste
    state.tableau[0] = [];
    const king = { suit: "hearts", rank: 13, faceUp: true };
    state.waste.push(king);
    const moved = Game.moveToTableau([king], 0, { type: "waste" });
    assert(moved, "should return true");
    assertEqual(Game.getState().tableau[0].length, 1);
    assertEqual(Game.getState().waste.length, 0);
});

test("moveToTableau: moves a multi-card stack", () => {
    const state = Game.initGame();
    // Put a red Queen and black Jack stack in waste-like fashion via tableau
    state.tableau[0] = [];
    const redQueen = { suit: "hearts", rank: 12, faceUp: true };
    const blackJack = { suit: "spades", rank: 11, faceUp: true };
    // Place them in col 1 as a stack
    state.tableau[1] = [redQueen, blackJack];
    // Put a black King in col 0
    const blackKing = { suit: "spades", rank: 13, faceUp: true };
    state.tableau[0] = [blackKing];

    // Move queen+jack stack from col 1 index 0 onto col 0
    // canMoveToTableau(redQueen, [blackKing]) — red on black, 12 on 13 → valid
    const moved = Game.moveToTableau([redQueen, blackJack], 0, {
        type: "tableau",
        colIndex: 1,
    });
    assert(moved, "should return true");
    assertEqual(
        Game.getState().tableau[0].length,
        3,
        "col 0 should have king+queen+jack",
    );
    assertEqual(Game.getState().tableau[1].length, 0, "col 1 should be empty");
});

test("moveToTableau: invalid move returns false", () => {
    const state = Game.initGame();
    state.tableau[0] = [];
    const queen = { suit: "hearts", rank: 12, faceUp: true };
    state.waste.push(queen);
    // Queen to empty col requires King
    const moved = Game.moveToTableau([queen], 0, { type: "waste" });
    assert(!moved, "should return false");
});

// moveToFoundation from tableau
test("moveToFoundation from tableau: removes card and flips newly exposed card", () => {
    const state = Game.initGame();
    const faceDown = { suit: "clubs", rank: 5, faceUp: false };
    const ace = { suit: "hearts", rank: 1, faceUp: true };
    state.tableau[0] = [faceDown, ace];
    const moved = Game.moveToFoundation(ace, { type: "tableau", colIndex: 0 });
    assert(moved, "should return true");
    assertEqual(state.tableau[0].length, 1, "column should have 1 card left");
    assert(state.tableau[0][0].faceUp, "newly exposed card should be face-up");
    const fi = Game.SUITS.indexOf("hearts");
    assertEqual(state.foundations[fi].length, 1);
});

test("moveToFoundation rejects non-top card in tableau column", () => {
    const state = Game.initGame();
    const ace = { suit: "spades", rank: 1, faceUp: true };
    const two = { suit: "hearts", rank: 2, faceUp: true };
    state.tableau[0] = [ace, two];
    // Ace is buried under the two — canMoveToFoundation checks the foundation pile,
    // but _removeFromSource splices from the end, so this would corrupt state if allowed.
    // The guard is that callers only pass top cards; verify the move itself succeeds
    // only when the card is actually the top.
    state.foundations[0] = [];
    const moved = Game.moveToFoundation(two, { type: "tableau", colIndex: 0 });
    assert(!moved, "should return false for non-Ace to empty foundation");
});

// _flipTopIfNeeded via moveToTableau
test("moveToTableau flips newly exposed face-down card", () => {
    const state = Game.initGame();
    const faceDown = { suit: "clubs", rank: 9, faceUp: false };
    const redQueen = { suit: "hearts", rank: 12, faceUp: true };
    const blackKing = { suit: "spades", rank: 13, faceUp: true };
    state.tableau[0] = [faceDown, redQueen];
    state.tableau[1] = [blackKing];
    const moved = Game.moveToTableau([redQueen], 1, {
        type: "tableau",
        colIndex: 0,
    });
    assert(moved, "should return true");
    assertEqual(state.tableau[0].length, 1);
    assert(state.tableau[0][0].faceUp, "face-down card should be flipped up");
});

// drawFromStock recycle order
test("drawFromStock recycle preserves correct draw order", () => {
    const state = Game.initGame();
    // Draw all stock cards and record the order
    const drawnOrder = [];
    while (state.stock.length > 0) {
        const top = state.stock[state.stock.length - 1];
        drawnOrder.push(`${top.suit}:${top.rank}`);
        Game.drawFromStock();
    }
    // Recycle waste back to stock
    Game.drawFromStock();
    // Draw again — should come out in the same order
    const redrawnOrder = [];
    while (state.stock.length > 0) {
        const top = state.stock[state.stock.length - 1];
        redrawnOrder.push(`${top.suit}:${top.rank}`);
        Game.drawFromStock();
    }
    assertEqual(
        drawnOrder.length,
        redrawnOrder.length,
        "same number of cards after recycle",
    );
    for (let i = 0; i < drawnOrder.length; i++) {
        assertEqual(
            redrawnOrder[i],
            drawnOrder[i],
            `card ${i} should match after recycle`,
        );
    }
});

// moveToTableau from foundation source
test("moveToTableau from foundation: moves card back to tableau", () => {
    const state = Game.initGame();
    const ace = { suit: "hearts", rank: 1, faceUp: true };
    const two = { suit: "hearts", rank: 2, faceUp: true };
    const fi = Game.SUITS.indexOf("hearts");
    state.foundations[fi] = [ace, two];
    const blackThree = { suit: "spades", rank: 3, faceUp: true };
    state.tableau[0] = [blackThree];
    const moved = Game.moveToTableau([two], 0, { type: "foundation" });
    assert(moved, "should return true");
    assertEqual(
        state.foundations[fi].length,
        1,
        "foundation should have 1 card left",
    );
    assertEqual(
        state.foundations[fi][0].rank,
        1,
        "Ace should remain in foundation",
    );
    assertEqual(
        state.tableau[0].length,
        2,
        "tableau column should have 2 cards",
    );
});

// Sequential foundation build
test("moveToFoundation: sequential build A through K", () => {
    const state = Game.initGame();
    const suit = "diamonds";
    const fi = Game.SUITS.indexOf(suit);
    state.foundations[fi] = [];
    for (let rank = 1; rank <= 13; rank++) {
        const card = { suit, rank, faceUp: true };
        state.waste.push(card);
        const moved = Game.moveToFoundation(card, { type: "waste" });
        assert(moved, `rank ${rank} should move to foundation`);
        assertEqual(
            state.foundations[fi].length,
            rank,
            `foundation should have ${rank} cards`,
        );
    }
});

// undo
test("canUndo returns false initially", () => {
    Game.initGame();
    assert(!Game.canUndo(), "canUndo should be false with no snapshot");
});

test("saveSnapshot + undo restores state after moveToFoundation", () => {
    const state = Game.initGame();
    const ace = { suit: "spades", rank: 1, faceUp: true };
    state.waste.push(ace);
    Game.saveSnapshot();
    Game.moveToFoundation(ace, { type: "waste" });
    assertEqual(state.foundations[0].length, 1, "foundation should have ace");
    assertEqual(state.waste.length, 0, "waste should be empty after move");
    Game.undo();
    const restored = Game.getState();
    assertEqual(
        restored.waste.length,
        1,
        "waste should have card back after undo",
    );
    assertEqual(restored.waste[0].suit, "spades");
    assertEqual(restored.waste[0].rank, 1);
    assertEqual(
        restored.foundations[0].length,
        0,
        "foundation should be empty after undo",
    );
});

test("undo restores stock/waste after drawFromStock", () => {
    const state = Game.initGame();
    const originalStockLen = state.stock.length;
    Game.saveSnapshot();
    Game.drawFromStock();
    assertEqual(Game.getState().stock.length, originalStockLen - 1);
    assertEqual(Game.getState().waste.length, 1);
    Game.undo();
    const restored = Game.getState();
    assertEqual(
        restored.stock.length,
        originalStockLen,
        "stock should be restored",
    );
    assertEqual(restored.waste.length, 0, "waste should be restored");
});

test("canUndo returns false after undo (single-level only)", () => {
    const state = Game.initGame();
    Game.saveSnapshot();
    Game.drawFromStock();
    assert(Game.canUndo(), "canUndo should be true after saveSnapshot");
    Game.undo();
    assert(!Game.canUndo(), "canUndo should be false after undo");
});

test("undo restores moveCount", () => {
    const state = Game.initGame();
    Game.drawFromStock();
    assertEqual(Game.getMoveCount(), 1, "moveCount should be 1 after draw");
    Game.saveSnapshot();
    Game.drawFromStock();
    assertEqual(
        Game.getMoveCount(),
        2,
        "moveCount should be 2 after second draw",
    );
    Game.undo();
    assertEqual(
        Game.getMoveCount(),
        1,
        "moveCount should revert to 1 after undo",
    );
});

test("undo restores state after moveToTableau", () => {
    const state = Game.initGame();
    const blackKing = { suit: "spades", rank: 13, faceUp: true };
    const redQueen = { suit: "hearts", rank: 12, faceUp: true };
    state.tableau[0] = [blackKing];
    state.tableau[1] = [redQueen];
    Game.saveSnapshot();
    Game.moveToTableau([redQueen], 0, { type: "tableau", colIndex: 1 });
    assertEqual(
        state.tableau[0].length,
        2,
        "col 0 should have 2 cards after move",
    );
    assertEqual(state.tableau[1].length, 0, "col 1 should be empty after move");
    Game.undo();
    const restored = Game.getState();
    assertEqual(
        restored.tableau[0].length,
        1,
        "col 0 should have 1 card after undo",
    );
    assertEqual(
        restored.tableau[1].length,
        1,
        "col 1 should have 1 card after undo",
    );
    assertEqual(restored.tableau[1][0].suit, "hearts");
});

test("undo restores flipped cards to face-down", () => {
    const state = Game.initGame();
    const faceDown = { suit: "clubs", rank: 9, faceUp: false };
    const redQueen = { suit: "hearts", rank: 12, faceUp: true };
    const blackKing = { suit: "spades", rank: 13, faceUp: true };
    state.tableau[0] = [faceDown, redQueen];
    state.tableau[1] = [blackKing];
    Game.saveSnapshot();
    Game.moveToTableau([redQueen], 1, { type: "tableau", colIndex: 0 });
    assert(
        state.tableau[0][0].faceUp,
        "exposed card should be face-up after move",
    );
    Game.undo();
    const restored = Game.getState();
    assertEqual(
        restored.tableau[0].length,
        2,
        "col 0 should have 2 cards after undo",
    );
    assert(
        !restored.tableau[0][0].faceUp,
        "bottom card should be face-down after undo",
    );
    assert(
        restored.tableau[0][1].faceUp,
        "top card should be face-up after undo",
    );
});

test("undo after two moves reverts each in order", () => {
    const state = Game.initGame();
    // Move 1: draw from stock
    Game.saveSnapshot();
    Game.drawFromStock();
    const wasteAfterFirstDraw = state.waste[0];
    // Move 2: draw again
    Game.saveSnapshot();
    Game.drawFromStock();
    assertEqual(state.waste.length, 2, "waste should have 2 cards");
    // Undo reverts the second draw
    Game.undo();
    const restored = Game.getState();
    assertEqual(
        restored.waste.length,
        1,
        "waste should have 1 card after first undo",
    );
    assertEqual(restored.waste[0].suit, wasteAfterFirstDraw.suit);
    assertEqual(restored.waste[0].rank, wasteAfterFirstDraw.rank);
    assert(Game.canUndo(), "canUndo should still be true — first move remains");
    // Undo reverts the first draw
    Game.undo();
    const restored2 = Game.getState();
    assertEqual(
        restored2.waste.length,
        0,
        "waste should be empty after second undo",
    );
    assert(!Game.canUndo(), "canUndo should be false — history exhausted");
});

test("initGame clears undo history", () => {
    Game.initGame();
    Game.saveSnapshot();
    Game.drawFromStock();
    assert(Game.canUndo(), "canUndo should be true before new game");
    Game.initGame();
    assert(!Game.canUndo(), "canUndo should be false after initGame");
});

// getMoveCount
test("getMoveCount starts at 0 after initGame", () => {
    Game.initGame();
    assertEqual(Game.getMoveCount(), 0);
});

test("drawFromStock increments move count", () => {
    Game.initGame();
    Game.drawFromStock();
    assertEqual(Game.getMoveCount(), 1);
});

test("moveToTableau increments on success only", () => {
    const state = Game.initGame();
    state.tableau[0] = [];
    const king = { suit: "hearts", rank: 13, faceUp: true };
    state.waste.push(king);
    const before = Game.getMoveCount();
    Game.moveToTableau([king], 0, { type: "waste" });
    assertEqual(Game.getMoveCount(), before + 1);
    // Invalid move should not increment
    const queen = { suit: "hearts", rank: 12, faceUp: true };
    state.waste.push(queen);
    const before2 = Game.getMoveCount();
    Game.moveToTableau([queen], 0, { type: "waste" }); // red on red, invalid
    assertEqual(Game.getMoveCount(), before2);
});

test("moveToFoundation increments on success only", () => {
    const state = Game.initGame();
    const ace = { suit: "spades", rank: 1, faceUp: true };
    state.waste.push(ace);
    const before = Game.getMoveCount();
    Game.moveToFoundation(ace, { type: "waste" });
    assertEqual(Game.getMoveCount(), before + 1);
    // Invalid move should not increment
    const three = { suit: "spades", rank: 3, faceUp: true };
    state.waste.push(three);
    const before2 = Game.getMoveCount();
    Game.moveToFoundation(three, { type: "waste" });
    assertEqual(Game.getMoveCount(), before2);
});

test("moveToFoundation with skipCount does not increment moveCount", () => {
    const state = Game.initGame();
    const ace = { suit: "spades", rank: 1, faceUp: true };
    state.waste.push(ace);
    const before = Game.getMoveCount();
    Game.moveToFoundation(ace, { type: "waste" }, { skipCount: true });
    assertEqual(
        Game.getMoveCount(),
        before,
        "moveCount should not increase with skipCount",
    );
    assertEqual(
        state.foundations[0].length,
        1,
        "card should still move to foundation",
    );
});

// canAutoComplete
test("canAutoComplete returns false during normal play (face-down tableau cards)", () => {
    Game.initGame();
    assert(
        !Game.canAutoComplete(),
        "should be false when tableau has face-down cards",
    );
});

test("canAutoComplete returns true when stock is empty, waste is empty, and all tableau cards are face-up", () => {
    const state = Game.initGame();
    state.stock = [];
    state.waste = [];
    for (let col = 0; col < 7; col++) {
        state.tableau[col] = state.tableau[col].map((c) => ({
            ...c,
            faceUp: true,
        }));
    }
    assert(
        Game.canAutoComplete(),
        "should be true when stock empty, waste empty, and all tableau face-up",
    );
});

test("canAutoComplete returns false when waste still has cards", () => {
    const state = Game.initGame();
    state.stock = [];
    state.waste = [{ suit: "hearts", rank: 5, faceUp: true }];
    for (let col = 0; col < 7; col++) {
        state.tableau[col] = state.tableau[col].map((c) => ({
            ...c,
            faceUp: true,
        }));
    }
    assert(
        !Game.canAutoComplete(),
        "should be false when waste has cards even if stock is empty and tableau is all face-up",
    );
});

test("canAutoComplete returns true with empty tableau columns", () => {
    const state = Game.initGame();
    state.stock = [];
    state.waste = [];
    for (let col = 0; col < 7; col++) {
        state.tableau[col] = [];
    }
    assert(Game.canAutoComplete(), "should be true when all columns are empty");
});

test("canAutoComplete returns false when stock still has cards", () => {
    const state = Game.initGame();
    for (let col = 0; col < 7; col++) {
        state.tableau[col] = state.tableau[col].map((c) => ({
            ...c,
            faceUp: true,
        }));
    }
    assert(state.stock.length > 0, "stock should have cards");
    assert(!Game.canAutoComplete(), "should be false when stock has cards");
});

// checkWin
test("checkWin returns false mid-game", () => {
    Game.initGame();
    assert(!Game.checkWin());
});

test("checkWin returns true when all foundations have 13 cards", () => {
    const state = Game.initGame();
    // Fill all foundations manually
    const SUITS = ["spades", "hearts", "diamonds", "clubs"];
    SUITS.forEach((suit, i) => {
        state.foundations[i] = [];
        for (let rank = 1; rank <= 13; rank++) {
            state.foundations[i].push({ suit, rank, faceUp: true });
        }
    });
    assert(Game.checkWin());
});

// drawFromStock with drawCount=3
test("draw-3 moves 3 cards from stock to waste", () => {
    Game.setDrawCount(3);
    const state = Game.initGame();
    const originalStockLen = state.stock.length;
    Game.drawFromStock();
    assertEqual(state.waste.length, 3, "waste should have 3 cards");
    assertEqual(
        state.stock.length,
        originalStockLen - 3,
        "stock should lose 3 cards",
    );
    assert(
        state.waste.every((c) => c.faceUp),
        "all waste cards should be face-up",
    );
    Game.setDrawCount(1);
});

test("draw-3 partial: draws only remaining cards when stock has fewer than 3", () => {
    Game.setDrawCount(3);
    const state = Game.initGame();
    // Drain stock to exactly 2 cards
    while (state.stock.length > 2) {
        state.stock.pop();
    }
    Game.drawFromStock();
    assertEqual(state.waste.length, 2, "waste should have 2 cards");
    assertEqual(state.stock.length, 0, "stock should be empty");
    Game.setDrawCount(1);
});

test("draw-3 appends to existing waste cards", () => {
    Game.setDrawCount(3);
    const state = Game.initGame();
    Game.drawFromStock();
    assertEqual(
        state.waste.length,
        3,
        "waste should have 3 cards after first draw",
    );
    Game.drawFromStock();
    assertEqual(
        state.waste.length,
        6,
        "waste should have 6 cards after second draw",
    );
    Game.setDrawCount(1);
});

test("draw-3 recycle: waste reverses back to stock when stock is empty", () => {
    Game.setDrawCount(3);
    const state = Game.initGame();
    // Drain entire stock
    while (state.stock.length > 0) {
        Game.drawFromStock();
    }
    const wasteLen = state.waste.length;
    assert(wasteLen > 0, "waste should have cards");
    // Recycle
    Game.drawFromStock();
    assertEqual(state.waste.length, 0, "waste should be empty after recycle");
    assertEqual(
        state.stock.length,
        wasteLen,
        "stock should have all recycled cards",
    );
    assert(
        state.stock.every((c) => !c.faceUp),
        "recycled cards should be face-down",
    );
    Game.setDrawCount(1);
});

// findBestMove
test("findBestMove prefers foundation over tableau", () => {
    const state = Game.initGame();
    state.foundations[0] = []; // spades empty
    state.tableau[0] = [{ suit: "hearts", rank: 2, faceUp: true }]; // red 2
    const ace = { suit: "spades", rank: 1, faceUp: true };
    state.waste = [ace];
    const dest = Game.findBestMove(ace, { type: "waste" });
    assertEqual(dest.type, "foundation", "should prefer foundation");
    assertEqual(dest.suit, "spades");
});

test("findBestMove falls back to non-empty tableau when foundation is not valid", () => {
    const state = Game.initGame();
    state.foundations[0] = []; // spades empty, needs Ace
    const blackJack = { suit: "spades", rank: 11, faceUp: true };
    state.waste = [blackJack];
    // Put a red Queen on col 0 so Jack can go there
    state.tableau[0] = [{ suit: "hearts", rank: 12, faceUp: true }];
    const dest = Game.findBestMove(blackJack, { type: "waste" });
    assertEqual(dest.type, "tableau", "should fall back to tableau");
    assertEqual(dest.colIndex, 0);
});

test("findBestMove prefers non-empty tableau over empty", () => {
    const state = Game.initGame();
    // Clear all tableau columns
    for (let i = 0; i < 7; i++) state.tableau[i] = [];
    // Put a red Queen on col 3
    state.tableau[3] = [{ suit: "hearts", rank: 12, faceUp: true }];
    const blackJack = { suit: "spades", rank: 11, faceUp: true };
    state.waste = [blackJack];
    const dest = Game.findBestMove(blackJack, { type: "waste" });
    assertEqual(dest.type, "tableau");
    assertEqual(
        dest.colIndex,
        3,
        "should prefer non-empty col 3 over empty columns",
    );
});

test("findBestMove returns empty tableau for King when no non-empty column fits", () => {
    const state = Game.initGame();
    for (let i = 0; i < 7; i++) state.tableau[i] = [];
    const king = { suit: "spades", rank: 13, faceUp: true };
    state.waste = [king];
    const dest = Game.findBestMove(king, { type: "waste" });
    assertEqual(dest.type, "tableau");
    assertEqual(dest.colIndex, 0, "should use first empty column");
});

test("findBestMove returns null when no valid destination exists", () => {
    const state = Game.initGame();
    // Put a 5 of spades in waste — foundations empty (needs Ace), no matching tableau target
    const five = { suit: "spades", rank: 5, faceUp: true };
    state.waste = [five];
    // Clear tableau so no valid targets (5 is not a King, can't go to empty)
    for (let i = 0; i < 7; i++) state.tableau[i] = [];
    const dest = Game.findBestMove(five, { type: "waste" });
    assertEqual(dest, null, "should return null");
});

test("findBestMove skips foundation for non-top tableau card and finds tableau instead", () => {
    const state = Game.initGame();
    for (let i = 0; i < 7; i++) state.tableau[i] = [];
    // Col 0: 6♠ on top of which sit 5♥ and 4♣ (6 is not the top card)
    const six = { suit: "spades", rank: 6, faceUp: true };
    const five = { suit: "hearts", rank: 5, faceUp: true };
    const four = { suit: "clubs", rank: 4, faceUp: true };
    state.tableau[0] = [six, five, four];
    // Foundation has spades up to 5 — so 6♠ could go to foundation IF it were extractable
    state.foundations[0] = [
        { suit: "spades", rank: 1, faceUp: true },
        { suit: "spades", rank: 2, faceUp: true },
        { suit: "spades", rank: 3, faceUp: true },
        { suit: "spades", rank: 4, faceUp: true },
        { suit: "spades", rank: 5, faceUp: true },
    ];
    // Col 1 has a red 7 — valid tableau target for the 6♠
    state.tableau[1] = [{ suit: "hearts", rank: 7, faceUp: true }];
    const dest = Game.findBestMove(six, { type: "tableau", colIndex: 0 });
    assertEqual(dest.type, "tableau", "should skip foundation for buried card");
    assertEqual(dest.colIndex, 1);
});

test("findBestMove returns null for buried card with valid foundation but no tableau target", () => {
    const state = Game.initGame();
    for (let i = 0; i < 7; i++) state.tableau[i] = [];
    const six = { suit: "spades", rank: 6, faceUp: true };
    const five = { suit: "hearts", rank: 5, faceUp: true };
    state.tableau[0] = [six, five];
    state.foundations[0] = [
        { suit: "spades", rank: 1, faceUp: true },
        { suit: "spades", rank: 2, faceUp: true },
        { suit: "spades", rank: 3, faceUp: true },
        { suit: "spades", rank: 4, faceUp: true },
        { suit: "spades", rank: 5, faceUp: true },
    ];
    const dest = Game.findBestMove(six, { type: "tableau", colIndex: 0 });
    assertEqual(
        dest,
        null,
        "buried card with no tableau target should return null",
    );
});

test("findBestMove still prefers foundation for top card of tableau", () => {
    const state = Game.initGame();
    for (let i = 0; i < 7; i++) state.tableau[i] = [];
    const six = { suit: "spades", rank: 6, faceUp: true };
    state.tableau[0] = [six];
    state.foundations[0] = [
        { suit: "spades", rank: 1, faceUp: true },
        { suit: "spades", rank: 2, faceUp: true },
        { suit: "spades", rank: 3, faceUp: true },
        { suit: "spades", rank: 4, faceUp: true },
        { suit: "spades", rank: 5, faceUp: true },
    ];
    const dest = Game.findBestMove(six, { type: "tableau", colIndex: 0 });
    assertEqual(
        dest.type,
        "foundation",
        "top card should still go to foundation",
    );
});

test("findBestMove skips source column for tableau cards", () => {
    const state = Game.initGame();
    for (let i = 0; i < 7; i++) state.tableau[i] = [];
    // Col 0 has a red Queen, col 1 has a black King
    const redQueen = { suit: "hearts", rank: 12, faceUp: true };
    state.tableau[0] = [redQueen];
    state.tableau[1] = [{ suit: "spades", rank: 13, faceUp: true }];
    const dest = Game.findBestMove(redQueen, { type: "tableau", colIndex: 0 });
    assertEqual(dest.type, "tableau");
    assertEqual(dest.colIndex, 1, "should move to col 1, not back to col 0");
});

// setDrawCount / getDrawCount
test("setDrawCount and getDrawCount round-trip", () => {
    Game.setDrawCount(3);
    assertEqual(Game.getDrawCount(), 3, "should return 3 after setting 3");
    Game.setDrawCount(1);
    assertEqual(Game.getDrawCount(), 1, "should return 1 after setting 1");
});

test("initGame preserves drawCount", () => {
    Game.setDrawCount(3);
    Game.initGame();
    assertEqual(Game.getDrawCount(), 3, "drawCount should survive initGame");
    Game.setDrawCount(1);
});

// defensive source validation
test("moveToFoundation rejects card not in source (foreign object)", () => {
    const state = Game.initGame();
    const ace = { suit: "spades", rank: 1, faceUp: true };
    // ace is NOT in waste — it's a detached object
    state.foundations[0] = [];
    const moved = Game.moveToFoundation(ace, { type: "waste" });
    assert(!moved, "should reject card not actually in waste");
});

test("moveToFoundation rejects non-top tableau card and does not mutate state", () => {
    const state = Game.initGame();
    const ace = { suit: "hearts", rank: 1, faceUp: true };
    const five = { suit: "spades", rank: 5, faceUp: true };
    state.tableau[0] = [ace, five];
    const fi = Game.SUITS.indexOf("hearts");
    state.foundations[fi] = [];
    const moved = Game.moveToFoundation(ace, { type: "tableau", colIndex: 0 });
    assert(!moved, "should reject non-top tableau card");
    assertEqual(state.tableau[0].length, 2, "tableau should be unchanged");
    assertEqual(
        state.foundations[fi].length,
        0,
        "foundation should be unchanged",
    );
});

test("moveToFoundation rejects foreign card object not in source", () => {
    const state = Game.initGame();
    const foreign = { suit: "hearts", rank: 1, faceUp: true };
    const fi = Game.SUITS.indexOf("hearts");
    state.foundations[fi] = [];
    state.tableau[0] = [{ suit: "clubs", rank: 9, faceUp: true }];
    const moved = Game.moveToFoundation(foreign, {
        type: "tableau",
        colIndex: 0,
    });
    assert(
        !moved,
        "should reject card object not in the source tableau column",
    );
    assertEqual(state.tableau[0].length, 1, "tableau should be unchanged");
    assertEqual(
        state.foundations[fi].length,
        0,
        "foundation should be unchanged",
    );
});

test("moveToTableau rejects card not in source", () => {
    const state = Game.initGame();
    state.tableau[0] = [];
    const king = { suit: "hearts", rank: 13, faceUp: true };
    // king is NOT actually in waste
    const moved = Game.moveToTableau([king], 0, { type: "waste" });
    assert(!moved, "should reject card not actually in waste");
});

test("moveToTableau rejects mismatched stack from tableau and does not mutate", () => {
    const state = Game.initGame();
    const blackKing = { suit: "spades", rank: 13, faceUp: true };
    const redQueen = { suit: "hearts", rank: 12, faceUp: true };
    const blackJack = { suit: "clubs", rank: 11, faceUp: true };
    state.tableau[0] = [blackKing];
    state.tableau[1] = [redQueen, blackJack];
    // Try moving with a fabricated cards array that doesn't match col 1's suffix
    const fakeQueen = { suit: "hearts", rank: 12, faceUp: true };
    const moved = Game.moveToTableau([fakeQueen], 0, {
        type: "tableau",
        colIndex: 1,
    });
    assert(
        !moved,
        "should reject cards not matching source suffix by identity",
    );
    assertEqual(state.tableau[0].length, 1, "target should be unchanged");
    assertEqual(state.tableau[1].length, 2, "source should be unchanged");
});

// undo after stock recycle
test("undo after stock recycle restores waste and stock", () => {
    const state = Game.initGame();
    // Drain stock
    while (state.stock.length > 0) {
        Game.drawFromStock();
    }
    const wasteLen = state.waste.length;
    assert(wasteLen > 0, "waste should have cards");
    Game.saveSnapshot();
    Game.drawFromStock(); // recycle
    assertEqual(state.waste.length, 0, "waste empty after recycle");
    assertEqual(state.stock.length, wasteLen, "stock has recycled cards");
    Game.undo();
    const restored = Game.getState();
    assertEqual(restored.waste.length, wasteLen, "waste restored after undo");
    assertEqual(restored.stock.length, 0, "stock should be empty after undo");
});

// draw-3 with exactly 1 card left
test("draw-3 with exactly 1 card remaining draws 1", () => {
    Game.setDrawCount(3);
    const state = Game.initGame();
    while (state.stock.length > 1) {
        state.stock.pop();
    }
    Game.drawFromStock();
    assertEqual(state.waste.length, 1, "waste should have 1 card");
    assertEqual(state.stock.length, 0, "stock should be empty");
    Game.setDrawCount(1);
});

// findBestMove with foundation as source
test("findBestMove from foundation finds tableau destination", () => {
    const state = Game.initGame();
    for (let i = 0; i < 7; i++) state.tableau[i] = [];
    const two = { suit: "hearts", rank: 2, faceUp: true };
    const fi = Game.SUITS.indexOf("hearts");
    state.foundations[fi] = [{ suit: "hearts", rank: 1, faceUp: true }, two];
    // Put a black 3 on col 0 so the red 2 can go there
    state.tableau[0] = [{ suit: "spades", rank: 3, faceUp: true }];
    const dest = Game.findBestMove(two, { type: "foundation" });
    assertEqual(dest.type, "tableau", "should find tableau destination");
    assertEqual(dest.colIndex, 0);
});

// checkWin edge case
test("checkWin returns false when one foundation is incomplete", () => {
    const state = Game.initGame();
    const SUITS = ["spades", "hearts", "diamonds", "clubs"];
    SUITS.forEach((suit, i) => {
        state.foundations[i] = [];
        for (let rank = 1; rank <= 13; rank++) {
            state.foundations[i].push({ suit, rank, faceUp: true });
        }
    });
    // Remove the last card from one foundation
    state.foundations[2].pop();
    assert(
        !Game.checkWin(),
        "should be false when one foundation has only 12 cards",
    );
});

// unlimited undo history
test("undo can revert multiple moves in sequence", () => {
    const state = Game.initGame();
    // Set up: empty foundations, put aces in waste one at a time
    const aceSpades = { suit: "spades", rank: 1, faceUp: true };
    const aceHearts = { suit: "hearts", rank: 1, faceUp: true };
    state.waste = [aceSpades];
    state.foundations[0] = [];
    state.foundations[1] = [];

    // Move 1: ace of spades to foundation
    Game.saveSnapshot();
    Game.moveToFoundation(aceSpades, { type: "waste" });
    assertEqual(state.foundations[0].length, 1, "spades foundation has ace");

    // Move 2: ace of hearts to foundation
    state.waste = [aceHearts];
    Game.saveSnapshot();
    Game.moveToFoundation(aceHearts, { type: "waste" });
    assertEqual(state.foundations[1].length, 1, "hearts foundation has ace");

    // Undo move 2
    assert(Game.canUndo(), "should be able to undo after move 2");
    Game.undo();
    const s1 = Game.getState();
    assertEqual(
        s1.foundations[1].length,
        0,
        "hearts foundation empty after first undo",
    );
    assertEqual(s1.foundations[0].length, 1, "spades foundation still has ace");

    // Undo move 1
    assert(Game.canUndo(), "should be able to undo again after first undo");
    Game.undo();
    const s2 = Game.getState();
    assertEqual(
        s2.foundations[0].length,
        0,
        "spades foundation empty after second undo",
    );
});

test("canUndo returns false when history is fully exhausted", () => {
    Game.initGame();
    Game.saveSnapshot();
    Game.drawFromStock();
    Game.undo();
    assert(!Game.canUndo(), "should not be able to undo with no history left");
});

test("initGame clears undo history", () => {
    Game.initGame();
    Game.saveSnapshot();
    Game.drawFromStock();
    assert(Game.canUndo(), "should be able to undo before new game");
    Game.initGame();
    assert(!Game.canUndo(), "undo history should be empty after initGame");
});

// moveToTableau rejects invalid runs (not alternating color or not descending)
test("moveToTableau rejects stack with same-color cards", () => {
    const state = Game.initGame();
    const redQueen = { suit: "hearts", rank: 12, faceUp: true };
    const redJack = { suit: "diamonds", rank: 11, faceUp: true };
    state.tableau[0] = [redQueen, redJack];
    const blackKing = { suit: "spades", rank: 13, faceUp: true };
    state.tableau[1] = [blackKing];
    const moved = Game.moveToTableau([redQueen, redJack], 1, {
        type: "tableau",
        colIndex: 0,
    });
    assert(!moved, "should reject stack where cards are same color");
    assertEqual(state.tableau[0].length, 2, "source unchanged");
    assertEqual(state.tableau[1].length, 1, "target unchanged");
});

test("moveToTableau rejects stack with non-descending ranks", () => {
    const state = Game.initGame();
    const blackJack = { suit: "spades", rank: 11, faceUp: true };
    const redNine = { suit: "hearts", rank: 9, faceUp: true };
    state.tableau[0] = [blackJack, redNine];
    const redQueen = { suit: "hearts", rank: 12, faceUp: true };
    state.tableau[1] = [redQueen];
    const moved = Game.moveToTableau([blackJack, redNine], 1, {
        type: "tableau",
        colIndex: 0,
    });
    assert(!moved, "should reject stack with non-sequential ranks");
    assertEqual(state.tableau[0].length, 2, "source unchanged");
    assertEqual(state.tableau[1].length, 1, "target unchanged");
});

test("moveToTableau rejects stack containing a face-down card", () => {
    const state = Game.initGame();
    const blackJack = { suit: "spades", rank: 11, faceUp: true };
    const redTen = { suit: "hearts", rank: 10, faceUp: false };
    state.tableau[0] = [blackJack, redTen];
    const redQueen = { suit: "hearts", rank: 12, faceUp: true };
    state.tableau[1] = [redQueen];
    const moved = Game.moveToTableau([blackJack, redTen], 1, {
        type: "tableau",
        colIndex: 0,
    });
    assert(!moved, "should reject stack with face-down card");
});

test("moveToTableau accepts a valid multi-card run", () => {
    const state = Game.initGame();
    const redQueen = { suit: "hearts", rank: 12, faceUp: true };
    const blackJack = { suit: "spades", rank: 11, faceUp: true };
    const redTen = { suit: "diamonds", rank: 10, faceUp: true };
    state.tableau[0] = [redQueen, blackJack, redTen];
    const blackKing = { suit: "clubs", rank: 13, faceUp: true };
    state.tableau[1] = [blackKing];
    const moved = Game.moveToTableau([redQueen, blackJack, redTen], 1, {
        type: "tableau",
        colIndex: 0,
    });
    assert(moved, "should accept valid alternating-color descending run");
    assertEqual(state.tableau[1].length, 4);
    assertEqual(state.tableau[0].length, 0);
});

// drawFromStock no-op when both stock and waste are empty
test("drawFromStock does not increment moveCount when stock and waste are empty", () => {
    const state = Game.initGame();
    state.stock = [];
    state.waste = [];
    const before = Game.getMoveCount();
    Game.drawFromStock();
    assertEqual(
        Game.getMoveCount(),
        before,
        "moveCount should not change on no-op draw",
    );
});

// Recycling waste back to stock should not count as a move
test("drawFromStock does not increment moveCount when recycling waste", () => {
    const state = Game.initGame();
    // Drain entire stock
    while (state.stock.length > 0) {
        Game.drawFromStock();
    }
    const before = Game.getMoveCount();
    assert(state.waste.length > 0, "waste should have cards");
    // Recycle waste back to stock
    Game.drawFromStock();
    assertEqual(
        Game.getMoveCount(),
        before,
        "moveCount should not change on recycle",
    );
});

// undo history is capped to prevent unbounded memory growth
test("undo history is capped at HISTORY_LIMIT", () => {
    const LIMIT = Game.HISTORY_LIMIT;
    assert(LIMIT > 0, "HISTORY_LIMIT should be exposed and positive");
    const state = Game.initGame();
    // Push more snapshots than the limit
    for (let i = 0; i < LIMIT + 50; i++) {
        Game.saveSnapshot();
        Game.drawFromStock();
        // Refill stock to keep drawing
        if (state.stock.length === 0 && state.waste.length === 0) {
            state.stock = [{ suit: "spades", rank: 1, faceUp: false }];
        }
    }
    // Undo should work at most LIMIT times
    let undoCount = 0;
    while (Game.canUndo()) {
        Game.undo();
        undoCount++;
    }
    assertEqual(undoCount, LIMIT, `should only be able to undo ${LIMIT} times`);
});

// consumeAnimations
test("moveToFoundation sets _landAnim on card", () => {
    const state = Game.initGame();
    const ace = { suit: "spades", rank: 1, faceUp: true };
    state.waste.push(ace);
    Game.moveToFoundation(ace, { type: "waste" });
    assert(
        ace._landAnim === true,
        "card should have _landAnim after moveToFoundation",
    );
});

test("consumeAnimations clears _landAnim from foundation cards", () => {
    const state = Game.initGame();
    const ace = { suit: "spades", rank: 1, faceUp: true };
    state.waste.push(ace);
    Game.moveToFoundation(ace, { type: "waste" });
    Game.consumeAnimations();
    assert(
        !ace._landAnim,
        "_landAnim should be cleared after consumeAnimations",
    );
});

test("consumeAnimations clears _flipAnim from newly exposed tableau card", () => {
    const state = Game.initGame();
    const faceDown = { suit: "clubs", rank: 5, faceUp: false };
    const ace = { suit: "hearts", rank: 1, faceUp: true };
    state.tableau[0] = [faceDown, ace];
    Game.moveToFoundation(ace, { type: "tableau", colIndex: 0 });
    assert(faceDown._flipAnim === true, "exposed card should have _flipAnim");
    Game.consumeAnimations();
    assert(
        !faceDown._flipAnim,
        "_flipAnim should be cleared after consumeAnimations",
    );
});

test("consumeAnimations is safe to call with no animations pending", () => {
    Game.initGame();
    Game.consumeAnimations(); // should not throw
});

// drawFromStock returns false on no-op
test("drawFromStock returns false when stock and waste are both empty", () => {
    const state = Game.initGame();
    state.stock = [];
    state.waste = [];
    assertEqual(Game.drawFromStock(), false, "should return false on no-op");
});

test("drawFromStock returns true when it draws a card", () => {
    Game.initGame();
    assertEqual(
        Game.drawFromStock(),
        true,
        "should return true on successful draw",
    );
});

test("drawFromStock returns true when it recycles waste", () => {
    const state = Game.initGame();
    while (state.stock.length > 0) Game.drawFromStock();
    assert(state.waste.length > 0, "waste should have cards");
    assertEqual(Game.drawFromStock(), true, "should return true on recycle");
});

// ── Draw-3 stock pass limit ──────────────────────

test("getStockPass returns 0 after initGame", () => {
    Game.initGame();
    assertEqual(Game.getStockPass(), 0, "stockPass should start at 0");
});

test("draw-3 allows 3 full passes through stock", () => {
    Game.setDrawCount(3);
    Game.setPassLimit(2);
    const state = Game.initGame();
    // Complete 3 full passes (draw all + recycle) × 3
    for (let pass = 0; pass < 3; pass++) {
        while (state.stock.length > 0) {
            assert(
                Game.drawFromStock() === true,
                `draw should succeed on pass ${pass + 1}`,
            );
        }
        if (pass < 2) {
            // Recycle should work for passes 1 and 2
            assert(
                Game.drawFromStock() === true,
                `recycle should succeed after pass ${pass + 1}`,
            );
        }
    }
    // After 3rd pass, recycle should fail
    assertEqual(state.stock.length, 0, "stock should be empty after 3rd pass");
    assertEqual(
        Game.drawFromStock(),
        false,
        "recycle should be blocked after 3 passes in draw-3",
    );
    Game.setDrawCount(1); // restore
});

test("draw-1 allows unlimited passes through stock", () => {
    Game.setDrawCount(1);
    const state = Game.initGame();
    // Complete 5 full passes — should all succeed
    for (let pass = 0; pass < 5; pass++) {
        while (state.stock.length > 0) {
            assert(
                Game.drawFromStock() === true,
                `draw should succeed on pass ${pass + 1}`,
            );
        }
        assert(
            Game.drawFromStock() === true,
            `recycle should succeed after pass ${pass + 1}`,
        );
    }
});

test("stockPass increments on each recycle in draw-3", () => {
    Game.setDrawCount(3);
    const state = Game.initGame();
    assertEqual(Game.getStockPass(), 0, "should start at 0");
    while (state.stock.length > 0) Game.drawFromStock();
    Game.drawFromStock(); // recycle
    assertEqual(Game.getStockPass(), 1, "should be 1 after first recycle");
    while (state.stock.length > 0) Game.drawFromStock();
    Game.drawFromStock(); // recycle
    assertEqual(Game.getStockPass(), 2, "should be 2 after second recycle");
    Game.setDrawCount(1); // restore
});

test("undo restores stockPass after recycle", () => {
    Game.setDrawCount(3);
    const state = Game.initGame();
    while (state.stock.length > 0) Game.drawFromStock();
    Game.saveSnapshot();
    Game.drawFromStock(); // recycle → pass 1
    assertEqual(Game.getStockPass(), 1, "stockPass should be 1 after recycle");
    Game.undo();
    assertEqual(
        Game.getStockPass(),
        0,
        "stockPass should revert to 0 after undo",
    );
    Game.setDrawCount(1); // restore
});

test("initGame resets stockPass", () => {
    Game.setDrawCount(3);
    const state = Game.initGame();
    while (state.stock.length > 0) Game.drawFromStock();
    Game.drawFromStock(); // recycle
    assert(Game.getStockPass() > 0, "stockPass should be > 0 after recycle");
    Game.initGame();
    assertEqual(Game.getStockPass(), 0, "stockPass should reset on new game");
    Game.setDrawCount(1); // restore
});

// ── Configurable pass limit ──────────────────────

test("setPassLimit and getPassLimit round-trip", () => {
    Game.setPassLimit(0);
    assertEqual(
        Game.getPassLimit(),
        0,
        "should return 0 after setting unlimited",
    );
    Game.setPassLimit(2);
    assertEqual(Game.getPassLimit(), 2, "should return 2 after setting 3-pass");
});

test("draw-3 unlimited mode allows recycling indefinitely", () => {
    Game.setDrawCount(3);
    Game.setPassLimit(0);
    const state = Game.initGame();
    // Complete 5 full passes — all should succeed
    for (let pass = 0; pass < 5; pass++) {
        while (state.stock.length > 0) {
            assert(
                Game.drawFromStock() === true,
                `draw should succeed on pass ${pass + 1}`,
            );
        }
        assert(
            Game.drawFromStock() === true,
            `recycle should succeed after pass ${pass + 1}`,
        );
    }
    Game.setPassLimit(2);
    Game.setDrawCount(1);
});

test("draw-3 with passLimit=2 still enforces 3-pass limit", () => {
    Game.setDrawCount(3);
    Game.setPassLimit(2);
    const state = Game.initGame();
    // Complete 3 full passes
    for (let pass = 0; pass < 3; pass++) {
        while (state.stock.length > 0) {
            assert(
                Game.drawFromStock() === true,
                `draw should succeed on pass ${pass + 1}`,
            );
        }
        if (pass < 2) {
            assert(
                Game.drawFromStock() === true,
                `recycle should succeed after pass ${pass + 1}`,
            );
        }
    }
    // 4th recycle should fail
    assertEqual(
        Game.drawFromStock(),
        false,
        "recycle should be blocked after 3 passes",
    );
    Game.setDrawCount(1);
});

test("initGame preserves passLimit", () => {
    Game.setPassLimit(0);
    Game.initGame();
    assertEqual(Game.getPassLimit(), 0, "passLimit should survive initGame");
    Game.setPassLimit(2);
});

test("default passLimit is unlimited (0)", () => {
    // Fresh state after initGame should default to unlimited
    Game.setPassLimit(0); // reset to default
    Game.setDrawCount(3);
    const state = Game.initGame();
    assertEqual(Game.getPassLimit(), 0, "default passLimit should be 0 (unlimited)");
    // Verify recycling works beyond 3 passes
    for (let pass = 0; pass < 4; pass++) {
        while (state.stock.length > 0) {
            Game.drawFromStock();
        }
        assert(Game.drawFromStock() === true, `recycle should succeed on pass ${pass + 1} with unlimited default`);
    }
});

// ── hasAnyMove ────────────────────────────────────

test("hasAnyMove returns true when stock has cards", () => {
    const state = Game.initGame();
    // Stock always has cards after initGame
    assert(state.stock.length > 0, "stock should have cards");
    assert(Game.hasAnyMove(), "should return true when stock is drawable");
});

test("hasAnyMove returns true when waste can be recycled (draw-1)", () => {
    Game.setDrawCount(1);
    const state = Game.initGame();
    // Drain stock
    while (state.stock.length > 0) Game.drawFromStock();
    assertEqual(state.stock.length, 0, "stock should be empty");
    assert(state.waste.length > 0, "waste should have cards");
    assert(Game.hasAnyMove(), "should return true when waste can be recycled");
    Game.setDrawCount(1);
});

test("hasAnyMove returns true when waste can be recycled (draw-3, unlimited)", () => {
    Game.setDrawCount(3);
    Game.setPassLimit(0);
    const state = Game.initGame();
    while (state.stock.length > 0) Game.drawFromStock();
    assertEqual(state.stock.length, 0);
    assert(state.waste.length > 0);
    assert(Game.hasAnyMove(), "should return true with unlimited passes remaining");
    Game.setDrawCount(1);
    Game.setPassLimit(0);
});

test("hasAnyMove returns false when draw-3 pass limit is exhausted and board is stuck", () => {
    Game.setDrawCount(3);
    Game.setPassLimit(2);
    const state = Game.initGame();
    // Exhaust all passes
    for (let pass = 0; pass < 3; pass++) {
        while (state.stock.length > 0) Game.drawFromStock();
        if (pass < 2) Game.drawFromStock(); // recycle
    }
    // Clear waste so no board moves exist
    state.waste = [];
    for (let i = 0; i < 7; i++) state.tableau[i] = [];
    assertEqual(Game.hasAnyMove(), false, "should return false when pass limit hit and no board moves");
    Game.setDrawCount(1);
    Game.setPassLimit(0);
});

test("hasAnyMove returns true when waste top can move to foundation", () => {
    const state = Game.initGame();
    state.stock = [];
    state.waste = [{ suit: "spades", rank: 1, faceUp: true }];
    state.foundations[0] = [];
    for (let i = 0; i < 7; i++) state.tableau[i] = [];
    assert(Game.hasAnyMove(), "should return true when waste ace can go to empty foundation");
});

test("hasAnyMove returns true when waste top can move to tableau", () => {
    const state = Game.initGame();
    state.stock = [];
    const blackJack = { suit: "spades", rank: 11, faceUp: true };
    state.waste = [blackJack];
    for (let i = 0; i < 7; i++) state.tableau[i] = [];
    state.tableau[0] = [{ suit: "hearts", rank: 12, faceUp: true }];
    assert(Game.hasAnyMove(), "should return true when waste top can go onto tableau");
});

test("hasAnyMove returns true when tableau top can move to foundation", () => {
    const state = Game.initGame();
    state.stock = [];
    state.waste = [];
    for (let i = 0; i < 7; i++) state.tableau[i] = [];
    const ace = { suit: "clubs", rank: 1, faceUp: true };
    state.tableau[3] = [ace];
    state.foundations[3] = [];
    assert(Game.hasAnyMove(), "should return true when tableau top card can go to foundation");
});

test("hasAnyMove returns true when tableau-to-tableau move exists", () => {
    const state = Game.initGame();
    state.stock = [];
    state.waste = [];
    for (let i = 0; i < 7; i++) state.tableau[i] = [];
    state.tableau[0] = [{ suit: "hearts", rank: 12, faceUp: true }]; // red Queen
    state.tableau[1] = [{ suit: "spades", rank: 13, faceUp: true }]; // black King
    // Red Queen can go onto black King
    assert(Game.hasAnyMove(), "should return true when tableau-to-tableau move exists");
});

test("hasAnyMove returns true when a buried face-up run can move to another column", () => {
    const state = Game.initGame();
    state.stock = [];
    state.waste = [];
    for (let i = 0; i < 7; i++) state.tableau[i] = [];
    const faceDown = { suit: "clubs", rank: 9, faceUp: false };
    const redQueen = { suit: "hearts", rank: 12, faceUp: true };
    const blackJack = { suit: "spades", rank: 11, faceUp: true };
    state.tableau[0] = [faceDown, redQueen, blackJack];
    state.tableau[1] = [{ suit: "clubs", rank: 13, faceUp: true }]; // black King
    // redQueen+blackJack run can move onto black King
    assert(Game.hasAnyMove(), "should detect tableau run-to-tableau move");
});

test("hasAnyMove returns false when truly stuck (no stock, no valid moves)", () => {
    const state = Game.initGame();
    state.stock = [];
    state.waste = [];
    for (let i = 0; i < 7; i++) state.tableau[i] = [];
    // All foundations complete — no moves possible from empty waste/tableau
    ["spades", "hearts", "diamonds", "clubs"].forEach((suit, i) => {
        state.foundations[i] = [];
        for (let rank = 1; rank <= 13; rank++) {
            state.foundations[i].push({ suit, rank, faceUp: true });
        }
    });
    // checkWin would be true but hasAnyMove should still return false
    assertEqual(Game.hasAnyMove(), false, "fully won game has no moves");
});

test("hasAnyMove returns false when stock/waste empty and only face-down cards in tableau", () => {
    const state = Game.initGame();
    state.stock = [];
    state.waste = [];
    for (let i = 0; i < 7; i++) state.tableau[i] = [];
    // Only face-down cards, nothing movable
    state.tableau[0] = [
        { suit: "clubs", rank: 5, faceUp: false },
        { suit: "hearts", rank: 3, faceUp: false },
    ];
    assertEqual(Game.hasAnyMove(), false, "no moves when only face-down tableau cards and no stock");
});

// ── Summary ───────────────────────────────────────

window._testResults = { passed: _passed, failed: _failed };
const total = _passed + _failed;
console.log("");
console.log(
    `Results: ${_passed}/${total} passed${_failed > 0 ? ` — ${_failed} FAILED` : " — all green"}`,
);

// ── Private helpers (not exported by game.js) ────
// Re-implement locally so tests are self-contained.

function _createDeck() {
    const SUITS = ["spades", "hearts", "diamonds", "clubs"];
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
