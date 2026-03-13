// ─────────────────────────────────────────────────────
//  Jantleman Dashboard — Application Logic
// ─────────────────────────────────────────────────────
let currentGuildId = null;
let currentSettings = null;
let isDirty = false;
let memberSortMode = 'reviews';

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

  // Show admin link for admin users
  const payload = decodePayload(getToken());
  if (payload && payload.is_admin) {
    const adminLink = document.getElementById("admin-link");
    if (adminLink) adminLink.style.display = "";
  }

  setupTabs();
  setupSaveButton();
  setupLogout();
  setupMobileMenu();
  await loadGuilds();
}

// ── UI Setup ──────────────────────────────────────────

function activateTab(target) {
  const tab = document.querySelector(`.nav-tab[data-tab="${target}"]`);
  if (!tab) return;
  document.querySelectorAll(".nav-tab").forEach((t) => t.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".bottom-nav-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === target);
  });
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

  document.querySelectorAll(".bottom-nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      activateTab(btn.dataset.tab);
      history.replaceState(null, "", "#" + btn.dataset.tab);
    });
  });
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
    const [settings, channels, blacklist, limits, members, reviewbans] = await Promise.all([
      api.getSettings(guildId),
      api.getChannels(guildId),
      api.getBlacklist(guildId),
      api.getLimits(guildId),
      api.getMembers(guildId),
      api.getReviewBans(guildId),
    ]);
    currentSettings = settings;
    renderSettingsTab(settings);
    renderChannelsTab(channels);
    renderBlacklistTab(blacklist);
    renderLimitsTab(limits);
    renderReviewBansTab(reviewbans);
    renderMembersTab(members);
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
    const v = id => document.getElementById(id);
    const globalLimitVal = v("setting-global-limit")?.value?.trim();

    await api.saveSettings(currentGuildId, {
      track_identity:          v("setting-track-identity")?.checked ?? true,
      proof_req:               v("setting-proof-req")?.value ?? "required",
      min_reviews:             parseInt(v("setting-min-reviews")?.value ?? "1", 10),
      global_post_limit_hours: globalLimitVal ? parseInt(globalLimitVal, 10) : null,
      auto_delete_new:         v("setting-auto-delete")?.checked ?? false,
      alert_channel_id:        v("setting-alert-ch")?.value?.trim() || null,
      verified_role_id:        v("setting-verified-role")?.value?.trim() || null,
      audit_role_id:           v("setting-audit-role")?.value?.trim() || null,
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

function renderSettingsTab(s) {
  const container = document.getElementById("tab-settings");
  const trackOn      = s.track_identity !== false;
  const proof        = s.proof_req || "required";
  const autoDelete   = s.auto_delete_new === true;
  const minReviews   = s.min_reviews ?? 1;
  const globalLimit  = s.global_post_limit_hours ?? "";
  const verifiedRole = s.verified_role_id ?? "";
  const auditRole    = s.audit_role_id ?? "";
  const alertCh      = s.alert_channel_id ?? "";

  container.innerHTML = `
    <p class="tab-desc">Configure server-wide behaviour for The Jantleman.</p>
    <div class="settings-fields">

      <h3 class="section-title"><span class="section-pip"></span>Identity &amp; Reviews</h3>

      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Identity Tracking</div>
          <div class="setting-desc">Flag users who have changed their display name multiple times in the past 7 days.</div>
        </div>
        <label class="toggle-wrap">
          <div class="tc-switch ${trackOn ? "is-on" : ""}" id="track-switch"><span class="tc-knob"></span></div>
          <input type="checkbox" id="setting-track-identity" ${trackOn ? "checked" : ""} hidden>
        </label>
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Proof Requirement</div>
          <div class="setting-desc">Whether review vouches require a screenshot or evidence link.</div>
        </div>
        <select class="setting-select" id="setting-proof-req">
          <option value="required" ${proof === "required" ? "selected" : ""}>Required (Strict)</option>
          <option value="optional" ${proof === "optional" ? "selected" : ""}>Optional (Flexible)</option>
          <option value="off"      ${proof === "off"      ? "selected" : ""}>Off (No Screenshots)</option>
        </select>
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Minimum Reviews to be "Established"</div>
          <div class="setting-desc">Users below this count get a ⚠️ New Member Alert when they post. Set to 0 to disable the threshold.</div>
        </div>
        <input type="number" class="number-input" id="setting-min-reviews" value="${minReviews}" min="0" max="999" style="width:70px">
      </div>

      <h3 class="section-title" style="margin-top:20px"><span class="section-pip"></span>Posting Rules</h3>

      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Server-Wide Posting Cooldown</div>
          <div class="setting-desc">Applies to every user unless they have a personal limit set. Leave blank to disable.</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <input type="number" class="number-input" id="setting-global-limit" value="${globalLimit}" min="1" max="720" placeholder="—" style="width:70px">
          <span style="font-size:0.8rem;color:var(--text-2)">hours</span>
        </div>
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Auto-Delete Posts from New Members</div>
          <div class="setting-desc">Automatically remove threads from users who have fewer reviews than the minimum threshold above. They'll receive a DM explaining why.</div>
        </div>
        <label class="toggle-wrap">
          <div class="tc-switch ${autoDelete ? "is-on" : ""}" id="autodel-switch"><span class="tc-knob"></span></div>
          <input type="checkbox" id="setting-auto-delete" ${autoDelete ? "checked" : ""} hidden>
        </label>
      </div>

      <h3 class="section-title" style="margin-top:20px"><span class="section-pip"></span>Alerts &amp; Channels</h3>

      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Alert Channel</div>
          <div class="setting-desc">When a ⚠️ New Member or 🛑 High Risk alert fires, also send a ping to this channel (paste channel ID). Leave blank to disable.</div>
        </div>
        <input type="text" class="text-input" id="setting-alert-ch" value="${escapeHtml(alertCh)}" placeholder="Channel ID" style="width:190px">
      </div>

      <h3 class="section-title" style="margin-top:20px"><span class="section-pip"></span>Roles</h3>

      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Verified Role</div>
          <div class="setting-desc">Role ID to associate with trusted / verified members (paste from Discord Developer Mode).</div>
        </div>
        <input type="text" class="text-input" id="setting-verified-role" value="${escapeHtml(verifiedRole)}" placeholder="Role ID" style="width:190px">
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Audit / Mod Role</div>
          <div class="setting-desc">Role ID for moderators who can use admin-level bot commands.</div>
        </div>
        <input type="text" class="text-input" id="setting-audit-role" value="${escapeHtml(auditRole)}" placeholder="Role ID" style="width:190px">
      </div>

    </div>
  `;

  // Toggle: identity tracking
  const trackSw = container.querySelector("#track-switch");
  const trackIn = container.querySelector("#setting-track-identity");
  trackSw.addEventListener("click", () => {
    trackIn.checked = !trackIn.checked;
    trackSw.classList.toggle("is-on", trackIn.checked);
    markDirty();
  });

  // Toggle: auto-delete
  const autoSw = container.querySelector("#autodel-switch");
  const autoIn = container.querySelector("#setting-auto-delete");
  autoSw.addEventListener("click", () => {
    autoIn.checked = !autoIn.checked;
    autoSw.classList.toggle("is-on", autoIn.checked);
    markDirty();
  });

  ["setting-proof-req", "setting-min-reviews", "setting-global-limit",
   "setting-alert-ch", "setting-verified-role", "setting-audit-role"].forEach(id => {
    container.querySelector("#" + id)?.addEventListener("change", markDirty);
    container.querySelector("#" + id)?.addEventListener("input", markDirty);
  });
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
      <p class="hint" style="margin-top:10px;">Right-click a channel in Discord → Copy Channel ID. Developer Mode must be enabled.</p>
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
      <button class="btn-delete" data-id="${ch.channel_id}" title="Remove">&#x2715;</button>
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
      <p class="hint" style="margin-top:10px;">Right-click a user in Discord → Copy User ID. Developer Mode must be enabled.</p>
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
      <span class="lr-badge blacklist-badge">&#x26D4;</span>
      <span class="lr-name">${escapeHtml(entry.username || "Unknown User")}</span>
      <span class="lr-sub">${entry.user_id}</span>
      <button class="btn-delete" data-id="${entry.user_id}" title="Remove from blacklist">&#x2715;</button>
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
      <span class="lr-badge">&#x23F1;&#xFE0F;</span>
      <span class="lr-name">${escapeHtml(entry.username || "Unknown User")}</span>
      <span class="lr-sub">${entry.user_id}</span>
      <span class="limit-badge">every ${entry.post_limit_hours}h</span>
      <button class="btn-delete" data-id="${entry.user_id}" title="Remove limit">&#x2715;</button>
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

// ── Review Bans Tab ────────────────────────────────────

function renderReviewBansTab(bans) {
  const container = document.getElementById("tab-reviewbans");
  container.innerHTML = `
    <p class="tab-desc">Review-banned users can still post in monitored channels, but are blocked from leaving reputation reviews. Useful for preventing abuse without a full blacklist.</p>

    <div class="channel-form">
      <div class="cf-row">
        <div class="cf-group">
          <span class="cf-label">User ID</span>
          <input type="text" class="text-input" id="rb-id-input" placeholder="e.g. 1234567890123456789">
        </div>
        <button class="btn-add" id="rb-add-btn" style="background:var(--danger-dim);border:1px solid rgba(248,113,113,0.3);color:var(--danger)">+ Ban from Reviewing</button>
      </div>
      <p class="hint" style="margin-top:10px;">Right-click a user in Discord → Copy User ID. Developer Mode must be enabled.</p>
    </div>

    <div class="list-rows" id="reviewbans-list"></div>
  `;

  renderReviewBanRows(bans);

  document.getElementById("rb-add-btn").addEventListener("click", async () => {
    const idInput = document.getElementById("rb-id-input");
    const userId = idInput.value.trim();
    if (!userId || !/^\d+$/.test(userId)) {
      showToast("Enter a valid user ID (numbers only).", "error");
      return;
    }
    const btn = document.getElementById("rb-add-btn");
    btn.disabled = true;
    try {
      await api.addReviewBan(currentGuildId, userId);
      idInput.value = "";
      const updated = await api.getReviewBans(currentGuildId);
      renderReviewBanRows(updated);
      showToast("User banned from reviewing.", "success");
    } catch {
      showToast("Failed to ban user.", "error");
    } finally {
      btn.disabled = false;
    }
  });
}

function renderReviewBanRows(bans) {
  const list = document.getElementById("reviewbans-list");
  if (!list) return;
  if (!bans || bans.length === 0) {
    list.innerHTML = '<p class="empty-state">No review bans active.</p>';
    return;
  }
  list.innerHTML = bans.map(entry => `
    <div class="list-row">
      <span class="lr-badge" style="background:rgba(248,113,113,0.12);border-color:rgba(248,113,113,0.3);color:var(--danger)">&#x1F6AB;</span>
      <span class="lr-name">${escapeHtml(entry.username || "Unknown User")}</span>
      <span class="lr-sub">${entry.user_id}</span>
      <button class="btn-delete" data-id="${entry.user_id}" title="Remove review ban">&#x2715;</button>
    </div>
  `).join("");

  list.querySelectorAll(".btn-delete").forEach(btn => {
    btn.addEventListener("click", async () => {
      const userId = btn.dataset.id;
      btn.disabled = true;
      try {
        await api.removeReviewBan(currentGuildId, userId);
        const updated = await api.getReviewBans(currentGuildId);
        renderReviewBanRows(updated);
        showToast("Review ban removed.", "success");
      } catch {
        showToast("Failed to remove ban.", "error");
        btn.disabled = false;
      }
    });
  });
}

// ── Members & Reviews Tab ──────────────────────────────

function sortMembers(members, mode) {
  const copy = [...members];
  if (mode === 'best')  return copy.sort((a, b) => b.avg_rating - a.avg_rating);
  if (mode === 'worst') return copy.sort((a, b) => a.avg_rating - b.avg_rating);
  return copy.sort((a, b) => b.total_reviews - a.total_reviews);
}

function renderMembersTab(members) {
  const container = document.getElementById("tab-members");

  if (!members || members.length === 0) {
    container.innerHTML = `
      <p class="tab-desc">View all tracked members and their reputation reviews.</p>
      <p class="empty-state">No reviewed members in this server yet.</p>
    `;
    return;
  }

  memberSortMode = 'reviews';

  container.innerHTML = `
    <p class="tab-desc">All members with reputation reviews. Click a row to read their reviews.</p>
    <div class="members-toolbar">
      <div class="member-search-row">
        <input type="text" class="text-input" id="member-search" placeholder="Search by name or user ID…">
      </div>
      <div class="members-filter-bar">
        <button class="filter-btn active" data-sort="reviews">Most Reviews</button>
        <button class="filter-btn" data-sort="best">Highest Rated</button>
        <button class="filter-btn" data-sort="worst">Lowest Rated</button>
      </div>
    </div>
    <div id="members-list"></div>
  `;

  renderMemberRows(members, sortMembers(members, memberSortMode));

  document.getElementById("member-search").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    const filtered = q
      ? members.filter(m =>
          (m.username || m.user_id).toLowerCase().includes(q) ||
          m.user_id.includes(q)
        )
      : members;
    renderMemberRows(members, sortMembers(filtered, memberSortMode));
  });

  container.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      container.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      memberSortMode = btn.dataset.sort;
      const q = document.getElementById("member-search")?.value.trim().toLowerCase() || "";
      const filtered = q
        ? members.filter(m =>
            (m.username || m.user_id).toLowerCase().includes(q) ||
            m.user_id.includes(q)
          )
        : members;
      renderMemberRows(members, sortMembers(filtered, memberSortMode));
    });
  });
}

function starsDisplay(avg) {
  const full = Math.round(avg);
  const empty = 5 - full;
  return `<span class="stars-full">${"★".repeat(full)}</span><span class="stars-empty">${"★".repeat(empty)}</span>`;
}

function renderMemberRows(allMembers, filtered) {
  const list = document.getElementById("members-list");
  if (!list) return;

  if (!filtered.length) {
    list.innerHTML = '<p class="empty-state">No members match your search.</p>';
    return;
  }

  list.innerHTML = filtered.map(m => `
    <div class="member-row" data-uid="${m.user_id}">
      <div class="member-row-header">
        <div class="member-avatar-wrap">
          ${m.avatar
            ? `<img class="member-avatar" src="${m.avatar}" alt="">`
            : `<div class="member-avatar-ph">${(m.username || m.user_id)[0].toUpperCase()}</div>`
          }
        </div>
        <div class="member-info">
          <div class="member-name">${escapeHtml(m.username || m.user_id)}</div>
          <div class="member-id">${m.user_id}</div>
        </div>
        <div class="member-rating">
          <div class="member-stars">${starsDisplay(m.avg_rating)}</div>
          <div class="member-rating-val">${m.avg_rating} / 5</div>
        </div>
        <div class="member-count">${m.total_reviews} review${m.total_reviews !== 1 ? "s" : ""}</div>
        <div class="member-badges">
          ${m.is_blacklisted ? `<span class="mbadge mbadge-bl">Blacklisted</span>` : ""}
          ${m.post_limit_hours ? `<span class="mbadge mbadge-lim">Limit: ${m.post_limit_hours}h</span>` : ""}
        </div>
        <button class="member-expand-btn" aria-label="Expand reviews">Reviews</button>
      </div>
      <div class="member-reviews" hidden>
        <p class="review-loading">Loading reviews…</p>
      </div>
    </div>
  `).join("");

  list.querySelectorAll(".member-row").forEach(row => {
    const header = row.querySelector(".member-row-header");
    const btn = row.querySelector(".member-expand-btn");
    const reviewsEl = row.querySelector(".member-reviews");
    let loaded = false;

    header.addEventListener("click", async () => {
      const open = !reviewsEl.hidden;
      if (open) {
        reviewsEl.hidden = true;
        btn.textContent = "Reviews";
        row.classList.remove("expanded");
        return;
      }
      reviewsEl.hidden = false;
      btn.textContent = "Hide";
      row.classList.add("expanded");

      if (loaded) return;
      loaded = true;

      try {
        const reviews = await api.getUserReviews(currentGuildId, row.dataset.uid);
        if (!reviews || reviews.length === 0) {
          reviewsEl.innerHTML = '<p class="review-empty">No reviews on record.</p>';
          return;
        }
        reviewsEl.innerHTML = reviews.map(r => `
          <div class="review-card">
            <div class="review-header">
              <div class="review-stars-wrap">
                <span class="review-stars">${starsDisplay(r.stars)}</span>
                <span class="review-score-num">${r.stars}/5</span>
              </div>
              <div class="review-meta">
                <span class="review-author">${escapeHtml(r.author_name)}</span>
                <span class="review-time">${relativeTime(r.timestamp)}</span>
              </div>
            </div>
            ${r.comment ? `<p class="review-comment">${escapeHtml(r.comment)}</p>` : ""}
            ${r.proof_url ? `
              <a class="review-proof" href="${escapeHtml(r.proof_url)}" target="_blank" rel="noopener noreferrer">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
                View Proof
              </a>` : ""}
          </div>
        `).join("");
      } catch {
        reviewsEl.innerHTML = '<p class="review-empty" style="color:var(--danger)">Failed to load reviews.</p>';
      }
    });
  });
}

function relativeTime(ts) {
  if (!ts) return "";
  const d = new Date(ts.replace(" ", "T") + "Z");
  const diff = Date.now() - d.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
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

// ── Bootstrap ──────────────────────────────────────────

document.addEventListener("DOMContentLoaded", init);
