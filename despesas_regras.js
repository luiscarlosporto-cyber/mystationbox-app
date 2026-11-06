/* mystationbox · regras das despesas, sem ecrã, para se poderem testar: node app/testes/despesas.js */
"use strict";
var DESPESAS = (function () {
  var CATEGORIAS = ["Salários", "Segurança Social", "Renda", "Luz", "Água", "Comunicações", "Seguros", "Contabilidade", "Limpeza", "Alarmes", "Kms do gerente", "Outros bónus", "Outros"];

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

  /* Regra do dono: um crédito vê-se sempre positivo. Por dentro fica negativo, para abater nos custos do Lucro. */
  function comSinal(c, credito) { return c == null || isNaN(c) ? c : credito ? -Math.abs(c) : c; }
  function creditoVisto(c) { return c == null ? c : Math.abs(c); }

  /* Água ou outros bónus vindos de um documento da Saphety, já lido por lerServicoRepsol. Fica sempre por confirmar; nota de crédito entra a negativo e abate nos custos do Lucro. */
  function deSaphety(t, est, doc, fonte, original) {
    var s = t.tipo === "NC" ? -1 : 1;
    return {estacao: est, mes: t.mes, dia: t.data, categoria: t.categoria, fornecedor: t.categoria === "Água" ? "Repsol água e esgoto" : "Repsol bónus e compensações", documento: t.numero, valor_c: s * t.pagar_c, iva_c: s * t.iva_c,
      no_dl: true, estado: "por_confirmar", origem: "email", fonte: fonte, mensagem: "saphety:" + t.numero, hash: doc.hash, original: original, nota: t.tipo === "NC" ? "Nota de crédito" : null};
  }

  /* Valor do mapa de kms gerado na app: a mesma conta do mapa em app/kms.js. */
  function valorMapaKms(m) { return Math.round(m.dias.length * m.km_dia * Number(m.euro_km) * 100); }

  /* O recibo de kms tem de dar o valor do mapa. A diferença mostra-se; não se corrige sozinha. */
  function compararKms(d, mapa) {
    if (d.categoria !== "Kms do gerente") return null;
    if (!mapa) return {estado: "sem_mapa", mapa_c: null};
    var m = valorMapaKms(mapa);
    return {estado: m === d.valor_c ? "igual" : "diferente", mapa_c: m};
  }

  /* O que se pode confirmar de uma vez: salários e Segurança Social dos recibos. Recibo refeito e tudo o resto vê-se um a um. */
  function recibosJuntos(lista) {
    return (lista || []).filter(function (d) {
      return d.estado === "por_confirmar" && d.origem === "email" && d.valor_c != null && !d.nota && (d.categoria === "Salários" || d.categoria === "Segurança Social");
    });
  }
  return {comSinal: comSinal, creditoVisto: creditoVisto, deSaphety: deSaphety, CATEGORIAS: CATEGORIAS, valorC: valorC, custosDoMes: custosDoMes, resumo: resumo, erros: erros, valorMapaKms: valorMapaKms, compararKms: compararKms, recibosJuntos: recibosJuntos};
})();
if (typeof module !== "undefined") module.exports = DESPESAS;
