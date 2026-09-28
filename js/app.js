// =============================================================
// Marvel Hero Rush TCG — Deck Builder (v5: multi-deck + views)
// =============================================================
// Depends on: i18n.js, cards.js (window.MHR_DATA), rules.js (window.MHR_RULES)

(function () {
  const APP_VERSION = "1.4.7-beta";
  const { CARDS, RARITIES, CARD_SETS, ATTRIBUTES } = window.MHR_DATA;
  const RULES = window.MHR_RULES;
  const { t, setLang, getLang } = window.MHR_I18N;

  // ---------- state ----------
  let decks = [];            // [{id, name, cards:[[id,qty],...]}]
  let currentDeckId = null;
  let deck = new Map();      // working deck (current)
  let favs = new Set();      // card ids
  let modalCardId = null;
  let view = "all";          // "all" | "fav"
  let urlImportDone = false; // set when ?deck= import created/switched a deck

  // ---------- persistence ----------
  const LS_DECKS = "mhr_decks_v3", LS_FAVS = "mhr_favs_v2", LS_LEGACY_DECK = "mhr_deck_v2";
  function genId() { return "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function notifyGoogleSync() {
    try {
      if (window.MHRGoogleSync && typeof window.MHRGoogleSync.onLocalChange === "function") {
        window.MHRGoogleSync.onLocalChange();
      }
    } catch (e) {}
  }
  function saveDecks() {
    try {
      const cur = decks.find((d) => d.id === currentDeckId);
      if (cur) cur.cards = [...deck.entries()];
      localStorage.setItem(LS_DECKS, JSON.stringify({ current: currentDeckId, decks: decks.map((d) => ({ id: d.id, name: d.name, cards: d.cards })) }));
    } catch (e) {}
    notifyGoogleSync();
  }
  function saveFavs() {
    try { localStorage.setItem(LS_FAVS, JSON.stringify([...favs])); } catch (e) {}
    notifyGoogleSync();
  }
  function loadPersist() {
    try { favs = new Set(JSON.parse(localStorage.getItem(LS_FAVS) || "[]").filter((id) => getCard(id))); } catch (e) { favs = new Set(); }
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(LS_DECKS) || "null"); } catch (e) { stored = null; }
    if (stored && Array.isArray(stored.decks) && stored.decks.length) {
      decks = stored.decks.map((d) => ({ id: d.id, name: d.name || t("defaultDeckName"), cards: Array.isArray(d.cards) ? d.cards.filter(([cid]) => getCard(cid)) : [] }));
      currentDeckId = stored.current && decks.find((d) => d.id === stored.current) ? stored.current : decks[0].id;
    } else {
      // migrate legacy single deck
      let legacy = null;
      try { legacy = JSON.parse(localStorage.getItem(LS_LEGACY_DECK) || "null"); } catch (e) { legacy = null; }
      decks = [{ id: genId(), name: t("defaultDeckName"), cards: Array.isArray(legacy) ? legacy.filter(([cid]) => getCard(cid)) : [] }];
      currentDeckId = decks[0].id;
      try { localStorage.removeItem(LS_LEGACY_DECK); } catch (e) {}
    }
    deck = new Map(decks.find((d) => d.id === currentDeckId).cards);
  }

  // ---------- DOM refs ----------
  const $ = (sel) => document.querySelector(sel);
  const cardGrid = $("#card-grid");
  const deckListEl = $("#deck-list");
  const deckPanel = $("#deck-panel");
  const deckCountEl = $("#deck-count");
  const validationEl = $("#deck-validation");
  const statsEl = $("#deck-stats");
  const searchEl = $("#search");
  const filterSet = $("#filter-set");
  const filterRarity = $("#filter-rarity");
  const filterLevel = $("#filter-level");
  const filterRange = $("#filter-range");
  const filterAttr = $("#filter-attr");
  const deckSelect = $("#deck-select");
  const dmModal = $("#deck-manager");
  const dmList = $("#dm-list");
  const importTextEl = $("#import-text");
  const toastEl = $("#toast");
  const modal = $("#card-modal");

  // ---------- init filters (checkbox multi-select) ----------
  function makeFilterChip(value, labelText, extraClass) {
    const lab = document.createElement("label");
    lab.className = "filter-chip" + (extraClass ? " " + extraClass : "");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = value;
    const span = document.createElement("span");
    span.className = "filter-chip-label";
    span.textContent = labelText;
    lab.appendChild(input);
    lab.appendChild(span);
    return lab;
  }
  function buildFilterChecks() {
    filterSet.innerHTML = "";
    Object.keys(CARD_SETS).forEach((s) => {
      filterSet.appendChild(makeFilterChip(s, CARD_SETS[s] || s));
    });
    filterRarity.innerHTML = "";
    RARITIES.forEach((r) => {
      filterRarity.appendChild(makeFilterChip(r, r));
    });
    filterLevel.innerHTML = "";
    for (let lv = 1; lv <= RULES.characterLevels; lv++) {
      filterLevel.appendChild(makeFilterChip(String(lv), t("lvPrefix") + " " + lv));
    }
    filterRange.innerHTML = "";
    for (let rng = 0; rng <= 5; rng++) {
      filterRange.appendChild(makeFilterChip(String(rng), t("rangePrefix") + " " + rng));
    }
    filterAttr.innerHTML = "";
    ATTRIBUTES.forEach((a) => {
      filterAttr.appendChild(makeFilterChip(a, attrLabel(a)));
    });
  }
  function checkedValues(container) {
    return [...container.querySelectorAll("input[type=checkbox]:checked")].map((i) => i.value);
  }
  function clearAllFilters() {
    [filterSet, filterRarity, filterLevel, filterRange, filterAttr].forEach((el) => {
      el.querySelectorAll("input[type=checkbox]").forEach((cb) => { cb.checked = false; });
    });
  }
  function refreshFilterLabels() {
    filterLevel.querySelectorAll("label.filter-chip").forEach((lab) => {
      const v = lab.querySelector("input").value;
      lab.querySelector(".filter-chip-label").textContent = t("lvPrefix") + " " + v;
    });
    filterRange.querySelectorAll("label.filter-chip").forEach((lab) => {
      const v = lab.querySelector("input").value;
      lab.querySelector(".filter-chip-label").textContent = t("rangePrefix") + " " + v;
    });
    filterAttr.querySelectorAll("label.filter-chip").forEach((lab) => {
      const v = lab.querySelector("input").value;
      lab.querySelector(".filter-chip-label").textContent = attrLabel(v);
    });
  }
  // ---------- helpers ----------
  function toast(msg) {
    toastEl.textContent = msg;
    clearTimeout(toast._t);
    clearTimeout(toast._showT);
    toastEl.hidden = false;
    void toastEl.offsetWidth; // reflow → CSS transition runs
    toastEl.classList.add("show");
    toast._t = setTimeout(() => {
      toastEl.classList.remove("show");
      toast._showT = setTimeout(() => { toastEl.hidden = true; }, 240);
    }, 1600);
  }
  // ---------- overlay show/hide with motion ----------
  function showOverlay(el) {
    clearTimeout(el._hideT);
    el.hidden = false;
    void el.offsetWidth;
    el.classList.remove("closing");
    el.classList.add("show");
  }
  function hideOverlay(el) {
    if (el.hidden) return;
    el.classList.remove("show");
    el.classList.add("closing");
    clearTimeout(el._hideT);
    el._hideT = setTimeout(() => { el.hidden = true; el.classList.remove("closing"); }, 200);
  }
  function getCard(id) { return CARDS.find((c) => c.id === id); }
  const ATTR_LABEL = { Red: "紅", Yellow: "黃", Blue: "藍", Green: "綠" };
  const ATTR_COLOR_ZHCN = { Red: "红", Yellow: "黄", Blue: "蓝", Green: "绿" };
  const ATTR_COLOR_EN = { Red: "Red", Yellow: "Yellow", Blue: "Blue", Green: "Green" };
  function attrLabel(a) {
    const l = getLang();
    if (l === "en") return ATTR_COLOR_EN[a] || a;
    if (l === "zh-CN") return ATTR_COLOR_ZHCN[a] || a;
    return ATTR_LABEL[a] || a;
  }
  // 簡中卡名/特徵/效果: 當 UI = zh-CN 用官方簡中文字（cards_cn.js），否則 fallback 英文
  function cnCard(c, field) {
    try {
      if (window.MHR_I18N && window.MHR_I18N.getLang() === "zh-CN" && window.MHR_CARD_CN && window.MHR_CARD_CN[c.card_no]) {
        const v = window.MHR_CARD_CN[c.card_no][field];
        if (v) return v;
      }
    } catch (e) {}
    return c[field];
  }

  buildFilterChecks();

  function cardMatches(card) {
    if (card.type === "impact") return false; // Rush Point cards live in their own 圖鑑 view
    const q = searchEl.value.trim().toLowerCase();
    // Within category: OR; across categories: AND; empty category = no restriction
    const sets = checkedValues(filterSet);
    const rars = checkedValues(filterRarity);
    const lvs = checkedValues(filterLevel);
    const rngs = checkedValues(filterRange);
    const attrs = checkedValues(filterAttr);
    if (sets.length && !sets.includes(card.set)) return false;
    if (rars.length && !rars.includes(card.rarity)) return false;
    if (lvs.length && !lvs.includes(String(card.level))) return false;
    if (rngs.length && !rngs.includes(String(card.attackRange))) return false;
    if (attrs.length && !attrs.includes(card.attribute)) return false;
    if (view === "fav" && !favs.has(card.id)) return false;
    if (q) {
      const hay = (card.name + " " + cnCard(card, "name") + " " + card.card_no + " " + (card.feature || "") + " " + cnCard(card, "feature") + " " + (card.effect || "") + " " + cnCard(card, "effect")).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  // ---------- render card browser ----------
  function getFilteredCards() { return CARDS.filter(cardMatches); }

  // ---------- Rush Point 圖鑑 (impact cards) ----------
  function renderRushGallery() {
    cardGrid.innerHTML = "";
    const rush = CARDS.filter((c) => c.type === "impact").sort((a, b) =>
      (a.set === b.set ? a.card_no.localeCompare(b.card_no) : a.set.localeCompare(b.set))
    );
    if (!rush.length) {
      cardGrid.innerHTML = '<p style="color:var(--muted)">' + t("noMatch") + "</p>";
      return;
    }
    const hint = document.createElement("p");
    hint.className = "rush-hint";
    hint.textContent = t("rushHint");
    cardGrid.appendChild(hint);
    rush.forEach((card) => {
      const el = document.createElement("div");
      el.className = "card rush-tile";
      el.innerHTML = `
        <div class="art"><img loading="lazy" src="${card.art}" alt="${cnCard(card, "name")}" onerror="this.style.display='none'"></div>
        <div class="meta">
          <div class="cname" title="${cnCard(card, "name")}">${cnCard(card, "name")}</div>
          <div class="ctags">${card.card_no}</div>
          <div class="cmeta">
            <span class="chip chip-set" title="${CARD_SETS[card.set] || card.set}">${card.set}</span>
            <span class="rar rar-C">${card.rarity}</span>
          </div>
        </div>`;
      cardGrid.appendChild(el);
    });
  }

  function renderCards() {
    cardGrid.innerHTML = "";
    if (view === "rush") { renderRushGallery(); return; }
    const list = getFilteredCards();
    if (!list.length) {
      cardGrid.innerHTML = '<p style="color:var(--muted)">' + t("noMatch") + "</p>";
      return;
    }
    list.forEach((card) => {
      const inDeck = deck.get(card.id) || 0;
      const inFav = favs.has(card.id);
      const el = document.createElement("div");
      el.className = "card attr-" + card.attribute + (inFav ? " is-fav" : "");
      el.draggable = true;
      el.innerHTML = `
        <div class="art"><img loading="lazy" src="${card.art}" alt="${cnCard(card, "name")}" onerror="this.style.display='none'"></div>
        <div class="badges">
          ${inFav ? '<span class="badge badge-fav">★</span>' : ""}
          ${inDeck ? `<span class="badge badge-deck">×${inDeck}</span>` : ""}
        </div>
        <div class="meta">
          <div class="cname" title="${cnCard(card, "name")}">${cnCard(card, "name")}</div>
          <div class="ctags">${card.id} · ${t("lvPrefix")} ${card.level} · PWR ${card.power} · ${t("rangePrefix")} ${card.attackRange}</div>
          <div class="cmeta">
            <span class="chip chip-attr chip-${card.attribute}">${attrLabel(card.attribute)}</span>
            <span class="rar rar-${card.rarity}">${card.rarity}</span>
            <span class="chip chip-set" title="${CARD_SETS[card.set] || card.set}">${card.set}</span>
          </div>
        </div>`;
      el.addEventListener("click", () => openModal(card.id));
      el.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", card.id);
        e.dataTransfer.effectAllowed = "copy";
        el.classList.add("dragging");
      });
      el.addEventListener("dragend", () => el.classList.remove("dragging"));
      cardGrid.appendChild(el);
    });
  }

  // ---------- deck mutations ----------
  // copy limit is counted per card NAME (「subtitle」included, so
  // alternate-art prints of the same card share the limit)
  function countByName(name) {
    let n = 0;
    deck.forEach((qty, id) => { if (getCard(id).name === name) n += qty; });
    return n;
  }
  function addCard(id, silent) {
    const card = getCard(id);
    const cur = deck.get(id) || 0;
    if (RULES.enforce && countByName(card.name) >= RULES.copyLimitPerName) {
      toast(t("toastCopyLimit", { name: cnCard(card, "name") }));
      return false;
    }
    deck.set(id, cur + 1);
    saveDecks();
    renderCards(); renderDeck(); updateModalActions(); renderDeckSelect();
    if (!silent) toast(t("toastAdded"));
    return true;
  }
  function removeCard(id) {
    const cur = deck.get(id) || 0;
    if (cur <= 1) deck.delete(id);
    else deck.set(id, cur - 1);
    saveDecks();
    renderCards(); renderDeck(); updateModalActions(); renderDeckSelect();
  }

  // ---------- favorites ----------
  function toggleFav(id) {
    if (favs.has(id)) { favs.delete(id); toast(t("toastFavOff")); }
    else { favs.add(id); toast(t("toastFavOn")); }
    saveFavs();
    renderCards(); updateModalActions();
  }

  // ---------- multi-deck ----------
  function renderDeckSelect() {
    deckSelect.innerHTML = "";
    decks.forEach((d) => {
      const o = document.createElement("option");
      o.value = d.id; o.textContent = d.name; deckSelect.appendChild(o);
    });
    deckSelect.value = currentDeckId;
  }
  function selectDeck(id) {
    const d = decks.find((x) => x.id === id);
    if (!d) return;
    // save current
    const cur = decks.find((x) => x.id === currentDeckId);
    if (cur) cur.cards = [...deck.entries()];
    currentDeckId = id;
    deck = new Map(d.cards.filter(([cid]) => getCard(cid)));
    saveDecks();
    renderDeckSelect(); renderDeckManager(); renderCards(); renderDeck();
    toast(t("toastDeckLoaded"));
  }
  function newDeck(name) {
    const id = genId();
    decks.push({ id, name: (name && name.trim()) || t("defaultDeckName"), cards: [] });
    currentDeckId = id;
    deck = new Map();
    saveDecks();
    renderDeckSelect(); renderDeckManager(); renderCards(); renderDeck();
    toast(t("toastDeckCreated"));
  }
  function renameDeck(id, name) {
    const d = decks.find((x) => x.id === id);
    if (!d) return;
    d.name = (name && name.trim()) || d.name;
    saveDecks(); renderDeckSelect(); renderDeckManager();
    toast(t("toastDeckRenamed"));
  }
  function deleteDeck(id) {
    if (decks.length <= 1) { toast(t("toastCantDeleteLast")); return; }
    decks = decks.filter((d) => d.id !== id);
    if (currentDeckId === id) {
      currentDeckId = decks[0].id;
      deck = new Map(decks[0].cards.filter(([cid]) => getCard(cid)));
    }
    saveDecks();
    renderDeckSelect(); renderDeckManager(); renderCards(); renderDeck();
    toast(t("toastDeckDeleted"));
  }
  function deckCardCount(d) { return (d.cards || []).reduce((s, [, q]) => s + q, 0); }
  function renderDeckManager() {
    dmList.innerHTML = "";
    decks.forEach((d) => {
      const row = document.createElement("div");
      row.className = "dm-row" + (d.id === currentDeckId ? " dm-current" : "");
      row.innerHTML = `
        <div class="dm-info">
          <div class="dm-name"><span class="dm-name-text">${d.name}</span>
            ${d.id === currentDeckId ? `<span class="dm-active-tag">${t("dmActive")}</span>` : ""}
            <button class="dm-rename-btn" data-dm="rename" data-id="${d.id}" title="✎">✎</button>
          </div>
          <div class="dm-count">${deckCardCount(d)} ${t("deckCountSuffix")}</div>
        </div>
        <div class="dm-actions">
          <button class="btn btn-sm" data-dm="copy" data-id="${d.id}">${t("dmCopy")}</button>
          <button class="btn btn-sm" data-dm="load" data-id="${d.id}">${t("dmLoad")}</button>
          <button class="btn btn-sm btn-danger" data-dm="delete" data-id="${d.id}">${t("dmDelete")}</button>
        </div>`;
      dmList.appendChild(row);
    });
  }
  function openDeckManager() { renderDeckManager(); showOverlay(dmModal); }
  function closeDeckManager() { hideOverlay(dmModal); }
  // ---------- share code (compact format; legacy base64 still decodable) ----------
  const SERIES_LETTER = { SP01: "I", EB01: "F", PB01: "G", TB01: "H", BP01: "A", SD01: "B", SD02: "C", SD03: "D", SD04: "E" };
  const LETTER_SERIES = { A: "BP01", B: "SD01", C: "SD02", D: "SD03", E: "SD04", F: "EB01", G: "PB01", H: "TB01", I: "SP01" };
  function encodeShareFor(cardsArr, deckName) {
    let out = "";
    for (const [id, qty] of cardsArr) {
      const m = id.match(/^(SP01|EB01|PB01|TB01|BP01|SD0[1-4])-(\d{3})(-V(\d+))?$/);
      if (!m) return encodeShareForLegacy(cardsArr); // unknown id → fall back to legacy
      out += SERIES_LETTER[m[1]] + m[2] + (m[4] ? "v" + m[4] : "") + Math.min(qty | 0, 35).toString(36);
    }
    if (deckName && deckName.trim()) {
      const n = encodeURIComponent(deckName.trim().slice(0, 60));
      out = "1|" + n + "|" + out;
    }
    return out;
  }
  function encodeShareForLegacy(cardsArr) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(cardsArr.map(([id, qty]) => [id, qty])))));
  }
  function decodeShare(code) {
    try {
      const s = (code || "").trim();
      let cardsPart = s;
      let deckName = null;
      if (s.startsWith("1|")) {
        const idx = s.indexOf("|", 2);
        if (idx === -1) return null;
        deckName = s.slice(2, idx);
        try { deckName = decodeURIComponent(deckName); } catch (e) {}
        cardsPart = s.slice(idx + 1);
      }
      let m;
      if (/^[A-I]/.test(cardsPart)) {
        // compact format: starts with a series letter
        m = new Map();
        let i = 0;
        while (i < cardsPart.length) {
          const letter = cardsPart[i++];
          const num = cardsPart.substr(i, 3); i += 3;
          if (!LETTER_SERIES[letter] || !/^\d{3}$/.test(num)) return null;
          let id = LETTER_SERIES[letter] + "-" + num;
          if (cardsPart[i] === "v") {
            i++;
            let v = "";
            while (i < cardsPart.length && /\d/.test(cardsPart[i])) v += cardsPart[i++];
            if (!v) return null;
            id += "-V" + v;
          }
          if (i >= cardsPart.length) return null;
          const qty = parseInt(cardsPart[i++], 36);
          if (qty > 0 && getCard(id)) m.set(id, qty);
        }
      } else {
        // legacy base64 JSON
        const arr = JSON.parse(decodeURIComponent(escape(atob(cardsPart))));
        m = new Map();
        arr.forEach(([id, qty]) => { if (getCard(id)) m.set(id, qty | 0); });
      }
      return { deck: m, name: deckName };
    } catch (e) { return null; }
  }

  // ---------- donation overlay ----------
  function openDonation() { showOverlay($("#donation-modal")); }
  function closeDonation() { hideOverlay($("#donation-modal")); }
  const donationClose = $("#donation-close");
  if (donationClose) donationClose.addEventListener("click", closeDonation);
  const donationModal = $("#donation-modal");
  if (donationModal) {
    donationModal.addEventListener("click", (e) => { if (e.target === donationModal) closeDonation(); });
  }

  // ---------- export deck as one overview image (with QR import code) ----------
  function exportDeckImage() {
    if (!deck.size) { toast(t("toastEmptyDeck")); return; }
    drawDeckImage(false).then((canvas) => {
      const prev = document.createElement("div");
      prev.className = "sim-export-preview";
      canvas.style.maxWidth = "100%";
      canvas.style.height = "auto";
      canvas.style.border = "1px solid var(--border)";
      canvas.style.borderRadius = "8px";
      prev.appendChild(canvas);
      const prevBox = $("#sim-export");
      if (prevBox) { prevBox.innerHTML = ""; prevBox.appendChild(prev); prevBox.scrollIntoView({ behavior: "smooth", block: "nearest" }); }
      // full chrome version (logo/footer/QR) goes into the exported PNG only
      drawDeckImage(true).then((full) => {
        const deckName = (decks.find((d) => d.id === currentDeckId) || {}).name || t("defaultDeckName");
        const a = document.createElement("a");
        a.href = full.toDataURL("image/png");
        a.download = "hero-rush-deck-" + deckName.replace(/[^\w\u4e00-\u9fff-]+/g, "_") + ".png";
        a.click();
        toast(t("toastExportImg"));
      });
    });
  }

  // chrome=true: include logo, footer & QR (for the exported PNG); false: clean preview
  function drawDeckImage(withChrome) {
    const RAR_COLORS = { R: "#2a3242", SR: "#4a5a8a", GR: "#8a6a1a", MR: "#3a7a4a", UR: "#7a3a9a", SEC: "#9a3a2a", ER: "#0f7a8c", PR: "#b04a9a", TR: "#a8741a", HR: "#c43a5e", C: "#3a4458" };
    const entries = [...deck.entries()].sort((a, b) => {
      const ca = getCard(a[0]), cb = getCard(b[0]);
      return ca.level - cb.level || ca.card_no.localeCompare(cb.card_no);
    });
    const total = entries.reduce((s, [, q]) => s + q, 0);
    const rarCounts = {};
    entries.forEach(([id, qty]) => { const c = getCard(id); rarCounts[c.rarity] = (rarCounts[c.rarity] || 0) + qty; });
    const rarOrder = ["R", "SR", "GR", "MR", "UR", "SEC", "C"].filter((r) => rarCounts[r]);

    const W = 1600, PAD = 40;
    const tileW = 132, tileGap = 10;
    const artH = Math.round((tileW * 88) / 63);
    const tileH = artH + 34;
    const cols = Math.max(1, Math.floor((W - PAD * 2) / (tileW + tileGap)));
    const rows = Math.ceil(entries.length / cols);
    const gridH = rows * tileH;
    const headerH = withChrome ? 350 : 200;
    const footerH = withChrome ? 120 : 30;
    const H = headerH + gridH + footerH;

    const loadAll = Promise.all([
      ...entries.map(([id]) => new Promise((res) => {
        const img = new Image();
        img.onload = () => res({ id, img });
        img.onerror = () => res({ id, img: null });
        img.src = getCard(id).art;
      })),
      withChrome ? new Promise((res) => {
        const logo = new Image();
        logo.onload = () => res({ id: "__logo__", img: logo });
        logo.onerror = () => res({ id: "__logo__", img: null });
        logo.src = "img/logo.png";
      }) : Promise.resolve({ id: "__logo__", img: null }),
    ]);

    return loadAll.then((imgs) => {
      const canvas = document.createElement("canvas");
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext("2d");
      const deckName = (decks.find((d) => d.id === currentDeckId) || {}).name || t("defaultDeckName");
      const imgMap = {};
      imgs.forEach(({ id, img }) => { imgMap[id] = img; });

      // background
      ctx.fillStyle = "#0b1526"; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#0f1c33"; ctx.fillRect(PAD, headerH - 8, W - PAD * 2, gridH + 24);

      // ---- header ----
      if (withChrome && imgMap["__logo__"]) ctx.drawImage(imgMap["__logo__"], PAD, 22, 154, 64);
      // QR code: top-right corner (chrome only — full QR fits here)
      if (withChrome) {
        const qr = qrcode(0, "M");
        const importUrl = "https://mhrdeckbuild.duckdns.org/?deck=" + encodeURIComponent(encodeShare());
        qr.addData(importUrl); qr.make();
        const qrSize = 300, qx = W - PAD - qrSize - 14, qy = 24;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(qx - 10, qy - 10, qrSize + 20, qrSize + 20);
        const n = qr.getModuleCount(), cell = qrSize / n;
        ctx.fillStyle = "#000000";
        for (let r = 0; r < n; r++) {
          for (let cc = 0; cc < n; cc++) {
            if (qr.isDark(r, cc)) ctx.fillRect(qx + cc * cell, qy + r * cell, Math.ceil(cell), Math.ceil(cell));
          }
        }
        ctx.fillStyle = "#aebfdd"; ctx.font = "15px 'Rajdhani', sans-serif"; ctx.textAlign = "center";
        ctx.fillText(t("exportImgQR"), qx + qrSize / 2, qy + qrSize + 26);
        ctx.textAlign = "left";
      }
      ctx.textAlign = "left";
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 44px 'Russo One', 'Arial Black', sans-serif";
      ctx.fillText(deckName, PAD, withChrome ? 160 : 70);
      ctx.fillStyle = "#7fd8ff";
      ctx.font = "20px 'Rajdhani', 'Segoe UI', sans-serif";
      ctx.fillText(total + " " + t("deckCountSuffix") + " · " + t("exportImgComposition"), PAD, withChrome ? 200 : 106);

      // rarity chips
      let cx = PAD, cy = withChrome ? 238 : 140;
      rarOrder.forEach((r) => {
        const label = r + " ×" + rarCounts[r];
        ctx.font = "bold 17px 'Rajdhani', 'Segoe UI', sans-serif";
        const w = ctx.measureText(label).width + 26;
        ctx.fillStyle = RAR_COLORS[r] || "#333";
        ctx.beginPath(); ctx.roundRect(cx, cy, w, 30, 6); ctx.fill();
        ctx.fillStyle = "#ffffff"; ctx.textAlign = "center";
        ctx.fillText(label, cx + w / 2, cy + 21);
        ctx.textAlign = "left";
        cx += w + 10;
      });

      // ---- card grid ----
      entries.forEach(([id, qty], i) => {
        const c = getCard(id);
        const col = i % cols, row = Math.floor(i / cols);
        const tx = PAD + col * (tileW + tileGap);
        const ty = headerH + row * tileH;
        const img = imgMap[id];
        if (img) ctx.drawImage(img, tx, ty, tileW, artH);
        else { ctx.fillStyle = "#1a2a45"; ctx.fillRect(tx, ty, tileW, artH); }
        ctx.strokeStyle = "rgba(127, 216, 255, .35)"; ctx.lineWidth = 1;
        ctx.strokeRect(tx, ty, tileW, artH);
        ctx.fillStyle = "rgba(0, 0, 0, .78)";
        ctx.beginPath(); ctx.arc(tx + tileW - 14, ty + 14, 14, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ffd740"; ctx.font = "bold 14px 'Rajdhani', sans-serif"; ctx.textAlign = "center";
        ctx.fillText("×" + qty, tx + tileW - 14, ty + 19);
        ctx.textAlign = "left";
        ctx.fillStyle = "#c8d2e4"; ctx.font = "13px 'Rajdhani', 'Segoe UI', sans-serif";
        ctx.fillText(c.card_no, tx + 2, ty + artH + 22);
      });

      // ---- chrome: footer (bottom-left) ----
      if (withChrome) {
        ctx.fillStyle = "#7fd8ff";
        ctx.font = "bold 22px 'Rajdhani', 'Segoe UI', sans-serif";
        ctx.fillText("Marvel Hero Rush TCG Deck Builder", PAD, H - 102);
        ctx.fillStyle = "#5a6b85";
        ctx.font = "16px 'Rajdhani', 'Segoe UI', sans-serif";
        ctx.fillText("mhrdeckbuild.duckdns.org · by aaronht88 · " + APP_VERSION + " · " + new Date().toLocaleDateString(), PAD, H - 72);
      }

      return canvas;
    });
  }


  // ---------- deck simulator ----------
  function renderSimulator() {
    const content = $("#sim-content");
    const sub = $("#sim-sub");
    content.innerHTML = "";
    const entries = [...deck.entries()].sort((a, b) => {
      const ca = getCard(a[0]), cb = getCard(b[0]);
      return ca.level - cb.level || ca.card_no.localeCompare(cb.card_no);
    });
    let total = 0;
    entries.forEach(([, qty]) => (total += qty));
    sub.textContent = (decks.find((d) => d.id === currentDeckId) || {}).name + " · " + total + " " + t("deckCountSuffix");
    if (!entries.length) {
      content.innerHTML = '<p style="color:var(--muted)">' + t("simEmpty") + "</p>";
      return;
    }
    const byLv = {};
    entries.forEach(([id, qty]) => {
      const c = getCard(id);
      (byLv[c.level] = byLv[c.level] || []).push({ card: c, qty });
    });
    Object.keys(byLv).map(Number).sort((a, b) => a - b).forEach((lv) => {
      const sec = document.createElement("div");
      sec.className = "sim-grade";
      const lvCount = byLv[lv].reduce((s, x) => s + x.qty, 0);
      sec.innerHTML = `<div class="sim-grade-head"><span class="sim-grade-lv">${t("lvPrefix")} ${lv}</span><span class="sim-grade-count">×${lvCount}</span></div>`;
      const row = document.createElement("div");
      row.className = "sim-row";
      byLv[lv].forEach(({ card, qty }) => {
        const t2 = document.createElement("div");
        t2.className = "sim-card attr-" + card.attribute;
        t2.innerHTML = `
          <div class="sim-art"><img loading="lazy" src="${card.art}" alt="${card.name}" onerror="this.style.display='none'"></div>
          <div class="sim-name" title="${cnCard(card, "name")}">${cnCard(card, "name")}</div>
          <div class="sim-chips">
            <span class="sim-chip sim-chip-no">${card.card_no}</span>
            <span class="rar rar-${card.rarity}">${card.rarity}</span>
            <span class="sim-chip sim-chip-set" title="${CARD_SETS[card.set] || card.set}">${card.set}</span>
          </div>
          <div class="sim-qty">×${qty}</div>`;
        t2.addEventListener("click", () => openModal(card.id));
        row.appendChild(t2);
      });
      sec.appendChild(row);
      content.appendChild(sec);
    });
    const hint = document.createElement("p");
    hint.className = "sim-hint";
    hint.textContent = "👆 " + t("simClickHint");
    content.appendChild(hint);
  }
  function openSimulator() { renderSimulator(); showOverlay($("#sim-modal")); }
  function closeSimulator() { hideOverlay($("#sim-modal")); }

  // ---------- render deck ----------
  function renderDeck() {
    deckListEl.innerHTML = "";
    let total = 0;
    const entries = [...deck.entries()].sort((a, b) => {
      const ca = getCard(a[0]), cb = getCard(b[0]);
      return ca.card_no.localeCompare(cb.card_no);
    });
    entries.forEach(([id, qty]) => {
      const card = getCard(id);
      total += qty;
      const row = document.createElement("div");
      row.className = "deck-row";
      row.innerHTML = `
        <img class="dthumb" src="${card.art}" alt="">
        <div class="dname">${cnCard(card, "name")}<small>${card.id} · ${t("lvPrefix")} ${card.level} · ${card.rarity} · ${attrLabel(card.attribute)}</small></div>
        <div class="qty">
          <button data-act="dec" data-id="${id}">−</button>
          <span>${qty}</span>
          <button data-act="inc" data-id="${id}">+</button>
        </div>`;
      deckListEl.appendChild(row);
    });
    deckCountEl.textContent = total + " " + t("deckCountSuffix");
    validateDeck(total);
    renderStats();
  }

  // ---------- deck validation ----------
  function validateDeck(total) {
    if (!RULES.enforce) {
      validationEl.innerHTML = '<span class="warn">⚠</span>';
      return;
    }
    const okSize = total === RULES.deckSize.exact;
    const colors = new Set();
    deck.forEach((qty, id) => colors.add(getCard(id).attribute));
    const okColors = colors.size <= RULES.maxColors;
    let okCopies = true;
    deck.forEach((qty) => { if (qty > RULES.copyLimitPerName) okCopies = false; });
    const mk = (ok, label) =>
      `<span class="v-item ${ok ? "ok" : "bad"}"><span class="v-box">${ok ? "☑" : "☐"}</span>${label}</span>`;
    validationEl.innerHTML =
      mk(okSize, t("vSize", { n: RULES.deckSize.exact })) +
      mk(okColors, t("vColors", { n: RULES.maxColors })) +
      mk(okCopies, t("vCopies", { n: RULES.copyLimitPerName }));
  }

  // ---------- stats ----------
  function renderStats() {
    const chips = [];
    const byLv = {}, byAttr = {}, byRar = {};
    let total = 0, powerSum = 0, powerN = 0;
    deck.forEach((qty, id) => {
      const c = getCard(id);
      total += qty;
      byLv[t("lvPrefix") + c.level] = (byLv[t("lvPrefix") + c.level] || 0) + qty;
      byAttr[attrLabel(c.attribute)] = (byAttr[attrLabel(c.attribute)] || 0) + qty;
      byRar[c.rarity] = (byRar[c.rarity] || 0) + qty;
      const p = parseInt(c.power, 10);
      if (!isNaN(p)) { powerSum += p * qty; powerN += qty; }
    });
    chips.push(`<span class="stat-chip">${t("statTotal")} <b>${total}</b></span>`);
    Object.keys(byLv).sort().forEach((k) => chips.push(`<span class="stat-chip">${k} <b>${byLv[k]}</b></span>`));
    Object.keys(byAttr).forEach((k) => chips.push(`<span class="stat-chip">${k} <b>${byAttr[k]}</b></span>`));
    Object.keys(byRar).forEach((k) => chips.push(`<span class="stat-chip">${k} <b>${byRar[k]}</b></span>`));
    if (powerN > 0) chips.push(`<span class="stat-chip">${t("statAvgPwr")} <b>${Math.round(powerSum / powerN)}</b></span>`);
    statsEl.innerHTML = chips.join("");
  }

  // ---------- card detail modal ----------
  function fillModalDetails(c) {
    $("#modal-no").textContent = c.card_no + (c.id !== c.card_no ? " · " + c.id : "");
    $("#modal-level").textContent = c.level;
    $("#modal-power").textContent = c.power;
    $("#modal-range").textContent = c.attackRange;
    $("#modal-attr").textContent = c.attribute + " (" + attrLabel(c.attribute) + ")";
    $("#modal-feature").textContent = cnCard(c, "feature") || "—";
    $("#modal-rarity").textContent = c.rarity;
    $("#modal-set").textContent = CARD_SETS[c.set] || c.set;
    $("#modal-effect-text").textContent = cnCard(c, "effect") || "—";
  }
  function openModal(id) {
    const c = getCard(id);
    if (!c) return;
    modalCardId = id;
    $("#modal-art").src = c.art;
    $("#modal-name").textContent = cnCard(c, "name");
    fillModalDetails(c);
    updateModalActions();
    showOverlay(modal);
    document.body.classList.add("modal-open");
  }
  function closeModal() {
    hideOverlay(modal);
    modalCardId = null;
    document.body.classList.remove("modal-open");
  }
  function updateModalActions() {
    if (!modalCardId) return;
    const c = getCard(modalCardId);
    const favBtn = $("#modal-fav");
    favBtn.textContent = favs.has(modalCardId) ? t("unfavBtn") : t("favBtn");
    const inDeck = deck.get(modalCardId) || 0;
    $("#deck-count-modal").textContent = inDeck;
    const atLimit = RULES.enforce && countByName(c.name) >= RULES.copyLimitPerName;
    $("#modal-add-deck").disabled = atLimit;
    $("#deck-inc").disabled = atLimit;
    $("#deck-dec").disabled = inDeck === 0;
  }

  // ---------- drag & drop ----------
  deckPanel.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    deckPanel.classList.add("drag-over");
  });
  deckPanel.addEventListener("dragleave", () => deckPanel.classList.remove("drag-over"));
  deckPanel.addEventListener("drop", (e) => {
    e.preventDefault();
    deckPanel.classList.remove("drag-over");
    const id = e.dataTransfer.getData("text/plain");
    if (id && getCard(id)) {
      if (addCard(id, true)) toast(t("toastDragAdd"));
    }
  });

  // ---------- welcome / info overlay ----------
  function showWelcome() {
    const v = $("#wl-version");
    if (v) v.textContent = "v" + APP_VERSION;
    showOverlay($("#welcome-modal"));
  }
  function hideWelcome() { hideOverlay($("#welcome-modal")); }
  const wlStart = $("#wl-start");
  if (wlStart) wlStart.addEventListener("click", hideWelcome);
  const versionBadge = $("#version-badge");
  if (versionBadge) versionBadge.addEventListener("click", showWelcome);

  // ---------- visitor counter (GoatCounter public JSON) ----------
  function loadVisitorCount() {
    fetch("https://aaronht88.goatcounter.com/counter/TOTAL.json", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d && d.count) {
          $("#visitor-count").textContent = d.count;
          $("#wl-visitor-count").textContent = d.count;
        }
      })
      .catch(() => {});
  }

  // ---------- share code (only transfer method) ----------
  function encodeShare() {
    const cur = decks.find((d) => d.id === currentDeckId);
    return encodeShareFor([...deck.entries()], cur ? cur.name : "");
  }

  // ---------- import a decoded deck as a NEW deck (never overwrite existing) ----------
  function importDeckAsNew(m, srcName) {
    const same = decks.find((d) => d.cards.length === m.size && d.cards.every(([cid, q]) => m.get(cid) === q));
    if (same) {
      currentDeckId = same.id;
    } else {
      let dname = srcName ? srcName + t("importedSuffix") : t("importedDeckName");
      const names = new Set(decks.map((d) => d.name));
      let n = 2;
      while (names.has(dname + " " + n)) n++;
      if (n > 2) dname = dname + " " + n;
      const nd = { id: genId(), name: dname, cards: [...m.entries()] };
      decks.push(nd);
      currentDeckId = nd.id;
    }
    deck = new Map(m);
    saveDecks();
    renderDeckSelect();
    renderDeck();
  }

  // ---------- events ----------
  searchEl.addEventListener("input", renderCards);
  // event delegation on filter containers
  [filterSet, filterRarity, filterLevel, filterRange, filterAttr].forEach((el) => {
    el.addEventListener("change", renderCards);
  });
  const filterClearBtn = $("#filter-clear");
  if (filterClearBtn) {
    filterClearBtn.addEventListener("click", () => {
      clearAllFilters();
      renderCards();
    });
  }

  // view tabs
  function setView(v) {
    view = v;
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x.dataset.view === v));
    renderCards();
  }
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => setView(tab.dataset.view));
  });
  // welcome overlay: donate button closes welcome + opens donation overlay
  const wlDonate = $("#wl-donate");
  if (wlDonate) {
    wlDonate.addEventListener("click", () => {
      hideWelcome();
      openDonation();
    });
  }
  // topbar: ☕ 支持我 chip opens the donation overlay
  const donateTop = $("#btn-donate-top");
  if (donateTop) donateTop.addEventListener("click", openDonation);

  // donation: Buy Me a Coffee link
  const BMC_URL = "https://buymeacoffee.com/aaronht88";

  // language
  $("#lang-select").addEventListener("change", (e) => {
    setLang(e.target.value);
    localStorage.setItem("mhr_lang", e.target.value);
    notifyGoogleSync();
  });

  // deck selector + manager
  deckSelect.addEventListener("change", (e) => { if (e.target.value) selectDeck(e.target.value); });
  $("#btn-deck-new").addEventListener("click", () => {
    const name = prompt(t("promptDeckName"), "");
    if (name !== null) newDeck(name);
  });
  $("#btn-deck-manage").addEventListener("click", openDeckManager);
  $("#btn-simulator").addEventListener("click", openSimulator);
  const exportImgBtn = $("#btn-export-img");
  if (exportImgBtn) exportImgBtn.addEventListener("click", exportDeckImage);
  $("#sim-close").addEventListener("click", closeSimulator);
  $("#sim-modal").addEventListener("click", (e) => { if (e.target === $("#sim-modal")) closeSimulator(); });
  $("#dm-close").addEventListener("click", closeDeckManager);
  dmModal.addEventListener("click", (e) => { if (e.target === dmModal) closeDeckManager(); });
  $("#dm-new").addEventListener("click", () => {
    const name = prompt(t("promptDeckName"), "");
    if (name !== null) { newDeck(name); }
  });
  dmList.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-dm]");
    if (!btn) return;
    const id = btn.dataset.id;
    const act = btn.dataset.dm;
    if (act === "copy") {
      const d = decks.find((x) => x.id === id);
      if (d) {
        const code = encodeShareFor(d.cards, d.name);
        navigator.clipboard?.writeText(code);
        toast(t("toastDeckCopied") + "：" + d.name);
      }
    } else if (act === "rename") {
      const d = decks.find((x) => x.id === id);
      if (d) {
        const name = prompt(t("promptDeckName"), d.name);
        if (name !== null) renameDeck(id, name);
      }
    } else if (act === "load") {
      selectDeck(id);
      closeDeckManager();
    } else if (act === "delete") {
      if (confirm(t("dmDelete") + "? " + decks.find((x) => x.id === id).name)) deleteDeck(id);
    }
  });

  deckListEl.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.act === "inc") addCard(id);
    else removeCard(id);
  });

  // modal events
  $("#modal-close").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!modal.hidden) closeModal();
      else if (!$("#sim-modal").hidden) closeSimulator();
      else if (!$("#donation-modal").hidden) closeDonation();
      else if (!$("#import-modal").hidden) closeImportModal();
    }
  });
  $("#modal-add-deck").addEventListener("click", () => { if (modalCardId) addCard(modalCardId); });
  $("#deck-inc").addEventListener("click", () => { if (modalCardId) addCard(modalCardId); });
  $("#deck-dec").addEventListener("click", () => { if (modalCardId) removeCard(modalCardId); });
  $("#modal-fav").addEventListener("click", () => { if (modalCardId) toggleFav(modalCardId); });

  $("#btn-share").addEventListener("click", () => {
    const code = encodeShare();
    navigator.clipboard?.writeText(code);
    toast(t("toastShare"));
  });
  // ---------- import deck modal ----------
  function openImportModal() {
    if (importTextEl) importTextEl.value = "";
    showOverlay($("#import-modal"));
    setTimeout(() => { if (importTextEl) importTextEl.focus(); }, 60);
  }
  function closeImportModal() { hideOverlay($("#import-modal")); }
  $("#btn-import").addEventListener("click", openImportModal);
  const importCloseBtn = $("#import-close");
  if (importCloseBtn) importCloseBtn.addEventListener("click", closeImportModal);
  const importCancelBtn = $("#import-cancel");
  if (importCancelBtn) importCancelBtn.addEventListener("click", closeImportModal);
  const importModalEl = $("#import-modal");
  if (importModalEl) {
    importModalEl.addEventListener("click", (e) => { if (e.target === importModalEl) closeImportModal(); });
  }
  const importOkBtn = $(" #import-ok");
  if (importOkBtn) {
    importOkBtn.addEventListener("click", () => {
      const code = (importTextEl ? importTextEl.value : "").trim();
      if (!code) { toast(t("toastBadCode")); return; }
      const r = decodeShare(code);
      if (r && r.deck.size) {
        importDeckAsNew(r.deck, r.name);
        renderCards();
        closeImportModal();
        toast(t("toastImportCode"));
      }
      else toast(t("toastBadCode"));
    });
  }
  $("#btn-clear").addEventListener("click", () => {
    deck = new Map(); saveDecks(); renderCards(); renderDeck(); renderDeckSelect(); toast(t("toastCleared"));
  });

  // language change re-render hook (called by i18n.js setLang)
  window.MHR_APP = {
    onLangChange() {
      // refresh checkbox labels (level/range prefixes, attr colors)
      refreshFilterLabels();
      if (modalCardId) fillModalDetails(getCard(modalCardId));
      renderDeckManager();
      renderCards(); renderDeck(); updateModalActions();
      try {
        if (window.MHRGoogleSync && typeof window.MHRGoogleSync.refreshLabels === "function") {
          window.MHRGoogleSync.refreshLabels();
        }
      } catch (e) {}
    },
  };

  // ---------- boot ----------
  loadPersist();
  // URL deck import (?deck=<share code>) — used by the exported deck image QR
  // NOTE: creates a NEW deck instead of overwriting the current one
  try {
    const urlDeck = new URLSearchParams(location.search).get("deck");
    if (urlDeck) {
      let raw = urlDeck;
      try { raw = decodeURIComponent(urlDeck); } catch (e) {}
      const r = decodeShare(raw);
      if (r && r.deck.size) {
        importDeckAsNew(r.deck, r.name);
        urlImportDone = true;
      }
    }
  } catch (e) {}
  renderDeckSelect();
  $("#version-badge").textContent = "v" + APP_VERSION;
  // language: saved choice wins; otherwise auto-detect from browser
  function detectLang() {
    const nav = (navigator.language || navigator.userLanguage || "zh-HK").toLowerCase();
    if (nav.startsWith("zh")) {
      if (nav.startsWith("zh-tw") || nav.startsWith("zh-hk") || nav.startsWith("zh-mo")) return "zh-HK";
      if (nav.startsWith("zh-cn") || nav.startsWith("zh-sg")) return "zh-CN";
      return "zh-HK"; // plain "zh" → project home market
    }
    return "en"; // en + everything else → English
  }
  const savedLang = localStorage.getItem("mhr_lang");
  const bootLang = (savedLang && window.MHR_I18N.I18N[savedLang]) ? savedLang : detectLang();
  $("#lang-select").value = bootLang;
  setLang(bootLang);
  try { localStorage.setItem("mhr_lang", bootLang); } catch (e) {}
  renderCards();
  renderDeck();
  loadVisitorCount();
  if (urlImportDone) toast(t("toastUrlImported"));

  // Google Drive sync (experimental) — no-op when Client ID empty
  try {
    if (window.MHRGoogleSync && typeof window.MHRGoogleSync.init === "function") {
      window.MHRGoogleSync.init({
        toast,
        t,
        getState() {
          // flush working deck into decks[] first
          const cur = decks.find((d) => d.id === currentDeckId);
          if (cur) cur.cards = [...deck.entries()];
          let updatedAt = null;
          try {
            const meta = JSON.parse(localStorage.getItem("mhr_sync_meta_v1") || "null");
            if (meta && meta.updatedAt) updatedAt = meta.updatedAt;
          } catch (e) {}
          return {
            decks: {
              current: currentDeckId,
              decks: decks.map((d) => ({ id: d.id, name: d.name, cards: d.cards })),
            },
            favs: [...favs],
            lang: getLang(),
            updatedAt,
          };
        },
        applyState(state) {
          if (!state) return;
          if (state.decks && Array.isArray(state.decks.decks)) {
            decks = state.decks.decks.map((d) => ({
              id: d.id,
              name: d.name || t("defaultDeckName"),
              cards: Array.isArray(d.cards) ? d.cards.filter(([cid]) => getCard(cid)) : [],
            }));
            if (!decks.length) {
              decks = [{ id: genId(), name: t("defaultDeckName"), cards: [] }];
            }
            currentDeckId = state.decks.current && decks.find((d) => d.id === state.decks.current)
              ? state.decks.current
              : decks[0].id;
            deck = new Map(decks.find((d) => d.id === currentDeckId).cards);
            try {
              localStorage.setItem(LS_DECKS, JSON.stringify({
                current: currentDeckId,
                decks: decks.map((d) => ({ id: d.id, name: d.name, cards: d.cards })),
              }));
            } catch (e) {}
          }
          if (Array.isArray(state.favs)) {
            favs = new Set(state.favs.filter((id) => getCard(id)));
            try { localStorage.setItem(LS_FAVS, JSON.stringify([...favs])); } catch (e) {}
          }
          if (state.lang && window.MHR_I18N.I18N[state.lang]) {
            try { localStorage.setItem("mhr_lang", state.lang); } catch (e) {}
            $("#lang-select").value = state.lang;
            setLang(state.lang);
          }
          if (state.updatedAt) {
            try { localStorage.setItem("mhr_sync_meta_v1", JSON.stringify({ updatedAt: state.updatedAt })); } catch (e) {}
          }
          renderDeckSelect();
          renderCards();
          renderDeck();
        },
      });
    }
  } catch (e) {
    console.warn("[MHR] Google sync init failed", e);
  }

  showWelcome();
})();
