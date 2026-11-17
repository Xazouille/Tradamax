/* Tradamax V1 — journal partagé, prop firms et annonces économiques.
   Données : Supabase (voir supabase/schema.sql). Aucune clé secrète dans ce fichier. */
(function () {
"use strict";

/* ---------------- thème clair / sombre ---------------- */
/* Par défaut le thème suit le système ; le bouton mémorise un choix sur cet appareil. */
document.addEventListener("click", function (e) {
  var b = e.target.closest && e.target.closest("[data-action]"); if (!b) return;
  var root = document.documentElement, act = b.getAttribute("data-action");
  if (act === "theme") {
    var cur = root.getAttribute("data-theme") || (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    var next = cur === "dark" ? "light" : "dark"; root.setAttribute("data-theme", next);
    try { localStorage.setItem("tradamax-theme", next); } catch (err) {}
  }
  if (act === "print-report") {
    root.setAttribute("data-print", "report");
    var done = function () { root.removeAttribute("data-print"); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done); window.print();
  }
});

/* ---------------- mode démonstration (local uniquement) ---------------- */
/* http://localhost:PORT/?demo : données fictives en mémoire, sans Supabase. Inactif sur le site en ligne. */
var DEMO = /[?&]demo\b/.test(location.search) && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
function demoClient() {
  var n = 0, shots = {}, today = new Date().toISOString().slice(0, 10);
  var db = { trades: [], reglages: [{ id: 1, data: {} }],
    prop_comptes: [
      { id: "demo-p1", firme: "FTMO", programme: "2-Step", taille: 50000, devise: "EUR", statut: "Compte financé", cout: 345, date_achat: today, note: null },
      { id: "demo-p2", firme: "FTMO", programme: "2-Step", taille: 50000, devise: "EUR", statut: "Challenge en cours", cout: 345, date_achat: today, note: null },
      { id: "demo-p3", firme: "FundedNext", programme: "Stellar 2-Step", taille: 50000, devise: "USD", statut: "Challenge échoué", cout: 299.99, date_achat: today, note: null }],
    payouts: [{ id: "demo-y1", compte_id: "demo-p1", date: today, montant: 1850, devise: "EUR", note: "Premier versement" }],
    backtest_avis: [], backtest_controles: [] };
  function ok(data) { return Promise.resolve({ data: data, error: null }); }
  function query(table) {
    var op = "select", payload = null, filt = null, single = false, rng = null;
    function match(r) { return !filt || r[filt[0]] === filt[1]; }
    function run() {
      var t = db[table];
      if (op === "insert") { [].concat(payload).forEach(function (r) { t.push(Object.assign({ id: "demo-" + (++n), created_at: new Date().toISOString() }, r)); }); return ok(null); }
      if (op === "update") { t.forEach(function (r) { if (match(r)) Object.assign(r, payload); }); return ok(null); }
      if (op === "upsert") { var key = payload.setup_id != null ? "setup_id" : "id", e = t.find(function (r) { return r[key] === payload[key]; }); if (e) Object.assign(e, payload); else t.push(Object.assign({ created_at: new Date().toISOString() }, payload)); return ok(null); }
      if (op === "delete") {
        if (table === "prop_comptes") { var gone = t.filter(match).map(function (r) { return r.id; }); db.payouts = db.payouts.filter(function (y) { return gone.indexOf(y.compte_id) < 0; }); }
        db[table] = t.filter(function (r) { return !match(r); }); return ok(null);
      }
      var rows = t.filter(match); if (single) return ok(rows[0] || null);
      return ok(rng ? rows.slice(rng[0], rng[1] + 1) : rows);
    }
    var b = {
      select: function () { return b; }, order: function () { return b; }, range: function (a, z) { rng = [a, z]; return b; },
      eq: function (k, v) { filt = [k, v]; return b; }, maybeSingle: function () { single = true; return b; },
      insert: function (rows) { op = "insert"; payload = rows; return b; }, update: function (row) { op = "update"; payload = row; return b; },
      upsert: function (row) { op = "upsert"; payload = row; return b; }, delete: function () { op = "delete"; return b; },
      then: function (res, rej) { return run().then(res, rej); }
    };
    return b;
  }
  var chan = { on: function () { return chan; }, subscribe: function () { return chan; } };
  /* stockage en mémoire, par espace (captures, historique) ; l'historique démarre avec un index fictif */
  var files = { "historique/_index.json": new Blob([JSON.stringify(demoHistoIndex())], { type: "application/json" }) };
  return {
    from: query,
    storage: { from: function (bucket) { return {
      upload: function (path, file) { files[bucket + "/" + path] = file; if (bucket === "captures") shots[path] = URL.createObjectURL(file); return ok(null); },
      download: function (path) {
        var key = bucket + "/" + path, f = files[key], mm = bucket === "historique" && /^(.+)\/(\d{4}-\d{2})\.csv\.gz$/.exec(path);
        if (!f && mm) return hiGz(demoMonth(mm[1], mm[2])).then(function (b) { files[key] = b; return { data: b, error: null }; }); /* bougies fictives */
        /* même forme d'erreur que le vrai Supabase : message « {} » et réponse brute à lire */
        return Promise.resolve(f ? { data: f, error: null } : { data: null, error: { message: "{}", originalError: new Response(JSON.stringify({ statusCode: "404", error: "not_found", message: "Object not found" }), { status: 400 }) } });
      },
      createSignedUrls: function (paths) { return ok(paths.map(function (p) { return { path: p, signedUrl: shots[p] || null }; })); },
      remove: function () { return ok(null); } }; } },
    channel: function () { return chan; }, removeChannel: function () {},
    auth: { signOut: function () { toast("Mode démonstration : aucun compte à déconnecter."); return ok(null); } }
  };
}
function demoHistoIndex() {
  /* couverture fictive : XAUUSD de mars 2023 à octobre 2025 (juillet 2024 absent, octobre 2025 incomplet), DAX depuis 2024 */
  function months(from, to, skip, part) {
    var out = {}, y = Number(from.slice(0, 4)), m = Number(from.slice(5)), seed = 3;
    while (y * 100 + m <= Number(to.replace("-", ""))) {
      var k = y + "-" + String(m).padStart(2, "0"); seed = (seed * 16807) % 2147483647;
      if (k !== skip) out[k] = { n: k === part ? 9420 : 29800 + seed % 2400, gaps: seed % 7 === 0 ? 1 : 0 };
      if (++m > 12) { m = 1; y++; }
    }
    return out;
  }
  return { v: 1, markets: {
    XAUUSD: { slug: "XAUUSD", tz: "ny7", updated: "2026-11-16T09:12:00Z", months: months("2023-03", "2025-10", "2024-07", "2025-10") },
    DAX: { slug: "DAX", tz: "ny7", updated: "2026-11-16T09:20:00Z", months: months("2024-01", "2025-10", null, null) } } };
}
function demoMonth(slug, key) {
  /* un mois de bougies M1 fictives (marche au hasard avec des poussées), heures d'ouverture de l'or : dimanche 18h à vendredi 17h, pause de 17h à 18h (New York) */
  var base = { XAUUSD: [2600, .35], DAX: [19000, 2.5], Nasdaq: [20000, 3] }[slug] || [1000, .2];
  var y = Number(key.slice(0, 4)), mo = Number(key.slice(5)) - 1, seed = ((y * 12 + mo) * 7919 + slug.length * 104729) % 2147483646 + 1;
  var p = base[0] * (1 + ((y * 12 + mo) % 7) * .01), vol = base[1], drift = 0, out = ["t;o;h;l;c;s"], days = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
  for (var d = 1; d <= days; d++) {
    var wd = new Date(Date.UTC(y, mo, d)).getUTCDay();
    for (var mn = 0; mn < 1440; mn++) {
      if (wd === 6 || (wd === 0 && mn < 1080) || (wd === 5 && mn >= 1020) || (mn >= 1020 && mn < 1080)) continue;
      if (rnd() < .004) drift = (rnd() - .5) * vol * 1.4; if (rnd() < .01) drift *= .3;
      var o = p, c = o + drift + (rnd() - .5) * 2 * vol, h = Math.max(o, c) + rnd() * vol * .6, l = Math.min(o, c) - rnd() * vol * .6; p = c;
      out.push(Math.round(wallToUtc(Date.UTC(y, mo, d, 0, mn), "America/New_York") / 60000) + ";" + o.toFixed(2) + ";" + h.toFixed(2) + ";" + l.toFixed(2) + ";" + c.toFixed(2) + ";");
    }
  }
  return out.join("\n") + "\n";
}
function demoCal() {
  var d = new Date(), y = d.getUTCFullYear(), m = d.getUTCMonth(), j = d.getUTCDate();
  function at(off, h, mi) { return new Date(Date.UTC(y, m, j + off, h, mi)).toISOString(); }
  return [
    { title: "Indice ZEW du sentiment économique", country: "EUR", date: at(0, 10, 0), impact: "Medium", forecast: "12,5", previous: "10,3" },
    { title: "Inflation CPI (mensuel)", country: "USD", date: at(0, 13, 30), impact: "High", forecast: "0,3 %", previous: "0,2 %" },
    { title: "Confiance des consommateurs", country: "USD", date: at(0, 15, 0), impact: "High", forecast: "101,2", previous: "99,8" },
    { title: "Compte rendu de la Fed (FOMC)", country: "USD", date: at(0, 19, 0), impact: "High", forecast: "", previous: "" },
    { title: "Stocks de pétrole brut", country: "USD", date: at(0, 15, 30), impact: "Low", forecast: "-1,2 M", previous: "0,8 M" },
    { title: "Inscriptions hebdomadaires au chômage", country: "USD", date: at(1, 13, 30), impact: "High", forecast: "221 k", previous: "218 k" },
    { title: "Discours de la présidente de la BCE", country: "EUR", date: at(1, 9, 0), impact: "Medium", forecast: "", previous: "" }
  ];
}

/* ---------------- constantes ---------------- */
var DEF = {
  markets: ["XAUUSD", "DAX", "Nasdaq"],
  accounts: ["Compte VT Markets perso", "Challenge prop firm", "Prop firm financé", "Compte démo"],
  /* type et capital de départ de chaque compte du journal (le compte réel prend « capital » tant qu'il n'est pas réglé) */
  accountsInfo: { "Compte VT Markets perso": { type: "sas", capital: 15000 }, "Challenge prop firm": { type: "prop", capital: 50000 }, "Prop firm financé": { type: "prop", capital: 50000 }, "Compte démo": { type: "demo", capital: null } },
  rPlanDefault: 2, capital: 15000, eurusd: 1.115
};
var ACC_TYPES = { sas: "Compte réel", prop: "Prop firm", demo: "Démo" }; /* le type « sas » désigne le compte réel suivi par la charte */
var ACC_SHORT = { sas: "réel", prop: "prop firm", demo: "démo" };
var WINDOWS = [
  { id: "London", label: "Londres", ny: "3h–4h NY", paris: "9h–10h Paris", s: 180, e: 240 },
  { id: "NYAM", label: "NY AM", ny: "10h–11h NY", paris: "16h–17h Paris", s: 600, e: 660 },
  { id: "NYPM", label: "NY PM", ny: "14h–15h NY", paris: "20h–21h Paris", s: 840, e: 900 },
  { id: "Out", label: "Hors fenêtre", ny: "", paris: "", s: -1, e: -1 }
];
/* Sessions complètes (heure de New York, sans chevauchement) : chacune contient une fenêtre Silver Bullet.
   Elles classent les trades et les statistiques ; les fenêtres servent au bandeau de séance et aux annonces. */
var SESSIONS = [
  { id: "London", label: "Londres", s: 120, e: 480 },
  { id: "NYAM", label: "New York matin", s: 480, e: 720 },
  { id: "NYPM", label: "New York après-midi", s: 720, e: 960 },
  { id: "Out", label: "Hors session", s: -1, e: -1 }
];
var EMOTIONS = ["Calme", "Confiant", "Hésitant", "Impatient", "Revanche", "Fatigué"];
var PALIERS = [{ p: .10, l: "Vigilance" }, { p: .20, l: "Révision + pause" }, { p: .30, l: "Pause renforcée" }];
var GAUGE_MAX = .35;
var PROP_STATUS = ["Challenge en cours", "Challenge échoué", "Compte financé", "Compte financé perdu", "Clôturé"];
var FIRMS_REF = [
  ["FTMO", "345 €", "Oui (option Company)", "0 $", "Seule firme confirmée pour la SAS"],
  ["The5ers", "249 $", "Non", "4 $ par lot", "Pas de compte 200 000"],
  ["FundedNext", "299,99 $", "Non", "≈ 7 $ par lot", "Proche de FTMO, compte personnel"],
  ["Whales Capital", "315 $", "À vérifier", "Non publiée", "Meilleur jour ≤ 40 % du gain"],
  ["Alpha Capital", "277 $", "À vérifier", "Non précisée", "Faux avis retirés par Trustpilot"],
  ["FundingPips", "349 $", "À vérifier", "5 $ par lot", "Remboursement au 4e versement"],
  ["Topstep", "49 $ / mois", "Non", "GC 3,24 $", "Pas de DAX"],
  ["Apex Trader Funding", "Non publié", "À vérifier", "Non publiée", "Tarifs non publiés"]
];

var S = {
  sb: null, user: null, loaded: false, trades: [], sample: [], useSample: false,
  set: JSON.parse(JSON.stringify(DEF)),
  f: { period: "all", account: null, market: "all" }, q: "", shown: 30, selSig: "",
  calY: null, calM: null, editing: null, shotFile: null, shotPath: null, signed: {},
  props: [], payouts: [], editingProp: null, importRows: null, tmpM: null, tmpA: null,
  cal: null, calUpdated: null, ecoDay: "today", tab: "", homeAcc: "sas", hmR7: [],
  hiIdx: null, hiErr: null, hiRaw: null, hiA: null, hiBusy: false,
  bt: null, btBusy: false, avis: {}, avisErr: null, rvFilter: "todo", rvShown: 30, rv: null, ctl: null, ctlErr: null, ctlBusy: false
};

/* ---------------- utilitaires ---------------- */
var $ = function (id) { return document.getElementById(id); };
function el(tag, attrs, kids) {
  var e = document.createElement(tag);
  if (attrs) for (var k in attrs) { var v = attrs[k]; if (v == null) continue;
    if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else e.setAttribute(k, v); }
  (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
  return e;
}
function svgEl(tag, attrs) { var e = document.createElementNS("http://www.w3.org/2000/svg", tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
function icon(name) { var s = svgEl("svg", { class: "tx-ico", "aria-hidden": "true" }); s.appendChild(svgEl("use", { href: "#" + name })); return s; }
var nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
var nf2 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function eur(v) { return nf0.format(Math.round(v)) + " €"; }
function seur(v) { var r = Math.round(v); return (r > 0 ? "+" : r < 0 ? "−" : "") + nf0.format(Math.abs(r)) + " €"; }
function money(v, cur) { return cur === "EUR" ? eur(v) : nf2.format(v) + " $"; }
function pct(v, d) { return (v * 100).toFixed(d == null ? 1 : d).replace(".", ",") + " %"; }
function rfmt(v) { return v == null ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(2).replace(".", ",") + " R"; }
function cls(v) { return v > 0 ? "tx-pos" : v < 0 ? "tx-neg" : ""; }
function frDate(iso) { if (!iso) return ""; var p = iso.split("-"); return p[2] + "/" + p[1] + "/" + p[0].slice(2); }
function todayISO() { return isoParis(new Date()); }
function num(v) { if (v === "" || v == null) return null; var n = Number(v); return isFinite(n) ? n : null; }
function winLabel(id) { var w = SESSIONS.find(function (x) { return x.id === id; }); return w ? w.label : (id || "—"); }
function toast(msg) { var t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 2600); }
function show(id, on) { $(id).hidden = !on; }
function rOf(t) { return t.risk > 0 ? t.pnl / t.risk : null; }
function rPlanOf(t) { return Number(t.rPlan) > 0 ? Number(t.rPlan) : S.set.rPlanDefault; }
function toEur(v, cur) { return cur === "EUR" ? v : v / (S.set.eurusd || 1); }
var MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
function kfmt(v) { var a = Math.abs(v), s = v > 0 ? "+" : v < 0 ? "−" : ""; return a >= 10000 ? s + nf0.format(Math.round(a / 1000)) + "k" : a >= 1000 ? s + (a / 1000).toFixed(1).replace(".", ",") + "k" : s + nf0.format(Math.round(a)); }
var fmtParisDate = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });
function isoParis(d) { return fmtParisDate.format(d); }
var fmtParisTime = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
var fmtNYParts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function nyMinutes(d) { var p = fmtNYParts.formatToParts(d), h = 0, m = 0; p.forEach(function (x) { if (x.type === "hour") h = Number(x.value); if (x.type === "minute") m = Number(x.value); }); return h * 60 + m; }
function nyTime(d) { var mm = nyMinutes(d); return String(Math.floor(mm / 60)).padStart(2, "0") + ":" + String(mm % 60).padStart(2, "0"); }
function download(name, text) {
  var blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
  var a = el("a", { href: URL.createObjectURL(blob), download: name }); document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ---------------- mapping base <-> page ---------------- */
function fromRow(r) {
  return { id: r.id, date: r.date, time: r.heure || "", market: r.marche, account: r.compte, side: r.sens, window: r.fenetre,
    entry: num(r.entree), stop: num(r.stop), exit: num(r.sortie), size: num(r.taille), risk: num(r.risque), rPlan: num(r.r_prevu),
    pnl: Number(r.resultat) || 0, plan: r.plan !== false, emotion: r.emotion, note: r.note, shot: r.capture };
}
function toRow(t) {
  return { date: t.date, heure: t.time || null, marche: t.market, compte: t.account, sens: t.side, fenetre: t.window,
    entree: t.entry, stop: t.stop, sortie: t.exit, taille: t.size, risque: t.risk, r_prevu: t.rPlan, resultat: t.pnl,
    plan: t.plan, emotion: t.emotion || null, note: t.note || null, capture: t.shot || null };
}

/* ---------------- exemples (jamais enregistrés) ---------------- */
function makeSample() {
  var seed = 7; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
  var out = [], d = new Date(); d.setDate(d.getDate() - 95);
  /* les exemples utilisent les comptes des Réglages : le compte réel pour la moitié, les autres pour le reste */
  var real = sasNames()[0] || S.set.accounts[0], others = S.set.accounts.filter(function (a) { return a !== real; });
  for (var i = 0; i < 95; i++) {
    d.setDate(d.getDate() + 1); var wd = d.getDay(); if (wd === 0 || wd === 6) continue; if (rnd() < .25) continue;
    var m = rnd() < .45 ? "XAUUSD" : rnd() < .55 ? "Nasdaq" : "DAX";
    var w = rnd() < .5 ? "NYAM" : rnd() < .6 ? "London" : rnd() < .85 ? "NYPM" : "Out";
    var plan = rnd() < .82, win = rnd() < (plan ? .47 : .3);
    var r = win ? (1.2 + rnd() * 2.3) : -(plan ? 1 : 1 + rnd() * .8);
    var hh = { London: "09", NYAM: "16", NYPM: "20", Out: "14" }[w];
    out.push({ id: "ex" + i, date: isoParis(d), time: hh + ":" + String(Math.floor(rnd() * 55)).padStart(2, "0"), market: m,
      account: rnd() < .55 || !others.length ? real : others[Math.floor(rnd() * others.length)], side: rnd() < .55 ? "Long" : "Short",
      window: w, risk: 150, pnl: Math.round(r * 150), plan: plan,
      emotion: plan ? (rnd() < .6 ? "Calme" : "Confiant") : (["Impatient", "Revanche", "Hésitant", "Fatigué"][Math.floor(rnd() * 4)]), note: "Exemple", sample: true });
  }
  return out;
}

/* ---------------- sélection et statistiques ---------------- */
function source() { return S.useSample ? S.sample : S.trades; }
function filtered() {
  var lim = null, now = new Date();
  if (S.f.period === "30" || S.f.period === "90") { var d = new Date(); d.setDate(d.getDate() - Number(S.f.period)); lim = isoParis(d); }
  if (S.f.period === "ytd") lim = now.getFullYear() + "-01-01";
  return source().filter(function (t) {
    if (lim && t.date < lim) return false;
    if (S.f.account !== "all" && t.account !== S.f.account) return false;
    if (S.f.market !== "all" && t.market !== S.f.market) return false;
    return true;
  }).slice().sort(function (a, b) { return (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")); });
}
/* comptes : type (réel, prop firm, démo) et capital de départ ; sans capital connu, pas de drawdown */
function accInfo(name) {
  var i = (S.set.accountsInfo || {})[name]; if (i && ACC_TYPES[i.type]) return i;
  var s = norm(name), type = /demo/.test(s) ? "demo" : /sas|reel/.test(s) ? "sas" : "prop";
  return { type: type, capital: type === "sas" ? S.set.capital : null };
}
function accCap(name) { var c = Number(accInfo(name).capital); return c > 0 ? c : null; }
/* comptes des Réglages, plus ceux encore utilisés par des trades enregistrés (jamais par les exemples) */
function accList() { var out = S.set.accounts.slice(); S.trades.forEach(function (t) { if (t.account && out.indexOf(t.account) < 0) out.push(t.account); }); return out; }
/* L'ancien nom par défaut « Compte SAS » devient « Compte VT Markets perso », tant qu'aucun trade ne l'utilise.
   Le changement est enregistré au prochain « Enregistrer » des Réglages. */
function renameLegacy() {
  var o = "Compte SAS", nw = "Compte VT Markets perso", i = S.set.accounts.indexOf(o);
  if (i < 0 || S.set.accounts.indexOf(nw) >= 0 || S.trades.some(function (t) { return t.account === o; })) return;
  S.set.accounts = S.set.accounts.slice(); S.set.accounts[i] = nw;
  var info = Object.assign({}, S.set.accountsInfo || {}); info[nw] = info[o] || { type: "sas", capital: S.set.capital }; delete info[o]; S.set.accountsInfo = info;
}
/* heures de Paris d'une session pour un jour donné (calculées avec Intl, le décalage avec New York varie) */
function hFmt(m) { var h = Math.floor(m / 60), mi = m % 60; return h + "h" + (mi ? String(mi).padStart(2, "0") : ""); }
function sessionHours(w, dayKey) { if (!w || w.s < 0) return ""; var d = dayKey || todayISO(); return hFmt(parisMinutes(nyWindowDate(d, w.s))) + "–" + hFmt(parisMinutes(nyWindowDate(d, w.e))); }
/* session d'un trade à partir de sa date et de son heure de Paris */
function sessionOf(dateIso, time) {
  var t = String(time || "").match(/^(\d{1,2}):(\d{2})/); if (!dateIso || !t) return null;
  var p = dateIso.split("-").map(Number), off = parisMinutes(new Date(Date.UTC(p[0], p[1] - 1, p[2], 12, 0))) - 720;
  var m = nyMinutes(new Date(Date.UTC(p[0], p[1] - 1, p[2], Number(t[1]), Number(t[2])) - off * 60000));
  var w = SESSIONS.find(function (x) { return x.s >= 0 && m >= x.s && m < x.e; }); return w ? w.id : "Out";
}
function sasNames() { return accList().filter(function (a) { return accInfo(a).type === "sas"; }); }
function viewCap() { return S.f.account === "all" || S.f.account == null ? null : accCap(S.f.account); }
/* ajouts (montant positif) et retraits (négatif) de capital, datés, par compte */
function accMoves(name) { return (accInfo(name).moves || []).slice().sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); }); }
function viewMoves() { return S.f.account === "all" || S.f.account == null ? [] : accMoves(S.f.account); }
function byDT(a, b) { return (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")); }
/* Un ajout de capital n'est jamais un gain : il monte le capital et le plus haut du même montant,
   donc le drawdown en euros ne change pas et un drawdown en cours ne disparaît pas. */
function stats(ts, cap, moves) {
  var has = cap != null && cap > 0, n = ts.length, gw = 0, gl = 0, w = 0, l = 0, rs = [], cum = 0, eq = [], peak = has ? cap : null, maxdd = 0, maxddE = 0;
  var mv = (moves || []).slice().sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); }), mi = 0, added = 0;
  function applyUntil(d) { while (mi < mv.length && (d == null || mv[mi].date <= d)) { var a = Number(mv[mi].amount) || 0; added += a; if (has) peak += a; mi++; } }
  ts.forEach(function (t, i) {
    applyUntil(t.date);
    var p = Number(t.pnl) || 0; if (p > 0) { gw += p; w++; } else if (p < 0) { gl += -p; l++; }
    var r = rOf(t); if (r != null) rs.push(r);
    cum += p;
    if (has) { var c = cap + added + cum; if (c > peak) peak = c; var dd = peak > 0 ? (peak - c) / peak : 0; if (dd > maxdd) { maxdd = dd; maxddE = peak - c; } }
    eq.push({ i: i + 1, cum: cum, t: t });
  });
  applyUntil(null);
  var cur = has ? cap + added + cum : null;
  return { n: n, total: cum, w: w, l: l, wr: n ? w / n : null, pf: gl > 0 ? gw / gl : (gw > 0 ? Infinity : null), exp: n ? cum / n : null,
    avgR: rs.length ? rs.reduce(function (a, b) { return a + b; }, 0) / rs.length : null, rs: rs, eq: eq, cap: has ? cap : null, added: added, peak: peak, cur: cur,
    ddNow: has ? (peak > 0 ? Math.max(0, (peak - cur) / peak) : 0) : null, maxdd: has ? maxdd : null, maxddE: has ? maxddE : null, avgW: w ? gw / w : null, avgL: l ? gl / l : null };
}

/* ---------------- rendu du journal ---------------- */
function renderJournal() {
  if (S.f.account == null) S.f.account = sasNames()[0] || "all";
  refreshSelects();
  var ts = filtered(), st = stats(ts, viewCap(), viewMoves());
  $("banner").hidden = !S.useSample;
  renderEquity(st); renderDD(st); renderOthers(); renderKPIs(st);
  renderGroups($("by-market"), ts, function (t) { return t.market; }, S.set.markets, function () { return null; });
  renderGroups($("by-window"), ts, function (t) { return t.window || "Out"; }, SESSIONS.map(function (w) { return w.id; }),
    function (k) { var w = SESSIONS.find(function (x) { return x.id === k; }); return w && w.s >= 0 ? sessionHours(w) : null; }, winLabel);
  renderHist(st.rs); renderPlan(ts); renderEmotions(ts); renderCal(); renderRP(ts); renderTable(ts);
}
function niceTicks(mn, mx, n) { var span = mx - mn, step = Math.pow(10, Math.floor(Math.log10(span / n))), e = span / n / step; step *= e >= 5 ? 5 : e >= 2 ? 2 : 1; var out = []; for (var v = Math.ceil(mn / step) * step; v <= mx + 1e-9; v += step) out.push(Math.abs(v) < 1e-9 ? 0 : v); return out; }
function renderEquity(st) {
  var tot = $("eq-total"), tt = st.n ? seur(st.total) : "—"; if (!(tot._cnt && tot._cntTo === tt)) tot.textContent = tt; tot.className = "tx-hero " + cls(st.total); /* ne coupe pas le compteur s'il va déjà vers ce chiffre */
  $("eq-sub").textContent = st.n ? st.n + " trade" + (st.n > 1 ? "s" : "") + (st.cur != null ? " · capital " + eur(st.cur) : "") : "Aucun trade sur cette période";
  var box = $("eq-chart"); box.textContent = "";
  var W = Math.max(260, box.clientWidth || 600), H = W < 500 ? 190 : 240, pl = 2, pr = 56, pt = 14, pb = 26;
  var pts = [{ i: 0, cum: 0 }].concat(st.eq);
  var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, height: H, role: "img", "aria-label": st.n ? "Courbe des résultats cumulés : " + seur(st.total) + " sur " + st.n + " trade" + (st.n > 1 ? "s" : "") : "Courbe des résultats cumulés" }); box.appendChild(svg);
  if (pts.length < 2) { var tx = svgEl("text", { x: W / 2, y: H / 2, "text-anchor": "middle", class: "empty" }); tx.textContent = "La courbe apparaîtra après le premier trade"; svg.appendChild(tx); return; }
  var vals = pts.map(function (p) { return p.cum; }), mn = Math.min(0, Math.min.apply(null, vals)), mx = Math.max(0, Math.max.apply(null, vals));
  if (mx === mn) mx += 1; var padv = (mx - mn) * .08; mn -= padv; mx += padv;
  var n = pts.length - 1, x = function (i) { return pl + (W - pl - pr) * i / n; }, y = function (v) { return pt + (H - pt - pb) * (1 - (v - mn) / (mx - mn)); };
  var grid = svgEl("g", { class: "grid" }); svg.appendChild(grid);
  niceTicks(mn, mx, 4).forEach(function (v) {
    var ln = svgEl("line", { x1: pl, x2: W - pr, y1: y(v), y2: y(v) }); if (v === 0) ln.setAttribute("class", "zero"); grid.appendChild(ln);
    var t = svgEl("text", { x: W - pr + 10, y: y(v) + 4 }); t.textContent = seur(v).replace(" €", ""); svg.appendChild(t);
  });
  var line = pts.map(function (p, k) { return (k ? "L" : "M") + x(k).toFixed(1) + " " + y(p.cum).toFixed(1); }).join(" ");
  svg.appendChild(svgEl("path", { d: line + " L" + x(n).toFixed(1) + " " + y(mn).toFixed(1) + " L" + x(0) + " " + y(mn).toFixed(1) + " Z", class: "area" }));
  var lp = svgEl("path", { d: line, class: "line" }); if (!S.eqDrawn) { lp.setAttribute("pathLength", "1"); S.eqDrawn = true; } svg.appendChild(lp);
  svg.appendChild(svgEl("circle", { cx: x(n), cy: y(pts[n].cum), r: 9, class: "halo" }));
  svg.appendChild(svgEl("circle", { cx: x(n), cy: y(pts[n].cum), r: 4.5, class: "dot" }));
  (n > 1 ? [1, n] : [n]).forEach(function (k, j, arr) { var t = svgEl("text", { x: x(k), y: H - 6, "text-anchor": arr.length > 1 && !j ? "start" : "end" }); t.textContent = frDate(pts[k].t.date); svg.appendChild(t); });
  var hl = svgEl("line", { y1: pt, y2: H - pb, class: "cross", opacity: 0 }); svg.appendChild(hl);
  var hd = svgEl("circle", { r: 4.5, class: "dot", opacity: 0 }); svg.appendChild(hd);
  var tip = el("div", { class: "tx-tip is-float", "aria-hidden": "true" }); box.appendChild(tip);
  var ov = svgEl("rect", { x: pl, y: 0, width: W - pl - pr, height: H, fill: "transparent" }); svg.appendChild(ov);
  function move(ev) {
    var r = svg.getBoundingClientRect(), cx = (ev.clientX - r.left) * W / r.width;
    var k = Math.round((cx - pl) / (W - pl - pr) * n); k = Math.max(1, Math.min(n, k));
    var p = pts[k]; hl.setAttribute("x1", x(k)); hl.setAttribute("x2", x(k)); hl.setAttribute("opacity", 1);
    hd.setAttribute("cx", x(k)); hd.setAttribute("cy", y(p.cum)); hd.setAttribute("opacity", 1);
    tip.textContent = ""; tip.appendChild(el("div", { text: "Trade " + k + " · " + frDate(p.t.date) + " · " + p.t.market })); tip.appendChild(el("div", { class: "tx-num", text: "Trade " + seur(p.t.pnl) + " · Cumul " + seur(p.cum) }));
    var half = tip.offsetWidth / 2 + 4, px = Math.max(half, Math.min(r.width - half, x(k) * r.width / W));
    tip.style.left = px + "px"; tip.style.top = (y(p.cum) * r.height / H) + "px"; tip.classList.add("on");
  }
  ov.addEventListener("pointermove", move); ov.addEventListener("pointerdown", move);
  ov.addEventListener("pointerleave", function () { tip.classList.remove("on"); hl.setAttribute("opacity", 0); hd.setAttribute("opacity", 0); });
}
function ddState(dd) { var lvl = PALIERS.filter(function (p) { return dd >= p.p; }).pop(); return { lvl: lvl, k: !lvl ? "ok" : lvl.p < .2 ? "caution" : "stop" }; }
/* Drawdown du compte affiché. Les paliers de la charte ne s'appliquent qu'au compte réel. */
function renderDD(st) {
  var name = S.f.account, info = name === "all" ? null : accInfo(name), sas = !!info && info.type === "sas", has = st.cap != null;
  $("dd-title").textContent = sas ? "Palier de drawdown (charte)" : "Drawdown du compte";
  $("dd-note").textContent = !info ? "Choisissez un compte pour voir son capital et son drawdown." : !has ? "Indiquez le capital de départ de « " + name + " » dans les Réglages." :
    sas ? name + " · depuis le plus haut historique du capital" : name + " · depuis le plus haut du compte. Les paliers de la charte ne concernent que le compte réel.";
  var dd = has ? st.ddNow : 0, s = ddState(dd), pill = $("dd-pill"), g = $("gauge");
  $("dd-now").textContent = has && st.n ? "−" + pct(dd) : "—";
  pill.hidden = !(has && sas); g.hidden = !(has && sas);
  pill.className = "tx-badge " + { ok: "is-pos", caution: "is-warn", stop: "is-neg" }[s.k];
  pill.textContent = s.lvl ? "Palier −" + Math.round(s.lvl.p * 100) + " % · " + s.lvl.l : "Normal";
  g.className = "tx-gauge has-names is-" + s.k;
  $("gauge-fill").style.width = Math.min(100, dd / GAUGE_MAX * 100) + "%";
  g.querySelectorAll(".mark").forEach(function (m) { m.remove(); });
  PALIERS.forEach(function (p) { g.appendChild(el("div", { class: "mark", style: "left:" + (p.p / GAUGE_MAX * 100) + "%" }, [el("span", {}, ["−" + Math.round(p.p * 100) + " %", el("small", { text: p.l })])])); });
  $("dd-cap").textContent = has ? eur(st.cap) : "—"; $("dd-peak").textContent = has ? eur(st.peak) : "—"; $("dd-cur").textContent = has ? eur(st.cur) : "—";
  $("dd-moves").textContent = info && st.added ? seur(st.added) : "—"; $("dd-moves").className = cls(st.added || 0);
  $("btn-capital").hidden = !info;
  $("dd-max").textContent = has && st.n ? "−" + pct(st.maxdd) + " (" + eur(st.maxddE) + ")" : "—";
}
/* Section « Prop firms et comptes démo » : un résumé par compte, toujours sur tout l'historique */
function renderOthers() {
  var box = $("others"), names = accList().filter(function (n) { return accInfo(n).type !== "sas"; }); box.textContent = "";
  $("others-sec").hidden = !names.length;
  names.forEach(function (name) {
    var capBtn = el("button", { class: "tx-btn is-ghost", type: "button", "aria-label": "Ajouter ou retirer du capital sur " + name, title: "Ajouter ou retirer du capital" }, [icon("i-plus"), "Capital"]);
    var info = accInfo(name), cap = accCap(name), ts = source().filter(function (t) { return t.account === name; }).sort(byDT), st = stats(ts, cap, accMoves(name)), cur = S.f.account === name;
    var card = el("article", { class: "tx-panel tx-account pg-acc" + (cur ? " is-current" : "") }, [
      el("div", { class: "tx-account-head" }, [
        el("div", { class: "tx-account-id" }, [el("span", { class: "tx-avatar", "aria-hidden": "true", text: initials(name) }),
          el("div", { class: "pg-acc-name" }, [el("h3", { class: "tx-title", text: name }), el("div", { class: "tx-sub", text: ACC_TYPES[info.type] })])]),
        el("span", { class: "tx-badge is-plain", text: info.type === "demo" ? "Démo" : "Prop firm" })]),
      el("dl", { class: "tx-kv" }, [
        el("dt", { text: "Capital de départ" }), el("dd", { text: cap ? eur(cap) : "À renseigner" }),
        st.added ? el("dt", { text: "Ajouts et retraits" }) : null, st.added ? el("dd", { class: cls(st.added), text: seur(st.added) }) : null,
        el("dt", { text: "Résultat" }), el("dd", { class: cls(st.total), text: st.n ? seur(st.total) : "—" }),
        el("dt", { text: "Capital actuel" }), el("dd", { text: st.cur != null ? eur(st.cur) : "—" }),
        el("dt", { text: "Drawdown actuel" }), el("dd", { text: st.ddNow != null && st.n ? "−" + pct(st.ddNow) : "—" })]),
      el("div", { class: "tx-account-foot" }, [el("span", { class: "tx-dim", text: st.n + " trade" + (st.n > 1 ? "s" : "") }),
        el("span", { class: "pg-acc-actions" }, [capBtn,
          el("button", { class: "tx-btn is-ghost", type: "button", "aria-label": "Afficher le détail de " + name, text: cur ? "Affiché" : "Voir le détail" })])])]);
    capBtn.addEventListener("click", function (e) { e.stopPropagation(); openCapital(name); });
    card.addEventListener("click", function () { S.f.account = name; S.shown = 30; renderJournal(); if (M.lenis) M.lenis.scrollTo(0); else window.scrollTo({ top: 0, behavior: "smooth" }); });
    box.appendChild(card);
  });
}
function kpi(box, label, val, c, hint) { box.appendChild(el("div", { class: "tx-stat" }, [el("div", { class: "tx-label", text: label }), el("div", { class: "v " + (c || ""), text: val }), el("div", { class: "h", text: hint || "" })])); }
function renderKPIs(st) {
  var k = $("kpis"); k.textContent = "";
  kpi(k, "Trades", String(st.n), "", st.n ? st.w + " gagnants · " + st.l + " perdants" : "—");
  kpi(k, "Taux de réussite", st.wr == null ? "—" : pct(st.wr), "", st.avgW ? "Gain moyen " + eur(st.avgW) : "—");
  kpi(k, "Profit factor", st.pf == null ? "—" : st.pf === Infinity ? "∞" : nf2.format(st.pf), st.pf == null ? "" : st.pf >= 1 ? "tx-pos" : "tx-neg", st.avgL ? "Perte moyenne " + eur(st.avgL) : "—");
  kpi(k, "Espérance / trade", st.exp == null ? "—" : seur(st.exp), cls(st.exp || 0), "Résultat moyen par trade");
  kpi(k, "R moyen", st.avgR == null ? "—" : rfmt(st.avgR), cls(st.avgR || 0), st.rs.length ? st.rs.length + " trades avec risque renseigné" : "Renseignez le risque");
  kpi(k, "Drawdown max", st.n && st.maxdd != null ? "−" + pct(st.maxdd) : "—", st.maxdd >= .2 ? "tx-neg" : "", st.maxdd == null ? "Choisissez un compte avec capital" : st.n ? eur(st.maxddE) + " depuis un sommet" : "—");
}
function renderGroups(box, ts, key, order, subFn, labelFn) {
  box.textContent = ""; var g = {};
  ts.forEach(function (t) { var k = key(t) || "—"; g[k] = g[k] || { n: 0, w: 0, p: 0 }; g[k].n++; g[k].p += Number(t.pnl) || 0; if (t.pnl > 0) g[k].w++; });
  var keys = order.filter(function (k) { return g[k]; }).concat(Object.keys(g).filter(function (k) { return order.indexOf(k) < 0; }));
  if (!keys.length) { box.appendChild(el("div", { class: "tx-empty is-compact", text: "Pas de données" })); return; }
  var mx = Math.max.apply(null, keys.map(function (k) { return Math.abs(g[k].p); })) || 1;
  keys.forEach(function (k) {
    var v = g[k], w = Math.abs(v.p) / mx * 50, sub = subFn(k);
    box.appendChild(el("div", { class: "tx-bar" }, [el("span", { class: "lab" }, [el("b", { text: labelFn ? labelFn(k) : k }), sub ? el("small", { text: sub }) : null]),
      el("span", { class: "tx-num " + cls(v.p), text: seur(v.p) }), el("div", { class: "track" }, [el("i", { class: v.p >= 0 ? "is-pos" : "is-neg", style: "width:" + w + "%" })]),
      el("div", { class: "meta tx-num", text: v.n + " trade" + (v.n > 1 ? "s" : "") + " · réussite " + pct(v.w / v.n, 0) })]));
  });
}
function renderHist(rs) {
  var box = $("r-hist"); box.textContent = "";
  var bins = [{ l: "≤ −2", a: -1e9, b: -2 }, { l: "−2 à −1", a: -2, b: -1 }, { l: "−1 à 0", a: -1, b: 0 }, { l: "0 à 1", a: 0, b: 1 }, { l: "1 à 2", a: 1, b: 2 }, { l: "2 à 3", a: 2, b: 3 }, { l: "> 3", a: 3, b: 1e9 }];
  bins.forEach(function (b) { b.n = rs.filter(function (r) { return b.a === -1e9 ? r <= b.b : b.b === 1e9 ? r > b.a : (r > b.a && r <= b.b); }).length; });
  var W = Math.max(240, box.clientWidth || 300), H = 200, pb = 42, pt = 20, slot = W / bins.length, bw = Math.min(28, slot - 8);
  var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, height: H, role: "img", "aria-label": "Distribution des résultats en R" + (rs.length ? " : " + bins.filter(function (b) { return b.n; }).map(function (b) { return b.l + " R, " + b.n + " trade" + (b.n > 1 ? "s" : ""); }).join(" ; ") : "") }); box.appendChild(svg);
  if (!rs.length) { var tx = svgEl("text", { x: W / 2, y: H / 2, "text-anchor": "middle", class: "empty" }); tx.textContent = "Renseignez le risque pour voir les R"; svg.appendChild(tx); return; }
  var mx = Math.max.apply(null, bins.map(function (b) { return b.n; })) || 1, y0 = H - pb;
  svg.appendChild(svgEl("line", { x1: 0, x2: W, y1: y0, y2: y0, class: "base" }));
  bins.forEach(function (b, i) {
    var cx = slot * i + slot / 2, x0 = cx - bw / 2;
    if (b.n) {
      var hh = Math.max(3, (y0 - pt) * b.n / mx), r = Math.min(4, hh, bw / 2), top = y0 - hh;
      var bar = svgEl("path", { d: "M" + x0 + " " + y0 + "V" + (top + r) + "Q" + x0 + " " + top + " " + (x0 + r) + " " + top + "H" + (x0 + bw - r) + "Q" + (x0 + bw) + " " + top + " " + (x0 + bw) + " " + (top + r) + "V" + y0 + "Z", class: "bar " + (b.b <= 0 && b.a < 0 ? "is-neg" : "is-pos") });
      var ti = svgEl("title", {}); ti.textContent = b.l + " R : " + b.n + " trade" + (b.n > 1 ? "s" : ""); bar.appendChild(ti); svg.appendChild(bar);
      var t = svgEl("text", { x: cx, y: top - 6, "text-anchor": "middle", class: "val" }); t.textContent = b.n; svg.appendChild(t);
    }
    var lb = svgEl("text", { x: cx, y: y0 + 17, "text-anchor": "middle", class: "cat" }); lb.textContent = b.l; svg.appendChild(lb);
  });
  var u = svgEl("text", { x: W / 2, y: H - 4, "text-anchor": "middle", class: "cat" }); u.textContent = "multiple du risque (R)"; svg.appendChild(u);
}
function renderPlan(ts) {
  var yes = ts.filter(function (t) { return t.plan !== false; }), no = ts.filter(function (t) { return t.plan === false; });
  var sum = function (a) { return a.reduce(function (s, t) { return s + (Number(t.pnl) || 0); }, 0); };
  var p = ts.length ? yes.length / ts.length : null;
  $("plan-pct").textContent = p == null ? "—" : pct(p, 0);
  $("plan-yes").textContent = yes.length ? seur(sum(yes)) : "—"; $("plan-yes").className = "v " + cls(sum(yes));
  $("plan-no").textContent = no.length ? seur(sum(no)) : "—"; $("plan-no").className = "v " + cls(sum(no));
  $("plan-yes-n").textContent = yes.length + " trade" + (yes.length > 1 ? "s" : ""); $("plan-no-n").textContent = no.length + " trade" + (no.length > 1 ? "s" : "");
  var svg = $("plan-ring"); svg.textContent = ""; var R = 30, C = 2 * Math.PI * R;
  svg.appendChild(svgEl("circle", { cx: 37, cy: 37, r: R, fill: "none", class: "pg-ring-track", "stroke-width": 7 }));
  if (p != null) svg.appendChild(svgEl("circle", { cx: 37, cy: 37, r: R, fill: "none", class: "pg-ring-val " + (p >= .8 ? "is-good" : "is-warn"), "stroke-width": 7, "stroke-linecap": "round", "stroke-dasharray": (C * p).toFixed(1) + " " + C.toFixed(1), transform: "rotate(-90 37 37)" }));
}
function renderEmotions(ts) {
  var box = $("emotions"); box.textContent = ""; var g = {};
  ts.forEach(function (t) { var k = t.emotion || "Non renseigné"; g[k] = g[k] || { n: 0, p: 0 }; g[k].n++; g[k].p += Number(t.pnl) || 0; });
  var keys = Object.keys(g).sort(function (a, b) { return g[b].n - g[a].n; });
  if (!keys.length) { box.appendChild(el("div", { class: "tx-empty is-compact", text: "Pas de données" })); return; }
  keys.forEach(function (k) { box.appendChild(el("div", { class: "it" }, [el("span", { text: k }), el("span", { class: "tx-num tx-dim", text: g[k].n + " trade" + (g[k].n > 1 ? "s" : "") }), el("span", { class: "tx-num " + cls(g[k].p), text: seur(g[k].p) })])); });
}
function calSource() { return source().filter(function (t) { if (S.f.account !== "all" && t.account !== S.f.account) return false; if (S.f.market !== "all" && t.market !== S.f.market) return false; return true; }); }
function renderCal() {
  var ts = calSource();
  if (S.calY == null) { var last = ts.map(function (t) { return t.date; }).sort().pop(); var d = last ? new Date(last + "T12:00:00") : new Date(); S.calY = d.getFullYear(); S.calM = d.getMonth(); }
  var y = S.calY, m = S.calM, pre = y + "-" + String(m + 1).padStart(2, "0") + "-";
  $("cal-month").textContent = MOIS[m] + " " + y;
  var days = {}; ts.forEach(function (t) { if (t.date && t.date.indexOf(pre) === 0) { var k = Number(t.date.slice(8, 10)); days[k] = days[k] || { p: 0, n: 0 }; days[k].p += Number(t.pnl) || 0; days[k].n++; } });
  var mx = Math.max.apply(null, Object.keys(days).map(function (k) { return Math.abs(days[k].p); }).concat([1]));
  var tot = 0, nT = 0, gd = 0, bd = 0; Object.keys(days).forEach(function (k) { tot += days[k].p; nT += days[k].n; if (days[k].p > 0) gd++; else if (days[k].p < 0) bd++; });
  $("cal-sub").textContent = nT ? seur(tot) + " sur le mois · " + gd + " jour" + (gd > 1 ? "s" : "") + " gagnant" + (gd > 1 ? "s" : "") + " · " + bd + " perdant" + (bd > 1 ? "s" : "") : "Aucun trade ce mois-ci";
  var box = $("cal"); box.textContent = "";
  ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].forEach(function (h) { box.appendChild(el("div", { class: "dh", text: h })); });
  box.appendChild(el("div", { class: "dh is-week", "data-short": "Sem.", text: "Semaine" }));
  var first = new Date(y, m, 1), lead = (first.getDay() + 6) % 7, nd = new Date(y, m + 1, 0).getDate(), today = todayISO();
  var cells = Math.ceil((lead + nd) / 7) * 7, wk = { p: 0, n: 0, has: false };
  for (var i = 0; i < cells; i++) {
    var dn = i - lead + 1, col = i % 7;
    if (dn < 1 || dn > nd) box.appendChild(el("div", { class: "tx-day is-off", "aria-hidden": "true" }));
    else {
      var info = days[dn], iso = pre + String(dn).padStart(2, "0"), st = null;
      if (info && info.p !== 0) st = "background:color-mix(in srgb,var(--c-" + (info.p > 0 ? "pos" : "neg") + ") " + Math.round(8 + 30 * Math.abs(info.p) / mx) + "%,var(--c-panel-2))";
      var cell = el("div", { class: "tx-day" + (col >= 5 ? " is-we" : "") + (info ? " is-click" + (info.p > 0 ? " is-pos" : info.p < 0 ? " is-neg" : "") : "") + (iso === today ? " is-today" : ""), style: st, title: info ? frDate(iso) + " : " + seur(info.p) : null },
        [el("span", { class: "n", text: String(dn) }), info ? el("b", { text: kfmt(info.p) }) : null, info ? el("span", { class: "c", text: info.n + " trade" + (info.n > 1 ? "s" : "") }) : null]);
      if (info) { (function (iso, info) { cell.tabIndex = 0; cell.setAttribute("role", "button"); cell.setAttribute("aria-label", frDate(iso) + " : " + seur(info.p) + ", " + info.n + " trade" + (info.n > 1 ? "s" : ""));
        var go = function () { S.q = iso; $("search").value = iso; renderTable(filtered()); $("log").scrollIntoView({ behavior: "smooth", block: "start" }); }; cell.addEventListener("click", go); cell.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); }); })(iso, info); wk.p += info.p; wk.n += info.n; wk.has = true; }
      box.appendChild(cell);
    }
    if (col === 6) { box.appendChild(wk.has ? el("div", { class: "tx-week" }, [el("b", { class: cls(wk.p), text: kfmt(wk.p) }), el("span", { text: wk.n + " trade" + (wk.n > 1 ? "s" : "") })]) : el("div", { class: "tx-week" }, [el("span", { text: "—" })])); wk = { p: 0, n: 0, has: false }; }
  }
}
function renderRP(ts) {
  var rs = ts.filter(function (t) { return t.risk > 0; }), loss = [], early = [], hit = [], over = 0, left = 0;
  rs.forEach(function (t) { var r = rOf(t), pl = rPlanOf(t); if (r <= 0) loss.push(t); else if (r < pl - .05) { early.push(t); left += (pl - r) * t.risk; } else { hit.push(t); if (r > pl + .05) over++; } });
  var wins = early.concat(hit), avgW = wins.length ? wins.reduce(function (a, t) { return a + rOf(t); }, 0) / wins.length : null;
  var avgP = wins.length ? wins.reduce(function (a, t) { return a + rPlanOf(t); }, 0) / wins.length : S.set.rPlanDefault;
  $("rp-sub").textContent = rs.length ? rs.length + " trades avec risque renseigné · objectif par défaut " + String(S.set.rPlanDefault).replace(".", ",") + " R" : "Renseignez le risque des trades pour activer cette analyse";
  $("rp-real").textContent = avgW == null ? "—" : rfmt(avgW); $("rp-real").className = "tx-hero " + (avgW != null && avgW >= avgP - .05 ? "tx-pos" : "");
  $("rp-vs").textContent = avgW == null ? "" : "réalisé, pour " + String(Math.round(avgP * 100) / 100).replace(".", ",") + " R prévus";
  var n = rs.length || 1, parts = [{ k: "Objectif atteint", v: hit.length, c: "pos" }, { k: "Gagnant coupé avant l'objectif", v: early.length, c: "warn" }, { k: "Perte", v: loss.length, c: "neg" }];
  var stk = $("rp-stack"); stk.textContent = ""; var lg = $("rp-legend"); lg.textContent = "";
  parts.forEach(function (p) { if (p.v) stk.appendChild(el("i", { style: "flex:" + p.v + " 1 0;background:var(--c-" + p.c + ")" }));
    lg.appendChild(el("div", { class: "lg" }, [el("span", { class: "sw", style: "background:var(--c-" + p.c + ")" }), el("span", { text: p.k }), el("span", { class: "tx-num tx-dim", text: rs.length ? p.v + " · " + pct(p.v / n, 0) : "—" })])); });
  $("rp-left").textContent = rs.length ? eur(left) : "—"; $("rp-over").textContent = rs.length ? String(over) : "—";
}
function renderTable(ts) {
  var tb = $("tbody"); tb.textContent = ""; var q = S.q.trim().toLowerCase();
  var rows = ts.slice().reverse().filter(function (t) { return !q || [t.market, t.account, t.side, winLabel(t.window), t.emotion, t.note, t.date].join(" ").toLowerCase().indexOf(q) >= 0; });
  $("log-count").textContent = rows.length + " trade" + (rows.length > 1 ? "s" : "") + (S.useSample ? " d'exemple" : "");
  if (!rows.length) { tb.appendChild(el("tr", {}, [el("td", { colspan: 11, class: "c-empty" }, [el("div", { class: "tx-empty is-compact", text: S.loaded ? "Aucun trade ne correspond." : "Chargement du journal…" })])])); $("more").hidden = true; return; }
  var visible = rows.slice(0, S.shown);
  signShots(visible.map(function (t) { return t.shot; }).filter(Boolean));
  visible.forEach(function (t) {
    var r = rOf(t), shot = el("td", { class: "c-shot" });
    if (t.shot) { var im = el("img", { class: "thumb", alt: "Capture", "data-path": t.shot }); if (S.signed[t.shot]) im.src = S.signed[t.shot]; shot.appendChild(im); }
    var tr = el("tr", { tabindex: 0 }, [
      el("td", { class: "c-date tx-num", text: frDate(t.date) }), el("td", { class: "c-time tx-num tx-dim", text: t.time || "" }),
      el("td", { class: "c-mk" }, [el("b", { text: t.market || "—" })]), el("td", { class: "c-acc tx-dim", text: t.account || "" }),
      el("td", { class: "c-side" }, [el("span", { class: "tx-badge is-plain", text: t.side || "—" })]), el("td", { class: "c-win", text: winLabel(t.window) }),
      el("td", { class: "c-risk r tx-num tx-dim", text: t.risk > 0 ? eur(t.risk) : "—" }),
      el("td", { class: "c-r r tx-num " + cls(r || 0) }, [rfmt(r), r != null ? el("span", { class: "pg-rsub", text: "/ " + String(rPlanOf(t)).replace(".", ",") }) : null]),
      el("td", { class: "c-pnl r tx-num " + cls(t.pnl), text: seur(t.pnl) }),
      el("td", { class: "c-plan" }, [el("span", { class: "tx-badge" + (t.plan === false ? " is-warn" : ""), text: t.plan === false ? "Non respecté" : "Respecté" })]), shot]);
    tr.addEventListener("click", function (ev) { if (ev.target.classList.contains("thumb")) { openShot(t); return; } openTrade(t); });
    tr.addEventListener("keydown", function (ev) { if (ev.key === "Enter") openTrade(t); });
    tb.appendChild(tr);
  });
  $("more").hidden = rows.length <= S.shown;
}
/* ---------------- captures (stockage privé, liens signés) ---------------- */
function signShots(paths) {
  var need = paths.filter(function (p) { return !S.signed[p]; }); if (!need.length || !S.sb) return;
  S.sb.storage.from("captures").createSignedUrls(need, 3600).then(function (res) {
    (res.data || []).forEach(function (d) { if (d.signedUrl) S.signed[d.path] = d.signedUrl; });
    document.querySelectorAll("img.thumb[data-path]").forEach(function (im) { var u = S.signed[im.getAttribute("data-path")]; if (u && !im.src) im.src = u; });
  });
}
function openShot(t) { var u = S.signed[t.shot]; if (!u) return; $("shot-big").src = u; $("shot-cap").textContent = frDate(t.date) + " · " + t.market + " · " + seur(t.pnl); show("ov-shot", true); }
$("shot-close").addEventListener("click", function () { show("ov-shot", false); });
$("ov-shot").addEventListener("click", function (e) { if (e.target === this) show("ov-shot", false); });

/* ---------------- filtres ---------------- */
function fillSelect(sel, opts, all) { sel.textContent = ""; if (all) sel.appendChild(el("option", { value: "all", text: all })); opts.forEach(function (o) { var v = typeof o === "string" ? o : o.v; sel.appendChild(el("option", { value: v, text: typeof o === "string" ? o : o.l })); }); }
function ensureOpt(sel, v) { if (!v) return; for (var i = 0; i < sel.options.length; i++) if (sel.options[i].value === v) return; sel.appendChild(el("option", { value: v, text: v })); }
function withUsed(base, key) { var out = base.slice(); source().forEach(function (t) { if (t[key] && out.indexOf(t[key]) < 0) out.push(t[key]); }); return out; }
function refreshSelects() {
  var fm = withUsed(S.set.markets, "market"), fa = accList(), sig = JSON.stringify([fm, fa, S.set.accountsInfo || null]);
  if (sig !== S.selSig) { S.selSig = sig;
    fillSelect($("f-account"), fa.map(function (n) { return { v: n, l: n + " · " + ACC_SHORT[accInfo(n).type] }; }), "Tous les comptes"); fillSelect($("f-market"), fm, "Tous les marchés"); }
  if (S.f.account !== "all" && fa.indexOf(S.f.account) < 0) S.f.account = sasNames()[0] || "all"; if (fm.indexOf(S.f.market) < 0) S.f.market = "all";
  $("f-account").value = S.f.account; $("f-market").value = S.f.market;
}
/* liste des sessions de la fenêtre de saisie : remplie à l'ouverture, avec les heures de Paris du jour du trade */
fillSelect($("t-emotion"), EMOTIONS);
fillSelect($("p-status"), PROP_STATUS);
$("f-period").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; S.f.period = b.dataset.v; this.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); S.shown = 30; renderJournal(); });
$("f-account").addEventListener("change", function () { S.f.account = this.value; S.shown = 30; renderJournal(); });
$("f-market").addEventListener("change", function () { S.f.market = this.value; S.shown = 30; renderJournal(); });
$("search").addEventListener("input", function () { S.q = this.value; renderTable(filtered()); });
$("btn-more").addEventListener("click", function () { S.shown += 30; renderTable(filtered()); });
$("cal-prev").addEventListener("click", function () { S.calM--; if (S.calM < 0) { S.calM = 11; S.calY--; } renderCal(); });
$("cal-next").addEventListener("click", function () { S.calM++; if (S.calM > 11) { S.calM = 0; S.calY++; } renderCal(); });

/* ---------------- saisie d'un trade ---------------- */
function openTrade(t) {
  if (t && t.sample) { toast("Trade d'exemple : ajoutez vos propres trades."); return; }
  S.editing = t || null; S.shotFile = null; S.shotPath = t && t.shot || null;
  $("trade-title").textContent = t ? "Modifier le trade" : "Nouveau trade";
  fillSelect($("t-market"), S.set.markets); fillSelect($("t-account"), S.set.accounts); ensureOpt($("t-market"), t && t.market); ensureOpt($("t-account"), t && t.account);
  $("t-date").value = t ? t.date : todayISO(); $("t-time").value = t && t.time || "";
  $("t-market").value = t && t.market || S.set.markets[0] || ""; $("t-account").value = t && t.account || S.set.accounts[0] || "";
  (t && t.side === "Short" ? $("t-side-short") : $("t-side-long")).checked = true;
  fillWindows(); $("t-window").value = t && t.window || sessionOf($("t-date").value, $("t-time").value) || "NYAM"; S.winAuto = !t; autoWindow(); $("t-emotion").value = t && t.emotion || "Calme";
  ["entry", "stop", "exit", "size", "risk", "pnl"].forEach(function (k) { $("t-" + k).value = t && t[k] != null ? t[k] : ""; });
  $("t-rplan").value = t && Number(t.rPlan) > 0 ? t.rPlan : S.set.rPlanDefault;
  $("t-plan").checked = !t || t.plan !== false; $("t-note").value = t && t.note || "";
  $("t-shot").value = ""; var pv = $("t-shot-prev"); if (S.shotPath && S.signed[S.shotPath]) { pv.src = S.signed[S.shotPath]; pv.hidden = false; } else { pv.hidden = true; pv.removeAttribute("src"); }
  $("t-del").hidden = !t; $("t-del-confirm").hidden = true; $("t-err").hidden = true; updR();
  show("ov-trade", true); setTimeout(function () { $("t-pnl").focus(); }, 30);
}
function closeTrade() { show("ov-trade", false); S.editing = null; }
function updR() { var r = num($("t-risk").value), p = num($("t-pnl").value), pl = num($("t-rplan").value); $("t-r").textContent = r > 0 && p != null ? "= " + rfmt(p / r) + (pl > 0 ? " sur " + String(pl).replace(".", ",") + " R prévus" : "") : ""; $("t-r").className = "tx-num pg-rprev " + cls(p || 0); }
["t-risk", "t-pnl", "t-rplan"].forEach(function (id) { $(id).addEventListener("input", updR); });
/* la session suit l'heure saisie, sauf si elle a été choisie à la main */
function fillWindows() { var v = $("t-window").value; fillSelect($("t-window"), SESSIONS.map(function (w) { var h = sessionHours(w, $("t-date").value || todayISO()); return { v: w.id, l: w.label + (h ? " · " + h : "") }; })); if (v) $("t-window").value = v; }
function autoWindow() { fillWindows(); var s = sessionOf($("t-date").value, $("t-time").value); if (s && S.winAuto) $("t-window").value = s; $("t-window-h").textContent = s ? (S.winAuto ? "Calculée avec l'heure du trade." : "Choisie à la main.") : "Indiquez l'heure : la session se calcule seule."; }
["t-time", "t-date"].forEach(function (id) { $(id).addEventListener("input", autoWindow); $(id).addEventListener("change", autoWindow); });
$("t-window").addEventListener("change", function () { S.winAuto = false; autoWindow(); });
$("t-shot").addEventListener("change", function () { var f = this.files && this.files[0]; S.shotFile = f || null; var pv = $("t-shot-prev"); if (f) { pv.src = URL.createObjectURL(f); pv.hidden = false; } });
$("t-cancel").addEventListener("click", closeTrade);
$("ov-trade").addEventListener("click", function (e) { if (e.target === this) closeTrade(); });
$("t-del").addEventListener("click", function () { $("t-del-confirm").hidden = false; this.hidden = true; });
$("t-del-yes").addEventListener("click", function () {
  var t = S.editing; if (!t) return; var b = this; b.disabled = true;
  S.sb.from("trades").delete().eq("id", t.id).then(function (res) {
    b.disabled = false; if (res.error) { $("t-err").textContent = "Suppression impossible."; $("t-err").hidden = false; return; }
    if (t.shot) S.sb.storage.from("captures").remove([t.shot]);
    closeTrade(); toast("Trade supprimé"); reload("trades");
  });
});
$("trade-form").addEventListener("submit", function (e) {
  e.preventDefault();
  var date = $("t-date").value, pnl = num($("t-pnl").value);
  if (!date || pnl == null) { $("t-err").textContent = "La date et le résultat sont obligatoires."; $("t-err").hidden = false; return; }
  var t = { date: date, time: $("t-time").value || "", market: $("t-market").value, account: $("t-account").value,
    side: document.querySelector('input[name="t-side"]:checked').value, window: $("t-window").value, emotion: $("t-emotion").value,
    entry: num($("t-entry").value), stop: num($("t-stop").value), exit: num($("t-exit").value), size: num($("t-size").value),
    risk: num($("t-risk").value), rPlan: num($("t-rplan").value) > 0 ? num($("t-rplan").value) : S.set.rPlanDefault,
    pnl: pnl, plan: $("t-plan").checked, note: $("t-note").value.trim(), shot: S.shotPath || null };
  var btn = $("t-save"); btn.disabled = true; btn.textContent = "Enregistrement…";
  var up = Promise.resolve();
  if (S.shotFile) {
    var ext = (S.shotFile.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
    var path = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())) + "." + ext;
    up = S.sb.storage.from("captures").upload(path, S.shotFile, { contentType: S.shotFile.type || "image/png" }).then(function (res) {
      if (res.error) toast("La capture n'a pas pu être envoyée ; le trade est enregistré sans elle."); else t.shot = path;
    });
  }
  up.then(function () {
    var row = toRow(t);
    if (S.editing) { row.updated_at = new Date().toISOString(); return S.sb.from("trades").update(row).eq("id", S.editing.id); }
    return S.sb.from("trades").insert(row);
  }).then(function (res) {
    if (res && res.error) throw res.error;
    closeTrade(); toast("Trade enregistré"); reload("trades");
  }).catch(function () { $("t-err").textContent = "Enregistrement impossible. Vérifiez votre connexion et réessayez."; $("t-err").hidden = false; })
    .finally(function () { btn.disabled = false; btn.textContent = "Enregistrer"; });
});
$("btn-add").addEventListener("click", function () { openTrade(null); });

/* ---------------- import / export CSV ---------------- */
function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9&]/g, ""); }
var HEAD = { date: ["date", "jour"], time: ["heure", "time", "hour"], market: ["marche", "market", "actif", "instrument", "symbole", "symbol"], account: ["compte", "account"],
  side: ["sens", "direction", "side", "type"], window: ["fenetre", "session", "killzone", "window"], entry: ["entree", "entry"], stop: ["stop", "sl", "stoploss"],
  exit: ["sortie", "exit"], size: ["taille", "size", "lots", "lot", "contrats", "volume"], risk: ["risque", "risk"], rPlan: ["rprevu", "rplan", "rcible", "objectifr", "rr"],
  pnl: ["resultat", "pnl", "p&l", "gain", "profit", "net"], plan: ["plan", "planrespecte"], emotion: ["emotion", "etatdesprit", "mood"], note: ["note", "notes", "commentaire", "comment"] };
function splitLine(line, sep) { var out = [], cur = "", q = false; for (var i = 0; i < line.length; i++) { var c = line[i]; if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; } else if (c === '"') q = true; else if (c === sep) { out.push(cur); cur = ""; } else cur += c; } out.push(cur); return out; }
function pnum(v) { if (v == null) return null; var s = String(v).replace(/[€$\s  ]/g, "").replace(/−/g, "-"); if (s === "") return null; if (s.indexOf(",") >= 0 && s.indexOf(".") >= 0) s = s.replace(/\./g, "").replace(",", "."); else s = s.replace(",", "."); var n = Number(s); return isFinite(n) ? n : null; }
function pdate(v) { v = String(v || "").trim(); var m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return m[1] + "-" + m[2].padStart(2, "0") + "-" + m[3].padStart(2, "0"); m = v.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/); if (m) { var y = m[3].length === 2 ? "20" + m[3] : m[3]; return y + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0"); } return null; }
function pmarket(v) { var s = norm(v); if (!s) return ""; var hit = S.set.markets.find(function (m) { return norm(m) === s; }); if (hit) return hit; if (/xau|gold|^or$/.test(s)) return "XAUUSD"; if (/dax|ger|de40/.test(s)) return "DAX"; if (/nas|^nq|mnq|us100|ustec|ndx/.test(s)) return "Nasdaq"; return String(v).trim(); }
function pside(v) { return /short|vente|sell|^s$/.test(norm(v)) ? "Short" : "Long"; }
function pwin(v) { var s = norm(v); if (!s) return "Out"; if (/london|londres|lon/.test(s)) return "London"; if (/nypm|pm|14|20h/.test(s)) return "NYPM"; if (/nyam|am|ny|10|16h/.test(s)) return "NYAM"; return "Out"; }
function pacc(v) { var s = norm(v); if (!s) return S.set.accounts[0]; var hit = S.set.accounts.find(function (a) { return norm(a) === s; }); if (hit) return hit; if (/challenge|eval/.test(s)) return "Challenge prop firm"; if (/financ|funded|prop/.test(s)) return "Prop firm financé"; return String(v).trim(); }
function pplan(v) { var s = norm(v); return !s || !/^(non|no|0|false|faux|n)$/.test(s); }
function parseCSV(text) {
  text = text.replace(/^﻿/, ""); var lines = text.split(/\r?\n/).filter(function (l) { return l.trim() !== ""; });
  if (lines.length < 2) return { rows: [], skipped: 0, err: "Le fichier ne contient pas de lignes de trades." };
  var h = lines[0], sep = h.split(";").length > h.split(",").length ? ";" : (h.split("\t").length > h.split(",").length ? "\t" : ",");
  var heads = splitLine(h, sep).map(norm), idx = {};
  Object.keys(HEAD).forEach(function (k) { var i = heads.findIndex(function (x) { return HEAD[k].indexOf(x) >= 0; }); if (i >= 0) idx[k] = i; });
  if (idx.date == null || idx.pnl == null) return { rows: [], skipped: 0, err: "Colonnes « date » et « resultat » introuvables dans la première ligne." };
  var rows = [], skipped = 0;
  lines.slice(1).forEach(function (l) {
    var c = splitLine(l, sep), g = function (k) { return idx[k] != null ? c[idx[k]] : ""; };
    var d = pdate(g("date")), p = pnum(g("pnl")); if (!d || p == null) { skipped++; return; }
    var tm = String(g("time") || "").trim().match(/^(\d{1,2})[:h](\d{2})/), wv = String(g("window") || "");
    var wid = SESSIONS.concat(WINDOWS).find(function (w) { return norm(w.label) === norm(wv); });
    rows.push({ date: d, time: tm ? tm[1].padStart(2, "0") + ":" + tm[2] : "", market: pmarket(g("market")) || S.set.markets[0], account: pacc(g("account")), side: pside(g("side")),
      window: wid ? wid.id : pwin(wv), entry: pnum(g("entry")), stop: pnum(g("stop")), exit: pnum(g("exit")), size: pnum(g("size")), risk: pnum(g("risk")),
      rPlan: pnum(g("rPlan")) > 0 ? pnum(g("rPlan")) : S.set.rPlanDefault, pnl: p, plan: pplan(g("plan")), emotion: String(g("emotion") || "").trim() || null, note: String(g("note") || "").trim(), shot: null });
  });
  return { rows: rows, skipped: skipped };
}
$("btn-import").addEventListener("click", function () { $("imp-file").value = ""; $("imp-res").textContent = ""; $("imp-go").disabled = true; S.importRows = null; show("ov-import", true); });
$("imp-cancel").addEventListener("click", function () { show("ov-import", false); });
$("ov-import").addEventListener("click", function (e) { if (e.target === this) show("ov-import", false); });
$("imp-file").addEventListener("change", function () {
  var f = this.files && this.files[0]; if (!f) return; var rd = new FileReader();
  rd.onload = function () { var res = parseCSV(String(rd.result || "")); S.importRows = res.rows;
    $("imp-res").textContent = res.err ? res.err : res.rows.length + " trade(s) reconnu(s)" + (res.skipped ? " · " + res.skipped + " ligne(s) ignorée(s) (date ou résultat illisible)" : "") + ".";
    $("imp-go").disabled = !res.rows.length; };
  rd.readAsText(f);
});
$("imp-go").addEventListener("click", function () {
  var rows = (S.importRows || []).map(function (t) { var r = toRow(t); r.importe = true; return r; }); if (!rows.length) return;
  var b = this; b.disabled = true; var done = 0;
  (function next() {
    if (done >= rows.length) { show("ov-import", false); toast(done + " trades importés"); reload("trades"); return; }
    var chunk = rows.slice(done, done + 200);
    S.sb.from("trades").insert(chunk).then(function (res) {
      if (res.error) { $("imp-res").textContent = "Import arrêté après " + done + " trades."; b.disabled = false; return; }
      done += chunk.length; $("imp-res").textContent = "Import en cours : " + done + " / " + rows.length; next();
    });
  })();
});
function csvCell(v) { v = v == null ? "" : String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
var CSV_HEAD = "date;heure;marche;compte;sens;fenetre;entree;stop;sortie;taille;risque;r_prevu;resultat;R;plan;emotion;note";
$("imp-template").addEventListener("click", function () { download("modele-journal.csv", CSV_HEAD + "\n10/11/2026;16:12;XAUUSD;Compte VT Markets perso;Long;NY AM;2650,5;2646,0;2659,5;1;150;2;300;;oui;Calme;Exemple à remplacer\n"); });
$("btn-export").addEventListener("click", function () {
  var ts = S.trades.slice().sort(function (a, b) { return (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")); });
  if (!ts.length) { toast("Aucun trade enregistré à exporter."); return; }
  var fr = function (v) { return v == null ? "" : String(v).replace(".", ","); };
  download("tradamax-journal-" + todayISO() + ".csv", CSV_HEAD + "\n" + ts.map(function (t) { var r = rOf(t);
    return [frDate(t.date).replace(/\/(\d\d)$/, "/20$1"), t.time, t.market, t.account, t.side, winLabel(t.window), fr(t.entry), fr(t.stop), fr(t.exit), fr(t.size), fr(t.risk), fr(rPlanOf(t)), fr(t.pnl), r == null ? "" : fr(r.toFixed(2)), t.plan === false ? "non" : "oui", t.emotion, t.note].map(csvCell).join(";"); }).join("\n") + "\n");
});

/* ---------------- réglages ---------------- */
function saveSettings(patch) { var data = Object.assign({}, S.set, patch); return S.sb.from("reglages").upsert({ id: 1, data: data, updated_at: new Date().toISOString() }); }
function countUse(key, v) { return S.trades.filter(function (t) { return t[key] === v; }).length; }
function setErr(m) { $("set-err").textContent = m || ""; $("set-err").hidden = !m; }
function drawChips(boxId, arr, key) {
  var box = $(boxId); box.textContent = "";
  arr.forEach(function (v, i) { var n = countUse(key, v), x = el("button", { type: "button", "aria-label": "Retirer " + v, title: "Retirer" }, [icon("i-fermer")]);
    x.addEventListener("click", function () { if (arr.length <= 1) { setErr("Gardez au moins un élément."); return; } arr.splice(i, 1); drawSettings(); });
    box.appendChild(el("span", { class: "tx-chip" }, [v, n ? el("small", { text: n + " trade" + (n > 1 ? "s" : "") }) : null, x])); });
}
function typeOptions(sel) { Object.keys(ACC_TYPES).forEach(function (k) { sel.appendChild(el("option", { value: k, text: ACC_SHORT[k].charAt(0).toUpperCase() + ACC_SHORT[k].slice(1) })); }); }
typeOptions($("set-account-type"));
/* une ligne par compte : nom, type, capital de départ, bouton pour le retirer */
function drawAccounts() {
  var box = $("set-accounts"); box.textContent = "";
  S.tmpA.forEach(function (a, i) {
    var n = countUse("account", a.name), type = el("select", { class: "tx-input", "aria-label": "Type de " + a.name });
    typeOptions(type); type.value = a.type; type.addEventListener("change", function () { a.type = type.value; });
    var cap = el("input", { class: "tx-input tx-num", type: "number", step: "100", min: "0", inputmode: "decimal", placeholder: "Capital (€)", "aria-label": "Capital de départ de " + a.name });
    cap.value = a.capital != null ? a.capital : ""; cap.addEventListener("input", function () { a.capital = num(cap.value); });
    var x = el("button", { class: "tx-btn is-ghost is-icon", type: "button", "aria-label": "Retirer " + a.name, title: "Retirer" }, [icon("i-fermer")]);
    x.addEventListener("click", function () { if (S.tmpA.length <= 1) { setErr("Gardez au moins un compte."); return; } S.tmpA.splice(i, 1); drawSettings(); });
    var k = (a.moves || []).length;
    box.appendChild(el("div", { class: "pg-accrow" }, [el("div", { class: "nm" }, [a.name, el("small", { text: (n ? n + " trade" + (n > 1 ? "s" : "") : "aucun trade") + (k ? " · " + k + " mouvement" + (k > 1 ? "s" : "") + " de capital" : "") })]), type, cap, x]));
  });
}
function drawSettings() { setErr(""); drawChips("set-markets", S.tmpM, "market"); drawAccounts(); }
function addItem(inId, arr) { var v = $(inId).value.replace(/\s+/g, " ").trim(); if (!v) return; if (arr.some(function (x) { return norm(x) === norm(v); })) { setErr("« " + v + " » existe déjà."); return; } arr.push(v); $(inId).value = ""; drawSettings(); }
function addAccount() {
  var v = $("set-account-in").value.replace(/\s+/g, " ").trim(); if (!v) return;
  if (S.tmpA.some(function (a) { return norm(a.name) === norm(v); })) { setErr("« " + v + " » existe déjà."); return; }
  S.tmpA.push({ name: v, type: $("set-account-type").value, capital: num($("set-account-cap").value) });
  $("set-account-in").value = ""; $("set-account-cap").value = ""; drawSettings();
}
function openSettings() {
  S.tmpM = S.set.markets.slice();
  S.tmpA = S.set.accounts.map(function (n) { var i = accInfo(n); return { name: n, type: i.type, capital: i.capital, moves: (i.moves || []).slice() }; });
  $("set-rplan").value = S.set.rPlanDefault; $("set-rate").value = S.set.eurusd; drawSettings(); show("ov-settings", true);
}
$("btn-settings").addEventListener("click", openSettings);
document.querySelectorAll('[data-open="settings"]').forEach(function (b) { b.addEventListener("click", openSettings); });
$("set-market-add").addEventListener("click", function () { addItem("set-market-in", S.tmpM); });
$("set-account-add").addEventListener("click", addAccount);
$("set-market-in").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); addItem("set-market-in", S.tmpM); } });
["set-account-in", "set-account-cap"].forEach(function (id) { $(id).addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); addAccount(); } }); });
$("set-cancel").addEventListener("click", function () { show("ov-settings", false); });
$("ov-settings").addEventListener("click", function (e) { if (e.target === this) show("ov-settings", false); });
$("set-save").addEventListener("click", function () {
  var rp = num($("set-rplan").value), rate = num($("set-rate").value);
  if (!(rp > 0) || !(rate > 0)) { setErr("Vérifiez le R prévu et le taux de change."); return; }
  if (S.tmpA.some(function (a) { return a.capital != null && !(a.capital >= 0); })) { setErr("Un capital de départ n'est pas un nombre valide."); return; }
  var sasA = S.tmpA.filter(function (a) { return a.type === "sas"; });
  if (sasA.some(function (a) { return !(a.capital > 0); })) { setErr("Indiquez le capital de départ du compte réel : il sert au drawdown de la charte."); return; }
  var info = {}; S.tmpA.forEach(function (a) { info[a.name] = { type: a.type, capital: a.capital > 0 ? a.capital : null, moves: a.moves || [] }; });
  var sasCap = sasA.reduce(function (s, a) { return s + a.capital; }, 0);
  var b = this; b.disabled = true;
  saveSettings({ markets: S.tmpM.slice(), accounts: S.tmpA.map(function (a) { return a.name; }), accountsInfo: info, capital: sasCap || S.set.capital, rPlanDefault: rp, eurusd: rate }).then(function (res) {
    b.disabled = false; if (res.error) { setErr("Enregistrement impossible."); return; }
    show("ov-settings", false); toast("Réglages enregistrés"); reload("reglages");
  });
});

/* ---------------- ajouts et retraits de capital ---------------- */
function openCapital(name) {
  if (!name || name === "all") return;
  S.capAcc = name; S.capMoves = accMoves(name);
  $("cap-title").textContent = "Capital · " + name; $("cap-date").value = todayISO(); $("cap-amt").value = ""; $("cap-note").value = ""; $("cap-err").hidden = true;
  drawCapital(); show("ov-capital", true); setTimeout(function () { $("cap-amt").focus(); }, 30);
}
function drawCapital() {
  var base = accCap(S.capAcc), tot = S.capMoves.reduce(function (s, m) { return s + (Number(m.amount) || 0); }, 0);
  $("cap-sub").textContent = "Capital de départ " + (base ? eur(base) : "à renseigner dans les Réglages") + " · ajouts et retraits " + (tot ? seur(tot) : "aucun") + (base ? " · capital engagé " + eur(base + tot) : "");
  var box = $("cap-list"); box.textContent = "";
  if (!S.capMoves.length) { box.appendChild(el("div", { class: "tx-empty is-compact", text: "Aucun ajout ni retrait pour l'instant." })); return; }
  S.capMoves.slice().reverse().forEach(function (m) {
    var del = el("button", { class: "tx-btn is-ghost", type: "button", "aria-label": "Supprimer ce mouvement", text: "Supprimer" });
    del.addEventListener("click", function () {
      if (!del.dataset.c) { del.dataset.c = "1"; del.textContent = "Confirmer"; del.className = "tx-btn is-danger"; return; }
      S.capMoves = S.capMoves.filter(function (x) { return x !== m; }); persistMoves("Mouvement supprimé");
    });
    box.appendChild(el("div", { class: "pg-move" }, [el("span", { class: "tx-num", text: frDate(m.date) }), el("span", { class: "tx-num " + cls(Number(m.amount) || 0), text: seur(Number(m.amount) || 0) }),
      el("span", { class: "tx-dim pg-move-note", text: m.note || "" }), del]));
  });
}
/* les mouvements sont rangés avec le type et le capital de chaque compte, dans les réglages partagés */
function persistMoves(msg) {
  var info = {}; accList().forEach(function (n) { var i = accInfo(n); info[n] = { type: i.type, capital: Number(i.capital) > 0 ? Number(i.capital) : null, moves: (i.moves || []).slice() }; });
  info[S.capAcc] = Object.assign({}, info[S.capAcc] || accInfo(S.capAcc), { moves: S.capMoves.slice() });
  var accounts = S.set.accounts.indexOf(S.capAcc) < 0 ? S.set.accounts.concat([S.capAcc]) : S.set.accounts.slice();
  var b = $("cap-save"); b.disabled = true;
  return saveSettings({ accounts: accounts, accountsInfo: info }).then(function (res) {
    b.disabled = false;
    if (res.error) { $("cap-err").textContent = "Enregistrement impossible. Vérifiez votre connexion et réessayez."; $("cap-err").hidden = false; S.capMoves = accMoves(S.capAcc); drawCapital(); return; }
    S.set.accountsInfo = info; S.set.accounts = accounts; S.selSig = ""; drawCapital(); toast(msg); reload("reglages");
  });
}
$("capital-form").addEventListener("submit", function (e) {
  e.preventDefault(); var d = $("cap-date").value, a = num($("cap-amt").value);
  if (!d || a == null || a === 0) { $("cap-err").textContent = "Indiquez une date et un montant (négatif pour un retrait)."; $("cap-err").hidden = false; return; }
  $("cap-err").hidden = true;
  S.capMoves.push({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), date: d, amount: a, note: $("cap-note").value.trim() || null });
  $("cap-amt").value = ""; $("cap-note").value = "";
  persistMoves(a > 0 ? "Ajout de capital enregistré" : "Retrait de capital enregistré");
});
$("btn-capital").addEventListener("click", function () { openCapital(S.f.account); });
$("cap-cancel").addEventListener("click", function () { show("ov-capital", false); });
$("ov-capital").addEventListener("click", function (e) { if (e.target === this) show("ov-capital", false); });

/* ---------------- prop firms ---------------- */
function payoutsOf(id) { return S.payouts.filter(function (p) { return p.compte_id === id; }); }
function stOf(s) { return s === "Compte financé" ? { c: "is-ok", b: "is-pos" } : s === "Challenge en cours" ? { c: "is-pause", b: "is-info" } : /échoué|perdu/.test(s) ? { c: "is-stop", b: "is-neg" } : { c: "", b: "" }; }
function initials(name) {
  var s = String(name || "").trim(), w = s.split(/\s+/).filter(Boolean), caps = (w[0] || "").replace(/[^A-Z0-9]/g, "");
  return (caps.length >= 2 ? caps.slice(0, 2) : w.length >= 2 ? w[0].charAt(0) + w[1].charAt(0) : s.slice(0, 2)).toUpperCase() || "—";
}
function renderProps() {
  var k = $("prop-kpis"); k.textContent = "";
  var done = S.props.filter(function (p) { return p.statut === "Challenge échoué" || p.statut === "Compte financé" || p.statut === "Compte financé perdu"; });
  var valid = done.filter(function (p) { return p.statut !== "Challenge échoué"; });
  var spent = S.props.reduce(function (s, p) { return s + toEur(Number(p.cout) || 0, p.devise); }, 0);
  var paid = S.payouts.reduce(function (s, p) { return s + toEur(Number(p.montant) || 0, p.devise); }, 0);
  kpi(k, "Comptes financés actifs", String(S.props.filter(function (p) { return p.statut === "Compte financé"; }).length), "", S.props.filter(function (p) { return p.statut === "Challenge en cours"; }).length + " challenge(s) en cours");
  kpi(k, "Taux de réussite réel", done.length ? pct(valid.length / done.length, 0) : "—", "", done.length ? valid.length + " validé(s) sur " + done.length + " terminé(s)" : "Aucun challenge terminé");
  kpi(k, "Coût d'un compte validé", valid.length ? eur(spent / valid.length) : "—", "", "Dépenses ÷ comptes validés");
  kpi(k, "Dépensé en challenges", eur(spent), "", S.props.length + " achat(s)");
  kpi(k, "Versements reçus", eur(paid), paid > 0 ? "tx-pos" : "", S.payouts.length + " versement(s)");
  kpi(k, "Résultat net prop firm", seur(paid - spent), cls(paid - spent), "Versements − challenges");
  $("prop-count").textContent = S.props.length ? S.props.length + " compte(s)" : "";
  var box = $("prop-tbody"); box.textContent = "";
  if (!S.props.length) box.appendChild(el("div", { class: "tx-empty" }, [icon("i-comptes"), el("b", { text: "Aucun compte pour l'instant" }), "Ajoutez votre premier challenge avec « Nouveau compte »."]));
  S.props.slice().sort(function (a, b) { return String(b.date_achat || "").localeCompare(String(a.date_achat || "")); }).forEach(function (p) {
    var got = payoutsOf(p.id).reduce(function (s, y) { return s + toEur(Number(y.montant) || 0, y.devise); }, 0);
    var st = stOf(p.statut), name = p.firme + (p.taille ? " " + nf0.format(p.taille) : "");
    var card = el("article", { class: "tx-panel tx-account pg-acc " + st.c }, [
      el("div", { class: "tx-account-head" }, [
        el("div", { class: "tx-account-id" }, [el("span", { class: "tx-avatar", "aria-hidden": "true", text: initials(p.firme) }),
          el("div", { class: "pg-acc-name" }, [el("h3", { class: "tx-title", text: name }), el("div", { class: "tx-sub", text: p.programme || "Programme non précisé" })])]),
        el("span", { class: "tx-badge " + st.b, text: p.statut })]),
      el("dl", { class: "tx-kv" }, [el("dt", { text: "Prix du challenge" }), el("dd", { text: p.cout != null ? money(Number(p.cout), p.devise) : "—" }),
        el("dt", { text: "Acheté le" }), el("dd", { text: p.date_achat ? frDate(p.date_achat) : "—" })]),
      el("div", { class: "tx-account-foot" }, [el("span", { class: "tx-dim" }, ["Versements reçus", el("b", { class: "tx-num " + cls(got), text: got ? eur(got) : "—" })]),
        el("button", { class: "tx-btn is-ghost", type: "button", "aria-label": "Modifier le compte " + name, text: "Modifier" })])]);
    card.addEventListener("click", function () { openProp(p); });
    box.appendChild(card);
  });
  var yb = $("payout-tbody"); yb.textContent = "";
  if (!S.payouts.length) yb.appendChild(el("tr", {}, [el("td", { colspan: 5, class: "c-empty" }, [el("div", { class: "tx-empty is-compact", text: "Aucun versement reçu pour l'instant." })])]));
  S.payouts.slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }).forEach(function (y) {
    var acc = S.props.find(function (p) { return p.id === y.compte_id; });
    var del = el("button", { class: "tx-btn is-ghost", type: "button", text: "Supprimer" });
    del.addEventListener("click", function () { if (del.dataset.c) { S.sb.from("payouts").delete().eq("id", y.id).then(function () { reload("payouts"); }); } else { del.dataset.c = "1"; del.textContent = "Confirmer"; del.className = "tx-btn is-danger"; } });
    yb.appendChild(el("tr", {}, [el("td", { class: "tx-num", "data-l": "Date", text: frDate(y.date) }), el("td", { "data-l": "Compte", text: acc ? acc.firme + (acc.taille ? " " + nf0.format(acc.taille) : "") : "—" }),
      el("td", { class: "r tx-num tx-pos", "data-l": "Montant", text: money(Number(y.montant), y.devise) }), el("td", { class: "tx-dim", "data-l": "Note", text: y.note || "" }), el("td", { class: "r" }, [del])]));
  });
}
function renderRef() {
  var tb = $("ref-tbody"); tb.textContent = ""; var dl = $("firm-list"); dl.textContent = "";
  FIRMS_REF.forEach(function (f) { dl.appendChild(el("option", { value: f[0] }));
    tb.appendChild(el("tr", {}, [el("td", { "data-l": "Firme" }, [el("b", { text: f[0] })]), el("td", { class: "tx-num", "data-l": "Challenge 50 000", text: f[1] }),
      el("td", { "data-l": "Compte au nom de la SAS" }, [el("span", { class: "tx-badge" + (f[2] === "Non" ? " is-warn" : ""), text: f[2] })]),
      el("td", { "data-l": "Commission sur l'or", text: f[3] }), el("td", { class: "tx-dim", "data-l": "À retenir", text: f[4] })])); });
}
function openProp(p) {
  S.editingProp = p || null; $("prop-title").textContent = p ? "Modifier le compte" : "Nouveau compte prop firm";
  $("p-firm").value = p ? p.firme : ""; $("p-prog").value = p && p.programme || ""; $("p-size").value = p && p.taille != null ? p.taille : "";
  $("p-cur").value = p ? p.devise : "USD"; $("p-cost").value = p && p.cout != null ? p.cout : ""; $("p-status").value = p ? p.statut : PROP_STATUS[0];
  $("p-date").value = p && p.date_achat || todayISO(); $("p-note").value = p && p.note || "";
  $("p-del").hidden = !p; $("p-del-confirm").hidden = true; $("p-err").hidden = true; show("ov-prop", true);
}
$("btn-add-prop").addEventListener("click", function () { openProp(null); });
$("p-cancel").addEventListener("click", function () { show("ov-prop", false); });
$("ov-prop").addEventListener("click", function (e) { if (e.target === this) show("ov-prop", false); });
$("p-del").addEventListener("click", function () { $("p-del-confirm").hidden = false; this.hidden = true; });
$("p-del-yes").addEventListener("click", function () { var p = S.editingProp; if (!p) return; S.sb.from("prop_comptes").delete().eq("id", p.id).then(function (res) { if (res.error) { $("p-err").textContent = "Suppression impossible."; $("p-err").hidden = false; return; } show("ov-prop", false); reload("prop_comptes"); reload("payouts"); }); });
$("prop-form").addEventListener("submit", function (e) {
  e.preventDefault(); var firm = $("p-firm").value.trim(); if (!firm) { $("p-err").textContent = "Indiquez la firme."; $("p-err").hidden = false; return; }
  var row = { firme: firm, programme: $("p-prog").value.trim() || null, taille: num($("p-size").value), devise: $("p-cur").value, cout: num($("p-cost").value), statut: $("p-status").value, date_achat: $("p-date").value || null, note: $("p-note").value.trim() || null };
  var q = S.editingProp ? S.sb.from("prop_comptes").update(row).eq("id", S.editingProp.id) : S.sb.from("prop_comptes").insert(row);
  q.then(function (res) { if (res.error) { $("p-err").textContent = "Enregistrement impossible."; $("p-err").hidden = false; return; } show("ov-prop", false); toast("Compte enregistré"); reload("prop_comptes"); });
});
$("btn-add-payout").addEventListener("click", function () {
  if (!S.props.length) { toast("Ajoutez d'abord un compte prop firm."); return; }
  var sel = $("y-acc"); sel.textContent = "";
  S.props.forEach(function (p) { sel.appendChild(el("option", { value: p.id, text: p.firme + (p.taille ? " " + nf0.format(p.taille) : "") + " · " + p.statut })); });
  var funded = S.props.find(function (p) { return p.statut === "Compte financé"; }); if (funded) sel.value = funded.id; var cp = S.props.find(function (x) { return x.id === sel.value; }); if (cp) $("y-cur").value = cp.devise;
  $("y-date").value = todayISO(); $("y-amt").value = ""; $("y-note").value = ""; $("y-err").hidden = true; show("ov-payout", true);
});
$("y-acc").addEventListener("change", function () { var p = S.props.find(function (x) { return x.id === $("y-acc").value; }); if (p) $("y-cur").value = p.devise; });
$("y-cancel").addEventListener("click", function () { show("ov-payout", false); });
$("ov-payout").addEventListener("click", function (e) { if (e.target === this) show("ov-payout", false); });
$("payout-form").addEventListener("submit", function (e) {
  e.preventDefault(); var amt = num($("y-amt").value); if (amt == null) { $("y-err").textContent = "Indiquez le montant."; $("y-err").hidden = false; return; }
  S.sb.from("payouts").insert({ compte_id: $("y-acc").value, date: $("y-date").value || todayISO(), montant: amt, devise: $("y-cur").value, note: $("y-note").value.trim() || null })
    .then(function (res) { if (res.error) { $("y-err").textContent = "Enregistrement impossible."; $("y-err").hidden = false; return; } show("ov-payout", false); toast("Versement enregistré"); reload("payouts"); });
});

/* ---------------- annonces économiques ---------------- */
function impactOk(ev, lvl) { if (ev.impact === "Holiday") return true; if (lvl === "high") return ev.impact === "High"; if (lvl === "medium") return ev.impact === "High" || ev.impact === "Medium"; return true; }
function curOk(ev, mode) { return mode === "all" || ev.country === "USD" || ev.country === "EUR" || ev.country === "All"; }
function marketsFor(c) { return c === "USD" ? "Or, Nasdaq" : c === "EUR" ? "DAX" : c === "All" ? "Tous" : "Peu d'effet"; }
var MARGE_ANNONCE = 15; /* minutes sans trade autour d'une annonce majeure (charte) : à déplacer dans les réglages en phase 1 */
function winFlag(d, impact) {
  if (impact !== "High" && impact !== "Medium") return null; var m = nyMinutes(d);
  for (var i = 0; i < 3; i++) { var w = WINDOWS[i];
    if (m >= w.s - MARGE_ANNONCE && m <= w.e + MARGE_ANNONCE) return { strong: true, text: "Fenêtre " + w.label + " : pas de trade ±" + MARGE_ANNONCE + " min" };
    if (m >= w.s - 90 && m < w.s - MARGE_ANNONCE) return { strong: false, text: "Avant la fenêtre " + w.label }; }
  return null;
}
var IMP_FR = { High: "Fort", Medium: "Moyen", Low: "Faible", Holiday: "Férié" };
function ecoEvents() {
  if (!Array.isArray(S.cal)) return [];
  var lvl = $("eco-impact").value, mode = $("eco-cur").value;
  var today = todayISO(), tm = new Date(); tm.setDate(tm.getDate() + 1); var tomorrow = isoParis(tm);
  return S.cal.map(function (ev) { var d = new Date(ev.date); return { ev: ev, d: d, day: isoParis(d) }; })
    .filter(function (x) { return !isNaN(x.d) && impactOk(x.ev, lvl) && curOk(x.ev, mode) && (S.ecoDay === "week" || x.day === (S.ecoDay === "today" ? today : tomorrow)); })
    .sort(function (a, b) { return a.d - b.d; });
}
function impTag(imp) { return el("span", { class: "pg-imp is-" + String(imp || "").toLowerCase() }, [el("i"), IMP_FR[imp] || imp || "—"]); }
var fmtParisParts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function parisMinutes(d) { var h = 0, m = 0; fmtParisParts.formatToParts(d).forEach(function (x) { if (x.type === "hour") h = Number(x.value); if (x.type === "minute") m = Number(x.value); }); return h * 60 + m; }
/* instant où il est nyMin (minutes) à New York, le jour dayKey : le décalage est lu par Intl pour ce jour-là */
function nyWindowDate(dayKey, nyMin) { var p = dayKey.split("-").map(Number), off = nyMinutes(new Date(Date.UTC(p[0], p[1] - 1, p[2], 12, 0))) - 720; return new Date(Date.UTC(p[0], p[1] - 1, p[2], 0, 0) + (nyMin - off) * 60000); }
function hm(m) { return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); }
/* frise de la journée en heure de Paris : fenêtres Silver Bullet et annonces fortes ou moyennes */
function ecoLine(dayKey, evs) {
  var wrap = el("div", { class: "tx-chart pg-line" });
  var W = Math.max(280, ($("eco-recap").clientWidth || 760) - 34), H = 82, top = 22, base = 54, pl = 12, pr = 12;
  var wins = WINDOWS.slice(0, 3).map(function (w) { return { w: w, a: parisMinutes(nyWindowDate(dayKey, w.s)), b: parisMinutes(nyWindowDate(dayKey, w.e)) }; });
  var mins = evs.map(function (x) { return parisMinutes(x.d); });
  var lo = Math.min.apply(null, mins.concat(wins.map(function (v) { return v.a; }), [420])), hi = Math.max.apply(null, mins.concat(wins.map(function (v) { return v.b; }), [1320]));
  var h0 = Math.max(0, Math.floor(lo / 60)), h1 = Math.min(24, Math.floor(hi / 60) + 1), span = (h1 - h0) * 60;
  var x = function (m) { return pl + (W - pl - pr) * (m - h0 * 60) / span; }, step = (W - pl - pr) / (h1 - h0) < 13 ? 4 : 2;
  var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, height: H, role: "img", "aria-label": "Frise de la journée en heure de Paris : " + wins.map(function (v) { return "fenêtre " + v.w.label + " de " + hm(v.a) + " à " + hm(v.b); }).join(", ") + (evs.length ? " ; " + evs.length + " annonce" + (evs.length > 1 ? "s" : "") + " à fort ou moyen impact" : " ; aucune annonce à fort ou moyen impact") });
  wins.forEach(function (v) {
    svg.appendChild(svgEl("rect", { x: x(v.a), y: top, width: Math.max(3, x(v.b) - x(v.a)), height: base - top, rx: 4, class: "band" }));
    var t = svgEl("text", { x: (x(v.a) + x(v.b)) / 2, y: top - 8, "text-anchor": "middle", class: "band-l" }); t.textContent = v.w.label; svg.appendChild(t);
  });
  svg.appendChild(svgEl("line", { x1: pl, x2: W - pr, y1: base, y2: base, class: "axis" }));
  for (var h = h0; h <= h1; h++) {
    svg.appendChild(svgEl("line", { x1: x(h * 60), x2: x(h * 60), y1: base, y2: base + (h % step ? 3 : 6), class: "tick" }));
    if (h % step === 0) { var tl = svgEl("text", { x: x(h * 60), y: base + 20, "text-anchor": "middle" }); tl.textContent = h + "h"; svg.appendChild(tl); }
  }
  var isToday = dayKey === todayISO();
  if (isToday) { var nm = parisMinutes(new Date()); if (nm >= h0 * 60 && nm <= h1 * 60) { svg.appendChild(svgEl("line", { x1: x(nm), x2: x(nm), y1: top - 4, y2: base, class: "now" })); svg.appendChild(svgEl("circle", { cx: x(nm), cy: base, r: 3, class: "now-dot" })); } }
  var lastX = -99, lift = 0;
  evs.forEach(function (ev) {
    var cx = x(parisMinutes(ev.d)); lift = cx - lastX < 12 ? lift + 1 : 0; lastX = cx;
    var c = svgEl("circle", { cx: cx, cy: (top + base) / 2 - lift * 9, r: 5.5, class: "ev is-" + ev.ev.impact.toLowerCase() });
    var ti = svgEl("title", {}); ti.textContent = fmtParisTime.format(ev.d) + " · " + ev.ev.title + " (" + ev.ev.country + ", " + IMP_FR[ev.ev.impact].toLowerCase() + ")"; c.appendChild(ti); svg.appendChild(c);
  });
  wrap.appendChild(svg);
  wrap.appendChild(el("div", { class: "tx-legend" }, [
    el("span", { style: "color:var(--c-neg)" }, [el("i", { class: "is-dot" }), el("span", { class: "tx-dim", text: "Fort impact" })]),
    el("span", { style: "color:var(--c-warn)" }, [el("i", { class: "is-dot" }), el("span", { class: "tx-dim", text: "Impact moyen" })]),
    el("span", {}, [el("i", { class: "is-box" }), el("span", { class: "tx-dim", text: "Fenêtre Silver Bullet" })]),
    isToday ? el("span", { style: "color:var(--c-text)" }, [el("i", { class: "is-dash" }), el("span", { class: "tx-dim", text: "Maintenant" })]) : null]));
  return wrap;
}
function renderEco() {
  $("eco-updated").textContent = S.calUpdated ? "Calendrier mis à jour le " + new Date(S.calUpdated).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" }) : "";
  var recap = $("eco-recap"); recap.textContent = ""; var tb = $("eco-tbody"); tb.textContent = "";
  if (!Array.isArray(S.cal)) { recap.appendChild(el("div", { class: "tx-empty is-compact", text: "Calendrier indisponible. Il est récupéré à chaque publication du site (voir le guide)." })); return; }
  var list = ecoEvents();
  // compte rendu (jour choisi, ou aujourd'hui en vue semaine)
  var dayKey = S.ecoDay === "tomorrow" ? (function () { var t = new Date(); t.setDate(t.getDate() + 1); return isoParis(t); })() : todayISO();
  var dayAll = S.cal.map(function (ev) { return { ev: ev, d: new Date(ev.date) }; }).filter(function (x) { return isoParis(x.d) === dayKey && (x.ev.country === "USD" || x.ev.country === "EUR" || x.ev.country === "All"); }).sort(function (a, b) { return a.d - b.d; });
  var high = dayAll.filter(function (x) { return x.ev.impact === "High"; }), med = dayAll.filter(function (x) { return x.ev.impact === "Medium"; }), hol = dayAll.filter(function (x) { return x.ev.impact === "Holiday"; });
  var label = new Date(dayKey + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  var lead = high.length ? high.length + " annonce" + (high.length > 1 ? "s" : "") + " à fort impact sur l'USD et l'EUR" + (med.length ? ", et " + med.length + " à impact moyen." : ".") : med.length ? "Pas d'annonce à fort impact ; " + med.length + " à impact moyen." : "Aucune annonce notable sur l'USD et l'EUR : journée calme côté calendrier.";
  recap.appendChild(el("div", {}, [el("span", { class: "tx-eyebrow", text: "Compte rendu" }), el("h2", { class: "pg-recap-title", text: label.charAt(0).toUpperCase() + label.slice(1) }), el("p", { class: "tx-sub", style: "margin:0", text: lead })]));
  var main = high.concat(med).sort(function (a, b) { return a.d - b.d; });
  recap.appendChild(ecoLine(dayKey, main));
  var ul = el("ul", { class: "pg-events" });
  main.forEach(function (x) {
    var f = winFlag(x.d, x.ev.impact);
    ul.appendChild(el("li", { class: "pg-ev" }, [el("span", { class: "t", text: fmtParisTime.format(x.d) }),
      el("div", {}, [el("div", { class: "n", text: x.ev.title }), el("div", { class: "m" }, [impTag(x.ev.impact), el("span", { text: x.ev.country + (x.ev.forecast ? " · prévu " + x.ev.forecast + ", précédent " + (x.ev.previous || "—") : "") + " · " + marketsFor(x.ev.country) })])]),
      f ? el("span", { class: "tx-badge " + (f.strong ? "is-warn" : "is-info"), text: f.text }) : el("span")]));
  });
  hol.forEach(function (x) { ul.appendChild(el("li", { class: "pg-ev" }, [el("span", { class: "t", text: "Férié" }), el("div", {}, [el("div", { class: "n", text: x.ev.title + " (" + x.ev.country + ")" }), el("div", { class: "m", text: "Liquidité réduite sur " + marketsFor(x.ev.country) })]), el("span")])); });
  if (ul.childNodes.length) recap.appendChild(ul);
  // tableau
  if (!list.length) { tb.appendChild(el("tr", {}, [el("td", { colspan: 8, class: "c-empty" }, [el("div", { class: "tx-empty is-compact", text: "Aucune annonce pour ces filtres." })])])); return; }
  var lastDay = null;
  list.forEach(function (x) {
    if (S.ecoDay === "week" && x.day !== lastDay) { lastDay = x.day; var dl = new Date(x.day + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }); tb.appendChild(el("tr", { class: "pg-day" }, [el("td", { colspan: 8, text: dl.charAt(0).toUpperCase() + dl.slice(1) })])); }
    var f = winFlag(x.d, x.ev.impact);
    tb.appendChild(el("tr", {}, [el("td", { class: "tx-num", "data-l": "Heure Paris", text: fmtParisTime.format(x.d) }), el("td", { class: "tx-num tx-dim", "data-l": "Heure NY", text: nyTime(x.d) }), el("td", { "data-l": "Devise" }, [el("b", { text: x.ev.country })]),
      el("td", { "data-l": "Impact" }, [impTag(x.ev.impact)]),
      el("td", { class: "c-title", "data-l": "Annonce" }, [el("span", { text: x.ev.title }), f ? el("span", { class: "tx-badge " + (f.strong ? "is-warn" : "is-info"), text: f.text }) : null]),
      el("td", { class: "r tx-num", "data-l": "Prévision", text: x.ev.forecast || "—" }), el("td", { class: "r tx-num tx-dim", "data-l": "Précédent", text: x.ev.previous || "—" }), el("td", { class: "tx-dim", "data-l": "Vos marchés", text: marketsFor(x.ev.country) })]));
  });
}
$("eco-day").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; S.ecoDay = b.dataset.v; this.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); renderEco(); });
$("eco-impact").addEventListener("change", renderEco); $("eco-cur").addEventListener("change", renderEco);
function loadCal() {
  if (DEMO) { S.cal = demoCal(); S.calUpdated = new Date().toISOString(); S.calTried = true; renderEco(); renderSession(); return; }
  fetch("data/calendar.json", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { S.cal = Array.isArray(j) ? j : null; S.calTried = true; renderEco(); renderSession(); }).catch(function () { S.cal = null; S.calTried = true; renderEco(); renderSession(); });
  fetch("data/calendar-updated.txt", { cache: "no-store" }).then(function (r) { return r.ok ? r.text() : ""; }).then(function (t) { S.calUpdated = t.trim() || null; renderEco(); }).catch(function () {});
}

/* ---------------- backtest : données historiques (bougies M1 exportées de MT5) ---------------- */
/* Espace privé « historique » : un fichier compressé par marché et par mois de New York (lignes t;o;h;l;c;s,
   t = minutes UTC depuis 1970), plus un index _index.json (mois importés, nombre de bougies). Heures via Intl. */
var HI_BUCKET = "historique", HI_INDEX = "_index.json";
/* heure des fichiers : ny7 = New York + 7 h ; eet = Europe de l'Est (VT Markets) ; eet7 = Europe de l'Est − 7 h (HistData, constaté sur leurs fichiers) ;
   utc (Dukascopy) ; est = UTC−5 toute l'année */
var HI_ZONES = { ny7: { tz: "America/New_York", shift: 420 }, eet: { tz: "Europe/Athens", shift: 0 }, eet7: { tz: "Europe/Athens", shift: -420 }, utc: { tz: "UTC", shift: 0 }, est: { tz: "Etc/GMT+5", shift: 0 } };
var HI_GAP = 240, HI_WEEKEND = 2160; /* trou anormal : plus de 4 h en semaine ; au-delà de 36 h, c'est un week-end */
var JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
var tzFmts = {}, tzCache = {};
function tzOffset(tz, ms) { /* écart heure locale − UTC, en minutes */
  if (tz === "UTC") return 0;
  var key = tz + ":" + Math.floor(ms / 3600000); if (tzCache[key] != null) return tzCache[key];
  var f = tzFmts[tz] || (tzFmts[tz] = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" }));
  var p = {}; f.formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = Number(x.value); });
  return (tzCache[key] = Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute) - Math.floor(ms / 60000) * 60000) / 60000));
}
function wallToUtc(wallMs, tz) { var g = wallMs - tzOffset(tz, wallMs) * 60000; return wallMs - tzOffset(tz, g) * 60000; }
function nyWall(tMin) { return tMin + tzOffset("America/New_York", tMin * 60000); }
function monthKey(wMin) { var d = new Date(wMin * 60000); return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0"); }
function mLabel(k) { return k.slice(5) + "/" + k.slice(0, 4); }
function mLong(k) { return MOIS[Number(k.slice(5)) - 1] + " " + k.slice(0, 4); }
function hiSlug(m) { return String(m).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "marche"; }
var fmtNYFull = new Intl.DateTimeFormat("fr-FR", { timeZone: "America/New_York", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
function hiDate(tMin) { return fmtNYFull.format(new Date(tMin * 60000)); }

/* lecture du fichier : MT5 écrit en UTF-8 ou en UTF-16 selon les versions */
function hiDecode(buf) {
  var u = new Uint8Array(buf, 0, Math.min(4, buf.byteLength)), enc = "utf-8";
  if (u[0] === 0xFF && u[1] === 0xFE) enc = "utf-16le"; else if (u[0] === 0xFE && u[1] === 0xFF) enc = "utf-16be"; else if (u.length === 4 && u[1] === 0 && u[3] === 0) enc = "utf-16le";
  return new TextDecoder(enc).decode(buf);
}
/* archive .zip (HistData) : on lit seulement les fichiers .csv qu'elle contient, décompressés par le navigateur */
function hiUnzip(buf) {
  var dv = new DataView(buf), n = buf.byteLength, e = -1, i;
  for (i = n - 22; i >= Math.max(0, n - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) return Promise.reject(new Error("zip"));
  var cnt = dv.getUint16(e + 10, true), p = dv.getUint32(e + 16, true), parts = [];
  for (var k = 0; k < cnt && dv.getUint32(p, true) === 0x02014b50; k++) {
    var method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
    var name = new TextDecoder().decode(new Uint8Array(buf, p + 46, nlen)), start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
    if (/\.csv$/i.test(name)) parts.push({ name: name, method: method, data: new Uint8Array(buf, start, csize) });
    p += 46 + nlen + xlen + clen;
  }
  return Promise.all(parts.map(function (x) {
    var raw = x.method === 0 ? Promise.resolve(x.data.slice().buffer) : x.method === 8 ? new Response(new Blob([x.data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer() : Promise.reject(new Error("zip"));
    return raw.then(function (b) { return { name: x.name, text: hiDecode(b) }; });
  }));
}
function hiReadText(file) {
  return file.arrayBuffer().then(function (buf) {
    var u = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
    if (u[0] === 0x50 && u[1] === 0x4B) return hiUnzip(buf); /* « PK » : archive zip */
    return [{ name: file.name, text: hiDecode(buf) }];
  });
}
/* plusieurs fichiers d'un même marché (une année chacun, par exemple) : bougies mises bout à bout */
function hiMerge(list) {
  var out = { w: [], o: [], h: [], l: [], c: [], s: [], skipped: 0, flats: 0, abs: 0, header: false, source: "autre", tzHint: null, files: list.length };
  list.forEach(function (r, i) {
    ["w", "o", "h", "l", "c", "s"].forEach(function (k) { out[k] = out[k].concat(r[k]); });
    out.skipped += r.skipped; out.flats += r.flats; out.abs += r.abs;
    if (i === 0) { out.source = r.source; out.tzHint = r.tzHint; out.header = r.header; } else if (r.source !== out.source) out.mixed = true;
  });
  out.absolute = out.w.length > 0 && out.abs === out.w.length;
  return out;
}
/* Formats reconnus (tabulation, virgule ou point-virgule) :
   - MT5 : <DATE> <TIME> <OPEN> <HIGH> <LOW> <CLOSE> <TICKVOL> <VOL> <SPREAD>, dates année.mois.jour, heure du serveur ;
   - Dukascopy : Gmt time (UTC) ou Local time (avec GMT+hhmm), Open, High, Low, Close, Volume, dates jour.mois.année ;
   - horodatage en secondes ou millisecondes (UTC).
   Les bougies « plates » sans volume (week-ends ajoutés par Dukascopy) sont retirées. */
function hiParse(text) {
  var raw = { w: [], o: [], h: [], l: [], c: [], s: [], flat: [], skipped: 0, flats: 0, header: false, source: "autre", tzHint: null, abs: 0 }, pos = 0, len = text.length, ix = null, sep = "\t", dec = false, anyVol = false;
  var reYMD = /^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2}))?/, reDMY = /^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})(?:[ T]+(\d{1,2}):(\d{2}))?/;
  var reCompact = /^(\d{4})(\d{2})(\d{2})[ T]?(\d{2})(\d{2})(\d{2})?$/; /* HistData : 20250101 180000 */
  var reT = /(\d{1,2}):(\d{2})/, reOff = /(?:GMT|UTC)\s*([+-])(\d{1,2}):?(\d{2})?/i, reEpoch = /^\d{10,13}$/;
  function nv(v) { if (v == null) return NaN; v = v.trim().replace(/^"|"$/g, ""); return Number(dec ? v.replace(",", ".") : v); }
  function clean(v) { return (v || "").trim().replace(/^"|"$/g, ""); }
  function isDate(v) { v = clean(v); return reYMD.test(v) || reDMY.test(v) || reEpoch.test(v) || reCompact.test(v); }
  while (pos < len) {
    var nl = text.indexOf("\n", pos); if (nl < 0) nl = len;
    var line = text.slice(pos, nl); pos = nl + 1;
    if (line.charCodeAt(line.length - 1) === 13) line = line.slice(0, -1);
    if (!line.trim()) continue;
    if (!ix) {
      sep = line.indexOf("\t") >= 0 ? "\t" : (line.split(";").length > line.split(",").length ? ";" : ","); dec = sep !== ",";
      var first = line.split(sep), cells = first.map(function (x) { return x.replace(/[<>"\s]/g, "").toLowerCase(); });
      if (!isDate(first[0])) { /* en-tête */
        var find = function (names) { for (var i = 0; i < cells.length; i++) if (names.indexOf(cells[i]) >= 0) return i; return -1; };
        var tv = find(["tickvol"]);
        ix = { d: find(["date", "datetime", "gmttime", "localtime", "time(utc)", "timeutc", "timestamp", "time(eet)"]), t: find(["time"]), o: find(["open"]), h: find(["high"]), l: find(["low"]), c: find(["close"]), s: find(["spread"]), v: tv >= 0 ? tv : find(["volume", "vol"]) };
        if (ix.d < 0 && ix.t >= 0) { ix.d = ix.t; ix.t = -1; }
        if (line.indexOf("<") >= 0) raw.source = "mt5";
        else if (/gmt|utc/.test(cells.join(" "))) { raw.source = "duka"; raw.tzHint = "utc"; }
        raw.header = true; continue;
      }
      var d0 = clean(first[0]);
      ix = reT.test(d0) || reEpoch.test(d0) || reCompact.test(d0) ? { d: 0, t: -1, o: 1, h: 2, l: 3, c: 4, s: -1, v: first.length > 5 ? 5 : -1 } : { d: 0, t: 1, o: 2, h: 3, l: 4, c: 5, s: first.length >= 9 ? 8 : -1, v: first.length > 6 ? 6 : -1 };
    }
    if (ix.d < 0 || ix.o < 0 || ix.h < 0 || ix.l < 0 || ix.c < 0) { raw.skipped++; continue; }
    var f = line.split(sep), ds = clean(f[ix.d]), wMin, absolute = false;
    if (reEpoch.test(ds)) { wMin = Math.floor((ds.length >= 13 ? Number(ds) : Number(ds) * 1000) / 60000); absolute = true; }
    else {
      var y, mo, d, H, M, md = reCompact.exec(ds);
      if (md) { y = md[1]; mo = md[2]; d = md[3]; H = md[4]; M = md[5]; if (raw.source === "autre" && !raw.header) { raw.source = "histdata"; raw.tzHint = "eet7"; } }
      else if ((md = reYMD.exec(ds))) { y = md[1]; mo = md[2]; d = md[3]; H = md[4]; M = md[5]; }
      else { md = reDMY.exec(ds); if (!md) { raw.skipped++; continue; } d = md[1]; mo = md[2]; y = md[3]; H = md[4]; M = md[5]; if (raw.source === "autre") raw.source = "duka"; }
      if (H == null) { var mt = reT.exec(ix.t >= 0 ? f[ix.t] || "" : ""); if (!mt) { raw.skipped++; continue; } H = mt[1]; M = mt[2]; }
      wMin = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(H), Number(M)) / 60000;
      var off = reOff.exec(ds); if (off) { wMin -= (off[1] === "-" ? -1 : 1) * (Number(off[2]) * 60 + Number(off[3] || 0)); absolute = true; }
    }
    var o = nv(f[ix.o]), h = nv(f[ix.h]), l = nv(f[ix.l]), c = nv(f[ix.c]);
    if (!(o > 0 && h > 0 && l > 0 && c > 0) || h < l) { raw.skipped++; continue; }
    var vol = ix.v >= 0 ? nv(f[ix.v]) : NaN; if (vol > 0) anyVol = true;
    raw.w.push(wMin); raw.o.push(o); raw.h.push(h); raw.l.push(l); raw.c.push(c); raw.s.push(ix.s >= 0 ? nv(f[ix.s]) : NaN);
    raw.flat.push(vol === 0 && o === h && h === l && l === c);
    if (absolute) raw.abs++;
  }
  /* bougies plates sans volume : retirées seulement si le fichier a des volumes (HistData n'en a jamais : on garde tout) */
  if (anyVol && raw.flat.indexOf(true) >= 0) {
    var keep = ["w", "o", "h", "l", "c", "s"], out = {}; keep.forEach(function (k) { out[k] = []; });
    for (var q = 0; q < raw.w.length; q++) { if (raw.flat[q]) { raw.flats++; continue; } keep.forEach(function (k) { out[k].push(raw[k][q]); }); }
    keep.forEach(function (k) { raw[k] = out[k]; }); raw.abs = Math.min(raw.abs, raw.w.length);
  }
  delete raw.flat;
  raw.absolute = raw.w.length > 0 && raw.abs === raw.w.length; /* heures déjà en UTC : le réglage de l'heure du serveur ne s'applique pas */
  return raw;
}
/* conversion en UTC, tri, unité de temps, reprises après le week-end, trous et découpage par mois de New York */
/* heure de référence des horaires d'un marché : Francfort pour les indices européens (le DAX ouvre à heure fixe de Francfort), New York sinon */
function hiAnchor(market) { return /dax|ger|de40|deu|grx|stoxx|eu50|cac|fra40|ftse|uk100/i.test(market || "") ? { tz: "Europe/Berlin", label: "Francfort" } : { tz: "America/New_York", label: "New York" }; }
function hiAnalyze(raw, zoneKey, anchor) {
  anchor = anchor || hiAnchor("");
  var z = raw.absolute ? HI_ZONES.utc : (HI_ZONES[zoneKey] || HI_ZONES.ny7), n = raw.w.length, t = new Array(n), sorted = true, i;
  for (i = 0; i < n; i++) { t[i] = Math.round(wallToUtc((raw.w[i] - z.shift) * 60000, z.tz) / 60000); if (i && t[i] <= t[i - 1]) sorted = false; }
  var idx = []; for (i = 0; i < n; i++) idx.push(i);
  if (!sorted) idx.sort(function (a, b) { return t[a] - t[b] || a - b; });
  var keep = []; idx.forEach(function (j) { if (keep.length && t[keep[keep.length - 1]] === t[j]) keep[keep.length - 1] = j; else keep.push(j); });
  var a = { t: t, keep: keep, raw: raw, n: keep.length, tf: 1, months: {}, reopen: null, gaps: 0, dup: n - keep.length };
  if (!keep.length) return a;
  var ones = 0, diffs = {};
  for (i = 1; i < keep.length; i++) { var d = t[keep[i]] - t[keep[i - 1]]; if (d === 1) ones++; else if (d < 60) diffs[d] = (diffs[d] || 0) + 1; }
  if (keep.length > 20 && ones < (keep.length - 1) / 2) a.tf = Number(Object.keys(diffs).sort(function (x, y) { return diffs[y] - diffs[x]; })[0]) || 0;
  /* reprises après le week-end, par année : les horaires d'un marché peuvent changer d'une année à l'autre
     (le DAX de HistData ne couvre que la séance de Francfort en 2023), l'heure du serveur, elle, ne change pas */
  var roY = {};
  for (i = 0; i < keep.length; i++) {
    var ti = t[keep[i]], w = nyWall(ti), k = monthKey(w), m = a.months[k] || (a.months[k] = { from: i, to: i, n: 0 });
    m.to = i; m.n++;
    if (i) { var g = ti - t[keep[i - 1]];
      if (g >= HI_WEEKEND) { /* à la demi-heure près : sur un marché calme, la première bougie arrive quelques minutes après l'ouverture */
        var aw = ti + tzOffset(anchor.tz, ti * 60000), wr = Math.round(aw / 30) * 30, dd = new Date(wr * 60000), key = dd.getUTCDay() * 1440 + (wr % 1440), Y = roY[dd.getUTCFullYear()] || (roY[dd.getUTCFullYear()] = {});
        Y[key] = (Y[key] || 0) + 1; }
      else if (g > HI_GAP) a.gaps++; }
  }
  a.reopenYears = Object.keys(roY).sort().map(function (y) {
    var Y = roY[y], best = Object.keys(Y).sort(function (p, q) { return Y[q] - Y[p]; })[0], tot = 0; for (var x in Y) tot += Y[x];
    return { year: y, wd: Math.floor(best / 1440), min: best % 1440, count: Y[best], total: tot };
  });
  var big = a.reopenYears.filter(function (r) { return r.total >= 4; }), use = big.length ? big : a.reopenYears;
  if (use.length) {
    var cnt = use.reduce(function (s, r) { return s + r.count; }, 0), tot = use.reduce(function (s, r) { return s + r.total; }, 0), last = use[use.length - 1];
    a.reopen = { wd: last.wd, min: last.min, count: cnt, total: tot, score: use.reduce(function (s, r) { return s + r.count / r.total; }, 0) / use.length,
      same: use.every(function (r) { return r.wd === last.wd && r.min === last.min; }), years: use };
  }
  a.first = t[keep[0]]; a.last = t[keep[keep.length - 1]];
  return a;
}

/* stockage Supabase */
function hiGz(text) { return new Response(new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"))).blob().then(function (b) { return new Blob([b], { type: "application/gzip" }); }); }
function hiGunzip(blob) { return new Response(blob.stream().pipeThrough(new DecompressionStream("gzip"))).text(); }
/* Téléchargement d'un fichier de l'espace « historique ». En cas d'erreur, Supabase renvoie la réponse brute
   (message « {} ») : on lit son statut et son contenu pour distinguer « fichier absent » (normal au premier import)
   de « espace absent » (migration pas collée) et des vraies erreurs. */
function hiDownload(path) {
  return S.sb.storage.from(HI_BUCKET).download(path).then(function (res) {
    if (!res.error) return res.data;
    var e = res.error, resp = e.originalError, status = (resp && resp.status) || e.status || e.statusCode || "";
    var body = resp && typeof resp.text === "function" ? resp.text().catch(function () { return ""; }) : Promise.resolve("");
    return body.then(function (txt) {
      var msg = [e.message, e.error, txt].filter(function (x) { return x && x !== "{}"; }).join(" ");
      if (/bucket/i.test(msg)) throw new Error("Bucket not found");
      if (/not_found|not.?found|does not exist|no such/i.test(msg) || String(status) === "404") return null;
      throw new Error(msg || ("réponse " + (status || "inattendue") + " du serveur"));
    });
  });
}
function hiUpload(path, blob, type) { return S.sb.storage.from(HI_BUCKET).upload(path, blob, { upsert: true, contentType: type, cacheControl: "0" }).then(function (res) { if (res.error) throw res.error; }); }
function hiLoadIndex() { return hiDownload(HI_INDEX).then(function (b) { return b ? b.text().then(function (x) { var j = JSON.parse(x); j.markets = j.markets || {}; return j; }) : { v: 1, markets: {} }; }); }
function hiSaveIndex(idx) { return hiUpload(HI_INDEX, new Blob([JSON.stringify(idx)], { type: "application/json" }), "application/json"); }
function hiErrText(e) {
  var msg = String(e && (e.message || e.error) || e || ""); if (msg === "{}") msg = "réponse inattendue du serveur";
  if (/bucket/i.test(msg)) return "L'espace « historique » n'existe pas encore dans Supabase : collez la migration du 16/11/2026 (supabase/migrations) dans l'éditeur SQL.";
  if (/row-level|security|unauthori|forbidden|403/i.test(msg)) return "Accès refusé : vérifiez que votre e-mail figure dans la table des membres.";
  return "Erreur : " + (msg || "inconnue") + ".";
}
function hiRefresh() {
  S.hiBusy = true;
  return hiLoadIndex().then(function (idx) { S.hiIdx = idx; S.hiErr = null; }, function (e) { S.hiErr = hiErrText(e); })
    .then(function () { S.hiBusy = false; if (S.tab === "backtest") renderBacktest(); });
}
/* un mois : fusion avec ce qui existe déjà (les nouvelles bougies remplacent les anciennes à la même minute) */
function hiWriteMonth(entry, k, a) {
  var path = entry.slug + "/" + k + ".csv.gz", m = a.months[k], r = a.raw;
  var old = entry.months[k] ? hiDownload(path).then(function (b) { return b ? hiGunzip(b) : ""; }) : Promise.resolve("");
  return old.then(function (txt) {
    var map = new Map();
    txt.split("\n").forEach(function (ln, i) { if (i && ln) map.set(Number(ln.slice(0, ln.indexOf(";"))), ln); });
    for (var i = m.from; i <= m.to; i++) { var j = a.keep[i]; map.set(a.t[j], a.t[j] + ";" + r.o[j] + ";" + r.h[j] + ";" + r.l[j] + ";" + r.c[j] + ";" + (isFinite(r.s[j]) ? r.s[j] : "")); }
    var ts = Array.from(map.keys()).sort(function (x, y) { return x - y; }), out = ["t;o;h;l;c;s"], gaps = 0;
    ts.forEach(function (x, q) { out.push(map.get(x)); if (q) { var g = x - ts[q - 1]; if (g > HI_GAP && g < HI_WEEKEND) gaps++; } });
    return hiGz(out.join("\n") + "\n").then(function (blob) { return hiUpload(path, blob, "application/gzip"); }).then(function () { return { n: ts.length, gaps: gaps }; });
  });
}

/* onglet Backtest : chiffres clés et couverture */
function renderBacktest() {
  var k = $("bt-kpis"), box = $("bt-cov"); k.textContent = ""; box.textContent = "";
  if (S.hiErr) {
    kpi(k, "Données historiques", "—", "", "Inaccessibles");
    box.appendChild(el("div", { class: "tx-empty" }, [icon("i-info"), el("b", { text: "Données historiques inaccessibles" }), el("span", { text: S.hiErr })])); return;
  }
  if (!S.hiIdx) { box.appendChild(el("div", { class: "sg-col", "aria-busy": "true", "aria-label": "Chargement" }, [el("div", { class: "tx-skel", style: "width:30%" }), el("div", { class: "tx-skel" }), el("div", { class: "tx-skel", style: "width:70%" })])); return; }
  var idx = S.hiIdx.markets, names = S.set.markets.slice();
  Object.keys(idx).forEach(function (m) { if (names.indexOf(m) < 0 && Object.keys(idx[m].months || {}).length) names.push(m); });
  var tot = 0, nMk = 0, all = [], last = null;
  names.forEach(function (m) { var ks = Object.keys((idx[m] || {}).months || {}); if (ks.length) nMk++; ks.forEach(function (x) { tot += idx[m].months[x].n || 0; all.push(x); }); if (idx[m] && idx[m].updated && (!last || idx[m].updated > last)) last = idx[m].updated; });
  all.sort();
  kpi(k, "Marchés couverts", nMk + " sur " + names.length, "", nMk ? names.filter(function (m) { return idx[m] && Object.keys(idx[m].months).length; }).join(", ") : "Aucun pour l'instant");
  kpi(k, "Bougies M1", tot ? nf0.format(tot) : "0", "", tot ? "≈ " + nf0.format(Math.round(tot / 1380)) + " jours de cotation" : "—");
  kpi(k, "Période", all.length ? all[0].slice(0, 4) + " → " + all[all.length - 1].slice(0, 4) : "—", "", all.length ? "De " + mLong(all[0]) + " à " + mLong(all[all.length - 1]) : "—");
  kpi(k, "Dernier import", last ? frDate(last.slice(0, 10)) : "—", "", last ? "Espace privé « historique »" : "—");
  names.forEach(function (m) { box.appendChild(covBlock(m, idx[m])); });
  if (!S.btBusy) btFill();
  btRender(); renderBilan();
}
function covBlock(m, e) {
  var months = (e && e.months) || {}, ks = Object.keys(months).sort(), wrap = el("div", { class: "pg-cov-mk" });
  var head = el("div", { class: "pg-cov-head" }, [el("b", { text: m })]); wrap.appendChild(head);
  if (!ks.length) { head.appendChild(el("span", { class: "tx-sub", text: "Aucune donnée importée" })); return wrap; }
  var ns = ks.map(function (x) { return months[x].n || 0; }).sort(function (a, b) { return a - b; }), med = ns[Math.floor(ns.length / 2)];
  var part = ks.filter(function (x) { return (months[x].n || 0) < med * .6; }), miss = [], tot = ns.reduce(function (s, v) { return s + v; }, 0);
  var y0 = Number(ks[0].slice(0, 4)), y1 = Number(ks[ks.length - 1].slice(0, 4));
  for (var y = y0; y <= y1; y++) for (var mo = 1; mo <= 12; mo++) { var key = y + "-" + String(mo).padStart(2, "0"); if (key > ks[0] && key < ks[ks.length - 1] && !months[key]) miss.push(key); }
  head.appendChild(el("span", { class: "tx-sub", text: ks.length + " mois · " + nf0.format(tot) + " bougies · " + mLabel(ks[0]) + " → " + mLabel(ks[ks.length - 1]) + (e.updated ? " · importé le " + frDate(e.updated.slice(0, 10)) : "") }));
  var label = m + " : " + ks.length + " mois importés, de " + mLong(ks[0]) + " à " + mLong(ks[ks.length - 1]) + (part.length ? " ; incomplets : " + part.map(mLong).join(", ") : "") + (miss.length ? " ; manquants : " + miss.map(mLong).join(", ") : "");
  var grid = el("div", { class: "pg-cov-grid", role: "img", "aria-label": label });
  grid.appendChild(el("span")); ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"].forEach(function (x) { grid.appendChild(el("span", { class: "mh", text: x })); });
  for (y = y0; y <= y1; y++) {
    grid.appendChild(el("span", { class: "y", text: String(y) }));
    for (mo = 1; mo <= 12; mo++) {
      key = y + "-" + String(mo).padStart(2, "0"); var it = months[key], c = "pg-cov-cell" + (it ? (part.indexOf(key) >= 0 ? " is-part" : " is-full") : "");
      grid.appendChild(el("i", { class: c, title: mLong(key) + (it ? " : " + nf0.format(it.n) + " bougies" + (it.gaps ? " · " + it.gaps + " trou" + (it.gaps > 1 ? "s" : "") + " de plus de 4 h en semaine" : "") : " : absent") }));
    }
  }
  wrap.appendChild(grid);
  var notes = [];
  if (part.length) notes.push("Incomplets : " + part.map(mLabel).join(", ") + " (moins de 60 % des bougies d'un mois habituel).");
  if (miss.length) notes.push("Manquants : " + miss.map(mLabel).join(", ") + ".");
  if (notes.length) wrap.appendChild(el("p", { class: "tx-sub", style: "margin:0", text: notes.join(" ") }));
  return wrap;
}

/* fenêtre d'import */
/* les données d'une autre source que le courtier sont rangées à part (« XAUUSD (HistData) ») : jamais mélangées à ses prix */
var SRC_SUFFIX = { duka: " (Dukascopy)", histdata: " (HistData)" }, SRC_RE = / \((Dukascopy|HistData)\)$/;
function hiKey() { var m = $("hi-market").value; return m + (S.hiRaw && SRC_SUFFIX[S.hiRaw.source] || ""); }
function hiSyncTz() {
  var raw = S.hiRaw, sel = $("hi-tz");
  if (raw && (raw.absolute || raw.tzHint)) { sel.value = raw.absolute ? "utc" : raw.tzHint; sel.disabled = !!raw.absolute; return; }
  var e = S.hiIdx && S.hiIdx.markets[hiKey()]; sel.disabled = false; sel.value = e && HI_ZONES[e.tz] ? e.tz : "ny7";
}
/* marché deviné d'après le nom du fichier (XAUUSD, GRXEUR = DAX, NSXUSD = Nasdaq…) */
function hiGuessMarket(names) {
  var s = names.join(" "), sel = $("hi-market"), opts = Array.prototype.map.call(sel.options, function (o) { return o.value; });
  var rules = [[/xau|gold/i, /xau|gold|^or$/i], [/grx|ger|dax|deu|de40/i, /dax|ger|de40/i], [/nsx|nas|ustec|usatech|us100|ndx/i, /nas|ustec|us100|ndx/i], [/spx|us500|sp500/i, /spx|sp500|us500/i]];
  for (var i = 0; i < rules.length; i++) if (rules[i][0].test(s)) { var m = opts.find(function (o) { return rules[i][1].test(o); }); if (m) { sel.value = m; return; } }
}
function hiErr(msg) { var p = $("hi-err"); p.textContent = msg || ""; p.hidden = !msg; }
$("btn-hi").addEventListener("click", function () {
  var sel = $("hi-market"), names = S.set.markets.slice(); sel.textContent = "";
  Object.keys(S.hiIdx ? S.hiIdx.markets : {}).forEach(function (m) { m = m.replace(SRC_RE, ""); if (names.indexOf(m) < 0) names.push(m); });
  names.forEach(function (m) { sel.appendChild(el("option", { value: m, text: m })); });
  $("hi-file").value = ""; S.hiRaw = null; S.hiA = null; hiSyncTz(); $("hi-res").textContent = ""; hiErr(""); $("hi-go").disabled = true; $("hi-replace").checked = false; $("hi-replace-f").hidden = true;
  show("ov-histo", true); sel.focus();
});
$("hi-market").addEventListener("change", function () { hiSyncTz(); hiAutoTz(); hiShow(); });
$("hi-tz").addEventListener("change", function () { S.hiTzAuto = null; hiShow(); });
$("hi-replace").addEventListener("change", hiShow);
/* heure du serveur choisie automatiquement : celle où la reprise après le week-end tombe le plus souvent à la même heure de New York
   (les changements d'heure européens et américains ne tombent pas le même jour : seul le bon réglage reste stable toute l'année) */
function hiAutoTz() {
  var raw = S.hiRaw, sel = $("hi-tz"); S.hiTzAuto = null; S.hiTzScores = null; if (!raw || raw.absolute) return;
  var anchor = hiAnchor($("hi-market").value), scores = {};
  function score(z) { var r = hiAnalyze(raw, z, anchor).reopen; return r ? r.score + (anchor.tz === "America/New_York" && r.wd === 0 && r.min >= 960 && r.min <= 1200 ? .001 : 0) : 0; }
  var cur = sel.value, best = cur, bs = scores[cur] = score(cur);
  Object.keys(HI_ZONES).forEach(function (z) { if (z === cur) return; var s = scores[z] = score(z); if (s > bs + 1e-9) { best = z; bs = s; } });
  S.hiTzScores = scores; /* gardés pour dire si une reprise irrégulière vient des données ou du réglage */
  if (best !== cur) { sel.value = best; S.hiTzAuto = best; }
}
$("hi-cancel").addEventListener("click", function () { if (!S.hiImporting) show("ov-histo", false); });
$("ov-histo").addEventListener("click", function (e) { if (e.target === this && !S.hiImporting) show("ov-histo", false); });
$("hi-file").addEventListener("change", function () {
  var files = Array.prototype.slice.call(this.files || []); S.hiRaw = null; S.hiA = null; $("hi-go").disabled = true; hiErr(""); if (!files.length) { $("hi-res").textContent = ""; return; }
  var size = files.reduce(function (s, f) { return s + f.size; }, 0), res = $("hi-res"); res.textContent = "";
  res.appendChild(el("p", { class: "tx-help", text: "Lecture de " + (files.length > 1 ? files.length + " fichiers" : files[0].name) + " (" + nf0.format(Math.round(size / 1048576 * 10) / 10) + " Mo)…" }));
  hiGuessMarket(files.map(function (f) { return f.name; }));
  setTimeout(function () {
    Promise.all(files.map(hiReadText)).then(function (lists) {
      var texts = [].concat.apply([], lists); if (!texts.length) throw new Error("vide");
      S.hiRaw = hiMerge(texts.map(function (x) { return hiParse(x.text); })); hiSyncTz(); hiAutoTz(); hiShow();
    }).catch(function () { res.textContent = ""; hiErr("Fichier illisible : choisissez un export de bougies (fichier .csv, ou l'archive .zip de HistData)."); });
  }, 30);
});
function hiShow() {
  var raw = S.hiRaw, res = $("hi-res"); if (!raw) return; res.textContent = ""; hiErr("");
  var anc = hiAnchor($("hi-market").value), a = S.hiA = hiAnalyze(raw, $("hi-tz").value, anc), ok = true;
  if (!a.n) { hiErr("Aucune bougie reconnue. Le fichier doit venir de MT5 (Affichage > Symboles > Barres > Exporter les barres) ou de Dukascopy (format CSV)."); $("hi-go").disabled = true; return; }
  if (a.tf !== 1) { hiErr("Ce fichier contient des bougies de " + (a.tf || "plusieurs") + " minutes : exportez les bougies d'une minute (M1)."); ok = false; }
  var key = hiKey(), idxM = (S.hiIdx && S.hiIdx.markets[key] || {}).months || {}, ks = Object.keys(a.months).sort(), already = ks.filter(function (k) { return idxM[k]; }).length;
  var dl = el("dl", { class: "tx-kv" });
  function row(k, v) { dl.appendChild(el("dt", { text: k })); dl.appendChild(el("dd", { text: v })); }
  row("Format reconnu", (raw.source === "mt5" ? "MT5" : raw.source === "duka" ? "Dukascopy" + (raw.absolute || raw.tzHint ? " (heure UTC)" : "") : raw.source === "histdata" ? "HistData" : "Autre" + (raw.absolute ? " (heure UTC)" : "")) + (raw.files > 1 ? " · " + raw.files + " fichiers" : ""));
  if (raw.mixed) row("Attention", "fichiers de formats différents");
  row("Rangé sous", key);
  row("Bougies M1", nf0.format(a.n));
  row("Première (heure de New York)", hiDate(a.first));
  row("Dernière (heure de New York)", hiDate(a.last));
  var nOld = Object.keys(idxM).length, replace = $("hi-replace").checked;
  row("Mois concernés", ks.length + (already ? ", dont " + already + " déjà importé" + (already > 1 ? "s" : "") + (replace ? " (remplacés)" : " (complétés)") : ""));
  $("hi-replace-f").hidden = !nOld; $("hi-replace-h").textContent = nOld ? "Ce marché a déjà " + nOld + " mois importés. Par défaut, l'import les complète. Cochez pour tout remplacer, par exemple si l'heure du serveur était fausse : les " + nOld + " mois actuels seront effacés." : "";
  row("Trous de plus de 4 h en semaine", a.gaps ? nf0.format(a.gaps) + " (jours fériés ou séances courtes)" : "Aucun");
  if (raw.flats) row("Bougies plates retirées", nf0.format(raw.flats) + " (marché fermé)");
  if (raw.skipped || a.dup) row("Lignes ignorées", nf0.format(raw.skipped + a.dup) + (a.dup ? " (dont " + nf0.format(a.dup) + " en double)" : ""));
  res.appendChild(dl);
  /* contrôle de l'heure du serveur : la reprise après le week-end doit tomber à la même heure de New York toute l'année */
  var r = a.reopen, msg, c = "tx-help is-ok";
  if (!r) { msg = "Pas de week-end dans le fichier : impossible de vérifier l'heure du serveur."; c = "tx-help"; }
  else {
    var when = function (y) { return JOURS[y.wd] + " " + hm(y.min); }, weak = r.years.filter(function (y) { return y.count < y.total * .85; });
    var sc = S.hiTzScores, curS = sc && sc[$("hi-tz").value], bestS = sc ? Math.max.apply(null, Object.keys(sc).map(function (z) { return sc[z]; })) : null;
    if (weak.length && (raw.absolute || (sc && curS >= bestS - 1e-6))) { /* déjà le réglage le plus cohérent : ce sont les données qui sont irrégulières */
      msg = "Reprise après le week-end irrégulière en " + weak.map(function (y) { return y.year; }).join(", ") + " (" + when(weak[0]) + " à " + anc.label + " sur " + weak[0].count + " semaines sur " + weak[0].total + ") : jours fériés ou dimanches incomplets dans les données. Le réglage d'heure choisi est le plus cohérent ; les autres années sont régulières.";
      c = "tx-help";
    }
    else if (weak.length) { msg = "L'heure de reprise après le week-end varie " + (r.years.length > 1 ? "en " + weak.map(function (y) { return y.year; }).join(", ") : "au fil de l'année") + " (" + when(weak[0]) + " à " + anc.label + " sur " + weak[0].count + " semaines, une autre heure sur " + (weak[0].total - weak[0].count) + ") : " + (raw.absolute ? "le fichier contient peut-être des trous ou des jours fériés." : "l'heure du serveur choisie ne correspond sans doute pas à votre courtier. Essayez un autre réglage."); c = "tx-help is-warn"; }
    else {
      msg = r.same ? "Reprise après le week-end : " + when(r) + " à " + anc.label + ", identique sur " + r.count + " semaine" + (r.count > 1 ? "s" : "") + " sur " + r.total + "."
        : "Reprise après le week-end stable chaque année, mais les horaires du marché ont changé : " + r.years.map(function (y) { return y.year + " : " + when(y); }).join(", ") + " (heure de " + anc.label + ").";
      if (/xau|gold|nas|ustec|us100|usatech|nq/i.test($("hi-market").value) && (r.wd !== 0 || r.min < 16 * 60 || r.min > 20 * 60)) { msg += " L'or et le Nasdaq rouvrent en général le dimanche vers 18:00 à New York : vérifiez l'heure du serveur."; c = "tx-help is-warn"; }
    }
  }
  res.appendChild(el("p", { class: c, text: msg }));
  if (S.hiTzAuto) res.appendChild(el("p", { class: "tx-help", text: "Heure du serveur choisie automatiquement : « " + $("hi-tz").selectedOptions[0].textContent + " », la seule qui donne la même heure de reprise toute l'année." }));
  $("hi-go").disabled = !ok;
}
$("hi-go").addEventListener("click", function () {
  var a = S.hiA, mk = hiKey(), zone = $("hi-tz").value, b = this; if (!a || !a.n) return;
  if (typeof CompressionStream === "undefined") { hiErr("Ce navigateur ne sait pas compresser les fichiers : utilisez une version récente de Chrome, Edge, Firefox ou Safari."); return; }
  var ks = Object.keys(a.months).sort(), done = 0, res = $("hi-res");
  var bar = el("i"), prog = el("div", { class: "pg-progress", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(ks.length), "aria-valuenow": "0", "aria-label": "Envoi des mois" }, [bar]), txt = el("p", { class: "tx-help", text: "Préparation…" });
  res.appendChild(prog); res.appendChild(txt);
  b.disabled = true; $("hi-cancel").disabled = true; $("hi-file").disabled = true; S.hiImporting = true; hiErr("");
  var idx, entry, replace = $("hi-replace").checked, oldMonths = [];
  function step() { bar.style.width = (done / ks.length * 100) + "%"; prog.setAttribute("aria-valuenow", String(done)); txt.textContent = "Envoi : " + done + " mois sur " + ks.length; }
  function saveIdx() { entry.updated = new Date().toISOString(); idx.markets[mk] = entry; return hiSaveIndex(idx); }
  hiLoadIndex().then(function (x) {
    idx = x; entry = idx.markets[mk] || { slug: hiSlug(mk), months: {} }; entry.slug = entry.slug || hiSlug(mk); entry.months = entry.months || {}; entry.tz = zone;
    if (replace) { oldMonths = Object.keys(entry.months); entry.months = {}; } /* remplacer : on repart de zéro, sans fusionner avec l'ancien */
    step();
    var chain = Promise.resolve();
    ks.forEach(function (k) { chain = chain.then(function () { return hiWriteMonth(entry, k, a).then(function (info) { entry.months[k] = info; done++; step(); }); }); });
    return chain.then(saveIdx, function (err) { return (done ? saveIdx() : Promise.resolve()).then(function () { throw err; }); });
  }).then(function () {
    var gone = oldMonths.filter(function (k) { return !a.months[k]; }); /* anciens mois absents du nouvel import : supprimés */
    return gone.length ? S.sb.storage.from(HI_BUCKET).remove(gone.map(function (k) { return entry.slug + "/" + k + ".csv.gz"; })) : null;
  }).then(function () {
    txt.className = "tx-help is-ok"; txt.textContent = "Import terminé : " + ks.length + " mois de " + mk + " enregistrés" + (replace ? ", les anciennes données remplacées" : "") + ".";
    toast("Bougies de " + mk + " importées"); S.hiRaw = null; S.hiA = null; $("hi-file").value = ""; $("hi-tz").disabled = false;
  }, function (e) {
    hiErr((done ? done + " mois sur " + ks.length + " ont été enregistrés. " : "") + hiErrText(e) + " Relancez l'import : les mois déjà envoyés seront simplement complétés.");
  }).then(function () { S.hiImporting = false; $("hi-cancel").disabled = false; $("hi-file").disabled = false; hiRefresh(); });
});

/* ---------------- backtest : lancement, résultats, revue des setups avec graphique, avis ---------------- */
var BT = window.TradamaxBT;
var LWC_URL = "https://cdn.jsdelivr.net/npm/lightweight-charts@4.2.3/dist/lightweight-charts.standalone.production.js";
var AVIS = { pris: "Pris", autrement: "Pris autrement", refuse: "Refusé" };
var RAISONS = [["ob", "L'OB n'est pas valable"], ["liq", "Pas de vraie prise de liquidité"], ["fvg", "Le FVG ou l'IFVG n'est pas valable"], ["tard", "Entrée trop tardive"], ["stop", "Stop mal placé"], ["ctx", "Contexte ou tendance contraire"], ["news", "Annonce économique"], ["autre", "Autre (à préciser en commentaire)"]];
function raisonLabel(k) { var r = RAISONS.find(function (x) { return x[0] === k; }); return r ? r[1] : (k || ""); }
var fmtNYShort = new Intl.DateTimeFormat("fr-FR", { timeZone: "America/New_York", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
function nyShort(tMin) { return fmtNYShort.format(new Date(tMin * 60000)); }
function tfLabel(tf) { return tf >= 60 ? "H" + tf / 60 : "M" + tf; }
function sideLabel(d) { return d > 0 ? "Achat" : "Vente"; }
function r2(v) { return v == null ? null : Math.round(v * 100) / 100; }
function lastLE(arr, x) { var lo = 0, hi = arr.length - 1, ans = -1; while (lo <= hi) { var mid = (lo + hi) >> 1; if (arr[mid] <= x) { ans = mid; lo = mid + 1; } else hi = mid - 1; } return ans; }
function loadLWC() {
  if (window.LightweightCharts) return Promise.resolve();
  if (!loadLWC.p) loadLWC.p = new Promise(function (ok, ko) { var s = document.createElement("script"); s.src = LWC_URL; s.onload = ok; s.onerror = function () { loadLWC.p = null; ko(new Error("graphique")); }; document.head.appendChild(s); });
  return loadLWC.p;
}
function avisErrText(e) {
  var msg = String(e && (e.message || e.code) || e || "");
  if (/backtest_avis|relation|schema cache|PGRST205|42P01/i.test(msg)) return "La table des avis n'existe pas encore : collez la migration supabase/migrations/2026-11-16_backtest-avis.sql dans l'éditeur SQL de Supabase.";
  return hiErrText(e);
}
function loadAvis() {
  return fetchAll("backtest_avis", "created_at").then(function (rows) { var o = {}; rows.forEach(function (r) { o[r.setup_id] = r; }); S.avis = o; S.avisErr = null; }, function (e) { S.avisErr = avisErrText(e); })
    .then(function () { if (S.tab === "backtest") { rvRender(); renderBilan(); } });
}

/* lancement */
function btFill() {
  var idx = S.hiIdx ? S.hiIdx.markets : {}, sel = $("bt-market"), cur = sel.value;
  var names = Object.keys(idx).filter(function (m) { return Object.keys(idx[m].months || {}).length; });
  sel.textContent = ""; names.forEach(function (m) { sel.appendChild(el("option", { value: m, text: m })); });
  if (names.indexOf(cur) >= 0) sel.value = cur;
  $("bt-rules").textContent = "Règles " + BT.RULES.version + " · période d'apprentissage jusqu'à " + mLong(prevMonth(BT.RULES.controlFrom)) + " ; à partir de " + mLong(BT.RULES.controlFrom) + ", période de contrôle verrouillée (voir « Test de contrôle »)";
  btFillMonths();
}
function prevMonth(k) { var y = Number(k.slice(0, 4)), m = Number(k.slice(5)) - 1; if (!m) { y--; m = 12; } return y + "-" + String(m).padStart(2, "0"); }
/* mois utilisables par le backtest normal et la revue : uniquement avant la période de contrôle */
function learnMonths(e) { return e ? Object.keys(e.months).filter(function (k) { return k < BT.RULES.controlFrom; }).sort() : []; }
function ctlMonths(e) { return e ? Object.keys(e.months).filter(function (k) { return k >= BT.RULES.controlFrom; }).sort() : []; }
function btFillMonths() {
  var m = $("bt-market").value, e = S.hiIdx && S.hiIdx.markets[m], ks = learnMonths(e);
  var st = $("bt-status"); if (!S.btBusy && !S.bt) { st.className = "tx-help"; st.textContent = e && !ks.length ? "Toutes les données de ce marché sont dans la période de contrôle : importez des mois antérieurs à " + mLong(BT.RULES.controlFrom) + " pour le backtest et la revue." : ""; }
  renderCtl();
  [["bt-from", Math.max(0, ks.length - 6)], ["bt-to", ks.length - 1]].forEach(function (p) {
    var s = $(p[0]), keep = s.value, same = s.dataset.m === m; s.textContent = "";
    ks.forEach(function (k) { s.appendChild(el("option", { value: k, text: mLong(k) })); });
    s.value = same && ks.indexOf(keep) >= 0 ? keep : (ks[p[1]] || ""); s.dataset.m = m;
  });
  $("bt-go").disabled = !ks.length || !!S.btBusy;
}
$("bt-market").addEventListener("change", btFillMonths);
$("bt-zones").addEventListener("change", function () { renderCtl(); });
function rulesLabel() { return BT.RULES.version + BT.ZONES[$("bt-zones").value] + BT.TRENDS[$("bt-trend").value]; }
$("bt-trend").addEventListener("change", function () { renderCtl(); });
function zoneName(z) { return z.type === "FVG+IFVG" ? "FVG et IFVG superposés" : z.type; }
function trendText(su) {
  var tr = su.trend; if (!tr) return "";
  if (!tr.dir) return "Tendance " + tfLabel(tr.tf) + " : pas encore de cassure de structure.";
  return "Tendance " + tfLabel(tr.tf) + " : " + (tr.dir > 0 ? "haussière" : "baissière") + " depuis le " + nyShort(tr.t) + " (clôture " + (tr.dir > 0 ? "au-dessus de " : "sous ") + nf2.format(tr.level) + "), " + (tr.ok ? "dans le sens du setup." : "contre le setup.");
}
function btLoad(m, keys, onProg) {
  var e = S.hiIdx.markets[m], T = [], O = [], H = [], L = [], C = [], done = 0, chain = Promise.resolve();
  keys.forEach(function (k) {
    chain = chain.then(function () { return hiDownload(e.slug + "/" + k + ".csv.gz"); }).then(function (b) { return b ? hiGunzip(b) : ""; }).then(function (txt) {
      var lines = txt.split("\n");
      for (var i = 1; i < lines.length; i++) { var ln = lines[i]; if (!ln) continue; var f = ln.split(";"); T.push(+f[0]); O.push(+f[1]); H.push(+f[2]); L.push(+f[3]); C.push(+f[4]); }
      onProg(++done);
    });
  });
  return chain.then(function () {
    var ord = [], i; for (i = 0; i < T.length; i++) ord.push(i);
    ord.sort(function (a, b) { return T[a] - T[b] || a - b; });
    var t = [], o = [], h = [], l = [], c = [];
    ord.forEach(function (j) { if (t.length && t[t.length - 1] === T[j]) return; t.push(T[j]); o.push(O[j]); h.push(H[j]); l.push(L[j]); c.push(C[j]); });
    return { t: Int32Array.from(t), o: Float64Array.from(o), h: Float64Array.from(h), l: Float64Array.from(l), c: Float64Array.from(c) };
  });
}
$("bt-go").addEventListener("click", function () {
  var m = $("bt-market").value, from = $("bt-from").value, to = $("bt-to").value, e = S.hiIdx && S.hiIdx.markets[m], b = this, st = $("bt-status"); if (!e) return;
  if (from > to) { var x = from; from = to; to = x; }
  var keys = learnMonths(e).filter(function (k) { return k >= from && k <= to; }), t0 = Date.now(); /* jamais la période de contrôle */
  if (!keys.length) return;
  S.btBusy = true; b.disabled = true; st.className = "tx-help"; st.textContent = "Chargement des bougies : 0 mois sur " + keys.length + "…";
  btLoad(m, keys, function (d) { st.textContent = "Chargement des bougies : " + d + " mois sur " + keys.length + "…"; }).then(function (data) {
    if (!data.t.length) throw new Error("vide");
    st.textContent = "Calcul du backtest sur " + nf0.format(data.t.length) + " bougies…";
    return new Promise(function (ok) { setTimeout(function () { ok({ data: data, res: BT.run(data, { market: m, zones: $("bt-zones").value, trend: $("bt-trend").value }) }); }, 40); });
  }).then(function (x) {
    S.bt = { market: m, from: from, to: to, m: x.data, res: x.res }; S.rvShown = 30;
    st.className = "tx-help is-ok";
    st.textContent = "Backtest terminé en " + ((Date.now() - t0) / 1000).toFixed(1).replace(".", ",") + " s : " + mLong(from) + " à " + mLong(to) + ", " + nf0.format(x.data.t.length) + " bougies, " + x.res.stats.n + " trades pris, " + x.res.review.length + " setups à revoir.";
    btRender(); loadAvis();
  }).catch(function (err) { st.className = "tx-help is-error"; st.textContent = err && err.message === "vide" ? "Aucune bougie sur cette période." : hiErrText(err); })
    .then(function () { S.btBusy = false; b.disabled = false; });
});

/* résultats */
function btRender() {
  var r = S.bt && S.bt.res; $("bt-out").hidden = !r; if (!r) return;
  var s = r.stats, k = $("bt-res-kpis"); k.textContent = "";
  kpi(k, "Trades pris", String(s.n), "", "sur " + nf0.format(r.setups.length) + " setups complets · " + S.bt.market);
  kpi(k, "Taux de réussite", s.wr == null ? "—" : pct(s.wr), "", s.n ? s.win + " gagnants · " + s.loss + " perdants · " + s.be + " à zéro" : "—");
  kpi(k, "Résultat", s.n ? rfmt(s.sum) : "—", cls(s.sum), s.avg == null ? "—" : "R moyen " + rfmt(s.avg));
  kpi(k, "Drawdown max", s.n ? "−" + nf2.format(s.maxdd) + " R" : "—", "", "Plus longue série de pertes : " + s.worst);
  var tsel = $("bt-trend").value; kpi(k, "Tendance", tsel === "0" ? "Aucune" : tfLabel(+tsel), "", tsel === "0" ? "Tous les sens pris" : (s.byReason.T || 0) + " setups contre la tendance écartés");
  var rb = $("bt-reasons"); rb.textContent = "";
  var rs = s.byReason, labels = BT.REASONS;
  Object.keys(rs).filter(function (c) { return rs[c]; }).sort(function (a, b) { return rs[b] - rs[a]; }).forEach(function (c) {
    rb.appendChild(el("div", { class: "it" }, [el("span", { text: labels[c] || c }), el("span", { class: "tx-sub tx-num", text: c }), el("span", { class: "tx-num", text: nf0.format(rs[c]) })]));
  });
  var tb = $("bt-tf"); tb.textContent = "";
  function trow(label, o) { tb.appendChild(el("tr", {}, [el("td", { "data-l": "Unité", text: label }), el("td", { class: "r tx-num", "data-l": "Trades", text: o ? String(o.n) : "0" }), el("td", { class: "r tx-num", "data-l": "Réussite", text: o && o.n ? pct(o.win / o.n, 0) : "—" }), el("td", { class: "r tx-num " + (o ? cls(o.sum) : ""), "data-l": "Résultat", text: o ? rfmt(o.sum) : "—" })])); }
  BT.RULES.sweepTfs.forEach(function (tf) { trow("Prise de liquidité " + tfLabel(tf), s.byTf[tf]); });
  BT.RULES.obTfs.forEach(function (tf) { trow("OB " + tfLabel(tf), s.byObTf[tf]); });
  ["FVG", "FVG+IFVG"].forEach(function (z) { trow("Zone " + (z === "FVG+IFVG" ? "FVG et IFVG superposés" : "FVG seul"), s.byZone[z]); });
  rvRender();
}

/* liste à revoir : trades pris + échantillon d'annulés */
function rvItems() {
  var r = S.bt && S.bt.res; if (!r) return [];
  return r.review.filter(function (su) { var a = S.avis[su.id]; return S.rvFilter === "all" || (S.rvFilter === "done" ? !!a : !a); });
}
function robotText(su) { return su.taken ? "Pris par le robot" : "Annulé : " + (BT.REASONS[su.reason] || su.reason); }
function rvRender() {
  var r = S.bt && S.bt.res; if (!r) return;
  var done = r.review.filter(function (su) { return S.avis[su.id]; }).length;
  $("bt-rv-sub").textContent = done + " revu" + (done > 1 ? "s" : "") + " sur " + r.review.length + " : " + r.reviewTaken + " trades pris par le robot (sur " + nf0.format(r.taken.length) + ") et " + (r.review.length - r.reviewTaken) + " setups annulés, tirés au hasard. Le résultat s'affiche après votre avis.";
  var tb = $("bt-rv-body"); tb.textContent = "";
  function empty(b, t) { tb.appendChild(el("tr", {}, [el("td", { colspan: "6", class: "c-empty" }, [el("div", { class: "tx-empty is-compact" }, [el("b", { text: b }), el("span", { text: t })])])])); }
  if (S.avisErr) empty("Avis indisponibles", S.avisErr);
  var items = rvItems(), vis = items.slice(0, S.rvShown);
  if (!items.length) empty(S.rvFilter === "todo" ? "Tout est revu" : "Aucun setup", S.rvFilter === "todo" ? "Chaque setup de ce backtest a reçu un avis." : "Rien à afficher avec ce filtre.");
  vis.forEach(function (su) {
    var a = S.avis[su.id];
    var tr = el("tr", { tabindex: "0", "aria-label": sideLabel(su.dir) + " du " + nyShort(su.tS) + ", " + robotText(su) + (a ? ", avis : " + AVIS[a.avis] : ", à revoir") }, [
      el("td", { class: "tx-num", "data-l": "Date", text: nyShort(su.tS) }),
      el("td", { "data-l": "Sens", text: sideLabel(su.dir) + (su.trend && su.trend.dir ? (su.trend.ok ? " · avec la tendance" : " · contre la tendance") : "") }),
      el("td", { "data-l": "Unités", text: "OB " + tfLabel(su.obTf) + " · " + tfLabel(su.tf) }),
      el("td", { "data-l": "Robot" }, [el("span", { class: "tx-badge " + (su.taken ? "is-info" : "is-plain"), title: robotText(su), text: su.taken ? "Pris" : "Annulé (" + su.reason + ")" })]),
      el("td", { "data-l": "Avis" }, [a ? el("span", { class: "tx-badge" + (a.avis === "refuse" ? " is-warn" : a.avis === "autrement" ? " is-info" : ""), text: AVIS[a.avis] + (mine(a) ? " · vous" : "") }) : el("span", { class: "tx-dim", text: "À revoir" })]),
      el("td", { class: "c-act" }, [el("span", { class: "tx-sub", text: a ? "Revoir" : "Donner mon avis" })])
    ]);
    tr.addEventListener("click", function () { openReview(su); });
    tr.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openReview(su); } });
    tb.appendChild(tr);
  });
  show("bt-rv-more", items.length > vis.length);
}
$("bt-rv-filter").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; S.rvFilter = b.dataset.v; S.rvShown = 30; this.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); rvRender(); });
$("bt-rv-more-b").addEventListener("click", function () { S.rvShown += 30; rvRender(); });

/* fenêtre de revue */
(function () { var s = $("rv-reason"); s.appendChild(el("option", { value: "", text: "Choisir une raison" })); RAISONS.forEach(function (r) { s.appendChild(el("option", { value: r[0], text: r[1] })); }); })();
function openReview(su) {
  var list = rvItems(), i = list.indexOf(su);
  if (i < 0) { list = S.bt.res.review; i = list.indexOf(su); }
  S.rv = { list: list.slice(), i: i }; show("ov-review", true); rvShow(); $("rv-close").focus();
}
function rvClose() { rvDestroy(); show("ov-review", false); S.rv = null; }
function rvShow() {
  var rv = S.rv, su = rv.list[rv.i], a = S.avis[su.id];
  rv.su = su; rv.tf = su.tf; rv.revealed = !!a; rv.dirty = false;
  $("rv-title").textContent = sideLabel(su.dir) + " " + S.bt.market + " · " + nyShort(su.tS);
  $("rv-sub").textContent = "OB " + tfLabel(su.obTf) + " (" + su.ob.n + " bougie" + (su.ob.n > 1 ? "s" : "") + ") · prise de liquidité " + tfLabel(su.tf) + " · " + zoneName(su.zone) + " · heures de New York";
  $("rv-pos").textContent = (rv.i + 1) + " / " + rv.list.length;
  var seg = $("rv-tf"); seg.textContent = "";
  [su.tf, su.obTf].filter(function (v, i, a2) { return a2.indexOf(v) === i; }).forEach(function (tf) {
    var b = el("button", { type: "button", "aria-pressed": String(tf === rv.tf), text: tfLabel(tf) + (tf === su.tf ? " · prise de liquidité" : " · OB") });
    b.addEventListener("click", function () { rv.tf = tf; seg.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); rvChart(); });
    seg.appendChild(b);
  });
  var robot = $("rv-robot"); robot.textContent = "";
  if (su.taken) {
    robot.appendChild(el("b", { text: "Le robot prend ce trade." }));
    robot.appendChild(el("span", {}, ["Entrée ", el("span", { class: "tx-num", text: nf2.format(su.entry) }), " : ordre limite " + (su.dir > 0 ? "en haut" : "en bas") + (su.zone.type === "IFVG" ? " de l'IFVG" : " du FVG") + ", exécuté pendant la " + su.nth + (su.nth > 1 ? "e" : "re") + " bougie après sa formation ; stop ", el("span", { class: "tx-num", text: nf2.format(su.stop) }), " (clôture de la bougie de prise de liquidité), objectif ", el("span", { class: "tx-num", text: nf2.format(su.tp) }), " (2 R). 1 R = ", el("span", { class: "tx-num", text: nf2.format(su.risk) }), "."]));
  } else {
    robot.appendChild(el("b", { text: "Le robot n'a pas pris ce setup." }));
    robot.appendChild(el("span", { text: "Raison : " + (BT.REASONS[su.reason] || su.reason) + " (règle " + su.reason + ")." }));
  }
  /* ce que le robot a vu, pour que le trader puisse le contredire point par point */
  var z = su.zone, seen = "OB " + tfLabel(su.obTf) + " de " + su.ob.n + " bougie" + (su.ob.n > 1 ? "s" : "") + (su.ob.fvg ? ", suivi d'un FVG" : ", sans FVG dans son déplacement") + " · creux pris : " + (su.dir > 0 ? "plus bas" : "plus haut") + (su.depth >= 2000 ? " depuis plus de 2 000 bougies " + tfLabel(su.tf) : " des " + su.depth + " bougies " + tfLabel(su.tf) + " précédentes") + " · " + zoneName(z) + (z.size != null ? " de " + nf2.format(z.size) + " ATR" : "") + (z.parts ? " (FVG " + nf2.format(z.parts[0].size) + " ATR, IFVG " + nf2.format(z.parts[1].size) + " ATR)" : z.age != null ? " (FVG inversé formé " + z.age + " bougie" + (z.age > 1 ? "s" : "") + " plus tôt)" : "") + ".";
  robot.appendChild(el("span", { class: "tx-sub", text: seen }));
  robot.appendChild(el("span", { class: "tx-sub", text: trendText(su) }));
  var cancelled = !su.taken;
  $("rv-q").textContent = cancelled ? "L'auriez-vous pris ?" : "Prenez-vous ce trade ?";
  $("rv-l-pris").textContent = cancelled ? "Je l'aurais pris" : "Je le prends";
  $("rv-l-autrement").textContent = cancelled ? "Je l'aurais pris autrement" : "Je le prends, mais autrement";
  $("rv-l-refuse").textContent = cancelled ? "Je ne l'aurais pas pris" : "Je ne le prends pas";
  document.querySelectorAll('input[name="rv-avis"]').forEach(function (x) { x.checked = !!a && x.value === a.avis; });
  $("rv-reason").value = a && a.raison || ""; $("rv-note").value = a && a.note || "";
  $("rv-err").hidden = true; $("rv-prev").disabled = rv.i === 0; $("rv-del").hidden = !a; $("rv-del-confirm").hidden = true;
  rvForm(); rvResult(); rvBtn(); rvChart();
}
function rvAvis() { var c = document.querySelector('input[name="rv-avis"]:checked'); return c ? c.value : null; }
function rvForm() {
  var av = rvAvis(), cancelled = S.rv && S.rv.su && !S.rv.su.taken;
  $("rv-reason-f").hidden = av !== "refuse";
  $("rv-note-l").textContent = av === "autrement" ? "Qu'est-ce que vous feriez autrement ? (entrée, stop, objectif…)" : av === "pris" && cancelled ? "Pourquoi l'annulation du robot est de trop ? (facultatif)" : "Commentaire (facultatif)";
}
function rvBtn() {
  var rv = S.rv, b = $("rv-save");
  if (!rv.revealed) { b.textContent = "Enregistrer et voir la suite"; b.disabled = false; }
  else if (rv.dirty) { b.textContent = "Mettre à jour l'avis"; b.disabled = false; }
  else { b.textContent = rv.i < rv.list.length - 1 ? "Setup suivant" : "Dernier setup"; b.disabled = rv.i >= rv.list.length - 1; }
}
document.querySelectorAll('input[name="rv-avis"]').forEach(function (x) { x.addEventListener("change", function () { rvForm(); if (S.rv) { S.rv.dirty = true; rvBtn(); } }); });
["rv-reason", "rv-note"].forEach(function (id) { $(id).addEventListener("input", function () { if (S.rv && S.rv.revealed) { S.rv.dirty = true; rvBtn(); } }); });
function exitText(o) {
  var when = " le " + nyShort(o.t);
  if (o.kind === "tp") return "objectif atteint" + when;
  if (o.kind === "sl") return "stop touché" + when;
  if (o.kind === "be") return "sorti au point d'entrée" + when + " (stop remonté le " + nyShort(o.tBe) + ")";
  return "encore ouvert à la fin des données";
}
function rvResult() {
  var rv = S.rv, su = rv.su, box = $("rv-result"); box.textContent = ""; if (!rv.revealed) return;
  if (su.out) {
    box.appendChild(el("b", { text: (su.taken ? "Résultat du robot : " : "Si le robot était entré à " + nf2.format(su.entry) + " : ") + rfmt(su.out.r) }));
    box.appendChild(el("span", { text: exitText(su.out).charAt(0).toUpperCase() + exitText(su.out).slice(1) + "." }));
    if (su.iE != null && S.bt.m.t[su.iE] != null) { var lw = su.dir > 0 ? S.bt.m.l[su.iE] : S.bt.m.h[su.iE]; box.appendChild(el("span", { class: "tx-sub", text: "Ordre touché le " + nyShort(S.bt.m.t[su.iE]) + " : " + (su.dir > 0 ? "plus bas" : "plus haut") + " de la minute " + nf2.format(lw) + " pour un ordre à " + nf2.format(su.dir > 0 ? su.zone.top : su.zone.bot) + "." })); }
  } else box.appendChild(el("b", { text: "Pas d'entrée possible : le graphique montre la suite du marché." }));
}
function rvSave() {
  var rv = S.rv, su = rv.su, av = rvAvis(), raison = $("rv-reason").value, note = $("rv-note").value.replace(/\s+/g, " ").trim(), err = $("rv-err");
  if (rv.revealed && !rv.dirty) { if (rv.i < rv.list.length - 1) { rv.i++; rvShow(); } return; }
  if (!av) { err.textContent = "Choisissez une réponse."; err.hidden = false; return; }
  if (av === "refuse" && !raison && su.taken) { err.textContent = "Choisissez une raison : c'est ce qui permet d'améliorer les règles."; err.hidden = false; return; }
  if (av === "autrement" && !note) { err.textContent = "Dites en quelques mots ce que vous feriez autrement."; err.hidden = false; return; }
  err.hidden = true;
  var row = { setup_id: su.id, marche: S.bt.market, regles: S.bt.res.rules, robot: su.taken ? "pris" : "annulé " + su.reason, avis: av, raison: av === "refuse" ? (raison || null) : null, note: note || null, r_robot: su.out ? r2(su.out.r) : null,
    details: { date_ny: nyShort(su.tS), sens: sideLabel(su.dir), unite_liquidite: tfLabel(su.tf), unite_ob: tfLabel(su.obTf), bougies_ob: su.ob.n, ob_fvg: su.ob.fvg ? "oui" : "non", profondeur_creux: su.depth, zone: su.zone.type, taille_zone_atr: r2(su.zone.size), tendance: su.trend && su.trend.dir ? (su.trend.dir > 0 ? "haussière" : "baissière") + " " + tfLabel(su.trend.tf) + (su.trend.ok ? " (avec)" : " (contre)") : "indéterminée", raison_robot: su.taken ? null : BT.REASONS[su.reason], entree: r2(su.entry), stop: r2(su.stop), objectif: r2(su.tp), sortie: su.out ? su.out.kind : null },
    updated_at: new Date().toISOString() };
  if (S.user && S.user.id) row.auteur = S.user.id; /* l'auteur de l'avis : pour effacer seulement les siens */
  var b = $("rv-save"); b.disabled = true;
  S.sb.from("backtest_avis").upsert(row, { onConflict: "setup_id" }).then(function (res) {
    if (res.error) throw res.error;
    S.avis[su.id] = Object.assign({}, S.avis[su.id] || {}, row); rv.revealed = true; rv.dirty = false;
    rvResult(); rvChart(); rvRender(); renderBilan();
  }).catch(function (e) { err.textContent = avisErrText(e); err.hidden = false; }).then(function () { if (S.rv === rv) rvBtn(); });
}
$("rv-save").addEventListener("click", rvSave);
/* avis donné par la personne connectée (les avis sans auteur connu ne sont jamais comptés comme les siens) */
function mine(a) { return !!(a && a.auteur && S.user && S.user.id && a.auteur === S.user.id); }
/* effacer un avis : définitif, après confirmation */
$("rv-del").addEventListener("click", function () { this.hidden = true; $("rv-del-confirm").hidden = false; $("rv-del-yes").focus(); });
$("rv-del-yes").addEventListener("click", function () {
  var rv = S.rv, su = rv && rv.su, b = this; if (!su) return; b.disabled = true;
  S.sb.from("backtest_avis").delete().eq("setup_id", su.id).then(function (res) {
    if (res.error) throw res.error;
    delete S.avis[su.id]; rvShow(); rvRender(); renderBilan(); toast("Avis effacé");
  }).catch(function (e) { var err = $("rv-err"); err.textContent = avisErrText(e); err.hidden = false; }).then(function () { b.disabled = false; });
});
$("rv-prev").addEventListener("click", function () { if (S.rv && S.rv.i > 0) { S.rv.i--; rvShow(); } });
$("rv-close").addEventListener("click", rvClose);
$("ov-review").addEventListener("click", function (e) { if (e.target === this) rvClose(); });
/* le graphique reprend les couleurs du thème : bouton de thème ou changement du système */
function rvRetheme() { if (S.rv && !$("ov-review").hidden) setTimeout(rvChart, 30); }
document.addEventListener("click", function (e) { if (e.target.closest && e.target.closest('[data-action="theme"]')) rvRetheme(); });
try { window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", rvRetheme); } catch (e) {}

/* graphique : bougies jusqu'à la décision (puis la suite une fois l'avis donné), zones dessinées par-dessus */
var rvChartObj = null, rvRaf = 0;
function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function rvDestroy() { cancelAnimationFrame(rvRaf); rvRaf = 0; if (rvChartObj) { try { rvChartObj.remove(); } catch (e) {} rvChartObj = null; } }
function rvChart() {
  var rv = S.rv, su = rv && rv.su, box = $("rv-chart"); if (!su) return;
  rvDestroy(); box.textContent = "";
  loadLWC().then(function () { if (S.rv === rv && rv.su === su && !$("ov-review").hidden) draw(); }, function () {
    box.appendChild(el("div", { class: "tx-empty is-compact" }, [el("b", { text: "Graphique indisponible" }), el("span", { text: "La bibliothèque de graphiques n'a pas pu être chargée : vérifiez la connexion internet." })]));
  });
  function draw() {
    var m = S.bt.m, tf = rv.tf, LW = window.LightweightCharts;
    var endI = rv.revealed ? Math.min(m.t.length - 1, Math.max(su.iD, su.out ? su.out.i : su.iD) + 40 * tf) : (su.iE != null ? su.iE - 1 : su.iD); /* avant l'avis : on s'arrête juste avant la minute d'entrée */
    var tStart = Math.max(Math.min(su.ob.t0, su.tL) - 20 * tf, m.t[endI] - 400 * tf), startI = Math.max(0, lastLE(m.t, tStart));
    var B = BT.aggregate(m, tf, startI, endI), wall = B.t.map(function (t) { return BT.nyWall(t) * 60; });
    var col = { text: cssVar("--c-text"), text2: cssVar("--c-text-2"), line: cssVar("--c-line"), panel: cssVar("--c-panel"), pos: cssVar("--c-pos"), neg: cssVar("--c-neg") };
    var chart = LW.createChart(box, { autoSize: true, layout: { background: { type: "solid", color: col.panel }, textColor: col.text2, fontFamily: "IBM Plex Mono, ui-monospace, monospace", fontSize: 11 },
      grid: { vertLines: { color: col.line }, horzLines: { color: col.line } }, rightPriceScale: { borderColor: col.line }, timeScale: { borderColor: col.line, timeVisible: true, secondsVisible: false, rightOffset: 4 },
      crosshair: { mode: 0 }, localization: { locale: "fr-FR", priceFormatter: function (p) { return nf2.format(p); } } });
    rvChartObj = chart;
    var showTrade = su.entry != null && su.risk > 0 && (su.taken || rv.revealed), levels = showTrade ? [su.entry, su.stop, su.tp] : [su.stop];
    var series = chart.addCandlestickSeries({ upColor: col.pos, downColor: col.neg, wickUpColor: col.pos, wickDownColor: col.neg, borderVisible: false, priceLineVisible: false, lastValueVisible: false,
      autoscaleInfoProvider: function (orig) { var r = orig(); if (r && r.priceRange) { r.priceRange.minValue = Math.min.apply(null, levels.concat([r.priceRange.minValue])); r.priceRange.maxValue = Math.max.apply(null, levels.concat([r.priceRange.maxValue])); } return r; } });
    series.setData(B.t.map(function (t, k) { return { time: wall[k], open: B.o[k], high: B.h[k], low: B.l[k], close: B.c[k] }; }));
    function pl(price, color, title, style) { series.createPriceLine({ price: price, color: color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title: title }); }
    if (showTrade) { pl(su.entry, col.text, "Entrée", 0); pl(su.stop, col.neg, "Stop", 2); pl(su.tp, col.pos, "Objectif", 2); }
    if (su.trend && su.trend.level != null) pl(su.trend.level, col.text2, "Cassure " + tfLabel(su.trend.tf), 3);
    /* tendance : étiquette sur le graphique, et trait reliant les deux derniers creux montants (ou sommets descendants) de l'unité de tendance, connus au moment du setup */
    var tr = su.trend, trDir = tr ? tr.dir : 0, trCls = trDir > 0 ? "is-pos" : trDir < 0 ? "is-neg" : "";
    if (tr) box.appendChild(el("div", { class: "pg-rv-badge " + trCls, text: "Tendance " + tfLabel(tr.tf) + " : " + (trDir > 0 ? "haussière" : trDir < 0 ? "baissière" : "pas encore de cassure") }));
    var trPts = null, trImp = false;
    if (trDir) {
      var TB = BT.aggregate(m, tr.tf, Math.max(0, startI - 80 * tr.tf), endI), pts = [], K2 = 2;
      for (var j2 = K2; j2 + K2 < TB.t.length; j2++) {
        if (TB.t[j2] > su.tS) break; var okp = true;
        for (var x2 = j2 - K2; x2 <= j2 + K2; x2++) { if (x2 === j2) continue; if (trDir > 0 ? TB.l[x2] <= TB.l[j2] : TB.h[x2] >= TB.h[j2]) { okp = false; break; } }
        if (okp) pts.push({ t: TB.t[j2], v: trDir > 0 ? TB.l[j2] : TB.h[j2] });
      }
      /* la paire la plus récente de creux montants (ou de sommets descendants), en remontant aussi loin qu'il faut */
      for (var j3 = pts.length - 1; j3 >= 1 && !trPts; j3--) for (var q2 = j3 - 1; q2 >= 0; q2--) if (trDir > 0 ? pts[q2].v < pts[j3].v : pts[q2].v > pts[j3].v) { trPts = [pts[q2], pts[j3]]; break; }
      /* tendance qui vient de tourner, sans droite de soutien possible : segment du dernier creux (ou sommet) à la cassure de structure */
      if (!trPts && tr.t != null && tr.level != null) { var pb = null; for (var q3 = pts.length - 1; q3 >= 0; q3--) if (pts[q3].t <= tr.t) { pb = pts[q3]; break; } if (pb) { trPts = [pb, { t: tr.t - tr.tf, v: tr.level }]; trImp = true; } }
    }
    else pl(su.stop, col.neg, "Stop prévu", 2);
    function barAt(t) { var k = lastLE(B.t, Math.floor(t / tf) * tf); return k < 0 ? null : wall[k]; }
    var mk = [], up = su.dir > 0, tSw = barAt(su.tS);
    if (tSw) mk.push({ time: tSw, position: up ? "belowBar" : "aboveBar", color: col.text2, shape: up ? "arrowUp" : "arrowDown", text: "Liquidité" });
    /* entrée et sortie : des points dessinés au prix exact (plus bas, par-dessus le graphique), pas des repères au-dessus des bougies */
    series.setMarkers(mk.sort(function (a, b) { return a.time - b.time; }));
    var dec = lastLE(B.t, Math.floor((su.tD - 1) / tf) * tf), last = rv.revealed ? B.t.length - 1 : dec;
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, dec - 45), to: Math.max(last, dec) + 8 });
    /* zones : OB, FVG/IFVG et niveau de liquidité pris, recalculés à chaque image (zoom, défilement) */
    var ov = svgEl("svg", { class: "pg-rv-ov", "aria-hidden": "true" }); box.appendChild(ov);
    var defs = svgEl("defs", {}), pat = svgEl("pattern", { id: "pg-hatch", patternUnits: "userSpaceOnUse", width: 6, height: 6 }); pat.appendChild(svgEl("path", { d: "M0 6L6 0", class: "pg-ov-hatch" })); defs.appendChild(pat); ov.appendChild(defs);
    var obR = svgEl("rect", { class: "pg-ov-ob", rx: 2 }), lv = svgEl("line", { class: "pg-ov-l" }), obT = svgEl("text", { class: "pg-ov-t" });
    /* la zone d'entrée : un FVG, un IFVG (hachuré), ou les deux superposés (la partie commune en plein) */
    var parts = su.zone.parts || [su.zone], zRs = parts.map(function (pz) { return svgEl("rect", { class: "pg-ov-z" + (pz.type === "IFVG" ? " is-ifvg" : ""), rx: 2 }); });
    var zTs = parts.map(function (pz) { var t = svgEl("text", { class: "pg-ov-t" }); t.textContent = pz.type + " " + tfLabel(su.tf); return t; });
    var zcR = su.zone.common ? svgEl("rect", { class: "pg-ov-zc", rx: 2 }) : null, zcT = svgEl("text", { class: "pg-ov-t" });
    var out = su.out, xk = out ? (out.kind === "tp" ? "is-pos" : out.kind === "sl" ? "is-neg" : "is-be") : "";
    var eDot = svgEl("circle", { class: "pg-ov-dot", r: 0 }), xDot = svgEl("circle", { class: "pg-ov-dot " + xk, r: 0 });
    function dot(c, show, t, price) { var x = show ? xAt(t) : null, y = show ? series.priceToCoordinate(price) : null; if (x == null || y == null || x < 0 || x > ts.width()) { c.setAttribute("r", 0); return; } c.setAttribute("cx", x); c.setAttribute("cy", y); c.setAttribute("r", 4.5); }
    obT.textContent = "OB " + tfLabel(su.obTf);
    var tl = svgEl("line", { class: "pg-ov-trend " + trCls, opacity: 0 }), tDots = [svgEl("circle", { class: "pg-ov-tdot " + trCls, r: 0 }), svgEl("circle", { class: "pg-ov-tdot " + trCls, r: 0 })];
    [obR].concat(zRs, zcR ? [zcR] : [], [lv, obT], zTs, [tl], tDots, [eDot, xDot]).forEach(function (x) { ov.appendChild(x); });
    var tEnd = rv.revealed ? B.t[B.t.length - 1] : su.tD - 1, ts = chart.timeScale();
    function xAt(t) { var k = lastLE(B.t, t); return ts.logicalToCoordinate(k < 0 ? -1 : k); }
    function box2(r, label, t0, t1, top, bot) {
      var W = ts.width(), half = (ts.options().barSpacing || 6) / 2, x0 = xAt(t0), x1 = xAt(t1), y0 = series.priceToCoordinate(top), y1 = series.priceToCoordinate(bot);
      if (x0 == null || x1 == null || y0 == null || y1 == null) { r.setAttribute("width", 0); label.setAttribute("x", -999); return; }
      x0 = Math.max(0, x0 - half); x1 = Math.min(W, x1 + half);
      r.setAttribute("x", x0); r.setAttribute("y", Math.min(y0, y1)); r.setAttribute("width", Math.max(0, x1 - x0)); r.setAttribute("height", Math.max(1, Math.abs(y1 - y0)));
      label.setAttribute("x", x0 + 4); label.setAttribute("y", Math.min(y0, y1) - 4);
    }
    function frame() {
      if (rvChartObj !== chart) return;
      if ($("ov-review").hidden) { rvDestroy(); return; }
      box2(obR, obT, su.ob.t0, tEnd, su.ob.top, su.ob.bot);
      parts.forEach(function (pz, i) { box2(zRs[i], zTs[i], pz.t0, tEnd, pz.top, pz.bot); });
      if (zcR) box2(zcR, zcT, Math.max(parts[0].t0, parts[1].t0), tEnd, su.zone.common.top, su.zone.common.bot);
      var lx0 = xAt(su.tL), lx1 = xAt(su.tS), ly = series.priceToCoordinate(su.L);
      if (lx0 != null && lx1 != null && ly != null) { lv.setAttribute("x1", Math.max(0, lx0)); lv.setAttribute("x2", Math.min(ts.width(), lx1)); lv.setAttribute("y1", ly); lv.setAttribute("y2", ly); }
      dot(eDot, rv.revealed && showTrade && su.tE, su.tE - 1, su.entry);
      dot(xDot, rv.revealed && out && out.kind !== "fin", out && out.t, out && out.price);
      if (trPts) { /* trait de tendance prolongé jusqu'au bord droit */
        /* un point antérieur à la fenêtre affichée est placé par extrapolation (à gauche du graphique), pour que la droite le traverse */
        var xT = function (t) { return t < B.t[0] ? ts.logicalToCoordinate((t - B.t[0]) / tf) : xAt(t); };
        var ax = xT(trPts[0].t), bx = xT(trPts[1].t), ay = series.priceToCoordinate(trPts[0].v), by2 = series.priceToCoordinate(trPts[1].v), W2 = ts.width();
        if (ax != null && bx != null && ay != null && by2 != null && bx > ax) {
          var ex = trImp ? bx : W2, ey = trImp ? by2 : ay + (by2 - ay) * (W2 - ax) / (bx - ax);
          tl.setAttribute("x1", ax); tl.setAttribute("y1", ay); tl.setAttribute("x2", ex); tl.setAttribute("y2", ey); tl.setAttribute("opacity", 1);
          [[ax, ay], [bx, by2]].forEach(function (p, i) { tDots[i].setAttribute("cx", p[0]); tDots[i].setAttribute("cy", p[1]); tDots[i].setAttribute("r", p[0] >= 0 && p[0] <= W2 ? 3 : 0); });
        } else { tl.setAttribute("opacity", 0); tDots.forEach(function (d) { d.setAttribute("r", 0); }); }
      }
      rvRaf = requestAnimationFrame(frame);
    }
    frame();
    box.setAttribute("aria-label", "Graphique " + tfLabel(tf) + " jusqu'à " + (rv.revealed ? "la fin du trade" : "la décision du robot") + " : OB " + tfLabel(su.obTf) + " entre " + nf2.format(su.ob.bot) + " et " + nf2.format(su.ob.top) + ", liquidité prise à " + nf2.format(su.L) + ", " + zoneName(su.zone) + " entre " + nf2.format(su.zone.bot) + " et " + nf2.format(su.zone.top) + (showTrade ? ", entrée " + nf2.format(su.entry) + ", stop " + nf2.format(su.stop) + ", objectif " + nf2.format(su.tp) : "") + ".");
  }
}

/* test de contrôle : une seule fois par marché et par version des règles, sur la période jamais utilisée pour régler.
   La base n'accepte que l'ajout d'un résultat (ni modification ni suppression) : le résultat n'est montré qu'une fois enregistré. */
function ctlId(m) { return m + "|" + rulesLabel(); }
function loadCtl() {
  return fetchAll("backtest_controles", "created_at").then(function (rows) { S.ctl = rows; S.ctlErr = null; }, function (e) {
    var msg = String(e && (e.message || e.code) || "");
    S.ctl = []; S.ctlErr = /backtest_controles|relation|schema cache|PGRST205|42P01/i.test(msg) ? "La table des tests de contrôle n'existe pas encore : collez la migration supabase/migrations/2026-11-16_backtest-controles.sql dans l'éditeur SQL de Supabase." : hiErrText(e);
  }).then(function () { if (S.tab === "backtest") renderCtl(); });
}
function renderCtl() {
  var m = $("bt-market").value, e = S.hiIdx && S.hiIdx.markets[m], ks = ctlMonths(e), done = (S.ctl || []).find(function (r) { return r.id === ctlId(m); });
  $("bt-ctl-sub").textContent = "Période de contrôle : à partir de " + mLong(BT.RULES.controlFrom) + " · règles " + rulesLabel();
  var go = $("bt-ctl-go"), st = $("bt-ctl-status");
  go.disabled = !m || !ks.length || !!done || !!S.ctlErr || !!S.ctlBusy || !S.ctl;
  if (!S.ctlBusy) {
    st.className = "tx-help" + (S.ctlErr ? " is-error" : "");
    st.textContent = S.ctlErr ? S.ctlErr : !m ? "" : done ? "Test déjà fait pour " + m + " avec les règles " + rulesLabel() + " (résultat ci-dessous). Un nouveau test demandera une nouvelle version des règles."
      : !ks.length ? "Aucune donnée de " + m + " à partir de " + mLong(BT.RULES.controlFrom) + " : rien à tester pour l'instant."
      : "Disponible pour " + m + " : " + mLong(ks[0]) + " à " + mLong(ks[ks.length - 1]) + ". À lancer seulement quand les règles sont définitives.";
  }
  var rows = S.ctl || [], tb = $("bt-ctl-body"); tb.textContent = ""; $("bt-ctl-table").hidden = !rows.length;
  rows.slice().reverse().forEach(function (r) {
    var x = r.resultat || {};
    tb.appendChild(el("tr", {}, [el("td", { "data-l": "Marché", text: r.marche }), el("td", { "data-l": "Règles", text: r.regles }), el("td", { "data-l": "Période", text: r.periode }),
      el("td", { class: "r tx-num", "data-l": "Trades", text: x.n == null ? "—" : nf0.format(x.n) }), el("td", { class: "r tx-num", "data-l": "Réussite", text: x.wr == null ? "—" : pct(x.wr) }),
      el("td", { class: "r tx-num " + cls(x.sum || 0), "data-l": "Résultat", text: x.sum == null ? "—" : rfmt(x.sum) }), el("td", { class: "r tx-num " + cls(x.avg || 0), "data-l": "R moyen", text: x.avg == null ? "—" : rfmt(x.avg) }),
      el("td", { class: "r tx-num", "data-l": "Drawdown", text: x.maxdd == null ? "—" : "−" + nf2.format(x.maxdd) + " R" }), el("td", { class: "tx-num", "data-l": "Fait le", text: r.created_at ? frDate(String(r.created_at).slice(0, 10)) : "—" })]));
  });
}
$("bt-ctl-go").addEventListener("click", function () {
  var m = $("bt-market").value; $("bt-ctl-q").textContent = "Lancer le test de contrôle de " + m + " avec les règles " + rulesLabel() + " ? Il ne pourra pas être refait avec ces règles.";
  this.hidden = true; $("bt-ctl-confirm").hidden = false; $("bt-ctl-yes").focus();
});
$("bt-ctl-no").addEventListener("click", function () { $("bt-ctl-confirm").hidden = true; $("bt-ctl-go").hidden = false; $("bt-ctl-go").focus(); });
$("bt-ctl-yes").addEventListener("click", function () {
  var m = $("bt-market").value, e = S.hiIdx && S.hiIdx.markets[m], ks = ctlMonths(e), st = $("bt-ctl-status"), msg = null;
  $("bt-ctl-confirm").hidden = true; $("bt-ctl-go").hidden = false;
  if (!ks.length || (S.ctl || []).some(function (r) { return r.id === ctlId(m); })) { renderCtl(); return; }
  S.ctlBusy = true; renderCtl(); st.className = "tx-help"; st.textContent = "Chargement des bougies de contrôle : 0 mois sur " + ks.length + "…";
  btLoad(m, ks, function (d) { st.textContent = "Chargement des bougies de contrôle : " + d + " mois sur " + ks.length + "…"; }).then(function (data) {
    if (!data.t.length) throw new Error("vide");
    st.textContent = "Calcul du test de contrôle…";
    return new Promise(function (ok) { setTimeout(function () { ok(BT.run(data, { market: m, zones: $("bt-zones").value, trend: $("bt-trend").value })); }, 40); });
  }).then(function (res) {
    var s = res.stats, row = { id: ctlId(m), marche: m, regles: res.rules, periode: mLong(ks[0]) + " à " + mLong(ks[ks.length - 1]),
      resultat: { n: s.n, setups: res.setups.length, win: s.win, loss: s.loss, be: s.be, wr: s.wr, sum: r2(s.sum), avg: s.avg == null ? null : Math.round(s.avg * 1000) / 1000, maxdd: r2(s.maxdd), worst: s.worst } };
    /* le résultat n'est montré qu'une fois enregistré : sans enregistrement, rien n'est affiché */
    return S.sb.from("backtest_controles").insert(row).then(function (r) { if (r.error) throw r.error; return loadCtl(); }).then(function () {
      msg = ["tx-help is-ok", "Test de contrôle enregistré pour " + m + " (règles " + res.rules + ") : résultat ci-dessous."];
    });
  }).catch(function (err) {
    msg = ["tx-help is-error", err && err.message === "vide" ? "Aucune bougie dans la période de contrôle." : /duplicate|unique|23505/i.test(String(err && (err.message || err.code))) ? "Ce test a déjà été fait par l'autre associé : résultat ci-dessous." : "Test non enregistré, donc non affiché : " + hiErrText(err)];
    return loadCtl();
  }).then(function () { S.ctlBusy = false; renderCtl(); if (msg) { st.className = msg[0]; st.textContent = msg[1]; } });
});

/* bilan des avis et export */
function renderBilan() {
  var box = $("bt-bilan"); box.textContent = "";
  if (S.avisErr) { box.appendChild(el("div", { class: "tx-empty is-compact" }, [el("b", { text: "Avis inaccessibles" }), el("span", { text: S.avisErr })])); $("bt-export").disabled = true; return; }
  var rows = Object.keys(S.avis).map(function (k) { return S.avis[k]; }); $("bt-export").disabled = !rows.length;
  if (!rows.length) { box.appendChild(el("div", { class: "tx-empty is-compact" }, [el("b", { text: "Aucun avis pour l'instant" }), el("span", { text: "Lancez un backtest, puis ouvrez un setup de la revue pour donner votre avis." })])); return; }
  function isRobot(r) { return /^pris/.test(r.robot); }
  function avg(list) { var v = list.filter(function (r) { return r.r_robot != null && isFinite(Number(r.r_robot)); }).map(function (r) { return Number(r.r_robot); }); return v.length ? { n: v.length, a: v.reduce(function (s, x) { return s + x; }, 0) / v.length } : null; }
  var robot = rows.filter(isRobot), acc = robot.filter(function (r) { return r.avis !== "refuse"; }), ref = robot.filter(function (r) { return r.avis === "refuse"; });
  var missed = rows.filter(function (r) { return !isRobot(r) && r.avis !== "refuse"; }), agree = acc.length + rows.filter(function (r) { return !isRobot(r) && r.avis === "refuse"; }).length;
  var aA = avg(acc), aR = avg(ref), aM = avg(missed), k = el("section", { class: "tx-stats", "aria-label": "Bilan des avis" });
  kpi(k, "Avis donnés", String(rows.length), "", robot.length + " sur des trades du robot");
  kpi(k, "Accord avec le robot", pct(agree / rows.length, 0), "", agree + " sur " + rows.length);
  kpi(k, "Trades acceptés", aA ? rfmt(aA.a) : "—", aA ? cls(aA.a) : "", aA ? "R moyen sur " + aA.n + " trade" + (aA.n > 1 ? "s" : "") : "Aucun pour l'instant");
  kpi(k, "Trades refusés", aR ? rfmt(aR.a) : "—", aR ? cls(aR.a) : "", aR ? "R moyen qu'ils auraient fait (" + aR.n + ")" : "Aucun pour l'instant");
  kpi(k, "Annulés que vous auriez pris", String(missed.length), "", aM ? "R moyen si pris : " + rfmt(aM.a) : "—");
  box.appendChild(k);
  var msg = !aA || !aR || aA.n < 5 || aR.n < 5 ? "Encore trop peu d'avis pour conclure : il faut au moins 5 trades acceptés et 5 refusés."
    : aR.a < aA.a ? "Les trades que vous refusez font en moyenne " + rfmt(aR.a) + ", contre " + rfmt(aA.a) + " pour ceux que vous acceptez : votre jugement améliore le résultat. Il faut le traduire en règle (voir les raisons ci-dessous)."
    : "Les trades que vous refusez font en moyenne " + rfmt(aR.a) + ", contre " + rfmt(aA.a) + " pour ceux que vous acceptez : pour l'instant, vos refus n'améliorent pas le résultat.";
  box.appendChild(el("p", { class: "tx-sub", style: "margin:var(--sp-3) 0 0", text: msg }));
  var cnt = {}; rows.forEach(function (r) { if (r.avis === "refuse" && r.raison) cnt[r.raison] = (cnt[r.raison] || 0) + 1; });
  var keys = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; });
  if (keys.length) {
    box.appendChild(el("div", { class: "tx-group tx-label", style: "margin:var(--sp-4) 0 var(--sp-1)", text: "Raisons de refus" }));
    var lst = el("div", { class: "pg-list" }); keys.forEach(function (x) { lst.appendChild(el("div", { class: "it" }, [el("span", { text: raisonLabel(x) }), el("span"), el("span", { class: "tx-num", text: String(cnt[x]) })])); }); box.appendChild(lst);
  }
}
/* effacer tous ses propres avis (ceux de l'autre associé restent), après confirmation */
function wipeMsg(cls, text) { var p = $("bt-wipe-status"); p.className = "tx-help" + (cls ? " " + cls : ""); p.textContent = text; p.hidden = !text; }
$("bt-wipe").addEventListener("click", function () {
  var n = Object.keys(S.avis).filter(function (k) { return mine(S.avis[k]); }).length; wipeMsg("", "");
  if (!n) { wipeMsg("", "Aucun avis donné par vous pour l'instant."); return; }
  $("bt-wipe-q").textContent = "Effacer les " + n + " avis que vous avez donnés ? Ceux de l'autre associé sont conservés. C'est définitif.";
  $("bt-wipe-confirm").hidden = false; $("bt-wipe-yes").focus();
});
$("bt-wipe-no").addEventListener("click", function () { $("bt-wipe-confirm").hidden = true; });
$("bt-wipe-yes").addEventListener("click", function () {
  var b = this, n = Object.keys(S.avis).filter(function (k) { return mine(S.avis[k]); }).length; b.disabled = true;
  S.sb.from("backtest_avis").delete().eq("auteur", S.user.id).then(function (res) {
    if (res.error) throw res.error;
    $("bt-wipe-confirm").hidden = true; wipeMsg("is-ok", n + " avis effacé" + (n > 1 ? "s" : "") + ". Ceux de l'autre associé sont conservés.");
    return loadAvis();
  }).catch(function (e) { wipeMsg("is-error", avisErrText(e)); }).then(function () { b.disabled = false; });
});
$("bt-export").addEventListener("click", function () {
  var rows = Object.keys(S.avis).map(function (k) { return S.avis[k]; }); if (!rows.length) return;
  var cols = ["setup_id", "marche", "regles", "date_ny", "sens", "tendance", "unite_liquidite", "unite_ob", "bougies_ob", "ob_fvg", "profondeur_creux", "zone", "taille_zone_atr", "robot", "raison_robot", "avis", "raison", "note", "entree", "stop", "objectif", "sortie", "r_robot"];
  function q(v) { v = v == null ? "" : String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  var lines = [cols.join(";")].concat(rows.map(function (r) {
    var d = r.details || {}, f = { setup_id: r.setup_id, marche: r.marche, regles: r.regles, robot: r.robot, avis: r.avis, raison: raisonLabel(r.raison), note: r.note, r_robot: r.r_robot };
    return cols.map(function (c) { var v = c in f ? f[c] : d[c]; return q(typeof v === "number" ? String(v).replace(".", ",") : v); }).join(";");
  }));
  download("tradamax-avis-backtest-" + todayISO() + ".csv", lines.join("\n"));
});

/* ---------------- accueil : le mois en cours en bento (direction A du design lab) ---------------- */
/* Compte réel par défaut (comme le bandeau de séance), ou tous les comptes. Les exemples s'affichent tant qu'aucun trade n'est enregistré. */
var SES_SHORT = { London: "Londres", NYAM: "NY matin", NYPM: "NY après-midi", Out: "Hors session" };
var SES_KEYS = ["London", "NYAM", "NYPM", "Out"];
var REDUCED = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
function sesKey(t) { return SES_SHORT[t.window] ? t.window : "Out"; }
function isoAdd(iso, days) { var p = iso.split("-").map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2] + days)).toISOString().slice(0, 10); }
function isoWd(iso) { var p = iso.split("-").map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay(); }
function isoWeek(iso) { var p = iso.split("-").map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2])); d.setUTCDate(d.getUTCDate() + 3 - (d.getUTCDay() + 6) % 7); var y = new Date(Date.UTC(d.getUTCFullYear(), 0, 4)); return 1 + Math.round(((d - y) / 864e5 - 3 + (y.getUTCDay() + 6) % 7) / 7); }
function prevMonth(k) { var y = Number(k.slice(0, 4)), m = Number(k.slice(5)) - 1; if (!m) { m = 12; y--; } return y + "-" + String(m).padStart(2, "0"); }
function spct(v, d) { return (v > 0 ? "+" : v < 0 ? "−" : "") + pct(Math.abs(v), d); }
function cap1(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function plural(n, w) { return n + " " + w + (n > 1 ? "s" : ""); }
function int(v) { return String(Math.round(v)); }
/* chiffre clé : écrit tout de suite, puis compté depuis zéro à l'arrivée sur la page (homeCount) */
function hmNum(id, v, f, c) { var e = $(id); if (e._tw) { e._tw.kill(); e._tw = null; } e._v = v; e._f = f; e.textContent = v == null ? "—" : f(v); e.className = e.className.split(" ")[0] + (c ? " " + c : ""); }
function hmDelta(id, text, c) { var e = $(id); e.hidden = !text; e.textContent = text || ""; e.className = "tx-delta" + (c ? " " + c : ""); }
function hmNote(id, bold, text) { var p = $(id); p.textContent = ""; if (!bold && !text) return; p.appendChild(icon("i-info")); p.appendChild(el("span", {}, [bold ? el("b", { text: bold }) : null, bold && text ? " " : null, text || null])); }
function renderHome() {
  var today = todayISO(), mk = today.slice(0, 7), pk = prevMonth(mk), mName = MOIS[Number(mk.slice(5)) - 1], pName = MOIS[Number(pk.slice(5)) - 1];
  var real = S.homeAcc !== "all", names = sasNames();
  var all = source().filter(function (t) { return !real || names.indexOf(t.account) >= 0; }).slice().sort(byDT);
  var inM = all.filter(function (t) { return t.date.slice(0, 7) === mk; }), inP = all.filter(function (t) { return t.date.slice(0, 7) === pk; });
  var stM = stats(inM, null, []), stP = stats(inP, null, []);
  $("hm-badge").hidden = !S.useSample;
  $("hm-scope").textContent = (real ? (names.length ? names.join(", ") : "Aucun compte réel dans les Réglages") : "Tous les comptes") + " · " + mName + " " + mk.slice(0, 4);
  document.querySelectorAll("#hm-acc button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.v === (real ? "sas" : "all"))); });

  /* résultat du mois ; rendement sur le capital du compte réel au 1er du mois (ajouts et retraits compris) */
  var capStart = null, first = mk + "-01";
  if (real && names.length) {
    var cap = names.reduce(function (a, n) { return a + (accCap(n) || 0); }, 0) || null;
    if (cap) { var mv = names.reduce(function (a, n) { return a.concat(accMoves(n)); }, []);
      capStart = stats(all.filter(function (t) { return t.date < first; }), cap, mv.filter(function (m) { return String(m.date) < first; })).cur; }
  }
  hmNum("hm-res", stM.n ? stM.total : null, seur, cls(stM.total));
  hmDelta("hm-res-d", stM.n && capStart > 0 ? spct(stM.total / capStart) : "", stM.total > 0 ? "is-pos" : stM.total < 0 ? "is-neg" : "");
  $("hm-res-h").textContent = stM.n ? plural(stM.n, "trade") + " en " + mName : "Aucun trade en " + mName;
  hmNum("hm-r", stM.avgR, rfmt, cls(stM.avgR || 0));
  var dR = stM.avgR != null && stP.avgR != null ? stM.avgR - stP.avgR : null;
  hmDelta("hm-r-d", dR == null ? "" : rfmt(dR).replace(" R", ""), "");
  $("hm-r-h").textContent = stP.avgR != null ? cap1(pName) + " : " + rfmt(stP.avgR) : stM.rs.length ? plural(stM.rs.length, "trade") + " avec risque renseigné" : "Renseignez le risque des trades";
  function planOf(ts) { return ts.length ? ts.filter(function (t) { return t.plan; }).length / ts.length : null; }
  var pM = planOf(inM), pP = planOf(inP), dP = pM != null && pP != null ? Math.round((pM - pP) * 100) : null;
  hmNum("hm-plan", pM, function (v) { return pct(v, 0); });
  hmDelta("hm-plan-d", dP == null ? "" : (dP > 0 ? "+" : dP < 0 ? "−" : "") + Math.abs(dP) + " pts", "");
  $("hm-plan-h").textContent = pP != null ? cap1(pName) + " : " + pct(pP, 0) : stM.n ? "Plan suivi sur " + inM.filter(function (t) { return t.plan; }).length + " trades sur " + stM.n : "Aucun trade en " + mName;

  /* activité des sept dernières semaines : nombre de trades par jour ouvré, puis répartition par session */
  var mon = isoAdd(today, -((isoWd(today) + 6) % 7)), start = isoAdd(mon, -42), r7 = all.filter(function (t) { return t.date >= start && t.date <= today; });
  var cnt = {}, perWd = [0, 0, 0, 0, 0], hb = $("hm-heat"); r7.forEach(function (t) { cnt[t.date] = (cnt[t.date] || 0) + 1; });
  hb.textContent = ""; hb.appendChild(el("span", { class: "rl" }));
  ["Lun", "Mar", "Mer", "Jeu", "Ven"].forEach(function (d) { hb.appendChild(el("span", { class: "cl", text: d })); });
  for (var w = 0; w < 7; w++) {
    var ws = isoAdd(start, w * 7); hb.appendChild(el("span", { class: "rl", text: "S" + isoWeek(ws) }));
    for (var d = 0; d < 5; d++) { var iso = isoAdd(ws, d), c = cnt[iso] || 0, fut = iso > today; perWd[d] += c;
      hb.appendChild(el("i", { class: "c " + (fut ? "is-fut" : "h" + Math.min(c, 3)), title: frDate(iso) + " : " + (fut ? "à venir" : c ? plural(c, "trade") : "aucun trade") })); }
  }
  var busy = perWd.indexOf(Math.max.apply(null, perWd));
  hb.setAttribute("aria-label", "Trades par jour ouvré sur les sept dernières semaines : " + plural(r7.length, "trade") + (r7.length ? ", jour le plus chargé : le " + JOURS[busy + 1] : ""));
  var bySes = {}; r7.forEach(function (t) { var k = sesKey(t); bySes[k] = (bySes[k] || 0) + 1; });
  var keys = SES_KEYS.filter(function (k) { return bySes[k]; }), sb = $("hm-split"), sl = $("hm-split-l");
  sb.textContent = ""; sl.textContent = ""; sl.style.setProperty("--n", Math.max(1, keys.length));
  keys.forEach(function (k) { var sh = bySes[k] / r7.length;
    sb.appendChild(el("i", { class: "s-" + k, style: "width:" + (sh * 100).toFixed(1) + "%" }));
    sl.appendChild(el("div", {}, [el("b", { text: pct(sh, 0) }), el("span", {}, [el("i", { class: "s-" + k }), SES_SHORT[k]])])); });
  if (!r7.length) hmNote("hm-heat-note", "Aucun trade", "sur les sept dernières semaines.");
  else { var top = keys.slice().sort(function (a, b) { return bySes[b] - bySes[a]; })[0];
    hmNote("hm-heat-note", "Lecture.", (top === "Out" ? "Les trades hors session représentent " : "La session " + SES_SHORT[top] + " concentre ") + pct(bySes[top] / r7.length, 0) + " des trades. Le " + JOURS[busy + 1] + " est le jour le plus chargé."); }
  S.hmR7 = r7; drawHomeEq(r7);

  /* gagnants et perdants du mois */
  hmNum("hm-w", stM.n ? stM.w : null, int, "tx-pos"); hmNum("hm-l", stM.n ? stM.l : null, int, "tx-neg");
  [[".is-pos", stM.w], [".is-neg", stM.l]].forEach(function (x) { var col = $("hm-cmp").querySelector(x[0]), on = stM.n ? Math.round(x[1] / stM.n * 10) : 0; col.textContent = ""; for (var i = 0; i < 10; i++) col.appendChild(el("i", { class: i < on ? "on" : "" })); });
  var lossR = inM.filter(function (t) { return t.pnl < 0; }).map(rOf).filter(function (r) { return r != null; });
  if (!stM.n) hmNote("hm-cmp-note", "Aucun trade", "en " + mName + " pour l'instant.");
  else hmNote("hm-cmp-note", "Réussite " + pct(stM.wr, 0) + ".", lossR.length ? "Perte moyenne " + rfmt(lossR.reduce(function (a, b) { return a + b; }, 0) / lossR.length) + "." : stM.avgL ? "Perte moyenne " + eur(stM.avgL) + "." : "Aucune perte ce mois-ci.");

  /* note du mois : la session qui porte le plus de gains, et le respect du plan dans cette session */
  var gains = {}, totG = 0, say = $("hm-say"), share = 0; say.textContent = "";
  inM.forEach(function (t) { var p = Number(t.pnl) || 0; if (p > 0) { var k = sesKey(t); gains[k] = (gains[k] || 0) + p; totG += p; } });
  if (!stM.n) { var nw = nextWindow(new Date()); say.textContent = "Aucun trade en " + mName + " pour l'instant." + (!nw ? "" : nw.live ? " La fenêtre " + nw.w.label + " est en cours." : " Prochaine fenêtre : " + nw.w.label + " à " + fmtParisTime.format(nw.start) + "."); }
  else if (!totG) { var pn = inM.filter(function (t) { return t.plan; }).length; share = pn / stM.n; say.textContent = "Pas encore de gain ce mois-ci. Le plan a été suivi sur " + pn + " trade" + (pn > 1 ? "s" : "") + " sur " + stM.n + "."; }
  else {
    var best = Object.keys(gains).sort(function (a, b) { return gains[b] - gains[a]; })[0], sesT = inM.filter(function (t) { return sesKey(t) === best; }), sp = sesT.filter(function (t) { return t.plan; }).length;
    share = gains[best] / totG;
    say.appendChild(document.createTextNode(best === "Out" ? "Les trades hors session portent " : "La session " + SES_SHORT[best] + " porte "));
    say.appendChild(el("span", { class: "pg-bn-pill tx-num", text: pct(share, 0) }));
    say.appendChild(document.createTextNode(" des gains du mois, plan suivi sur " + sp + " trade" + (sp > 1 ? "s" : "") + " sur " + sesT.length + "."));
  }
  var sg = $("hm-segs"), onS = Math.round(share * 12); sg.textContent = ""; for (var s12 = 0; s12 < 12; s12++) sg.appendChild(el("i", { class: s12 < onS ? "on" : "" }));

  /* répartition des trades du mois par marché (au-delà de quatre, le reste dans « Autres ») */
  var byM = {}; inM.forEach(function (t) { var k = t.market || "—"; (byM[k] = byM[k] || { n: 0, p: 0 }).n++; byM[k].p += Number(t.pnl) || 0; });
  var mks = Object.keys(byM).sort(function (a, b) { return byM[b].n - byM[a].n; });
  if (mks.length > 4) { var rest = { n: 0, p: 0 }; mks.slice(3).forEach(function (k) { rest.n += byM[k].n; rest.p += byM[k].p; }); mks = mks.slice(0, 3); byM.Autres = rest; mks.push("Autres"); }
  $("hm-mix-tag").textContent = cap1(mName);
  hmNum("hm-mix-n", stM.n, int);
  var dn = $("hm-donut"), acc = 0, gap = mks.length > 1 ? 1.6 : 0; dn.textContent = "";
  dn.appendChild(svgEl("circle", { class: "trk", cx: 60, cy: 60, r: 50, pathLength: 100 }));
  mks.forEach(function (k, i) { var sh = byM[k].n / stM.n * 100;
    dn.appendChild(svgEl("circle", { class: "seg m" + i, cx: 60, cy: 60, r: 50, pathLength: 100, "stroke-dasharray": Math.max(0, sh - gap).toFixed(2) + " " + (100 - sh + gap).toFixed(2), "stroke-dashoffset": (-acc).toFixed(2) })); acc += sh; });
  dn.setAttribute("aria-label", stM.n ? "Trades du mois par marché : " + mks.map(function (k) { return k + " " + pct(byM[k].n / stM.n, 0); }).join(", ") : "Aucun trade ce mois-ci");
  var dl = $("hm-mix-list"); dl.textContent = "";
  mks.forEach(function (k, i) { dl.appendChild(el("dt", {}, [el("i", { class: "m" + i }), k])); dl.appendChild(el("dd", { text: pct(byM[k].n / stM.n, 0) })); });
  if (mks.length) hmNote("hm-mix-note", "Note.", mks[0] + " représente " + pct(byM[mks[0]].n / stM.n, 0) + " des trades du mois, pour un résultat de " + seur(byM[mks[0]].p) + ".");
  else hmNote("hm-mix-note", "Aucun trade", "en " + mName + " pour l'instant.");

  /* palier de drawdown : toujours le compte réel, comme le bandeau de séance ; arc dans la couleur de l'état */
  var capS = names.reduce(function (a, n) { return a + (accCap(n) || 0); }, 0) || null;
  var mine = source().filter(function (t) { return names.indexOf(t.account) >= 0; }).sort(byDT);
  var sd = stats(mine, capS, names.reduce(function (a, n) { return a.concat(accMoves(n)); }, []));
  var okDD = !!(names.length && mine.length && sd.ddNow != null), dd = okDD ? sd.ddNow : 0, st = ddState(dd), badge = $("hm-dd-b");
  $("hm-dd-card").className = "pg-bn pg-bn-dd" + (okDD ? " is-" + st.k : "");
  hmNum("hm-dd-v", okDD ? dd : null, function (v) { return v > 0 ? "−" + pct(v) : pct(0); });
  badge.hidden = !okDD; badge.className = "tx-badge " + { ok: "is-pos", caution: "is-warn", stop: "is-neg" }[st.k];
  badge.textContent = st.lvl ? "Palier −" + Math.round(st.lvl.p * 100) + " % · " + st.lvl.l : "Normal";
  $("hm-dd-h").textContent = !names.length ? "Aucun compte réel dans les Réglages" : !mine.length ? "Aucun trade sur le compte réel" : sd.ddNow == null ? "Capital du compte réel à renseigner" : "Compte réel, depuis son plus haut historique";
  var arc = $("hm-dd"), N = 21, onN = okDD && dd > 0 ? Math.max(1, Math.round(Math.min(1, dd / GAUGE_MAX) * N)) : 0, cx = 120, cy = 124; arc.textContent = "";
  function ang(f) { return (-100 + 200 * f) * Math.PI / 180; }
  for (var j = 0; j < N; j++) { var a = ang(j / (N - 1));
    arc.appendChild(svgEl("line", { class: j < onN ? "on" : "", x1: (cx + 78 * Math.sin(a)).toFixed(1), y1: (cy - 78 * Math.cos(a)).toFixed(1), x2: (cx + 100 * Math.sin(a)).toFixed(1), y2: (cy - 100 * Math.cos(a)).toFixed(1) })); }
  PALIERS.forEach(function (p) { var a = ang(p.p / GAUGE_MAX), t = svgEl("text", { x: (cx + 118 * Math.sin(a)).toFixed(1), y: (cy - 118 * Math.cos(a) + 4).toFixed(1), "text-anchor": "middle" }); t.textContent = "−" + Math.round(p.p * 100) + " %"; arc.appendChild(t); });
  arc.setAttribute("aria-label", okDD ? "Drawdown du compte réel : " + $("hm-dd-v").textContent + ", " + badge.textContent : "Drawdown du compte réel indisponible");

  if (H.pend && S.loaded && H.ctx) { H.pend = false; homeCount(); }
  homeGo(H.seq);
}
/* courbe des sept dernières semaines : pastille sur le plus haut, qui suit le pointeur */
function drawHomeEq(ts) {
  var box = $("hm-eq"); box.textContent = "";
  var tot = ts.reduce(function (a, t) { return a + (Number(t.pnl) || 0); }, 0);
  hmNum("hm-eq-v", ts.length ? tot : null, seur, cls(tot));
  $("hm-eq-h").textContent = ts.length ? plural(ts.length, "trade") + " · 7 semaines" : "7 semaines";
  var W = Math.max(260, box.clientWidth || 600), H = W < 480 ? 190 : 224, pl = 2, pr = 56, pt = 42, pb = 26;
  var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, height: H, role: "img", "aria-label": ts.length ? "Résultat cumulé sur sept semaines : " + seur(tot) + " en " + plural(ts.length, "trade") : "Aucun trade sur sept semaines" });
  box.appendChild(svg);
  if (!ts.length) { var e = svgEl("text", { x: W / 2, y: H / 2, "text-anchor": "middle", class: "empty" }); e.textContent = "La courbe apparaîtra après le premier trade"; svg.appendChild(e); return; }
  var pts = [{ cum: 0, t: null }], cum = 0; ts.forEach(function (t) { cum += Number(t.pnl) || 0; pts.push({ cum: cum, t: t }); });
  var vals = pts.map(function (p) { return p.cum; }), mn = Math.min(0, Math.min.apply(null, vals)), mx = Math.max(0, Math.max.apply(null, vals));
  if (mx === mn) mx += 1; var padv = (mx - mn) * .08; mn -= padv; mx += padv;
  var n = pts.length - 1, x = function (i) { return pl + (W - pl - pr) * i / n; }, y = function (v) { return pt + (H - pt - pb) * (1 - (v - mn) / (mx - mn)); };
  var grid = svgEl("g", { class: "grid" }); svg.appendChild(grid);
  niceTicks(mn, mx, 4).forEach(function (v) {
    var ln = svgEl("line", { x1: pl, x2: W - pr, y1: y(v), y2: y(v) }); if (v === 0) ln.setAttribute("class", "zero"); grid.appendChild(ln);
    var t = svgEl("text", { x: W - pr + 10, y: y(v) + 4 }); t.textContent = seur(v).replace(" €", ""); svg.appendChild(t);
  });
  var line = pts.map(function (p, k) { return (k ? "L" : "M") + x(k).toFixed(1) + " " + y(p.cum).toFixed(1); }).join(" ");
  var hi = 1; for (var k = 2; k <= n; k++) if (pts[k].cum > pts[hi].cum) hi = k;
  var cap = svgEl("rect", { class: "cap", width: 18, rx: 9 }); svg.appendChild(cap);
  svg.appendChild(svgEl("path", { d: line + " L" + x(n).toFixed(1) + " " + y(mn).toFixed(1) + " L" + x(0) + " " + y(mn).toFixed(1) + " Z", class: "area" }));
  svg.appendChild(svgEl("path", { d: line, class: "line" }));
  svg.appendChild(svgEl("circle", { cx: x(n), cy: y(pts[n].cum), r: 9, class: "halo" }));
  svg.appendChild(svgEl("circle", { cx: x(n), cy: y(pts[n].cum), r: 4.5, class: "dot" }));
  (n > 1 ? [1, n] : [n]).forEach(function (k, j, arr) { var t = svgEl("text", { x: x(k), y: H - 6, "text-anchor": arr.length > 1 && !j ? "start" : "end" }); t.textContent = frDate(pts[k].t.date); svg.appendChild(t); });
  var pill = svgEl("rect", { class: "pill", height: 24, rx: 12 }), pillT = svgEl("text", { class: "pill-t", "text-anchor": "middle" }), hd = svgEl("circle", { class: "dot", r: 4 });
  svg.appendChild(hd); svg.appendChild(pill); svg.appendChild(pillT);
  function place(k, hover) {
    var p = pts[k], px = x(k), py = y(p.cum), label = seur(p.cum) + (hover ? " · " + frDate(p.t.date) : ""), pw = label.length * 7.3 + 20, cxp = Math.max(pw / 2 + 2, Math.min(W - pw / 2 - 2, px));
    cap.setAttribute("x", (px - 9).toFixed(1)); cap.setAttribute("y", (py - 4).toFixed(1)); cap.setAttribute("height", Math.max(0, H - pb - py + 4).toFixed(1));
    pill.setAttribute("x", (cxp - pw / 2).toFixed(1)); pill.setAttribute("y", (py - 36).toFixed(1)); pill.setAttribute("width", pw.toFixed(1));
    pillT.setAttribute("x", cxp.toFixed(1)); pillT.setAttribute("y", (py - 19.5).toFixed(1)); pillT.textContent = label;
    hd.setAttribute("cx", px.toFixed(1)); hd.setAttribute("cy", py.toFixed(1));
  }
  place(hi, false);
  var ov = svgEl("rect", { x: pl, y: 0, width: W - pl - pr, height: H, fill: "transparent" }); svg.appendChild(ov);
  function move(ev) { var r = svg.getBoundingClientRect(), k = Math.round(((ev.clientX - r.left) * W / r.width - pl) / (W - pl - pr) * n); place(Math.max(1, Math.min(n, k)), true); }
  ov.addEventListener("pointermove", move); ov.addEventListener("pointerdown", move);
  ov.addEventListener("pointerleave", function () { place(hi, false); });
}

/* Mouvement de l'accueil : GSAP (titre, cartes, chiffres qui comptent, plateau qui se redresse) et Lenis (défilement doux).
   Chargés à la demande depuis jsDelivr, versions épinglées, actifs seulement sur l'accueil et jamais avec le mouvement réduit. */
var MOTION_JS = ["https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js", "https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/ScrollTrigger.min.js",
  "https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/SplitText.min.js", "https://cdn.jsdelivr.net/npm/lenis@1.3.27/dist/lenis.min.js"];
var H = { seq: 0, ctx: null, pend: false, ready: false, late: false, tm: null, delay: 0 };
function loadJS(u) { return new Promise(function (ok, ko) { var s = document.createElement("script"); s.src = u; s.onload = ok; s.onerror = function () { s.remove(); ko(new Error(u)); }; document.head.appendChild(s); }); }
function loadMotion() {
  if (!loadMotion.p) {
    loadMotion.p = (window.gsap ? Promise.resolve() : loadJS(MOTION_JS[0])).then(function () { return Promise.all(MOTION_JS.slice(1).map(loadJS)); })
      .then(function () { gsap.registerPlugin(ScrollTrigger, SplitText); gsap.ticker.lagSmoothing(0); });
    loadMotion.p.catch(function () { loadMotion.p = null; });
  }
  return loadMotion.p;
}
/* La page reste masquée le temps de charger les bibliothèques et les trades (1,2 s au plus), pour que l'entrée se joue en entier. */
function homeEnter() {
  var seq = ++H.seq; H.ready = false; H.late = false; H.pend = false; H.delay = M.navDelay || 0;
  if (REDUCED) return;
  document.body.classList.add("pg-pre-home");
  clearTimeout(H.tm);
  H.tm = setTimeout(function () { if (seq !== H.seq) return; H.late = true; document.body.classList.remove("pg-pre-home"); homeGo(seq); }, 1200);
  loadMotion().then(function () { if (seq !== H.seq) return; H.ready = true; homeGo(seq); },
    function () { if (seq !== H.seq) return; clearTimeout(H.tm); document.body.classList.remove("pg-pre-home"); });
}
function homeGo(seq) {
  if (seq !== H.seq || !H.ready || H.ctx || S.tab !== "accueil" || (!S.loaded && !H.late)) return;
  clearTimeout(H.tm); homeMotion(!H.late); document.body.classList.remove("pg-pre-home");
}
function homeLeave() {
  H.seq++; H.pend = false; clearTimeout(H.tm); document.body.classList.remove("pg-pre-home");
  if (H.ctx) { H.ctx.revert(); H.ctx = null; }
}
function homeCount() {
  if (!H.ctx) return;
  H.ctx.add(function () {
    document.querySelectorAll("#tab-accueil [data-count]").forEach(function (e, i) {
      if (e._v == null) return; var o = { v: 0 }, to = e._v, f = e._f;
      e._tw = gsap.to(o, { v: to, duration: 1.4, delay: i * .04, ease: "power3.out", onUpdate: function () { e.textContent = f(o.v); }, onComplete: function () { e.textContent = f(to); e._tw = null; } });
    });
  });
}
function homeMotion(intro) {
  var head = $("page-head");
  H.ctx = gsap.context(function (self) {
    var q = self.selector;
    if (intro) {
      var lines = new SplitText($("page-title"), { type: "lines", mask: "lines" }).lines;
      var tl = gsap.timeline({ delay: H.delay || 0, defaults: { ease: "power3.out" } });
      tl.from(lines, { yPercent: 110, duration: 1.05, stagger: .1, ease: "expo.out" })
        .from(head.querySelector('.pg-actions[data-for="accueil"]'), { y: 14, opacity: 0, duration: .7, stagger: .08 }, "-=.75")
        .from(q(".pg-tray"), { y: 56, opacity: 0, duration: 1, ease: "expo.out" }, "-=.6")
        .from(q(".pg-bn"), { y: 22, opacity: 0, duration: .7, stagger: .05 }, "-=.8")
        .from(q("#hm-heat .c"), { scale: .4, opacity: 0, duration: .35, stagger: .008 }, "-=.5")
        .from(q("#hm-split i, #hm-cmp i"), { scaleX: 0, duration: .6, stagger: .012 }, "<")
        .from(q("#hm-dd line"), { opacity: 0, duration: .25, stagger: .025 }, "<")
        .from(q("#hm-segs i"), { opacity: 0, y: 6, duration: .3, stagger: .03 }, "<")
        .fromTo(q("#hm-donut .seg"), { strokeDasharray: "0 100" }, { strokeDasharray: function (i, c) { return c.getAttribute("stroke-dasharray"); }, duration: 1.1, stagger: .12, ease: "power2.out" }, "<");
      /* la courbe se trace avec l'animation du système de design (pathLength="1") au moment où sa carte apparaît */
      tl.call(function () { var ln = document.querySelector("#hm-eq .line"); if (ln) ln.setAttribute("pathLength", "1"); }, null, 1);
      if (S.loaded) tl.call(homeCount, null, .6); else H.pend = true;
    }
    /* plateau qui se redresse : sur ordinateur seulement (sur téléphone, le plateau très haut déborderait en s'inclinant) */
    if (window.matchMedia("(min-width: 900px)").matches) gsap.fromTo(q(".pg-home-tilt"), { rotateX: 9, scale: .97 }, { rotateX: 0, scale: 1, ease: "none", scrollTrigger: { trigger: q(".pg-home-stage")[0], start: "top 95%", end: "top 25%", scrub: .6 } });
  }, document.querySelector(".pg-in"));
}
$("btn-add-home").addEventListener("click", function () { openTrade(null); });
document.querySelectorAll("[data-go]").forEach(function (b) { b.addEventListener("click", function () { location.hash = b.dataset.go; }); });
$("hm-acc").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; S.homeAcc = b.dataset.v; renderHome(); });

/* ---------------- micro-interactions de l'application ---------------- */
/* Sobres et courtes : l'onglet qui arrive glisse de quelques pixels, le repère de navigation se déplace,
   les chiffres clés comptent une fois à l'arrivée sur un onglet. Rien avec le mouvement réduit. */
function pageIn(els) {
  if (REDUCED || !Element.prototype.animate) return;
  els.forEach(function (e, i) { if (e && !e.hidden) e.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 320, delay: i * 60, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" }); });
}
function navInd() {
  document.querySelectorAll(".pg-rail-nav, .pg-tabbar").forEach(function (nav) {
    var cur = nav.querySelector('[data-tab][aria-current="page"]'), ind = nav.querySelector(".pg-ind"), rail = nav.classList.contains("pg-rail-nav");
    if (!ind) { ind = el("i", { class: "pg-ind", "aria-hidden": "true" }); nav.appendChild(ind); }
    if (!cur || !cur.offsetParent) { ind.style.opacity = "0"; return; }
    var first = !ind.dataset.on; if (first) ind.style.transition = "none";
    ind.style.opacity = "1"; ind.dataset.on = "1";
    if (rail) { ind.style.transform = "translateY(" + (cur.offsetTop + 10) + "px)"; ind.style.height = (cur.offsetHeight - 20) + "px"; }
    else ind.style.transform = "translateX(" + (cur.offsetLeft + cur.offsetWidth / 2 - 11) + "px)";
    if (first) { void ind.offsetWidth; ind.style.transition = ""; }
  });
}
/* compte depuis zéro en gardant le format affiché (« +1 366 € », « 45,8 % », « −1,50 R ») ; ignore heures, dates et tirets */
function countText(e, dur) {
  var txt = e.textContent, m = txt.match(/^([^\d∞]*?)(\d(?:[\d\s  ]*\d)?(?:,\d+)?)(.*)$/);
  if (REDUCED || e._cnt || !m || /\d[:h\/]\d/.test(txt)) return;
  var raw = m[2].replace(/[\s  ]/g, ""), dec = (raw.split(",")[1] || "").length, to = parseFloat(raw.replace(",", "."));
  if (!isFinite(to) || !to) return;
  var f = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: /[\s  ]/.test(m[2]) }), t0 = performance.now(), last = txt;
  e._cnt = true; e._cntTo = txt;
  (function step(now) {
    if (e.textContent !== last) { e._cnt = false; return; } /* réécrit entre-temps (données reçues) : on s'arrête */
    var k = Math.min(1, (now - t0) / dur);
    last = k < 1 ? m[1] + f.format(to * (1 - Math.pow(1 - k, 3))) + m[3] : txt; e.textContent = last;
    if (k < 1) requestAnimationFrame(step); else e._cnt = false;
  })(t0);
}
var CNT = { tab: null, first: true };
function flushCount() {
  if (!S.loaded || REDUCED) return;
  if (CNT.first) { CNT.first = false; document.querySelectorAll(".tx-session .v").forEach(function (e) { countText(e, 900); }); }
  var t = CNT.tab; CNT.tab = null;
  if (!t || t !== S.tab || t === "accueil") return;
  $("tab-" + t).querySelectorAll(".tx-stat .v, .tx-hero").forEach(function (e) { countText(e, 900); });
}
window.addEventListener("resize", function () { clearTimeout(navInd._t); navInd._t = setTimeout(navInd, 120); });
if (document.fonts && document.fonts.ready) document.fonts.ready.then(navInd);

/* ---------------- mouvement de toute l'application : rideau entre les pages, blocs qui s'assemblent, défilement doux ---------------- */
/* GSAP et Lenis sont chargés à la connexion, jamais avec le mouvement réduit. Sans eux, l'application reste entière, sans animation. */
var M = { boot: false, ready: false, lenis: null, ctx: null, tl: null, target: null, navDelay: 0, rest: [] };
function motionBoot() {
  if (REDUCED || M.boot) return; M.boot = true;
  loadMotion().then(function () {
    M.ready = true;
    M.lenis = new Lenis({ lerp: .12, prevent: function (node) { return !!(node.closest && node.closest(".tx-overlay")); } });
    M.lenis.on("scroll", ScrollTrigger.update); M.lenis.on("scroll", revealAtBottom);
    gsap.ticker.add(function (t) { if (M.lenis) M.lenis.raf(t * 1000); });
  }, function () { M.boot = false; });
}
function toTop() { window.scrollTo(0, 0); if (M.lenis) M.lenis.scrollTo(0, { immediate: true, force: true }); }
function stRefresh() { if (!M.ready) return; clearTimeout(stRefresh._t); stRefresh._t = setTimeout(function () { ScrollTrigger.refresh(); revealAtBottom(); }, 150); }
/* blocs d'une page : barre de filtres, alertes, tuiles, panneaux, en-têtes de section (jamais un bloc dans un bloc) */
var BLOCKS = ".pg-toolbar, .tx-alert, .tx-stat, .tx-panel, .pg-section-head";
function blocks(tab) {
  return Array.prototype.filter.call(tab.querySelectorAll(BLOCKS), function (e) {
    if (!e.offsetParent) return false;
    var p = e.parentElement.closest(BLOCKS); return !(p && tab.contains(p));
  });
}
function rowsOf(b) { return Array.prototype.slice.call(b.querySelectorAll("tbody tr"), 0, 14); }
function reveal(list) {
  /* chaque bloc n'est révélé qu'une fois (défilement et filet de sécurité peuvent le demander tous les deux) */
  list = list.filter(function (b) { return M.rest.indexOf(b) >= 0; });
  if (!M.ctx || !list.length) return;
  list.forEach(function (b) { M.rest.splice(M.rest.indexOf(b), 1); });
  M.ctx.add(function () {
    gsap.to(list, { y: 0, opacity: 1, duration: .85, stagger: { amount: Math.min(.4, list.length * .08) }, ease: "power3.out", overwrite: true });
    list.forEach(function (b, k) { var r = rowsOf(b); if (r.length) gsap.from(r, { opacity: 0, y: 12, duration: .45, stagger: { amount: .3 }, delay: .15 + Math.min(k, 4) * .08, ease: "power2.out" }); });
  });
}
/* filet de sécurité : arrivé en bas de page, tout ce qui attend encore apparaît */
function revealAtBottom() { if (!M.rest.length) return; var d = document.documentElement; if (window.scrollY + window.innerHeight >= d.scrollHeight - 8) reveal(M.rest.slice()); }
/* entrée d'une page : titre en lignes masquées, en-tête, bandeau, plateau, puis les blocs visibles ; ceux plus bas montent au défilement */
function pageEnter(t) {
  if (!M.ready || t === "accueil" || t === "styleguide") return false;
  var tab = $("tab-" + t), head = $("page-head"), delay = M.navDelay || 0;
  M.ctx = gsap.context(function () {
    var lines = new SplitText($("page-title"), { type: "lines", mask: "lines" }).lines;
    var items = blocks(tab), vh = window.innerHeight, above = [], below = [];
    items.forEach(function (e) { (e.getBoundingClientRect().top < vh - 40 ? above : below).push(e); });
    var tl = gsap.timeline({ delay: delay, defaults: { ease: "power3.out" } });
    tl.from(lines, { yPercent: 110, duration: .95, stagger: .09, ease: "expo.out" })
      .from([$("page-date"), head.querySelector('.pg-actions[data-for="' + t + '"]')], { y: 16, opacity: 0, duration: .7, stagger: .07 }, "-=.85")
      .from("#session > div", { y: 30, opacity: 0, duration: .75, stagger: .07 }, "-=.65")
      .from(tab, { y: 70, opacity: 0, duration: 1, ease: "expo.out" }, "-=.7")
      .from(above, { y: 40, opacity: 0, duration: .8, stagger: { amount: .45 } }, "-=.9");
    above.forEach(function (b) { var r = rowsOf(b); if (r.length) tl.from(r, { opacity: 0, y: 12, duration: .45, stagger: { amount: .3 } }, "-=.6"); });
    if (below.length) {
      gsap.set(below, { y: 48, opacity: 0 }); M.rest = below.slice();
      ScrollTrigger.batch(below, { start: "top 94%", once: true, onEnter: reveal });
    }
  }, document.querySelector(".pg-in"));
  return true;
}
function pageLeave() { M.rest = []; if (M.ctx) { M.ctx.revert(); M.ctx = null; } }
/* rideau : il monte avec le nom de la page, la page change dessous, puis il repart vers le haut */
var CURT = { accueil: ["", "Accueil"], journal: ["Journal de ", "trading"], propfirms: ["Comptes ", "prop firm"], annonces: ["Annonces ", "économiques"], backtest: ["Backtest ", "du robot"] };
function curtain(t) {
  var c = $("curtain"), tt = $("curtain-t"), k = $("curtain-k"), lg = c.querySelector(".pg-curtain-logo"), h = CURT[t] || ["", TITLES[t]];
  if (M.tl) M.tl.progress(1);
  M.target = t;
  /* le repère du menu part tout de suite vers la page choisie, pendant que le rideau monte */
  document.querySelectorAll("[data-tab]").forEach(function (b) { if (b.dataset.tab === t) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); }); navInd();
  tt.textContent = ""; if (h[0]) tt.appendChild(document.createTextNode(h[0])); tt.appendChild(el("em", { text: h[1] }));
  k.textContent = $("page-date").textContent;
  c.hidden = false;
  M.tl = gsap.timeline({ onComplete: function () { c.hidden = true; M.tl = null; M.target = null; gsap.set([c, tt, k, lg], { clearProps: "all" }); } });
  M.tl.fromTo(c, { yPercent: 100 }, { yPercent: 0, duration: .5, ease: "expo.inOut" })
    .fromTo(tt, { yPercent: 115, opacity: 1 }, { yPercent: 0, duration: .6, ease: "expo.out" }, .18)
    .fromTo(lg, { rotation: -140, scale: .4, opacity: 0 }, { rotation: 0, scale: 1, opacity: 1, duration: .75, ease: "back.out(1.7)" }, .12) /* la pièce arrive en tournant */
    .fromTo(k, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: .45 }, .22)
    .add(function () { M.navDelay = .5; setTab(t); M.navDelay = 0; toTop(); }, .62)
    .to(c, { yPercent: -100, duration: .7, ease: "expo.inOut" }, .74)
    .to([lg, tt, k], { yPercent: -40, opacity: 0, duration: .4, ease: "power2.in" }, .74);
}
function go(t) {
  if (TABS.indexOf(t) < 0) t = "accueil";
  if (t === S.tab || (M.tl && M.target === t)) return;
  if (!M.ready || !S.tab || t === "styleguide" || S.tab === "styleguide") { setTab(t); toTop(); return; }
  curtain(t);
}

/* ---------------- navigation ---------------- */
var TABS = ["accueil", "journal", "propfirms", "annonces", "backtest", "styleguide"]; /* styleguide : page cachée, absente du menu */
var TITLES = { accueil: "Accueil", journal: "Journal de trading", propfirms: "Comptes prop firm", annonces: "Annonces économiques", backtest: "Backtest", styleguide: "Guide de style" };
/* nom de la page en grand : une italique dorée par titre (l'accueil a son titre sur deux lignes, construit à part) */
var HEADS = { journal: ["Journal de ", "trading"], propfirms: ["Comptes ", "prop firm"], annonces: ["Annonces ", "économiques"], backtest: ["Backtest ", "du robot"], styleguide: ["Guide de ", "style"] };
function setTab(t) {
  if (TABS.indexOf(t) < 0) t = "accueil";
  var same = t === S.tab, home = t === "accueil";
  if (!same) { pageLeave(); if (S.tab === "accueil") homeLeave(); }
  S.tab = t;
  document.querySelectorAll("[data-tab]").forEach(function (b) { if (b.dataset.tab === t) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  TABS.forEach(function (k) { $("tab-" + k).hidden = k !== t; });
  var head = $("page-head"), title = $("page-title");
  head.classList.toggle("is-hero", t !== "styleguide"); head.classList.toggle("is-home", home);
  if (!same) {
    title.textContent = "";
    if (home) { title.appendChild(document.createTextNode("La séance entière,")); title.appendChild(el("br")); title.appendChild(el("em", { text: "sur un seul écran." })); }
    else { title.appendChild(document.createTextNode(HEADS[t][0])); title.appendChild(el("em", { text: HEADS[t][1] })); }
  }
  head.hidden = t === "styleguide"; document.title = "Tradamax · " + TITLES[t];
  document.querySelectorAll(".pg-actions[data-for]").forEach(function (g) { g.hidden = g.dataset.for !== t; });
  if (home) { if (!same) homeEnter(); renderHome(); }
  if (t === "journal") renderJournal(); if (t === "propfirms") renderProps(); if (t === "annonces") renderEco();
  if (t === "backtest") { renderBacktest(); if (!S.hiBusy) hiRefresh(); loadAvis(); loadCtl(); }
  renderSession();
  if (!same && !home) { if (!pageEnter(t)) pageIn([head, $("tab-" + t)]); CNT.tab = t; flushCount(); }
  navInd(); stRefresh();
}
document.querySelectorAll("[data-tab]").forEach(function (b) { b.addEventListener("click", function () { location.hash = b.dataset.tab; }); });
window.addEventListener("hashchange", function () { go(location.hash.slice(1)); });
document.addEventListener("keydown", function (e) { if (e.key !== "Escape") return; if (!$("ov-review").hidden) { rvClose(); return; } ["ov-shot", "ov-capital", "ov-trade", "ov-prop", "ov-payout", "ov-import", "ov-settings", "ov-histo"].some(function (id) { if (id === "ov-histo" && S.hiImporting) return false; if (!$(id).hidden) { show(id, false); return true; } return false; }); });
var ro, roW = {};
try {
  ro = new ResizeObserver(function (entries) {
    var changed = false; entries.forEach(function (en) { var w = Math.round(en.contentRect.width); if (roW[en.target.id] !== w) { roW[en.target.id] = w; changed = true; } });
    if (!changed) return; clearTimeout(ro._t);
    ro._t = setTimeout(function () { if (S.tab === "journal") { var st = stats(filtered(), viewCap(), viewMoves()); renderEquity(st); renderHist(st.rs); } if (S.tab === "annonces") renderEco(); if (S.tab === "accueil") drawHomeEq(S.hmR7); }, 80);
  });
  ro.observe($("eq-chart")); ro.observe($("r-hist")); ro.observe($("eco-recap")); ro.observe($("hm-eq"));
} catch (e) {}

/* ---------------- bandeau de séance et horloges ---------------- */
/* Heures calculées avec Intl (America/New_York, Europe/Paris), jamais avec un décalage fixe. */
var fmtLongDate = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", year: "numeric" });
var fmtParisWeekday = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long" });
var fmtNYDay = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" });
function nyWeekday(d) { return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(fmtNYDay.format(d)); }
function nyAt(base, delta, target) { var d = new Date(base + delta * 60000), diff = target - nyMinutes(d); if (diff > 720) diff -= 1440; if (diff < -720) diff += 1440; return new Date(d.getTime() + diff * 60000); }
function nextWindow(now) {
  var base = Math.floor(now.getTime() / 60000) * 60000, m = nyMinutes(now), wd = nyWeekday(now), wins = WINDOWS.slice(0, 3);
  if (wd >= 1 && wd <= 5) { var cur = wins.find(function (w) { return m >= w.s && m < w.e; }); if (cur) return { w: cur, live: true, end: nyAt(base, cur.e - m, cur.e) }; }
  for (var k = 0; k < 8; k++) { var dd = (wd + k) % 7; if (dd === 0 || dd === 6) continue;
    for (var i = 0; i < wins.length; i++) { var delta = k * 1440 + wins[i].s - m; if (delta > 0) return { w: wins[i], live: false, start: nyAt(base, delta, wins[i].s), wait: delta }; } }
  return null;
}
function waitText(min, d) { if (min < 60) return "dans " + min + " min"; if (min < 1440) return "dans " + Math.floor(min / 60) + " h " + String(min % 60).padStart(2, "0"); return fmtParisWeekday.format(d); }
function setV(id, text, c, hint) { var v = $(id); v.textContent = text; v.className = "v" + (c ? " " + c : ""); $(id + "-h").textContent = hint || ""; }
function renderSession() {
  /* drawdown et résultat du jour : compte(s) réel(s) uniquement, jamais les prop firms ni les démos */
  var sas = sasNames(), capS = sas.reduce(function (a, n) { return a + (accCap(n) || 0); }, 0) || null;
  var mine = S.trades.filter(function (t) { return sas.indexOf(t.account) >= 0; });
  var all = mine.slice().sort(byDT), st = stats(all, capS, sas.reduce(function (a, n) { return a.concat(accMoves(n)); }, []));
  if (!sas.length) setV("ss-dd", "—", "", "Aucun compte réel");
  else if (!all.length) setV("ss-dd", "—", "", S.loaded ? "Aucun trade sur le compte réel" : "");
  else if (st.ddNow == null) setV("ss-dd", "—", "", "Capital du compte réel à renseigner");
  else {
    var dd = st.ddNow, s = ddState(dd), nxt = PALIERS.find(function (p) { return dd < p.p; }), gap = nxt ? nxt.p - dd : 0;
    setV("ss-dd", dd > 0 ? "−" + pct(dd) : pct(0), { ok: "", caution: "tx-warn", stop: "tx-neg" }[s.k], nxt ? "palier −" + Math.round(nxt.p * 100) + " % à " + pct(gap).replace(" %", "") + " point" + (gap >= .02 ? "s" : "") : "dernier palier dépassé");
  }
  var today = todayISO(), td = mine.filter(function (t) { return t.date === today; }), sum = td.reduce(function (a, t) { return a + (Number(t.pnl) || 0); }, 0);
  var rs = td.map(rOf).filter(function (r) { return r != null; });
  setV("ss-day", td.length ? seur(sum) : "0 €", cls(sum), td.length ? td.length + " trade" + (td.length > 1 ? "s" : "") + (rs.length ? " · " + rfmt(rs.reduce(function (a, b) { return a + b; }, 0)) : "") : "Aucun trade aujourd'hui");
  var now = new Date(), nw = nextWindow(now);
  if (!nw) setV("ss-win", "—", "", "");
  else if (nw.live) setV("ss-win", "En cours", "tx-info", nw.w.label + " · jusqu'à " + fmtParisTime.format(nw.end));
  else setV("ss-win", fmtParisTime.format(nw.start), "", nw.w.label + " · " + waitText(nw.wait, nw.start));
  if (!Array.isArray(S.cal)) setV("ss-news", "—", "", S.calTried ? "Calendrier indisponible" : "");
  else {
    var nx = S.cal.map(function (ev) { return { ev: ev, d: new Date(ev.date) }; }).filter(function (x) { return x.ev.impact === "High" && curOk(x.ev, "mine") && !isNaN(x.d) && isoParis(x.d) === today && x.d.getTime() >= now.getTime() - MARGE_ANNONCE * 60000; }).sort(function (a, b) { return a.d - b.d; })[0];
    if (!nx) setV("ss-news", "Aucune", "", "Plus d'annonce forte aujourd'hui");
    else { var f = winFlag(nx.d, "High"); setV("ss-news", fmtParisTime.format(nx.d), f && f.strong ? "tx-warn" : "", nx.ev.title + " (" + nx.ev.country + ")"); }
  }
}
function renderClocks() {
  var d = new Date(), s = fmtLongDate.format(d); $("page-date").textContent = s.charAt(0).toUpperCase() + s.slice(1);
  var c = $("clocks"); c.textContent = "";
  c.appendChild(el("span", {}, ["Paris", el("b", { text: fmtParisTime.format(d) })])); c.appendChild(el("span", {}, ["New York", el("b", { text: nyTime(d) })]));
}
setInterval(function () { if (S.user) { renderClocks(); renderSession(); } }, 30000);
/* ---------------- données Supabase ---------------- */
function fetchAll(table, order) {
  var out = [];
  function page(from) { return S.sb.from(table).select("*").order(order, { ascending: true }).range(from, from + 999).then(function (res) { if (res.error) throw res.error; out = out.concat(res.data); return res.data.length === 1000 ? page(from + 1000) : out; }); }
  return page(0);
}
var timers = {};
function reload(table) {
  clearTimeout(timers[table]);
  timers[table] = setTimeout(function () {
    if (table === "trades") fetchAll("trades", "date").then(function (rows) { S.trades = rows.map(fromRow); S.loaded = true; S.useSample = !S.trades.length; renameLegacy(); S.selSig = ""; if (S.tab === "journal") renderJournal(); if (S.tab === "accueil") renderHome(); renderSession(); flushCount(); stRefresh(); }).catch(loadErr);
    if (table === "reglages") S.sb.from("reglages").select("data").eq("id", 1).maybeSingle().then(function (res) { var d = res.data && res.data.data || {}; S.set = Object.assign(JSON.parse(JSON.stringify(DEF)), d); renameLegacy(); S.sample = makeSample(); S.selSig = ""; setTab(S.tab); });
    if (table === "prop_comptes") fetchAll("prop_comptes", "created_at").then(function (rows) { S.props = rows; if (S.tab === "propfirms") renderProps(); stRefresh(); }).catch(loadErr);
    if (table === "payouts") fetchAll("payouts", "date").then(function (rows) { S.payouts = rows; if (S.tab === "propfirms") renderProps(); stRefresh(); }).catch(loadErr);
  }, 250);
}
function loadErr() { $("status").textContent = "Données inaccessibles : vérifiez que votre e-mail figure dans la table des membres."; }
var channel = null;
function startApp(session) {
  S.user = session.user; $("who").textContent = session.user.email || "";
  show("auth", false); show("app", true);
  S.sample = makeSample();
  ["reglages", "trades", "prop_comptes", "payouts"].forEach(reload);
  if (!channel) {
    channel = S.sb.channel("tradamax");
    ["trades", "reglages", "prop_comptes", "payouts"].forEach(function (t) { channel.on("postgres_changes", { event: "*", schema: "public", table: t }, function () { reload(t); }); });
    channel.subscribe();
  }
  renderRef(); renderClocks(); loadCal(); motionBoot(); setTab(location.hash.slice(1) || "accueil");
}
function stopApp() { if (S.tab === "accueil") homeLeave(); S.tab = ""; S.user = null; show("app", false); show("auth", true); if (channel) { S.sb.removeChannel(channel); channel = null; } }

/* ---------------- connexion ---------------- */
$("login-form").addEventListener("submit", function (e) {
  e.preventDefault(); var email = $("login-email").value.trim(), pass = $("login-pass").value;
  if (!email || !pass) { loginMsg("Saisissez votre e-mail et votre mot de passe."); return; }
  $("login-go").disabled = true;
  S.sb.auth.signInWithPassword({ email: email, password: pass }).then(function (res) { $("login-go").disabled = false; if (res.error) loginMsg("E-mail ou mot de passe incorrect."); });
});
function loginMsg(text, ok) { var m = $("login-err"); m.textContent = text; m.className = "tx-help " + (ok ? "is-ok" : "is-error"); m.hidden = false; }
$("login-magic").addEventListener("click", function () {
  var email = $("login-email").value.trim(); if (!email) { loginMsg("Saisissez d'abord votre e-mail."); return; }
  S.sb.auth.signInWithOtp({ email: email, options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname } }).then(function (res) {
    if (res.error) loginMsg("Envoi impossible : ce compte n'existe peut-être pas."); else loginMsg("Lien envoyé. Ouvrez-le depuis votre boîte mail.", true);
  });
});
$("btn-logout").addEventListener("click", function () { S.sb.auth.signOut(); });

/* ---------------- démarrage ---------------- */
var CFG = window.TRADAMAX_CONFIG || {};
if (DEMO) { S.sb = demoClient(); startApp({ user: { email: "Mode démonstration", id: "demo-user" } }); return; }
if (!window.supabase || !CFG.supabaseUrl || /VOTRE/.test(CFG.supabaseUrl + CFG.supabaseAnonKey)) { show("cfg-err", true); return; }
S.sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
S.sb.auth.getSession().then(function (res) { if (res.data.session) startApp(res.data.session); else show("auth", true); });
S.sb.auth.onAuthStateChange(function (ev, session) { if (session && !S.user) startApp(session); else if (!session && S.user) stopApp(); });
})();
