/* Regras da escala. Só contas, sem ecrã, para se poderem testar: node app/testes/horario.js
 * Espelha verificar() do horarios.py nos erros (cobertura, T→M, dias seguidos) e acrescenta os avisos das restantes regras. */
"use strict";
(function (raiz) {
  var TRAB = {M: 1, T: 1, MT: 1};
  function dt(y, m, d) { return new Date(Date.UTC(y, m - 1, d)); }
  function iso(x) { return x.toISOString().slice(0, 10); }
  /* semanas seg-dom cuja quinta-feira cai neste mês, só com dias deste mês */
  function semanasMT(y, m, n, fer) {
    var S = {};
    for (var d = 1; d <= n; d++) { var x = dt(y, m, d), w = (x.getUTCDay() + 6) % 7, q = new Date(x.getTime() + (3 - w) * 864e5); if (q.getUTCMonth() + 1 === m) (S[iso(q)] = S[iso(q)] || []).push(d); }
    return Object.keys(S).map(function (k) { return S[k]; }).filter(function (L) { return L.some(function (d) { var w = dt(y, m, d).getUTCDay(); return w > 0 && w < 6 && !fer[iso(dt(y, m, d))]; }); });
  }
  function meta(y, m, n, fer) { var t = 0; for (var d = 1; d <= n; d++) { var w = dt(y, m, d).getUTCDay(); if (w > 0 && w < 6 && !fer[iso(dt(y, m, d))]) t++; } return t; }
  /* L = [{nome, dias: [códigos do mês], ant: [códigos dos dias anteriores], escala, fdsAnt}] · op = {y, m, fer, mt, semMT} */
  /* Lista de emails para o envio: sem repetidos; os que não forem válidos ficam à parte. */
  function emails(L) {
    var ok = [], maus = [];
    L.forEach(function (e) { var t = String(e || "").trim().toLowerCase(); if (!t) return; if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(t)) maus.push(t); else if (ok.indexOf(t) < 0) ok.push(t); });
    return {ok: ok, maus: maus};
  }
  function verificar(L, op) {
    var y = op.y, m = op.m, n = new Date(y, m, 0).getDate(), fer = op.fer || {}, E = [], A = [];
    function erro(d, t) { E.push({dia: d, msg: t}); } function aviso(d, t) { A.push({dia: d, msg: t}); }
    for (var d = 1; d <= n; d++) {
      var c = L.map(function (p) { return p.dias[d - 1] || ""; });
      if (!c.some(function (x) { return x === "M" || x === "MT"; })) erro(d, "dia " + d + ": sem manhã");
      if (!c.some(function (x) { return x === "T" || x === "MT"; })) erro(d, "dia " + d + ": sem tarde");
      if (c.filter(function (x) { return x === "T"; }).length > 1) aviso(d, "dia " + d + ": mais de uma pessoa de tarde");
    }
    L.forEach(function (p) {
      var v = (p.ant || []).map(function (x) { return TRAB[x] ? x : "FG"; }).concat(p.dias.slice(0, n).map(function (x) { return x || ""; })), off = v.length - n, run = 0;
      for (var i = 0; i < v.length; i++) {
        if (i >= off && i > 0 && (v[i - 1] === "T" || v[i - 1] === "MT") && v[i] === "M") erro(i - off + 1, p.nome + ": T→M no dia " + (i - off + 1));
        run = TRAB[v[i]] ? run + 1 : 0;
        if (run > 5 && i >= off) erro(i - off + 1, p.nome + ": mais de 5 dias seguidos até ao dia " + (i - off + 1));
      }
      if (!op.mt && p.dias.indexOf("MT") >= 0) erro(p.dias.indexOf("MT") + 1, p.nome + ": MT não existe nesta loja");
      if (p.escala === false) return;
      var seq = {M: "T", T: "FG", FG: "M"}, prev = p.fdsAnt || "";
      for (var s = 1; s < n; s++) {
        if (dt(y, m, s).getUTCDay() !== 6) continue;
        var a = p.dias[s - 1] || "", b = p.dias[s] || ""; if (!a || !b || a === "F" || b === "F") { prev = ""; continue; }
        if (a !== b) aviso(s, p.nome + ": sábado " + s + " e domingo diferentes");
        else if (prev && seq[prev] && seq[prev] !== a) aviso(s, p.nome + ": fim de semana " + s + " fora da rotação (" + prev + " → " + a + ")");
        prev = a === b ? a : "";
      }
    });
    if (op.mt) {
      if (!op.semMT) semanasMT(y, m, n, fer).forEach(function (S) {
        var k = 0; S.forEach(function (d) { L.forEach(function (p) { if (p.dias[d - 1] === "MT") k++; }); });
        if (k !== 1) aviso(S[0], "semana de " + S[0] + " a " + S[S.length - 1] + ": " + k + " MT (devia ser 1)");
      });
      for (var f = 1; f <= n; f++) if (fer[iso(dt(y, m, f))]) L.forEach(function (p) { if (p.dias[f - 1] === "MT") aviso(f, p.nome + ": MT em feriado, dia " + f); });
    }
    var base = meta(y, m, n, fer);
    var metas = L.filter(function (p) { return p.escala !== false; }).map(function (p) {
      var fu = 0, tur = 0; p.dias.forEach(function (c, i) { if (TRAB[c]) tur++; var w = dt(y, m, i + 1).getUTCDay(); if (c === "F" && w > 0 && w < 6 && !fer[iso(dt(y, m, i + 1))]) fu++; });
      var ab = p.abate || 0;   // dias especiais pagos (baixa, formação, aniversário, outros)
      return {nome: p.nome, turnos: tur, meta: base - fu - ab, ferias: fu, ausencias: fu + ab, extra: (tur - (base - fu - ab)) * 8};
    });
    return {erros: E, avisos: A, metas: metas, base: base};
  }
  /* Turnos acima da meta em dias úteis, 1 por semana quando possível, a começar pelas semanas com mais turnos (escolher_extras do horarios.py) → {nome: [dias]} */
  function extras(L, op) {
    var y = op.y, m = op.m, fer = op.fer || {}, M = verificar(L, op).metas, E = L.filter(function (p) { return p.escala !== false; }), res = {};
    var util = function (d) { var w = dt(y, m, d).getUTCDay(); return w > 0 && w < 6 && !fer[iso(dt(y, m, d))]; };
    E.forEach(function (p, i) {
      var k = M[i].turnos - M[i].meta, r = res[p.nome] = [], S = {}, ch = [];
      if (k <= 0) return;
      p.dias.forEach(function (c, j) { var d = j + 1, x = dt(y, m, d), s = iso(new Date(x.getTime() - ((x.getUTCDay() + 6) % 7) * 864e5)); if (!S[s]) { S[s] = []; ch.push(s); } S[s].push(d); });
      var peso = function (s) { return S[s].filter(function (d) { return TRAB[p.dias[d - 1]]; }).length - S[s].filter(util).length; };
      var ord = ch.map(function (s, a) { return [s, a, peso(s)]; }).sort(function (a, b) { return b[2] - a[2] || a[1] - b[1]; }).map(function (a) { return a[0]; });
      for (;;) {
        var antes = r.length;
        ord.forEach(function (s) {
          if (r.length >= k) return;
          var c = S[s].filter(function (d) { return (p.dias[d - 1] === "M" || p.dias[d - 1] === "T") && util(d) && r.indexOf(d) < 0; });
          if (c.length) r.push(c[c.length - 1]);
        });
        if (r.length >= k || r.length === antes) break;
      }
    });
    return res;
  }
  var H = {emails: emails, verificar: verificar, extras: extras, meta: meta, semanasMT: semanasMT, CODIGOS: ["M", "T", "MT", "FG", "F", "FD"]};
  if (typeof module !== "undefined") module.exports = H; else raiz.HOR = H;
})(typeof window !== "undefined" ? window : this);
