// =============================================================
// Marvel Hero Rush TCG — Deck Construction Rules (v3, OFFICIAL)
// =============================================================
// Confirmed from the official rulebook PDF (Super Hero Clash Game
// Rules, provided by user 2026-08-10):
//   - DECK: exactly 50 character cards (角色卡)
//   - COLORS: deck characters may contain AT MOST 2 colors
//     (attribute: Red/Yellow/Blue/Green)
//   - COPY LIMIT: max 3 cards with the SAME NAME (名称相同)
//     (variant prints share the same name → share the limit)
//   - RUSH DECK: players separately choose 9 Rush Cards (冲击卡);
//     NOT part of the 50-card deck (Rush Points are tokens)
//   - WIN: 9 Rush Cards on your timeline, OR opponent deck = 0
//   - LEVELS: characters Lv1-6; calling Lv4+ needs retreating
//     characters whose combined Lv equals the called Lv
// =============================================================

const RULES = {
  gameName: "Marvel Hero Rush TCG",

  // ---- confirmed (official rulebook) ----
  deckSize: { exact: 50 },
  copyLimitPerName: 3,
  maxColors: 2,
  rushDeckSize: 9, // separate Rush Card deck, not part of the 50
  winCondition: {
    rushPointsToWin: 9,
    deckOutWin: true, // opponent deck at 0 also wins
  },
  characterLevels: 6,
  attributes: ["Red", "Yellow", "Blue", "Green"],

  // validation toggle: when false, deck is built freely (no hard errors)
  enforce: true,

  // ---- helpers ----
  isCharacter(card) { return card.type === "Character"; },
};

window.MHR_RULES = RULES;
