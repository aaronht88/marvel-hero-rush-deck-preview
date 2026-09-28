> **Preview only** of `aaronht88/marvel-hero-rush-deck` branch `feat/google-drive-sync` (Google Drive sync). Production: https://mhrdeckbuild.duckdns.org/

# Marvel Hero Rush Deck Builder

A lightweight deck-building web app for the **Marvel Hero Rush TCG** (Card Fun / 杰森动漫).

> **Build v1.3.11-beta** · 2026-08-11
> ✅ **Real card data.** Cardlist published on the official site — this repo contains all **233 card entries** (192 unique card numbers, including alternate-art / rarity prints) scraped from the official API, with local card art thumbnails.
> 🎨 UI themed on the official rulebook's dark sci-fi / tactical HUD design language.

## Features (v1.3.11-beta)

**Card database**
- 233 real cards from the official cardlist (BP01 The Avengers booster + SD01-04 REALITY/MIND/SPACE/TIME starters)
- Full stats: level 1-6, power, attack range 0-5, color (Red/Yellow/Blue/Green), trait, rarity (R/SR/GR/MR/UR/SEC), complete effect text
- Local card art thumbnails (480px WebP)

**Browsing & filtering**
- Search by card name / number / trait / effect text
- Filters: series, rarity, level, attack range, color
- View tabs: All / Favorites / Owned collection
- Card detail overlay: enlarged art + all stats + effect text, with Add-to-Deck / Favorite / Owned (±) controls and live in-deck count

**Deck building**
- **Multiple named decks** with a deck manager (new / rename / delete / load) + one-click copy of any deck's share code
- **Deck Simulator**: one-click overlay showing the whole deck grouped & sorted by Grade (Lv 1-6); click any card for its full details
- Drag & drop cards onto the deck panel to add
- Official rules validation: **exactly 50 cards, max 2 colors, max 3 same-name copies**
- Deck statistics: level curve, color breakdown, rarity breakdown, average Power

**UI / UX**
- Multi-language interface (繁體中文 / 简体中文 / English)
- Dark sci-fi HUD theme (official rulebook design language)
- Everything persists in localStorage (decks, favorites, owned counts, language)

## Data
- Source: official Marvel Hero Rush cardlist API (`server.marvelherorush.com/marvel/card/list`)
- Sets: **BP01 The Avengers** (booster, 153 entries) · **SD01 REALITY** · **SD02 MIND** · **SD03 SPACE** · **SD04 TIME** (starter decks, 20 each)
- Rarities: R · SR · GR · MR · UR · SEC
- Card colors: Red · Yellow · Blue · Green
- Card art: downloaded from the official CDN and converted to local 480px WebP thumbnails (`img/cards/`) — official image URLs carry 24-hour expiry tokens, so local copies are required for a static site
- Note: the official cardlist contains **character cards only**; Rush Points are game tokens, not cards
- Deck rules (confirmed from the official rulebook PDF): **exactly 50 cards**, **max 2 colors**, **max 3 same-name copies**; separate 9-card Rush deck

## Tech
Zero-dependency static web app — plain HTML + CSS + vanilla JS. No build step.

## Run locally
```bash
# option 1: any static server
python3 -m http.server 8765
# then open http://localhost:8765

# option 2: just double-click index.html (data is embedded, works on file://)
```

## Files
| File | Purpose |
|------|---------|
| `index.html` | Page structure |
| `css/styles.css` | UI styling (dark sci-fi HUD theme) |
| `js/i18n.js` | Multi-language strings (繁中/简中/EN) |
| `js/cards.js` | Card database (233 real entries) |
| `js/rules.js` | Deck-building rules (official: 50 cards / 2 colors / 3 same-name) |
| `js/app.js` | App logic: browse, build, validate, share, multi-deck, favorites/owned |
| `js/google-config.js` | Public OAuth Client ID placeholder (Drive sync) |
| `js/google-sync.js` | Experimental Google Identity + Drive sync |
| `docs/GOOGLE_DRIVE_SYNC.md` | Drive sync setup guide |
| `img/cards/` | Local card art thumbnails (WebP) |

## Experimental

**Google Drive sync** (branch `feat/google-drive-sync`, app **v1.4.7-beta**): optional sign-in so decks / favorites / language sync to a JSON file in the user’s own Drive (`drive.file`). Production Pages still ships from `main` only. Setup: see [`docs/GOOGLE_DRIVE_SYNC.md`](docs/GOOGLE_DRIVE_SYNC.md). Paste your OAuth Web Client ID into `js/google-config.js` (empty = offline-only, no crash).

## Roadmap
- [x] Real card data (233 entries) from official API
- [x] Deck rules confirmed from official rulebook PDF (50 / 2 colors / 3 same-name)
- [x] Multi-deck storage + favorites/owned collection + i18n UI
- [ ] Traditional-Chinese card text (official API currently serves EN/ID only)
- [ ] Card detail popup enhancements, public sharing backend
- [ ] Monetization (shelved until game launch + proper hosting)

## Deployment
Live site: https://aaronht88.github.io/marvel-hero-rush-deck/ (GitHub Actions → Pages)
