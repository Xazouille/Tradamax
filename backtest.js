/* Tradamax · moteur de backtest : applique les règles de la stratégie du trader aux bougies M1.
   Fonctions pures, sans réseau ni accès à la page : window.TradamaxBT.run(m1) renvoie les setups,
   les trades pris et les statistiques. Simulation sur le passé uniquement : aucun ordre n'est jamais passé.
   Les ventes sont détectées en appliquant les règles d'achat aux prix renversés (miroir), puis remises à l'endroit. */
(function () {
"use strict";

/* Règles v1 : section 8 du document de règles (réponses du trader du 16/11/2026). Distances en ATR 14. */
var RULES = {
  version: "v1 du 16/11/2026",
  obTfs: [3, 5, 15, 30, 60],   /* unités où l'on cherche l'OB */
  sweepTfs: [1, 3, 5],         /* unités de la prise de liquidité, du FVG/IFVG et de l'entrée */
  swingK: 2,                   /* sommet ou creux de swing : 2 bougies de chaque côté */
  atrN: 14,
  dispBody: 1,                 /* déplacement : corps d'au moins 1 ATR… */
  dispQuarter: .25,            /* …clôture dans le quart extrême de la bougie */
  legMax: 3,                   /* bougies du déplacement qui casse la structure */
  obMax: 3,                    /* l'OB : 1 à 3 bougies opposées consécutives */
  sweepMin: .05,               /* la mèche dépasse le creux d'au moins 0,05 ATR */
  sweepConfirm: 3,             /* une clôture revient au-dessus dans les 3 bougies */
  fvgMin: .3,                  /* écart minimal d'un FVG */
  ifvgLookback: 20,            /* un IFVG inverse un FVG opposé formé dans les 20 dernières bougies */
  maxBars: 5,                  /* FVG/IFVG puis entrée : entre 1 et 5 bougies */
  goneR: 1,                    /* annulation B : le prix est déjà à +1 R */
  strongBody: 1,               /* annulation D : retour avec un corps d'au moins 1 ATR */
  tpR: 2, beR: 1,              /* objectif 2 R ; stop au point d'entrée dès +1 R ou une prise de liquidité */
  limits: { perDay: 3, lossStreak: 2, dayLossR: 2, weekLossR: 5 },
  review: { taken: 60, cancelled: 30 } /* setups tirés au hasard pour la revue par le trader */
};
var TFS = [60, 30, 15, 5, 3, 1]; /* ordre de traitement d'une même minute : unités hautes d'abord */
var REASONS = {
  A2: "Pas de retour dans la zone dans les 5 bougies",
  B: "Le prix est parti sans nous (+1 R avant l'entrée)",
  C: "Liquidité prise en face avant l'entrée",
  D: "Retour violent à la 3e, 4e ou 5e bougie",
  E: "OB cassé avant l'entrée",
  F: "Clôture de l'autre côté de la zone au retour",
  G: "Stop du mauvais côté de l'entrée",
  P: "Position déjà ouverte",
  L1: "3 trades déjà pris ce jour-là",
  L2: "2 pertes de suite ce jour-là",
  L3: "Perte du jour de 2 R atteinte",
  L4: "Perte de la semaine de 5 R atteinte"
};
var REVIEWABLE = ["A2", "B", "C", "D", "E", "F", "G"];

/* ---- heure de New York (Intl, changements d'heure compris) ---- */
var nyFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" });
var offCache = {};
function nyOffset(tMin) {
  var key = Math.floor(tMin / 60); if (offCache[key] != null) return offCache[key];
  var p = {}; nyFmt.formatToParts(new Date(tMin * 60000)).forEach(function (x) { p[x.type] = Number(x.value); });
  return (offCache[key] = Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute) / 60000) - tMin));
}
function nyWall(tMin) { return tMin + nyOffset(tMin); }
function nyDayKey(tMin) { var d = new Date(nyWall(tMin) * 60000); return d.toISOString().slice(0, 10); }
function nyWeekKey(tMin) { var w = nyWall(tMin), d = new Date(w * 60000), back = (d.getUTCDay() + 6) % 7; return new Date((w - back * 1440) * 60000).toISOString().slice(0, 10); }

/* ---- bougies d'une unité de temps, construites à partir du M1 ---- */
function aggregate(m, tf, from, to) {
  from = from || 0; to = to == null ? m.t.length - 1 : to;
  var B = { tf: tf, t: [], o: [], h: [], l: [], c: [], i0: [], i1: [] }, cur = null;
  for (var i = from; i <= to; i++) {
    var b = Math.floor(m.t[i] / tf) * tf;
    if (b !== cur) { B.t.push(b); B.o.push(m.o[i]); B.h.push(m.h[i]); B.l.push(m.l[i]); B.c.push(m.c[i]); B.i0.push(i); B.i1.push(i); cur = b; }
    else { var k = B.t.length - 1; if (m.h[i] > B.h[k]) B.h[k] = m.h[i]; if (m.l[i] < B.l[k]) B.l[k] = m.l[i]; B.c[k] = m.c[i]; B.i1[k] = i; }
  }
  return B;
}
function atrOf(B, n) {
  var a = new Float64Array(B.t.length), win = [], sum = 0;
  for (var k = 0; k < B.t.length; k++) {
    var pc = k ? B.c[k - 1] : B.o[k], tr = Math.max(B.h[k] - B.l[k], Math.abs(B.h[k] - pc), Math.abs(B.l[k] - pc));
    win.push(tr); sum += tr; if (win.length > n) sum -= win.shift();
    a[k] = win.length === n ? sum / n : NaN;
  }
  return a;
}
function mirror(m) {
  var n = m.t.length, o = new Float64Array(n), h = new Float64Array(n), l = new Float64Array(n), c = new Float64Array(n);
  for (var i = 0; i < n; i++) { o[i] = -m.o[i]; h[i] = -m.l[i]; l[i] = -m.h[i]; c[i] = -m.c[i]; }
  return { t: m.t, o: o, h: h, l: l, c: c };
}
function nearestAbove(stack, x) { for (var i = stack.length - 1; i >= 0; i--) if (stack[i].v > x) return stack[i].v; return null; }

/* ---- détection des setups à l'achat (les ventes passent par le miroir) ---- */
function detect(m, R, counts) {
  var st = {}, allObs = [], out = [], isOb = {}, isSw = {};
  R.obTfs.forEach(function (t) { isOb[t] = true; }); R.sweepTfs.forEach(function (t) { isSw[t] = true; });
  TFS.forEach(function (tf) { var B = aggregate(m, tf); st[tf] = { tf: tf, B: B, atr: atrOf(B, R.atrN), ptr: 0, highs: [], lows: [], lastSH: null, obs: [], bear: [], waits: [], pending: null }; });

  function findOB(s, k) {
    var B = s.B, atr = s.atr[k]; if (!(atr > 0)) return null;
    function up(x) { return B.c[x] > B.o[x]; } function down(x) { return B.c[x] < B.o[x]; }
    if (!up(k)) return null;
    var j = k; while (j - 1 >= 0 && up(j - 1) && k - j + 1 < R.legMax) j--;
    var g1 = j - 1; if (g1 < 0 || !down(g1)) return null;
    var g0 = g1; while (g0 - 1 >= 0 && down(g0 - 1) && g1 - g0 + 1 < R.obMax) g0--;
    var disp = false;
    for (var x = j; x <= k; x++) { var rg = B.h[x] - B.l[x]; if (B.c[x] - B.o[x] >= R.dispBody * atr && rg > 0 && B.h[x] - B.c[x] <= R.dispQuarter * rg) disp = true; }
    if (!disp) return null;
    var top = -Infinity, bot = Infinity; for (x = g0; x <= g1; x++) { if (B.h[x] > top) top = B.h[x]; if (B.l[x] < bot) bot = B.l[x]; }
    return { tf: s.tf, t0: B.t[g0], tC: B.t[k] + s.tf, n: g1 - g0 + 1, top: top, bot: bot, valid: true, tEnd: null };
  }
  function end(s, su, k, reason) {
    var B = s.B; su.reason = reason; su.tD = B.t[k] + s.tf; su.iD = B.i1[k];
    if (s.pending === su) s.pending = null;
    if (reason === "A1") { counts.A1++; return; }
    out.push(su);
  }
  function step(s, su, k) {
    var B = s.B, atr = s.atr[k], x;
    if (su.phase === "fvg") {
      var d = k - su.S; if (d < 1) return;
      var z = null;
      if (k >= 2 && B.l[k] > B.h[k - 2] && B.l[k] - B.h[k - 2] >= R.fvgMin * atr) z = { type: "FVG", top: B.l[k], bot: B.h[k - 2], t0: B.t[k - 2] };
      else for (x = s.bear.length - 1; x >= 0; x--) { var f = s.bear[x]; if (!f.used && f.k < k && B.c[k] > f.top) { f.used = true; z = { type: "IFVG", top: f.top, bot: f.bot, t0: B.t[f.k - 2] }; break; } }
      if (z) {
        z.tC = B.t[k] + s.tf; su.zone = z; su.F = k; su.phase = "entry";
        var hi = -Infinity; for (x = su.S; x <= k; x++) if (B.h[x] > hi) hi = B.h[x];
        su.opp = nearestAbove(s.highs, hi); su.risk0 = z.top - su.stop; return;
      }
      if (d >= R.maxBars) end(s, su, k, "A1");
      return;
    }
    var dd = k - su.F; if (dd < 1) return;
    if (!su.ob.valid) { end(s, su, k, "E"); return; }
    if (B.l[k] <= su.zone.top) { /* retour dans la zone : décision à la clôture de cette bougie */
      su.entry = B.c[k]; su.kE = k; su.iE = B.i1[k]; su.tE = B.t[k] + s.tf; su.beLiq = nearestAbove(s.highs, su.entry); su.nth = dd;
      if (su.entry < su.zone.bot) { end(s, su, k, "F"); return; }
      if (dd >= 3 && B.o[k] - B.c[k] >= R.strongBody * atr) { end(s, su, k, "D"); return; }
      if (su.stop >= su.entry) { end(s, su, k, "G"); return; }
      end(s, su, k, null); return;
    }
    if (su.risk0 > 0 && B.h[k] >= su.zone.top + R.goneR * su.risk0) { end(s, su, k, "B"); return; }
    if (su.opp != null && B.h[k] > su.opp) { end(s, su, k, "C"); return; }
    if (dd >= R.maxBars) end(s, su, k, "A2");
  }
  function confirm(s, w, k) {
    if (s.pending && s.pending.phase === "entry") { counts.busy++; return; }
    if (s.pending) counts.replaced++;
    var B = s.B, su = { tf: s.tf, S: w.S, tS: B.t[w.S], L: w.L, tL: B.t[w.Lk], ob: w.ob, stop: B.c[w.S], ext: B.l[w.S], phase: "fvg" };
    s.pending = su; counts.sweeps++;
    for (var x = w.S + 1; x <= k && s.pending === su; x++) step(s, su, x);
  }
  function closeBar(s, k) {
    var B = s.B, h = B.h, l = B.l, c = B.c, atr = s.atr[k], popped = [], x;
    while (s.highs.length && s.highs[s.highs.length - 1].v < h[k]) s.highs.pop();
    while (s.lows.length && s.lows[s.lows.length - 1].v > l[k]) popped.push(s.lows.pop());
    var K = R.swingK, j = k - K;
    if (j >= K) {
      var isH = true, isL = true;
      for (x = j - K; x <= j + K; x++) { if (x === j) continue; if (h[x] >= h[j]) isH = false; if (l[x] <= l[j]) isL = false; }
      if (isH) { s.lastSH = { v: h[j], k: j, broken: false }; s.highs.push({ v: h[j], k: j }); }
      if (isL) s.lows.push({ v: l[j], k: j });
    }
    if (isOb[s.tf]) {
      for (x = s.obs.length - 1; x >= 0; x--) { var ob = s.obs[x]; if (c[k] < ob.bot) { ob.valid = false; ob.tEnd = B.t[k] + s.tf; s.obs.splice(x, 1); allObs.splice(allObs.indexOf(ob), 1); } }
      if (s.lastSH && !s.lastSH.broken && c[k] > s.lastSH.v) { s.lastSH.broken = true; var nob = findOB(s, k); if (nob) { s.obs.push(nob); allObs.push(nob); counts.obs++; } }
    }
    if (!isSw[s.tf]) return;
    if (atr > 0 && k >= 2 && h[k] < l[k - 2] && l[k - 2] - h[k] >= R.fvgMin * atr) s.bear.push({ top: l[k - 2], bot: h[k], k: k, used: false });
    while (s.bear.length && s.bear[0].k < k - R.ifvgLookback) s.bear.shift();
    if (s.pending) step(s, s.pending, k);
    for (x = s.waits.length - 1; x >= 0; x--) { var w = s.waits[x]; if (c[k] > w.L) { s.waits.splice(x, 1); confirm(s, w, k); } else if (k - w.S >= R.sweepConfirm) s.waits.splice(x, 1); }
    if (popped.length && atr > 0 && l[k] < popped[0].v - R.sweepMin * atr) {
      var L = popped[0].v, best = null;
      for (x = 0; x < allObs.length; x++) {
        var o2 = allObs[x]; if (o2.tC > B.t[k]) continue;
        if (((l[k] >= o2.bot && l[k] <= o2.top) || (L >= o2.bot && L <= o2.top)) && (!best || o2.tf > best.tf || (o2.tf === best.tf && o2.tC > best.tC))) best = o2;
      }
      if (best) { var w2 = { S: k, L: L, Lk: popped[0].k, ob: best }; if (c[k] > L) confirm(s, w2, k); else s.waits.push(w2); }
    }
  }
  var n = m.t.length;
  for (var i = 0; i < n; i++) for (var q = 0; q < TFS.length; q++) { var s = st[TFS[q]]; if (s.ptr < s.B.t.length && s.B.i1[s.ptr] === i) { closeBar(s, s.ptr); s.ptr++; } }
  return out;
}

/* remet un setup détecté sur les prix renversés dans le sens de la vente */
function unmirror(su) {
  function zone(z) { var t = z.top; z.top = -z.bot; z.bot = -t; }
  su.ob = Object.assign({}, su.ob); zone(su.ob); /* un même OB peut servir à plusieurs setups : copie */
  if (su.zone) zone(su.zone);
  ["L", "stop", "ext", "entry", "opp", "beLiq"].forEach(function (k) { if (su[k] != null) su[k] = -su[k]; });
  return su;
}

/* résultat d'une entrée, minute par minute ; stop et objectif dans la même minute : le stop compte */
function simulate(m, su, R) {
  var dir = su.dir, risk = (su.entry - su.stop) * dir; if (!(risk > 0)) return null;
  var tp = su.entry + dir * R.tpR * risk, beL = su.entry + dir * R.beR * risk, stop = su.stop, be = false, tBe = null;
  for (var i = su.iE + 1; i < m.t.length; i++) {
    var hi = m.h[i], lo = m.l[i], op = m.o[i];
    if (dir > 0 ? lo <= stop : hi >= stop) { var px = dir > 0 ? Math.min(op, stop) : Math.max(op, stop); return { t: m.t[i], i: i, price: px, kind: be ? "be" : "sl", r: (px - su.entry) * dir / risk, tBe: tBe }; }
    if (dir > 0 ? hi >= tp : lo <= tp) return { t: m.t[i], i: i, price: tp, kind: "tp", r: R.tpR, tBe: tBe };
    if (!be && ((dir > 0 ? hi >= beL : lo <= beL) || (su.beLiq != null && (dir > 0 ? hi > su.beLiq : lo < su.beLiq)))) { be = true; stop = su.entry; tBe = m.t[i]; }
  }
  var last = m.t.length - 1;
  return { t: m.t[last], i: last, price: m.c[last], kind: "fin", r: (m.c[last] - su.entry) * dir / risk, tBe: tBe };
}

function rnd(seed) { return function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; }

/* m1 : { t (minutes UTC), o, h, l, c } triés ; renvoie setups, trades pris, statistiques, échantillon à revoir */
function run(m1, opts) {
  opts = opts || {};
  var R = RULES, counts = { A1: 0, replaced: 0, busy: 0, obs: 0, sweeps: 0 };
  var longs = detect(m1, R, counts); longs.forEach(function (su) { su.dir = 1; });
  var shorts = detect(mirror(m1), R, counts).map(unmirror); shorts.forEach(function (su) { su.dir = -1; });
  var setups = longs.concat(shorts);
  setups.forEach(function (su) {
    su.id = (opts.market || "") + "|" + (su.dir > 0 ? "A" : "V") + "|M" + su.tf + "|" + su.tS;
    su.obTf = su.ob.tf;
    if (su.entry != null && (su.reason === null || su.reason === "D" || su.reason === "F")) {
      su.risk = (su.entry - su.stop) * su.dir;
      if (su.risk > 0) { su.tp = su.entry + su.dir * R.tpR * su.risk; su.out = simulate(m1, su, R); }
    }
  });
  /* une position à la fois, puis les limites de la charte, dans l'ordre des entrées */
  var cands = setups.filter(function (su) { return su.reason === null && su.out; }).sort(function (a, b) { return a.iE - b.iE || b.tf - a.tf; });
  var busyUntil = -1, days = {}, weeks = {}, taken = [];
  cands.forEach(function (su) {
    if (su.iE <= busyUntil) { su.reason = "P"; return; }
    var dk = nyDayKey(su.tE), wk = nyWeekKey(su.tE), D = days[dk] || (days[dk] = { n: 0, streak: 0, r: 0 }), W = weeks[wk] || (weeks[wk] = { r: 0 });
    var lim = R.limits, why = D.n >= lim.perDay ? "L1" : D.streak >= lim.lossStreak ? "L2" : D.r <= -lim.dayLossR ? "L3" : W.r <= -lim.weekLossR ? "L4" : null;
    if (why) { su.reason = why; return; }
    su.taken = true; taken.push(su); busyUntil = su.out.i;
    D.n++; D.r += su.out.r; W.r += su.out.r; if (su.out.r < 0) D.streak++; else D.streak = 0;
  });
  /* statistiques des trades pris */
  var st = { n: taken.length, win: 0, loss: 0, be: 0, sum: 0, maxdd: 0, streak: 0, worst: 0, byReason: {}, byTf: {}, byObTf: {} }, peak = 0, cum = 0;
  taken.forEach(function (su) {
    var r = su.out.r; st.sum += r; cum += r; if (cum > peak) peak = cum; if (peak - cum > st.maxdd) st.maxdd = peak - cum;
    if (r > 1e-9) { st.win++; st.streak = 0; } else if (r < -1e-9) { st.loss++; st.streak++; if (st.streak > st.worst) st.worst = st.streak; } else st.be++;
    [["byTf", su.tf], ["byObTf", su.obTf]].forEach(function (g) { var o = st[g[0]][g[1]] || (st[g[0]][g[1]] = { n: 0, win: 0, sum: 0 }); o.n++; o.sum += r; if (r > 1e-9) o.win++; });
  });
  setups.forEach(function (su) { if (!su.taken) st.byReason[su.reason] = (st.byReason[su.reason] || 0) + 1; });
  st.avg = st.n ? st.sum / st.n : null; st.wr = st.n ? st.win / st.n : null;
  /* à revoir : un tirage au hasard (toujours le même pour les mêmes données) de trades pris et de setups annulés par une règle,
     limité pour rester faisable à la main (R.review) */
  var r = rnd(4242);
  function sample(list, n) { list = list.slice(); for (var i = list.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), tmp = list[i]; list[i] = list[j]; list[j] = tmp; } return list.slice(0, n); }
  var revT = sample(taken, R.review.taken), revC = sample(setups.filter(function (su) { return REVIEWABLE.indexOf(su.reason) >= 0; }), R.review.cancelled);
  var review = revT.concat(revC).sort(function (a, b) { return a.tS - b.tS; });
  return { rules: R.version, setups: setups, taken: taken, review: review, reviewTaken: revT.length, counts: counts, stats: st };
}

window.TradamaxBT = { RULES: RULES, REASONS: REASONS, run: run, aggregate: aggregate, nyWall: nyWall, nyDayKey: nyDayKey };
})();
