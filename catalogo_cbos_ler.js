/* mystationbox · leitura do catálogo do CBOS («exportCatalog», Excel) (19/11/2026, pedido do dono).
 * Recebe as folhas já como linhas (SheetJS sheet_to_json header:1) e devolve os artigos e o PVP de cada estação (tarifa E1344 / E1346), em cêntimos.
 * O export não traz o preço de custo (a folha dos fornecedores vem sem preços): o custo vem das faturas. Formato desconhecido → null. */
"use strict";
var CATALOGO_CBOS = (function () {
  var TARIFA = {E1344: "sto", E1346: "pnf"};
  function cab(L, nomes) {
    for (var i = 0; i < Math.min(L.length, 5); i++) {
      var r = (L[i] || []).map(function (x) { return String(x == null ? "" : x).trim(); });
      if (nomes.every(function (n) { return r.indexOf(n) >= 0; })) { var p = {linha: i}; nomes.forEach(function (n) { p[n] = r.indexOf(n); }); return p; }
    }
    return null;
  }
  function ler(folhas) {
    var P = folhas && folhas["PRODUTOS"], T = folhas && folhas["TARIFAS POR PRODUTO"];
    if (!P || !T) return null;
    var cp = cab(P, ["posCode", "Nome", "Categoria", "Estado"]), ct = cab(T, ["posCode", "Preço", "Tarifas"]);
    if (!cp || !ct) return null;
    var artigos = [], erros = [], pvp = {sto: {}, pnf: {}}, vistos = {};
    P.slice(cp.linha + 1).forEach(function (r) {
      var c = String(r[cp.posCode] == null ? "" : r[cp.posCode]).trim();
      if (!c) return;
      if (!/^\d{8}$/.test(c)) { erros.push("Código inválido: " + c); return; }
      if (vistos[c]) { erros.push("Código repetido: " + c); return; }
      vistos[c] = 1;
      artigos.push({poscode: c, nome: String(r[cp.Nome] || "").trim(), categoria: String(r[cp.Categoria] || "").trim(), estado: String(r[cp.Estado] || "").trim()});
    });
    T.slice(ct.linha + 1).forEach(function (r) {
      var c = String(r[ct.posCode] == null ? "" : r[ct.posCode]).trim(), est = TARIFA[String(r[ct.Tarifas] || "").trim()], v = r[ct["Preço"]];
      if (!c || !est) return;
      if (!vistos[c]) { erros.push("Preço de artigo que não está no catálogo: " + c); return; }
      if (typeof v !== "number" || !isFinite(v) || v < 0) { erros.push("Preço inválido em " + c + ": " + v); return; }
      pvp[est][c] = Math.round(v * 100);
    });
    return {artigos: artigos, pvp: pvp, erros: erros};
  }
  /* O catálogo muda com frequência (dono, 19/11/2026): artigos novos, artigos que saem, PVP que mudam.
   * antes = linhas guardadas da estação; devolve as linhas a gravar e o que mudou. O que deixou de vir no export não se apaga: fica «Fora do export». */
  var FORA = "Fora do export";
  function comparar(antes, novo, est) {
    var A = {}; (antes || []).forEach(function (r) { A[r.poscode] = r; });
    var P = novo.pvp[est] || {}, linhas = [], vistos = {}, mud = {novos: [], sairam: [], pvp: [], descatalogados: []};
    novo.artigos.forEach(function (a) {
      vistos[a.poscode] = 1;
      var x = A[a.poscode], pvp = P[a.poscode] == null ? null : P[a.poscode];
      if (!x) mud.novos.push({poscode: a.poscode, nome: a.nome, pvp_c: pvp});
      else if (x.pvp_c !== pvp) mud.pvp.push({poscode: a.poscode, nome: a.nome, antes_c: x.pvp_c, depois_c: pvp});
      if (x && x.estado !== a.estado && /descatalog/i.test(a.estado)) mud.descatalogados.push({poscode: a.poscode, nome: a.nome});
      linhas.push({estacao: est, poscode: a.poscode, nome: a.nome, categoria: a.categoria, estado: a.estado, pvp_c: pvp, pvp_antes_c: x ? x.pvp_c : null});
    });
    Object.keys(A).forEach(function (c) { var x = A[c]; if (vistos[c] || x.estado === FORA) return;
      mud.sairam.push({poscode: c, nome: x.nome});
      linhas.push({estacao: est, poscode: c, nome: x.nome, categoria: x.categoria, estado: FORA, pvp_c: x.pvp_c, pvp_antes_c: x.pvp_c}); });
    return {linhas: linhas, mudou: mud};
  }
  return {ler: ler, comparar: comparar, TARIFA: TARIFA, FORA: FORA};
})();
if (typeof module !== "undefined") module.exports = CATALOGO_CBOS;
