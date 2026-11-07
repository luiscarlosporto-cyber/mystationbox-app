/* mystationbox · regras das despesas, sem ecrã, para se poderem testar: node app/testes/despesas.js */
"use strict";
var DESPESAS = (function () {
  /* Segurança Social (dono, 07/11/2026): o recibo traz a parte RETIDA ao trabalhador, que já está dentro do salário bruto (não é custo a mais).
     A guia da contabilidade paga as duas partes juntas; o custo da empresa é guia − retida. As guias de IRS só entregam ao Estado o que já foi retido: nunca são custo. */
  var SS = "Segurança Social", SS_RETIDA = "Segurança Social · retida", IRS_GUIA = "IRS · guia", TAXA_EMPRESA = 2375, TAXA_TRAB = 1100;
  var CATEGORIAS = ["Salários", SS, SS_RETIDA, IRS_GUIA, "Renda", "Luz", "Água", "Comunicações", "Seguros", "Contabilidade", "Limpeza", "Alarmes", "Kms do gerente", "Outros bónus", "Outros"];

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
    var reais = {}, retida = 0, guia = null;
    (despesas || []).forEach(function (d) {
      if (d.estado !== "confirmada") return;
      if (d.categoria === SS_RETIDA) { retida += d.valor_c; return; }
      if (d.categoria === IRS_GUIA) return;
      if (d.categoria === SS) { guia = (guia || 0) + d.valor_c; return; }
      var k = d.categoria.toLowerCase();
      (reais[k] = reais[k] || {nome: d.categoria, valor_c: 0, origem: "real"}).valor_c += d.valor_c - (d.iva_c || 0);
    });
    /* Parte da empresa: com guia, guia − retida; só com recibos, estimada à taxa da empresa até chegar a guia */
    var kss = SS.toLowerCase();
    if (guia != null) reais[kss] = {nome: SS, valor_c: guia - retida, origem: "real", guia_c: guia, retida_c: retida};
    else if (retida) reais[kss] = {nome: SS, valor_c: Math.round(retida * TAXA_EMPRESA / TAXA_TRAB), origem: "estimada", retida_c: retida};
    var linhas = (fixos || []).filter(function (c) { return !reais[c.nome.toLowerCase()]; }).map(function (c) { return {nome: c.nome, valor_c: c.valor_c, origem: "fixo"}; });
    Object.keys(reais).forEach(function (k) { linhas.push(reais[k]); });
    return {linhas: linhas, total_c: linhas.reduce(function (s, l) { return s + l.valor_c; }, 0), reais: Object.keys(reais).length};
  }

  /* Guia da Segurança Social lida por reconhecimento de texto (vem desenhada, sem texto). Os dois valores da guia («Valor a pagar» e o do quadro MB)
     têm de ser iguais; senão não se lê nada (falhar com clareza). */
  function lerGuiaSS(texto) {
    var t = String(texto || "").replace(/[ \t]+/g, " ");
    var vs = []; t.replace(/Valor(?: a pagar)?\s*:?\s*(\d{1,3}(?:[.\s]\d{3})*,\d{2})/gi, function (_, v) { vs.push(valorC(v.replace(/\s/g, "."))); });
    if (!vs.length || vs.some(function (v) { return v !== vs[0]; })) return null;
    var ent = /Entidade\s*:?\s*(\d{5})\b/i.exec(t), ref = /Refer[eê]ncia\s*:?\s*(\d{9})\b/i.exec(t), val = /validade\s*(\d{4}-\d{2}-\d{2})/i.exec(t) || /(\d{4}-\d{2}-\d{2})\s*$/m.exec(t.split(/Nome/)[0] || "");
    return {valor_c: vs[0], entidade: ent ? ent[1] : null, referencia: ref ? ref[1] : null, validade: val ? val[1] : null, lidos: vs.length};
  }

  /* Famílias da Conta do mês. Custo fixo «Taxa de exploração · …» é da Repsol. */
  var FAMILIAS = [["Pessoal", ["Salários", SS, "Kms do gerente"]], ["Repsol", ["Outros bónus", "My Repsol", "Taxa combustíveis"]], ["Instalações", ["Renda", "Luz", "Água", "Limpeza", "Alarmes", "Seguros"]], ["Serviços", ["Comunicações", "Contabilidade"]]];
  function familia(nome) {
    if (/^taxa de explora/i.test(nome)) return "Repsol";
    var f = FAMILIAS.find(function (x) { return x[1].some(function (c) { return c.toLowerCase() === String(nome).toLowerCase(); }); });
    return f ? f[0] : "Outros";
  }
  function porFamilia(linhas) {
    var F = {};
    (linhas || []).forEach(function (l) { var n = familia(l.nome), f = F[n] = F[n] || {nome: n, valor_c: 0, linhas: []}; f.valor_c += l.valor_c; f.linhas.push(l); });
    var ordem = FAMILIAS.map(function (x) { return x[0]; }).concat(["Outros"]);
    return Object.keys(F).sort(function (a, b) { return ordem.indexOf(a) - ordem.indexOf(b); }).map(function (k) { F[k].linhas.sort(function (a, b) { return b.valor_c - a.valor_c; }); return F[k]; });
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

  /* Regra do dono: respeitar o documento. Crédito impresso positivo (Saphety, ou assim marcado à mão) vê-se positivo; o que vem negativo no documento fica negativo.
     Por dentro um crédito é sempre negativo, para abater nos custos do Lucro. */
  function emPositivo(d) { return d.valor_c < 0 && /^(saphety:|doc_positivo)/.test(d.mensagem || ""); }
  function comSinal(c, credito) { return c == null || isNaN(c) ? c : credito ? -Math.abs(c) : c; }
  function visto(c, d) { return c == null ? c : emPositivo(d) ? Math.abs(c) : c; }

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
      return d.estado === "por_confirmar" && d.origem === "email" && d.valor_c != null && !d.nota && (d.categoria === "Salários" || d.categoria === SS || d.categoria === SS_RETIDA);
    });
  }
  return {lerGuiaSS: lerGuiaSS, SS: SS, SS_RETIDA: SS_RETIDA, IRS_GUIA: IRS_GUIA, familia: familia, porFamilia: porFamilia, emPositivo: emPositivo, comSinal: comSinal, visto: visto, deSaphety: deSaphety, CATEGORIAS: CATEGORIAS, valorC: valorC, custosDoMes: custosDoMes, resumo: resumo, erros: erros, valorMapaKms: valorMapaKms, compararKms: compararKms, recibosJuntos: recibosJuntos};
})();
if (typeof module !== "undefined") module.exports = DESPESAS;
