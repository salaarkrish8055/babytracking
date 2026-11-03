import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

const icons = {
  feed: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h8l1 15H7L8 5Z"/><path d="M9 5V3h6v2M8 9h8"/></svg>',
  sleep: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 14.8A8 8 0 0 1 9.2 4.5a8.2 8.2 0 1 0 10.3 10.3Z"/></svg>',
  diaper: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7.5h14l-1.2 10a2 2 0 0 1-2 1.7H8.2a2 2 0 0 1-2-1.7L5 7.5Z"/><path d="M5 8 3.5 5.5M19 8l1.5-2.5"/></svg>',
  care: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7.5-4.2-7.5-9.7A4.2 4.2 0 0 1 12 7.8a4.2 4.2 0 0 1 7.5 2.5C19.5 15.8 12 20 12 20Z"/><path d="M12 10v5M9.5 12.5h5"/></svg>',
};

const labels = { feed: "Feeding", sleep: "Sleep", diaper: "Diaper change", care: "Other care" };
const logDialog = document.querySelector("#log-dialog");
const profileDialog = document.querySelector("#profile-dialog");
const passwordDialog = document.querySelector("#password-dialog");
const logForm = document.querySelector("#log-form");
const typeSelect = document.querySelector("#log-type");
const dynamicFields = document.querySelector("#dynamic-fields");
const activityList = document.querySelector("#activity-list");
const toast = document.querySelector("#toast");

let logs = [];
let profile = { id: null, name: "Krish", birthday: "" };
let currentUserId = null;
let authMode = "signin";
let toastTimeout;
let deferredInstallPrompt;
let refreshInProgress = false;
let loadingUserId = null;

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateTimeValue(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function formatTime(date) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

function formatDate(date, options = { weekday: "short", month: "short", day: "numeric" }) {
  return new Intl.DateTimeFormat(undefined, options).format(date);
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function updateDateLabels() {
  const now = new Date();
  document.querySelector("#header-date").textContent = formatDate(now, { weekday: "long", month: "long", day: "numeric" });
  document.querySelector("#today-pill").textContent = formatDate(now, { month: "short", day: "numeric" });
}

function updateProfileLabels() {
  const name = profile.name.trim() || "Baby";
  const initial = [...name][0]?.toLocaleUpperCase() || "B";
  document.querySelector("#welcome-baby-name").textContent = name;
  document.querySelector("#sidebar-baby-name").textContent = name;
  document.querySelector("#sidebar-avatar").textContent = initial;
  document.querySelector("#mobile-avatar").textContent = initial;
}

function renderDashboard() {
  const todayKey = localDateKey(new Date());
  const todayLogs = logs.filter((log) => localDateKey(new Date(log.time)) === todayKey);
  const feedLogs = todayLogs.filter((log) => log.type === "feed");
  const sleepMinutes = todayLogs.filter((log) => log.type === "sleep").reduce((total, log) => total + (Number(log.duration) || 0), 0);
  const diaperLogs = todayLogs.filter((log) => log.type === "diaper");
  const careLogs = todayLogs.filter((log) => log.type === "care");

  document.querySelector("#feed-count").textContent = feedLogs.length;
  document.querySelector("#feed-detail").textContent = feedLogs.length ? `${feedLogs.length} little ${feedLogs.length === 1 ? "feed" : "feeds"} so far today` : "Your first feed is ready to log";
  document.querySelector("#sleep-total").textContent = `${Math.floor(sleepMinutes / 60)}h ${sleepMinutes % 60}m`;
  document.querySelector("#sleep-detail").textContent = sleepMinutes ? "Rest captured today" : "Little rests add up";
  document.querySelector("#diaper-count").textContent = diaperLogs.length;
  document.querySelector("#diaper-detail").textContent = diaperLogs.length ? "Changes captured today" : "Every change, captured";
  document.querySelector("#care-count").textContent = careLogs.length;
  document.querySelector("#care-detail").textContent = careLogs.length ? "Every little moment counts" : "The little things matter, too";

  setProgress("#feed-progress", feedLogs.length, 8);
  setProgress("#sleep-progress", sleepMinutes, 720);
  setProgress("#diaper-progress", diaperLogs.length, 10);
  setProgress("#care-progress", careLogs.length, 5);
  renderActivity();
}

function setProgress(selector, value, target) {
  document.querySelector(selector).style.width = `${Math.min(100, (value / target) * 100)}%`;
}

function activityDescription(log) {
  if (log.type === "feed") {
    const parts = [escapeHTML(log.method || ""), log.amount ? `${log.amount} ml` : "", log.duration ? `${log.duration} min` : ""].filter(Boolean);
    return parts.join(" · ") || "Feeding";
  }
  if (log.type === "sleep") return `${log.duration} min`;
  if (log.type === "diaper") return escapeHTML(log.changeType || "Diaper changed");
  return "Care moment";
}

function renderActivity() {
  const filter = document.querySelector("#activity-filter").value;
  const todayKey = localDateKey(new Date());
  const matchingLogs = logs
    .filter((log) => filter === "all" || log.type === filter)
    .sort((a, b) => new Date(b.time) - new Date(a.time));
  const todayLogs = matchingLogs.filter((log) => localDateKey(new Date(log.time)) === todayKey);
  const olderLogs = matchingLogs.filter((log) => localDateKey(new Date(log.time)) !== todayKey);
  document.querySelector("#clear-logs-button").hidden = logs.length === 0;

  if (!matchingLogs.length) {
    const filtered = filter !== "all";
    activityList.innerHTML = `<div class="activity-empty"><span class="empty-icon">${icons[filtered ? filter : "care"]}</span><strong>${filtered ? `No ${labels[filter].toLowerCase()} logs yet` : "Your day begins with a little moment"}</strong><p>${filtered ? "When you add one, you'll find it here." : "Add a feed, nap, diaper change, or care moment to start your baby's timeline."}</p></div>`;
    return;
  }

  const sections = [];
  if (todayLogs.length) sections.push({ title: "Today", items: todayLogs });
  const olderGroups = new Map();
  for (const log of olderLogs) {
    const dateKey = localDateKey(new Date(log.time));
    if (!olderGroups.has(dateKey)) olderGroups.set(dateKey, []);
    olderGroups.get(dateKey).push(log);
  }
  for (const [dateKey, items] of olderGroups) {
    const [year, month, day] = dateKey.split("-").map(Number);
    sections.push({ title: formatDate(new Date(year, month - 1, day)), items });
  }
  activityList.innerHTML = sections.map(({ title, items }) => `<div class="activity-group-label">${escapeHTML(title)}</div>${items.map(renderActivityItem).join("")}`).join("");
}

function renderActivityItem(log) {
  const when = new Date(log.time);
  const note = log.note ? ` · ${escapeHTML(log.note)}` : "";
  const label = log.label || labels[log.type] || "Care";
  return `<article class="activity-item">
    <span class="activity-type-icon ${log.type}">${icons[log.type]}</span>
    <span class="activity-copy"><strong>${escapeHTML(label)}</strong><small>${activityDescription(log)}${note}</small></span>
    <span class="activity-meta"><time class="activity-time" datetime="${escapeHTML(when.toISOString())}">${formatTime(when)}</time><button class="delete-log" type="button" data-delete-log="${escapeHTML(log.id)}" aria-label="Delete ${escapeHTML(label)} log">${trashIcon()}</button></span>
  </article>`;
}

function trashIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';
}

function renderDynamicFields(type) {
  if (type === "feed") {
    dynamicFields.innerHTML = `<div class="form-field"><label for="feed-method">Feeding type</label><select id="feed-method" name="method"><option>Breastfeeding</option><option>Bottle</option><option>Solids</option></select></div>
      <div class="form-row"><div class="form-field"><label for="feed-amount">Amount <span class="optional">(ml)</span></label><input id="feed-amount" name="amount" type="number" min="0" max="2000" step="1" placeholder="Optional" /></div><div class="form-field"><label for="feed-duration">Duration <span class="optional">(min)</span></label><input id="feed-duration" name="duration" type="number" min="0" max="600" step="1" placeholder="Optional" /></div></div>`;
  } else if (type === "sleep") {
    const end = new Date();
    const start = new Date(end.getTime() - 45 * 60 * 1000);
    dynamicFields.innerHTML = `<div class="form-row"><div class="form-field"><label for="sleep-start">Started</label><input id="sleep-start" name="sleepStart" type="datetime-local" value="${dateTimeValue(start)}" required /></div><div class="form-field"><label for="sleep-end">Woke up</label><input id="sleep-end" name="sleepEnd" type="datetime-local" value="${dateTimeValue(end)}" required /></div></div><p class="form-hint">We'll work out the nap length from these times.</p>`;
  } else if (type === "diaper") {
    dynamicFields.innerHTML = `<div class="form-field"><label for="diaper-type">Change type</label><select id="diaper-type" name="changeType"><option>Wet</option><option>Dirty</option><option>Wet &amp; dirty</option><option>Dry</option></select></div>`;
  } else {
    dynamicFields.innerHTML = `<div class="form-field"><label for="care-label">Care moment</label><input id="care-label" name="label" maxlength="60" placeholder="e.g. Bath, tummy time, medicine" required /></div>`;
  }
}

function openLogDialog(type = "feed") {
  logForm.reset();
  document.querySelector("#form-error").textContent = "";
  typeSelect.value = type;
  renderDynamicFields(type);
  document.querySelector("#log-time-field").hidden = type === "sleep";
  document.querySelector("#log-time").value = dateTimeValue(new Date());
  logDialog.showModal();
  if (type === "care") document.querySelector("#care-label").focus();
  else typeSelect.focus();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("visible"), 3000);
}

function setAuthMessage(message, success = false) {
  const messageElement = document.querySelector("#auth-message");
  messageElement.textContent = message;
  messageElement.classList.toggle("success-message", success);
}

function setAuthMode(mode) {
  authMode = mode;
  const signingUp = mode === "signup";
  document.querySelector("#auth-title").textContent = signingUp ? "Create your account." : "Welcome back.";
  document.querySelector("#auth-description").textContent = signingUp
    ? "Create a private space for your baby's daily care."
    : "Sign in to see your baby's day, wherever you are.";
  document.querySelector("#auth-submit").textContent = signingUp ? "Create account" : "Sign in";
  document.querySelector("#auth-password").autocomplete = signingUp ? "new-password" : "current-password";
  document.querySelector("#auth-switch-copy").textContent = signingUp ? "Already have an account?" : "New to Krish Baby?";
  document.querySelector("#auth-mode-toggle").textContent = signingUp ? "Sign in" : "Create an account";
  document.querySelector("#password-reset").hidden = signingUp;
  setAuthMessage("");
}

function setSyncError(message = "") {
  const errorElement = document.querySelector("#sync-error");
  document.querySelector("#sync-error-text").textContent = message;
  errorElement.hidden = !message;
}

function databaseError(error, operation) {
  console.error(`${operation} failed.`, error);
  const detail = error?.message ? ` ${error.message}` : "";
  return `${operation} failed.${detail}`;
}

function mapDatabaseLog(row) {
  const log = {
    id: row.id,
    type: row.type,
    time: row.occurred_at,
    note: row.note || "",
    method: row.method || "",
    amount: row.amount_ml ?? 0,
    duration: row.duration_minutes ?? 0,
    changeType: row.change_type || "",
    careLabel: row.care_label || "",
  };
  if (log.type === "feed") log.label = `${log.method || "Feeding"} feed`;
  else if (log.type === "sleep") log.label = "Nap";
  else if (log.type === "diaper") log.label = `${log.changeType || "Changed"} diaper`;
  else log.label = log.careLabel || "Care moment";
  return log;
}

function toDatabaseLog(log) {
  return {
    baby_id: profile.id,
    type: log.type,
    occurred_at: log.time,
    note: log.note || null,
    method: log.type === "feed" ? log.method : null,
    amount_ml: log.type === "feed" && log.amount ? log.amount : null,
    duration_minutes: (log.type === "feed" || log.type === "sleep") && log.duration ? log.duration : null,
    change_type: log.type === "diaper" ? log.changeType : null,
    care_label: log.type === "care" ? log.label : null,
  };
}

async function loadBabyProfile(userId) {
  const { data: existingProfile, error: selectError } = await supabase
    .from("baby_profiles")
    .select("id, name, birthday")
    .eq("user_id", userId)
    .maybeSingle();
  if (selectError) throw new Error(databaseError(selectError, "Loading baby profile"));
  if (existingProfile) return existingProfile;

  const { data: newProfile, error: insertError } = await supabase
    .from("baby_profiles")
    .insert({ user_id: userId, name: "Krish" })
    .select("id, name, birthday")
    .single();
  if (insertError) throw new Error(databaseError(insertError, "Creating baby profile"));
  return newProfile;
}

async function loadLogs() {
  const allRows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("care_logs")
      .select("id, type, occurred_at, note, method, amount_ml, duration_minutes, change_type, care_label")
      .eq("baby_id", profile.id)
      .order("occurred_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(databaseError(error, "Loading activity"));
    allRows.push(...data);
    if (data.length < pageSize) break;
  }
  logs = allRows.map(mapDatabaseLog);
  renderDashboard();
}

async function initializeAccount(user) {
  if (currentUserId === user.id && (profile.id || loadingUserId === user.id)) return;
  currentUserId = user.id;
  loadingUserId = user.id;
  logs = [];
  profile = { id: null, name: "Krish", birthday: "" };
  document.querySelector("#auth-screen").hidden = true;
  document.querySelector("#app-shell").hidden = false;
  document.querySelector("#activity-list").innerHTML = '<div class="activity-empty"><strong>Loading your little one\'s day…</strong></div>';
  setSyncError("");
  try {
    const profileRow = await loadBabyProfile(user.id);
    if (currentUserId !== user.id) return;
    profile = { id: profileRow.id, name: profileRow.name, birthday: profileRow.birthday || "" };
    updateProfileLabels();
    await loadLogs();
  } catch (error) {
    if (currentUserId !== user.id) return;
    setSyncError(error instanceof Error ? error.message : "Unable to load your baby's data.");
    console.error("Unable to initialize the signed-in account.", error);
  } finally {
    if (loadingUserId === user.id) loadingUserId = null;
  }
}

async function handleSession(session) {
  if (!session?.user) {
    currentUserId = null;
    loadingUserId = null;
    logs = [];
    profile = { id: null, name: "Krish", birthday: "" };
    for (const dialog of [logDialog, profileDialog, passwordDialog]) {
      if (dialog.open) dialog.close();
    }
    document.querySelector("#app-shell").hidden = true;
    document.querySelector("#auth-screen").hidden = false;
    return;
  }
  await initializeAccount(session.user);
}

async function refreshAccountData() {
  if (!currentUserId || !profile.id || refreshInProgress || document.hidden) return;
  refreshInProgress = true;
  try {
    const { data, error } = await supabase
      .from("baby_profiles")
      .select("id, name, birthday")
      .eq("user_id", currentUserId)
      .maybeSingle();
    if (error) throw new Error(databaseError(error, "Refreshing baby profile"));
    if (data && data.id === profile.id) {
      profile = { id: data.id, name: data.name, birthday: data.birthday || "" };
      updateProfileLabels();
    }
    await loadLogs();
    setSyncError("");
  } catch (error) {
    setSyncError(error instanceof Error ? error.message : "Unable to refresh your baby's data.");
  } finally {
    refreshInProgress = false;
  }
}

document.querySelector("#sync-retry").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    if (profile.id) {
      await refreshAccountData();
    } else {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (data.session?.user) await initializeAccount(data.session.user);
    }
  } catch (error) {
    setSyncError(error instanceof Error ? error.message : "Unable to reload your account.");
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase) return;
  const form = event.currentTarget;
  const submitButton = document.querySelector("#auth-submit");
  const formData = new FormData(form);
  const email = String(formData.get("email")).trim();
  const password = String(formData.get("password"));
  submitButton.disabled = true;
  setAuthMessage("");
  try {
    if (authMode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.href.split(/[?#]/)[0] },
      });
      if (error) throw error;
      if (data.session) {
        await handleSession(data.session);
      } else {
        setAuthMessage("Check your email for a confirmation link, then come back here to sign in.", true);
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  } catch (error) {
    console.error("Authentication failed.", error);
    setAuthMessage(error instanceof Error ? error.message : "Unable to authenticate. Please try again.");
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelector("#auth-mode-toggle").addEventListener("click", () => {
  setAuthMode(authMode === "signin" ? "signup" : "signin");
});

document.querySelector("#password-reset").addEventListener("click", async () => {
  if (!supabase) return;
  const email = document.querySelector("#auth-email").value.trim();
  if (!email) {
    setAuthMessage("Enter your email address first.");
    document.querySelector("#auth-email").focus();
    return;
  }
  const resetButton = document.querySelector("#password-reset");
  resetButton.disabled = true;
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.href.split(/[?#]/)[0],
    });
    if (error) throw error;
    setAuthMessage("If an account exists for that email, a password reset link is on its way.", true);
  } catch (error) {
    console.error("Password reset request failed.", error);
    setAuthMessage(error instanceof Error ? error.message : "Unable to request a password reset.");
  } finally {
    resetButton.disabled = false;
  }
});

async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) showToast(databaseError(error, "Signing out"));
}
document.querySelector("#sign-out-button").addEventListener("click", signOut);
document.querySelector("#sign-out-profile").addEventListener("click", signOut);

document.querySelectorAll("[data-open-log]").forEach((button) => button.addEventListener("click", () => openLogDialog()));
document.querySelectorAll("[data-log-type]").forEach((button) => button.addEventListener("click", () => openLogDialog(button.dataset.logType)));
document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
typeSelect.addEventListener("change", () => renderDynamicFields(typeSelect.value));
document.querySelector("#activity-filter").addEventListener("change", renderActivity);

function updateNavigation(activeHref = location.hash === "#activity" ? "#activity" : "#today") {
  document.querySelectorAll(".nav-link").forEach((link) => {
    const active = link.getAttribute("href") === activeHref;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}
document.querySelectorAll(".nav-link").forEach((link) => {
  link.addEventListener("click", () => updateNavigation(link.getAttribute("href")));
});
window.addEventListener("hashchange", () => updateNavigation());

logForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(logForm);
  const type = String(data.get("type"));
  const time = new Date(String(data.get("time")));
  const formError = document.querySelector("#form-error");
  const saveButton = logForm.querySelector('button[type="submit"]');
  formError.textContent = "";

  if (Number.isNaN(time.getTime())) {
    formError.textContent = "Please choose a valid date and time.";
    return;
  }
  if (type !== "sleep" && time > new Date(Date.now() + 60000)) {
    formError.textContent = "Log time can't be in the future.";
    return;
  }
  const entry = {
    type,
    time: time.toISOString(),
    note: String(data.get("notes") || "").trim(),
  };

  if (type === "feed") {
    entry.method = String(data.get("method"));
    entry.amount = data.get("amount") ? Number(data.get("amount")) : 0;
    entry.duration = data.get("duration") ? Number(data.get("duration")) : 0;
    entry.label = `${entry.method} feed`;
  } else if (type === "sleep") {
    const start = new Date(String(data.get("sleepStart")));
    const end = new Date(String(data.get("sleepEnd")));
    const duration = Math.round((end.getTime() - start.getTime()) / 60000);
    if (!Number.isFinite(duration) || duration <= 0) {
      formError.textContent = "Wake-up time must be after the nap started.";
      return;
    }
    if (end > new Date(Date.now() + 60000)) {
      formError.textContent = "Wake-up time can't be in the future.";
      return;
    }
    entry.time = end.toISOString();
    entry.duration = duration;
    entry.label = "Nap";
  } else if (type === "diaper") {
    entry.changeType = String(data.get("changeType"));
    entry.label = `${entry.changeType} diaper`;
  } else {
    entry.label = String(data.get("label") || "").trim();
  }

  if (!profile.id) {
    formError.textContent = "Your baby profile is still loading. Please try again in a moment.";
    return;
  }
  saveButton.disabled = true;
  try {
    const { data: savedRow, error } = await supabase
      .from("care_logs")
      .insert(toDatabaseLog(entry))
      .select("id, type, occurred_at, note, method, amount_ml, duration_minutes, change_type, care_label")
      .single();
    if (error) throw error;
    logs.unshift(mapDatabaseLog(savedRow));
    logDialog.close();
    renderDashboard();
    setSyncError("");
    showToast(`${entry.label} saved`);
  } catch (error) {
    formError.textContent = databaseError(error, "Saving log");
  } finally {
    saveButton.disabled = false;
  }
});

activityList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete-log]");
  if (!button || !profile.id) return;
  button.disabled = true;
  try {
    const { error } = await supabase
      .from("care_logs")
      .delete()
      .eq("id", button.dataset.deleteLog)
      .eq("baby_id", profile.id);
    if (error) throw error;
    logs = logs.filter((log) => log.id !== button.dataset.deleteLog);
    renderDashboard();
    showToast("Log removed");
  } catch (error) {
    showToast(databaseError(error, "Removing log"));
    button.disabled = false;
  }
});

document.querySelector("#clear-logs-button").addEventListener("click", async () => {
  if (!logs.length || !profile.id || !window.confirm("Remove all feeding, sleep, diaper, and care logs from your account?")) return;
  const clearButton = document.querySelector("#clear-logs-button");
  clearButton.disabled = true;
  try {
    const { error } = await supabase.from("care_logs").delete().eq("baby_id", profile.id);
    if (error) throw error;
    logs = [];
    renderDashboard();
    showToast("All logs removed");
  } catch (error) {
    showToast(databaseError(error, "Removing logs"));
  } finally {
    clearButton.disabled = false;
  }
});

function openProfileDialog() {
  document.querySelector("#profile-error").textContent = "";
  document.querySelector("#baby-name").value = profile.name;
  document.querySelector("#baby-birthday").value = profile.birthday;
  profileDialog.showModal();
  document.querySelector("#baby-name").focus();
}
document.querySelector("#profile-button").addEventListener("click", openProfileDialog);
document.querySelector("#profile-button-mobile").addEventListener("click", openProfileDialog);

document.querySelector("#profile-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = document.querySelector("#baby-name").value.trim();
  const birthday = document.querySelector("#baby-birthday").value;
  const formError = document.querySelector("#profile-error");
  const saveButton = event.currentTarget.querySelector('button[type="submit"]');
  if (!name) {
    formError.textContent = "Please add your baby's name.";
    return;
  }
  saveButton.disabled = true;
  try {
    const { data, error } = await supabase
      .from("baby_profiles")
      .update({ name, birthday: birthday || null })
      .eq("id", profile.id)
      .select("id, name, birthday")
      .single();
    if (error) throw error;
    profile = { id: data.id, name: data.name, birthday: data.birthday || "" };
    updateProfileLabels();
    profileDialog.close();
    showToast("Baby profile saved");
  } catch (error) {
    formError.textContent = databaseError(error, "Saving profile");
  } finally {
    saveButton.disabled = false;
  }
});

document.querySelector("#password-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = document.querySelector("#new-password").value;
  const confirmation = document.querySelector("#confirm-password").value;
  const errorElement = document.querySelector("#password-error");
  const button = event.currentTarget.querySelector('button[type="submit"]');
  errorElement.textContent = "";
  if (password !== confirmation) {
    errorElement.textContent = "The passwords don't match.";
    return;
  }
  button.disabled = true;
  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    passwordDialog.close();
    event.currentTarget.reset();
    showToast("Password updated");
  } catch (error) {
    errorElement.textContent = error instanceof Error ? error.message : "Unable to update password.";
  } finally {
    button.disabled = false;
  }
});

const installButtons = [...document.querySelectorAll(".install-button")];
function isInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}
function updateInstallButton() {
  installButtons.forEach((button) => { button.hidden = isInstalled(); });
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButtons.forEach((button) => { button.textContent = "Install app"; });
});
window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  updateInstallButton();
  showToast("Krish Baby is installed");
});
installButtons.forEach((button) => button.addEventListener("click", async () => {
  if (deferredInstallPrompt) {
    await deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    if (choice.outcome === "accepted") updateInstallButton();
    return;
  }
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    showToast("In Safari, tap Share, then Add to Home Screen.");
  } else if (isInstalled()) {
    showToast("Krish Baby is already installed.");
  } else {
    showToast("Open this page in your phone's browser to install the app.");
  }
}));
updateInstallButton();

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  const serviceWorkerUrl = new URL(`${import.meta.env.BASE_URL}sw.js`, window.location.origin);
  navigator.serviceWorker.register(serviceWorkerUrl, { scope: import.meta.env.BASE_URL })
    .catch((error) => console.error("Unable to register the app for offline loading.", error));
}

updateDateLabels();
updateNavigation();
window.addEventListener("focus", () => { void refreshAccountData(); });
window.setInterval(() => { void refreshAccountData(); }, 60000);

async function initializeApp() {
  document.querySelector("#auth-config-warning").hidden = Boolean(supabase);
  document.querySelector("#auth-form").querySelectorAll("input, button").forEach((control) => {
    control.disabled = !supabase;
  });
  if (!supabase) {
    document.querySelector("#auth-screen").hidden = false;
    document.querySelector("#auth-config-warning").hidden = false;
    setAuthMessage("This build needs a Supabase project URL and public publishable key.");
    return;
  }

  supabase.auth.onAuthStateChange((event, session) => {
    window.setTimeout(() => {
      handleSession(session).catch((error) => {
        setSyncError(error instanceof Error ? error.message : "Unable to load your account.");
      }).then(() => {
        if (event === "PASSWORD_RECOVERY") {
          passwordDialog.showModal();
          document.querySelector("#new-password").focus();
        }
      });
    }, 0);
  });

  const { data: authData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    console.error("Unable to restore the saved sign-in session.", sessionError);
    document.querySelector("#auth-screen").hidden = false;
    setAuthMessage("Unable to restore your sign-in. Please refresh and try again.");
    return;
  }
  await handleSession(authData.session);
}

initializeApp().catch((error) => {
  console.error("Unable to start Krish Baby.", error);
  document.querySelector("#auth-screen").hidden = false;
  setAuthMessage("Unable to connect to the app. Please check your connection and refresh.");
});
