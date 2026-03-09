// ─────────────────────────────────────────────────────
//  Jantleman Dashboard — API wrapper
// ─────────────────────────────────────────────────────
async function apiRequest(path, options = {}) {
  const token = sessionStorage.getItem("jantleman_token");
  const res = await fetch(JANTLEMAN_API + path, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    ...options,
  });
  if (res.status === 401 || res.status === 403) {
    sessionStorage.removeItem("jantleman_token");
    window.location.href = "/";
    return null;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => res.status);
    throw new Error("API error " + res.status + ": " + text);
  }
  return res.json();
}

const api = {
  getGuilds: () => apiRequest("/api/guilds"),
  getSettings: (guildId) => apiRequest("/api/settings/" + guildId),
  saveSettings: (guildId, data) =>
    apiRequest("/api/settings/" + guildId, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getChannels: (guildId) => apiRequest("/api/channels/" + guildId),
  addChannel: (guildId, channelId, channelName) =>
    apiRequest("/api/channels/" + guildId, {
      method: "POST",
      body: JSON.stringify({ channel_id: channelId, channel_name: channelName }),
    }),
  removeChannel: (guildId, channelId) =>
    apiRequest("/api/channels/" + guildId + "/" + channelId, {
      method: "DELETE",
    }),
  getBlacklist: (guildId) => apiRequest("/api/blacklist/" + guildId),
  addBlacklist: (guildId, userId) =>
    apiRequest("/api/blacklist/" + guildId, {
      method: "POST",
      body: JSON.stringify({ user_id: userId }),
    }),
  removeBlacklist: (guildId, userId) =>
    apiRequest("/api/blacklist/" + guildId + "/" + userId, {
      method: "DELETE",
    }),
  getLimits: (guildId) => apiRequest("/api/limits/" + guildId),
  setLimit: (guildId, userId, hours) =>
    apiRequest("/api/limits/" + guildId, {
      method: "POST",
      body: JSON.stringify({ user_id: userId, hours }),
    }),
  removeLimit: (guildId, userId) =>
    apiRequest("/api/limits/" + guildId + "/" + userId, {
      method: "DELETE",
    }),
  getMembers: (guildId) => apiRequest("/api/members/" + guildId),
  getUserReviews: (guildId, userId) => apiRequest("/api/reviews/" + guildId + "/" + userId),
};
