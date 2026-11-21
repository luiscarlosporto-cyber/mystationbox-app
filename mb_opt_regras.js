/* mystationbox · MB do terminal automático (OPT): registado no CBOS × creditado pela Repsol (dono, 21/11/2026).
 * Registado = MB do OPT que o CBOS meteu nos turnos 1 e 2 (opt_mb_c) + MB do fecho 3, o OPT da noite (mb_c da folha «opt»).
 * Creditado = créditos MB do POS do OPT nas liquidações (creditosOpt, leitores.js), pelo dia da operação.
 * Por dia: o fecho 3 conta no dia do turno; uma operação depois da meia-noite pode vir creditada no dia seguinte,
 * por isso o total do mês é a conta que vale. Sem ecrã, para se poder testar: node app/testes/mb_opt.js. Valores em cêntimos. */
"use strict";
var MB_OPT = (function () {
  /* folhas = linhas de msb_caixa_cbos {dia, tipo, mb_c, opt_mb_c, opt_em}. Devolve {dia: cêntimos} e o primeiro dia lido. */
  function registado(folhas) {
    var reg = {}, primeiro = null;
    (folhas || []).forEach(function (f) {
      var v = f.tipo === "opt" ? f.mb_c : (f.tipo === "t1" || f.tipo === "t2") && f.opt_em ? f.opt_mb_c : null;
      if (v == null) return;
      reg[f.dia] = (reg[f.dia] || 0) + v;
      if (!primeiro || f.dia < primeiro) primeiro = f.dia;
    });
    return {dias: reg, primeiro: primeiro};
  }
  /* creditos = [{data, valor_c, doc, fecho, emissao}] do mês. Uma linha por dia com registo ou crédito. */
  function conferir(reg, creditos) {
    var C = {}, docs = {}, dias = {};
    (creditos || []).forEach(function (c) {
      C[c.data] = (C[c.data] || 0) + c.valor_c; dias[c.data] = 1;
      (docs[c.data] = docs[c.data] || []).push(c);
    });
    Object.keys(reg.dias || {}).forEach(function (d) { if (reg.dias[d]) dias[d] = 1; });
    var T = {reg: 0, cred: 0, dif: 0, porCreditar: 0, semRegisto: 0};
    var linhas = Object.keys(dias).sort().map(function (d) {
      var lido = !!reg.primeiro && d >= reg.primeiro, r = lido ? (reg.dias[d] || 0) : null, c = C[d] == null ? null : C[d], est;
      if (r === null) est = "sem_leitura";
      else if (c === null) est = "por_creditar";
      else if (c === r) est = "creditado";
      else est = "diferenca";
      if (r !== null) T.reg += r;
      if (c !== null) T.cred += c;
      if (r !== null && c !== null) T.dif += c - r;
      if (est === "por_creditar") T.porCreditar += r;
      if (est === "sem_leitura") T.semRegisto += c;
      return {dia: d, reg: r, cred: c, dif: r !== null && c !== null ? c - r : null, est: est, creditos: docs[d] || []};
    });
    return {linhas: linhas, T: T};
  }
  var ESTADOS = {creditado: "✔ creditado", por_creditar: "⏳ por creditar", diferenca: "⚠ diferença", sem_leitura: "sem leitura do CBOS"};
  return {registado: registado, conferir: conferir, ESTADOS: ESTADOS};
})();
if (typeof module !== "undefined") module.exports = MB_OPT;
