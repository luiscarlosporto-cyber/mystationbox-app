/* mystationbox · Fardamento: regras puras (sem ecrã nem base de dados), testadas em app/testes/fardas.js.
 * Pedido do dono (27/11/2026): perfil de tamanhos obrigatório e pedido de fardamento novo.
 * Peças: polo de manga curta, polo de manga comprida, calças e casaco/polar (sem calçado nem colete, decisão do dono).
 * Limite por ano: 3 peças de cada tipo; casaco/polar só 1 (dono, 27/11/2026). O pedido acima do limite segue, marcado, e decide o administrador.
 * Tabelas de medidas da folha de fardas enviada pelo dono (cm). Casaco: sem tabela própria, segue o tamanho do polo. */
"use strict";
(function (raiz) {
  var TAMANHOS = ["XS", "S", "M", "L", "XL", "XXL"];
  var TAM_PT = {XS: "XS / SP", S: "S / P", M: "M / M", L: "L / G", XL: "XL / SG", XXL: "XXL / XG"};
  var PECAS = [
    {id: "polo_curta", nome: "Polo de manga curta", parte: "cima"},
    {id: "polo_comprida", nome: "Polo de manga comprida", parte: "cima"},
    {id: "calcas", nome: "Calças", parte: "baixo"},
    {id: "casaco", nome: "Casaco / polar", parte: "cima"}
  ];
  var LIMITE_ANO = 3, LIMITES = {casaco: 1};
  function limite(peca) { return LIMITES[peca] != null ? LIMITES[peca] : LIMITE_ANO; }
  var MOTIVOS = {desgaste: "Desgaste", tamanho: "Tamanho errado", novo: "Colaborador novo", outro: "Outro"};
  var ESTADOS = {pedido: "Pedido", aprovado: "Aprovado", recusado: "Recusado", encomendado: "Encomendado", entregue: "Entregue"};
  // [min, max] por tamanho, pela ordem de TAMANHOS
  var TABELA = {
    F: {altura: [[150, 158], [159, 164], [165, 170], [171, 176], [177, 180], [181, 190]],
        peito: [[75, 87], [88, 95], [96, 103], [104, 111], [112, 119], [120, 128]],
        cintura: [[56, 62], [63, 70], [71, 78], [79, 86], [87, 94], [95, 102]],
        anca: [[79, 85], [86, 92], [93, 99], [100, 106], [107, 113], [114, 120]]},
    M: {altura: [[160, 164], [165, 171], [172, 177], [178, 184], [185, 192], [193, 200]],
        peito: [[88, 95], [96, 103], [104, 111], [112, 119], [120, 131], [132, 140]],
        cintura: [[72, 80], [81, 88], [89, 96], [97, 104], [105, 116], [117, 128]]}
  };

  /* índice do tamanho para uma medida: dentro do intervalo, ou o mais próximo (abaixo do menor = XS, acima do maior = XXL) */
  function indice(modelo, medida, valor) {
    var t = TABELA[modelo] && TABELA[modelo][medida], v = Number(valor);
    if (!t || !(v > 0)) return -1;
    for (var i = 0; i < t.length; i++) { if (v <= t[i][1]) return i; }
    return t.length - 1;
  }
  /* Sugestão por peça: o maior tamanho que as medidas pedem (cima: altura e peito; baixo: altura, cintura e anca). */
  function sugerir(modelo, med) {
    med = med || {};
    var maior = function (lista) { var r = -1; lista.forEach(function (m) { r = Math.max(r, indice(modelo, m, med[m])); }); return r; };
    var cima = maior(["altura", "peito"]), baixo = maior(["altura", "cintura", "anca"]), out = {};
    PECAS.forEach(function (p) { var i = p.parte === "cima" ? cima : baixo; if (i >= 0) out[p.id] = TAMANHOS[i]; });
    return out;
  }
  function medidas(modelo) { return modelo === "F" ? ["altura", "peito", "cintura", "anca"] : ["altura", "peito", "cintura"]; }
  /* perfil completo = modelo e tamanho válido em todas as peças */
  function completo(t) {
    if (!t || (t.modelo !== "F" && t.modelo !== "M")) return false;
    return PECAS.every(function (p) { return TAMANHOS.indexOf(t[p.id]) >= 0; });
  }
  /* peças já pedidas no ano (pedidos não recusados), por tipo */
  function usadosNoAno(pedidos, ano) {
    var u = {};
    (pedidos || []).forEach(function (p) {
      if (p.estado === "recusado" || String(p.criado_em || "").slice(0, 4) !== String(ano)) return;
      (p.itens || []).forEach(function (i) { u[i.peca] = (u[i.peca] || 0) + (Number(i.qtd) || 0); });
    });
    return u;
  }
  /* peças que passariam o limite do ano com este pedido */
  function acimaLimite(itens, usados) {
    return (itens || []).filter(function (i) { return (usados[i.peca] || 0) + (Number(i.qtd) || 0) > limite(i.peca); }).map(function (i) { return i.peca; });
  }
  /* total a encomendar por peça e tamanho (pedidos aprovados), para a lista e o PDF */
  function resumoEncomenda(pedidos) {
    var m = {};
    (pedidos || []).forEach(function (p) {
      if (p.estado !== "aprovado") return;
      (p.itens || []).forEach(function (i) { var k = i.peca + "|" + i.tamanho; m[k] = (m[k] || 0) + (Number(i.qtd) || 0); });
    });
    var out = [];
    PECAS.forEach(function (p) { TAMANHOS.forEach(function (t) { var n = m[p.id + "|" + t]; if (n) out.push({peca: p.id, nome: p.nome, tamanho: t, qtd: n}); }); });
    return out;
  }
  function nomePeca(id) { var p = PECAS.find(function (x) { return x.id === id; }); return p ? p.nome : id; }
  function itensTxt(itens) { return (itens || []).map(function (i) { return i.qtd + " × " + nomePeca(i.peca) + " " + i.tamanho; }).join(", "); }

  var API = {TAMANHOS: TAMANHOS, TAM_PT: TAM_PT, PECAS: PECAS, LIMITE_ANO: LIMITE_ANO, LIMITES: LIMITES, limite: limite, MOTIVOS: MOTIVOS, ESTADOS: ESTADOS, TABELA: TABELA,
    indice: indice, sugerir: sugerir, medidas: medidas, completo: completo, usadosNoAno: usadosNoAno, acimaLimite: acimaLimite,
    resumoEncomenda: resumoEncomenda, nomePeca: nomePeca, itensTxt: itensTxt};
  if (typeof module !== "undefined" && module.exports) module.exports = API; else raiz.FARDAS = API;
})(typeof window !== "undefined" ? window : this);
