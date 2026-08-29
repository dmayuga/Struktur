"use strict";

/* ---------------------------------------------------------
   TAGWERK – deine Tagesstruktur
   Speicherung: IndexedDB (Fallback localStorage)
--------------------------------------------------------- */

/* ---------- Templates ---------- */

const WEEKDAY = [
  {
    title: "Morgen", time: "6:45 – 7:30",
    note: "Küche zuerst anwerfen, Mobility läuft nebenbei. 7:30 abfahrbereit.",
    items: [
      ["m_wasser", "Zitronenwasser trinken"],
      ["m_eier", "Eier kochen – für die Mittagspause"],
      ["m_kaffee", "Kaffee"],
      ["m_mobility", "Mobility – Handgelenke, Schultern, Rücken, Knie"],
      ["m_fertig", "Zähne, anziehen, Sachen packen"],
    ],
  },
  {
    title: "Baustelle",
    items: [
      ["b_belege", "Belege sofort scannen – jeden direkt, nichts sammeln"],
      ["b_ziel", "Tagesziel geschafft"],
    ],
    noteField: true,
  },
  {
    title: "Mittagspause",
    items: [
      ["mi_essen", "Eier + Skyr – Fasten brechen"],
      ["mi_mails", "E-Mails checken"],
      ["mi_bestell", "Bestellungen rausschicken"],
    ],
  },
  {
    title: "Abend",
    homepick: true,
    items: [
      ["a_duschen", "Heimkommen, duschen, runterkommen"],
      ["a_fokus", "Sport oder Fokusblock – Trading-Check / Führerschein", "flex"],
      ["a_kochen", "Kochen + gemeinsam essen – Zeit zu zweit, screenfrei"],
      ["a_winddown", "Wind-down – Handy weg, kein Chart"],
      ["a_bett", "Bett ~22:30"],
    ],
  },
];

const WEEKEND = [
  {
    title: "Morgen",
    items: [
      ["we_wasser", "Zitronenwasser + Kaffee"],
      ["we_mobility", "Mobility / lockeres Warm-up"],
    ],
  },
  {
    title: "Erholung & zu zweit",
    note: "Das Wochenende ist Trainings- und Erholungsfenster. Große Sachen unten in „Diese Woche“.",
    items: [
      ["we_frau", "Zeit zu zweit"],
      ["we_schlaf", "Bewusst erholen – Schlaf, kein Stress"],
    ],
  },
];

const WEEKLY = [
  ["w_training", "Harte Trainingseinheit – Muscle-up / weighted / Sprints"],
  ["w_trading", "Echtes Trading + Recap mit dem Bruder"],
  ["w_buchhaltung", "Buchhaltungsblock – Belege verbuchen, Rechnungen"],
  ["w_fuehrerschein", "Führerschein – ASF-Termin / Prüfung geplant"],
];

const HOME_HINTS = {
  early: "Früh zurück: Sport + ein Fokusblock möglich.",
  mid: "Mittel: nur eins – Sport <b>oder</b> Fokusblock, nicht beides.",
  late: "Spät: heute nur Kochen + Frau + Bett. Sport wandert aufs Wochenende.",
};

/* ---------- Datum-Helfer ---------- */

const WD_LONG = ["Sonntag","Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag"];
const MONTHS = ["Jan","Feb","März","Apr","Mai","Juni","Juli","Aug","Sept","Okt","Nov","Dez"];

function todayKey(d = new Date()) {
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}
function isWeekend(d = new Date()) { const n = d.getDay(); return n === 0 || n === 6; }
function weekKey(d = new Date()) {
  // ISO-Woche
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(),0,1));
  const wk = Math.ceil((((t - yearStart) / 86400000) + 1) / 7);
  return t.getUTCFullYear() + "-W" + String(wk).padStart(2,"0");
}

/* ---------- Storage (IndexedDB + Fallback) ---------- */

const Store = (() => {
  const DB = "tagwerk", VER = 1, STORE = "kv";
  let dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      let req;
      try { req = indexedDB.open(DB, VER); }
      catch (e) { return rej(e); }
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    return dbp;
  }
  async function get(key) {
    try {
      const db = await open();
      return await new Promise((res, rej) => {
        const tx = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
        tx.onsuccess = () => res(tx.result ?? null);
        tx.onerror = () => rej(tx.error);
      });
    } catch (e) {
      const raw = localStorage.getItem(DB + ":" + key);
      return raw ? JSON.parse(raw) : null;
    }
  }
  async function set(key, val) {
    // immer auch in localStorage spiegeln, damit nichts verloren geht
    try { localStorage.setItem(DB + ":" + key, JSON.stringify(val)); } catch (e) {}
    try {
      const db = await open();
      await new Promise((res, rej) => {
        const tx = db.transaction(STORE, "readwrite").objectStore(STORE).put(val, key);
        tx.onsuccess = () => res();
        tx.onerror = () => rej(tx.error);
      });
    } catch (e) { /* localStorage-Spiegel reicht als Fallback */ }
  }
  return { get, set };
})();

/* ---------- State ---------- */

let dayKey = todayKey();
let wkKey = weekKey();
let dayState = { checks:{}, returnTime:null, note:"" };
let weekState = { checks:{} };

async function loadState() {
  dayState = (await Store.get("day:" + dayKey)) || { checks:{}, returnTime:null, note:"" };
  weekState = (await Store.get("week:" + wkKey)) || { checks:{} };
}
async function saveDay() { await Store.set("day:" + dayKey, dayState); flashSaved(); }
async function saveWeek() { await Store.set("week:" + wkKey, weekState); flashSaved(); }

let savedTimer = null;
function flashSaved() {
  const el = document.getElementById("savedHint");
  if (!el) return;
  el.textContent = "Gespeichert ✓";
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => { el.textContent = "Alles wird lokal gespeichert."; }, 1200);
}

/* ---------- Rendering ---------- */

const CHECK_SVG = '<svg viewBox="0 0 20 20"><polyline points="4,11 8,15 16,5"/></svg>';

function itemRow(id, label, flag) {
  const done = !!dayState.checks[id];
  const dim = flag === "flex" && dayState.returnTime === "late" && !done;
  const div = document.createElement("div");
  div.className = "item" + (done ? " done" : "") + (dim ? " dimmed" : "");
  div.innerHTML = `<span class="box">${CHECK_SVG}</span><span class="label">${label}</span>`;
  div.addEventListener("click", () => {
    dayState.checks[id] = !dayState.checks[id];
    saveDay(); render();
  });
  return div;
}

function buildSection(sec) {
  const s = document.createElement("section");
  s.className = "section";

  const head = document.createElement("div");
  head.className = "sec-head";
  head.innerHTML = `<span class="sec-title">${sec.title}</span>` +
    (sec.time ? `<span class="sec-time">${sec.time}</span>` : "");
  s.appendChild(head);

  if (sec.note) {
    const n = document.createElement("div");
    n.className = "sec-note"; n.textContent = sec.note; s.appendChild(n);
  }

  // Heimkehr-Auswahl
  if (sec.homepick) {
    const hp = document.createElement("div");
    hp.className = "homepick";
    hp.innerHTML = `<div class="homepick-q">Wann bist du zurück?</div>
      <div class="segs">
        <div class="seg" data-rt="early">Früh<small>bis ~17</small></div>
        <div class="seg" data-rt="mid">Mittel<small>~17:30–18</small></div>
        <div class="seg" data-rt="late">Spät<small>~19</small></div>
      </div>`;
    hp.querySelectorAll(".seg").forEach(seg => {
      if (seg.dataset.rt === dayState.returnTime) seg.classList.add("active");
      seg.addEventListener("click", () => {
        dayState.returnTime = seg.dataset.rt; saveDay(); render();
      });
    });
    s.appendChild(hp);
    if (dayState.returnTime) {
      const hint = document.createElement("div");
      hint.className = "home-hint";
      hint.innerHTML = HOME_HINTS[dayState.returnTime];
      s.appendChild(hint);
    }
  }

  sec.items.forEach(([id, label, flag]) => s.appendChild(itemRow(id, label, flag)));

  // Notizfeld (Tagesziel Baustelle)
  if (sec.noteField) {
    const nw = document.createElement("div");
    nw.className = "notewrap";
    nw.innerHTML = `<label>Tagesziel Baustelle</label><textarea placeholder="Was soll heute fertig werden?"></textarea>`;
    const ta = nw.querySelector("textarea");
    ta.value = dayState.note || "";
    ta.addEventListener("input", () => { dayState.note = ta.value; });
    ta.addEventListener("blur", () => saveDay());
    s.appendChild(nw);
  }

  return s;
}

function buildWeekly() {
  const s = document.createElement("section");
  s.className = "section week";
  s.innerHTML = `<div class="sec-head"><span class="sec-title">Diese Woche</span>
    <span class="sec-time">${wkKey.replace("-W"," · KW ")}</span></div>
    <div class="sec-note">Die großen Brocken. Unter der Woche siehst du, was noch offen ist – am Wochenende holst du's rein.</div>`;
  WEEKLY.forEach(([id, label]) => {
    const done = !!weekState.checks[id];
    const div = document.createElement("div");
    div.className = "item" + (done ? " done" : "");
    div.innerHTML = `<span class="box">${CHECK_SVG}</span><span class="label">${label}</span>`;
    div.addEventListener("click", () => {
      weekState.checks[id] = !weekState.checks[id]; saveWeek(); render();
    });
    s.appendChild(div);
  });
  return s;
}

function computeProgress(template) {
  let total = 0, done = 0;
  template.forEach(sec => sec.items.forEach(([id,,flag]) => {
    if (flag === "flex" && dayState.returnTime === "late") return; // zählt spät nicht mit
    total++; if (dayState.checks[id]) done++;
  }));
  return total ? Math.round(done/total*100) : 0;
}

function render() {
  const weekend = isWeekend();
  const template = weekend ? WEEKEND : WEEKDAY;

  // Header
  const now = new Date();
  document.getElementById("weekday").textContent = WD_LONG[now.getDay()];
  document.getElementById("date").textContent = now.getDate() + ". " + MONTHS[now.getMonth()];
  document.getElementById("daytag").innerHTML = weekend
    ? "Wochenende – <b>Training, Erholung, die großen Brocken.</b>"
    : "Baustellentag – <b>fester Morgen, flexibler Abend.</b>";

  const pct = computeProgress(template);
  document.getElementById("ringNum").textContent = pct + "%";
  const circ = 2 * Math.PI * 18;
  document.getElementById("ringFg").style.strokeDashoffset = circ * (1 - pct/100);

  const content = document.getElementById("content");
  content.innerHTML = "";
  template.forEach(sec => content.appendChild(buildSection(sec)));
  content.appendChild(buildWeekly());
}

/* ---------- Tageswechsel abfangen ---------- */
function checkRollover() {
  const nowDay = todayKey(), nowWk = weekKey();
  if (nowDay !== dayKey || nowWk !== wkKey) {
    dayKey = nowDay; wkKey = nowWk;
    loadState().then(render);
  }
}
setInterval(checkRollover, 60 * 1000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkRollover(); });

/* ---------- Start ---------- */
loadState().then(render);

/* ---------- Service Worker ---------- */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
