// ─────────────────────────────────────────────────────
//  Jantleman Admin Dashboard — admin.js
// ─────────────────────────────────────────────────────

// ── Auth ──────────────────────────────────────────────
const token = getToken();
if (!token) { location.href = "/"; }

const payload = decodePayload(token);
if (!payload || !payload.is_admin) {
  clearToken();
  location.href = "/";
}

// ── API helper ────────────────────────────────────────
async function adminReq(path, opts = {}) {
  const res = await fetch(JANTLEMAN_API + path, {
    ...opts,
    headers: {
      "Authorization": "Bearer " + token,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401 || res.status === 403) {
    clearToken();
    location.href = "/";
  }
  return res;
}

// ── State ─────────────────────────────────────────────
let allGuilds = [];
let activeGuildId = null;
let activeView = "guilds";
let activeDetailTab = "overview";

// ── Starfield ─────────────────────────────────────────
(function () {
  const c = document.getElementById("starfield");
  if (!c) return;
  const ctx = c.getContext("2d");
  let W, H, stars;
  function resize() {
    W = c.width = window.innerWidth;
    H = c.height = window.innerHeight;
    stars = Array.from({ length: 90 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      r: Math.random() * 1.1 + 0.2,
      a: Math.random() * 0.45 + 0.05,
      dx: (Math.random() - 0.5) * 0.15,
      dy: (Math.random() - 0.5) * 0.15,
    }));
  }
  resize();
  window.addEventListener("resize", resize);
  (function draw() {
    ctx.clearRect(0, 0, W, H);
    for (const s of stars) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(220,180,100,${s.a})`;
      ctx.fill();
      s.x = (s.x + s.dx + W) % W;
      s.y = (s.y + s.dy + H) % H;
    }
    requestAnimationFrame(draw);
  })();
})();

// ── Utilities ─────────────────────────────────────────
function guildIcon(g, size = 32) {
  if (g.icon) {
    return `<img class="g-icon" style="width:${size}px;height:${size}px" src="${g.icon}" alt="">`;
  }
  const initials = g.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return `<div class="g-icon-placeholder" style="width:${size}px;height:${size}px;font-size:${Math.round(size*0.28)}px">${initials}</div>`;
}

function starsHtml(avg) {
  const full = Math.round(avg);
  return "⭐".repeat(full) + "☆".repeat(5 - full);
}

function relTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts.replace(" ", "T") + "Z");
  const diff = Date.now() - d.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatUptime(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function toast(msg, type = "success") {
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  el.style.cssText = `
    position:fixed;bottom:20px;right:20px;z-index:9999;
    background:var(--surface);border:1px solid var(--border);
    border-radius:var(--radius);padding:10px 16px;
    font-size:0.82rem;color:var(--text);
    box-shadow:0 4px 20px rgba(0,0,0,0.4);
    animation:fadeIn 0.15s ease;
  `;
  if (type === "error") el.style.borderColor = "var(--danger)";
  if (type === "success") el.style.borderColor = "var(--accent)";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ── Init ──────────────────────────────────────────────
async function init() {
  document.getElementById("logout-btn").addEventListener("click", () => {
    clearToken();
    location.href = "/";
  });

  // Nav buttons
  document.querySelectorAll(".admin-nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".admin-nav-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeView = btn.dataset.view;
      activeGuildId = null;
      document.querySelectorAll(".guild-item").forEach(i => i.classList.remove("active"));
      renderView();
    });
  });

  // Guild search
  document.getElementById("guild-search").addEventListener("input", e => {
    filterGuildList(e.target.value.trim().toLowerCase());
  });

  await loadGuilds();
  renderView();
}

// ── Guild List ────────────────────────────────────────
async function loadGuilds() {
  const el = document.getElementById("guild-list");
  el.innerHTML = `<div style="padding:16px 14px;color:var(--text-2);font-size:0.8rem;">Loading…</div>`;
  try {
    const res = await adminReq("/admin/guilds");
    const data = await res.json();
    allGuilds = data.guilds || [];
    renderGuildList(allGuilds);
  } catch (e) {
    el.innerHTML = `<div style="padding:16px 14px;color:var(--danger);font-size:0.8rem;">Failed to load servers.</div>`;
  }
}

function renderGuildList(guilds) {
  const el = document.getElementById("guild-list");
  if (!guilds.length) {
    el.innerHTML = `<div style="padding:16px 14px;color:var(--text-2);font-size:0.8rem;">No servers found.</div>`;
    return;
  }
  el.innerHTML = guilds.map(g => `
    <div class="guild-item ${g.id === activeGuildId ? 'active' : ''}" data-id="${g.id}">
      ${guildIcon(g)}
      <div class="g-info">
        <div class="g-name">${g.name}</div>
        <div class="g-meta">${g.member_count?.toLocaleString() ?? "?"} members</div>
      </div>
    </div>
  `).join("");

  el.querySelectorAll(".guild-item").forEach(item => {
    item.addEventListener("click", () => {
      activeGuildId = item.dataset.id;
      activeView = "guilds";
      activeDetailTab = "overview";
      document.querySelectorAll(".admin-nav-btn").forEach(b => {
        b.classList.toggle("active", b.dataset.view === "guilds");
      });
      document.querySelectorAll(".guild-item").forEach(i => i.classList.remove("active"));
      item.classList.add("active");
      renderView();
    });
  });
}

function filterGuildList(q) {
  const filtered = q ? allGuilds.filter(g => g.name.toLowerCase().includes(q)) : allGuilds;
  renderGuildList(filtered);
}

// ── View Router ───────────────────────────────────────
function renderView() {
  if (activeGuildId && activeView === "guilds") {
    renderGuildDetail(activeGuildId);
  } else if (activeView === "health") {
    renderHealthView();
  } else if (activeView === "lookup") {
    renderLookupView();
  } else if (activeView === "audit") {
    renderAuditView();
  } else {
    renderGuildsOverview();
  }
}

// ── Guilds Overview ───────────────────────────────────
function renderGuildsOverview() {
  document.getElementById("main-heading").textContent = "All Servers";
  const body = document.getElementById("admin-body");

  if (!allGuilds.length) {
    body.innerHTML = `<div class="empty-state"><span class="icon">🖥️</span><p>No servers found.</p></div>`;
    return;
  }

  body.innerHTML = `
    <div class="panel-grid" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr))">
      ${allGuilds.map(g => `
        <div class="stat-card" style="cursor:pointer" data-gid="${g.id}">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            ${guildIcon(g, 36)}
            <div>
              <div style="font-weight:600;font-size:0.85rem">${g.name}</div>
              <div style="font-size:0.68rem;color:var(--text-2)">${g.member_count?.toLocaleString() ?? "?"} members</div>
            </div>
          </div>
          <div style="display:flex;gap:12px;font-size:0.75rem;color:var(--text-2)">
            <span>📡 ${g.monitored_channels} channels</span>
            <span>👥 ${g.tracked_users} users</span>
          </div>
        </div>
      `).join("")}
    </div>
  `;

  body.querySelectorAll("[data-gid]").forEach(el => {
    el.addEventListener("click", () => {
      activeGuildId = el.dataset.gid;
      activeDetailTab = "overview";
      const item = document.querySelector(`.guild-item[data-id="${activeGuildId}"]`);
      document.querySelectorAll(".guild-item").forEach(i => i.classList.remove("active"));
      if (item) item.classList.add("active");
      renderView();
    });
  });
}

// ── Guild Detail ──────────────────────────────────────
async function renderGuildDetail(guildId) {
  const guild = allGuilds.find(g => g.id === guildId);
  if (!guild) return;

  document.getElementById("main-heading").textContent = guild.name;
  const body = document.getElementById("admin-body");

  body.innerHTML = `
    <div class="detail-guild-header">
      ${guildIcon(guild, 48)}
      <div>
        <h2>${guild.name}</h2>
        <div class="meta">ID: <span class="mono">${guild.id}</span> &nbsp;·&nbsp; ${guild.member_count?.toLocaleString() ?? "?"} members</div>
      </div>
    </div>
    <div class="detail-tabs">
      <button class="detail-tab-btn ${activeDetailTab==='overview'?'active':''}" data-tab="overview">Overview</button>
      <button class="detail-tab-btn ${activeDetailTab==='members'?'active':''}" data-tab="members">Members</button>
      <button class="detail-tab-btn ${activeDetailTab==='channels'?'active':''}" data-tab="channels">Channels</button>
      <button class="detail-tab-btn ${activeDetailTab==='blacklist'?'active':''}" data-tab="blacklist">Blacklist</button>
      <button class="detail-tab-btn ${activeDetailTab==='limits'?'active':''}" data-tab="limits">Limits</button>
      <button class="detail-tab-btn ${activeDetailTab==='danger'?'active':''}" data-tab="danger">⚠️ Actions</button>
    </div>
    <div id="detail-panel-content"></div>
  `;

  body.querySelectorAll(".detail-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      body.querySelectorAll(".detail-tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeDetailTab = btn.dataset.tab;
      loadDetailPanel(guildId, activeDetailTab);
    });
  });

  loadDetailPanel(guildId, activeDetailTab);
}

async function loadDetailPanel(guildId, tab) {
  const panel = document.getElementById("detail-panel-content");
  panel.innerHTML = `<div style="color:var(--text-2);font-size:0.85rem;padding:20px 0">Loading…</div>`;

  try {
    if (tab === "overview") await renderDetailOverview(guildId, panel);
    else if (tab === "members") await renderDetailMembers(guildId, panel);
    else if (tab === "channels") await renderDetailChannels(guildId, panel);
    else if (tab === "blacklist") await renderDetailBlacklist(guildId, panel);
    else if (tab === "limits") await renderDetailLimits(guildId, panel);
    else if (tab === "danger") renderDetailDanger(guildId, panel);
  } catch (e) {
    panel.innerHTML = `<div style="color:var(--danger);font-size:0.85rem">Failed to load data.</div>`;
  }
}

async function renderDetailOverview(guildId, panel) {
  const [settRes, chRes] = await Promise.all([
    adminReq(`/api/settings/${guildId}`),
    adminReq(`/api/channels/${guildId}`),
  ]);
  const settings = await settRes.json();
  const channels = await chRes.json();
  const guild = allGuilds.find(g => g.id === guildId);

  panel.innerHTML = `
    <div class="panel-grid">
      <div class="stat-card">
        <div class="stat-card-label">Members</div>
        <div class="stat-card-value">${guild?.member_count?.toLocaleString() ?? "—"}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Monitored Channels</div>
        <div class="stat-card-value accent">${channels.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Identity Tracking</div>
        <div class="stat-card-value ${settings.track_identity ? 'good' : 'warn'}">${settings.track_identity ? "On" : "Off"}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Proof Requirement</div>
        <div class="stat-card-value" style="font-size:1rem;text-transform:capitalize">${settings.proof_req}</div>
      </div>
    </div>

    <div class="sec-title">Settings</div>
    <div class="card">
      <div class="card-body">
        <div class="form-row" style="margin-bottom:12px">
          <div class="form-group">
            <label>Identity Tracking</label>
            <select id="ov-track" class="form-input" style="width:auto">
              <option value="1" ${settings.track_identity ? "selected" : ""}>Enabled</option>
              <option value="0" ${!settings.track_identity ? "selected" : ""}>Disabled</option>
            </select>
          </div>
          <div class="form-group">
            <label>Proof Requirement</label>
            <select id="ov-proof" class="form-input" style="width:auto">
              <option value="required" ${settings.proof_req==="required"?"selected":""}>Required</option>
              <option value="optional" ${settings.proof_req==="optional"?"selected":""}>Optional</option>
              <option value="off" ${settings.proof_req==="off"?"selected":""}>Off</option>
            </select>
          </div>
          <button id="ov-save" class="btn-primary" style="align-self:flex-end">Save Settings</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("ov-save").addEventListener("click", async () => {
    const btn = document.getElementById("ov-save");
    btn.disabled = true;
    btn.textContent = "Saving…";
    const res = await adminReq(`/api/settings/${guildId}`, {
      method: "POST",
      body: JSON.stringify({
        track_identity: document.getElementById("ov-track").value === "1",
        proof_req: document.getElementById("ov-proof").value,
      }),
    });
    btn.disabled = false;
    btn.textContent = "Save Settings";
    if (res.ok) toast("Settings saved.");
    else toast("Failed to save settings.", "error");
  });
}

async function renderDetailMembers(guildId, panel) {
  const res = await adminReq(`/admin/guild/${guildId}/users`);
  const data = await res.json();
  const users = data.users || [];

  if (!users.length) {
    panel.innerHTML = `<div class="empty-state"><span class="icon">👥</span><p>No tracked members yet.</p></div>`;
    return;
  }

  panel.innerHTML = `
    <div class="data-table-wrap">
      <table class="data-table" id="members-table">
        <thead><tr>
          <th>User</th><th>Reviews</th><th>Avg Rating</th><th>Blacklisted</th><th>Post Limit</th><th></th>
        </tr></thead>
        <tbody>
          ${users.map(u => `
            <tr data-uid="${u.user_id}" class="member-row">
              <td>
                <div class="user-cell">
                  ${u.avatar ? `<img class="u-avatar" src="${u.avatar}" alt="">` : `<div class="u-avatar-ph">${(u.username||"?")[0]}</div>`}
                  <div>
                    <div class="u-name">${u.username || u.user_id}</div>
                    <div class="u-id">${u.user_id}</div>
                  </div>
                </div>
              </td>
              <td>${u.total_reviews}</td>
              <td><span class="stars">${starsHtml(u.avg_rating)}</span> ${u.avg_rating}</td>
              <td>${u.is_blacklisted ? '<span style="color:var(--danger)">Yes</span>' : '<span style="color:var(--success)">No</span>'}</td>
              <td>${u.post_limit_hours ? u.post_limit_hours + "h" : "—"}</td>
              <td><button class="btn-primary btn-xs review-expand-btn">Reviews</button></td>
            </tr>
            <tr class="review-expand-row" data-for="${u.user_id}" style="display:none">
              <td colspan="6" style="padding:0;background:var(--surface-2)">
                <div class="review-expand-inner" style="padding:16px 20px"></div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  panel.querySelectorAll(".review-expand-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const memberRow = btn.closest(".member-row");
      const uid = memberRow.dataset.uid;
      const expandRow = panel.querySelector(`.review-expand-row[data-for="${uid}"]`);
      const inner = expandRow.querySelector(".review-expand-inner");

      if (expandRow.style.display !== "none") {
        expandRow.style.display = "none";
        btn.textContent = "Reviews";
        return;
      }

      btn.textContent = "Loading…";
      btn.disabled = true;
      expandRow.style.display = "";
      inner.innerHTML = `<span style="color:var(--text-2);font-size:0.82rem">Loading reviews…</span>`;

      const rRes = await adminReq(`/api/reviews/${guildId}/${uid}`);
      const reviews = await rRes.json();
      btn.textContent = "Hide";
      btn.disabled = false;

      if (!reviews.length) {
        inner.innerHTML = `<span style="color:var(--text-3);font-size:0.82rem">No reviews in this server.</span>`;
        return;
      }

      renderAdminReviewCards(reviews, inner);
    });
  });
}

function wireAdminReviewCards(container) {
  container.querySelectorAll(".admin-review-card").forEach(card => {
    const rid = parseInt(card.dataset.rid);

    card.querySelector(".arv-save").addEventListener("click", async () => {
      const btn = card.querySelector(".arv-save");
      const stars = parseInt(card.querySelector(".arv-stars").value);
      const comment = card.querySelector(".arv-comment").value.trim();
      btn.disabled = true;
      btn.textContent = "Saving…";
      const res = await adminReq(`/admin/reviews/${rid}`, {
        method: "PATCH",
        body: JSON.stringify({ stars, comment }),
      });
      btn.disabled = false;
      btn.textContent = "Save";
      if (res.ok) {
        card.querySelector(".arv-stars-display").textContent = starsHtml(stars);
        toast("Review updated.");
      } else {
        toast("Failed to save.", "error");
      }
    });

    card.querySelector(".arv-delete").addEventListener("click", async () => {
      if (!confirm("Delete this review? This cannot be undone.")) return;
      const btn = card.querySelector(".arv-delete");
      btn.disabled = true;
      const res = await adminReq(`/admin/reviews/${rid}`, { method: "DELETE" });
      if (res.ok) {
        card.remove();
        toast("Review deleted.");
      } else {
        btn.disabled = false;
        toast("Failed to delete.", "error");
      }
    });
  });
}

function renderAdminReviewCards(reviews, container) {
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px">
      ${reviews.map(r => adminReviewCardHtml(r)).join("")}
    </div>
  `;
  wireAdminReviewCards(container);
}

function adminReviewCardHtml(r) {
  const proofHtml = r.proof_url && r.proof_url.startsWith("http")
    ? `<a href="${r.proof_url}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:5px;font-size:0.75rem;font-weight:600;color:var(--gold-bright);text-decoration:none;background:var(--gold-dim);border:1px solid var(--gold-line);border-radius:var(--radius-sm);padding:4px 10px;margin-top:4px">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
        View Proof
      </a>`
    : `<span style="font-size:0.72rem;color:var(--text-3)">No proof</span>`;

  return `
    <div class="admin-review-card" data-rid="${r.review_id}" style="
      background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--amber);
      border-radius:var(--radius);padding:12px 14px;display:flex;flex-direction:column;gap:8px;
      position:relative;overflow:hidden;
    ">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span class="arv-stars-display" style="color:var(--amber);font-size:0.85rem">${starsHtml(r.stars)}</span>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
          <select class="arv-stars" style="background:var(--surface-2);border:1px solid var(--border-2);color:var(--text);font-family:var(--font-ui);font-size:0.78rem;padding:3px 6px;border-radius:var(--radius-sm);cursor:pointer">
            ${[1,2,3,4,5].map(n => `<option value="${n}" ${r.stars===n?"selected":""}>${n}★</option>`).join("")}
          </select>
        </div>
      </div>
      <div style="font-size:0.72rem;color:var(--text-3)">
        From <span style="color:var(--text-2)">${r.author_name}</span> · ${relTime(r.timestamp)}
      </div>
      <textarea class="arv-comment" rows="2" style="
        width:100%;background:var(--surface-2);border:1px solid var(--border-2);color:var(--text);
        font-family:var(--font-ui);font-size:0.82rem;padding:6px 8px;border-radius:var(--radius-sm);
        resize:vertical;outline:none;
      ">${r.comment || ""}</textarea>
      ${proofHtml}
      <div style="display:flex;gap:6px;margin-top:2px">
        <button class="arv-save btn-primary btn-xs" style="flex:1">Save</button>
        <button class="arv-delete btn-danger btn-xs">Delete</button>
      </div>
    </div>
  `;
}

async function renderDetailChannels(guildId, panel) {
  const res = await adminReq(`/api/channels/${guildId}`);
  const channels = await res.json();

  panel.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><span class="card-title">Add Monitored Channel</span></div>
      <div class="card-body">
        <div class="form-row">
          <div class="form-group">
            <label>Channel ID</label>
            <input id="add-ch-id" class="form-input" placeholder="e.g. 1234567890">
          </div>
          <div class="form-group">
            <label>Name (optional)</label>
            <input id="add-ch-name" class="form-input" placeholder="e.g. #selling">
          </div>
          <button id="add-ch-btn" class="btn-primary" style="align-self:flex-end">Add Channel</button>
        </div>
      </div>
    </div>
    <div class="sec-title">Monitored Channels (${channels.length})</div>
    <div class="data-table-wrap">
      <table class="data-table">
        <thead><tr><th>Channel</th><th>ID</th><th></th></tr></thead>
        <tbody id="ch-tbody">
          ${channels.length ? channels.map(ch => `
            <tr data-chid="${ch.channel_id}">
              <td>${ch.channel_name}</td>
              <td class="mono">${ch.channel_id}</td>
              <td><button class="btn-danger btn-xs del-ch">Remove</button></td>
            </tr>
          `).join("") : `<tr class="empty-row"><td colspan="3">No channels monitored yet.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  panel.querySelectorAll(".del-ch").forEach(btn => {
    btn.addEventListener("click", async () => {
      const row = btn.closest("tr");
      const chid = row.dataset.chid;
      btn.disabled = true;
      const res = await adminReq(`/api/channels/${guildId}/${chid}`, { method: "DELETE" });
      if (res.ok) { row.remove(); toast("Channel removed."); }
      else { btn.disabled = false; toast("Failed to remove channel.", "error"); }
    });
  });

  document.getElementById("add-ch-btn").addEventListener("click", async () => {
    const id = document.getElementById("add-ch-id").value.trim();
    const name = document.getElementById("add-ch-name").value.trim();
    if (!id) return;
    const btn = document.getElementById("add-ch-btn");
    btn.disabled = true;
    const res = await adminReq(`/api/channels/${guildId}`, {
      method: "POST",
      body: JSON.stringify({ channel_id: id, channel_name: name || id }),
    });
    btn.disabled = false;
    if (res.ok) {
      document.getElementById("add-ch-id").value = "";
      document.getElementById("add-ch-name").value = "";
      const tbody = document.getElementById("ch-tbody");
      const existing = tbody.querySelector(".empty-row");
      if (existing) existing.remove();
      const row = document.createElement("tr");
      row.dataset.chid = id;
      row.innerHTML = `<td>${name || id}</td><td class="mono">${id}</td><td><button class="btn-danger btn-xs del-ch">Remove</button></td>`;
      row.querySelector(".del-ch").addEventListener("click", async () => {
        row.querySelector(".del-ch").disabled = true;
        const r = await adminReq(`/api/channels/${guildId}/${id}`, { method: "DELETE" });
        if (r.ok) { row.remove(); toast("Channel removed."); }
        else { row.querySelector(".del-ch").disabled = false; toast("Failed.", "error"); }
      });
      tbody.appendChild(row);
      toast("Channel added.");
    } else {
      toast("Failed to add channel.", "error");
    }
  });
}

async function renderDetailBlacklist(guildId, panel) {
  const res = await adminReq(`/api/blacklist/${guildId}`);
  const users = await res.json();

  panel.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><span class="card-title">Add to Blacklist</span></div>
      <div class="card-body">
        <div class="form-row">
          <div class="form-group">
            <label>User ID</label>
            <input id="add-bl-id" class="form-input" placeholder="Discord User ID">
          </div>
          <button id="add-bl-btn" class="btn-danger" style="align-self:flex-end">Blacklist</button>
        </div>
      </div>
    </div>
    <div class="sec-title">Blacklisted Users (${users.length})</div>
    <div class="data-table-wrap">
      <table class="data-table">
        <thead><tr><th>User</th><th>ID</th><th></th></tr></thead>
        <tbody id="bl-tbody">
          ${users.length ? users.map(u => `
            <tr data-uid="${u.user_id}">
              <td>${u.username}</td>
              <td class="mono">${u.user_id}</td>
              <td><button class="btn-primary btn-xs unbl">Unblacklist</button></td>
            </tr>
          `).join("") : `<tr class="empty-row"><td colspan="3">No blacklisted users.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  panel.querySelectorAll(".unbl").forEach(btn => {
    btn.addEventListener("click", async () => {
      const row = btn.closest("tr");
      const uid = row.dataset.uid;
      btn.disabled = true;
      const res = await adminReq(`/api/blacklist/${guildId}/${uid}`, { method: "DELETE" });
      if (res.ok) { row.remove(); toast("User unblacklisted."); }
      else { btn.disabled = false; toast("Failed.", "error"); }
    });
  });

  document.getElementById("add-bl-btn").addEventListener("click", async () => {
    const id = document.getElementById("add-bl-id").value.trim();
    if (!id) return;
    const btn = document.getElementById("add-bl-btn");
    btn.disabled = true;
    const res = await adminReq(`/api/blacklist/${guildId}`, {
      method: "POST",
      body: JSON.stringify({ user_id: id }),
    });
    btn.disabled = false;
    if (res.ok) {
      document.getElementById("add-bl-id").value = "";
      const tbody = document.getElementById("bl-tbody");
      const existing = tbody.querySelector(".empty-row");
      if (existing) existing.remove();
      const row = document.createElement("tr");
      row.dataset.uid = id;
      row.innerHTML = `<td>${id}</td><td class="mono">${id}</td><td><button class="btn-primary btn-xs unbl">Unblacklist</button></td>`;
      row.querySelector(".unbl").addEventListener("click", async () => {
        row.querySelector(".unbl").disabled = true;
        const r = await adminReq(`/api/blacklist/${guildId}/${id}`, { method: "DELETE" });
        if (r.ok) { row.remove(); toast("User unblacklisted."); }
        else { row.querySelector(".unbl").disabled = false; toast("Failed.", "error"); }
      });
      tbody.appendChild(row);
      toast("User blacklisted.");
    } else {
      toast("Failed to blacklist user.", "error");
    }
  });
}

async function renderDetailLimits(guildId, panel) {
  const res = await adminReq(`/api/limits/${guildId}`);
  const users = await res.json();

  panel.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><span class="card-title">Set Posting Limit</span></div>
      <div class="card-body">
        <div class="form-row">
          <div class="form-group">
            <label>User ID</label>
            <input id="add-lim-id" class="form-input" placeholder="Discord User ID">
          </div>
          <div class="form-group">
            <label>Hours</label>
            <input id="add-lim-h" class="form-input" type="number" min="1" value="24" style="width:80px">
          </div>
          <button id="add-lim-btn" class="btn-primary" style="align-self:flex-end">Set Limit</button>
        </div>
      </div>
    </div>
    <div class="sec-title">Active Limits (${users.length})</div>
    <div class="data-table-wrap">
      <table class="data-table">
        <thead><tr><th>User</th><th>ID</th><th>Limit</th><th></th></tr></thead>
        <tbody id="lim-tbody">
          ${users.length ? users.map(u => `
            <tr data-uid="${u.user_id}">
              <td>${u.username}</td>
              <td class="mono">${u.user_id}</td>
              <td>${u.post_limit_hours}h</td>
              <td><button class="btn-danger btn-xs del-lim">Remove</button></td>
            </tr>
          `).join("") : `<tr class="empty-row"><td colspan="4">No posting limits set.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  panel.querySelectorAll(".del-lim").forEach(btn => {
    btn.addEventListener("click", async () => {
      const row = btn.closest("tr");
      const uid = row.dataset.uid;
      btn.disabled = true;
      const res = await adminReq(`/api/limits/${guildId}/${uid}`, { method: "DELETE" });
      if (res.ok) { row.remove(); toast("Limit removed."); }
      else { btn.disabled = false; toast("Failed.", "error"); }
    });
  });

  document.getElementById("add-lim-btn").addEventListener("click", async () => {
    const id = document.getElementById("add-lim-id").value.trim();
    const hours = document.getElementById("add-lim-h").value;
    if (!id || !hours) return;
    const btn = document.getElementById("add-lim-btn");
    btn.disabled = true;
    const res = await adminReq(`/api/limits/${guildId}`, {
      method: "POST",
      body: JSON.stringify({ user_id: id, hours: parseInt(hours) }),
    });
    btn.disabled = false;
    if (res.ok) {
      document.getElementById("add-lim-id").value = "";
      const tbody = document.getElementById("lim-tbody");
      const existing = tbody.querySelector(".empty-row");
      if (existing) existing.remove();
      const row = document.createElement("tr");
      row.dataset.uid = id;
      row.innerHTML = `<td>${id}</td><td class="mono">${id}</td><td>${hours}h</td><td><button class="btn-danger btn-xs del-lim">Remove</button></td>`;
      row.querySelector(".del-lim").addEventListener("click", async () => {
        row.querySelector(".del-lim").disabled = true;
        const r = await adminReq(`/api/limits/${guildId}/${id}`, { method: "DELETE" });
        if (r.ok) { row.remove(); toast("Limit removed."); }
        else { row.querySelector(".del-lim").disabled = false; toast("Failed.", "error"); }
      });
      tbody.appendChild(row);
      toast("Posting limit set.");
    } else {
      toast("Failed to set limit.", "error");
    }
  });
}

function renderDetailDanger(guildId, panel) {
  const guild = allGuilds.find(g => g.id === guildId);
  panel.innerHTML = `
    <div class="card" style="border-color:rgba(248,113,113,0.25)">
      <div class="card-header">
        <span class="card-title" style="color:var(--danger)">Danger Zone</span>
      </div>
      <div class="card-body">
        <p style="font-size:0.85rem;color:var(--text-2);margin-bottom:14px">
          These actions are permanent and cannot be undone.
        </p>
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border)">
          <div>
            <div style="font-weight:600;font-size:0.88rem">Leave Server</div>
            <div style="font-size:0.78rem;color:var(--text-2)">Remove the bot from <strong>${guild?.name}</strong>.</div>
          </div>
          <button id="leave-guild-btn" class="btn-danger">Leave Server</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("leave-guild-btn").addEventListener("click", async () => {
    if (!confirm(`Are you sure you want to remove the bot from "${guild?.name}"? This cannot be undone.`)) return;
    const btn = document.getElementById("leave-guild-btn");
    btn.disabled = true;
    btn.textContent = "Leaving…";
    const res = await adminReq(`/admin/guild/${guildId}/leave`, { method: "POST" });
    if (res.ok) {
      toast(`Bot left ${guild?.name}.`);
      allGuilds = allGuilds.filter(g => g.id !== guildId);
      activeGuildId = null;
      renderGuildList(allGuilds);
      renderGuildsOverview();
    } else {
      btn.disabled = false;
      btn.textContent = "Leave Server";
      toast("Failed to leave server.", "error");
    }
  });
}

// ── Health & Stats View ───────────────────────────────
async function renderHealthView() {
  document.getElementById("main-heading").textContent = "Health & Stats";
  const body = document.getElementById("admin-body");
  body.innerHTML = `<div style="color:var(--text-2);font-size:0.85rem">Loading…</div>`;

  const res = await adminReq("/admin/stats");
  const s = await res.json();

  body.innerHTML = `
    <div class="panel-grid">
      <div class="stat-card">
        <div class="stat-card-label">Uptime</div>
        <div class="stat-card-value good">${formatUptime(s.uptime_seconds)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Servers</div>
        <div class="stat-card-value accent">${s.guild_count}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Latency</div>
        <div class="stat-card-value ${s.latency_ms < 100 ? 'good' : s.latency_ms < 300 ? 'warn' : ''}">${s.latency_ms}ms</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Tracked Users</div>
        <div class="stat-card-value">${s.tracked_users.toLocaleString()}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Total Reviews</div>
        <div class="stat-card-value">${s.total_reviews.toLocaleString()}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Blacklisted</div>
        <div class="stat-card-value ${s.blacklisted_users > 0 ? 'warn' : ''}">${s.blacklisted_users}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Watchlist Entries</div>
        <div class="stat-card-value">${s.watchlist_entries}</div>
      </div>
    </div>
  `;
}

// ── User Lookup View ──────────────────────────────────
function renderLookupView() {
  document.getElementById("main-heading").textContent = "User Lookup";
  const body = document.getElementById("admin-body");
  body.innerHTML = `
    <div class="card" style="margin-bottom:24px">
      <div class="card-header"><span class="card-title">Search by Discord User ID</span></div>
      <div class="card-body">
        <div class="form-row">
          <div class="form-group">
            <label>User ID</label>
            <input id="lookup-input" class="form-input" placeholder="e.g. 123456789012345678" style="width:260px">
          </div>
          <button id="lookup-btn" class="btn-primary" style="align-self:flex-end">Look Up</button>
        </div>
      </div>
    </div>
    <div id="lookup-result"></div>
  `;

  const doLookup = async () => {
    const uid = document.getElementById("lookup-input").value.trim();
    if (!uid) return;
    const btn = document.getElementById("lookup-btn");
    btn.disabled = true;
    btn.textContent = "Looking up…";
    const res = await adminReq(`/admin/user/${uid}`);
    btn.disabled = false;
    btn.textContent = "Look Up";

    const result = document.getElementById("lookup-result");
    if (!res.ok) {
      result.innerHTML = `<div style="color:var(--danger);font-size:0.85rem">User not found or error.</div>`;
      return;
    }

    const data = await res.json();
    const u = data.user;
    const st = data.stats;
    const reviews = data.reviews || [];
    const nameHistory = data.name_history || [];

    result.innerHTML = `
      <div class="lookup-user-header">
        ${u.avatar ? `<img class="lookup-avatar" src="${u.avatar}" alt="">` : `<div class="u-avatar-ph" style="width:52px;height:52px;font-size:1rem">${(u.name||"?")[0]}</div>`}
        <div>
          <div class="lookup-name">${u.display_name || u.name}</div>
          <div class="lookup-id">${u.id}</div>
        </div>
        <div style="margin-left:auto;display:flex;gap:10px">
          ${st.is_blacklisted
            ? `<span style="background:var(--danger-dim);border:1px solid rgba(248,113,113,.25);color:var(--danger);border-radius:var(--radius);padding:4px 10px;font-size:0.78rem;font-weight:600">Blacklisted</span>`
            : ``}
          ${st.post_limit_hours
            ? `<span style="background:var(--accent-dim);border:1px solid var(--accent-line);color:var(--accent-bright);border-radius:var(--radius);padding:4px 10px;font-size:0.78rem;font-weight:600">Limit: ${st.post_limit_hours}h</span>`
            : ``}
        </div>
      </div>

      <div class="panel-grid">
        <div class="stat-card">
          <div class="stat-card-label">Reviews</div>
          <div class="stat-card-value">${st.total_reviews}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">Avg Rating</div>
          <div class="stat-card-value accent">${st.avg_rating > 0 ? st.avg_rating : "—"}</div>
        </div>
      </div>

      ${reviews.length ? `
        <div class="sec-title">Recent Reviews (${reviews.length})</div>
        <div id="lookup-reviews-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px;margin-bottom:20px">
          ${reviews.map(r => adminReviewCardHtml(r)).join("")}
        </div>
      ` : ""}

      ${nameHistory.length ? `
        <div class="sec-title">Name History (${nameHistory.length})</div>
        <div class="data-table-wrap">
          <table class="data-table">
            <thead><tr><th>Previous Name</th><th>New Name</th><th>Date</th></tr></thead>
            <tbody>
              ${nameHistory.map(n => `
                <tr>
                  <td style="color:var(--text-2)">${n.old_name}</td>
                  <td>${n.new_name}</td>
                  <td style="color:var(--text-2)">${relTime(n.timestamp)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      ` : ""}
    `;
  };

    // Wire up review cards in the lookup result
    const grid = document.getElementById("lookup-reviews-grid");
    if (grid) wireAdminReviewCards(grid);
  };

  document.getElementById("lookup-btn").addEventListener("click", doLookup);
  document.getElementById("lookup-input").addEventListener("keydown", e => {
    if (e.key === "Enter") doLookup();
  });
}

// ── Audit Log View ────────────────────────────────────
async function renderAuditView() {
  document.getElementById("main-heading").textContent = "Audit Log";
  const body = document.getElementById("admin-body");
  body.innerHTML = `<div style="color:var(--text-2);font-size:0.85rem">Loading…</div>`;

  const res = await adminReq("/admin/audit-log?limit=200");
  const data = await res.json();
  const entries = data.entries || [];

  if (!entries.length) {
    body.innerHTML = `<div class="empty-state"><span class="icon">📋</span><p>No audit log entries yet.</p></div>`;
    return;
  }

  body.innerHTML = `
    <div class="data-table-wrap">
      <table class="data-table">
        <thead><tr><th>Admin</th><th>Action</th><th>Server</th><th>Target</th><th>Details</th><th>Time</th></tr></thead>
        <tbody>
          ${entries.map(e => {
            const guild = allGuilds.find(g => g.id === e.guild_id);
            return `
              <tr>
                <td class="mono">${e.admin_name}</td>
                <td><span class="audit-action">${e.action}</span></td>
                <td>${guild ? guild.name : (e.guild_id || "—")}</td>
                <td class="mono">${e.target_id || "—"}</td>
                <td style="color:var(--text-2)">${e.details || "—"}</td>
                <td style="color:var(--text-2)">${relTime(e.timestamp)}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

// ── Boot ──────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", init);
