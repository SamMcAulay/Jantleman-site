// ─────────────────────────────────────────────────────
//  Jantleman Dashboard — Application Logic
// ─────────────────────────────────────────────────────
let currentGuildId = null;
let currentSettings = null;
let isDirty = false;
let memberSortMode = 'reviews';
let activeCardUid = null;

async function init() {
  // Handle OAuth callback: token lands in fragment here
  const hash = window.location.hash;
  if (hash.startsWith("#token=")) {
    setToken(hash.slice(7));
    history.replaceState(null, "", window.location.pathname);
  }

  if (!requireAuth()) return;

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
  await loadGuilds();
}

// ── UI Setup ──────────────────────────────────────────

function activateTab(target) {
  document.querySelectorAll(".rail-tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === target);
  });
  document.querySelectorAll(".mobile-tab").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === target);
  });
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  const panel = document.getElementById("tab-" + target);
  if (panel) panel.classList.add("active");
}

function setupTabs() {
  document.querySelectorAll(".rail-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      activateTab(tab.dataset.tab);
      history.replaceState(null, "", "#" + tab.dataset.tab);
    });
  });

  document.querySelectorAll(".mobile-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      activateTab(btn.dataset.tab);
      history.replaceState(null, "", "#" + btn.dataset.tab);
    });
  });

  // Restore tab from URL hash on load
  const hash = window.location.hash.slice(1);
  if (hash && document.querySelector(`.rail-tab[data-tab="${hash}"]`)) {
    activateTab(hash);
  }
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
  activeCardUid = null;
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
      feedback_detection:      v("setting-feedback-detection")?.checked ?? false,
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

function sectionTitle(text) {
  return `<h3 class="section-title"><span class="section-pip"></span><span class="section-title-text">${text}</span></h3>`;
}

function renderSettingsTab(s) {
  const container = document.getElementById("tab-settings");
  const trackOn         = s.track_identity !== false;
  const proof           = s.proof_req || "required";
  const autoDelete      = s.auto_delete_new === true;
  const feedbackDetect  = s.feedback_detection === true;
  const minReviews      = s.min_reviews ?? 1;
  const globalLimit     = s.global_post_limit_hours ?? "";
  const verifiedRole    = s.verified_role_id ?? "";
  const auditRole       = s.audit_role_id ?? "";
  const alertCh         = s.alert_channel_id ?? "";

  container.innerHTML = `
    <p class="tab-desc">Configure server-wide behaviour for The Jantleman.</p>
    <div class="settings-fields">

      ${sectionTitle("Identity &amp; Reviews")}

      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Identity Tracking</div>
          <div class="setting-desc">Flag users who have changed their display name multiple times in the past 7 days.</div>
        </div>
        <div class="toggle-wrap">
          <div class="tc-switch ${trackOn ? "is-on" : ""}" id="track-switch"><span class="tc-knob"></span></div>
          <input type="checkbox" id="setting-track-identity" ${trackOn ? "checked" : ""} hidden>
        </div>
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
          <div class="setting-desc">Users below this count get a warning when they post. Set to 0 to disable.</div>
        </div>
        <input type="number" class="number-input" id="setting-min-reviews" value="${minReviews}" min="0" max="999" style="width:70px">
      </div>

      ${sectionTitle("Posting Rules")}

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
        <div class="toggle-wrap">
          <div class="tc-switch ${autoDelete ? "is-on" : ""}" id="autodel-switch"><span class="tc-knob"></span></div>
          <input type="checkbox" id="setting-auto-delete" ${autoDelete ? "checked" : ""} hidden>
        </div>
      </div>

      ${sectionTitle("Feedback Detection")}

      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Feedback Detection</div>
          <div class="setting-desc">Automatically detect when someone leaves actionable feedback in a monitored thread (powered by AI), then prompt the community to rate its quality. Off by default.</div>
        </div>
        <div class="toggle-wrap">
          <div class="tc-switch ${feedbackDetect ? "is-on" : ""}" id="feedback-detect-switch"><span class="tc-knob"></span></div>
          <input type="checkbox" id="setting-feedback-detection" ${feedbackDetect ? "checked" : ""} hidden>
        </div>
      </div>

      ${sectionTitle("Alerts &amp; Channels")}

      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Alert Channel</div>
          <div class="setting-desc">When a New Member or High Risk alert fires, also send a ping to this channel (paste channel ID). Leave blank to disable.</div>
        </div>
        <input type="text" class="text-input" id="setting-alert-ch" value="${escapeHtml(alertCh)}" placeholder="Channel ID" style="width:190px">
      </div>

      ${sectionTitle("Roles")}

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
  trackSw.addEventListener("click", (e) => {
    e.stopPropagation();
    trackIn.checked = !trackIn.checked;
    trackSw.classList.toggle("is-on", trackIn.checked);
    markDirty();
  });

  // Toggle: auto-delete
  const autoSw = container.querySelector("#autodel-switch");
  const autoIn = container.querySelector("#setting-auto-delete");
  autoSw.addEventListener("click", (e) => {
    e.stopPropagation();
    autoIn.checked = !autoIn.checked;
    autoSw.classList.toggle("is-on", autoIn.checked);
    markDirty();
  });

  // Toggle: feedback detection
  const feedSw = container.querySelector("#feedback-detect-switch");
  const feedIn = container.querySelector("#setting-feedback-detection");
  feedSw.addEventListener("click", (e) => {
    e.stopPropagation();
    feedIn.checked = !feedIn.checked;
    feedSw.classList.toggle("is-on", feedIn.checked);
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
      <p class="hint" style="margin-top:10px;">Right-click a channel in Discord &rarr; Copy Channel ID. Developer Mode must be enabled.</p>
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
      <p class="hint" style="margin-top:10px;">Right-click a user in Discord &rarr; Copy User ID. Developer Mode must be enabled.</p>
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
      <p class="hint" style="margin-top:10px;">Right-click a user in Discord &rarr; Copy User ID. Developer Mode must be enabled.</p>
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
  activeCardUid = null;

  container.innerHTML = `
    <p class="tab-desc">All members with reputation reviews. Click a card to read their reviews.</p>
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
    <div id="member-grid" class="member-grid"></div>
    <div id="review-drawer" class="review-drawer"></div>
  `;

  renderMemberGrid(members, sortMembers(members, memberSortMode));

  document.getElementById("member-search").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    const filtered = q
      ? members.filter(m =>
          (m.username || m.user_id).toLowerCase().includes(q) ||
          m.user_id.includes(q)
        )
      : members;
    closeDrawer();
    renderMemberGrid(members, sortMembers(filtered, memberSortMode));
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
      closeDrawer();
      renderMemberGrid(members, sortMembers(filtered, memberSortMode));
    });
  });
}

function starsDisplay(avg) {
  const full = Math.round(avg);
  const empty = 5 - full;
  return `<span class="stars-full">${"★".repeat(full)}</span><span class="stars-empty">${"★".repeat(empty)}</span>`;
}

function closeDrawer() {
  const drawer = document.getElementById("review-drawer");
  if (drawer) drawer.classList.remove("open");
  document.querySelectorAll(".member-card.active").forEach(c => c.classList.remove("active"));
  activeCardUid = null;
}

function renderMemberGrid(allMembers, filtered) {
  const grid = document.getElementById("member-grid");
  if (!grid) return;

  if (!filtered.length) {
    grid.innerHTML = '<p class="empty-state">No members match your search.</p>';
    return;
  }

  grid.innerHTML = filtered.map(m => `
    <div class="member-card" data-uid="${m.user_id}">
      <div class="card-av">
        ${m.avatar
          ? `<img class="card-avatar" src="${m.avatar}" alt="">`
          : `<div class="card-avatar-ph">${(m.username || m.user_id)[0].toUpperCase()}</div>`
        }
      </div>
      <div class="card-body">
        <div class="card-name" title="${escapeHtml(m.username || m.user_id)}">${escapeHtml(m.username || m.user_id)}</div>
        <div class="card-rating">
          <span class="card-stars">${starsDisplay(m.avg_rating)}</span>
          <span class="card-score">${m.avg_rating}/5</span>
        </div>
        <div class="card-count">${m.total_reviews} review${m.total_reviews !== 1 ? "s" : ""}</div>
      </div>
      ${(m.is_blacklisted || m.post_limit_hours) ? `
        <div class="card-badges">
          ${m.is_blacklisted ? `<span class="mbadge mbadge-bl">Blacklisted</span>` : ""}
          ${m.post_limit_hours ? `<span class="mbadge mbadge-lim">Limit: ${m.post_limit_hours}h</span>` : ""}
        </div>
      ` : ""}
      <div class="card-footer">
        <button class="card-btn">View Reviews</button>
      </div>
    </div>
  `).join("");

  grid.querySelectorAll(".member-card").forEach(card => {
    card.addEventListener("click", () => openDrawerFor(card, filtered));
  });
}

async function openDrawerFor(card, members) {
  const uid = card.dataset.uid;
  const drawer = document.getElementById("review-drawer");

  // Toggle closed if same card
  if (activeCardUid === uid) {
    closeDrawer();
    return;
  }

  // Deactivate old card, activate new
  document.querySelectorAll(".member-card.active").forEach(c => c.classList.remove("active"));
  card.classList.add("active");
  activeCardUid = uid;

  const member = members.find(m => m.user_id === uid);
  const name = member ? escapeHtml(member.username || member.user_id) : uid;

  drawer.innerHTML = `
    <div class="drawer-header">
      <div class="drawer-title">Reviews for <strong>${name}</strong></div>
      <button class="drawer-close" id="drawer-close-btn">&#x2715;</button>
    </div>
    <div class="drawer-reviews" id="drawer-reviews-inner">
      <p class="review-loading">Loading reviews…</p>
    </div>
  `;
  drawer.classList.add("open");

  // Scroll drawer into view
  drawer.scrollIntoView({ behavior: "smooth", block: "nearest" });

  document.getElementById("drawer-close-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    closeDrawer();
  });

  try {
    const reviews = await api.getUserReviews(currentGuildId, uid);
    const inner = document.getElementById("drawer-reviews-inner");
    if (!inner) return;

    if (!reviews || reviews.length === 0) {
      inner.innerHTML = '<p class="review-empty">No reviews on record.</p>';
      return;
    }

    inner.innerHTML = reviews.map(r => `
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
        ${r.proof_url && r.proof_url.startsWith('http') ? `
          <a class="review-proof" href="${escapeHtml(r.proof_url)}" target="_blank" rel="noopener noreferrer">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
            View Proof
          </a>` : ""}
      </div>
    `).join("");
  } catch {
    const inner = document.getElementById("drawer-reviews-inner");
    if (inner) inner.innerHTML = '<p class="review-empty" style="color:var(--danger)">Failed to load reviews.</p>';
  }
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
