import { getSession, onAuthChange, signOut } from "./auth.js";
import { LEAGUE_NAME } from "./config.js";
import { isConfigured } from "./supabaseClient.js";

const TABS = [
  { href: "index.html", label: "Home" },
  { href: "standings.html", label: "Standings" },
  { href: "players.html", label: "Players" },
  { href: "calendar.html", label: "Calendar" },
  { href: "predictions.html", label: "Predictions" },
  { href: "brackets.html", label: "Brackets" },
  { href: "news.html", label: "News" },
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
        <div class="auth-area" id="auth-area"></div>
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
}
