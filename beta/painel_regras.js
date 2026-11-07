/* mystationbox · contas do Painel, sem ecrã: testes em node app/testes/painel.js.
 * Vendas por dia: vêm do campo `dias` dos pedidos PAINEL, {"2026-11-05": [total €, combustível €, litros]}, lidos no CBOS pelo OCTAN AI. */
"use strict";
(function (raiz) {
  function diasMes(m) { return new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate(); }
  function ultimoDia(m) { return m + "-" + String(diasMes(m)).padStart(2, "0"); }
  function doMes(P, id, m) {   // o pedido mais recente vem primeiro
    return (P || []).find(function (q) { return q.estacao === id && q.de.slice(0, 7) === m && q.estado === "feito" && q.dias && Object.keys(q.dias).length; }) || null;
  }
  /* Soma das lojas pedidas, em euros, um valor por dia do mês; null nos dias sem leitura. Sem todas as lojas não há série: nunca mostrar um total só com parte */
  function serie(P, m, ids) {
    var L = ids.map(function (id) { return doMes(P, id, m); }); if (!L.length || L.some(function (p) { return !p; })) return null;
    var v = [];
    for (var i = 1; i <= diasMes(m); i++) {
      var d = m + "-" + String(i).padStart(2, "0"), s = null;
      L.forEach(function (p) { if (p.dias[d]) s = (s || 0) + p.dias[d][0]; });
      v.push(s === null ? null : Math.round(s * 100) / 100);
    }
    return v;
  }
  /* Vendas por família, lidas no campo `familias`: {dia: {família: [quantidade, €]}}. Sem todas as lojas, nada. */
  function doMesFam(P, id, m) { return (P || []).find(function (q) { return q.estacao === id && q.de.slice(0, 7) === m && q.estado === "feito" && q.familias && Object.keys(q.familias).length; }) || null; }
  function totaisFam(P, m, ids) {
    var L = ids.map(function (id) { return doMesFam(P, id, m); }); if (!L.length || L.some(function (p) { return !p; })) return null;
    var r = {}; L.forEach(function (p) { Object.keys(p.familias).forEach(function (d) { Object.keys(p.familias[d]).forEach(function (f) { var v = p.familias[d][f]; r[f] = r[f] || [0, 0]; r[f][0] += v[0]; r[f][1] += v[1]; }); }); });
    Object.keys(r).forEach(function (f) { r[f] = [Math.round(r[f][0] * 100) / 100, Math.round(r[f][1] * 100) / 100]; });
    return r;
  }
  /* Um valor por dia: COMBUSTIVEIS em litros; TODAS, RESTO (tudo menos combustíveis) e cada família em €. null nos dias sem leitura. */
  function serieFam(P, m, ids, fam) {
    if (fam === "TODAS") return serie(P, m, ids);
    var L = ids.map(function (id) { return doMesFam(P, id, m); }); if (!L.length || L.some(function (p) { return !p; })) return null;
    var v = [];
    for (var i = 1; i <= diasMes(m); i++) {
      var d = m + "-" + String(i).padStart(2, "0"), s = null;
      L.forEach(function (p) { var F = p.familias[d]; if (!F) return; s = s || 0;
        Object.keys(F).forEach(function (f) { if (fam === "RESTO" ? f !== "COMBUSTIVEIS" : f === fam) s += fam === "COMBUSTIVEIS" ? F[f][0] : F[f][1]; }); });
      v.push(s === null ? null : Math.round(s * 100) / 100);
    }
    return v;
  }
  /* Ainda há leitura a caminho? Um pedido feito com `dias` vazio não conta: já foi lido */
  function aLer(P, m, ids) { return ids.some(function (id) { return (P || []).some(function (q) { return q.estacao === id && q.de.slice(0, 7) === m && (q.estado === "pendente" || q.estado === "a_ler"); }); }); }
  /* Falta pedir este período? Um pedido antigo, feito sem `dias`, volta a pedir-se; um erro também */
  function pedir(P, id, m, ate) { return !(P || []).some(function (q) { return q.estacao === id && q.de.slice(0, 7) === m && q.ate === ate && q.estado !== "erro" && (q.estado !== "feito" || (q.dias != null && q.familias != null)); }); }
  /* Topo redondo do eixo, dividido em 3 */
  function escala(max) {
    var b = Math.pow(10, Math.floor(Math.log10(Math.max(max, 3) / 3))), p = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(function (x) { return x * b * 3 >= max; });
    return p * b * 3;
  }
  /* Variação do valor por dia, em %. null se não há com que comparar */
  function ritmo(v, d, v0, d0) { return v == null || v0 == null || !d || !d0 || !v0 ? null : (v / d) / (v0 / d0) * 100 - 100; }
  /* Multibanco, Solred, Numerário, Crédito e Outros, somados das lojas (cêntimos) */
  function formas(FF) {
    var G = {MB: ["CARTAO BANCARIO", "BANCARIO OFFLINE"], SOL: ["SOLRED", "SOLRED OFFLINE"], NUM: ["NUMERARIO"], CRE: ["CREDITO"]}, r = {MB: 0, SOL: 0, NUM: 0, CRE: 0, OUT: 0};
    FF.forEach(function (F) { Object.keys(F || {}).forEach(function (k) { var g = Object.keys(G).find(function (x) { return G[x].indexOf(k) >= 0; }) || "OUT"; r[g] += F[k] || 0; }); });
    return r;
  }
  var PN = {totaisFam: totaisFam, serieFam: serieFam, diasMes: diasMes, ultimoDia: ultimoDia, serie: serie, aLer: aLer, pedir: pedir, escala: escala, ritmo: ritmo, formas: formas};
  if (typeof module !== "undefined" && module.exports) module.exports = PN; else raiz.PN = PN;
})(this);
