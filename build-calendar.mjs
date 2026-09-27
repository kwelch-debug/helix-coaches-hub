// Helix Coaches Hub — calendar robot
// Runs on GitHub Actions (free, cloud, no computer needed) three times a day.
// 1. Reads the athletics calendar feeds.
// 2. Rewrites ONLY the block between FACILITY-CALENDAR:START / END in index.html.
// 3. Writes games.json (recent + upcoming games) for the score form and reminders.
//
// ── SETTINGS ─────────────────────────────────────────────────────────────
const SETTINGS = {
  timeZone: "America/Los_Angeles",

  // Public Mascot Media feed (helixathletics.net → Calendar → Subscribe). All sports.
  mascotMediaIcs: "https://mmboltapi.azurewebsites.net/api/v2/events/calendar/2633790/0/calendar.ics",

  // Where an event counts as "on our facilities" (shown in the facility calendar).
  // Matched against the event LOCATION, case-insensitive.
  homeVenues: /helix|stadium|lower field|upper field|main gym|small gym|dawg house/i,

  // Opponent text that means "not a single game with a score" — no score button,
  // no reminder email. (Tournaments, invitationals, meets, placeholders.)
  notAGame: /\b(tba|tbd|tournament|tourney|inv\.?|invitational|cup|meet|finals?|championships?|open|clinic|scrimmage|bye|jamboree|showcase|classic)\b/i,

  facilityDays: 7,      // days shown in the facility calendar (starting today)
  gamesBackDays: 14,    // how far back games.json reaches
  gamesAheadDays: 30    // how far ahead games.json reaches
};
// ─────────────────────────────────────────────────────────────────────────

import fs from "node:fs";
import path from "node:path";
import IcalExpander from "ical-expander";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = fs.existsSync(path.join(HERE, "index.html")) ? HERE : path.resolve(HERE, "..");
const INDEX = path.join(ROOT, "index.html");
const GAMES = path.join(ROOT, "games.json");
const START = "<!-- FACILITY-CALENDAR:START";
const END = "<!-- FACILITY-CALENDAR:END -->";

// Extra feeds come from repository secrets (never commit secret addresses):
//   GOOGLE_ICS  — one per line, "Label|https://calendar.google.com/calendar/ical/.../private-.../basic.ics"
//   ARBITER_ICS — optional, same format
function feedList() {
  const feeds = [{ label: "Athletics", url: SETTINGS.mascotMediaIcs, kind: "games" }];
  for (const [env, kind] of [["GOOGLE_ICS", "facility"], ["ARBITER_ICS", "facility"]]) {
    (process.env[env] || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(line => {
      const i = line.indexOf("|");
      const label = i > 0 && !line.slice(0, i).includes("://") ? line.slice(0, i).trim() : "";
      const url = i > 0 && label ? line.slice(i + 1).trim() : line;
      feeds.push({ label, url, kind });
    });
  }
  if (process.env.MASCOT_OVERRIDE) feeds[0].url = process.env.MASCOT_OVERRIDE; // testing only
  return feeds;
}

async function readFeed(url) {
  if (!/^https?:|^webcal:/.test(url)) return fs.readFileSync(url.replace(/^file:\/\//, ""), "utf8");
  const res = await fetch(url.replace(/^webcal:/, "https:"), { headers: { "User-Agent": "HelixCoachesHub/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (!text.includes("BEGIN:VCALENDAR")) throw new Error("not an iCal feed");
  return text;
}

// ── date helpers (always in Pacific time) ──
const partsFmt = new Intl.DateTimeFormat("en-US", { timeZone: SETTINGS.timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
function pt(date) {
  const p = Object.fromEntries(partsFmt.formatToParts(date).map(x => [x.type, x.value]));
  const hour = p.hour === "24" ? 0 : +p.hour;
  return { ymd: `${p.year}-${p.month}-${p.day}`, hour, minute: +p.minute };
}
const time12 = (h, m) => `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
const addDays = (ymd, n) => { const d = new Date(ymd + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dayLabel = ymd => new Date(ymd + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// "Girls JV GREY Flag Football vs El Capitan HS" → parts
const GAME_RE = /^(Boys|Girls|Coed)\s+(Varsity|JV(?:\s+[A-Z]{3,}(?=\s))?|Junior Varsity|Freshman|Frosh(?:\/Soph)?|Sophomore|Novice)\s+(.+?)\s+(vs\.?|at|@)\s+(.+)$/;
function parseGame(summary) {
  const m = (summary || "").trim().match(GAME_RE);
  if (!m) return null;
  const level = m[2].replace(/\b([A-Z])([A-Z]+)\b/g, (w, a, b) => w === "JV" ? w : a + b.toLowerCase());
  return { team: `${m[1]} ${m[3]}`.trim(), level, homeAway: m[4].startsWith("vs") ? "Home" : "Away", opponent: m[5].trim() };
}

function occurrences(ics, fromYmd, toYmd) {
  const ex = new IcalExpander({ ics, maxIterations: 2000 });
  const { events, occurrences } = ex.between(new Date(fromYmd + "T00:00:00Z"), new Date(addDays(toYmd, 1) + "T12:00:00Z"));
  const out = [];
  const push = (item, startDate) => {
    if ((item.component.getFirstPropertyValue("status") || "").toUpperCase() === "CANCELLED") return;
    let ymd, time = "";
    if (startDate.isDate) ymd = `${startDate.year}-${String(startDate.month).padStart(2, "0")}-${String(startDate.day).padStart(2, "0")}`;
    else { const p = pt(startDate.toJSDate()); ymd = p.ymd; if (p.hour || p.minute) time = time12(p.hour, p.minute); }
    if (ymd < fromYmd || ymd > toYmd) return;
    out.push({ ymd, time, summary: (item.summary || "").trim(), location: (item.location || "").trim(), uid: item.uid });
  };
  events.forEach(e => push(e, e.startDate));
  occurrences.forEach(o => push(o.item, o.startDate));
  return out;
}

async function main() {
  const today = pt(new Date()).ymd;
  const calFrom = addDays(today, -1);                       // browser hides past days itself
  const calTo = addDays(today, SETTINGS.facilityDays);
  const gFrom = addDays(today, -SETTINGS.gamesBackDays), gTo = addDays(today, SETTINGS.gamesAheadDays);

  const facility = [], games = [];
  let ok = 0, gamesFeedOk = false;
  for (const f of feedList()) {
    try {
      const ics = await readFeed(f.url);
      const evs = occurrences(ics, gFrom < calFrom ? gFrom : calFrom, gTo > calTo ? gTo : calTo);
      ok++; if (f.kind === "games") gamesFeedOk = true;
      console.log(`✓ ${f.label || "feed"}: ${evs.length} events`);
      for (const e of evs) {
        const g = f.kind === "games" ? parseGame(e.summary) : null;
        if (g && e.ymd >= gFrom && e.ymd <= gTo && !SETTINGS.notAGame.test(g.opponent)) {
          games.push({ date: e.ymd, time: e.time, team: g.team, level: g.level, opponent: g.opponent, homeAway: g.homeAway, location: e.location, id: `${e.uid}|${e.ymd}` });
        }
        const onSite = f.kind === "facility" || SETTINGS.homeVenues.test(e.location) || (!e.location && g && g.homeAway === "Home");
        if (onSite && e.ymd >= calFrom && e.ymd <= calTo) facility.push({ ...e, cal: f.kind === "facility" ? f.label : "" });
      }
    } catch (err) {
      // A dead feed is skipped; the others still publish.
      console.warn(`✗ ${f.label || "feed"} skipped: ${err.message}`);
    }
  }
  if (!ok) { console.error("Every feed failed — leaving the site unchanged (never publish a blank calendar)."); process.exit(0); }

  // ── facility calendar HTML ──
  const byDay = {};
  facility.forEach(e => (byDay[e.ymd] ||= []).push(e));
  let html = `\n    <div class="cal" data-built="${new Date().toISOString()}">\n`;
  for (let d = calFrom; d <= calTo; d = addDays(d, 1)) {
    const list = (byDay[d] || []).sort((a, b) => {
      const ta = a.time ? new Date(`2000-01-01 ${a.time}`) : 0, tb = b.time ? new Date(`2000-01-01 ${b.time}`) : 0;
      return ta - tb;
    });
    html += `      <div class="cal-block" data-cal-day="${d}"><div class="cal-day" data-cal-date="${d}">${dayLabel(d)}</div>\n`;
    html += list.length
      ? `        <ul class="cal-list">\n${list.map(e => `          <li><span class="cal-t">${esc(e.time || "All day")}</span><span>${esc(e.summary)}${e.location ? ` <span class="muted">· ${esc(e.location)}</span>` : ""}${e.cal ? ` <span class="cal-tag">${esc(e.cal)}</span>` : ""}</span></li>`).join("\n")}\n        </ul>\n`
      : `        <p class="muted cal-none">Nothing on the calendar.</p>\n`;
    html += `      </div>\n`;
  }
  html += `      <p class="muted" style="margin-top:8px">Updated automatically from the <a href="https://www.helixathletics.net/calendar">athletics calendar</a>.</p>\n    </div>\n`;

  const page = fs.readFileSync(INDEX, "utf8");
  const a = page.indexOf(START), b = page.indexOf(END);
  if (a < 0 || b < 0) throw new Error("Calendar markers not found in index.html");
  const startLineEnd = page.indexOf("\n", a) + 1;
  const next = page.slice(0, startLineEnd) + html + page.slice(b);
  fs.writeFileSync(INDEX, next);

  if (!gamesFeedOk) { console.warn("Games feed failed — keeping the previous games.json."); return; }
  games.sort((x, y) => x.date.localeCompare(y.date) || x.team.localeCompare(y.team));
  const seen = new Set();
  const unique = games.filter(g => { const k = g.id; if (seen.has(k)) return false; seen.add(k); return true; });
  fs.writeFileSync(GAMES, JSON.stringify(unique, null, 1) + "\n");
  console.log(`Facility calendar: ${facility.length} events · games.json: ${unique.length} games`);
}

main().catch(e => { console.error(e); process.exit(1); });
