import { createClient } from "@supabase/supabase-js";
import vaccinationReference from "./vaccination-reference.json";

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
const defaultCareLogTypes = ["Urine", "Stool"];
const maxCustomLogTypes = 12;
const logDialog = document.querySelector("#log-dialog");
const overallLogDialog = document.querySelector("#overall-log-dialog");
const healthRecordDialog = document.querySelector("#health-record-dialog");
const profileDialog = document.querySelector("#profile-dialog");
const passwordDialog = document.querySelector("#password-dialog");
const logForm = document.querySelector("#log-form");
const typeSelect = document.querySelector("#log-type");
const dynamicFields = document.querySelector("#dynamic-fields");
const activityList = document.querySelector("#activity-list");
const quickActions = document.querySelector("#quick-actions");
const toast = document.querySelector("#toast");

let logs = [];
let healthRecords = [];
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
let overallSelectedTypes = new Set();
let overallFieldIdCounter = 0;
let editingHealthRecordId = null;
let pendingDeleteHealthRecordId = null;
let healthRecordActionError = "";
let healthRecordActionInProgress = false;

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
  const sleepLogs = logs.filter((log) => log.type === "sleep");
  const sleepMinutes = sleepLogs.reduce((total, log) => total + sleepDurationForDay(log, overviewDate), 0);
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
  const endTime = new Date(log.time).getTime();
  const duration = Number(log.duration);
  const startTime = duration > 0 ? endTime - duration * 60000 : endTime;
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const intervalStart = Math.max(startTime, dayStart.getTime());
  const intervalEnd = Math.min(duration > 0 ? endTime : Date.now(), dayEnd.getTime());
  return Math.max(0, Math.floor((intervalEnd - intervalStart) / 60000));
}

function renderCustomOverviewCards(todayLogs) {
  const statsGrid = document.querySelector(".stats-grid");
  statsGrid.querySelectorAll("[data-custom-overview]").forEach((card) => card.remove());
  for (const name of allCareLogTypes()) {
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
    const breastDurations = [
      log.leftDuration ? `Left ${log.leftDuration} min` : "",
      log.rightDuration ? `Right ${log.rightDuration} min` : "",
    ].filter(Boolean);
    const parts = [escapeHTML(log.method || ""), log.amount ? `${log.amount} ml` : "", ...breastDurations, log.duration ? `${log.duration} min` : ""].filter(Boolean);
    return parts.join(" · ") || "Feeding";
  }
  if (log.type === "diaper") return escapeHTML(log.changeType || "Diaper changed");
  if (log.type === "custom") return "Custom log";
  return "Care moment";
}

function sleepActivityDetails(log) {
  const duration = sleepDurationMinutes(log);
  const storedTime = new Date(log.time);
  let timing = `Asleep at ${formatTime(storedTime)} · Still asleep`;
  if (Number(log.duration) > 0) {
    const start = new Date(storedTime.getTime() - Number(log.duration) * 60000);
    const wakeDate = localDateKey(storedTime) !== localDateKey(start)
      ? `${formatDate(storedTime, { weekday: "short", month: "short", day: "numeric" })} `
      : "";
    timing = `Asleep at ${formatTime(start)} · Woke up ${wakeDate}at ${formatTime(storedTime)}`;
  }
  const note = log.note ? `<small class="activity-note">Note: ${escapeHTML(log.note)}</small>` : "";
  return `<span class="activity-sleep-details">
    <small class="activity-sleep-duration">${formatSleepDuration(duration)}</small>
    <small class="activity-sleep-times">${timing}</small>
    ${note}
  </span>`;
}

function sleepDurationMinutes(log) {
  if (Number(log.duration) > 0) return Number(log.duration);
  return Math.max(0, Math.floor((Date.now() - new Date(log.time).getTime()) / 60000));
}

function formatSleepDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return hours ? `${hours}h ${remainingMinutes}m` : `${remainingMinutes} min`;
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
  const activityDetails = log.type === "sleep"
    ? sleepActivityDetails(log)
    : `<small>${activityDescription(log)}${note}</small>`;
  return `<article class="activity-item">
    <span class="activity-type-icon ${log.type}">${icons[log.type] || icons.care}</span>
    <span class="activity-copy${log.type === "sleep" ? " sleep-activity-copy" : ""}"><strong>${escapeHTML(label)}</strong>${activityDetails}</span>
    <span class="activity-meta"><time class="activity-time" datetime="${escapeHTML(when.toISOString())}">${formatTime(when)}</time>${actionMarkup}</span>
    ${confirmationMarkup}
    ${isPendingDelete && activityActionError ? `<span class="activity-action-error" role="alert">${escapeHTML(activityActionError)}</span>` : ""}
  </article>`;
}

function healthRecordFormFields(type) {
  const date = localDateKey(new Date());
  if (type === "vaccination") {
    return `<div class="form-field"><label for="health-title">Vaccine name</label><input id="health-title" name="title" list="vaccine-name-options" maxlength="120" placeholder="e.g. DTaP" required />${vaccineNameOptionsMarkup()}</div>
      <div class="form-row"><div class="form-field"><label for="health-occurred-on">Date given</label><input id="health-occurred-on" name="occurredOn" type="date" value="${date}" required /></div><div class="form-field"><label for="health-dose">Dose <span class="optional">(optional)</span></label><input id="health-dose" name="dose" maxlength="40" placeholder="e.g. 2 of 4" /></div></div>
      <div class="form-row"><div class="form-field"><label for="health-provider">Given by <span class="optional">(optional)</span></label><input id="health-provider" name="providerName" maxlength="120" placeholder="Clinician's name" /></div><div class="form-field"><label for="health-facility">Clinic or hospital <span class="optional">(optional)</span></label><input id="health-facility" name="facilityName" maxlength="160" placeholder="Where it was given" /></div></div>
      <div class="form-row"><div class="form-field"><label for="health-manufacturer">Manufacturer <span class="optional">(optional)</span></label><input id="health-manufacturer" name="manufacturer" maxlength="120" /></div><div class="form-field"><label for="health-lot-number">Lot / batch number <span class="optional">(optional)</span></label><input id="health-lot-number" name="lotNumber" maxlength="80" /></div></div>
      <div class="form-row"><div class="form-field"><label for="health-next-due-date">Next dose due <span class="optional">(optional)</span></label><input id="health-next-due-date" name="nextDueDate" type="date" /><small class="health-field-hint">Use the date recommended by your healthcare provider.</small></div><div class="form-field"><label for="health-next-due-time">Time <span class="optional">(optional)</span></label><input id="health-next-due-time" name="nextDueTime" type="time" /></div></div>
      <div class="form-field"><label for="health-notes">Notes <span class="optional">(optional)</span></label><textarea id="health-notes" name="notes" rows="3" maxlength="2000" placeholder="Reaction, guidance, or anything to remember"></textarea></div>`;
  }
  return `<div class="form-row"><div class="form-field"><label for="health-category">Visit type</label><select id="health-category" name="category"><option>Pediatrician</option><option>Specialist</option><option>Lab / test</option><option>Hospital / urgent care</option><option>Other</option></select></div><div class="form-field"><label for="health-occurred-on">Visit / appointment date</label><input id="health-occurred-on" name="occurredOn" type="date" value="${date}" required /></div></div>
    <div class="form-field"><label for="health-occurred-time">Appointment time <span class="optional">(optional)</span></label><input id="health-occurred-time" name="occurredTime" type="time" /><small class="health-field-hint">Choose a future date and time to list this under Upcoming care.</small></div>
    <div class="form-field"><label for="health-title">Visit or appointment</label><input id="health-title" name="title" maxlength="120" placeholder="e.g. First pediatrician visit" required /></div>
    <div class="form-row"><div class="form-field"><label for="health-provider">Provider <span class="optional">(optional)</span></label><input id="health-provider" name="providerName" maxlength="120" placeholder="Doctor or clinician" /></div><div class="form-field"><label for="health-facility">Facility <span class="optional">(optional)</span></label><input id="health-facility" name="facilityName" maxlength="160" placeholder="Clinic, lab, or hospital" /></div></div>
    <div class="form-field"><label for="health-reason">Reason for visit <span class="optional">(optional)</span></label><textarea id="health-reason" name="reason" rows="2" maxlength="500" placeholder="Symptoms, routine checkup, or test requested"></textarea></div>
    <div class="form-field"><label for="health-results">Assessment or test results <span class="optional">(optional)</span></label><textarea id="health-results" name="results" rows="3" maxlength="2000" placeholder="Findings, diagnosis, or treatment plan"></textarea></div>
    <div class="form-row"><div class="form-field"><label for="health-follow-up-date">Follow-up date <span class="optional">(optional)</span></label><input id="health-follow-up-date" name="followUpDate" type="date" /></div><div class="form-field"><label for="health-follow-up-time">Time <span class="optional">(optional)</span></label><input id="health-follow-up-time" name="followUpTime" type="time" /></div></div>
    <div class="form-field"><label for="health-notes">Notes or instructions <span class="optional">(optional)</span></label><textarea id="health-notes" name="notes" rows="3" maxlength="2000" placeholder="Medication instructions or questions for next time"></textarea></div>`;
}

function renderHealthRecordList() {
  const list = document.querySelector("#health-record-list");
  const filter = document.querySelector("#health-filter").value;
  const records = healthRecords
    .filter((record) => filter === "all" || record.recordType === filter)
    .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn));
  const today = localDateKey(new Date());
  const scheduledItems = healthRecords.flatMap((record) => {
    const items = [];
    if (record.recordType === "visit" && record.occurredOn >= today) {
      items.push({
        title: record.title,
        category: record.category || "Doctor visit",
        date: record.occurredOn,
        time: record.occurredTime,
      });
    }
    const dueDate = record.recordType === "vaccination" ? record.nextDueDate : record.followUpDate;
    if (dueDate) {
      items.push({
        title: record.title,
        category: record.recordType === "vaccination" ? "Vaccination" : "Follow-up",
        date: dueDate,
        time: record.recordType === "vaccination" ? record.nextDueTime : record.followUpTime,
      });
    }
    return items;
  }).sort((a, b) => a.date.localeCompare(b.date) || (a.time || "99:99").localeCompare(b.time || "99:99"));
  const overdueItems = scheduledItems.filter((item) => item.date < today);
  const upcomingItems = scheduledItems.filter((item) => item.date >= today);
  const renderScheduledItems = (items) => items.slice(0, 3).map((item) => {
    const eventDate = new Date(`${item.date}T00:00:00`);
    const dayLabel = formatDate(eventDate, { day: "numeric" });
    const monthLabel = formatDate(eventDate, { month: "short" });
    const yearLabel = formatDate(eventDate, { year: "numeric" });
    const weekday = formatDate(eventDate, { weekday: "long" });
    const timeLabel = item.time
      ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(`2000-01-01T${item.time}`))
      : "Time not set";
    return `<li class="health-scheduled-item">
      <time class="health-scheduled-date" datetime="${escapeHTML(item.date)}"><strong>${escapeHTML(dayLabel)}</strong><span>${escapeHTML(monthLabel)}</span></time>
      <div class="health-scheduled-copy"><span class="health-scheduled-category">${escapeHTML(item.category)}</span><strong>${escapeHTML(item.title)}</strong><span class="health-scheduled-time"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></svg>${escapeHTML(weekday)} · ${escapeHTML(timeLabel)}</span></div>
      <span class="health-scheduled-year">${escapeHTML(yearLabel)}</span>
    </li>`;
  }).join("");
  const overview = document.querySelector("#health-overview");
  overview.innerHTML = `${upcomingItems.length
    ? `<section class="health-schedule-group"><div class="health-schedule-heading"><strong>Upcoming care</strong><button class="text-button health-schedule-add" type="button" data-schedule-appointment>+ Appointment</button></div><ul class="health-scheduled-list">${renderScheduledItems(upcomingItems)}</ul>${upcomingItems.length > 3 ? `<span class="health-schedule-more">${upcomingItems.length - 3} more upcoming ${upcomingItems.length - 3 === 1 ? "item" : "items"}</span>` : ""}</section>`
    : `<section class="health-schedule-group"><div class="health-schedule-heading"><strong>Upcoming care</strong><button class="text-button health-schedule-add" type="button" data-schedule-appointment>+ Appointment</button></div><span class="health-schedule-empty">No appointments yet. Add one to keep the date and time handy.</span></section>`}
    ${overdueItems.length ? `<section class="health-schedule-group health-overview-overdue"><strong>${overdueItems.length} past-due ${overdueItems.length === 1 ? "item" : "items"} to review</strong><ul class="health-scheduled-list">${renderScheduledItems(overdueItems)}</ul></section>` : ""}`;

  if (!records.length) {
    list.innerHTML = `<div class="health-empty"><span class="health-empty-icon" aria-hidden="true">+</span><strong>${healthRecords.length ? "No records in this view" : "Your baby's health history starts here"}</strong><p>${healthRecords.length ? "Choose another filter to see more records." : "Save vaccine details, checkups, test results, and follow-up dates in one private place."}</p><button class="button button-secondary" type="button" data-add-health-record>Add a health record</button></div>`;
    return;
  }
  list.innerHTML = records.map((record) => {
    const isPendingDelete = pendingDeleteHealthRecordId === record.id;
    const formatScheduledValue = (date, time) => {
      if (!date) return "";
      const dateLabel = formatDate(new Date(`${date}T00:00:00`), { month: "short", day: "numeric", year: "numeric" });
      if (!time) return dateLabel;
      const timeLabel = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" })
        .format(new Date(`2000-01-01T${time}`));
      return `${dateLabel} · ${timeLabel}`;
    };
    const facts = record.recordType === "vaccination"
      ? [
        ["Dose", record.dose],
        ["Given by", record.providerName],
        ["Clinic or hospital", record.facilityName],
        ["Product / manufacturer", record.manufacturer],
        ["Lot / batch", record.lotNumber],
        ["Next dose", formatScheduledValue(record.nextDueDate, record.nextDueTime)],
        ["Notes", record.notes],
      ]
      : [
        ["Appointment time", record.occurredTime && new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(`2000-01-01T${record.occurredTime}`))],
        ["Provider", record.providerName],
        ["Facility", record.facilityName],
        ["Reason for visit", record.reason],
        ["Results / assessment", record.results],
        ["Follow-up", formatScheduledValue(record.followUpDate, record.followUpTime)],
        ["Notes", record.notes],
      ];
    const visibleFacts = facts.filter(([, value]) => value);
    const followUpDate = record.recordType === "vaccination" ? record.nextDueDate : record.followUpDate;
    const followUpLabel = record.recordType === "vaccination" ? "Next dose" : "Follow-up";
    const scheduledBadge = record.occurredOn > today
      ? '<span class="health-due-badge">Scheduled</span>'
      : "";
    const dueBadge = followUpDate && followUpDate < today
      ? `<span class="health-due-badge overdue">${followUpLabel} was due</span>`
      : "";
    return `<article class="health-record-card">
      <div class="health-record-icon ${record.recordType}" aria-hidden="true">${record.recordType === "vaccination" ? "＋" : "♡"}</div>
      <div class="health-record-content">
        <div class="health-record-title-row"><span class="health-record-type">${record.recordType === "vaccination" ? "VACCINATION" : escapeHTML(record.category || "DOCTOR VISIT")}</span><time datetime="${escapeHTML(record.occurredOn)}">${formatDate(new Date(`${record.occurredOn}T00:00:00`), { month: "short", day: "numeric", year: "numeric" })}</time></div>
        <h3>${escapeHTML(record.title)}</h3>
        ${visibleFacts.length ? `<dl class="health-record-facts">${visibleFacts.map(([label, value]) => `<div class="health-record-fact"><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>`).join("")}</dl>` : ""}
        ${scheduledBadge}${dueBadge ? ` ${dueBadge}` : ""}
        ${isPendingDelete
          ? `<div class="health-delete-confirmation" role="group" aria-label="Confirm deleting ${escapeHTML(record.title)}"><span>Delete this record?</span><button class="button button-secondary" type="button" data-cancel-health-delete>No</button><button class="button button-danger" type="button" data-confirm-health-delete="${escapeHTML(record.id)}"${healthRecordActionInProgress ? " disabled" : ""}>Yes, delete</button></div>`
          : `<div class="health-record-actions"><button class="text-button" type="button" data-edit-health-record="${escapeHTML(record.id)}">Edit</button><button class="text-button" type="button" data-delete-health-record="${escapeHTML(record.id)}">Delete</button></div>`}
        ${isPendingDelete && healthRecordActionError ? `<p class="health-action-error" role="alert">${escapeHTML(healthRecordActionError)}</p>` : ""}
      </div>
    </article>`;
  }).join("");
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

function dynamicFieldsMarkup(type, prefix = "", includeSleepStart = true) {
  const fieldId = (name) => `${prefix}${name}`;
  if (type === "feed") {
    return `<div class="form-field"><span class="form-field-label" id="${fieldId("feed-method-label")}">Feeding type</span><input id="${fieldId("feed-method")}" name="method" type="hidden" value="Breastfeeding" /><div class="feed-method-options" role="group" aria-labelledby="${fieldId("feed-method-label")}">
        <button class="feed-method-option" type="button" data-feed-method="Breastfeeding" aria-pressed="true">Breastfeeding</button>
        <button class="feed-method-option" type="button" data-feed-method="Bottle" aria-pressed="false">Bottle</button>
        <button class="feed-method-option" type="button" data-feed-method="Solids" aria-pressed="false">Solids</button>
      </div></div>
      <div class="form-row feed-breastfeeding-fields" data-breastfeeding-fields>
        ${["left", "right"].map((side) => `<div class="form-field breast-duration-field"><span class="form-field-label" id="${fieldId(`feed-${side}-duration-label`)}">${side === "left" ? "Left" : "Right"} breast <span class="optional">(min)</span></span><input id="${fieldId(`feed-${side}-duration-preset`)}" name="${side}DurationPreset" type="hidden" value="" /><div class="breast-duration-options" role="group" aria-labelledby="${fieldId(`feed-${side}-duration-label`)}">
          ${[5, 10, 15, 20, 25, 30].map((minutes) => `<button class="breast-duration-option" type="button" data-breast-duration="${minutes}" aria-pressed="false">${minutes}</button>`).join("")}
          <button class="breast-duration-option" type="button" data-breast-duration="other" aria-pressed="false">Other</button>
        </div><div class="breast-duration-custom" id="${fieldId(`feed-${side}-duration-custom-field`)}" hidden><label for="${fieldId(`feed-${side}-duration-custom`)}">Enter minutes</label><input id="${fieldId(`feed-${side}-duration-custom`)}" name="${side}DurationCustom" type="number" min="1" max="600" step="1" placeholder="Minutes" disabled /></div></div>`).join("")}
      </div>
      <p class="form-hint feed-breastfeeding-hint">Record time latched on each side. Leave a side blank if it wasn't used.</p>
      <div class="form-row feed-standard-fields"><div class="form-field"><span class="form-field-label" id="${fieldId("feed-amount-label")}">Amount <span class="optional">(ml)</span></span><input id="${fieldId("feed-amount-preset")}" name="amountPreset" type="hidden" value="" /><div class="feed-amount-options" role="group" aria-labelledby="${fieldId("feed-amount-label")}">
        <button class="feed-amount-option" type="button" data-feed-amount="10" aria-pressed="false">10</button>
        <button class="feed-amount-option" type="button" data-feed-amount="20" aria-pressed="false">20</button>
        <button class="feed-amount-option" type="button" data-feed-amount="30" aria-pressed="false">30</button>
        <button class="feed-amount-option" type="button" data-feed-amount="40" aria-pressed="false">40</button>
        <button class="feed-amount-option" type="button" data-feed-amount="50" aria-pressed="false">50</button>
        <button class="feed-amount-option" type="button" data-feed-amount="60" aria-pressed="false">60</button>
        <button class="feed-amount-option" type="button" data-feed-amount="other" aria-pressed="false">Other</button>
      </div><div class="form-field" id="${fieldId("feed-custom-amount-field")}" hidden><label for="${fieldId("feed-custom-amount")}">Enter amount <span class="optional">(ml)</span></label><input id="${fieldId("feed-custom-amount")}" name="amountCustom" type="number" min="0" max="2000" step="1" disabled /></div></div><div class="form-field feed-duration-field"><span class="form-field-label" id="${fieldId("feed-duration-label")}">Duration <span class="optional">(min)</span></span><input id="${fieldId("feed-duration-preset")}" name="durationPreset" type="hidden" value="" /><div class="feed-duration-options" role="group" aria-labelledby="${fieldId("feed-duration-label")}">
        ${[5, 10, 15, 20, 25, 30].map((minutes) => `<button class="feed-duration-option" type="button" data-feed-duration="${minutes}" aria-pressed="false">${minutes}</button>`).join("")}
        <button class="feed-duration-option" type="button" data-feed-duration="other" aria-pressed="false">Other</button>
      </div><div class="feed-duration-custom" id="${fieldId("feed-duration-custom-field")}" hidden><label for="${fieldId("feed-duration-custom")}">Enter minutes</label><input id="${fieldId("feed-duration-custom")}" name="durationCustom" type="number" min="1" max="600" step="1" placeholder="Minutes" disabled /></div><input id="${fieldId("feed-duration")}" name="duration" type="hidden" value="" /></div></div>`;
  } else if (type === "sleep") {
    const startField = includeSleepStart
      ? `<div class="form-field"><label for="${fieldId("sleep-start")}">Fell asleep</label><input id="${fieldId("sleep-start")}" name="sleepStart" type="datetime-local" value="${dateTimeValue(new Date())}" required /></div>`
      : "";
    return `<div class="form-row">${startField}<div class="form-field"><label for="${fieldId("sleep-end")}">Woke up <span class="optional">(optional)</span></label><input id="${fieldId("sleep-end")}" name="sleepEnd" type="datetime-local" /></div></div><p class="form-hint">Save now while your baby sleeps. Add the wake-up time later by editing this log.</p>`;
  } else if (type === "diaper") {
    return `<div class="form-field"><label for="${fieldId("diaper-type")}">Change type</label><select id="${fieldId("diaper-type")}" name="changeType"><option>Wet</option><option>Dirty</option><option>Wet &amp; dirty</option><option>Dry</option></select></div>`;
  } else if (type.startsWith("custom:")) {
    const name = type.slice("custom:".length);
    return `<div class="form-field"><span class="form-field-label">${escapeHTML(name)}</span><p class="form-hint">Add any details you'd like to remember.</p></div>`;
  }
  return `<div class="form-field"><label for="${fieldId("care-label")}">Care moment</label><input id="${fieldId("care-label")}" name="label" maxlength="60" placeholder="e.g. Bath, tummy time, medicine" required /></div>`;
}

function renderDynamicFields(type) {
  dynamicFields.innerHTML = dynamicFieldsMarkup(type);
}

dynamicFields.addEventListener("click", handleDynamicFieldButton);
document.querySelector("#overall-log-details").addEventListener("click", handleDynamicFieldButton);
document.querySelector("#overall-log-options").addEventListener("click", (event) => {
  const button = event.target.closest("[data-overall-type]");
  if (button) toggleOverallLogType(button.dataset.overallType, button);
});
document.querySelector("#open-overall-log").addEventListener("click", openOverallLogDialog);
overallLogDialog.addEventListener("close", () => overallSelectedTypes.clear());

function logTypeLabel(type) {
  if (type.startsWith("custom:")) return type.slice("custom:".length);
  return ({ feed: "Feeding", sleep: "Sleep", diaper: "Diaper", care: "Other care" })[type] || type;
}

function renderOverallLogOptions() {
  const options = document.querySelector("#overall-log-options");
  const types = ["feed", "sleep", "diaper", "care", ...allCareLogTypes().map((name) => `custom:${name}`)];
  options.replaceChildren(...types.map((type) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "overall-log-option";
    button.dataset.overallType = type;
    button.setAttribute("aria-pressed", "false");
    button.textContent = logTypeLabel(type);
    return button;
  }));
}

function openOverallLogDialog() {
  overallSelectedTypes.clear();
  overallFieldIdCounter = 0;
  document.querySelector("#overall-log-time").value = dateTimeValue(new Date());
  document.querySelector("#overall-log-notes").value = "";
  document.querySelector("#overall-log-error").textContent = "";
  document.querySelector("#overall-log-details").replaceChildren();
  renderOverallLogOptions();
  overallLogDialog.showModal();
  overallLogDialog.querySelector(".close-button").focus();
}

function toggleOverallLogType(type, button) {
  const details = document.querySelector("#overall-log-details");
  if (overallSelectedTypes.has(type)) {
    overallSelectedTypes.delete(type);
    details.querySelector(`[data-selected-log-type="${CSS.escape(type)}"]`)?.remove();
    button.setAttribute("aria-pressed", "false");
    return;
  }
  overallSelectedTypes.add(type);
  button.setAttribute("aria-pressed", "true");
  const section = document.createElement("section");
  const prefix = `overall-${overallFieldIdCounter++}-`;
  section.className = "overall-log-section";
  section.dataset.selectedLogType = type;
  section.innerHTML = `<h3>${escapeHTML(logTypeLabel(type))}</h3><div data-log-fields>${dynamicFieldsMarkup(type, prefix, false)}</div>`;
  details.append(section);
}

function buildLogEntry(type, fields, timeValue, note) {
  const getValue = (name) => fields.querySelector(`[name="${name}"]`)?.value || "";
  const customLabel = type.startsWith("custom:") ? type.slice("custom:".length) : "";
  const logType = customLabel ? "custom" : type;
  const start = new Date(timeValue);
  if (Number.isNaN(start.getTime())) return { error: "Please choose a valid date and time." };
  if (logType !== "sleep" && start > new Date(Date.now() + 60000)) {
    return { error: "Log time can't be in the future." };
  }

  const entry = {
    type: logType,
    time: start.toISOString(),
    note: note.trim(),
  };
  if (logType === "feed") {
    entry.method = getValue("method");
    const amount = getValue("amountPreset") || getValue("amountCustom");
    entry.amount = amount ? Number(amount) : 0;
    const durationPreset = getValue("durationPreset");
    const durationCustom = getValue("durationCustom");
    if (durationPreset === "other" && (!durationCustom || !Number.isInteger(Number(durationCustom)) || Number(durationCustom) < 1 || Number(durationCustom) > 600)) {
      return { error: "Enter a valid feeding duration from 1 to 600 minutes." };
    }
    entry.duration = durationPreset === "other" ? Number(durationCustom) : durationPreset ? Number(durationPreset) : 0;
    if (!durationPreset && getValue("duration")) entry.duration = Number(getValue("duration"));
    if (entry.method === "Breastfeeding") {
      for (const side of ["left", "right"]) {
        const preset = getValue(`${side}DurationPreset`);
        const custom = getValue(`${side}DurationCustom`);
        if (preset === "other" && (!custom || !Number.isInteger(Number(custom)) || Number(custom) < 1 || Number(custom) > 600)) {
          return { error: `Enter a valid ${side} breast duration from 1 to 600 minutes.` };
        }
        entry[`${side}Duration`] = preset === "other" ? Number(custom) : preset ? Number(preset) : 0;
      }
    } else {
      entry.leftDuration = 0;
      entry.rightDuration = 0;
    }
    entry.label = `${entry.method} feed`;
  } else if (logType === "sleep") {
    const sleepStartValue = getValue("sleepStart") || timeValue;
    const sleepStart = new Date(sleepStartValue);
    if (Number.isNaN(sleepStart.getTime())) return { error: "Please choose a valid sleep start time." };
    if (sleepStart > new Date(Date.now() + 60000)) return { error: "Sleep start time can't be in the future." };
    const wakeTime = getValue("sleepEnd");
    if (wakeTime) {
      const end = new Date(wakeTime);
      const duration = Math.round((end.getTime() - sleepStart.getTime()) / 60000);
      if (Number.isNaN(end.getTime()) || duration <= 0) {
        return { error: "Wake-up time must be after the nap started." };
      }
      if (end > new Date(Date.now() + 60000)) return { error: "Wake-up time can't be in the future." };
      entry.time = end.toISOString();
      entry.duration = duration;
      entry.label = "Nap";
    } else {
      entry.time = sleepStart.toISOString();
      entry.duration = 0;
      entry.label = "Sleep started";
    }
  } else if (logType === "diaper") {
    entry.changeType = getValue("changeType");
    entry.label = `${entry.changeType} diaper`;
  } else if (logType === "custom") {
    entry.label = customLabel;
  } else {
    entry.label = getValue("label").trim();
  }
  return { entry };
}

function handleDynamicFieldButton(event) {
  const methodButton = event.target.closest("[data-feed-method]");
  const amountButton = event.target.closest("[data-feed-amount]");
  const breastDurationButton = event.target.closest("[data-breast-duration]");
  const feedDurationButton = event.target.closest("[data-feed-duration]");
  const button = methodButton || amountButton || breastDurationButton || feedDurationButton;
  if (!button) return;
  const fields = button.closest("[data-log-fields]") || dynamicFields;
  if (methodButton) {
    const method = methodButton.dataset.feedMethod;
    fields.querySelector('[name="method"]').value = method;
    fields.querySelectorAll("[data-feed-method]").forEach((option) => {
      option.setAttribute("aria-pressed", String(option === methodButton));
    });
    fields.querySelector("[data-breastfeeding-fields]").hidden = method !== "Breastfeeding";
    fields.querySelectorAll(".breast-duration-field").forEach((group) => {
      const selectedOther = group.querySelector('[data-breast-duration="other"]').getAttribute("aria-pressed") === "true";
      const customInput = group.querySelector('input[type="number"]');
      customInput.disabled = method !== "Breastfeeding" || !selectedOther;
      customInput.required = method === "Breastfeeding" && selectedOther;
    });
    return;
  }
  if (breastDurationButton) {
    const group = breastDurationButton.closest(".breast-duration-field");
    const isOther = breastDurationButton.dataset.breastDuration === "other";
    const presetInput = group.querySelector('input[type="hidden"]');
    const customField = group.querySelector(".breast-duration-custom");
    const customInput = group.querySelector('input[type="number"]');
    presetInput.value = isOther ? "other" : breastDurationButton.dataset.breastDuration;
    customField.hidden = !isOther;
    customInput.disabled = !isOther;
    customInput.required = isOther;
    if (!isOther) customInput.value = "";
    group.querySelectorAll("[data-breast-duration]").forEach((option) => {
      option.setAttribute("aria-pressed", String(option === breastDurationButton));
    });
    if (isOther) customInput.focus();
    return;
  }
  if (feedDurationButton) {
    const isOther = feedDurationButton.dataset.feedDuration === "other";
    const durationField = feedDurationButton.closest(".feed-duration-field");
    const presetInput = durationField.querySelector('[name="durationPreset"]');
    const customField = durationField.querySelector(".feed-duration-custom");
    const customInput = durationField.querySelector('[name="durationCustom"]');
    presetInput.value = isOther ? "other" : feedDurationButton.dataset.feedDuration;
    durationField.querySelector('[name="duration"]').value = "";
    customField.hidden = !isOther;
    customInput.disabled = !isOther;
    customInput.required = isOther;
    if (!isOther) customInput.value = "";
    durationField.querySelectorAll("[data-feed-duration]").forEach((option) => {
      option.setAttribute("aria-pressed", String(option === feedDurationButton));
    });
    if (isOther) customInput.focus();
    return;
  }
  const isOther = amountButton.dataset.feedAmount === "other";
  fields.querySelector('[name="amountPreset"]').value = isOther ? "" : amountButton.dataset.feedAmount;
  const customAmountField = fields.querySelector('[id$="feed-custom-amount-field"]');
  const customAmountInput = fields.querySelector('[name="amountCustom"]');
  customAmountField.hidden = !isOther;
  customAmountInput.disabled = !isOther;
  if (!isOther) customAmountInput.value = "";
  fields.querySelectorAll("[data-feed-amount]").forEach((option) => {
    option.setAttribute("aria-pressed", String(option === amountButton));
  });
  if (isOther) customAmountInput.focus();
}

function updateLogTypeOptions() {
  const selectedLogType = typeSelect.value;
  typeSelect.querySelectorAll("[data-custom-log-type]").forEach((option) => option.remove());
  document.querySelectorAll("#activity-filter [data-custom-log-type]").forEach((option) => option.remove());
  quickActions.querySelectorAll("[data-custom-log-type]").forEach((button) => button.remove());
  for (const name of allCareLogTypes()) {
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
  return ["feed", "sleep", "diaper", ...defaultCareLogTypes.map((name) => `custom:${name}`), "care", ...customLogTypes
    .filter((name) => !defaultCareLogTypes.some((defaultName) => defaultName.toLocaleLowerCase() === name.toLocaleLowerCase()))
    .map((name) => `custom:${name}`)];
}

function allCareLogTypes(customLogTypes = profile.customLogTypes) {
  const types = [...defaultCareLogTypes];
  for (const name of customLogTypes) {
    if (!types.some((existing) => existing.toLocaleLowerCase() === name.toLocaleLowerCase())) types.push(name);
  }
  return types;
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
  logDialog.querySelector(".close-button").focus();
}

function populateLogForm(log) {
  if (log.type === "feed") {
    const methodInput = document.querySelector("#feed-method");
    methodInput.value = log.method || "Breastfeeding";
    dynamicFields.querySelectorAll("[data-feed-method]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.feedMethod === methodInput.value));
    });
    dynamicFields.querySelector("[data-breastfeeding-fields]").hidden = methodInput.value !== "Breastfeeding";

    const amount = Number(log.amount) || 0;
    const amountButton = [...dynamicFields.querySelectorAll("[data-feed-amount]")]
      .find((button) => button.dataset.feedAmount === String(amount));
    if (amountButton) {
      document.querySelector("#feed-amount-preset").value = String(amount);
      amountButton.setAttribute("aria-pressed", "true");
    } else if (amount > 0) {
      const otherButton = dynamicFields.querySelector('[data-feed-amount="other"]');
      otherButton.setAttribute("aria-pressed", "true");
      document.querySelector("#feed-amount-preset").value = "";
      document.querySelector("#feed-custom-amount-field").hidden = false;
      document.querySelector("#feed-custom-amount").disabled = false;
      document.querySelector("#feed-custom-amount").value = String(amount);
    }

    document.querySelector("#feed-duration").value = log.duration || "";
    if (log.duration) {
      const durationButton = [...dynamicFields.querySelectorAll("[data-feed-duration]")]
        .find((button) => button.dataset.feedDuration === String(log.duration));
      if (durationButton) {
        dynamicFields.querySelector('[name="durationPreset"]').value = String(log.duration);
        durationButton.setAttribute("aria-pressed", "true");
      } else {
        const otherButton = dynamicFields.querySelector('[data-feed-duration="other"]');
        const durationField = otherButton.closest(".feed-duration-field");
        otherButton.setAttribute("aria-pressed", "true");
        durationField.querySelector('[name="durationPreset"]').value = "other";
        durationField.querySelector(".feed-duration-custom").hidden = false;
        durationField.querySelector('[name="durationCustom"]').disabled = false;
        durationField.querySelector('[name="durationCustom"]').value = String(log.duration);
      }
    }

    if (methodInput.value === "Breastfeeding") {
      for (const side of ["left", "right"]) {
        const duration = Number(log[`${side}Duration`]) || 0;
        const group = dynamicFields.querySelector(`[name="${side}DurationPreset"]`).closest(".breast-duration-field");
        const option = [...group.querySelectorAll("[data-breast-duration]")]
          .find((button) => button.dataset.breastDuration === String(duration));
        if (option) {
          group.querySelector(`[name="${side}DurationPreset"]`).value = String(duration);
          option.setAttribute("aria-pressed", "true");
        } else if (duration > 0) {
          const otherButton = group.querySelector('[data-breast-duration="other"]');
          otherButton.setAttribute("aria-pressed", "true");
          group.querySelector(`[name="${side}DurationPreset"]`).value = "other";
          group.querySelector(".breast-duration-custom").hidden = false;
          group.querySelector(`[name="${side}DurationCustom"]`).disabled = false;
          group.querySelector(`[name="${side}DurationCustom"]`).value = String(duration);
        }
      }
    }
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
    leftDuration: row.left_duration_minutes ?? 0,
    rightDuration: row.right_duration_minutes ?? 0,
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
    duration_minutes: (log.type === "sleep" || log.type === "feed") && log.duration ? log.duration : null,
    left_duration_minutes: log.type === "feed" && log.method === "Breastfeeding" && log.leftDuration ? log.leftDuration : null,
    right_duration_minutes: log.type === "feed" && log.method === "Breastfeeding" && log.rightDuration ? log.rightDuration : null,
    change_type: log.type === "diaper" ? log.changeType : null,
    care_label: log.type === "care" || log.type === "custom" ? log.label : null,
  };
}

function mapDatabaseHealthRecord(row) {
  return {
    id: row.id,
    recordType: row.record_type,
    title: row.title,
    occurredOn: row.occurred_on,
    occurredTime: row.occurred_time ? row.occurred_time.slice(0, 5) : "",
    category: row.category || "",
    providerName: row.provider_name || "",
    facilityName: row.facility_name || "",
    manufacturer: row.manufacturer || "",
    dose: row.dose || "",
    lotNumber: row.lot_number || "",
    nextDueDate: row.next_due_date || "",
    nextDueTime: row.next_due_time ? row.next_due_time.slice(0, 5) : "",
    reason: row.reason || "",
    results: row.results || "",
    followUpDate: row.follow_up_date || "",
    followUpTime: row.follow_up_time ? row.follow_up_time.slice(0, 5) : "",
    notes: row.notes || "",
  };
}

function toDatabaseHealthRecord(record) {
  return {
    baby_id: profile.id,
    record_type: record.recordType,
    title: record.title,
    occurred_on: record.occurredOn,
    occurred_time: record.occurredTime || null,
    category: record.category || null,
    provider_name: record.providerName || null,
    facility_name: record.facilityName || null,
    manufacturer: record.manufacturer || null,
    dose: record.dose || null,
    lot_number: record.lotNumber || null,
    next_due_date: record.nextDueDate || null,
    next_due_time: record.nextDueTime || null,
    reason: record.reason || null,
    results: record.results || null,
    follow_up_date: record.followUpDate || null,
    follow_up_time: record.followUpTime || null,
    notes: record.notes || null,
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
      .select("id, type, occurred_at, note, method, amount_ml, duration_minutes, left_duration_minutes, right_duration_minutes, change_type, care_label")
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

async function loadHealthRecords() {
  const allRows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("health_records")
      .select("id, record_type, title, occurred_on, occurred_time, category, provider_name, facility_name, manufacturer, dose, lot_number, next_due_date, next_due_time, reason, results, follow_up_date, follow_up_time, notes")
      .eq("baby_id", profile.id)
      .is("deleted_at", null)
      .order("occurred_on", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(databaseError(error, "Loading health records"));
    allRows.push(...data);
    if (data.length < pageSize) break;
  }
  healthRecords = allRows.map(mapDatabaseHealthRecord);
  renderHealthRecordList();
}

async function initializeAccount(user) {
  if (currentUserId === user.id && (profile.id || loadingUserId === user.id)) return;
  currentUserId = user.id;
  loadingUserId = user.id;
  logs = [];
  healthRecords = [];
  pendingDeleteHealthRecordId = null;
  healthRecordActionError = "";
  healthRecordActionInProgress = false;
  activityActionMode = null;
  pendingDeleteLogId = null;
  confirmingClearLogs = false;
  activityActionError = "";
  profile = { id: null, name: "Krish", birthday: "", customLogTypes: [], quickLogOrder: [] };
  document.querySelector("#auth-screen").hidden = true;
  document.querySelector("#app-shell").hidden = false;
  document.querySelector("#activity-list").innerHTML = '<div class="activity-empty"><strong>Loading your little one\'s day…</strong></div>';
  document.querySelector("#health-record-list").innerHTML = '<div class="health-empty"><strong>Loading health records…</strong></div>';
  document.querySelector("#health-overview").innerHTML = '<strong>Loading care dates…</strong>';
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
    await loadHealthRecords();
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
    healthRecords = [];
    pendingDeleteHealthRecordId = null;
    healthRecordActionError = "";
    healthRecordActionInProgress = false;
    activityActionMode = null;
    pendingDeleteLogId = null;
    confirmingClearLogs = false;
    activityActionError = "";
    profile = { id: null, name: "Krish", birthday: "", customLogTypes: [], quickLogOrder: [] };
    for (const dialog of [logDialog, overallLogDialog, healthRecordDialog, profileDialog, passwordDialog]) {
      if (dialog.open) dialog.close();
    }
    renderHealthRecordList();
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
    await loadHealthRecords();
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
  if (location.hash === "#health") {
    history.pushState(null, "", "#today");
    updateNavigation("#today");
  }
  document.querySelector("#activity-panel").scrollIntoView({ behavior: "smooth", block: "start" });
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

function updateNavigation(activeHref = location.hash || "#today") {
  const page = activeHref === "#health" ? "health" : "today";
  const pageHref = `#${page}`;
  const pageTitle = page === "health" ? "Health records" : "Today & activity";
  document.querySelectorAll("[data-page-view]").forEach((view) => {
    const active = view.dataset.pageView === page;
    view.hidden = !active;
    view.setAttribute("aria-hidden", String(!active));
  });
  document.querySelectorAll(".nav-link").forEach((link) => {
    const active = link.getAttribute("href") === pageHref;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  document.querySelector(".breadcrumb strong").textContent = pageTitle;
  document.title = `Krish Baby — ${pageTitle}`;
  if (activeHref === "#activity") {
    requestAnimationFrame(() => document.querySelector("#activity-panel").scrollIntoView());
  } else {
    window.scrollTo(0, 0);
  }
}
document.querySelectorAll(".nav-link").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    const href = link.getAttribute("href");
    if (location.hash !== href) history.pushState(null, "", href);
    updateNavigation(href);
  });
});
window.addEventListener("hashchange", () => updateNavigation());
window.addEventListener("popstate", () => updateNavigation());

const vaccineCatalogEntries = [
  ...vaccinationReference.vaccines.map((item) => ({ id: item.id, type: "vaccine", item })),
  ...vaccinationReference.combination_vaccines.map((item) => ({ id: item.id, type: "combination", item })),
];

function vaccineRecordTitle(entry) {
  const { item } = entry;
  return entry.type === "combination"
    ? `${item.product} (${item.abbreviation})`
    : `${item.name} (${item.abbreviation})`;
}

function vaccineNameOptionsMarkup() {
  const names = new Set();
  for (const entry of vaccineCatalogEntries) {
    const { item } = entry;
    names.add(entry.type === "combination" ? item.product : item.name);
    if (item.abbreviation) names.add(item.abbreviation);
    for (const product of item.products || []) names.add(product);
  }
  return `<datalist id="vaccine-name-options">${[...names].map((name) => `<option value="${escapeHTML(name)}"></option>`).join("")}</datalist>`;
}

function vaccineDoseScheduleMarkup(vaccine) {
  const rows = [];
  const addDoses = (series, prefix = "") => {
    for (const dose of series || []) {
      const interval = dose.min_interval_from_prior_days
        ? ` · minimum interval ${dose.min_interval_from_prior_days} days`
        : "";
      rows.push(`${prefix}${dose.dose ? `Dose ${dose.dose}: ` : ""}${dose.age || "Timing not specified"}${interval}`);
    }
  };
  addDoses(vaccine.routine_series?.doses);
  for (const productSeries of vaccine.product_dependent_series || []) {
    if (productSeries.doses?.length) {
      addDoses(productSeries.doses, `${productSeries.product}: `);
    }
  }
  if (vaccine.routine_series?.dose_rules?.length) {
    for (const rule of vaccine.routine_series.dose_rules) {
      rows.push(`${rule.dose_count} doses: ${rule.if}${rule.minimum_interval_months ? ` · minimum interval ${rule.minimum_interval_months} months` : ""}`);
    }
  }
  const series = vaccine.routine_series || {};
  const ageLimits = vaccine.age_limits
    ? Object.entries(vaccine.age_limits).map(([name, value]) => `${name.replaceAll("_", " ")}: ${value} days`)
    : [];
  const summary = [
    typeof series.dose_count === "number" ? `${series.dose_count} doses` : series.dose_count,
    series.recommended_age_years && `Recommended age ${series.recommended_age_years} years`,
    series.preferred_age && `Preferred age ${series.preferred_age}`,
    series.age && `Age ${series.age}`,
    series.first_rsv_season,
    series.second_rsv_season,
    series.dose_ages_months_from_first && `Months from first dose: ${series.dose_ages_months_from_first.join(", ")}`,
  ].filter(Boolean);
  if (!rows.length) rows.push(...summary);
  rows.push(...ageLimits);
  return rows.length
    ? `<ul>${rows.map((row) => `<li>${escapeHTML(row)}</li>`).join("")}</ul>`
    : "<p>See the notes and current official guidance for schedule details.</p>";
}

function renderVaccineCatalog(query = "") {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matches = vaccineCatalogEntries.filter(({ item }) => (
    !normalizedQuery || JSON.stringify(item).toLocaleLowerCase().includes(normalizedQuery)
  ));
  const vaccines = matches.filter((entry) => entry.type === "vaccine");
  const combinations = matches.filter((entry) => entry.type === "combination");
  const renderEntry = (entry) => {
    const { item } = entry;
    const schedule = entry.type === "combination"
      ? `<p>${escapeHTML(item.typical_use || "Combination product")}</p>`
      : vaccineDoseScheduleMarkup(item);
    const products = item.products?.length
      ? `<div class="vaccine-reference-section"><strong>Products listed</strong><p>${item.products.map(escapeHTML).join(" · ")}</p></div>`
      : "";
    const protects = item.protects_against?.length
      ? `<div class="vaccine-reference-section"><strong>Protects against</strong><p>${item.protects_against.map(escapeHTML).join(" · ")}</p></div>`
      : "";
    const components = item.components?.length
      ? `<div class="vaccine-reference-section"><strong>Components</strong><p>${item.components.map(escapeHTML).join(" · ")}</p></div>`
      : "";
    const conditionalRules = item.conditional_rules?.length
      ? `<div class="vaccine-reference-section"><strong>Conditional guidance</strong><ul>${item.conditional_rules.map((rule) => `<li>${escapeHTML(rule.description)}</li>`).join("")}</ul></div>`
      : "";
    const notes = item.notes
      ? `<p class="vaccine-reference-notes">${escapeHTML(item.notes)}</p>`
      : "";
    const timingLabel = entry.type === "combination"
      ? "Typical use"
      : item.schedule_type
        ? item.schedule_type.replaceAll("_", " ")
        : "Routine timing in this reference";
    return `<details class="vaccine-reference-card">
      <summary><span><strong>${escapeHTML(entry.type === "combination" ? item.product : item.name)}</strong><small>${escapeHTML(item.abbreviation || item.id)}</small></span><span class="vaccine-reference-kind">${entry.type === "combination" ? "Combination" : item.kind === "vaccine" ? "Vaccine" : "Immunization"}</span></summary>
      <div class="vaccine-reference-detail">
        ${protects}${components}
        <div class="vaccine-reference-section"><strong>${escapeHTML(timingLabel)}</strong>${schedule}</div>
        ${products}${conditionalRules}${notes}
        <button type="button" class="text-button" data-record-vaccine-id="${escapeHTML(entry.id)}">Record administration</button>
      </div>
    </details>`;
  };
  const sections = [
    vaccines.length ? `<h4>Vaccines and immunizing agents</h4>${vaccines.map(renderEntry).join("")}` : "",
    combinations.length ? `<h4>Combination products</h4>${combinations.map(renderEntry).join("")}` : "",
  ].filter(Boolean);
  document.querySelector("#vaccine-results-count").textContent = `${matches.length} ${matches.length === 1 ? "match" : "matches"}`;
  document.querySelector("#vaccine-catalog").innerHTML = sections.length
    ? sections.join("")
    : '<p class="vaccine-no-results">No matching vaccines or products.</p>';
}

const vaccineMetadata = vaccinationReference.dataset_metadata;
document.querySelector("#vaccine-reference-version").textContent =
  `${vaccineMetadata.schedule_version} · effective ${vaccineMetadata.schedule_effective_date}`;
document.querySelector("#vaccine-reference-safety").textContent = vaccineMetadata.important_safety_note;
document.querySelector("#vaccine-reference-sources").innerHTML = vaccineMetadata.sources
  .filter((source) => source.url.startsWith("https://"))
  .map((source) => `<a href="${escapeHTML(source.url)}" target="_blank" rel="noreferrer">${escapeHTML(source.authority)}: ${escapeHTML(source.title)}</a>`)
  .join(" · ");
document.querySelector("#vaccine-search").addEventListener("input", (event) => {
  renderVaccineCatalog(event.currentTarget.value);
});
renderVaccineCatalog();
document.querySelector("#vaccine-catalog").addEventListener("click", (event) => {
  const button = event.target.closest("[data-record-vaccine-id]");
  if (!button) return;
  const entry = vaccineCatalogEntries.find((item) => item.id === button.dataset.recordVaccineId);
  if (!entry) return;
  openHealthRecordDialog(null, vaccineRecordTitle(entry));
});

function openHealthRecordDialog(record = null, vaccineTitle = "", initialType = "vaccination") {
  editingHealthRecordId = record?.id || null;
  const form = document.querySelector("#health-record-form");
  const typeSelect = document.querySelector("#health-record-type");
  typeSelect.value = record?.recordType || initialType;
  const isNewAppointment = !record && initialType === "visit";
  typeSelect.disabled = Boolean(record || isNewAppointment);
  document.querySelector("#health-record-title").textContent = record ? "Edit health record" : isNewAppointment ? "Schedule appointment" : "Add health record";
  document.querySelector("#save-health-record").textContent = record ? "Save changes" : isNewAppointment ? "Save appointment" : "Save record";
  document.querySelector("#health-record-error").textContent = "";
  document.querySelector("#health-record-fields").innerHTML = healthRecordFormFields(typeSelect.value);
  if (vaccineTitle) form.elements.namedItem("title").value = vaccineTitle;
  if (isNewAppointment) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    form.elements.namedItem("occurredOn").value = localDateKey(tomorrow);
  }
  if (record) {
    for (const [field, value] of Object.entries({
      title: record.title,
      occurredOn: record.occurredOn,
      occurredTime: record.occurredTime,
      category: record.category,
      providerName: record.providerName,
      facilityName: record.facilityName,
      manufacturer: record.manufacturer,
      dose: record.dose,
      lotNumber: record.lotNumber,
      nextDueDate: record.nextDueDate,
      nextDueTime: record.nextDueTime,
      reason: record.reason,
      results: record.results,
      followUpDate: record.followUpDate,
      followUpTime: record.followUpTime,
      notes: record.notes,
    })) {
      const input = form.elements.namedItem(field);
      if (input) input.value = value || "";
    }
  }
  healthRecordDialog.showModal();
  if (record || vaccineTitle || isNewAppointment) form.elements.namedItem("title").focus();
  else typeSelect.focus();
}

document.querySelector("#health-overview").addEventListener("click", (event) => {
  if (!event.target.closest("[data-schedule-appointment]")) return;
  openHealthRecordDialog(null, "", "visit");
});

function buildHealthRecord(form) {
  const data = new FormData(form);
  const recordType = document.querySelector("#health-record-type").value;
  const occurredOn = String(data.get("occurredOn") || "");
  const title = String(data.get("title") || "").trim();
  const nextDueDate = recordType === "vaccination" ? String(data.get("nextDueDate") || "") : "";
  const nextDueTime = recordType === "vaccination" ? String(data.get("nextDueTime") || "") : "";
  const followUpDate = recordType === "visit" ? String(data.get("followUpDate") || "") : "";
  const followUpTime = recordType === "visit" ? String(data.get("followUpTime") || "") : "";
  if (!occurredOn || !title) return { error: "Enter the required details before saving." };
  if (nextDueTime && !nextDueDate) return { error: "Choose a next-dose date before adding its time." };
  if (followUpTime && !followUpDate) return { error: "Choose a follow-up date before adding its time." };
  if (nextDueDate && nextDueDate < occurredOn) return { error: "The next dose date must be on or after the vaccination date." };
  if (followUpDate && followUpDate < occurredOn) return { error: "The follow-up date must be on or after the visit date." };
  return {
    record: {
      recordType,
      title,
      occurredOn,
      occurredTime: recordType === "visit" ? String(data.get("occurredTime") || "") : "",
      category: recordType === "visit" ? String(data.get("category") || "") : "",
      providerName: String(data.get("providerName") || "").trim(),
      facilityName: String(data.get("facilityName") || "").trim(),
      manufacturer: String(data.get("manufacturer") || "").trim(),
      dose: String(data.get("dose") || "").trim(),
      lotNumber: String(data.get("lotNumber") || "").trim(),
      nextDueDate,
      nextDueTime,
      reason: String(data.get("reason") || "").trim(),
      results: String(data.get("results") || "").trim(),
      followUpDate,
      followUpTime,
      notes: String(data.get("notes") || "").trim(),
    },
  };
}

document.querySelector("#add-health-record").addEventListener("click", () => openHealthRecordDialog());
document.querySelector("#health-record-type").addEventListener("change", (event) => {
  document.querySelector("#health-record-fields").innerHTML = healthRecordFormFields(event.currentTarget.value);
});
document.querySelector("#health-filter").addEventListener("change", renderHealthRecordList);
document.querySelector("#health-record-list").addEventListener("click", async (event) => {
  if (event.target.closest("[data-add-health-record]")) {
    openHealthRecordDialog();
    return;
  }
  const editButton = event.target.closest("[data-edit-health-record]");
  if (editButton) {
    const record = healthRecords.find((item) => item.id === editButton.dataset.editHealthRecord);
    if (record) openHealthRecordDialog(record);
    return;
  }
  if (event.target.closest("[data-cancel-health-delete]")) {
    pendingDeleteHealthRecordId = null;
    healthRecordActionError = "";
    renderHealthRecordList();
    return;
  }
  const confirmButton = event.target.closest("[data-confirm-health-delete]");
  if (confirmButton && profile.id && !healthRecordActionInProgress) {
    const recordId = confirmButton.dataset.confirmHealthDelete;
    healthRecordActionInProgress = true;
    healthRecordActionError = "";
    renderHealthRecordList();
    try {
      const { data, error } = await supabase
        .from("health_records")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", recordId)
        .eq("baby_id", profile.id)
        .is("deleted_at", null)
        .select("id")
        .single();
      if (error) throw error;
      if (!data) throw new Error("The health record was not found or was already removed.");
      healthRecords = healthRecords.filter((record) => record.id !== recordId);
      pendingDeleteHealthRecordId = null;
      showToast("Health record archived");
    } catch (error) {
      healthRecordActionError = databaseError(error, "Removing health record");
    } finally {
      healthRecordActionInProgress = false;
      renderHealthRecordList();
    }
    return;
  }
  const deleteButton = event.target.closest("[data-delete-health-record]");
  if (deleteButton) {
    pendingDeleteHealthRecordId = deleteButton.dataset.deleteHealthRecord;
    healthRecordActionError = "";
    renderHealthRecordList();
  }
});

document.querySelector("#health-record-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorElement = document.querySelector("#health-record-error");
  const saveButton = document.querySelector("#save-health-record");
  errorElement.textContent = "";
  if (!profile.id) {
    errorElement.textContent = "Your baby profile is still loading. Please try again in a moment.";
    return;
  }
  const { record, error: validationError } = buildHealthRecord(event.currentTarget);
  if (validationError) {
    errorElement.textContent = validationError;
    return;
  }
  const recordIdToUpdate = editingHealthRecordId;
  saveButton.disabled = true;
  try {
    const query = supabase.from("health_records");
    const request = recordIdToUpdate
      ? query.update(toDatabaseHealthRecord(record)).eq("id", recordIdToUpdate).eq("baby_id", profile.id).is("deleted_at", null)
      : query.insert(toDatabaseHealthRecord(record));
    const { data, error } = await request
      .select("id, record_type, title, occurred_on, occurred_time, category, provider_name, facility_name, manufacturer, dose, lot_number, next_due_date, next_due_time, reason, results, follow_up_date, follow_up_time, notes")
      .single();
    if (error) throw error;
    const savedRecord = mapDatabaseHealthRecord(data);
    if (recordIdToUpdate) {
      healthRecords = healthRecords.map((item) => item.id === recordIdToUpdate ? savedRecord : item);
    } else {
      healthRecords.push(savedRecord);
      document.querySelector("#health-filter").value = "all";
    }
    healthRecordDialog.close();
    renderHealthRecordList();
    setSyncError("");
    showToast(`Health record ${recordIdToUpdate ? "updated" : "saved"}`);
  } catch (error) {
    errorElement.textContent = databaseError(error, "Saving health record");
  } finally {
    saveButton.disabled = false;
  }
});
healthRecordDialog.addEventListener("close", () => {
  editingHealthRecordId = null;
  document.querySelector("#health-record-type").disabled = false;
});

logForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(logForm);
  const logIdToUpdate = editingLogId;
  const selectedType = typeSelect.value;
  const formError = document.querySelector("#form-error");
  const saveButton = logForm.querySelector('button[type="submit"]');
  formError.textContent = "";
  const { entry, error: validationError } = buildLogEntry(
    selectedType,
    logForm,
    String(data.get("time") || ""),
    String(data.get("notes") || ""),
  );
  if (validationError) {
    formError.textContent = validationError;
    return;
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
      .select("id, type, occurred_at, note, method, amount_ml, duration_minutes, left_duration_minutes, right_duration_minutes, change_type, care_label")
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

document.querySelector("#overall-log-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const errorElement = document.querySelector("#overall-log-error");
  const saveButton = form.querySelector('button[type="submit"]');
  errorElement.textContent = "";
  if (!overallSelectedTypes.size) {
    errorElement.textContent = "Select at least one activity to log.";
    return;
  }
  if (!profile.id) {
    errorElement.textContent = "Your baby profile is still loading. Please try again in a moment.";
    return;
  }

  const sharedTime = document.querySelector("#overall-log-time").value;
  const sharedNote = document.querySelector("#overall-log-notes").value;
  const entries = [];
  for (const type of overallSelectedTypes) {
    const section = document.querySelector(`[data-selected-log-type="${CSS.escape(type)}"]`);
    const { entry, error } = buildLogEntry(type, section.querySelector("[data-log-fields]"), sharedTime, sharedNote);
    if (error) {
      errorElement.textContent = `${logTypeLabel(type)}: ${error}`;
      section.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    entries.push(entry);
  }

  saveButton.disabled = true;
  try {
    const { data, error } = await supabase
      .from("care_logs")
      .insert(entries.map(toDatabaseLog))
      .select("id, type, occurred_at, note, method, amount_ml, duration_minutes, left_duration_minutes, right_duration_minutes, change_type, care_label");
    if (error) throw error;
    logs = [...data.map(mapDatabaseLog), ...logs]
      .sort((a, b) => new Date(b.time) - new Date(a.time));
    overallLogDialog.close();
    renderDashboard();
    setSyncError("");
    showToast(`${entries.length} ${entries.length === 1 ? "log" : "logs"} saved together`);
  } catch (error) {
    errorElement.textContent = databaseError(error, "Saving activities");
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
  } else if (["feeding", "sleep", "diaper", "diaper change", "other care", ...defaultCareLogTypes].some((builtIn) => builtIn.toLocaleLowerCase() === name.toLocaleLowerCase())) {
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
