# Google Drive sync (experimental)

Branch: `feat/google-drive-sync` · App version: **v1.4.7-beta**

Google login + per-user deck / favorites / language stored as JSON in the **user's own Google Drive** (`drive.file` scope — only files this app creates).

Production GitHub Pages continues to deploy from **`main` only**. This branch is experimental; merge only when the flow is stable.

## What gets synced

| Key | Source | Notes |
|-----|--------|--------|
| decks | `localStorage` `mhr_decks_v3` | `{ current, decks: [{id,name,cards}] }` |
| favs | `localStorage` `mhr_favs_v2` | array of card ids |
| lang | `localStorage` `mhr_lang` | `zh-HK` / `zh-CN` / `en` |
| updatedAt | `localStorage` `mhr_sync_meta_v1` | ISO-8601; bumped on every local save |

Drive file name: **`mhr-deck-builder-sync.json`** (created in the user's Drive root / My Drive; searchable by name).

Share codes are unchanged and still work without an account.

## Architecture

- Static site (no npm build). Scripts: `js/google-config.js` + `js/google-sync.js`.
- [Google Identity Services](https://developers.google.com/identity/oauth2/web/guides/use-token-model) **token client** (implicit/PKCE-style for SPAs).
- Scopes: `https://www.googleapis.com/auth/drive.file` + `https://www.googleapis.com/auth/userinfo.email`.
- Drive REST with the OAuth **access token only** (no API key required).
- `localStorage` remains the offline cache; signed-in sessions debounce-upload (~1.5s) after saves.
- Conflict on first differing login: modal (Keep local / Use cloud / Cancel). Later conflicts: last-write-wins by `updatedAt`.
- **Never** wipes local data on Drive errors.

## Setup (Google Cloud Console)

1. Open [Google Cloud Console](https://console.cloud.google.com/) → create or select a project.
2. **APIs & Services → Library** → enable **Google Drive API**.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   - Application type: **Web application**.
   - Name: e.g. `MHR Deck Builder`.
4. **Authorized JavaScript origins** (required for GIS token client):

   | Origin |
   |--------|
   | `https://aaronht88.github.io` |
   | `https://mhrdeckbuild.duckdns.org` |
   | `http://localhost:5500` |
   | `http://127.0.0.1:5500` |

   Authorized **redirect URIs** are usually **not** needed for the token (popup) client. Add one only if Google Console or your flow asks for it (e.g. same origin + `/`).
5. Copy the **Client ID** (`….apps.googleusercontent.com`).
6. Paste into `js/google-config.js`:

   ```js
   window.MHR_GOOGLE_CONFIG = {
     GOOGLE_CLIENT_ID: "PASTE_HERE.apps.googleusercontent.com",
     GOOGLE_API_KEY: "", // leave empty
   };
   ```

   See also `js/google-config.example.js`.

7. OAuth consent screen: External (or Internal for Workspace). Add test users while the app is in Testing. Scopes above must be listed / approved as needed.

> The OAuth Client ID is a **public** SPA identifier (not a server secret). Do not commit client *secrets*; this project does not use a client secret.

## Local testing

```bash
# from repo root — origin must match an Authorized JS origin
npx --yes serve -l 5500
# or: python3 -m http.server 5500
# open http://localhost:5500  (or http://127.0.0.1:5500)
```

Without a Client ID the site works as before; the Google button toasts a setup hint and does not crash.

With a Client ID: Sign in → allow Drive file access → app creates / updates `mhr-deck-builder-sync.json` → reload another browser / device and Sign in to restore.

## Manual Sync Now / Sign out

Top bar chip:

- Not signed in: **Google 同步** / Sign in
- Signed in: truncated email · **Sync now** · **Sign out**
- Status text: syncing / synced (+ time) / error

## Deployment notes

- GitHub Pages production = **`main`**.
- This feature lives on **`feat/google-drive-sync`** until merged.
- Preview this branch via a fork Pages deploy, `serve`, or a temporary Pages branch — do **not** merge until Client ID + consent screen are ready.

## Limitations / risks

- Access tokens expire (~1h); silent `prompt:''` refresh is attempted, else user must click Sign in again.
- `drive.file` only sees files this app created/opened — safe, but the sync file must be created by this app (first successful upload).
- Last-write-wins can overwrite the older side after the first conflict dialog; export a share code before resolving if unsure.
- Third-party cookies / popup blockers can interfere with GIS.
- No multi-device realtime CRDT — debounce upload only.
