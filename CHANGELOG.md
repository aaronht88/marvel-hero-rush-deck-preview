# Changelog

All notable changes to the Marvel Hero Rush Deck Builder.

> 版本編號格式：X.Y.Z-beta。此檔案只記錄最新版本改動；完整歷史見 Git commit log。

## [1.4.7-beta] — 2026-09-28

### Added
- **實驗性 Google Drive 同步**（僅 `feat/google-drive-sync` 分支；production Pages 仍只部署 `main`）
  - Google Identity Services OAuth（token client）+ `drive.file` 將牌組／最愛／語言寫入使用者自己的 Drive（`mhr-deck-builder-sync.json`）
  - `localStorage` 仍作離線快取；登入後 debounce 上傳；衝突時可選保留本機／使用雲端
  - 未設定 Client ID 時 UI 顯示設定提示、不崩潰（見 `docs/GOOGLE_DRIVE_SYNC.md`、`js/google-config.js`）

### Changed
- 版本徽章／cache-bust → **v1.4.7-beta**

## [1.4.6-beta] — 2026-09-28

### Changed
- **篩選改為 Checkbox 多選**：系列／稀有度／等級／攻擊範圍／顏色由單一 `<select>` 改為勾選 chips
  - 同類別內：**OR**（例如勾 Red + Blue → 紅或藍）
  - 跨類別：**AND**（例如再勾 SR → 只顯示紅 SR 與藍 SR）
  - 某類別零勾選＝不限（等同舊「全部」）
  - 搜尋文字與最愛視圖仍與篩選 AND；Rush Point 圖鑑 tab 不變
- 新增「清除篩選」按鈕；語言切換時同步更新等級／範圍／顏色標籤

## [1.4.5-beta] — 2026-08-18

### Added
- **簡中介面顯示官方簡中卡名 / 特徵 / 效果**（js/cards_cn.js，官方 API zh-CN 448 條）：切換去簡中就自動用中文卡文字（如「毒液」「蜘蛛侠」）；搜尋同時支援中英文；繁中/英文維持英文卡資料

## [1.4.4-beta] — 2026-08-18

### Added
- **SP01「Era of Spiders」蜘蛛紀元全卡表**（官方 API 首發，297 → **449 張**）
  - SP01-001~080：80 個角色 — Spider-Man 宇宙全陣容（Venom 與共生體群 / Spider-Gwen / Ghost-Spider / Spider-Ham / Spider-Man 2099 / Superior Spider-Man / Doc Ock / Green Goblin / Kingpin / Knull / Black Cat / Silk 等）
  - SP01-081~100：20 張 Rush Point（含 MR / SEC 稀有度 print）
  - **HR** 新稀有度（chip 顏色 + filter + 分享碼 I=SP01 支援）
  - 152 張卡圖全部本地 WebP，0 缺圖

### Changed
- 卡庫 **297 → 449**（377 角色 + 72 Rush Point）；Rush Point 圖鑑由 39 → 72 張
- subtitle / 捐款自介 / welcome overlay 卡數字眼三語同步

### Removed
- 卡牌詳情 3D + Holo 效果 prototype（效果一般，roll back）
- 「⚔️ 試玩對戰」按鈕（battle sim 尚未適合公開）

---

*上一版：v1.3.11-beta（EB01 / PB01 / TB01 新系列）。完整歷史見 Git commit log。*
