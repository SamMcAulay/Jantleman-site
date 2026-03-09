// ─────────────────────────────────────────────────────
//  Jantleman Dashboard — Application Logic
// ─────────────────────────────────────────────────────
let currentGuildId = null;
let currentSettings = null;
let isDirty = false;

async function init() {
  // Handle OAuth callback: token lands in fragment here
  const hash = window.location.hash;
  if (hash.startsWith("#token=")) {
    setToken(hash.slice(7));
    history.replaceState(null, "", window.location.pathname);
  }

  if (!requireAuth()) return;

  document.getElementById("invite-btn").href = JANTLEMAN_INVITE;
  document.getElementById("invite-hero-btn").href = JANTLEMAN_INVITE;

  setupTabs();
  setupSaveButton();
  setupLogout();
  setupMobileMenu();
  initStarfield();
  await loadGuilds();
}

// ── UI Setup ──────────────────────────────────────────

function activateTab(target) {
  const tab = document.querySelector(`.nav-tab[data-tab="${target}"]`);
  if (!tab) return;
  document.querySelectorAll(".nav-tab").forEach((t) => t.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  tab.classList.add("active");
  document.getElementById("tab-" + target).classList.add("active");
  document.getElementById("tab-heading").textContent = tab.querySelector(".nav-label").textContent;
}

function setupTabs() {
  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      activateTab(tab.dataset.tab);
      history.replaceState(null, "", "#" + tab.dataset.tab);
      closeSidebar();
    });
  });

  // Restore tab from URL hash on load
  const hash = window.location.hash.slice(1);
  if (hash && document.querySelector(`.nav-tab[data-tab="${hash}"]`)) {
    activateTab(hash);
  }
}

function openSidebar() {
  document.querySelector(".sidebar").classList.add("open");
  document.getElementById("sidebar-backdrop").classList.add("open");
}

function closeSidebar() {
  document.querySelector(".sidebar").classList.remove("open");
  document.getElementById("sidebar-backdrop").classList.remove("open");
}

function setupMobileMenu() {
  document.getElementById("menu-toggle").addEventListener("click", openSidebar);
  document.getElementById("sidebar-backdrop").addEventListener("click", closeSidebar);
}

function setupSaveButton() {
  document.getElementById("save-btn").addEventListener("click", saveSettings);
}

function setupLogout() {
  document.getElementById("logout-btn").addEventListener("click", () => {
    clearToken();
    window.location.href = "/";
  });
}

// ── Guilds ────────────────────────────────────────────

async function loadGuilds() {
  setStatus("loading", "Connecting…");
  try {
    const guilds = await api.getGuilds();
    if (!guilds || guilds.length === 0) {
      setStatus("warning", "No servers found");
      document.getElementById("guild-selector").innerHTML =
        '<option value="">No servers available</option>';
      document.getElementById("invite-panel").hidden = false;
      document.getElementById("save-btn").hidden = true;
      document.querySelectorAll(".tab-panel").forEach((p) => (p.hidden = true));
      return;
    }

    const sel = document.getElementById("guild-selector");
    sel.innerHTML = guilds
      .map((g) => `<option value="${g.id}">${escapeHtml(g.name)}</option>`)
      .join("");

    sel.addEventListener("change", () => {
      if (isDirty && !confirm("You have unsaved changes. Switch server anyway?")) {
        sel.value = currentGuildId;
        return;
      }
      loadGuildData(sel.value);
    });

    setStatus("connected", "● Connected");
    await loadGuildData(guilds[0].id);
  } catch (err) {
    setStatus("error", "✕ Connection failed");
    console.error(err);
  }
}

// ── Guild Data ─────────────────────────────────────────

async function loadGuildData(guildId) {
  currentGuildId = guildId;
  isDirty = false;
  const btn = document.getElementById("save-btn");
  btn.disabled = true;
  btn.textContent = "Save Changes";
  btn.classList.remove("dirty");

  showLoading(true);
  try {
    const [settings, channels, blacklist, limits] = await Promise.all([
      api.getSettings(guildId),
      api.getChannels(guildId),
      api.getBlacklist(guildId),
      api.getLimits(guildId),
    ]);
    currentSettings = settings;
    renderSettingsTab(settings);
    renderChannelsTab(channels);
    renderBlacklistTab(blacklist);
    renderLimitsTab(limits);
  } catch (err) {
    console.error("Failed to load data:", err);
    showToast("Failed to load server data.", "error");
  } finally {
    showLoading(false);
  }
}

function markDirty() {
  isDirty = true;
  const btn = document.getElementById("save-btn");
  btn.disabled = false;
  btn.classList.add("dirty");
}

async function saveSettings() {
  const btn = document.getElementById("save-btn");
  btn.disabled = true;
  btn.textContent = "Saving…";

  try {
    const trackToggle = document.getElementById("setting-track-identity");
    const proofSelect = document.getElementById("setting-proof-req");

    await api.saveSettings(currentGuildId, {
      track_identity: trackToggle ? trackToggle.checked : true,
      proof_req: proofSelect ? proofSelect.value : "required",
    });

    isDirty = false;
    btn.textContent = "✓ Saved";
    btn.classList.remove("dirty");
    setTimeout(() => {
      btn.textContent = "Save Changes";
    }, 2500);
    showToast("Settings saved!", "success");
  } catch (err) {
    btn.textContent = "Save Changes";
    btn.disabled = false;
    btn.classList.add("dirty");
    showToast("Failed to save. Please try again.", "error");
  }
}

// ── Settings Tab ───────────────────────────────────────

function renderSettingsTab(settings) {
  const container = document.getElementById("tab-settings");
  const trackOn = settings.track_identity !== false;
  const proof = settings.proof_req || "required";

  container.innerHTML = `
    <p class="tab-desc">Configure server-wide behaviour for The Jantleman.</p>
    <div class="settings-fields">
      <h3 class="section-title"><span class="section-pip"></span>Identity & Verification</h3>

      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Identity Tracking</div>
          <div class="setting-desc">Alert when a user has changed their display name multiple times in the past 7 days before creating a thread.</div>
        </div>
        <label class="toggle-wrap" title="Toggle identity tracking">
          <div class="tc-switch ${trackOn ? "is-on" : ""}" id="track-switch">
            <span class="tc-knob"></span>
          </div>
          <input type="checkbox" id="setting-track-identity" ${trackOn ? "checked" : ""} hidden>
        </label>
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Proof Requirement</div>
          <div class="setting-desc">Set whether review vouches require a screenshot attachment.</div>
        </div>
        <select class="setting-select" id="setting-proof-req">
          <option value="required" ${proof === "required" ? "selected" : ""}>Required (Strict)</option>
          <option value="optional" ${proof === "optional" ? "selected" : ""}>Optional (Flexible)</option>
          <option value="off" ${proof === "off" ? "selected" : ""}>Off (No Screenshots)</option>
        </select>
      </div>
    </div>
  `;

  // Wire up the toggle switch
  const sw = container.querySelector("#track-switch");
  const input = container.querySelector("#setting-track-identity");
  sw.addEventListener("click", () => {
    input.checked = !input.checked;
    sw.classList.toggle("is-on", input.checked);
    markDirty();
  });

  container.querySelector("#setting-proof-req").addEventListener("change", markDirty);
}

// ── Channels Tab ───────────────────────────────────────

function renderChannelsTab(channels) {
  const container = document.getElementById("tab-channels");
  container.innerHTML = `
    <p class="tab-desc">Manage the forum channels The Jantleman monitors for new thread activity.</p>

    <div class="channel-form">
      <div class="cf-row">
        <div class="cf-group">
          <span class="cf-label">Channel ID</span>
          <input type="text" class="text-input" id="ch-id-input" placeholder="e.g. 1234567890123456789">
        </div>
        <div class="cf-group">
          <span class="cf-label">Label (optional)</span>
          <input type="text" class="text-input" id="ch-name-input" placeholder="e.g. #marketplace">
        </div>
        <button class="btn-add" id="ch-add-btn">+ Add</button>
      </div>
      <p class="hint" style="margin-top:10px;">Right-click a channel in Discord → Copy Channel ID. Make sure Developer Mode is enabled.</p>
    </div>

    <div class="list-rows" id="channels-list"></div>
  `;

  renderChannelList(channels);

  document.getElementById("ch-add-btn").addEventListener("click", async () => {
    const idInput = document.getElementById("ch-id-input");
    const nameInput = document.getElementById("ch-name-input");
    const channelId = idInput.value.trim();
    const channelName = nameInput.value.trim() || channelId;

    if (!channelId || !/^\d+$/.test(channelId)) {
      showToast("Enter a valid channel ID (numbers only).", "error");
      return;
    }

    try {
      const btn = document.getElementById("ch-add-btn");
      btn.disabled = true;
      await api.addChannel(currentGuildId, channelId, channelName);
      idInput.value = "";
      nameInput.value = "";
      const updated = await api.getChannels(currentGuildId);
      renderChannelList(updated);
      showToast("Channel added.", "success");
    } catch (err) {
      showToast("Failed to add channel.", "error");
    } finally {
      const btn = document.getElementById("ch-add-btn");
      if (btn) btn.disabled = false;
    }
  });
}

function renderChannelList(channels) {
  const list = document.getElementById("channels-list");
  if (!list) return;

  if (!channels || channels.length === 0) {
    list.innerHTML = '<p class="empty-state">No channels being monitored yet.</p>';
    return;
  }

  list.innerHTML = channels.map((ch) => `
    <div class="list-row">
      <span class="lr-badge">#</span>
      <span class="lr-name">${escapeHtml(ch.channel_name || ch.channel_id)}</span>
      <span class="lr-sub">${ch.channel_id}</span>
      <button class="btn-delete" data-id="${ch.channel_id}" title="Remove">✕</button>
    </div>
  `).join("");

  list.querySelectorAll(".btn-delete").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const channelId = btn.dataset.id;
      try {
        btn.disabled = true;
        await api.removeChannel(currentGuildId, channelId);
        const updated = await api.getChannels(currentGuildId);
        renderChannelList(updated);
        showToast("Channel removed.", "success");
      } catch (err) {
        showToast("Failed to remove channel.", "error");
        btn.disabled = false;
      }
    });
  });
}

// ── Blacklist Tab ──────────────────────────────────────

function renderBlacklistTab(blacklist) {
  const container = document.getElementById("tab-blacklist");
  container.innerHTML = `
    <p class="tab-desc">Users on the blacklist are prevented from posting in monitored channels and have their threads automatically deleted.</p>

    <div class="channel-form">
      <div class="cf-row">
        <div class="cf-group">
          <span class="cf-label">User ID</span>
          <input type="text" class="text-input" id="bl-id-input" placeholder="e.g. 1234567890123456789">
        </div>
        <button class="btn-add" id="bl-add-btn">+ Blacklist</button>
      </div>
      <p class="hint" style="margin-top:10px;">Right-click a user in Discord → Copy User ID. Make sure Developer Mode is enabled.</p>
    </div>

    <div class="list-rows" id="blacklist-list"></div>
  `;

  renderBlacklistRows(blacklist);

  document.getElementById("bl-add-btn").addEventListener("click", async () => {
    const idInput = document.getElementById("bl-id-input");
    const userId = idInput.value.trim();

    if (!userId || !/^\d+$/.test(userId)) {
      showToast("Enter a valid user ID (numbers only).", "error");
      return;
    }

    try {
      const btn = document.getElementById("bl-add-btn");
      btn.disabled = true;
      await api.addBlacklist(currentGuildId, userId);
      idInput.value = "";
      const updated = await api.getBlacklist(currentGuildId);
      renderBlacklistRows(updated);
      showToast("User blacklisted.", "success");
    } catch (err) {
      showToast("Failed to blacklist user.", "error");
    } finally {
      const btn = document.getElementById("bl-add-btn");
      if (btn) btn.disabled = false;
    }
  });
}

function renderBlacklistRows(blacklist) {
  const list = document.getElementById("blacklist-list");
  if (!list) return;

  if (!blacklist || blacklist.length === 0) {
    list.innerHTML = '<p class="empty-state">No users are blacklisted.</p>';
    return;
  }

  list.innerHTML = blacklist.map((entry) => `
    <div class="list-row">
      <span class="lr-badge blacklist-badge">⛔</span>
      <span class="lr-name">${escapeHtml(entry.username || "Unknown User")}</span>
      <span class="lr-sub">${entry.user_id}</span>
      <button class="btn-delete" data-id="${entry.user_id}" title="Remove from blacklist">✕</button>
    </div>
  `).join("");

  list.querySelectorAll(".btn-delete").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const userId = btn.dataset.id;
      try {
        btn.disabled = true;
        await api.removeBlacklist(currentGuildId, userId);
        const updated = await api.getBlacklist(currentGuildId);
        renderBlacklistRows(updated);
        showToast("User removed from blacklist.", "success");
      } catch (err) {
        showToast("Failed to remove user.", "error");
        btn.disabled = false;
      }
    });
  });
}

// ── Limits Tab ─────────────────────────────────────────

function renderLimitsTab(limits) {
  const container = document.getElementById("tab-limits");
  container.innerHTML = `
    <p class="tab-desc">Restrict specific users to one post every N hours in monitored channels. Useful for managing high-volume sellers.</p>

    <div class="channel-form">
      <div class="cf-row limit-form-row">
        <div class="cf-group">
          <span class="cf-label">User ID</span>
          <input type="text" class="text-input" id="lm-id-input" placeholder="e.g. 1234567890123456789">
        </div>
        <div class="cf-group" style="flex:0;">
          <span class="cf-label">Hours</span>
          <input type="number" class="number-input" id="lm-hours-input" value="24" min="1" max="720">
        </div>
        <span class="ef-unit" style="padding-bottom:10px;">h</span>
        <button class="btn-add" id="lm-add-btn">+ Set Limit</button>
      </div>
    </div>

    <div class="list-rows" id="limits-list"></div>
  `;

  renderLimitRows(limits);

  document.getElementById("lm-add-btn").addEventListener("click", async () => {
    const idInput = document.getElementById("lm-id-input");
    const hoursInput = document.getElementById("lm-hours-input");
    const userId = idInput.value.trim();
    const hours = parseInt(hoursInput.value, 10);

    if (!userId || !/^\d+$/.test(userId)) {
      showToast("Enter a valid user ID (numbers only).", "error");
      return;
    }
    if (!hours || hours < 1) {
      showToast("Hours must be at least 1.", "error");
      return;
    }

    try {
      const btn = document.getElementById("lm-add-btn");
      btn.disabled = true;
      await api.setLimit(currentGuildId, userId, hours);
      idInput.value = "";
      hoursInput.value = "24";
      const updated = await api.getLimits(currentGuildId);
      renderLimitRows(updated);
      showToast("Posting limit set.", "success");
    } catch (err) {
      showToast("Failed to set limit.", "error");
    } finally {
      const btn = document.getElementById("lm-add-btn");
      if (btn) btn.disabled = false;
    }
  });
}

function renderLimitRows(limits) {
  const list = document.getElementById("limits-list");
  if (!list) return;

  if (!limits || limits.length === 0) {
    list.innerHTML = '<p class="empty-state">No posting limits set.</p>';
    return;
  }

  list.innerHTML = limits.map((entry) => `
    <div class="list-row">
      <span class="lr-badge">⏱️</span>
      <span class="lr-name">${escapeHtml(entry.username || "Unknown User")}</span>
      <span class="lr-sub">${entry.user_id}</span>
      <span class="limit-badge">every ${entry.post_limit_hours}h</span>
      <button class="btn-delete" data-id="${entry.user_id}" title="Remove limit">✕</button>
    </div>
  `).join("");

  list.querySelectorAll(".btn-delete").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const userId = btn.dataset.id;
      try {
        btn.disabled = true;
        await api.removeLimit(currentGuildId, userId);
        const updated = await api.getLimits(currentGuildId);
        renderLimitRows(updated);
        showToast("Posting limit removed.", "success");
      } catch (err) {
        showToast("Failed to remove limit.", "error");
        btn.disabled = false;
      }
    });
  });
}

// ── Helpers ────────────────────────────────────────────

function setStatus(type, text) {
  const el = document.getElementById("status");
  el.className = "status " + type;
  el.textContent = text;
}

function showLoading(show) {
  const el = document.getElementById("loading-overlay");
  el.style.display = show ? "flex" : "none";
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let toastTimer = null;

function showToast(message, type = "info") {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    document.body.appendChild(toast);
  }
  toast.className = `toast toast-${type} show`;
  toast.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3000);
}

// ── Starfield ──────────────────────────────────────────

function initStarfield() {
  const canvas = document.getElementById("starfield");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let stars = [];

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    stars = Array.from({ length: 160 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.2 + 0.1,
      phase: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.5 + 0.15,
      drift: (Math.random() - 0.5) * 0.06,
    }));
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const t = Date.now() / 1000;
    for (const s of stars) {
      const a = 0.04 + 0.14 * (0.5 + 0.5 * Math.sin(t * s.speed + s.phase));
      s.y -= 0.05;
      s.x += s.drift;
      if (s.y < -2) { s.y = canvas.height + 2; s.x = Math.random() * canvas.width; }
      ctx.beginPath();
      ctx.rect(s.x, s.y, s.r * 1.5, s.r * 1.5);
      ctx.fillStyle = `rgba(220, 180, 100, ${a})`;
      ctx.fill();
    }
    requestAnimationFrame(draw);
  }

  resize();
  draw();
  window.addEventListener("resize", resize);
}

// ── Bootstrap ──────────────────────────────────────────

document.addEventListener("DOMContentLoaded", init);
