// =============================================================
// Google OAuth / Drive sync — EXAMPLE config (copy → google-config.js)
// =============================================================
// 1. Create an OAuth 2.0 Client ID (Web application) in Google Cloud Console
//    https://console.cloud.google.com/apis/credentials
// 2. Enable "Google Drive API" for the project
// 3. Under Authorized JavaScript origins, add:
//      https://aaronht88.github.io
//      https://mhrdeckbuild.duckdns.org
//      http://localhost:5500
//      http://127.0.0.1:5500
//    (GIS token client usually does NOT need Authorized redirect URIs)
// 4. Paste the Client ID below. Leave GOOGLE_API_KEY empty — Drive REST
//    calls use the OAuth access token alone (no API key required).
// 5. Full walkthrough: docs/GOOGLE_DRIVE_SYNC.md
//
// This file is documentation only. The live file is js/google-config.js
// (committed with empty placeholders so the site never crashes).

window.MHR_GOOGLE_CONFIG = {
  GOOGLE_CLIENT_ID: "YOUR_CLIENT_ID.apps.googleusercontent.com",
  GOOGLE_API_KEY: "", // optional; leave empty (token-only preferred)
};
