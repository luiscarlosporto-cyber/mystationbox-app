/* mystationbox · leitura da fatura da Adelaide Sousa Ferreira (Casa Jorge, tabaco) em PDF (19/11/2026, pedido do dono).
 * Recebe as linhas de texto do PDF (pdf.js, como linhasPdf em lucro.js) e devolve a fatura em cêntimos.
 * O PDF traz ORIGINAL, DUPLICADO e TRIPLICADO: só se lê o ORIGINAL. Valores com IVA (regime especial do tabaco: o IVA não se deduz).
 * Quantidades como na fatura: volumes nos cigarros, unidades nas latas, onças e sacos. Não reconhecido → null; nada se arredonda em silêncio. */
"use strict";
var ADELAIDE = (function () {
  var NIF = "501263489", NIF_LOJA = {sto: "515786217", pnf: "517959054"};
  var LINHA = /^(\d{3,6})\s+(\d+(?:\.\d+)?)\s+(.+?)\s{2,}(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+Regime particular do tabaco\s+(\d{1,3}(?:,\d{3})*\.\d\d)$/;
  function c(t) { return Math.round(parseFloat(String(t).replace(/,/g, "")) * 100); }
  function dmy(d, m, a) { return a + "-" + m + "-" + d; }

  function ler(linhas) {
    var L = (linhas || []).map(function (l) { return String(l).trim(); });
    if (!L.some(function (l) { return /Adelaide Sousa Ferreira/.test(l); }) || !L.some(function (l) { return l.indexOf(NIF) >= 0; })) return null;
    var fim = L.findIndex(function (l) { return /^(DUPLICADO|TRIPLICADO|QUADRUPLICADO)$/.test(l); });
    if (fim > 0) L = L.slice(0, fim);
    var achar = function (re) { for (var i = 0; i < L.length; i++) { var m = L[i].match(re); if (m) return m; } return null; };
    var num = achar(/^FT (\S+\/\d+)$/), data = achar(/Data :\s*(\d{4}-\d\d-\d\d)/), venc = achar(/Data de Vencimento:\s*(\d\d)\.(\d\d)\.(\d{4})/);
    var nif = achar(/Contribuinte:\s*(\d{9})/), vol = achar(/Total de Volumes\s+(\d+(?:\.\d+)?)/);
    var tot = achar(/^TOTAL do DOCUMENTO \(Euro\)\s+(\d{1,3}(?:,\d{3})*\.\d\d)$/), desc = achar(/^Desconto Comercial\s+(\d{1,3}(?:,\d{3})*\.\d\d)$/);
    var est = null; Object.keys(NIF_LOJA).forEach(function (k) { if (nif && nif[1] === NIF_LOJA[k]) est = k; });
    var out = [], naoLidas = [];
    L.forEach(function (l) {
      var m = l.match(LINHA);
      if (m) out.push({codigo: m[1], qtd: parseFloat(m[2]), nome: m[3].replace(/\s+/g, " "), pvp_c: c(m[4]), desc_c: Math.round(parseFloat(m[6]) * 100), total_c: c(m[7])});
      else if (/Regime particular do tabaco/.test(l)) naoLidas.push(l);
    });
    var bruto = out.reduce(function (s, x) { return s + Math.round(x.qtd * x.pvp_c); }, 0);
    return {fornecedor: "adelaide", numero: num ? "FT " + num[1] : null, data: data ? data[1] : null, vencimento: venc ? dmy(venc[1], venc[2], venc[3]) : null,
      cliente_nif: nif ? nif[1] : null, estacao: est, volumes: vol ? parseFloat(vol[1]) : null, linhas: out, nao_lidas: naoLidas,
      total_c: tot ? c(tot[1]) : null, desconto_c: desc ? c(desc[1]) : null, bruto_c: bruto};
  }

  /* Tudo o que não bate certo; lista vazia = fatura lida e coerente */
  function verificar(d) {
    var e = [];
    if (!d) return ["Não é uma fatura da Adelaide Sousa Ferreira"];
    if (!d.numero || !d.data) e.push("Sem número ou data");
    if (!d.estacao) e.push("Cliente (NIF " + (d.cliente_nif || "?") + ") não é nenhuma das estações");
    (d.nao_lidas || []).forEach(function (l) { e.push("Linha não lida: " + l.slice(0, 60)); });
    if (!d.linhas.length) e.push("Sem linhas");
    d.linhas.forEach(function (l, i) {
      if (Math.abs(l.total_c - Math.round(l.qtd * (l.pvp_c - l.desc_c))) > 5) e.push("Linha " + (i + 1) + " (" + l.nome + "): total não bate com PVP − desconto");
    });
    var soma = d.linhas.reduce(function (s, l) { return s + l.total_c; }, 0), vol = d.linhas.reduce(function (s, l) { return s + l.qtd; }, 0);
    if (d.total_c == null || soma !== d.total_c) e.push("Soma das linhas ≠ total do documento");
    if (d.volumes == null || Math.abs(vol - d.volumes) > 0.001) e.push("Soma das quantidades ≠ total de volumes");
    var bruto = d.linhas.reduce(function (s, l) { return s + Math.round(l.qtd * l.pvp_c); }, 0);
    if (d.desconto_c == null || d.total_c == null || Math.abs(bruto - d.desconto_c - d.total_c) > 10) e.push("PVP − desconto comercial ≠ total do documento");
    return e;
  }
  return {ler: ler, verificar: verificar, NIF: NIF, NIF_LOJA: NIF_LOJA};
})();
if (typeof module !== "undefined") module.exports = ADELAIDE;
