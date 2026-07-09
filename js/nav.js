import { getSession, onAuthChange, signOut } from "./auth.js";
import { LEAGUE_NAME } from "./config.js";
import { supabase, isConfigured } from "./supabaseClient.js";

const TABS = [
  { href: "index.html", label: "Home" },
  { href: "standings.html", label: "Standings" },
  { href: "players.html", label: "Players" },
  { href: "champions.html", label: "Champions" },
  { href: "calendar.html", label: "Calendar" },
  { href: "predictions.html", label: "Predictions" },
  { href: "brackets.html", label: "Brackets" },
  { href: "records.html", label: "Records" },
  { href: "news.html", label: "News" },
  { href: "rules.html", label: "Rules" },
  { href: "log-game.html", label: "Log Game" },
  { href: "manage.html", label: "Manage", adminOnly: true },
];

function currentPage() {
  const path = location.pathname.split("/").pop() || "index.html";
  return path;
}

// Supabase's onAuthStateChange fires once immediately upon subscribing (in
// addition to on future changes) - so this must only ever be subscribed
// once per page load. Subscribing again inside renderNav() itself would
// mean every render adds another listener, and since each one fires right
// away and calls renderNav() again, that becomes a runaway loop that
// freezes the tab. A module-level flag keeps it to a single subscription.
let authListenerRegistered = false;

const THEME_KEY = "tfm2_theme";

function applyTheme(theme) {
  if (theme === "light") document.documentElement.setAttribute("data-theme", "light");
  else document.documentElement.removeAttribute("data-theme");
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // localStorage may be unavailable (e.g. private browsing) - theme just
    // won't persist across page loads, which is a harmless degradation.
  }
}

function currentTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export async function renderNav(activeHref) {
  const root = document.getElementById("nav-root");
  if (!root) return;

  const page = activeHref || currentPage();
  const session = await getSession();

  const tabsHtml = TABS.filter((t) => !t.adminOnly || session)
    .map((t) => {
      const isActive = t.href === page;
      return `<a href="${t.href}" class="nav-tab${isActive ? " active" : ""}">${t.label}</a>`;
    })
    .join("");

  root.innerHTML = `
    <header class="site-header">
      <div class="header-inner">
        <a href="index.html" class="brand">
          <span class="brand-mark">TFM2</span>
          <span class="brand-name">${LEAGUE_NAME}</span>
        </a>
        <nav class="site-nav">${tabsHtml}</nav>
        <div class="nav-search" id="nav-search">
          <input type="search" id="global-search-input" class="search-input" placeholder="Search..." autocomplete="off" aria-label="Search teams, players, champions" />
          <div class="search-results" id="global-search-results"></div>
        </div>
        <div class="auth-area" id="auth-area"></div>
        <button class="btn btn-ghost btn-sm theme-toggle" id="theme-toggle-btn" aria-label="Toggle light/dark theme"></button>
        <button class="nav-toggle" id="nav-toggle" aria-label="Toggle menu">&#9776;</button>
      </div>
    </header>
  `;

  const authArea = document.getElementById("auth-area");
  if (session) {
    authArea.innerHTML = `
      <span class="admin-pill">Admin: ${session.user.email}</span>
      <button class="btn btn-ghost btn-sm" id="logout-btn">Log out</button>
    `;
    document.getElementById("logout-btn").addEventListener("click", async () => {
      await signOut();
      location.href = "index.html";
    });
  } else {
    authArea.innerHTML = `<a href="login.html" class="btn btn-ghost btn-sm">Admin Login</a>`;
  }

  document.getElementById("nav-toggle").addEventListener("click", () => {
    document.querySelector(".site-nav").classList.toggle("open");
  });

  const themeBtn = document.getElementById("theme-toggle-btn");
  const setThemeBtnLabel = () => {
    themeBtn.textContent = currentTheme() === "light" ? "\u{1F319}" : "\u{2600}\u{FE0F}";
  };
  setThemeBtnLabel();
  themeBtn.addEventListener("click", () => {
    applyTheme(currentTheme() === "light" ? "dark" : "light");
    setThemeBtnLabel();
  });

  if (!isConfigured()) {
    const banner = document.createElement("div");
    banner.className = "config-banner";
    banner.innerHTML = `Supabase is not configured yet. Edit <code>js/config.js</code> with your project URL and anon key, then run <code>sql/schema.sql</code> in the Supabase SQL editor. See <code>SETUP.md</code> for step-by-step instructions.`;
    root.after(banner);
  }

  if (!authListenerRegistered) {
    authListenerRegistered = true;
    onAuthChange(() => renderNav(page));
  }

  setupSearch();
}

// --- Global search --------------------------------------------------------
// Lazily fetches a small in-memory index of teams/players/champions (once
// per page load, shared across renderNav() re-renders triggered by auth
// changes) and filters it client-side as the visitor types. The league's
// data is small (tens of teams/players/champions), so a full client-side
// scan is simpler and fast enough compared to hitting Supabase per
// keystroke.
let searchIndexPromise = null;

function loadSearchIndex() {
  if (!searchIndexPromise) {
    searchIndexPromise = Promise.all([
      supabase.from("teams").select("id, name, short_name"),
      supabase.from("players").select("id, name, team_id"),
      supabase.from("champions").select("id, name, icon_url"),
    ]).then(([teamsRes, playersRes, champsRes]) => ({
      teams: teamsRes.data || [],
      players: playersRes.data || [],
      champions: champsRes.data || [],
    }));
  }
  return searchIndexPromise;
}

function setupSearch() {
  const input = document.getElementById("global-search-input");
  const results = document.getElementById("global-search-results");
  const wrap = document.getElementById("nav-search");
  if (!input || !results || !wrap) return;

  let debounceTimer = null;
  let activeIndex = -1;
  let currentItems = []; // flat list of { href, label } currently rendered, for keyboard nav

  function closeResults() {
    results.classList.remove("open");
    activeIndex = -1;
  }

  function runSearch(query) {
    const q = query.trim().toLowerCase();
    if (!q) {
      results.innerHTML = "";
      closeResults();
      return;
    }
    loadSearchIndex().then((index) => {
      const teamMatches = index.teams.filter((t) => t.name.toLowerCase().includes(q) || (t.short_name || "").toLowerCase().includes(q)).slice(0, 6);
      const playerMatches = index.players.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 6);
      const champMatches = index.champions.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 6);

      currentItems = [
        ...teamMatches.map((t) => ({ href: `team.html?id=${t.id}`, label: t.name, group: "Teams" })),
        ...playerMatches.map((p) => ({ href: `player.html?id=${p.id}`, label: p.name, group: "Players" })),
        ...champMatches.map((c) => ({ href: `champions.html?highlight=${c.id}`, label: c.name, group: "Champions", icon: c.icon_url })),
      ];
      activeIndex = -1;

      if (currentItems.length === 0) {
        results.innerHTML = `<div class="search-empty-msg">No matches for "${escapeHtml(query)}".</div>`;
        results.classList.add("open");
        return;
      }

      const groupsHtml = ["Teams", "Players", "Champions"]
        .map((group) => {
          const items = currentItems.filter((it) => it.group === group);
          if (items.length === 0) return "";
          const rows = items
            .map((it, i) => {
              const globalIndex = currentItems.indexOf(it);
              const icon = it.icon ? `<img src="${escapeHtml(it.icon)}" alt="" class="thumb-logo" style="width:20px;height:20px;margin:0" />` : "";
              return `<a href="${it.href}" class="search-result-item" data-index="${globalIndex}">${icon}<span>${escapeHtml(it.label)}</span></a>`;
            })
            .join("");
          return `<div class="search-group-label">${group}</div>${rows}`;
        })
        .join("");

      results.innerHTML = groupsHtml;
      results.classList.add("open");
    });
  }

  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const value = input.value;
    debounceTimer = setTimeout(() => runSearch(value), 150);
  });

  input.addEventListener("focus", () => {
    if (input.value.trim()) runSearch(input.value);
  });

  input.addEventListener("keydown", (e) => {
    const items = results.querySelectorAll(".search-result-item");
    if (items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      items.forEach((el, i) => el.classList.toggle("active", i === activeIndex));
      items[activeIndex]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      items.forEach((el, i) => el.classList.toggle("active", i === activeIndex));
      items[activeIndex]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && items[activeIndex]) {
        e.preventDefault();
        location.href = items[activeIndex].getAttribute("href");
      }
    } else if (e.key === "Escape") {
      closeResults();
      input.blur();
    }
  });

  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) closeResults();
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
