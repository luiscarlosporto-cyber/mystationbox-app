/* mystationbox · regras das despesas, sem ecrã, para se poderem testar: node app/testes/despesas.js */
"use strict";
var DESPESAS = (function () {
  var CATEGORIAS = ["Salários", "Segurança Social", "Renda", "Luz", "Água", "Comunicações", "Seguros", "Contabilidade", "Limpeza", "Alarmes", "Kms do gerente", "Outros"];

  /* "1.234,56", "1 234,56", "-336,93" ou "28.04" → cêntimos, sem passar por float. Devolve null se estiver vazio e NaN se for inválido. */
  function valorC(t) {
    var s = String(t == null ? "" : t).trim().replace(/[\s€]/g, "");
    if (!s) return null;
    var m = s.match(/^(-?)(\d{1,3}(?:\.\d{3})+|\d+)(?:[.,](\d{1,2}))?$/);
    if (!m) return NaN;
    return (m[1] ? -1 : 1) * (Number(m[2].replace(/\./g, "") + (m[3] || "").padEnd(2, "0")));
  }

  /* Custos do mês, sem IVA: a despesa confirmada substitui o custo fixo da mesma categoria; as outras somam-se. */
  function custosDoMes(fixos, despesas) {
    var reais = {};
    (despesas || []).forEach(function (d) {
      if (d.estado !== "confirmada") return;
      var k = d.categoria.toLowerCase();
      (reais[k] = reais[k] || {nome: d.categoria, valor_c: 0, origem: "real"}).valor_c += d.valor_c - (d.iva_c || 0);
    });
    var linhas = (fixos || []).filter(function (c) { return !reais[c.nome.toLowerCase()]; }).map(function (c) { return {nome: c.nome, valor_c: c.valor_c, origem: "fixo"}; });
    Object.keys(reais).forEach(function (k) { linhas.push(reais[k]); });
    return {linhas: linhas, total_c: linhas.reduce(function (s, l) { return s + l.valor_c; }, 0), reais: Object.keys(reais).length};
  }

  /* Totais da página: confirmadas por categoria e o que falta tratar. */
  function resumo(despesas) {
    var cat = {}, conf = 0, tratar = 0;
    (despesas || []).forEach(function (d) {
      if (d.estado === "confirmada") { conf += d.valor_c; cat[d.categoria] = (cat[d.categoria] || 0) + d.valor_c; }
      else if (d.estado !== "ignorada") tratar++;
    });
    return {confirmadas_c: conf, porTratar: tratar, categorias: cat};
  }

  /* O que falta para se poder gravar. Com valor por preencher, uma despesa do email pode gravar-se sem confirmar. */
  function erros(d) {
    var e = [];
    if (!d.categoria) e.push("Escolhe a categoria");
    if (!String(d.fornecedor || "").trim()) e.push("Falta o fornecedor");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.dia || "")) e.push("Falta a data");
    if (!/^\d{4}-\d{2}$/.test(d.mes || "")) e.push("Falta o mês");
    if (typeof d.valor_c === "number" && isNaN(d.valor_c)) e.push("Valor inválido");
    if (d.valor_c == null && d.origem !== "email") e.push("Falta o valor");
    if (typeof d.iva_c === "number" && isNaN(d.iva_c)) e.push("IVA inválido");
    return e;
  }
  return {CATEGORIAS: CATEGORIAS, valorC: valorC, custosDoMes: custosDoMes, resumo: resumo, erros: erros};
})();
if (typeof module !== "undefined") module.exports = DESPESAS;
