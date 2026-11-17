/* Tradamax · moteur de backtest : applique les règles de la stratégie du trader aux bougies M1.
   Fonctions pures, sans réseau ni accès à la page : window.TradamaxBT.run(m1) renvoie les setups,
   les trades pris et les statistiques. Simulation sur le passé uniquement : aucun ordre n'est jamais passé.
   Les ventes sont détectées en appliquant les règles d'achat aux prix renversés (miroir), puis remises à l'endroit. */
(function () {
"use strict";

/* Règles v4 : section 8 du document de règles. Distances en ATR 14.
   v2 : entrée par ordre limite sur le bord de la zone (haut du FVG/IFVG à l'achat), exécuté minute par minute ;
        annulations D (retour violent tardif) et F (clôture de l'autre côté de la zone) supprimées.
   v3 : pas d'entrée sur la bougie qui suit directement la formation de la zone (ordre exécutable à partir de la 2e).
   v4 (d'après les 36 premiers avis du trader, 17/11/2026) : trades dans la tendance H1 seulement ; un OB ne vaut que si
        le déplacement qui le suit laisse un FVG ; le creux pris doit être significatif (plus bas de N bougies) et, quand
        plusieurs creux sont pris d'un coup, c'est le plus profond qui compte ; le FVG inversé doit s'être formé pendant le
        mouvement vers la liquidité ; FVG et IFVG superposés repérés ; taille minimale du FVG relevée.
   v5 (décision du gérant, 17/11/2026, après l'analyse des 524 trades v4) : jamais d'entrée sur un IFVG seul, la zone est
        un FVG, superposé ou non à un IFVG ; aucun trade pendant la session asiatique (18 h–2 h, heure de New York). */
var RULES = {
  version: "v5 du 17/11/2026",
  obTfs: [3, 5, 15, 30, 60],   /* unités où l'on cherche l'OB */
  sweepTfs: [1, 3, 5],         /* unités de la prise de liquidité, du FVG/IFVG et de l'entrée */
  swingK: 2,                   /* sommet ou creux de swing : 2 bougies de chaque côté */
  atrN: 14,
  dispBody: 1,                 /* déplacement : corps d'au moins 1 ATR… */
  dispQuarter: .25,            /* …clôture dans le quart extrême de la bougie */
  legMax: 3,                   /* bougies du déplacement qui casse la structure */
  obMax: 3,                    /* l'OB : 1 à 3 bougies opposées consécutives */
  obNeedsFvg: true,            /* v4 : l'OB n'est retenu que si son déplacement laisse un FVG… */
  obFvgWithin: 3,              /* …formé au plus tard 3 bougies après la cassure de structure… */
  obFvgMin: .1,                /* …d'au moins 0,1 ATR (un vrai écart, même petit) */
  riskMinAtr: .5,              /* v4 : stop à moins de 0,5 ATR de l'entrée : trade refusé (stop trop proche) */
  sweepMin: .05,               /* la mèche dépasse le creux d'au moins 0,05 ATR */
  sweepConfirm: 3,             /* une clôture revient au-dessus dans les 3 bougies */
  liqDeepest: true,            /* v4 : plusieurs creux pris d'un coup : c'est le plus profond qui compte */
  liqMinDepth: 20,             /* v4 : le creux pris est le plus bas des N bougies qui le précèdent (sinon, pas de liquidité) */
  fvgMin: .5,                  /* écart minimal d'un FVG, en ATR (v4 : relevé de 0,3 à 0,5) */
  ifvgScope: "move",           /* v4 : le FVG inversé s'est formé pendant le mouvement vers la liquidité ("bars" : dans les ifvgLookback dernières bougies) */
  ifvgLookback: 20, ifvgKeep: 80,
  maxBars: 5,                  /* FVG/IFVG puis entrée : entre 1 et 5 bougies (l'ordre limite reste actif 5 bougies) */
  firstFillBar: 2,             /* on ne rentre pas directement : l'ordre ne s'exécute qu'à partir de la 2e bougie après la zone */
  goneR: 1,                    /* annulation B : le prix est déjà à +1 R du bord de la zone */
  tpR: 2, beR: 1,              /* objectif 2 R ; stop au point d'entrée dès +1 R ou une prise de liquidité */
  trendTf: 15, trendFilter: true, /* v4 : tendance = dernière cassure de structure (M15 par défaut, au choix au lancement) ; trades dans ce sens seulement */
  noTrade: [{ s: 1080, e: 120, label: "Asie" }], /* v5 : plages sans trade, en minutes de la journée de New York (18 h → 2 h) ; jugées au moment de la prise de liquidité */
  limits: { perDay: 3, lossStreak: 2, dayLossR: 2, weekLossR: 5 },
  review: { taken: 60, cancelled: 30 }, /* setups tirés au hasard pour la revue par le trader */
  /* période de contrôle : à partir de ce mois, les données ne servent jamais à régler les règles.
     Le backtest normal et la revue s'arrêtent avant ; le test de contrôle s'y lance une seule fois par version des règles.
     Toute modification des règles doit changer « version ». */
  controlFrom: "2025-01"
};
var TFS = [60, 30, 15, 5, 3, 1]; /* ordre de traitement d'une même minute : unités hautes d'abord */
function tfName(tf) { return tf >= 60 ? "H" + tf / 60 : "M" + tf; }
var REASONS = {
  A2: "Pas de retour dans la zone dans les 5 bougies",
  B: "Le prix est parti sans nous (+1 R avant l'entrée)",
  C: "Liquidité prise en face avant l'entrée",
  E: "OB cassé avant l'entrée",
  G: "Stop du mauvais côté de l'entrée",
  R: "Stop trop proche de l'entrée (moins de 0,5 ATR)",
  S: "Session asiatique (18 h–2 h, New York)",
  T: "Contre la tendance",
  P: "Position déjà ouverte",
  L1: "3 trades déjà pris ce jour-là",
  L2: "2 pertes de suite ce jour-là",
  L3: "Perte du jour de 2 R atteinte",
  L4: "Perte de la semaine de 5 R atteinte",
  /* comptés seulement (pas de setup à revoir) */
  A1: "Pas de FVG ni d'IFVG dans les 5 bougies",
  O: "OB écarté : pas de FVG dans son déplacement",
  Q: "Creux pris trop peu significatif"
};
var REVIEWABLE = ["A2", "B", "C", "E", "G", "R", "S", "T"];
/* zone d'entrée choisie au lancement : un FVG (superposé ou non à un IFVG), ou seulement les FVG superposés à un IFVG ; le choix s'ajoute à la version */
var ZONES = { both: "", overlap: " · FVG et IFVG superposés" };
/* unité de la tendance choisie au lancement (0 : sans filtre) ; le choix s'ajoute à la version */
var TRENDS = { "15": "", "60": " · tendance H1", "240": " · tendance H4", "0": " · sans tendance" };

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
/* minute de la journée de New York (0 à 1439) et test d'une plage, qui peut passer minuit */
function nyMinOfDay(tMin) { return ((nyWall(tMin) % 1440) + 1440) % 1440; }
function inRange(wmin, r) { return r.s > r.e ? (wmin >= r.s || wmin < r.e) : (wmin >= r.s && wmin < r.e); }
function isSwing(B, j, K, high) { for (var x = j - K; x <= j + K; x++) { if (x === j) continue; if (high ? B.h[x] >= B.h[j] : B.l[x] <= B.l[j]) return false; } return true; }

/* ---- tendance : dernière cassure de structure sur l'unité de tendance (clôture au-delà du dernier sommet ou creux de swing).
   Pour chaque minute i : la tendance connue à la fin de cette minute (1 haussière, −1 baissière, 0 pas encore de cassure). ---- */
function trendOf(m, tf, K) {
  var B = aggregate(m, tf), n = m.t.length, arr = new Int8Array(n), changes = [], SH = null, SL = null, cur = 0, ptr = 0;
  for (var i = 0; i < n; i++) {
    while (ptr < B.t.length && B.i1[ptr] === i) {
      var k = ptr, j = k - K;
      if (j >= K) { if (isSwing(B, j, K, true)) SH = { v: B.h[j], k: j, broken: false }; if (isSwing(B, j, K, false)) SL = { v: B.l[j], k: j, broken: false }; }
      if (SH && !SH.broken && B.c[k] > SH.v) { SH.broken = true; cur = 1; changes.push({ i: i, dir: 1, t: B.t[k] + tf, level: SH.v }); }
      else if (SL && !SL.broken && B.c[k] < SL.v) { SL.broken = true; cur = -1; changes.push({ i: i, dir: -1, t: B.t[k] + tf, level: SL.v }); }
      ptr++;
    }
    arr[i] = cur;
  }
  function at(i) { for (var x = changes.length - 1; x >= 0; x--) if (changes[x].i <= i) return changes[x]; return null; }
  return { tf: tf, arr: arr, at: at };
}

/* ---- détection des setups à l'achat (les ventes passent par le miroir) ---- */
function detect(m, R, counts, trend, want) {
  var st = {}, allObs = [], out = [], isOb = {}, isSw = {};
  R.obTfs.forEach(function (t) { isOb[t] = true; }); R.sweepTfs.forEach(function (t) { isSw[t] = true; });
  TFS.forEach(function (tf) { var B = aggregate(m, tf); st[tf] = { tf: tf, B: B, atr: atrOf(B, R.atrN), ptr: 0, highs: [], lows: [], lastSH: null, obs: [], newObs: [], bear: [], waits: [], pending: null }; });

  /* FVG haussier dont la bougie du milieu est x : l'écart entre le haut de x−1 et le bas de x+1 */
  function fvgAt(B, x, atr) { if (x < 1 || x + 1 >= B.t.length) return null; var g = B.l[x + 1] - B.h[x - 1]; return g > 0 && g >= R.obFvgMin * atr ? { bot: B.h[x - 1], top: B.l[x + 1], x: x, tC: B.t[x + 1] + B.tf } : null; }
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
    var ob = { tf: s.tf, t0: B.t[g0], tC: B.t[k] + s.tf, n: g1 - g0 + 1, top: top, bot: bot, size: (top - bot) / atr, valid: true, tEnd: null, fvg: null, j: j, k: k, deadline: k + R.obFvgWithin };
    for (x = j; x <= k - 1; x++) { var f = fvgAt(B, x, atr); if (f) { ob.fvg = f; break; } } /* FVG déjà visible dans le déplacement */
    return ob;
  }
  /* un OB tout neuf attend son FVG quelques bougies ; sans FVG, il est écarté (règle v4) */
  function checkNewObs(s, k) {
    var B = s.B, atr = s.atr[k];
    for (var x = s.newObs.length - 1; x >= 0; x--) {
      var ob = s.newObs[x]; if (ob.fvg) { s.newObs.splice(x, 1); continue; }
      var f = fvgAt(B, k - 1, atr); if (f && k - 2 >= ob.j - 1) ob.fvg = f;
      if (ob.fvg) { s.newObs.splice(x, 1); continue; }
      if (k >= ob.deadline) { s.newObs.splice(x, 1); if (R.obNeedsFvg) { ob.valid = false; ob.fvg = false; var p = s.obs.indexOf(ob); if (p >= 0) s.obs.splice(p, 1); p = allObs.indexOf(ob); if (p >= 0) allObs.splice(p, 1); counts.O++; } }
    }
  }
  function end(s, su, k, reason, j) {
    /* moment de la décision : la minute précise (j) quand elle est connue, sinon la fin de la bougie */
    var B = s.B;
    if (reason === null) { if (su.off) reason = "S"; else if (su.ct) reason = "T"; } /* setup complet mais hors session ou contre la tendance : non pris, mais à revoir */
    su.reason = reason;
    if (j != null) { su.iD = j; su.tD = m.t[j] + 1; } else { su.tD = B.t[k] + s.tf; su.iD = B.i1[k]; }
    if (s.pending === su) s.pending = null;
    if (reason === "A1") { counts.A1++; return; }
    out.push(su);
  }
  function step(s, su, k) {
    var B = s.B, atr = s.atr[k], x;
    if (su.phase === "fvg") {
      var d = k - su.S; if (d < 1) return;
      /* z1 : FVG tout neuf (3 bougies), la seule zone d'entrée (v5 : jamais d'IFVG seul) ;
         z2 : IFVG, un FVG baissier formé pendant le mouvement vers la liquidité et traversé par la clôture, retenu seulement s'il se superpose au FVG */
      var z1 = null, z2 = null, inv = null;
      if (k >= 2 && B.l[k] > B.h[k - 2] && B.l[k] - B.h[k - 2] >= R.fvgMin * atr) z1 = { type: "FVG", top: B.l[k], bot: B.h[k - 2], t0: B.t[k - 2], size: (B.l[k] - B.h[k - 2]) / atr };
      if (z1) for (x = s.bear.length - 1; x >= 0; x--) {
        var f = s.bear[x]; if (f.used || f.k >= k || f.k > su.S) continue;
        if (R.ifvgScope === "move" ? f.k < su.moveK : f.k < k - R.ifvgLookback) continue;
        if (B.c[k] > f.top && z1.bot < f.top && f.bot < z1.top) { inv = f; z2 = { type: "IFVG", top: f.top, bot: f.bot, t0: B.t[f.k - 2], size: (f.top - f.bot) / atr, age: k - f.k }; break; }
      }
      var ov = !!(z1 && z2), z = null;
      if (R.zones === "overlap") { if (ov) z = z1; } else z = z1;
      if (z) {
        z = Object.assign({}, z);
        if (ov) { z.type = "FVG+IFVG"; z.parts = [z1, z2]; z.common = { top: Math.min(z1.top, z2.top), bot: Math.max(z1.bot, z2.bot) }; inv.used = true; }
        z.tC = B.t[k] + s.tf; su.zone = z; su.F = k; su.phase = "entry"; su.atr = atr;
        var hi = -Infinity; for (x = su.S; x <= k; x++) if (B.h[x] > hi) hi = B.h[x];
        su.opp = nearestAbove(s.highs, hi); su.risk0 = z.top - su.stop;
        if (su.stop >= z.top) end(s, su, k, "G"); /* le stop serait au-dessus de l'ordre : pas d'ordre possible */
        return;
      }
      if (d >= R.maxBars) end(s, su, k, "A1");
      return;
    }
    var dd = k - su.F; if (dd < 1) return;
    /* ordre limite posé en haut de la zone à sa création : on rejoue chaque minute de la bougie, dans l'ordre */
    for (var j = B.i0[k]; j <= B.i1[k]; j++) {
      if (!su.ob.valid && su.ob.tEnd != null && su.ob.tEnd <= m.t[j]) { end(s, su, k, "E", j); return; }
      if (dd >= R.firstFillBar && m.l[j] <= su.zone.top) { /* ordre exécuté (au prix d'ouverture si le prix saute par-dessus) ; jamais sur la 1re bougie */
        su.entry = Math.min(m.o[j], su.zone.top); su.kE = k; su.iE = j; su.tE = m.t[j] + 1; su.nth = dd; su.beLiq = nearestAbove(s.highs, su.entry);
        end(s, su, k, su.stop >= su.entry ? "G" : (su.entry - su.stop) < R.riskMinAtr * su.atr ? "R" : null, j); return;
      }
      if (su.risk0 > 0 && m.h[j] >= su.zone.top + R.goneR * su.risk0) { end(s, su, k, "B", j); return; }
      if (su.opp != null && m.h[j] > su.opp) { end(s, su, k, "C", j); return; }
    }
    if (dd >= R.maxBars) end(s, su, k, "A2");
  }
  function confirm(s, w, k) {
    if (s.pending && s.pending.phase === "entry") { counts.busy++; return; }
    if (s.pending) counts.replaced++;
    var B = s.B, iS = B.i1[w.S], tr = trend ? trend.arr[iS] : 0, wmin = nyMinOfDay(B.t[w.S] + s.tf);
    var su = { tf: s.tf, S: w.S, iS: iS, tS: B.t[w.S], L: w.L, tL: B.t[w.Lk], depth: w.depth, ob: w.ob, stop: B.c[w.S], ext: B.l[w.S], phase: "fvg",
      moveK: s.highs.length ? s.highs[s.highs.length - 1].k : Math.max(0, w.S - R.ifvgLookback), tr: tr, ct: !!(R.trendFilter && tr !== want),
      off: (R.noTrade || []).some(function (r) { return inRange(wmin, r); }) }; /* prise de liquidité pendant une plage sans trade */
    s.pending = su; counts.sweeps++;
    for (var x = w.S + 1; x <= k && s.pending === su; x++) step(s, su, x);
  }
  function closeBar(s, k) {
    var B = s.B, h = B.h, l = B.l, c = B.c, atr = s.atr[k], popped = [], x;
    while (s.highs.length && s.highs[s.highs.length - 1].v < h[k]) s.highs.pop();
    while (s.lows.length && s.lows[s.lows.length - 1].v > l[k]) popped.push(s.lows.pop());
    var K = R.swingK, j = k - K;
    if (j >= K) {
      if (isSwing(B, j, K, true)) { s.lastSH = { v: h[j], k: j, broken: false }; s.highs.push({ v: h[j], k: j }); }
      if (isSwing(B, j, K, false)) { var dpt = 0; while (j - 1 - dpt >= 0 && l[j - 1 - dpt] > l[j] && dpt < 2000) dpt++; s.lows.push({ v: l[j], k: j, depth: dpt }); }
    }
    if (isOb[s.tf]) {
      for (x = s.obs.length - 1; x >= 0; x--) { var ob = s.obs[x]; if (c[k] < ob.bot) { ob.valid = false; ob.tEnd = B.t[k] + s.tf; s.obs.splice(x, 1); allObs.splice(allObs.indexOf(ob), 1); } }
      checkNewObs(s, k);
      if (s.lastSH && !s.lastSH.broken && c[k] > s.lastSH.v) { s.lastSH.broken = true; var nob = findOB(s, k); if (nob) { s.obs.push(nob); allObs.push(nob); counts.obs++; if (!nob.fvg) s.newObs.push(nob); } }
    }
    if (!isSw[s.tf]) return;
    if (atr > 0 && k >= 2 && h[k] < l[k - 2] && l[k - 2] - h[k] >= R.fvgMin * atr) s.bear.push({ top: l[k - 2], bot: h[k], k: k, used: false });
    while (s.bear.length && s.bear[0].k < k - R.ifvgKeep) s.bear.shift();
    if (s.pending) step(s, s.pending, k);
    for (x = s.waits.length - 1; x >= 0; x--) { var w = s.waits[x]; if (c[k] > w.L) { s.waits.splice(x, 1); confirm(s, w, k); } else if (k - w.S >= R.sweepConfirm) s.waits.splice(x, 1); }
    if (popped.length && atr > 0) {
      var pk = R.liqDeepest ? popped[popped.length - 1] : popped[0]; /* v4 : le plus profond des creux pris */
      if (l[k] < pk.v - R.sweepMin * atr) {
        var L = pk.v, best = null;
        for (x = 0; x < allObs.length; x++) {
          var o2 = allObs[x]; if (o2.tC > B.t[k] || (R.obNeedsFvg && !(o2.fvg && o2.fvg.tC <= B.t[k]))) continue;
          if (((l[k] >= o2.bot && l[k] <= o2.top) || (L >= o2.bot && L <= o2.top)) && (!best || o2.tf > best.tf || (o2.tf === best.tf && o2.tC > best.tC))) best = o2;
        }
        if (best && pk.depth < R.liqMinDepth) { counts.Q++; best = null; } /* creux trop peu significatif : compté seulement quand un OB correspondait */
        if (best) { var w2 = { S: k, L: L, Lk: pk.k, depth: pk.depth, ob: best }; if (c[k] > L) confirm(s, w2, k); else s.waits.push(w2); }
      }
    }
  }
  var n = m.t.length;
  for (var i = 0; i < n; i++) for (var q = 0; q < TFS.length; q++) { var s = st[TFS[q]]; if (s.ptr < s.B.t.length && s.B.i1[s.ptr] === i) { closeBar(s, s.ptr); s.ptr++; } }
  return out;
}

/* remet un setup détecté sur les prix renversés dans le sens de la vente */
function unmirror(su) {
  function zone(z) { var t = z.top; z.top = -z.bot; z.bot = -t; }
  su.ob = Object.assign({}, su.ob); zone(su.ob); if (su.ob.fvg) { su.ob.fvg = Object.assign({}, su.ob.fvg); zone(su.ob.fvg); }
  if (su.zone) { zone(su.zone); if (su.zone.parts) su.zone.parts = su.zone.parts.map(function (p) { p = Object.assign({}, p); zone(p); return p; }); if (su.zone.common) zone(su.zone.common); }
  ["L", "stop", "ext", "entry", "opp", "beLiq"].forEach(function (k) { if (su[k] != null) su[k] = -su[k]; });
  return su;
}

/* résultat d'une entrée, minute par minute ; stop et objectif dans la même minute : le stop compte */
function simulate(m, su, R) {
  var dir = su.dir, risk = (su.entry - su.stop) * dir; if (!(risk > 0)) return null;
  var tp = su.entry + dir * R.tpR * risk, beL = su.entry + dir * R.beR * risk, stop = su.stop, be = false, tBe = null;
  for (var i = su.iE; i < m.t.length; i++) {
    var hi = m.h[i], lo = m.l[i], op = i === su.iE ? su.entry : m.o[i];
    if (dir > 0 ? lo <= stop : hi >= stop) { var px = dir > 0 ? Math.min(op, stop) : Math.max(op, stop); return { t: m.t[i], i: i, price: px, kind: be ? "be" : "sl", r: (px - su.entry) * dir / risk, tBe: tBe }; }
    if (i === su.iE) continue; /* minute de l'entrée : seul le stop compte (on ne sait pas si l'objectif viendrait avant ou après) */
    if (dir > 0 ? hi >= tp : lo <= tp) return { t: m.t[i], i: i, price: tp, kind: "tp", r: R.tpR, tBe: tBe };
    if (!be && ((dir > 0 ? hi >= beL : lo <= beL) || (su.beLiq != null && (dir > 0 ? hi > su.beLiq : lo < su.beLiq)))) { be = true; stop = su.entry; tBe = m.t[i]; }
  }
  var last = m.t.length - 1;
  return { t: m.t[last], i: last, price: m.c[last], kind: "fin", r: (m.c[last] - su.entry) * dir / risk, tBe: tBe };
}

function rnd(seed) { return function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; }

/* m1 : { t (minutes UTC), o, h, l, c } triés ; renvoie setups, trades pris, statistiques, échantillon à revoir.
   opts.zones : type de zone ; opts.rules : réglages d'essai (la version est alors marquée « essai », jamais un test de contrôle). */
function run(m1, opts) {
  opts = opts || {};
  var zones = ZONES[opts.zones] ? opts.zones : "both", tsel = opts.trend != null && TRENDS[String(opts.trend)] != null ? String(opts.trend) : "15";
  var R = Object.assign({}, RULES, opts.rules || {}, { zones: zones });
  if (opts.trend != null) { R.trendFilter = +tsel > 0; if (+tsel > 0) R.trendTf = +tsel; }
  R.version = RULES.version + ZONES[zones] + TRENDS[tsel] + (opts.rules ? " · essai" : "");
  var counts = { A1: 0, O: 0, Q: 0, replaced: 0, busy: 0, obs: 0, sweeps: 0 };
  var trend = trendOf(m1, R.trendTf, R.swingK);
  var longs = detect(m1, R, counts, trend, 1); longs.forEach(function (su) { su.dir = 1; });
  var shorts = detect(mirror(m1), R, counts, trend, -1).map(unmirror); shorts.forEach(function (su) { su.dir = -1; });
  var setups = longs.concat(shorts);
  setups.forEach(function (su) {
    su.id = (opts.market || "") + "|" + (su.dir > 0 ? "A" : "V") + "|M" + su.tf + "|" + su.tS;
    su.obTf = su.ob.tf;
    var ch = trend.at(su.iS); su.trend = { tf: R.trendTf, dir: su.tr, t: ch ? ch.t : null, level: ch ? ch.level : null, ok: !su.ct };
    if (su.entry != null && (su.reason === null || su.reason === "T" || su.reason === "S" || su.reason === "R")) {
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
  var st = { n: taken.length, win: 0, loss: 0, be: 0, sum: 0, maxdd: 0, streak: 0, worst: 0, byReason: {}, byTf: {}, byObTf: {}, byZone: {} }, peak = 0, cum = 0;
  taken.forEach(function (su) {
    var r = su.out.r; st.sum += r; cum += r; if (cum > peak) peak = cum; if (peak - cum > st.maxdd) st.maxdd = peak - cum;
    if (r > 1e-9) { st.win++; st.streak = 0; } else if (r < -1e-9) { st.loss++; st.streak++; if (st.streak > st.worst) st.worst = st.streak; } else st.be++;
    [["byTf", su.tf], ["byObTf", su.obTf], ["byZone", su.zone.type]].forEach(function (g) { var o = st[g[0]][g[1]] || (st[g[0]][g[1]] = { n: 0, win: 0, sum: 0 }); o.n++; o.sum += r; if (r > 1e-9) o.win++; });
  });
  setups.forEach(function (su) { if (!su.taken) st.byReason[su.reason] = (st.byReason[su.reason] || 0) + 1; });
  ["A1", "O", "Q"].forEach(function (c) { if (counts[c]) st.byReason[c] = counts[c]; });
  st.avg = st.n ? st.sum / st.n : null; st.wr = st.n ? st.win / st.n : null;
  /* à revoir : un tirage au hasard (toujours le même pour les mêmes données) de trades pris et de setups annulés par une règle,
     limité pour rester faisable à la main (R.review) */
  var r = rnd(4242);
  function sample(list, n) { list = list.slice(); for (var i = list.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), tmp = list[i]; list[i] = list[j]; list[j] = tmp; } return list.slice(0, n); }
  var revT = sample(taken, R.review.taken), revC = sample(setups.filter(function (su) { return REVIEWABLE.indexOf(su.reason) >= 0; }), R.review.cancelled);
  var review = revT.concat(revC).sort(function (a, b) { return a.tS - b.tS; });
  return { rules: R.version, setups: setups, taken: taken, review: review, reviewTaken: revT.length, counts: counts, stats: st, trend: trend };
}

window.TradamaxBT = { RULES: RULES, REASONS: REASONS, ZONES: ZONES, TRENDS: TRENDS, tfName: tfName, run: run, aggregate: aggregate, atrOf: atrOf, trendOf: trendOf, nyWall: nyWall, nyDayKey: nyDayKey };
})();
