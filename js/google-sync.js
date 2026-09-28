// =============================================================
// Marvel Hero Rush — Google Drive sync (experimental)
// =============================================================
// GIS token client + drive.file. Exposes window.MHRGoogleSync.
// Requires js/google-config.js (GOOGLE_CLIENT_ID). Degrades when empty.

(function () {
  const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
  const EMAIL_SCOPE = "https://www.googleapis.com/auth/userinfo.email";
  const SCOPES = DRIVE_SCOPE + " " + EMAIL_SCOPE;
  const SYNC_FILE_NAME = "mhr-deck-builder-sync.json";
  const LS_META = "mhr_sync_meta_v1";
  const SS_TOKEN = "mhr_google_token_v1";
  const DEBOUNCE_MS = 1500;
  const SCHEMA = 1;

  let cfg = () => (window.MHR_GOOGLE_CONFIG || {});
  let hooks = { getState: null, applyState: null, toast: null, t: (k) => k };
  let tokenClient = null;
  let accessToken = null;
  let tokenExpiresAt = 0;
  let userEmail = "";
  let driveFileId = null;
  let syncing = false;
  let debounceTimer = null;
  let gisLoaded = false;
  let gisLoading = null;
  let conflictResolvedThisSession = false;
  let ui = {};

  function t(key, vars) {
    try { return hooks.t ? hooks.t(key, vars) : key; } catch (e) { return key; }
  }
  function toast(msg) {
    if (hooks.toast) hooks.toast(msg);
  }
  function clientId() {
    return String((cfg().GOOGLE_CLIENT_ID || "").trim());
  }
  function isConfigured() {
    return !!clientId();
  }
  function isSignedIn() {
    return !!(accessToken && tokenExpiresAt > Date.now() + 5000);
  }

  // ---------- meta / local updatedAt ----------
  function readMeta() {
    try {
      const m = JSON.parse(localStorage.getItem(LS_META) || "null");
      if (m && typeof m.updatedAt === "string") return m;
    } catch (e) {}
    return { updatedAt: null };
  }
  function bumpMeta(iso) {
    const updatedAt = iso || new Date().toISOString();
    try { localStorage.setItem(LS_META, JSON.stringify({ updatedAt })); } catch (e) {}
    return updatedAt;
  }
  function ensureLocalUpdatedAt() {
    const m = readMeta();
    if (m.updatedAt) return m.updatedAt;
    return bumpMeta();
  }

  // ---------- token persistence ----------
  function saveToken(token, expiresInSec, email) {
    accessToken = token;
    const sec = Number(expiresInSec) || 3600;
    tokenExpiresAt = Date.now() + sec * 1000 - 30000; // 30s skew
    if (email) userEmail = email;
    try {
      sessionStorage.setItem(SS_TOKEN, JSON.stringify({
        accessToken,
        expiresAt: tokenExpiresAt,
        email: userEmail || "",
      }));
    } catch (e) {}
  }
  function clearToken() {
    accessToken = null;
    tokenExpiresAt = 0;
    userEmail = "";
    driveFileId = null;
    try { sessionStorage.removeItem(SS_TOKEN); } catch (e) {}
  }
  function restoreTokenFromSession() {
    try {
      const raw = sessionStorage.getItem(SS_TOKEN);
      if (!raw) return false;
      const o = JSON.parse(raw);
      if (!o || !o.accessToken || !o.expiresAt) return false;
      if (o.expiresAt <= Date.now() + 5000) {
        clearToken();
        return false;
      }
      accessToken = o.accessToken;
      tokenExpiresAt = o.expiresAt;
      userEmail = o.email || "";
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---------- GIS script ----------
  function loadGis() {
    if (gisLoaded && window.google && google.accounts && google.accounts.oauth2) {
      return Promise.resolve();
    }
    if (gisLoading) return gisLoading;
    gisLoading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = () => {
        gisLoaded = true;
        resolve();
      };
      s.onerror = () => {
        gisLoading = null;
        reject(new Error("GIS load failed"));
      };
      document.head.appendChild(s);
    });
    return gisLoading;
  }

  function ensureTokenClient() {
    if (tokenClient) return tokenClient;
    if (!window.google || !google.accounts || !google.accounts.oauth2) {
      throw new Error("GIS not ready");
    }
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId(),
      scope: SCOPES,
      callback: () => {}, // replaced per request
    });
    return tokenClient;
  }

  function requestToken(prompt) {
    return new Promise(async (resolve, reject) => {
      try {
        await loadGis();
        const client = ensureTokenClient();
        client.callback = async (resp) => {
          if (resp && resp.error) {
            reject(new Error(resp.error_description || resp.error));
            return;
          }
          if (!resp || !resp.access_token) {
            reject(new Error("No access token"));
            return;
          }
          saveToken(resp.access_token, resp.expires_in);
          try {
            await fetchUserEmail();
          } catch (e) { /* email optional */ }
          resolve(resp);
        };
        const opts = {};
        if (prompt === "") opts.prompt = "";
        else if (prompt) opts.prompt = prompt;
        client.requestAccessToken(opts);
      } catch (e) {
        reject(e);
      }
    });
  }

  async function ensureFreshToken() {
    if (isSignedIn()) return accessToken;
    // try silent refresh if we had a session
    const hadSession = !!(sessionStorage.getItem(SS_TOKEN) || userEmail);
    if (hadSession || accessToken) {
      try {
        await requestToken("");
        return accessToken;
      } catch (e) {
        // fall through to interactive
      }
    }
    await requestToken("consent");
    return accessToken;
  }

  async function fetchUserEmail() {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: "Bearer " + accessToken },
    });
    if (!res.ok) throw new Error("userinfo " + res.status);
    const data = await res.json();
    userEmail = data.email || data.sub || "";
    try {
      const raw = sessionStorage.getItem(SS_TOKEN);
      if (raw) {
        const o = JSON.parse(raw);
        o.email = userEmail;
        sessionStorage.setItem(SS_TOKEN, JSON.stringify(o));
      }
    } catch (e) {}
    return userEmail;
  }

  // ---------- Drive helpers ----------
  async function driveFetch(url, options) {
    await ensureFreshToken();
    const opts = Object.assign({}, options || {});
    opts.headers = Object.assign({}, opts.headers || {}, {
      Authorization: "Bearer " + accessToken,
    });
    const res = await fetch(url, opts);
    if (res.status === 401) {
      // force re-auth once
      clearToken();
      await requestToken("");
      opts.headers.Authorization = "Bearer " + accessToken;
      return fetch(url, opts);
    }
    return res;
  }

  async function findSyncFile() {
    const q = encodeURIComponent("name='" + SYNC_FILE_NAME + "' and trashed=false");
    const url = "https://www.googleapis.com/drive/v3/files?q=" + q +
      "&spaces=drive&fields=files(id,name,modifiedTime)&pageSize=10";
    const res = await driveFetch(url);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error("Drive list " + res.status + " " + txt.slice(0, 120));
    }
    const data = await res.json();
    const files = (data && data.files) || [];
    if (!files.length) {
      driveFileId = null;
      return null;
    }
    // prefer most recently modified
    files.sort((a, b) => String(b.modifiedTime || "").localeCompare(String(a.modifiedTime || "")));
    driveFileId = files[0].id;
    return files[0];
  }

  async function downloadSyncJson() {
    const meta = await findSyncFile();
    if (!meta) return null;
    const res = await driveFetch(
      "https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(driveFileId) + "?alt=media"
    );
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error("Drive download " + res.status);
    }
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error("Invalid sync JSON");
    }
  }

  function buildPayloadFromState(state) {
    const updatedAt = (state && state.updatedAt) || ensureLocalUpdatedAt();
    return {
      schema: SCHEMA,
      updatedAt,
      decks: state.decks,
      favs: state.favs,
      lang: state.lang,
    };
  }

  async function uploadSyncJson(payload) {
    const body = JSON.stringify(payload, null, 0);
    const meta = { name: SYNC_FILE_NAME, mimeType: "application/json" };

    if (!driveFileId) {
      await findSyncFile();
    }

    if (!driveFileId) {
      // multipart create
      const boundary = "mhr_boundary_" + Date.now();
      const multipart =
        "--" + boundary + "\r\n" +
        "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
        JSON.stringify(meta) + "\r\n" +
        "--" + boundary + "\r\n" +
        "Content-Type: application/json\r\n\r\n" +
        body + "\r\n" +
        "--" + boundary + "--";
      const res = await driveFetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name",
        {
          method: "POST",
          headers: { "Content-Type": "multipart/related; boundary=" + boundary },
          body: multipart,
        }
      );
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error("Drive create " + res.status + " " + txt.slice(0, 120));
      }
      const data = await res.json();
      driveFileId = data.id;
      return data;
    }

    // media update (content only)
    const res = await driveFetch(
      "https://www.googleapis.com/upload/drive/v3/files/" + encodeURIComponent(driveFileId) +
        "?uploadType=media",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body,
      }
    );
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      // if file vanished, clear id and retry create once
      if (res.status === 404) {
        driveFileId = null;
        return uploadSyncJson(payload);
      }
      throw new Error("Drive update " + res.status + " " + txt.slice(0, 120));
    }
    return res.json().catch(() => ({}));
  }

  // ---------- payload compare / merge ----------
  function snapshotEqual(a, b) {
    try {
      return JSON.stringify(normalizeSnap(a)) === JSON.stringify(normalizeSnap(b));
    } catch (e) {
      return false;
    }
  }
  function normalizeSnap(s) {
    if (!s) return null;
    return {
      decks: s.decks || null,
      favs: Array.isArray(s.favs) ? s.favs.slice().sort() : [],
      lang: s.lang || null,
    };
  }
  function parseTime(iso) {
    const t = Date.parse(iso || "");
    return Number.isFinite(t) ? t : 0;
  }

  function showConflictModal(cloudAt, localAt) {
    return new Promise((resolve) => {
      const modal = document.getElementById("google-conflict-modal");
      if (!modal) {
        // fallback last-write-wins
        resolve(parseTime(cloudAt) > parseTime(localAt) ? "cloud" : "local");
        return;
      }
      const msg = document.getElementById("google-conflict-msg");
      if (msg) {
        msg.textContent = t("googleConflictMsg", {
          cloud: formatTime(cloudAt),
          local: formatTime(localAt),
        });
      }
      // i18n buttons
      const bLocal = document.getElementById("google-conflict-local");
      const bCloud = document.getElementById("google-conflict-cloud");
      const bCancel = document.getElementById("google-conflict-cancel");
      if (bLocal) bLocal.textContent = t("googleConflictKeepLocal");
      if (bCloud) bCloud.textContent = t("googleConflictUseCloud");
      if (bCancel) bCancel.textContent = t("googleConflictCancel");

      function cleanup(choice) {
        modal.hidden = true;
        modal.classList.remove("show");
        if (bLocal) bLocal.onclick = null;
        if (bCloud) bCloud.onclick = null;
        if (bCancel) bCancel.onclick = null;
        modal.onclick = null;
        resolve(choice);
      }
      if (bLocal) bLocal.onclick = () => cleanup("local");
      if (bCloud) bCloud.onclick = () => cleanup("cloud");
      if (bCancel) bCancel.onclick = () => cleanup("cancel");
      modal.onclick = (e) => { if (e.target === modal) cleanup("cancel"); };
      modal.hidden = false;
      void modal.offsetWidth;
      modal.classList.add("show");
    });
  }

  function formatTime(iso) {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso);
      return d.toLocaleString();
    } catch (e) {
      return String(iso);
    }
  }

  // ---------- sync orchestration ----------
  async function pullAndMerge() {
    if (!hooks.getState || !hooks.applyState) return;
    if (syncing) return;
    syncing = true;
    clearTimeout(debounceTimer);
    setStatus("syncing");
    try {
      const cloud = await downloadSyncJson();
      const localState = hooks.getState();
      const localAt = localState.updatedAt || ensureLocalUpdatedAt();
      const localSnap = {
        decks: localState.decks,
        favs: localState.favs,
        lang: localState.lang,
        updatedAt: localAt,
      };

      if (!cloud) {
        // only local → upload
        const payload = buildPayloadFromState(localSnap);
        await uploadSyncJson(payload);
        setStatus("synced");
        toast(t("googleSynced"));
        return;
      }

      const cloudSnap = {
        decks: cloud.decks,
        favs: cloud.favs || [],
        lang: cloud.lang,
        updatedAt: cloud.updatedAt,
      };

      if (snapshotEqual(localSnap, cloudSnap)) {
        // align meta timestamp if missing
        if (!readMeta().updatedAt && cloud.updatedAt) bumpMeta(cloud.updatedAt);
        setStatus("synced");
        return;
      }

      // both exist and differ
      let choice;
      if (!conflictResolvedThisSession) {
        conflictResolvedThisSession = true;
        choice = await showConflictModal(cloud.updatedAt, localAt);
        if (choice === "cancel") {
          setStatus("idle");
          return;
        }
      } else {
        choice = parseTime(cloud.updatedAt) > parseTime(localAt) ? "cloud" : "local";
      }

      if (choice === "cloud") {
        hooks.applyState({
          decks: cloud.decks,
          favs: cloud.favs || [],
          lang: cloud.lang,
          updatedAt: cloud.updatedAt || new Date().toISOString(),
        });
        bumpMeta(cloud.updatedAt || new Date().toISOString());
        setStatus("synced");
        toast(t("googleSyncedFromCloud"));
      } else {
        // keep local, upload
        const payload = buildPayloadFromState(localSnap);
        await uploadSyncJson(payload);
        setStatus("synced");
        toast(t("googleSynced"));
      }
    } catch (e) {
      console.warn("[MHRGoogleSync] pullAndMerge", e);
      setStatus("error", e.message || String(e));
      toast(t("googleSyncError"));
      // never wipe local
    } finally {
      syncing = false;
    }
  }

  async function pushNow() {
    if (!hooks.getState) return;
    if (!isSignedIn() && !accessToken) return;
    if (syncing) return;
    syncing = true;
    setStatus("syncing");
    try {
      const state = hooks.getState();
      if (!state.updatedAt) state.updatedAt = ensureLocalUpdatedAt();
      const payload = buildPayloadFromState(state);
      await uploadSyncJson(payload);
      setStatus("synced");
    } catch (e) {
      console.warn("[MHRGoogleSync] pushNow", e);
      setStatus("error", e.message || String(e));
      toast(t("googleSyncError"));
    } finally {
      syncing = false;
    }
  }

  function onLocalChange() {
    if (syncing) return; // merge/upload owns meta timestamps while in flight
    bumpMeta();
    if (!isSignedIn() && !accessToken) {
      updateUI();
      return;
    }
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      pushNow();
    }, DEBOUNCE_MS);
    updateUI();
  }

  // ---------- UI ----------
  function cacheUI() {
    ui.chip = document.getElementById("google-sync-chip");
    ui.btnSignIn = document.getElementById("btn-google-signin");
    ui.userWrap = document.getElementById("google-sync-user");
    ui.email = document.getElementById("google-sync-email");
    ui.btnSync = document.getElementById("btn-google-sync");
    ui.btnSignOut = document.getElementById("btn-google-signout");
    ui.status = document.getElementById("google-sync-status");
  }

  let lastStatus = "idle";
  let lastStatusDetail = "";
  let lastSyncedAt = null;

  function setStatus(kind, detail) {
    lastStatus = kind;
    lastStatusDetail = detail || "";
    if (kind === "synced") lastSyncedAt = new Date();
    updateUI();
  }

  function truncateEmail(email) {
    if (!email) return "";
    if (email.length <= 22) return email;
    const at = email.indexOf("@");
    if (at > 0) {
      const local = email.slice(0, at);
      const domain = email.slice(at);
      const short = local.length > 8 ? local.slice(0, 6) + "…" : local;
      return short + domain;
    }
    return email.slice(0, 18) + "…";
  }

  function updateUI() {
    if (!ui.btnSignIn) cacheUI();
    if (!ui.chip) return;

    const configured = isConfigured();
    const signed = isSignedIn() || (!!accessToken && tokenExpiresAt > Date.now());

    if (!configured) {
      if (ui.btnSignIn) {
        ui.btnSignIn.hidden = false;
        ui.btnSignIn.textContent = t("googleSyncBtn");
        ui.btnSignIn.title = t("googleNotConfigured");
      }
      if (ui.userWrap) ui.userWrap.hidden = true;
      if (ui.status) {
        ui.status.textContent = "";
        ui.status.title = t("googleNotConfigured");
      }
      return;
    }

    if (!signed) {
      if (ui.btnSignIn) {
        ui.btnSignIn.hidden = false;
        ui.btnSignIn.textContent = t("googleSignIn");
        ui.btnSignIn.title = "";
      }
      if (ui.userWrap) ui.userWrap.hidden = true;
    } else {
      if (ui.btnSignIn) ui.btnSignIn.hidden = true;
      if (ui.userWrap) ui.userWrap.hidden = false;
      if (ui.email) {
        ui.email.textContent = truncateEmail(userEmail || "Google");
        ui.email.title = userEmail || "";
      }
      if (ui.btnSync) ui.btnSync.textContent = t("googleSyncNow");
      if (ui.btnSignOut) ui.btnSignOut.textContent = t("googleSignOut");
    }

    if (ui.status) {
      let text = "";
      if (lastStatus === "syncing") text = t("googleSyncing");
      else if (lastStatus === "synced") {
        text = t("googleSynced");
        if (lastSyncedAt) {
          try {
            text += " · " + lastSyncedAt.toLocaleTimeString();
          } catch (e) {}
        }
      } else if (lastStatus === "error") text = t("googleSyncError");
      ui.status.textContent = text;
      ui.status.title = lastStatusDetail || text;
      ui.status.dataset.status = lastStatus;
    }
  }

  async function signIn() {
    if (!isConfigured()) {
      toast(t("googleNotConfigured"));
      return;
    }
    setStatus("syncing");
    try {
      await requestToken("consent");
      updateUI();
      await pullAndMerge();
    } catch (e) {
      console.warn("[MHRGoogleSync] signIn", e);
      setStatus("error", e.message || String(e));
      toast(t("googleSyncError"));
    }
  }

  function signOut() {
    try {
      if (accessToken && window.google && google.accounts && google.accounts.oauth2) {
        google.accounts.oauth2.revoke(accessToken, () => {});
      }
    } catch (e) {}
    clearToken();
    conflictResolvedThisSession = false;
    setStatus("idle");
    toast(t("googleSignedOut"));
    updateUI();
  }

  async function syncNow() {
    if (!isConfigured()) {
      toast(t("googleNotConfigured"));
      return;
    }
    try {
      if (!isSignedIn()) await ensureFreshToken();
      await pullAndMerge();
    } catch (e) {
      console.warn("[MHRGoogleSync] syncNow", e);
      setStatus("error", e.message || String(e));
      toast(t("googleSyncError"));
    }
  }

  function bindUI() {
    cacheUI();
    if (ui.btnSignIn) {
      ui.btnSignIn.addEventListener("click", () => {
        if (!isConfigured()) {
          toast(t("googleNotConfigured"));
          return;
        }
        signIn();
      });
    }
    if (ui.btnSync) ui.btnSync.addEventListener("click", () => syncNow());
    if (ui.btnSignOut) ui.btnSignOut.addEventListener("click", () => signOut());
  }

  async function init(options) {
    hooks = Object.assign(hooks, options || {});
    bindUI();
    ensureLocalUpdatedAt();

    if (!isConfigured()) {
      updateUI();
      return;
    }

    // restore session token if still valid; do not auto-prompt
    if (restoreTokenFromSession()) {
      updateUI();
      // quiet background merge
      pullAndMerge().catch(() => {});
    } else {
      updateUI();
      // warm-load GIS in background so first click is faster
      loadGis().catch(() => {});
    }
  }

  function refreshLabels() {
    updateUI();
  }

  window.MHRGoogleSync = {
    init,
    onLocalChange,
    isSignedIn: () => isSignedIn() || (!!accessToken && tokenExpiresAt > Date.now()),
    isConfigured,
    signIn,
    signOut,
    syncNow,
    refreshLabels,
    getUserEmail: () => userEmail,
  };
})();
