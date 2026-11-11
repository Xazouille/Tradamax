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
    payouts: [{ id: "demo-y1", compte_id: "demo-p1", date: today, montant: 1850, devise: "EUR", note: "Premier versement" }] };
  function ok(data) { return Promise.resolve({ data: data, error: null }); }
  function query(table) {
    var op = "select", payload = null, filt = null, single = false, rng = null;
    function match(r) { return !filt || r[filt[0]] === filt[1]; }
    function run() {
      var t = db[table];
      if (op === "insert") { [].concat(payload).forEach(function (r) { t.push(Object.assign({ id: "demo-" + (++n), created_at: new Date().toISOString() }, r)); }); return ok(null); }
      if (op === "update") { t.forEach(function (r) { if (match(r)) Object.assign(r, payload); }); return ok(null); }
      if (op === "upsert") { var e = t.find(function (r) { return r.id === payload.id; }); if (e) Object.assign(e, payload); else t.push(payload); return ok(null); }
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
  return {
    from: query,
    storage: { from: function () { return {
      upload: function (path, file) { shots[path] = URL.createObjectURL(file); return ok(null); },
      createSignedUrls: function (paths) { return ok(paths.map(function (p) { return { path: p, signedUrl: shots[p] || null }; })); },
      remove: function () { return ok(null); } }; } },
    channel: function () { return chan; }, removeChannel: function () {},
    auth: { signOut: function () { toast("Mode démonstration : aucun compte à déconnecter."); return ok(null); } }
  };
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
  accounts: ["Compte SAS", "Challenge prop firm", "Prop firm financé", "Compte démo"],
  /* type et capital de départ de chaque compte du journal (le compte SAS prend « capital » tant qu'il n'est pas réglé) */
  accountsInfo: { "Challenge prop firm": { type: "prop", capital: 50000 }, "Prop firm financé": { type: "prop", capital: 50000 }, "Compte démo": { type: "demo", capital: null } },
  rPlanDefault: 2, capital: 15000, eurusd: 1.115
};
var ACC_TYPES = { sas: "Compte réel de la SAS", prop: "Prop firm", demo: "Démo" };
var ACC_SHORT = { sas: "réel SAS", prop: "prop firm", demo: "démo" };
var WINDOWS = [
  { id: "London", label: "Londres", ny: "3h–4h NY", paris: "9h–10h Paris", s: 180, e: 240 },
  { id: "NYAM", label: "NY AM", ny: "10h–11h NY", paris: "16h–17h Paris", s: 600, e: 660 },
  { id: "NYPM", label: "NY PM", ny: "14h–15h NY", paris: "20h–21h Paris", s: 840, e: 900 },
  { id: "Out", label: "Hors fenêtre", ny: "", paris: "", s: -1, e: -1 }
];
var EMOTIONS = ["Calme", "Confiant", "Hésitant", "FOMO", "Revanche", "Fatigué"];
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
  cal: null, calUpdated: null, ecoDay: "today", tab: "journal"
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
function winLabel(id) { var w = WINDOWS.find(function (x) { return x.id === id; }); return w ? w.label : (id || "—"); }
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
  for (var i = 0; i < 95; i++) {
    d.setDate(d.getDate() + 1); var wd = d.getDay(); if (wd === 0 || wd === 6) continue; if (rnd() < .25) continue;
    var m = rnd() < .45 ? "XAUUSD" : rnd() < .55 ? "Nasdaq" : "DAX";
    var w = rnd() < .5 ? "NYAM" : rnd() < .6 ? "London" : rnd() < .85 ? "NYPM" : "Out";
    var plan = rnd() < .82, win = rnd() < (plan ? .47 : .3);
    var r = win ? (1.2 + rnd() * 2.3) : -(plan ? 1 : 1 + rnd() * .8);
    var hh = { London: "09", NYAM: "16", NYPM: "20", Out: "14" }[w];
    out.push({ id: "ex" + i, date: isoParis(d), time: hh + ":" + String(Math.floor(rnd() * 55)).padStart(2, "0"), market: m,
      account: rnd() < .55 ? "Compte SAS" : rnd() < .6 ? "Challenge prop firm" : "Prop firm financé", side: rnd() < .55 ? "Long" : "Short",
      window: w, risk: 150, pnl: Math.round(r * 150), plan: plan,
      emotion: plan ? (rnd() < .6 ? "Calme" : "Confiant") : (["FOMO", "Revanche", "Hésitant", "Fatigué"][Math.floor(rnd() * 4)]), note: "Exemple", sample: true });
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
/* comptes : type (réel SAS, prop firm, démo) et capital de départ ; sans capital connu, pas de drawdown */
function accInfo(name) {
  var i = (S.set.accountsInfo || {})[name]; if (i && ACC_TYPES[i.type]) return i;
  var s = norm(name), type = /demo/.test(s) ? "demo" : /sas|reel/.test(s) ? "sas" : "prop";
  return { type: type, capital: type === "sas" ? S.set.capital : null };
}
function accCap(name) { var c = Number(accInfo(name).capital); return c > 0 ? c : null; }
function accList() { return withUsed(S.set.accounts, "account"); }
function sasNames() { return accList().filter(function (a) { return accInfo(a).type === "sas"; }); }
function viewCap() { return S.f.account === "all" || S.f.account == null ? null : accCap(S.f.account); }
function byDT(a, b) { return (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")); }
function stats(ts, cap) {
  var has = cap != null && cap > 0, n = ts.length, gw = 0, gl = 0, w = 0, l = 0, rs = [], cum = 0, eq = [], peak = has ? cap : null, maxdd = 0, maxddE = 0;
  ts.forEach(function (t, i) {
    var p = Number(t.pnl) || 0; if (p > 0) { gw += p; w++; } else if (p < 0) { gl += -p; l++; }
    var r = rOf(t); if (r != null) rs.push(r);
    cum += p;
    if (has) { var c = cap + cum; if (c > peak) peak = c; var dd = (peak - c) / peak; if (dd > maxdd) { maxdd = dd; maxddE = peak - c; } }
    eq.push({ i: i + 1, cum: cum, t: t });
  });
  var cur = has ? cap + cum : null;
  return { n: n, total: cum, w: w, l: l, wr: n ? w / n : null, pf: gl > 0 ? gw / gl : (gw > 0 ? Infinity : null), exp: n ? cum / n : null,
    avgR: rs.length ? rs.reduce(function (a, b) { return a + b; }, 0) / rs.length : null, rs: rs, eq: eq, cap: has ? cap : null, peak: peak, cur: cur,
    ddNow: has ? Math.max(0, (peak - cur) / peak) : null, maxdd: has ? maxdd : null, maxddE: has ? maxddE : null, avgW: w ? gw / w : null, avgL: l ? gl / l : null };
}

/* ---------------- rendu du journal ---------------- */
function renderJournal() {
  if (S.f.account == null) S.f.account = sasNames()[0] || "all";
  refreshSelects();
  var ts = filtered(), st = stats(ts, viewCap());
  $("banner").hidden = !S.useSample;
  renderEquity(st); renderDD(st); renderOthers(); renderKPIs(st);
  renderGroups($("by-market"), ts, function (t) { return t.market; }, S.set.markets, function () { return null; });
  renderGroups($("by-window"), ts, function (t) { return t.window || "Out"; }, WINDOWS.map(function (w) { return w.id; }),
    function (k) { var w = WINDOWS.find(function (x) { return x.id === k; }); return w && w.ny ? w.ny + " · " + w.paris : null; }, winLabel);
  renderHist(st.rs); renderPlan(ts); renderEmotions(ts); renderCal(); renderRP(ts); renderTable(ts);
}
function niceTicks(mn, mx, n) { var span = mx - mn, step = Math.pow(10, Math.floor(Math.log10(span / n))), e = span / n / step; step *= e >= 5 ? 5 : e >= 2 ? 2 : 1; var out = []; for (var v = Math.ceil(mn / step) * step; v <= mx + 1e-9; v += step) out.push(Math.abs(v) < 1e-9 ? 0 : v); return out; }
function renderEquity(st) {
  var tot = $("eq-total"); tot.textContent = st.n ? seur(st.total) : "—"; tot.className = "tx-hero " + cls(st.total);
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
/* Drawdown du compte affiché. Les paliers de la charte ne s'appliquent qu'au compte réel de la SAS. */
function renderDD(st) {
  var name = S.f.account, info = name === "all" ? null : accInfo(name), sas = !!info && info.type === "sas", has = st.cap != null;
  $("dd-title").textContent = sas ? "Palier de drawdown (charte)" : "Drawdown du compte";
  $("dd-note").textContent = !info ? "Choisissez un compte pour voir son capital et son drawdown." : !has ? "Indiquez le capital de départ de « " + name + " » dans les Réglages." :
    sas ? name + " · depuis le plus haut historique du capital" : name + " · depuis le plus haut du compte. Les paliers de la charte ne concernent que le compte de la SAS.";
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
  $("dd-max").textContent = has && st.n ? "−" + pct(st.maxdd) + " (" + eur(st.maxddE) + ")" : "—";
}
/* Section « Prop firms et comptes démo » : un résumé par compte, toujours sur tout l'historique */
function renderOthers() {
  var box = $("others"), names = accList().filter(function (n) { return accInfo(n).type !== "sas"; }); box.textContent = "";
  $("others-sec").hidden = !names.length;
  names.forEach(function (name) {
    var info = accInfo(name), cap = accCap(name), ts = source().filter(function (t) { return t.account === name; }).sort(byDT), st = stats(ts, cap), cur = S.f.account === name;
    var card = el("article", { class: "tx-panel tx-account pg-acc" + (cur ? " is-current" : "") }, [
      el("div", { class: "tx-account-head" }, [
        el("div", { class: "tx-account-id" }, [el("span", { class: "tx-avatar", "aria-hidden": "true", text: initials(name) }),
          el("div", { class: "pg-acc-name" }, [el("h3", { class: "tx-title", text: name }), el("div", { class: "tx-sub", text: ACC_TYPES[info.type] })])]),
        el("span", { class: "tx-badge is-plain", text: info.type === "demo" ? "Démo" : "Prop firm" })]),
      el("dl", { class: "tx-kv" }, [
        el("dt", { text: "Capital de départ" }), el("dd", { text: cap ? eur(cap) : "À renseigner" }),
        el("dt", { text: "Résultat" }), el("dd", { class: cls(st.total), text: st.n ? seur(st.total) : "—" }),
        el("dt", { text: "Capital actuel" }), el("dd", { text: st.cur != null ? eur(st.cur) : "—" }),
        el("dt", { text: "Drawdown actuel" }), el("dd", { text: st.ddNow != null && st.n ? "−" + pct(st.ddNow) : "—" })]),
      el("div", { class: "tx-account-foot" }, [el("span", { class: "tx-dim", text: st.n + " trade" + (st.n > 1 ? "s" : "") }),
        el("button", { class: "tx-btn is-ghost", type: "button", "aria-label": "Afficher le détail de " + name, text: cur ? "Affiché" : "Voir le détail" })])]);
    card.addEventListener("click", function () { S.f.account = name; S.shown = 30; renderJournal(); window.scrollTo({ top: 0, behavior: "smooth" }); });
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
  if (p != null) svg.appendChild(svgEl("circle", { cx: 37, cy: 37, r: R, fill: "none", class: "pg-ring-val " + (p >= .8 ? "is-pos" : p >= .6 ? "is-warn" : "is-neg"), "stroke-width": 7, "stroke-linecap": "round", "stroke-dasharray": (C * p).toFixed(1) + " " + C.toFixed(1), transform: "rotate(-90 37 37)" }));
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
      el("td", { class: "c-side" }, [el("span", { class: "tx-badge is-plain " + (t.side === "Short" ? "is-neg" : "is-pos"), text: t.side || "—" })]), el("td", { class: "c-win", text: winLabel(t.window) }),
      el("td", { class: "c-risk r tx-num tx-dim", text: t.risk > 0 ? eur(t.risk) : "—" }),
      el("td", { class: "c-r r tx-num " + cls(r || 0) }, [rfmt(r), r != null ? el("span", { class: "pg-rsub", text: "/ " + String(rPlanOf(t)).replace(".", ",") }) : null]),
      el("td", { class: "c-pnl r tx-num " + cls(t.pnl), text: seur(t.pnl) }),
      el("td", { class: "c-plan" }, [el("span", { class: "tx-badge " + (t.plan === false ? "is-neg" : "is-pos"), text: t.plan === false ? "Non respecté" : "Respecté" })]), shot]);
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
fillSelect($("t-window"), WINDOWS.map(function (w) { return { v: w.id, l: w.label + (w.paris ? " (" + w.paris + ")" : "") }; }));
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
  $("t-window").value = t && t.window || "NYAM"; $("t-emotion").value = t && t.emotion || "Calme";
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
    var wid = WINDOWS.find(function (w) { return norm(w.label) === norm(wv); });
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
$("imp-template").addEventListener("click", function () { download("modele-journal.csv", CSV_HEAD + "\n10/11/2026;16:12;XAUUSD;Compte SAS;Long;NY AM;2650,5;2646,0;2659,5;1;150;2;300;;oui;Calme;Exemple à remplacer\n"); });
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
    box.appendChild(el("div", { class: "pg-accrow" }, [el("div", { class: "nm" }, [a.name, el("small", { text: n ? n + " trade" + (n > 1 ? "s" : "") : "aucun trade" })]), type, cap, x]));
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
  S.tmpA = S.set.accounts.map(function (n) { var i = accInfo(n); return { name: n, type: i.type, capital: i.capital }; });
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
  if (sasA.some(function (a) { return !(a.capital > 0); })) { setErr("Indiquez le capital de départ du compte réel de la SAS : il sert au drawdown de la charte."); return; }
  var info = {}; S.tmpA.forEach(function (a) { info[a.name] = { type: a.type, capital: a.capital > 0 ? a.capital : null }; });
  var sasCap = sasA.reduce(function (s, a) { return s + a.capital; }, 0);
  var b = this; b.disabled = true;
  saveSettings({ markets: S.tmpM.slice(), accounts: S.tmpA.map(function (a) { return a.name; }), accountsInfo: info, capital: sasCap || S.set.capital, rPlanDefault: rp, eurusd: rate }).then(function (res) {
    b.disabled = false; if (res.error) { setErr("Enregistrement impossible."); return; }
    show("ov-settings", false); toast("Réglages enregistrés"); reload("reglages");
  });
});

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
      el("td", { "data-l": "Compte au nom de la SAS" }, [el("span", { class: "tx-badge" + (f[2].indexOf("Oui") === 0 ? " is-pos" : f[2] === "Non" ? " is-neg" : ""), text: f[2] })]),
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
      f ? el("span", { class: "tx-badge " + (f.strong ? "is-neg" : "is-warn"), text: f.text }) : el("span")]));
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
      el("td", { class: "c-title", "data-l": "Annonce" }, [el("span", { text: x.ev.title }), f ? el("span", { class: "tx-badge " + (f.strong ? "is-neg" : "is-warn"), text: f.text }) : null]),
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

/* ---------------- navigation ---------------- */
var TABS = ["journal", "propfirms", "annonces", "styleguide"]; /* styleguide : page cachée, absente du menu */
var TITLES = { journal: "Journal de séance", propfirms: "Comptes prop firm", annonces: "Annonces économiques", styleguide: "Guide de style" };
function setTab(t) {
  if (TABS.indexOf(t) < 0) t = "journal"; S.tab = t;
  document.querySelectorAll("[data-tab]").forEach(function (b) { if (b.dataset.tab === t) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  TABS.forEach(function (k) { $("tab-" + k).hidden = k !== t; });
  $("page-title").textContent = TITLES[t]; $("page-head").hidden = t === "styleguide"; document.title = "Tradamax · " + TITLES[t];
  document.querySelectorAll(".pg-actions[data-for]").forEach(function (g) { g.hidden = g.dataset.for !== t; });
  if (t === "journal") renderJournal(); if (t === "propfirms") renderProps(); if (t === "annonces") renderEco();
  renderSession();
}
document.querySelectorAll("[data-tab]").forEach(function (b) { b.addEventListener("click", function () { location.hash = b.dataset.tab; }); });
window.addEventListener("hashchange", function () { setTab(location.hash.slice(1)); window.scrollTo(0, 0); });
document.addEventListener("keydown", function (e) { if (e.key !== "Escape") return; ["ov-shot", "ov-trade", "ov-prop", "ov-payout", "ov-import", "ov-settings"].some(function (id) { if (!$(id).hidden) { show(id, false); return true; } return false; }); });
var ro, roW = {};
try {
  ro = new ResizeObserver(function (entries) {
    var changed = false; entries.forEach(function (en) { var w = Math.round(en.contentRect.width); if (roW[en.target.id] !== w) { roW[en.target.id] = w; changed = true; } });
    if (!changed) return; clearTimeout(ro._t);
    ro._t = setTimeout(function () { if (S.tab === "journal") { var st = stats(filtered(), viewCap()); renderEquity(st); renderHist(st.rs); } if (S.tab === "annonces") renderEco(); }, 80);
  });
  ro.observe($("eq-chart")); ro.observe($("r-hist")); ro.observe($("eco-recap"));
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
  /* drawdown et résultat du jour : compte(s) réel(s) de la SAS uniquement, jamais les prop firms ni les démos */
  var sas = sasNames(), capS = sas.reduce(function (a, n) { return a + (accCap(n) || 0); }, 0) || null;
  var mine = S.trades.filter(function (t) { return sas.indexOf(t.account) >= 0; });
  var all = mine.slice().sort(byDT), st = stats(all, capS);
  if (!sas.length) setV("ss-dd", "—", "", "Aucun compte réel de la SAS");
  else if (!all.length) setV("ss-dd", "—", "", S.loaded ? "Aucun trade sur le compte SAS" : "");
  else if (st.ddNow == null) setV("ss-dd", "—", "", "Capital du compte SAS à renseigner");
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
    if (table === "trades") fetchAll("trades", "date").then(function (rows) { S.trades = rows.map(fromRow); S.loaded = true; S.useSample = !S.trades.length; if (S.tab === "journal") renderJournal(); renderSession(); }).catch(loadErr);
    if (table === "reglages") S.sb.from("reglages").select("data").eq("id", 1).maybeSingle().then(function (res) { var d = res.data && res.data.data || {}; S.set = Object.assign(JSON.parse(JSON.stringify(DEF)), d); S.selSig = ""; setTab(S.tab); });
    if (table === "prop_comptes") fetchAll("prop_comptes", "created_at").then(function (rows) { S.props = rows; if (S.tab === "propfirms") renderProps(); }).catch(loadErr);
    if (table === "payouts") fetchAll("payouts", "date").then(function (rows) { S.payouts = rows; if (S.tab === "propfirms") renderProps(); }).catch(loadErr);
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
  renderRef(); renderClocks(); loadCal(); setTab(location.hash.slice(1) || "journal");
}
function stopApp() { S.user = null; show("app", false); show("auth", true); if (channel) { S.sb.removeChannel(channel); channel = null; } }

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
if (DEMO) { S.sb = demoClient(); startApp({ user: { email: "Mode démonstration" } }); return; }
if (!window.supabase || !CFG.supabaseUrl || /VOTRE/.test(CFG.supabaseUrl + CFG.supabaseAnonKey)) { show("cfg-err", true); return; }
S.sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
S.sb.auth.getSession().then(function (res) { if (res.data.session) startApp(res.data.session); else show("auth", true); });
S.sb.auth.onAuthStateChange(function (ev, session) { if (session && !S.user) startApp(session); else if (!session && S.user) stopApp(); });
})();
