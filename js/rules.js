import { renderNav } from "./nav.js";
import { getSession } from "./auth.js";
import { loadRulesPublic, saveSettingsAdmin } from "./settings.js";

renderNav("rules.html");

let isAdmin = false;
let currentContent = "";

async function init() {
  const session = await getSession();
  isAdmin = !!session;
  if (isAdmin) document.getElementById("edit-rules-btn").style.display = "inline-flex";

  document.getElementById("edit-rules-btn").addEventListener("click", openEditor);
  document.getElementById("cancel-rules-btn").addEventListener("click", closeEditor);
  document.getElementById("save-rules-btn").addEventListener("click", saveRules);

  await loadRules();
}

async function loadRules() {
  const display = document.getElementById("rules-display");
  try {
    currentContent = await loadRulesPublic();
  } catch (err) {
    display.innerHTML = `<p class="empty-state">Could not load rules (${esc(err.message)}).</p>`;
    return;
  }
  render();
}

function render() {
  const display = document.getElementById("rules-display");
  if (!currentContent || !currentContent.trim()) {
    display.innerHTML = `<p class="empty-state">No rules have been posted yet.${isAdmin ? " Click Edit above to add some." : ""}</p>`;
    return;
  }
  display.innerHTML = currentContent
    .split(/\n\s*\n/)
    .map((block) => `<p>${esc(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function openEditor() {
  document.getElementById("rules-textarea").value = currentContent;
  document.getElementById("rules-edit").style.display = "block";
  document.getElementById("rules-display").style.display = "none";
}

function closeEditor() {
  document.getElementById("rules-edit").style.display = "none";
  document.getElementById("rules-display").style.display = "block";
  document.getElementById("rules-msg").textContent = "";
}

async function saveRules() {
  const msg = document.getElementById("rules-msg");
  const newContent = document.getElementById("rules-textarea").value;
  msg.textContent = "Saving...";
  msg.className = "form-msg";
  try {
    await saveSettingsAdmin({ rules_content: newContent });
    currentContent = newContent;
    render();
    closeEditor();
  } catch (err) {
    msg.textContent = "Error: " + err.message;
    msg.className = "form-msg error";
  }
}

function esc(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

init();
