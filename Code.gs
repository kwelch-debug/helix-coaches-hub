/**
 * Helix Athletics Automations (Google Apps Script)
 * ------------------------------------------------
 * Lives inside one Google Sheet ("Helix Athletics Automations"). Runs in Google's
 * cloud: no computer needs to be on.
 *
 *  1. SCORE FORM: setup() creates the Google Form. Every submission lands in the
 *     "Scores" tab, and the athletic office gets a one-line email.
 *  2. SCORE REMINDERS: at about 9:45 PM, each head coach with a game today that
 *     has no score yet gets one email with a pre-filled score link. At 7 AM there's
 *     one follow-up if the game is still unscored. A game already in "Scores" is
 *     never nagged about.
 *  3. CLEARANCE EMAIL ENDPOINT: receives the weekly clearance lists from the
 *     browser task on the AD's computer. Emails a coach ONLY when their team has
 *     a problem. Logs counts, never names.
 *
 * ── SETTINGS — edit between the quotes ─────────────────────────────────── */
const CONFIG = {
  SITE_URL: "https://helix-coaches.netlify.app",  // your Netlify address
  OFFICE_EMAILS: "kwelch@helixcharter.net",      // who gets each score (comma-separate several)
  AD_EMAIL: "kwelch@helixcharter.net",           // gets test emails and the clearance summary

  // TEST MODE: while true, every reminder goes to AD_EMAIL instead of coaches.
  // Change to false when you're happy with what you see.
  REMINDERS_TEST_MODE: true,
  CLEARANCE_TEST_MODE: true,

  LEVELS: ["Varsity", "JV", "JV Grey", "JV Green", "Freshman", "Novice", "Other"],
  REMINDER_HOUR: 21, REMINDER_MINUTE: 45,        // 9:45 PM
  FOLLOWUP_HOUR: 7,                              // 7 AM next morning

  // Schedule entries whose "opponent" matches this are not real games (tournaments,
  // invitationals, TBA placeholders). They never get a score reminder.
  NOT_A_GAME: /\b(tba|tbd|tournament|tourney|inv\.?|invitational|cup|meet|finals?|championships?|open|clinic|scrimmage|bye|jamboree|showcase|classic)\b/i
};

/* Head coaches. setup() copies this into the "Coaches" tab the first time; after
   that, edit the TAB, not this list. Team names match the athletics calendar
   ("Girls Volleyball", "Boys Football"...).
   Active: N = never send this coach reminders (e.g. they already post to MaxPreps).
   Remind levels: "Varsity", "Varsity, JV", or "All". */
const COACH_SEED = [
  ["Team", "Head coach", "Email", "Active (Y/N)", "Remind levels", "Notes"],
  ["Boys Cross Country", "Babey Wagnew", "wagnew@helixcharter.net", "Y", "Varsity", ""],
  ["Girls Cross Country", "Babey Wagnew", "wagnew@helixcharter.net", "Y", "Varsity", ""],
  ["Girls Cheer", "Michelle Estrella", "estrella@helixcharter.net", "N", "Varsity", "No scored games"],
  ["Boys Water Polo", "Spencer Bailey", "sbailey@helixcharter.net", "Y", "Varsity", ""],
  ["Girls Flag Football", "Dwayne Brown", "dbrown@helixcharter.net", "Y", "Varsity", ""],
  ["Boys Football", "Damaja Jones", "djones@helixcharter.net", "Y", "Varsity", ""],
  ["Girls Golf", "Cole Holland", "holland@helixcharter.net", "Y", "Varsity", ""],
  ["Girls Field Hockey", "Jamie Imperato", "imperato@helixcharter.net", "Y", "Varsity", ""],
  ["Girls Tennis", "Dan Potter", "dpotter@helixcharter.net", "Y", "Varsity", ""],
  ["Girls Volleyball", "Zoe Varela-Beltz", "varela-beltz@helixcharter.net", "Y", "Varsity", ""],
  ["Boys Basketball", "Jason Cavazos", "cavazos@helixcharter.net", "Y", "Varsity", ""],
  ["Girls Basketball", "Dana Hosley", "hosley@helixcharter.net", "Y", "Varsity", ""],
  ["Boys Soccer", "Ryan Bettencourt", "bettencourt@helixcharter.net", "Y", "Varsity", ""],
  ["Girls Soccer", "Fenan Berhe", "berhe@helixcharter.net", "Y", "Varsity", ""],
  ["Girls Water Polo", "Lenelle Wylie", "wylie@helixcharter.net", "Y", "Varsity", ""],
  ["Boys Wrestling", "Adam Krzywicki", "krzywicki@helixcharter.net", "Y", "Varsity", ""],
  ["Girls Wrestling", "Adam Krzywicki", "krzywicki@helixcharter.net", "Y", "Varsity", ""],
  ["Boys Baseball", "Diego Reynoso", "reynoso@helixcharter.net", "Y", "Varsity", ""],
  ["Girls Softball", "Molly Sturdivant", "sturdivant@helixcharter.net", "Y", "Varsity", ""],
  ["Boys Golf", "Frank Theroux", "theroux@helixcharter.net", "Y", "Varsity", ""],
  ["Boys Lacrosse", "John Whittles", "whittles@helixcharter.net", "Y", "Varsity", ""],
  ["Girls Lacrosse", "John Rader", "rader@helixcharter.net", "Y", "Varsity", ""],
  ["Boys Swim & Dive", "Scott Lemler", "lemler@helixcharter.net", "Y", "Varsity", ""],
  ["Girls Swim & Dive", "Lenelle Wylie", "wylie@helixcharter.net", "Y", "Varsity", ""],
  ["Boys Tennis", "Dan Potter", "dpotter@helixcharter.net", "Y", "Varsity", ""],
  ["Boys Track & Field", "Rodney Van", "helixtrackcoach@gmail.com", "Y", "Varsity", ""],
  ["Girls Track & Field", "Rodney Van", "helixtrackcoach@gmail.com", "Y", "Varsity", ""],
  ["Girls Beach Volleyball", "Isabel Lopez-Fletes", "lopez-fletes@helixcharter.net", "Y", "Varsity", ""],
  ["Boys Volleyball", "Linda Brown", "lbrown@helixcharter.net", "Y", "Varsity", ""]
];

/* ═════════════════════════ SETUP (run once) ═════════════════════════ */

function setup() {
  const ss = SpreadsheetApp.getActive();
  const props = PropertiesService.getScriptProperties();

  // Coaches tab
  let coaches = ss.getSheetByName("Coaches");
  if (!coaches) {
    coaches = ss.insertSheet("Coaches");
    coaches.getRange(1, 1, COACH_SEED.length, COACH_SEED[0].length).setValues(COACH_SEED);
    coaches.setFrozenRows(1); coaches.getRange("1:1").setFontWeight("bold"); coaches.autoResizeColumns(1, 6);
  }
  logSheet_();

  // Score form
  let form;
  if (props.getProperty("FORM_ID")) {
    form = FormApp.openById(props.getProperty("FORM_ID"));
  } else {
    form = FormApp.create("Helix Score Report");
    form.setDescription("Report a final score. One submission per game. Takes 30 seconds.")
        .setConfirmationMessage("Got it. Thanks, Coach! The athletic office has your score.")
        .setAllowResponseEdits(false).setCollectEmail(false);
    try { form.setRequireLogin(false); } catch (e) { /* not available on some accounts */ }
    form.addListItem().setTitle("Team").setRequired(true);
    form.addListItem().setTitle("Level").setChoiceValues(CONFIG.LEVELS).setRequired(true);
    form.addDateItem().setTitle("Game date").setRequired(true);
    form.addTextItem().setTitle("Opponent").setRequired(true);
    form.addMultipleChoiceItem().setTitle("Home or away").setChoiceValues(["Home", "Away", "Neutral"]).setRequired(true);
    const num = FormApp.createTextValidation().requireWholeNumber().setHelpText("Numbers only").build();
    form.addTextItem().setTitle("Helix score").setValidation(num).setRequired(true);
    form.addTextItem().setTitle("Opponent score").setValidation(num).setRequired(true);
    form.addParagraphTextItem().setTitle("Notes (optional)").setHelpText("Standouts, records, anything for the game-day post.");
    form.addTextItem().setTitle("Your name").setRequired(true);
    form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
    props.setProperty("FORM_ID", form.getId());
    SpreadsheetApp.flush();
    Utilities.sleep(2000);
    const resp = ss.getSheets().filter(s => s.getFormUrl && s.getFormUrl())[0];
    if (resp) resp.setName("Scores");
  }
  refreshTeamChoices();

  // Pre-filled link template (used by the hub's "Tap your game" and the reminders)
  const template = buildPrefillTemplate_(form);
  props.setProperty("PREFILL", template);

  // Clearance endpoint key
  if (!props.getProperty("CLEARANCE_KEY")) props.setProperty("CLEARANCE_KEY", Utilities.getUuid());

  // Triggers (replace any old ones)
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("onScoreSubmit").forSpreadsheet(ss).onFormSubmit().create();
  ScriptApp.newTrigger("reminderTonight").timeBased().atHour(CONFIG.REMINDER_HOUR).nearMinute(CONFIG.REMINDER_MINUTE).everyDays(1).create();
  ScriptApp.newTrigger("reminderFollowup").timeBased().atHour(CONFIG.FOLLOWUP_HOUR).everyDays(1).create();

  // Settings tab: everything the AD needs to copy into the hub
  let st = ss.getSheetByName("Settings") || ss.insertSheet("Settings");
  st.clear();
  st.getRange(1, 1, 5, 2).setValues([
    ["Score form link  →  paste into HUB.links.scoreForm", form.getPublishedUrl()],
    ["Pre-filled template  →  paste into HUB.links.scoreFormPrefill", template],
    ["Clearance key (keep private)", props.getProperty("CLEARANCE_KEY")],
    ["Reminders test mode", String(CONFIG.REMINDERS_TEST_MODE)],
    ["Clearance test mode", String(CONFIG.CLEARANCE_TEST_MODE)]
  ]);
  st.getRange("A:A").setFontWeight("bold"); st.setColumnWidth(1, 420); st.setColumnWidth(2, 700);
  Logger.log("Score form: " + form.getPublishedUrl());
  Logger.log("Pre-filled template: " + template);
}

/** Re-run after editing the Coaches tab so the form's Team list matches. */
function refreshTeamChoices() {
  const form = FormApp.openById(PropertiesService.getScriptProperties().getProperty("FORM_ID"));
  const teams = readCoaches_().map(c => c.team).filter(Boolean).sort();
  const item = form.getItems(FormApp.ItemType.LIST).filter(i => i.getTitle() === "Team")[0].asListItem();
  item.setChoiceValues(teams.concat(["Other"]));
}

function buildPrefillTemplate_(form) {
  const items = form.getItems();
  const get = t => items.filter(i => i.getTitle() === t)[0];
  const firstTeam = get("Team").asListItem().getChoices()[0].getValue();
  const r = form.createResponse()
    .withItemResponse(get("Team").asListItem().createResponse(firstTeam))
    .withItemResponse(get("Level").asListItem().createResponse("Varsity"))
    .withItemResponse(get("Game date").asDateItem().createResponse(new Date(2000, 0, 1)))
    .withItemResponse(get("Opponent").asTextItem().createResponse("ZZOPPZZ"))
    .withItemResponse(get("Home or away").asMultipleChoiceItem().createResponse("Neutral"));
  const url = r.toPrefilledUrl();
  const [base, query] = url.split("?");
  const swap = { [firstTeam]: "{team}", "Varsity": "{level}", "2000-01-01": "{date}", "ZZOPPZZ": "{opponent}", "Neutral": "{homeaway}" };
  const parts = query.split("&").map(p => {
    const [k, v] = p.split("=");
    const val = decodeURIComponent((v || "").replace(/\+/g, " "));
    return swap[val] ? `${k}=${swap[val]}` : p;
  });
  return `${base}?${parts.join("&")}`;
}

/* ═════════════════════════ 1. SCORE ARRIVES ═════════════════════════ */

function onScoreSubmit(e) {
  const v = k => ((e.namedValues[k] || [""])[0] || "").trim();
  const us = Number(v("Helix score")), them = Number(v("Opponent score"));
  const result = us > them ? "W" : us < them ? "L" : "T";
  const where = v("Home or away") === "Away" ? "at" : "vs";
  const line = `${v("Team")} ${v("Level")}: Helix ${us}, ${v("Opponent")} ${them} (${result}) · ${where} · ${v("Game date")} · reported by ${v("Your name")}`;
  const notes = v("Notes (optional)");
  MailApp.sendEmail({
    to: CONFIG.OFFICE_EMAILS,
    subject: `Score: ${v("Team")} ${v("Level")} ${result} ${us}–${them} ${where} ${v("Opponent")}`,
    body: line + (notes ? `\n\nNotes: ${notes}` : "") + `\n\nAll scores: ${SpreadsheetApp.getActive().getUrl()}`
  });
}

/* ═════════════════════════ 2. SCORE REMINDERS ═════════════════════════ */

function reminderTonight()  { sendReminders_(ymd_(0), false); }
function reminderFollowup() { sendReminders_(ymd_(-1), true); }

/** Try it any time: shows (in the log) who WOULD get a reminder for a date. Emails nobody. */
function previewReminders() {
  const date = ymd_(0);
  const plan = planReminders_(date);
  Logger.log(plan.length ? plan.map(p => `${p.coach.email}: ${p.games.map(g => g.team + " " + g.level + " vs " + g.opponent).join("; ")}`).join("\n") : `No reminders due for ${date}.`);
}

function planReminders_(date) {
  const games = fetchGames_().filter(g => g.date === date && g.opponent && !CONFIG.NOT_A_GAME.test(g.opponent));
  const scored = scoredKeys_();
  const coaches = {};
  readCoaches_().forEach(c => coaches[norm_(c.team)] = c);
  const byCoach = {};
  games.forEach(g => {
    if (scored.has(key_(g.team, g.level, g.date))) return;      // never nag a scored game
    const c = coaches[norm_(g.team)];
    if (!c || !c.email || !c.active) return;
    const lv = c.levels.toLowerCase();
    if (lv !== "all" && !lv.split(/\s*,\s*/).map(norm_).includes(norm_(g.level))) return;
    if (!byCoach[c.email]) byCoach[c.email] = { coach: c, games: [] };
    byCoach[c.email].games.push(g);
  });
  return Object.values(byCoach);
}

function sendReminders_(date, isFollowup) {
  const template = PropertiesService.getScriptProperties().getProperty("PREFILL");
  const plan = planReminders_(date);
  plan.forEach(({ coach, games }) => {
    const rows = games.map(g => {
      const link = template.replace("{team}", encodeURIComponent(g.team)).replace("{level}", encodeURIComponent(g.level))
        .replace("{date}", g.date).replace("{opponent}", encodeURIComponent(g.opponent)).replace("{homeaway}", encodeURIComponent(g.homeAway));
      return `<p style="margin:14px 0"><strong>${esc_(g.team)} ${esc_(g.level)}</strong> ${g.homeAway === "Away" ? "at" : "vs"} ${esc_(g.opponent)}<br>
        <a href="${link}" style="display:inline-block;margin-top:6px;background:#C8102E;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold">Report this score</a></p>`;
    }).join("");
    const first = coach.name.split(" ")[0];
    const html = `<div style="font-family:Arial,sans-serif;font-size:15px">
      <p>Hi Coach ${esc_(first)},</p>
      <p>${isFollowup ? "We still don't have a score for last night's game." : "No score yet for today's game."} Tap the button, type the two scores, and you're done.</p>
      ${rows}
      <p style="color:#666;font-size:13px">You only get this email when a score is missing. Once the score is in, it stops.</p></div>`;
    const subject = isFollowup ? "Reminder: score still needed from last night" : "Tonight's score, 30 seconds";
    send_(coach.email, subject, html, CONFIG.REMINDERS_TEST_MODE);
    games.forEach(g => log_(isFollowup ? "reminder-followup" : "reminder", `${g.team} ${g.level} ${g.date}`, coach.email, CONFIG.REMINDERS_TEST_MODE));
  });
}

function fetchGames_() {
  if (!CONFIG.SITE_URL) throw new Error("Set CONFIG.SITE_URL first.");
  const res = UrlFetchApp.fetch(CONFIG.SITE_URL.replace(/\/$/, "") + "/games.json?t=" + Date.now(), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error("Could not read games.json: HTTP " + res.getResponseCode());
  return JSON.parse(res.getContentText());
}

function scoredKeys_() {
  const sh = SpreadsheetApp.getActive().getSheetByName("Scores");
  const set = new Set();
  if (!sh || sh.getLastRow() < 2) return set;
  const data = sh.getDataRange().getValues();
  const h = data[0].map(String);
  const iT = h.indexOf("Team"), iL = h.indexOf("Level"), iD = h.indexOf("Game date");
  data.slice(1).forEach(r => {
    const d = r[iD] instanceof Date ? Utilities.formatDate(r[iD], tz_(), "yyyy-MM-dd") : String(r[iD]);
    set.add(key_(r[iT], r[iL], d));
  });
  return set;
}

/* ═════════════════════════ 3. WEEKLY CLEARANCE EMAIL ═════════════════════════
   The browser task on the AD's computer POSTs:
   { key, mode: "counts" | "send",
     teams: [ { team: "Girls Volleyball", cleared: [...], pending: [...],
                incomplete: [...], expiredPhysical: [...] } ] }
   "counts": emails nobody and returns counts only (run any time).
   "send"  : a coach gets an email ONLY if their team has someone pending,
             incomplete, or with an expired physical. The AD gets a counts-only summary.
   Names go only to that team's coach. This script never logs names. */

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: "bad JSON" }); }
  if (!body.key || body.key !== PropertiesService.getScriptProperties().getProperty("CLEARANCE_KEY")) return json_({ ok: false, error: "unauthorized" });
  const mode = body.mode === "send" ? "send" : "counts";
  const coaches = {};
  readCoaches_().forEach(c => coaches[norm_(c.team)] = c);

  const out = [];
  (body.teams || []).forEach(t => {
    const L = k => Array.isArray(t[k]) ? t[k] : [];
    const counts = { cleared: L("cleared").length, pending: L("pending").length, incomplete: L("incomplete").length, expiredPhysical: L("expiredPhysical").length, other: L("other").length };
    const problem = counts.pending + counts.incomplete + counts.expiredPhysical + counts.other > 0;
    const c = coaches[norm_(t.team)];
    let emailed = "";
    if (mode === "send" && problem && c && c.email) {
      const n = counts.pending + counts.incomplete + counts.expiredPhysical + counts.other;
      send_(c.email, `Clearance check: ${t.team}: ${n} ${n === 1 ? "athlete needs" : "athletes need"} attention`, clearanceHtml_(t, c), CONFIG.CLEARANCE_TEST_MODE);
      emailed = CONFIG.CLEARANCE_TEST_MODE ? "test → AD" : "coach";
    }
    log_("clearance-" + mode, `${t.team}: ${JSON.stringify(counts)}`, emailed, CONFIG.CLEARANCE_TEST_MODE);
    out.push({ team: t.team, counts, problem, emailed, coachOnFile: !!(c && c.email) });
  });

  if (mode === "send") {
    const rows = out.map(o => `<tr><td>${esc_(o.team)}</td><td>${o.counts.cleared}</td><td>${o.counts.pending}</td><td>${o.counts.incomplete}</td><td>${o.counts.expiredPhysical}</td><td>${o.problem ? (o.coachOnFile ? "emailed" : "<b>no coach email on file</b>") : "clean, no email"}</td></tr>`).join("");
    MailApp.sendEmail({ to: CONFIG.AD_EMAIL, subject: `Weekly clearance summary${CONFIG.CLEARANCE_TEST_MODE ? " (TEST MODE)" : ""}`,
      htmlBody: `<div style="font-family:Arial,sans-serif"><p>Counts only. Names went only to each team's coach.</p>
        <table border="1" cellpadding="6" style="border-collapse:collapse"><tr><th>Team</th><th>Cleared</th><th>Pending</th><th>Incomplete</th><th>Expired physical</th><th>Email</th></tr>${rows}</table></div>` });
  }
  return json_({ ok: true, mode, testMode: CONFIG.CLEARANCE_TEST_MODE, teams: out });
}

function clearanceHtml_(t, c) {
  const list = (title, arr, note) => arr && arr.length
    ? `<h3 style="margin:16px 0 4px">${title} (${arr.length})</h3>${note ? `<p style="margin:0;color:#666">${note}</p>` : ""}<ul>${arr.map(n => `<li>${esc_(n)}</li>`).join("")}</ul>` : "";
  return `<div style="font-family:Arial,sans-serif;font-size:15px">
    <p>Hi Coach ${esc_(c.name.split(" ")[0])},</p>
    <p>Here's this week's clearance check for <strong>${esc_(t.team)}</strong>. Athletes in every list except "Cleared" are not cleared yet.</p>
    ${list("Expired physical", t.expiredPhysical, "Physical must be valid for the whole season.")}
    ${list("Incomplete", t.incomplete, "")}
    ${list("Pending", t.pending, "")}
    ${list("Denied / practice only", t.other, "")}
    ${list("Cleared", t.cleared, "")}
    <p style="color:#666;font-size:13px">Confidential student information. Please don't forward or post it. You only get this email when something needs attention.</p></div>`;
}

/* ═════════════════════════ helpers ═════════════════════════ */

function readCoaches_() {
  const sh = SpreadsheetApp.getActive().getSheetByName("Coaches");
  const rows = sh ? sh.getDataRange().getValues().slice(1) : COACH_SEED.slice(1);
  return rows.filter(r => r[0]).map(r => ({
    team: String(r[0]).trim(), name: String(r[1] || "Coach").trim(), email: String(r[2] || "").trim(),
    active: String(r[3] || "Y").trim().toUpperCase().startsWith("Y"), levels: String(r[4] || "Varsity").trim()
  }));
}

function send_(to, subject, html, testMode) {
  if (testMode) {
    MailApp.sendEmail({ to: CONFIG.AD_EMAIL, subject: "[TEST → " + to + "] " + subject,
      htmlBody: `<p style="background:#FFF6DA;padding:8px;font-family:Arial">TEST MODE: this would have gone to <b>${esc_(to)}</b>.</p>` + html });
  } else {
    MailApp.sendEmail({ to, subject, htmlBody: html, name: "Helix Athletics" });
  }
}

function logSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName("Log");
  if (!sh) { sh = ss.insertSheet("Log"); sh.appendRow(["When", "What", "Detail (counts only, never names)", "Sent to", "Test mode"]); sh.setFrozenRows(1); }
  return sh;
}
function log_(what, detail, to, test) { logSheet_().appendRow([new Date(), what, detail, to, test ? "yes" : "no"]); }

const tz_ = () => Session.getScriptTimeZone();
const ymd_ = offset => Utilities.formatDate(new Date(Date.now() + offset * 864e5), tz_(), "yyyy-MM-dd");
const norm_ = s => String(s || "").toLowerCase().replace(/&|\band\b/g, "").replace(/[^a-z]/g, "");
const key_ = (team, level, date) => `${norm_(team)}|${norm_(level)}|${date}`;
const esc_ = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const json_ = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
