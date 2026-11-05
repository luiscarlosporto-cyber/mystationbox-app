/* Projetar o horário: traduz as regras da escala (simular2 do horarios.py) num problema de otimização e lê a solução.
 * O que está fixado nunca muda. Sem ecrã, para se poder testar. O cálculo corre no aparelho, com o HiGHS, num Worker. */
"use strict";
(function (raiz) {
  var ESTADOS = ["M", "T", "X", "G"];
  function dt(y, m, d) { return new Date(Date.UTC(y, m - 1, d)); }
  function iso(x) { return x.toISOString().slice(0, 10); }
  function sem(y, m, d) { return dt(y, m, d).getUTCDay(); }
  function estadoDe(c) { return c === "MT" ? "X" : c === "M" || c === "T" ? c : "G"; }
  /* p = {id, fixos: {dia: código}, ant: [códigos], fdsAnt, alvo, off: {M, T}, reforco} · op = {y, m, fer, mtSemanas, outrosM: {dia: n}, outrosT: {dia: n}} */
  function modelo(P, op) {
    var y = op.y, m = op.m, n = new Date(y, m, 0).getDate(), fer = op.fer || {}, R = [], O = [], NUM = 0, BIN = {}, CONT = [];
    var v = function (p, d, s) { return "x" + p + "_" + d + "_" + s; };
    var aux = function (peso) { var a = "a" + (++NUM); CONT.push(a); if (peso) O.push(peso + " " + a); return a; };
    var txt = function (T) { return T.map(function (t, i) { var c = t[1], s = c < 0 ? " - " : " + "; c = Math.abs(c); return (i ? s : c === t[1] ? "" : "- ") + (c === 1 ? "" : c + " ") + t[0]; }).join(""); };
    var le = function (T, r) { R.push(txt(T) + " <= " + r); }, ge = function (T, r) { R.push(txt(T) + " >= " + r); }, eq = function (T, r) { R.push(txt(T) + " = " + r); };
    var dias = []; for (var i = 1; i <= n; i++) dias.push(i);
    var fixo = function (p, d) { var c = P[p].fixos[d]; return c ? estadoDe(c) : null; };
    var C = P.findIndex(function (p) { return p.reforco; });
    var mtDias = {}; (op.mtSemanas || []).forEach(function (S) { S.forEach(function (d) { if (!fer[iso(dt(y, m, d))]) mtDias[d] = 1; }); });
    P.forEach(function (p, a) {
      dias.forEach(function (d) {
        ESTADOS.forEach(function (s) { BIN[v(a, d, s)] = 1; });
        eq(ESTADOS.map(function (s) { return [v(a, d, s), 1]; }), 1);
        var f = fixo(a, d);
        if (f) eq([[v(a, d, f), 1]], 1);
        else if (a !== C || !mtDias[d]) eq([[v(a, d, "X"), 1]], 0);
      });
      var dif1 = aux(25), dif2 = aux(25);
      eq(dias.reduce(function (T, d) { return T.concat([[v(a, d, "M"), 1], [v(a, d, "T"), 1], [v(a, d, "X"), 1]]); }, []).concat([[dif1, 1], [dif2, -1]]), p.alvo);
    });
    var outM = op.outrosM || {}, outT = op.outrosT || {}, F = P.map(function (p, a) { return a; });
    dias.forEach(function (d) {
      var mts = C >= 0 ? [[v(C, d, "X"), 1]] : [], M = F.map(function (a) { return [v(a, d, "M"), 1]; }), T = F.map(function (a) { return [v(a, d, "T"), 1]; });
      var fxM = F.filter(function (a) { return fixo(a, d) === "M"; }).length, fxT = F.filter(function (a) { return fixo(a, d) === "T"; }).length;
      if (!outM[d]) ge(M.concat(mts), 1);
      if (!outT[d]) ge(T.concat(mts), 1);
      le(M, Math.max(2 - (outM[d] || 0), fxM));
      le(T, Math.max(1 - (outT[d] || 0), fxT));
      if (C >= 0 && mtDias[d]) {
        var o = F.filter(function (a) { return a !== C; });
        le([[v(C, d, "X"), 1]].concat(o.map(function (a) { return [v(a, d, "M"), -1]; })), 0);
        le([[v(C, d, "X"), 1]].concat(o.map(function (a) { return [v(a, d, "T"), -1]; })), 0);
      }
      var w = sem(y, m, d); if (w === 0 || w === 6) le(M.concat([[aux(1), -1]]), 1);   // dupla manhã: de preferência em dia útil
    });
    (op.mtSemanas || []).forEach(function (S) {
      var L = S.filter(function (d) { return !fer[iso(dt(y, m, d))]; }); if (C < 0 || !L.length) return;
      eq(L.map(function (d) { return [v(C, d, "X"), 1]; }).concat([[aux(30), 1], [aux(30), -1]]), 1);
    });
    var fds = dias.filter(function (d) { return sem(y, m, d) === 6 && d < n; });
    P.forEach(function (p, a) {
      var prev = p.fdsAnt || "", seq = {M: "T", T: "G", G: "M"}, ult = estadoDe((p.ant || []).slice(-1)[0] || "");
      if (!prev || prev === "F" || prev === "FD") prev = ""; else prev = estadoDe(prev);
      fds.forEach(function (s) {
        var f1 = p.fixos[s], f2 = p.fixos[s + 1];
        if (f1 === "F" || f2 === "F") { prev = ""; return; }
        if (!(f1 && f2 && estadoDe(f1) !== estadoDe(f2))) ["M", "T", "G"].forEach(function (k) { eq([[v(a, s, k), 1], [v(a, s + 1, k), -1]], 0); });
        var alvo = f1 ? estadoDe(f1) : f2 ? estadoDe(f2) : seq[prev];
        if (alvo && !f1 && !f2) ge([[v(a, s, alvo), 1], [aux(40), 1]], 1);
        prev = alvo || "";
      });
      if ((ult === "T" || ult === "X") && (p.ant || []).length && !p.fixos[1]) eq([[v(a, 1, "M"), 1]], 0);
      dias.forEach(function (d) {
        if (d > 1 && !(["T", "X"].indexOf(fixo(a, d - 1)) >= 0 && fixo(a, d) === "M")) le([[v(a, d - 1, "T"), 1], [v(a, d - 1, "X"), 1], [v(a, d, "M"), 1]], 1);
        var T = [], k = 0, ant = (p.ant || []).map(function (c) { return estadoDe(c); });
        for (var j = d - 5; j <= d; j++) {
          if (j >= 1) { if (!(fixo(a, j) && fixo(a, j) !== "G")) T.push([v(a, j, "G"), 1]); }
          else { var q = ant[ant.length + j - 1]; if (q === undefined || q === "G") k = 1; }
        }
        if (!k && T.length) ge(T, 1);
        if (d > 1) [["M", "T"], ["T", "M"]].forEach(function (par) { le([[v(a, d - 1, par[0]), 1], [v(a, d, par[1]), 1], [aux(3), -1]], 1); });
        if (d > 1 && d < n) {
          le([[v(a, d, "G"), 1], [v(a, d - 1, "G"), -1], [v(a, d + 1, "G"), -1], [aux(2), -1]], 0);
          le([[v(a, d - 1, "G"), 1], [v(a, d + 1, "G"), 1], [v(a, d, "G"), -1], [aux(4), -1]], 1);
        }
        if (d < n - 1) le([[v(a, d, "G"), 1], [v(a, d + 1, "G"), 1], [v(a, d + 2, "G"), 1], [aux(4), -1]], 2);
      });
      var mm = dias.map(function (d) { return [v(a, d, "M"), 1]; }), tt = dias.map(function (d) { return [v(a, d, "T"), 1]; }), b = aux(0.5), neg = function (L) { return L.map(function (t) { return [t[0], -t[1]]; }); };
      le(mm.concat(neg(tt)).concat([[b, -1]]), 0); le(tt.concat(neg(mm)).concat([[b, -1]]), 0);
      var fe = dias.filter(function (d) { return fer[iso(dt(y, m, d))]; });
      if (fe.length) {
        var hv = []; fe.forEach(function (d) { hv.push([v(a, d, "M"), 1], [v(a, d, "T"), 1]); });
        var tg = Math.round(2 * fe.length / P.length), h = aux(2); le(hv.concat([[h, -1]]), tg); le(neg(hv).concat([[h, -1]]), -tg);
      }
    });
    ["M", "T"].forEach(function (s) {   // equilíbrio entre pessoas, também no acumulado dos meses (off)
      var hi = "e" + (++NUM), lo = "e" + (++NUM); CONT.push(hi, lo); O.push("10 " + hi, "- 10 " + lo);
      P.forEach(function (p, a) {
        var co = dias.map(function (d) { return [v(a, d, s), 1]; }); if (a === C) dias.forEach(function (d) { co.push([v(a, d, "X"), 1]); });
        var off = (p.off && p.off[s]) || 0;
        le(co.concat([[hi, -1]]), -off); ge(co.concat([[lo, -1]]), -off);
      });
    });
    var ob = O.join(" + ").replace(/\+ - /g, "- ");
    var lp = "Minimize\n obj: " + ob + "\nSubject To\n" + R.map(function (r, i) { return " c" + i + ": " + r; }).join("\n") + "\nBinary\n " + Object.keys(BIN).join(" ") + "\nEnd\n";
    return lp;
  }
  function ler(P, op, col) {   // solução → {índice da pessoa: {dia: código}}
    var n = new Date(op.y, op.m, 0).getDate(), S = {X: "MT", G: "FG", M: "M", T: "T"}, out = [];
    P.forEach(function (p, a) { var g = {}; for (var d = 1; d <= n; d++) { var b = "G", mx = -1; ESTADOS.forEach(function (s) { var c = col["x" + a + "_" + d + "_" + s]; var val = c ? c.Primal : 0; if (val > mx) { mx = val; b = s; } }); g[d] = p.fixos[d] || S[b]; } out.push(g); });
    return out;
  }
  /* turnos de cada pessoa: a meta; se não chegam para cobrir o mês, o que falta reparte-se por igual, primeiro por quem tem menos extra no ano */
  function alvos(P, precisos) {
    var soma = P.reduce(function (s, p) { return s + p.meta; }, 0), ex = precisos - soma;
    P.forEach(function (p) { p.alvo = p.meta; }); if (ex <= 0) return;
    var ord = P.slice().sort(function (a, b) { return (a.extraAno || 0) - (b.extraAno || 0); });
    for (var i = 0; i < ex; i++) ord[i % ord.length].alvo++;
  }
  var G = {modelo: modelo, ler: ler, alvos: alvos};
  if (typeof module !== "undefined") module.exports = G; else raiz.HORG = G;
})(typeof window !== "undefined" ? window : this);
