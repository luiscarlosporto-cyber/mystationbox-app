/* mystationbox · Caixa pré-preenchida a partir do CBOS (dono, 21/11/2026, «siga»): funcionário, Fornecedores e, em Penafiel, Saída TABACO.
 * Lê msb_caixa_cbos (folha do turno e movimentos de caixa, guardados pelo OCTAN AI). Só preenche campos VAZIOS e grava-os como se fossem
 * escritos à mão (histórico em msb_eventos); nunca substitui o que já está escrito. Por baixo de cada campo mostra «CBOS: …» e, se o
 * valor da Caixa for diferente, a diferença. Tudo continua editável. As saídas de caixa vêm da nuvem já com o nome (msb-ense).
 * Usa do index.html: sb, EST, DIA, ADMIN, LINHAS, guardar, irDia, desenharDia, fmt, esc. */
"use strict";
var CAIXA_CBOS = (function () {
  var PARTICULAS = {de: 1, da: 1, do: 1, das: 1, dos: 1, e: 1};
  /* «CARINA SANTOS» → «Carina Santos», como os nomes já escritos na Caixa. */
  function nome(s) {
    return String(s || "").trim().toLowerCase().split(/\s+/).filter(Boolean).map(function (p, i) {
      return i && PARTICULAS[p] ? p : p.charAt(0).toUpperCase() + p.slice(1);
    }).join(" ");
  }
  /* Somas dos movimentos por destino, em positivo (cêntimos). null = movimentos ainda não lidos. */
  function soma(row, destino) {
    if (!row || !Array.isArray(row.movimentos)) return null;
    return row.movimentos.reduce(function (s, x) { return s - (x.destino === destino ? x.valor_c : 0); }, 0);
  }
  /* O que o CBOS propõe para cada campo do turno: {func, forn, tab}. Só o que se sabe. */
  function propostas(row, estacao) {
    if (!row) return {};
    var p = {};
    if (row.colaborador && !/[,;/]| e /.test(row.colaborador)) p.func = nome(row.colaborador);
    var f = soma(row, "fornecedores");
    if (f != null) p.forn = f;
    if (estacao === "pnf") { var t = soma(row, "saida_tabaco"); if (t != null) p.tab = t; }
    return p;
  }
  /* Campos a preencher: só os vazios na Caixa e com valor no CBOS (um 0 do CBOS não preenche). */
  function aPreencher(linha, prop) {
    var COL = {func: "func", forn: "forn_c", tab: "tab_c"}, out = [];
    Object.keys(prop).forEach(function (k) {
      var atual = linha ? linha[COL[k]] : null, vazio = atual == null || atual === "";
      if (vazio && (k === "func" ? !!prop[k] : prop[k] > 0)) out.push(k);
    });
    return out;
  }
  return {nome: nome, soma: soma, propostas: propostas, aPreencher: aPreencher};
})();
if (typeof module !== "undefined") module.exports = CAIXA_CBOS;

if (typeof window !== "undefined") (function () {
  var ROWS = {}, DIA_LIDO = null, vez = 0;

  async function carregar() {
    if (!ADMIN) return;
    var n = ++vez, est = EST, d = DIA;
    var r = await sb.from("msb_caixa_cbos").select("dia,fecho,tipo,colaborador,movimentos").eq("estacao", est).eq("dia", d);
    if (r.error || n !== vez || est !== EST || d !== DIA) return;   // sem acesso, ou o dia/estação mudou entretanto
    ROWS = {}; DIA_LIDO = d;
    (r.data || []).forEach(function (x) { if (x.tipo === "t1" || x.tipo === "t2") ROWS[x.tipo] = x; });
    await aplicar(true);
  }

  async function aplicar(preencher) {
    if (DIA_LIDO !== DIA) return;
    for (var t of ["t1", "t2"]) {
      var prop = CAIXA_CBOS.propostas(ROWS[t], EST);
      if (preencher) {
        for (var k of CAIXA_CBOS.aPreencher(LINHAS[t], prop)) {
          var el = document.querySelector("#turnos input[data-t='" + t + "'][data-k='" + k + "']");
          if (!el || el.disabled || el.value.trim()) continue;
          el.value = k === "func" ? prop[k] : fmt(prop[k]);
          await guardar(el);   // um de cada vez: cada gravação junta o seu campo à mesma linha do turno
        }
      }
      dicas(t, prop);
    }
  }

  function dicas(t, prop) {
    Object.keys(prop).forEach(function (k) {
      var el = document.querySelector("#turnos input[data-t='" + t + "'][data-k='" + k + "']"); if (!el) return;
      var lab = el.parentElement, d = lab.querySelector(".cbosDica");
      if (!d) { d = document.createElement("small"); d.className = "cbosDica"; d.style.cssText = "display:block;font-size:12px;margin-top:3px"; lab.appendChild(d); }
      var r = LINHAS[t] || {}, cbos = k === "func" ? prop[k] : fmt(prop[k]) + " €";
      var igual = k === "func" ? String(r.func || "").trim().toLowerCase() === String(prop[k]).toLowerCase()
        : (k === "forn" ? r.forn_c : r.tab_c) == null ? prop[k] === 0 : (k === "forn" ? r.forn_c : r.tab_c) === prop[k];
      var dif = k === "func" || igual ? "" : " · diferença " + fmt(((k === "forn" ? r.forn_c : r.tab_c) || 0) - prop[k]) + " €";
      d.textContent = "CBOS: " + cbos + dif;
      d.style.color = igual ? "var(--mut,#5B6B80)" : "#B45309";
    });
  }

  // Ao abrir um dia lê o CBOS; quando a Caixa se redesenha, repõe as dicas (sem voltar a gravar).
  var irDia0 = irDia;
  irDia = async function (d) { var r = await irDia0(d); try { await carregar(); } catch (e) { /* a Caixa funciona sem isto */ } return r; };
  var des0 = desenharDia;
  desenharDia = function (pronto) { var r = des0(pronto); if (pronto) aplicar(false); return r; };
})();
