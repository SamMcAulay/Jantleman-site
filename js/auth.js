// ─────────────────────────────────────────────────────
//  Jantleman Dashboard — Auth utilities
// ─────────────────────────────────────────────────────
const AUTH_KEY = "jantleman_token";

function getToken() {
  return localStorage.getItem(AUTH_KEY);
}

function setToken(token) {
  localStorage.setItem(AUTH_KEY, token);
}

function clearToken() {
  localStorage.removeItem(AUTH_KEY);
}

function decodePayload(token) {
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function requireAuth() {
  const token = getToken();
  if (!token) {
    window.location.href = "/";
    return null;
  }
  const payload = decodePayload(token);
  if (!payload || (payload.exp && payload.exp < Date.now() / 1000)) {
    clearToken();
    window.location.href = "/";
    return null;
  }
  return payload;
}
