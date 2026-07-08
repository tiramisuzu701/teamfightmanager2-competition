import { signIn, getSession } from "./auth.js";
import { renderNav } from "./nav.js";

renderNav();

(async () => {
  const session = await getSession();
  if (session) {
    const params = new URLSearchParams(location.search);
    location.href = params.get("next") || "index.html";
  }
})();

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const msg = document.getElementById("form-msg");
  msg.textContent = "Signing in...";
  msg.className = "form-msg";
  try {
    await signIn(email, password);
    msg.textContent = "Success! Redirecting...";
    msg.className = "form-msg success";
    const params = new URLSearchParams(location.search);
    location.href = params.get("next") || "index.html";
  } catch (err) {
    msg.textContent = err.message || "Login failed.";
    msg.className = "form-msg error";
  }
});
