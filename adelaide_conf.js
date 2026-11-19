/* mystationbox · conferência da fatura da Adelaide com a encomenda de tabaco (19/11/2026, pedido do dono).
 * A Adelaide usa códigos e nomes próprios: a ligação «código da Adelaide → código Repsol» fica guardada depois de o dono a confirmar.
 * Sem ligação confirmada, propõe-se o artigo da encomenda com o nome mais parecido, e a linha fica «por confirmar». Nada se corrige sozinho. */
"use strict";
var ADELAIDE_CONF = (function () {
  var CATEGORIAS = {"Cigarros": 1, "Cigarrilhas": 1, "Latas": 1, "Onças": 1, "Sacos": 1};   // o tabaco aquecido é da Logista (dono, 19/11/2026)
  var SINONIMOS = {VENTIL: "SG VENTIL", KS: "", TTT: "", TT: "", BOX: "BOX", AGORA: "", E: "", CHESTER: "", ONCAS: "ONCA", LATAS: "LATA", SACOS: "SACO", CIG: "C"};
  function tokens(n) {
    var t = String(n || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/(\d+)\s*(GR|GRS|G|U)\b/g, "$1").replace(/[^A-Z0-9]+/g, " ").replace(/([A-Z])(\d)/g, "$1 $2").replace(/(\d)([A-Z])/g, "$1 $2").replace(/\b(\d+) S\b/g, "$1").trim().split(" ");
    var out = [];
    t.forEach(function (x) { var s = SINONIMOS[x]; if (s === undefined) out.push(x); else if (s) s.split(" ").forEach(function (y) { out.push(y); }); });
    return out.filter(Boolean);
  }
  /* Dice dos nomes (palavras em comum), com os números a contar: «24» e «33» separam maços diferentes da mesma marca */
  function parecido(a, b) {
    var A = tokens(a), B = tokens(b), comuns = A.filter(function (x) { return B.indexOf(x) >= 0; }).length;
    var nA = A.filter(function (x) { return /\d/.test(x); }), nB = B.filter(function (x) { return /\d/.test(x); });
    var bonus = nA.length && nB.length ? (nA.some(function (x) { return nB.indexOf(x) >= 0; }) ? 0.2 : -0.3) : 0;
    return 2 * comuns / Math.max(A.length + B.length, 1) + bonus;
  }
  function daAdelaide(encomenda) {
    return (encomenda || []).filter(function (l) { return Number(l.qty) > 0 && CATEGORIAS[l.category]; });
  }
  /* fatura (ADELAIDE.ler), linhas da encomenda (orders.lines) e ligações confirmadas {código Adelaide: código Repsol} */
  function conferir(fatura, encomenda, ligacoes) {
    var E = daAdelaide(encomenda), usados = {}, linhas = [];
    var porCodigo = {}; E.forEach(function (l) { porCodigo[l.repsol_code] = l; });
    fatura.linhas.forEach(function (f) {
      var cod = ligacoes[f.codigo], e = cod ? porCodigo[cod] : null;
      if (cod && e && !usados[cod]) { usados[cod] = 1; linhas.push({fat: f, enc: e, estado: Number(e.qty) === f.qtd ? "igual" : "diferente"}); return; }
      if (cod && !e) { linhas.push({fat: f, enc: null, ligado: cod, estado: "a_mais"}); return; }
      linhas.push({fat: f, enc: null, estado: "confirmar"});
    });
    /* propostas para as linhas por confirmar, só entre os artigos da encomenda ainda livres (e que não estão já ligados a outro código) */
    var ligados = {}; Object.keys(ligacoes).forEach(function (k) { ligados[ligacoes[k]] = 1; });
    /* os pares mais parecidos primeiro, para um artigo não ficar com a proposta que era de outro */
    var pares = [];
    linhas.forEach(function (l, i) { if (l.estado !== "confirmar") return;
      E.forEach(function (e) { if (usados[e.repsol_code] || ligados[e.repsol_code]) return; var p = parecido(l.fat.nome, e.name); if (p >= 0.5) pares.push([p, i, e]); }); });
    pares.sort(function (a, b) { return b[0] - a[0]; });
    pares.forEach(function (x) { var l = linhas[x[1]]; if (l.proposta || usados[x[2].repsol_code]) return; l.proposta = x[2]; l.nota = Math.round(x[0] * 100) / 100; usados[x[2].repsol_code] = 1; });
    var falta = E.filter(function (e) { return !usados[e.repsol_code]; });
    var conta = function (s) { return linhas.filter(function (l) { return l.estado === s; }).length; };
    return {linhas: linhas, em_falta: falta, resumo: {iguais: conta("igual"), diferentes: conta("diferente"), confirmar: conta("confirmar"), a_mais: conta("a_mais"), em_falta: falta.length,
      volumes_fatura: fatura.linhas.reduce(function (s, l) { return s + l.qtd; }, 0), volumes_encomenda: E.reduce(function (s, l) { return s + Number(l.qty); }, 0)}};
  }
  /* Preço no CBOS (dono, 19/11/2026: «onde não tem preço o artigo, ou tem margem 0, preciso saber»).
   * A Adelaide fatura por volume: PVP do volume e desconto do volume (o desconto é a margem da loja). O CBOS tem o PVP do maço.
   * catalogo = {poscode: {pvp_c, estado}} da estação. Devolve, por linha da conferência, o que se vê no CBOS. */
  function precoCBOS(l, catalogo) {
    var cod = l.enc ? l.enc.repsol_code : l.ligado || (l.proposta && l.proposta.repsol_code);
    if (!cod) return {estado: "sem_artigo"};
    var c = catalogo[cod], vol = l.enc || l.proposta ? Number((l.enc || l.proposta).vol_size) || 0 : 0;
    if ((l.enc || l.proposta) && (l.enc || l.proposta).unit === "unidades") vol = 1;
    if (!c) return {estado: "fora_catalogo", codigo: cod};
    if (!c.pvp_c) return {estado: "sem_preco", codigo: cod};
    if (!vol) return {estado: "sem_volume", codigo: cod, pvp_c: c.pvp_c};
    var pvpVol = c.pvp_c * vol, custo = l.fat.pvp_c - l.fat.desc_c, margem = Math.round((pvpVol - custo) / pvpVol * 1000) / 10;
    var r = {codigo: cod, pvp_c: c.pvp_c, vol: vol, pvp_fatura_c: Math.round(l.fat.pvp_c / vol), custo_c: Math.round(custo / vol), margem: margem};
    r.estado = margem <= 0 ? "margem_zero" : pvpVol !== l.fat.pvp_c ? "pvp_diferente" : "ok";
    if (c.estado && c.estado !== "Ativo") r.inativo = c.estado;
    return r;
  }
  return {conferir: conferir, precoCBOS: precoCBOS, parecido: parecido, tokens: tokens, daAdelaide: daAdelaide, CATEGORIAS: CATEGORIAS};
})();
if (typeof module !== "undefined") module.exports = ADELAIDE_CONF;
