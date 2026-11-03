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
const maxCustomLogTypes = 12;
const logDialog = document.querySelector("#log-dialog");
const profileDialog = document.querySelector("#profile-dialog");
const passwordDialog = document.querySelector("#password-dialog");
const logForm = document.querySelector("#log-form");
const typeSelect = document.querySelector("#log-type");
const dynamicFields = document.querySelector("#dynamic-fields");
const activityList = document.querySelector("#activity-list");
const quickActions = document.querySelector("#quick-actions");
const toast = document.querySelector("#toast");

let logs = [];
let profile = { id: null, name: "Krish", birthday: "", customLogTypes: [], quickLogOrder: [] };
let draftCustomLogTypes = [];
let draftQuickLogOrder = [];
let currentUserId = null;
let authMode = "signin";
let toastTimeout;
let deferredInstallPrompt;
let refreshInProgress = false;
let loadingUserId = null;
let draggedQuickLogType = null;
let draggedProfileOrderType = null;
let quickLogOrderSaveInProgress = false;
let editingLogId = null;
let overviewDate = new Date();
overviewDate.setHours(0, 0, 0, 0);
let activityActionMode = null;
let pendingDeleteLogId = null;
let confirmingClearLogs = false;
let activityActionError = "";
let activityActionInProgress = false;

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
  document.querySelector("#overview-date").max = localDateKey(now);
  updateOverviewDateControls();
}

function updateOverviewDateControls() {
  const date = document.querySelector("#overview-date");
  const todayKey = localDateKey(new Date());
  date.max = todayKey;
  const selectedKey = localDateKey(overviewDate);
  date.value = selectedKey;
  document.querySelector("#next-overview-day").disabled = selectedKey >= todayKey;
  document.querySelector("#overview-title").textContent = selectedKey === todayKey
    ? "Today's overview"
    : `Overview for ${formatDate(overviewDate, { weekday: "short", month: "short", day: "numeric" })}`;
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
  const overviewKey = localDateKey(overviewDate);
  const todayLogs = logs.filter((log) => localDateKey(new Date(log.time)) === overviewKey);
  const feedLogs = todayLogs.filter((log) => log.type === "feed");
  const sleepMinutes = todayLogs.filter((log) => log.type === "sleep").reduce((total, log) => total + sleepDurationForDay(log, overviewDate), 0);
  const diaperLogs = todayLogs.filter((log) => log.type === "diaper");
  const careLogs = todayLogs.filter((log) => log.type === "care");
  document.querySelector(".stats-grid").setAttribute(
    "aria-label",
    `${formatDate(overviewDate, { month: "long", day: "numeric" })} totals`,
  );

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
  updateOverviewDateControls();
  renderCustomOverviewCards(todayLogs);
  renderActivity();
}

function sleepDurationForDay(log, day) {
  if (Number(log.duration) > 0) return Number(log.duration);
  const start = new Date(log.time);
  const dayStart = new Date(day);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const intervalStart = Math.max(start.getTime(), dayStart.getTime());
  const intervalEnd = Math.min(Date.now(), dayEnd.getTime());
  return Math.max(0, Math.floor((intervalEnd - intervalStart) / 60000));
}

function renderCustomOverviewCards(todayLogs) {
  const statsGrid = document.querySelector(".stats-grid");
  statsGrid.querySelectorAll("[data-custom-overview]").forEach((card) => card.remove());
  for (const name of profile.customLogTypes) {
    const count = todayLogs.filter((log) => log.type === "custom" && log.careLabel === name).length;
    const card = document.createElement("article");
    card.className = "stat-card custom-stat-card";
    card.dataset.activityFilter = `custom:${name}`;
    card.dataset.customOverview = "";
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-pressed", "false");
    card.setAttribute("aria-label", `View ${name} logs`);
    card.innerHTML = `<div class="stat-card-top"><span class="stat-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></span><span class="stat-label">${escapeHTML(name)}</span></div>
      <div class="stat-value"><strong>${count}</strong><span>logged</span></div>
      <p class="stat-detail">${count ? `${count} ${count === 1 ? "entry" : "entries"} today` : `No ${escapeHTML(name.toLocaleLowerCase())} logs today`}</p>
      <div class="stat-progress"><span style="width: ${Math.min(100, (count / 5) * 100)}%"></span></div>`;
    statsGrid.append(card);
  }
}

function setProgress(selector, value, target) {
  document.querySelector(selector).style.width = `${Math.min(100, (value / target) * 100)}%`;
}

function activityDescription(log) {
  if (log.type === "feed") {
    const parts = [escapeHTML(log.method || ""), log.amount ? `${log.amount} ml` : "", log.duration ? `${log.duration} min` : ""].filter(Boolean);
    return parts.join(" · ") || "Feeding";
  }
  if (log.type === "sleep") {
    const duration = sleepDurationMinutes(log);
    return log.duration ? `${duration} min` : `In progress · ${duration} min so far`;
  }
  if (log.type === "diaper") return escapeHTML(log.changeType || "Diaper changed");
  if (log.type === "custom") return "Custom log";
  return "Care moment";
}

function sleepDurationMinutes(log) {
  if (Number(log.duration) > 0) return Number(log.duration);
  return Math.max(0, Math.floor((Date.now() - new Date(log.time).getTime()) / 60000));
}

function renderActivity() {
  const filter = document.querySelector("#activity-filter").value;
  document.querySelectorAll("[data-activity-filter]").forEach((card) => {
    card.setAttribute("aria-pressed", String(card.dataset.activityFilter === filter));
  });
  const todayKey = localDateKey(new Date());
  const matchingLogs = logs
    .filter((log) => filter === "all"
      || log.type === filter
      || (filter.startsWith("custom:") && log.type === "custom" && log.careLabel === filter.slice("custom:".length)))
    .sort((a, b) => new Date(b.time) - new Date(a.time));
  const todayLogs = matchingLogs.filter((log) => localDateKey(new Date(log.time)) === todayKey);
  const olderLogs = matchingLogs.filter((log) => localDateKey(new Date(log.time)) !== todayKey);
  updateActivityControls();

  if (!matchingLogs.length) {
    const filtered = filter !== "all";
    const filterLabel = filter.startsWith("custom:") ? filter.slice("custom:".length) : labels[filter];
    activityList.innerHTML = `<div class="activity-empty"><span class="empty-icon">${icons[filter] || icons.care}</span><strong>${filtered ? `No ${escapeHTML((filterLabel || "care").toLowerCase())} logs yet` : "Your day begins with a little moment"}</strong><p>${filtered ? "When you add one, you'll find it here." : "Add a feed, nap, diaper change, or care moment to start your baby's timeline."}</p></div>`;
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
  const isPendingDelete = pendingDeleteLogId === log.id;
  let actionMarkup = "";
  let confirmationMarkup = "";
  if (activityActionMode === "edit") {
    actionMarkup = `<button class="button button-secondary row-action-button" type="button" data-edit-log="${escapeHTML(log.id)}">${editIcon()}<span>Edit</span></button>`;
  } else if (activityActionMode === "delete" && isPendingDelete) {
    confirmationMarkup = `<div class="row-delete-confirmation" role="group" aria-label="Confirm deleting ${escapeHTML(label)}"><span>Delete this entry?</span><button class="button button-secondary row-action-button" type="button" data-cancel-delete${activityActionInProgress ? " disabled" : ""}>No</button><button class="button button-danger row-action-button" type="button" data-confirm-delete="${escapeHTML(log.id)}"${activityActionInProgress ? " disabled" : ""}>Yes</button></div>`;
  } else if (activityActionMode === "delete") {
    actionMarkup = `<button class="button button-secondary row-action-button" type="button" data-delete-log="${escapeHTML(log.id)}">${trashIcon()}<span>Delete</span></button>`;
  }
  return `<article class="activity-item">
    <span class="activity-type-icon ${log.type}">${icons[log.type] || icons.care}</span>
    <span class="activity-copy"><strong>${escapeHTML(label)}</strong><small>${activityDescription(log)}${note}</small></span>
    <span class="activity-meta"><time class="activity-time" datetime="${escapeHTML(when.toISOString())}">${formatTime(when)}</time>${actionMarkup}</span>
    ${confirmationMarkup}
    ${isPendingDelete && activityActionError ? `<span class="activity-action-error" role="alert">${escapeHTML(activityActionError)}</span>` : ""}
  </article>`;
}

function updateActivityControls() {
  const hasLogs = logs.length > 0;
  const clearButton = document.querySelector("#clear-logs-button");
  clearButton.hidden = !hasLogs || confirmingClearLogs;
  document.querySelector("#edit-logs-mode").hidden = !hasLogs || confirmingClearLogs;
  document.querySelector("#delete-logs-mode").hidden = !hasLogs || confirmingClearLogs;
  document.querySelector("#cancel-log-action").hidden = !activityActionMode || confirmingClearLogs;
  document.querySelector("#edit-logs-mode").setAttribute("aria-pressed", String(activityActionMode === "edit"));
  document.querySelector("#delete-logs-mode").setAttribute("aria-pressed", String(activityActionMode === "delete"));
  const confirmation = document.querySelector("#clear-logs-confirmation");
  confirmation.hidden = !confirmingClearLogs;
  if (confirmingClearLogs) {
    document.querySelector("#clear-logs-message").textContent =
      `Delete all ${logs.length} ${logs.length === 1 ? "entry" : "entries"}?`;
    document.querySelector("#clear-logs-error").textContent = activityActionError;
    document.querySelector("#confirm-clear-logs").disabled = activityActionInProgress;
    document.querySelector("#cancel-clear-logs").disabled = activityActionInProgress;
  }
}

function editIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5 5 5M4 20l4.5-1 11-11a2.1 2.1 0 0 0-3-3l-11 11L4 20Z"/></svg>';
}

function trashIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';
}

function renderDynamicFields(type) {
  if (type === "feed") {
    dynamicFields.innerHTML = `<div class="form-field"><span class="form-field-label" id="feed-method-label">Feeding type</span><input id="feed-method" name="method" type="hidden" value="Breastfeeding" /><div class="feed-method-options" role="group" aria-labelledby="feed-method-label">
        <button class="feed-method-option" type="button" data-feed-method="Breastfeeding" aria-pressed="true">Breastfeeding</button>
        <button class="feed-method-option" type="button" data-feed-method="Bottle" aria-pressed="false">Bottle</button>
        <button class="feed-method-option" type="button" data-feed-method="Solids" aria-pressed="false">Solids</button>
      </div></div>
      <div class="form-row"><div class="form-field"><span class="form-field-label" id="feed-amount-label">Amount <span class="optional">(ml)</span></span><input id="feed-amount-preset" name="amountPreset" type="hidden" value="" /><div class="feed-amount-options" role="group" aria-labelledby="feed-amount-label">
        <button class="feed-amount-option" type="button" data-feed-amount="10" aria-pressed="false">10</button>
        <button class="feed-amount-option" type="button" data-feed-amount="20" aria-pressed="false">20</button>
        <button class="feed-amount-option" type="button" data-feed-amount="30" aria-pressed="false">30</button>
        <button class="feed-amount-option" type="button" data-feed-amount="40" aria-pressed="false">40</button>
        <button class="feed-amount-option" type="button" data-feed-amount="50" aria-pressed="false">50</button>
        <button class="feed-amount-option" type="button" data-feed-amount="60" aria-pressed="false">60</button>
        <button class="feed-amount-option" type="button" data-feed-amount="other" aria-pressed="false">Other</button>
      </div><div class="form-field" id="feed-custom-amount-field" hidden><label for="feed-custom-amount">Enter amount <span class="optional">(ml)</span></label><input id="feed-custom-amount" name="amountCustom" type="number" min="0" max="2000" step="1" disabled /></div></div><div class="form-field"><label for="feed-duration">Duration <span class="optional">(min)</span></label><input id="feed-duration" name="duration" type="number" min="0" max="600" step="1" placeholder="Optional" /></div></div>`;
    const methodInput = document.querySelector("#feed-method");
    dynamicFields.querySelectorAll("[data-feed-method]").forEach((button) => {
      button.addEventListener("click", () => {
        methodInput.value = button.dataset.feedMethod;
        dynamicFields.querySelectorAll("[data-feed-method]").forEach((option) => {
          option.setAttribute("aria-pressed", String(option === button));
        });
      });
    });
    const amountPreset = document.querySelector("#feed-amount-preset");
    const customAmountField = document.querySelector("#feed-custom-amount-field");
    const customAmountInput = document.querySelector("#feed-custom-amount");
    dynamicFields.querySelectorAll("[data-feed-amount]").forEach((button) => {
      button.addEventListener("click", () => {
        const isOther = button.dataset.feedAmount === "other";
        amountPreset.value = isOther ? "" : button.dataset.feedAmount;
        customAmountField.hidden = !isOther;
        customAmountInput.disabled = !isOther;
        if (!isOther) customAmountInput.value = "";
        dynamicFields.querySelectorAll("[data-feed-amount]").forEach((option) => {
          option.setAttribute("aria-pressed", String(option === button));
        });
        if (isOther) customAmountInput.focus();
      });
    });
  } else if (type === "sleep") {
    dynamicFields.innerHTML = `<div class="form-row"><div class="form-field"><label for="sleep-start">Fell asleep</label><input id="sleep-start" name="sleepStart" type="datetime-local" value="${dateTimeValue(new Date())}" required /></div><div class="form-field"><label for="sleep-end">Woke up <span class="optional">(optional)</span></label><input id="sleep-end" name="sleepEnd" type="datetime-local" /></div></div><p class="form-hint">Save now while your baby sleeps. Add the wake-up time later by editing this log.</p>`;
  } else if (type === "diaper") {
    dynamicFields.innerHTML = `<div class="form-field"><label for="diaper-type">Change type</label><select id="diaper-type" name="changeType"><option>Wet</option><option>Dirty</option><option>Wet &amp; dirty</option><option>Dry</option></select></div>`;
  } else if (type.startsWith("custom:")) {
    const name = type.slice("custom:".length);
    dynamicFields.innerHTML = `<div class="form-field"><span class="form-field-label">${escapeHTML(name)}</span><p class="form-hint">Add the time and any details you'd like to remember.</p></div>`;
  } else {
    dynamicFields.innerHTML = `<div class="form-field"><label for="care-label">Care moment</label><input id="care-label" name="label" maxlength="60" placeholder="e.g. Bath, tummy time, medicine" required /></div>`;
  }
}

function updateLogTypeOptions() {
  const selectedLogType = typeSelect.value;
  typeSelect.querySelectorAll("[data-custom-log-type]").forEach((option) => option.remove());
  document.querySelectorAll("#activity-filter [data-custom-log-type]").forEach((option) => option.remove());
  quickActions.querySelectorAll("[data-custom-log-type]").forEach((button) => button.remove());
  for (const name of profile.customLogTypes) {
    const value = `custom:${name}`;
    const logOption = document.createElement("option");
    logOption.value = value;
    logOption.textContent = name;
    logOption.dataset.customLogType = "";
    typeSelect.append(logOption);

    const filterOption = document.createElement("option");
    filterOption.value = value;
    filterOption.textContent = name;
    filterOption.dataset.customLogType = "";
    document.querySelector("#activity-filter").append(filterOption);

    const quickAction = document.createElement("button");
    quickAction.type = "button";
    quickAction.className = "quick-action custom-quick-action";
    quickAction.dataset.logType = value;
    quickAction.dataset.customLogType = "";
    quickAction.innerHTML = `<span class="quick-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></span><span><strong>${escapeHTML(name)}</strong><small>Log a moment</small></span><span class="quick-plus" aria-hidden="true">+</span>`;
    quickActions.append(quickAction);
  }
  applyQuickLogOrder(profile.quickLogOrder);
  if ([...typeSelect.options].some((option) => option.value === selectedLogType)) {
    typeSelect.value = selectedLogType;
  }
}

function availableQuickLogTypes(customLogTypes = profile.customLogTypes) {
  return ["feed", "sleep", "diaper", "care", ...customLogTypes.map((name) => `custom:${name}`)];
}

function normalizeQuickLogOrder(order, customLogTypes = profile.customLogTypes) {
  const available = availableQuickLogTypes(customLogTypes);
  const normalized = [];
  for (const type of Array.isArray(order) ? order : []) {
    if (available.includes(type) && !normalized.includes(type)) normalized.push(type);
  }
  return [...normalized, ...available.filter((type) => !normalized.includes(type))];
}

function applyQuickLogOrder(order) {
  const normalized = normalizeQuickLogOrder(order);
  const orderedCards = [];
  for (const type of normalized) {
    const card = [...quickActions.children].find((item) => item.dataset.logType === type);
    if (card) orderedCards.push(card);
  }
  quickActions.replaceChildren(...orderedCards);
  profile.quickLogOrder = normalized;
  updateQuickLogCardPositions();
}

function updateQuickLogCardPositions() {
  const cards = [...quickActions.children];
  cards.forEach((card, index) => {
    card.setAttribute("aria-keyshortcuts", "Alt+ArrowUp Alt+ArrowDown");
    card.setAttribute("aria-label", `${card.querySelector("strong").textContent}. Press Alt+Up or Alt+Down to change card order.`);
    card.setAttribute("aria-posinset", String(index + 1));
    card.setAttribute("aria-setsize", String(cards.length));
    card.draggable = true;
  });
}

function reorderQuickLogCards(fromType, toType, before) {
  const cards = [...quickActions.children];
  const fromIndex = cards.findIndex((card) => card.dataset.logType === fromType);
  const toIndex = cards.findIndex((card) => card.dataset.logType === toType);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
  const [moved] = cards.splice(fromIndex, 1);
  const targetIndex = cards.findIndex((card) => card.dataset.logType === toType);
  cards.splice(targetIndex + (before ? 0 : 1), 0, moved);
  cards.forEach((card) => quickActions.append(card));
  updateQuickLogCardPositions();
}

async function saveQuickLogOrder() {
  const order = [...quickActions.children].map((card) => card.dataset.logType);
  if (order.every((type, index) => type === profile.quickLogOrder[index])) return;
  if (quickLogOrderSaveInProgress) {
    applyQuickLogOrder(profile.quickLogOrder);
    showToast("Please wait for the current card order to save.");
    return;
  }

  const previousOrder = profile.quickLogOrder;
  quickLogOrderSaveInProgress = true;
  try {
    const { data, error } = await supabase
      .from("baby_profiles")
      .update({ quick_log_order: order })
      .eq("id", profile.id)
      .select("quick_log_order")
      .single();
    if (error) throw error;
    profile.quickLogOrder = normalizeQuickLogOrder(data.quick_log_order);
    showToast("Quick log order saved");
    setSyncError("");
  } catch (error) {
    applyQuickLogOrder(previousOrder);
    setSyncError(databaseError(error, "Saving quick log order"));
  } finally {
    quickLogOrderSaveInProgress = false;
  }
}

function openLogDialog(type = "feed", log = null) {
  editingLogId = log?.id ?? null;
  logForm.reset();
  document.querySelector("#form-error").textContent = "";
  const selectedType = log?.type === "custom" ? `custom:${log.careLabel}` : type;
  if (log?.type === "custom" && ![...typeSelect.options].some((option) => option.value === selectedType)) {
    const option = document.createElement("option");
    option.value = selectedType;
    option.textContent = log.careLabel;
    option.dataset.editLogType = "";
    typeSelect.append(option);
  }
  typeSelect.value = selectedType;
  renderDynamicFields(selectedType);
  document.querySelector("#log-time-field").hidden = selectedType === "sleep";
  document.querySelector("#log-time").value = dateTimeValue(log ? new Date(log.time) : new Date());
  document.querySelector("#log-notes").value = log?.note || "";
  document.querySelector("#log-title").textContent = log ? "Edit log" : "Add a log";
  logForm.querySelector('button[type="submit"]').textContent = log ? "Save changes" : "Save this moment";
  if (log) populateLogForm(log);
  logDialog.showModal();
  if (selectedType === "care") document.querySelector("#care-label").focus();
  else typeSelect.focus();
}

function populateLogForm(log) {
  if (log.type === "feed") {
    const methodInput = document.querySelector("#feed-method");
    methodInput.value = log.method || "Breastfeeding";
    dynamicFields.querySelectorAll("[data-feed-method]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.feedMethod === methodInput.value));
    });

    const amount = Number(log.amount) || 0;
    const amountButton = [...dynamicFields.querySelectorAll("[data-feed-amount]")]
      .find((button) => button.dataset.feedAmount === String(amount));
    if (amountButton) {
      document.querySelector("#feed-amount-preset").value = String(amount);
      amountButton.setAttribute("aria-pressed", "true");
    } else if (amount > 0) {
      const otherButton = dynamicFields.querySelector('[data-feed-amount="other"]');
      otherButton.setAttribute("aria-pressed", "true");
      document.querySelector("#feed-custom-amount-field").hidden = false;
      document.querySelector("#feed-custom-amount").disabled = false;
      document.querySelector("#feed-custom-amount").value = String(amount);
    }
    document.querySelector("#feed-duration").value = log.duration || "";
  } else if (log.type === "sleep") {
    const end = new Date(log.time);
    const start = Number(log.duration) > 0
      ? new Date(end.getTime() - Number(log.duration) * 60000)
      : end;
    document.querySelector("#sleep-start").value = dateTimeValue(start);
    document.querySelector("#sleep-end").value = Number(log.duration) > 0 ? dateTimeValue(end) : "";
  } else if (log.type === "diaper") {
    document.querySelector("#diaper-type").value = log.changeType;
  } else if (log.type === "care") {
    document.querySelector("#care-label").value = log.careLabel;
  }
}

logDialog.addEventListener("close", () => {
  editingLogId = null;
  typeSelect.querySelectorAll("[data-edit-log-type]").forEach((option) => option.remove());
});

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
  else if (log.type === "sleep") log.label = Number(log.duration) > 0 ? "Nap" : "Sleep in progress";
  else if (log.type === "diaper") log.label = `${log.changeType || "Changed"} diaper`;
  else if (log.type === "custom") log.label = log.careLabel || "Custom log";
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
    care_label: log.type === "care" || log.type === "custom" ? log.label : null,
  };
}

async function loadBabyProfile(userId) {
  const { data: existingProfile, error: selectError } = await supabase
    .from("baby_profiles")
    .select("id, name, birthday, custom_log_types, quick_log_order")
    .eq("user_id", userId)
    .maybeSingle();
  if (selectError) throw new Error(databaseError(selectError, "Loading baby profile"));
  if (existingProfile) return existingProfile;

  const { data: newProfile, error: insertError } = await supabase
    .from("baby_profiles")
    .insert({ user_id: userId, name: "Krish" })
    .select("id, name, birthday, custom_log_types, quick_log_order")
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
  activityActionMode = null;
  pendingDeleteLogId = null;
  confirmingClearLogs = false;
  activityActionError = "";
  profile = { id: null, name: "Krish", birthday: "", customLogTypes: [], quickLogOrder: [] };
  document.querySelector("#auth-screen").hidden = true;
  document.querySelector("#app-shell").hidden = false;
  document.querySelector("#activity-list").innerHTML = '<div class="activity-empty"><strong>Loading your little one\'s day…</strong></div>';
  setSyncError("");
  try {
    const profileRow = await loadBabyProfile(user.id);
    if (currentUserId !== user.id) return;
    profile = {
      id: profileRow.id,
      name: profileRow.name,
      birthday: profileRow.birthday || "",
      customLogTypes: profileRow.custom_log_types || [],
      quickLogOrder: profileRow.quick_log_order || [],
    };
    updateLogTypeOptions();
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
    activityActionMode = null;
    pendingDeleteLogId = null;
    confirmingClearLogs = false;
    activityActionError = "";
    profile = { id: null, name: "Krish", birthday: "", customLogTypes: [], quickLogOrder: [] };
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
      .select("id, name, birthday, custom_log_types, quick_log_order")
      .eq("user_id", currentUserId)
      .maybeSingle();
    if (error) throw new Error(databaseError(error, "Refreshing baby profile"));
    if (data && data.id === profile.id) {
      profile = {
        id: data.id,
        name: data.name,
        birthday: data.birthday || "",
        customLogTypes: data.custom_log_types || [],
        quickLogOrder: data.quick_log_order || [],
      };
      updateProfileLabels();
      updateLogTypeOptions();
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
quickActions.addEventListener("click", (event) => {
  if (Date.now() < suppressQuickLogClickUntil) return;
  const button = event.target.closest("[data-log-type]");
  if (button) openLogDialog(button.dataset.logType);
});
let suppressQuickLogClickUntil = 0;
quickActions.addEventListener("dragstart", (event) => {
  const card = event.target.closest("[data-log-type]");
  if (!card || quickLogOrderSaveInProgress) {
    event.preventDefault();
    return;
  }
  draggedQuickLogType = card.dataset.logType;
  card.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggedQuickLogType);
});
quickActions.addEventListener("dragover", (event) => {
  if (draggedQuickLogType) event.preventDefault();
});
quickActions.addEventListener("drop", (event) => {
  event.preventDefault();
  const target = event.target.closest("[data-log-type]");
  if (!target || !draggedQuickLogType) return;
  const rect = target.getBoundingClientRect();
  const horizontal = Math.abs(event.clientY - (rect.top + rect.height / 2)) < rect.height * 0.3;
  const before = horizontal
    ? event.clientX < rect.left + rect.width / 2
    : event.clientY < rect.top + rect.height / 2;
  reorderQuickLogCards(draggedQuickLogType, target.dataset.logType, before);
  void saveQuickLogOrder();
  suppressQuickLogClickUntil = Date.now() + 400;
});
quickActions.addEventListener("dragend", (event) => {
  event.target.closest("[data-log-type]")?.classList.remove("is-dragging");
  draggedQuickLogType = null;
});
quickActions.addEventListener("keydown", (event) => {
  if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
  const card = event.target.closest("[data-log-type]");
  if (!card) return;
  event.preventDefault();
  const cards = [...quickActions.children];
  const index = cards.indexOf(card);
  const nextIndex = index + (event.key === "ArrowUp" ? -1 : 1);
  if (nextIndex < 0 || nextIndex >= cards.length) return;
  reorderQuickLogCards(card.dataset.logType, cards[nextIndex].dataset.logType, event.key === "ArrowUp");
  card.focus();
  void saveQuickLogOrder();
});
document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
typeSelect.addEventListener("change", () => renderDynamicFields(typeSelect.value));
const activityFilter = document.querySelector("#activity-filter");
const activityPanel = document.querySelector("#activity");
activityFilter.addEventListener("change", renderActivity);

function changeOverviewDate(days) {
  const nextDate = new Date(overviewDate);
  nextDate.setDate(nextDate.getDate() + days);
  if (localDateKey(nextDate) > localDateKey(new Date())) return;
  overviewDate = nextDate;
  renderDashboard();
}

document.querySelector("#previous-overview-day").addEventListener("click", () => changeOverviewDate(-1));
document.querySelector("#next-overview-day").addEventListener("click", () => changeOverviewDate(1));
document.querySelector("#overview-date").addEventListener("change", (event) => {
  const value = event.currentTarget.value;
  if (!value) return;
  const selectedDate = new Date(`${value}T00:00:00`);
  if (Number.isNaN(selectedDate.getTime()) || localDateKey(selectedDate) > localDateKey(new Date())) {
    updateOverviewDateControls();
    return;
  }
  overviewDate = selectedDate;
  renderDashboard();
});

function showActivityCategory(filter) {
  activityFilter.value = filter;
  renderActivity();
  activityPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

const statsGrid = document.querySelector(".stats-grid");
statsGrid.addEventListener("click", (event) => {
  const card = event.target.closest("[data-activity-filter]");
  if (card) showActivityCategory(card.dataset.activityFilter);
});
statsGrid.addEventListener("keydown", (event) => {
  const card = event.target.closest("[data-activity-filter]");
  if (!card || !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  showActivityCategory(card.dataset.activityFilter);
});

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
  const logIdToUpdate = editingLogId;
  const selectedType = typeSelect.value;
  const customLabel = selectedType.startsWith("custom:") ? selectedType.slice("custom:".length) : "";
  const type = customLabel ? "custom" : selectedType;
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
    const amount = data.get("amountPreset") || data.get("amountCustom");
    entry.amount = amount ? Number(amount) : 0;
    entry.duration = data.get("duration") ? Number(data.get("duration")) : 0;
    entry.label = `${entry.method} feed`;
  } else if (type === "sleep") {
    const start = new Date(String(data.get("sleepStart")));
    const wakeTime = String(data.get("sleepEnd") || "");
    if (Number.isNaN(start.getTime())) {
      formError.textContent = "Please choose a valid sleep start time.";
      return;
    }
    if (start > new Date(Date.now() + 60000)) {
      formError.textContent = "Sleep start time can't be in the future.";
      return;
    }
    if (wakeTime) {
      const end = new Date(wakeTime);
      const duration = Math.round((end.getTime() - start.getTime()) / 60000);
      if (Number.isNaN(end.getTime()) || duration <= 0) {
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
    } else {
      entry.time = start.toISOString();
      entry.duration = 0;
      entry.label = "Sleep started";
    }
  } else if (type === "diaper") {
    entry.changeType = String(data.get("changeType"));
    entry.label = `${entry.changeType} diaper`;
  } else if (type === "custom") {
    entry.label = customLabel;
  } else {
    entry.label = String(data.get("label") || "").trim();
  }

  if (!profile.id) {
    formError.textContent = "Your baby profile is still loading. Please try again in a moment.";
    return;
  }
  saveButton.disabled = true;
  try {
    const query = supabase.from("care_logs");
    const request = logIdToUpdate
      ? query.update(toDatabaseLog(entry)).eq("id", logIdToUpdate).eq("baby_id", profile.id)
      : query.insert(toDatabaseLog(entry));
    const { data: savedRow, error } = await request
      .select("id, type, occurred_at, note, method, amount_ml, duration_minutes, change_type, care_label")
      .single();
    if (error) throw error;
    const savedLog = mapDatabaseLog(savedRow);
    if (logIdToUpdate) logs = logs.map((log) => log.id === logIdToUpdate ? savedLog : log);
    else logs.unshift(savedLog);
    logDialog.close();
    renderDashboard();
    setSyncError("");
    showToast(`${entry.label} ${logIdToUpdate ? "updated" : "saved"}`);
  } catch (error) {
    formError.textContent = databaseError(error, "Saving log");
  } finally {
    saveButton.disabled = false;
  }
});

activityList.addEventListener("click", async (event) => {
  const cancelDeleteButton = event.target.closest("[data-cancel-delete]");
  if (cancelDeleteButton) {
    pendingDeleteLogId = null;
    activityActionError = "";
    renderActivity();
    return;
  }
  const confirmDeleteButton = event.target.closest("[data-confirm-delete]");
  if (confirmDeleteButton && profile.id && !activityActionInProgress) {
    await deleteLog(confirmDeleteButton.dataset.confirmDelete);
    return;
  }
  const editButton = event.target.closest("[data-edit-log]");
  if (editButton) {
    const log = logs.find((item) => item.id === editButton.dataset.editLog);
    if (log) {
      activityActionMode = null;
      pendingDeleteLogId = null;
      renderActivity();
      openLogDialog(log.type === "custom" ? `custom:${log.careLabel}` : log.type, log);
    }
    return;
  }
  const button = event.target.closest("[data-delete-log]");
  if (!button) return;
  pendingDeleteLogId = button.dataset.deleteLog;
  activityActionError = "";
  renderActivity();
});

async function deleteLog(logId) {
  activityActionInProgress = true;
  activityActionError = "";
  renderActivity();
  try {
    const { error } = await supabase
      .from("care_logs")
      .delete()
      .eq("id", logId)
      .eq("baby_id", profile.id);
    if (error) throw error;
    logs = logs.filter((log) => log.id !== logId);
    pendingDeleteLogId = null;
    activityActionMode = null;
    renderDashboard();
    showToast("Log removed");
  } catch (error) {
    activityActionError = databaseError(error, "Removing log");
  } finally {
    activityActionInProgress = false;
    if (pendingDeleteLogId === logId) renderActivity();
  }
}

const clearLogsButton = document.querySelector("#clear-logs-button");
const confirmClearLogsButton = document.querySelector("#confirm-clear-logs");
clearLogsButton.addEventListener("click", () => {
  if (!logs.length || !profile.id) return;
  activityActionMode = null;
  pendingDeleteLogId = null;
  activityActionError = "";
  confirmingClearLogs = true;
  updateActivityControls();
  document.querySelector("#cancel-clear-logs").focus();
});

document.querySelector("#cancel-clear-logs").addEventListener("click", () => {
  confirmingClearLogs = false;
  activityActionError = "";
  updateActivityControls();
  clearLogsButton.focus();
});

document.querySelector("#cancel-log-action").addEventListener("click", () => {
  activityActionMode = null;
  pendingDeleteLogId = null;
  activityActionError = "";
  renderActivity();
});

document.querySelector("#edit-logs-mode").addEventListener("click", () => {
  activityActionMode = activityActionMode === "edit" ? null : "edit";
  pendingDeleteLogId = null;
  activityActionError = "";
  renderActivity();
});

document.querySelector("#delete-logs-mode").addEventListener("click", () => {
  activityActionMode = activityActionMode === "delete" ? null : "delete";
  pendingDeleteLogId = null;
  activityActionError = "";
  renderActivity();
});

confirmClearLogsButton.addEventListener("click", async () => {
  if (!logs.length || !profile.id || activityActionInProgress) {
    return;
  }
  activityActionInProgress = true;
  activityActionError = "";
  confirmClearLogsButton.disabled = true;
  document.querySelector("#cancel-clear-logs").disabled = true;
  try {
    const { error } = await supabase.from("care_logs").delete().eq("baby_id", profile.id);
    if (error) throw error;
    logs = [];
    confirmingClearLogs = false;
    renderDashboard();
    showToast("All logs removed");
  } catch (error) {
    activityActionError = databaseError(error, "Removing logs");
    updateActivityControls();
  } finally {
    activityActionInProgress = false;
    confirmClearLogsButton.disabled = false;
    document.querySelector("#cancel-clear-logs").disabled = false;
  }
});

function openProfileDialog() {
  document.querySelector("#profile-error").textContent = "";
  document.querySelector("#baby-name").value = profile.name;
  document.querySelector("#baby-birthday").value = profile.birthday;
  draftCustomLogTypes = [...profile.customLogTypes];
  draftQuickLogOrder = normalizeQuickLogOrder(profile.quickLogOrder, draftCustomLogTypes);
  renderCustomLogTypes();
  profileDialog.showModal();
  document.querySelector("#baby-name").focus();
}
document.querySelector("#profile-button").addEventListener("click", openProfileDialog);
document.querySelector("#profile-button-mobile").addEventListener("click", openProfileDialog);

function renderCustomLogTypes() {
  const list = document.querySelector("#custom-log-type-list");
  list.innerHTML = draftCustomLogTypes.length
    ? draftCustomLogTypes.map((name, index) => `<li><span>${escapeHTML(name)}</span><button class="text-button" type="button" data-remove-custom-log="${index}" aria-label="Remove ${escapeHTML(name)} log option">Remove</button></li>`).join("")
    : '<li class="custom-log-type-empty">No custom log options yet.</li>';
  renderQuickLogOrderList();
}

function quickLogLabel(type) {
  if (type.startsWith("custom:")) return type.slice("custom:".length);
  return ({ feed: "Feeding", sleep: "Sleep", diaper: "Diaper", care: "Other care" })[type] || type;
}

function renderQuickLogOrderList() {
  const list = document.querySelector("#quick-log-order-list");
  draftQuickLogOrder = normalizeQuickLogOrder(draftQuickLogOrder, draftCustomLogTypes);
  list.innerHTML = draftQuickLogOrder.map((type, index) => `<li draggable="true" data-order-type="${escapeHTML(type)}">
    <span class="quick-log-order-name">${escapeHTML(quickLogLabel(type))}</span>
    <span class="quick-log-order-controls">
      <button type="button" class="order-move-button" data-move-order="up" aria-label="Move ${escapeHTML(quickLogLabel(type))} up"${index === 0 ? " disabled" : ""}>Up</button>
      <button type="button" class="order-move-button" data-move-order="down" aria-label="Move ${escapeHTML(quickLogLabel(type))} down"${index === draftQuickLogOrder.length - 1 ? " disabled" : ""}>Down</button>
    </span>
  </li>`).join("");
}

document.querySelector("#quick-log-order-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-move-order]");
  if (!button) return;
  const item = button.closest("[data-order-type]");
  const index = draftQuickLogOrder.indexOf(item.dataset.orderType);
  const nextIndex = index + (button.dataset.moveOrder === "up" ? -1 : 1);
  if (nextIndex < 0 || nextIndex >= draftQuickLogOrder.length) return;
  [draftQuickLogOrder[index], draftQuickLogOrder[nextIndex]] = [draftQuickLogOrder[nextIndex], draftQuickLogOrder[index]];
  renderQuickLogOrderList();
  document.querySelector(`[data-order-type="${CSS.escape(item.dataset.orderType)}"] [data-move-order="${button.dataset.moveOrder}"]`)?.focus();
});

document.querySelector("#quick-log-order-list").addEventListener("dragstart", (event) => {
  const item = event.target.closest("[data-order-type]");
  if (!item) return;
  draggedProfileOrderType = item.dataset.orderType;
  item.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggedProfileOrderType);
});

document.querySelector("#quick-log-order-list").addEventListener("dragover", (event) => {
  if (draggedProfileOrderType) event.preventDefault();
});

document.querySelector("#quick-log-order-list").addEventListener("drop", (event) => {
  event.preventDefault();
  const target = event.target.closest("[data-order-type]");
  if (!target || !draggedProfileOrderType) return;
  const fromIndex = draftQuickLogOrder.indexOf(draggedProfileOrderType);
  if (fromIndex < 0 || draggedProfileOrderType === target.dataset.orderType) return;
  const rect = target.getBoundingClientRect();
  const before = event.clientY < rect.top + rect.height / 2;
  const [moved] = draftQuickLogOrder.splice(fromIndex, 1);
  const targetIndex = draftQuickLogOrder.indexOf(target.dataset.orderType);
  draftQuickLogOrder.splice(targetIndex + (before ? 0 : 1), 0, moved);
  renderQuickLogOrderList();
});

document.querySelector("#quick-log-order-list").addEventListener("dragend", (event) => {
  event.target.closest("[data-order-type]")?.classList.remove("is-dragging");
  draggedProfileOrderType = null;
});

document.querySelector("#add-custom-log-type").addEventListener("click", () => {
  const input = document.querySelector("#new-custom-log-type");
  const error = document.querySelector("#custom-log-type-error");
  const name = input.value.trim();
  error.textContent = "";
  if (!name) {
    error.textContent = "Enter a name for this log option.";
  } else if (name.length > 60) {
    error.textContent = "Log option names must be 60 characters or fewer.";
  } else if (["feeding", "sleep", "diaper", "diaper change", "other care"].includes(name.toLocaleLowerCase())) {
    error.textContent = "That name is already used by a built-in log option.";
  } else if (draftCustomLogTypes.some((existing) => existing.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    error.textContent = "That custom log option already exists.";
  } else if (draftCustomLogTypes.length >= maxCustomLogTypes) {
    error.textContent = `You can add up to ${maxCustomLogTypes} custom log options.`;
  } else {
    draftCustomLogTypes.push(name);
    input.value = "";
    renderCustomLogTypes();
    input.focus();
  }
});

document.querySelector("#new-custom-log-type").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    document.querySelector("#add-custom-log-type").click();
  }
});

document.querySelector("#custom-log-type-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-custom-log]");
  if (!button) return;
  draftCustomLogTypes.splice(Number(button.dataset.removeCustomLog), 1);
  renderCustomLogTypes();
});

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
      .update({
        name,
        birthday: birthday || null,
        custom_log_types: draftCustomLogTypes,
        quick_log_order: normalizeQuickLogOrder(draftQuickLogOrder, draftCustomLogTypes),
      })
      .eq("id", profile.id)
      .select("id, name, birthday, custom_log_types, quick_log_order")
      .single();
    if (error) throw error;
    profile = {
      id: data.id,
      name: data.name,
      birthday: data.birthday || "",
      customLogTypes: data.custom_log_types || [],
      quickLogOrder: data.quick_log_order || [],
    };
    updateProfileLabels();
    updateLogTypeOptions();
    renderDashboard();
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
    .then((registration) => registration.update())
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
