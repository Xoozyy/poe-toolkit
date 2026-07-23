/**
 * GGG OAuth (Public Client + PKCE) — login flow and token lifecycle.
 *
 * PoE Toolkit is a desktop app with no way to keep a client secret safe, so it
 * must register as a Public Client at pathofexile.com/my-account/applications:
 *   - Client type: Public Client
 *   - Redirect URI: http://127.0.0.1:44608/callback (must match REDIRECT_URI exactly)
 *   - Scopes: account:profile account:stashes account:characters
 *
 * Public clients get 10h access tokens / 7d refresh tokens and cannot use
 * service:* scopes (so league names come from the account's characters, not
 * GET /league, which requires service:leagues).
 */
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { app, safeStorage, shell } = require('electron');
const { getPoeAuthConfig } = require('./config.cjs');

const AUTHORIZE_URL = 'https://www.pathofexile.com/oauth/authorize';
const TOKEN_URL = 'https://www.pathofexile.com/oauth/token';
const API_BASE = 'https://api.pathofexile.com';
const REDIRECT_PORT = 44608;
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/callback`;
const SCOPES = 'account:profile account:stashes account:characters';
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const TOKEN_REFRESH_BUFFER_MS = 60 * 1000;
const FETCH_TIMEOUT_MS = 12_000;

function tokenPath() {
  return path.join(app.getPath('userData'), 'poe-tokens.bin');
}

function userAgent(clientId, contactEmail) {
  return `OAuth ${clientId}/${app.getVersion()} (contact: ${contactEmail})`;
}

function readTokens() {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null;
    const buf = fs.readFileSync(tokenPath());
    return JSON.parse(safeStorage.decryptString(buf));
  } catch {
    return null;
  }
}

function writeTokens(tokens) {
  if (!safeStorage.isEncryptionAvailable()) {
    return { ok: false, error: 'encryption_unavailable' };
  }
  try {
    const dir = path.dirname(tokenPath());
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(tokenPath(), safeStorage.encryptString(JSON.stringify(tokens)));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

function clearTokens() {
  try {
    fs.unlinkSync(tokenPath());
  } catch {
    // already gone
  }
}

function base64url(buf) {
  return buf.toString('base64url');
}

function createPkce() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function callbackHtml(message) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>PoE Toolkit</title></head>
<body style="font:15px system-ui;background:#0c1014;color:#e7e7ea;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<p>${message}</p></body></html>`;
}

async function fetchJsonTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function requestToken(body, clientId, contactEmail) {
  const res = await fetchJsonTimeout(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'User-Agent': userAgent(clientId, contactEmail),
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const err = new Error(`Token request failed: ${res.status} ${detail}`.trim());
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function fetchProfile(accessToken, clientId, contactEmail) {
  const res = await fetchJsonTimeout(`${API_BASE}/profile`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'User-Agent': userAgent(clientId, contactEmail),
    },
  });
  if (!res.ok) return null;
  return res.json();
}

function getAuthorizeUrl(clientId, state, challenge) {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    scope: SCOPES,
    state,
    redirect_uri: REDIRECT_URI,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

async function exchangeCode(code, verifier, clientId, contactEmail) {
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  });
  let json;
  try {
    json = await requestToken(body, clientId, contactEmail);
  } catch (err) {
    return { ok: false, error: 'token_exchange_failed', detail: String(err?.message || err) };
  }

  const expiresAt = Date.now() + (Number(json.expires_in) || 0) * 1000;
  const profile = await fetchProfile(json.access_token, clientId, contactEmail).catch(() => null);
  const tokens = {
    accessToken: json.access_token,
    refreshToken: json.refresh_token || null,
    expiresAt,
    accountName: profile?.name || null,
    scope: json.scope || SCOPES,
  };
  const stored = writeTokens(tokens);
  if (!stored.ok) return stored;
  return { ok: true, accountName: tokens.accountName };
}

/**
 * Opens the system browser for the GGG consent screen and runs a one-shot
 * loopback server to catch the redirect. Resolves once the flow finishes
 * (success, denial, mismatch, or timeout) — never left listening indefinitely.
 */
function startLoginFlow() {
  const { clientId, contactEmail } = getPoeAuthConfig();
  if (!clientId) return Promise.resolve({ ok: false, error: 'missing_client_id' });
  if (!contactEmail) return Promise.resolve({ ok: false, error: 'missing_contact_email' });

  const { verifier, challenge } = createPkce();
  const state = crypto.randomBytes(16).toString('hex');
  const authorizeUrl = getAuthorizeUrl(clientId, state, challenge);

  return new Promise((resolve) => {
    let settled = false;
    let server;
    let timeoutHandle;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      if (server) server.close();
      resolve(result);
    };

    timeoutHandle = setTimeout(() => finish({ ok: false, error: 'timeout' }), LOGIN_TIMEOUT_MS);

    server = http.createServer((req, res) => {
      let reqUrl;
      try {
        reqUrl = new URL(req.url, REDIRECT_URI);
      } catch {
        res.writeHead(400).end();
        return;
      }
      if (reqUrl.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }

      const params = reqUrl.searchParams;
      const errorParam = params.get('error');
      const returnedState = params.get('state');
      const code = params.get('code');

      if (errorParam) {
        res.writeHead(200, { 'Content-Type': 'text/html' }).end(
          callbackHtml('Login cancelled. You can close this tab.'),
        );
        finish({ ok: false, error: 'access_denied' });
        return;
      }
      if (returnedState !== state) {
        res.writeHead(200, { 'Content-Type': 'text/html' }).end(
          callbackHtml('Something went wrong (state mismatch). You can close this tab.'),
        );
        finish({ ok: false, error: 'state_mismatch' });
        return;
      }
      if (!code) {
        res.writeHead(200, { 'Content-Type': 'text/html' }).end(
          callbackHtml('Missing authorization code. You can close this tab.'),
        );
        finish({ ok: false, error: 'no_code' });
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' }).end(
        callbackHtml('You are connected. You can close this tab and return to PoE Toolkit.'),
      );
      exchangeCode(code, verifier, clientId, contactEmail).then(finish);
    });

    server.on('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
        finish({ ok: false, error: 'port_in_use' });
      } else {
        finish({ ok: false, error: 'server_error', detail: String(err?.message || err) });
      }
    });

    server.listen(REDIRECT_PORT, '127.0.0.1', () => {
      shell.openExternal(authorizeUrl);
    });
  });
}

/** Returns a usable access token, refreshing if near expiry; null if not connected. */
async function getValidAccessToken() {
  const tokens = readTokens();
  if (!tokens || !tokens.accessToken) return null;
  if (tokens.expiresAt - Date.now() > TOKEN_REFRESH_BUFFER_MS) {
    return tokens.accessToken;
  }
  if (!tokens.refreshToken) {
    clearTokens();
    return null;
  }

  const { clientId, contactEmail } = getPoeAuthConfig();
  if (!clientId || !contactEmail) return null;

  try {
    const body = new URLSearchParams({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
    });
    const json = await requestToken(body, clientId, contactEmail);
    const expiresAt = Date.now() + (Number(json.expires_in) || 0) * 1000;
    const next = {
      ...tokens,
      accessToken: json.access_token,
      refreshToken: json.refresh_token || tokens.refreshToken,
      expiresAt,
      scope: json.scope || tokens.scope,
    };
    const stored = writeTokens(next);
    if (!stored.ok) return null;
    return next.accessToken;
  } catch {
    clearTokens();
    return null;
  }
}

function disconnect() {
  clearTokens();
  return { ok: true };
}

function getConnectionStatus() {
  const tokens = readTokens();
  if (!tokens || !tokens.accessToken) {
    return { connected: false, accountName: null, expiresAt: null };
  }
  return {
    connected: true,
    accountName: tokens.accountName || null,
    expiresAt: new Date(tokens.expiresAt).toISOString(),
  };
}

module.exports = {
  API_BASE,
  REDIRECT_URI,
  startLoginFlow,
  getValidAccessToken,
  disconnect,
  getConnectionStatus,
  userAgent,
};
