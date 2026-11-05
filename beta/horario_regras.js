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
      return {nome: p.nome, turnos: tur, meta: base - fu, ferias: fu, extra: (tur - (base - fu)) * 8};
    });
    return {erros: E, avisos: A, metas: metas, base: base};
  }
  var H = {verificar: verificar, meta: meta, semanasMT: semanasMT, CODIGOS: ["M", "T", "MT", "FG", "F", "FD"]};
  if (typeof module !== "undefined") module.exports = H; else raiz.HOR = H;
})(typeof window !== "undefined" ? window : this);
