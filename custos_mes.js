/* mystationbox · taxas de exploração fixas por mês (dono, 20/11/2026), sem ecrã, para se poderem testar: node app/testes/custos_mes.js
 * Cada valor de Loja e de Lavagem vale «a partir de» um mês (msb_custos_mes.desde = 'AAAA-MM') até à alteração seguinte.
 * Mudar hoje vale do mês escolhido para a frente; os meses anteriores ficam como estavam; meses fechados não se mexem. */
"use strict";
var CUSTOSMES = (function () {
  var TAXAS = ["Taxa de exploração · Loja", "Taxa de exploração · Lavagem"];
  function eTaxa(nome) { return TAXAS.indexOf(nome) >= 0; }

  /* Valor em vigor num mês: a linha mais recente com desde <= mês. null se não houver nenhuma. */
  function emVigor(linhas, nome, mes) {
    var v = null;
    (linhas || []).forEach(function (l) { if (l.nome === nome && l.desde <= mes && (!v || l.desde > v.desde)) v = l; });
    return v ? {nome: nome, valor_c: v.valor_c, desde: v.desde} : null;
  }
  /* Custos fixos de um mês para o Lucro: só as taxas com valor (0 = sem taxa nesse mês). */
  function doMes(linhas, mes) {
    return TAXAS.map(function (n) { return emVigor(linhas, n, mes); }).filter(function (x) { return x && x.valor_c > 0; })
      .map(function (x) { return {nome: x.nome, valor_c: x.valor_c, desde: x.desde}; });
  }
  /* Histórico de uma taxa, do mais antigo para o mais recente. */
  function historico(linhas, nome) {
    return (linhas || []).filter(function (l) { return l.nome === nome; }).sort(function (a, b) { return a.desde < b.desde ? -1 : 1; });
  }
  /* O que gravar ao mudar «a partir de» um mês: só as taxas cujo valor muda nesse mês. valores = {nome: cêntimos ou null (vazio)}.
     Vazio onde havia valor = 0 (deixa de haver taxa a partir desse mês); vazio onde não havia = nada a fazer. */
  function mudancas(linhas, estacao, desde, valores) {
    var out = [];
    TAXAS.forEach(function (n) {
      if (!(n in valores)) return;
      var v = valores[n], atual = emVigor(linhas, n, desde), antes = atual ? atual.valor_c : null;
      if (v == null) { if (antes) out.push({estacao: estacao, nome: n, desde: desde, valor_c: 0}); return; }
      if (v !== antes) out.push({estacao: estacao, nome: n, desde: desde, valor_c: v});
    });
    return out;
  }
  /* Primeiro mês fechado que a mudança apanharia (fechado >= desde). null = pode gravar. */
  function mesFechado(desde, periodos) {
    var f = (periodos || []).filter(function (p) { return p.estado === "fechado" && p.mes >= desde; }).map(function (p) { return p.mes; }).sort();
    return f.length ? f[0] : null;
  }
  /* Antes da tabela nova existir (ou se a leitura falhar), as linhas antigas de msb_custos valem para todos os meses. */
  function deCustosAntigos(custos) {
    return (custos || []).filter(function (c) { return eTaxa(c.nome); }).map(function (c) { return {nome: c.nome, desde: "0000-01", valor_c: c.valor_c}; });
  }
  function semTaxas(custos) { return (custos || []).filter(function (c) { return !eTaxa(c.nome); }); }

  return {TAXAS: TAXAS, eTaxa: eTaxa, emVigor: emVigor, doMes: doMes, historico: historico, mudancas: mudancas, mesFechado: mesFechado, deCustosAntigos: deCustosAntigos, semTaxas: semTaxas};
})();
if (typeof module !== "undefined" && module.exports) module.exports = CUSTOSMES;
