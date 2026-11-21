/* mystationbox · Caixa pré-preenchida a partir do CBOS (dono, 21/11/2026, «siga»): funcionário, Vendas, MB, Solred €, Numerário, Fornecedores e,
 * em Penafiel, Clientes a crédito e Saída TABACO.
 * Numerário (dono, 21/11/2026) = saídas de caixa + Saídas TABACO + entrega de numerário final, tirado dos movimentos (o dinheiro que saiu da
 * gaveta). Se a folha do turno disser outro numerário, a dica mostra quanto falta; nada se corrige sozinho.
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
  /* O que o CBOS propõe para cada campo do turno: {func, forn, tab, num}. Só o que se sabe. */
  function propostas(row, estacao) {
    if (!row) return {};
    var p = {};
    if (row.colaborador && !/[,;/]| e /.test(row.colaborador)) p.func = nome(row.colaborador);
    // Folha do turno (correspondência do dono, 19/11/2026). SOLRED OFFLINE fica de fora: é «Ficou a dever», decide-se à mão.
    if (row.total_c != null) p.vendas = row.total_c;
    if (row.mb_c != null) p.mb = row.mb_c;
    if (row.solred_c != null) p.solred = row.solred_c;
    if (estacao === "pnf" && row.credito_c != null) p.cred = row.credito_c;
    var f = soma(row, "fornecedores");
    if (f != null) p.forn = f;
    if (estacao === "pnf") { var t = soma(row, "saida_tabaco"); if (t != null) p.tab = t; }
    // só com a entrega final registada: sem ela o turno ainda não está fechado no CBOS e a soma ficava curta
    if (f != null && row.movimentos.some(function (x) { return x.destino === "entrega_final"; })) p.num = soma(row, "saida") + soma(row, "saida_tabaco") + soma(row, "entrega_final");
    return p;
  }
  /* Numerário da folha do turno menos o dos movimentos (positivo = falta dinheiro). null = não se pode comparar. */
  function faltaNumerario(row, num) {
    if (!row || row.numerario_c == null || num == null) return null;
    return row.numerario_c - num;
  }
  /* Campos a preencher: só os vazios na Caixa e com valor no CBOS (um 0 do CBOS não preenche). */
  function aPreencher(linha, prop) {
    var out = [];
    Object.keys(prop).forEach(function (k) {
      var atual = linha ? linha[COL[k]] : null, vazio = atual == null || atual === "";
      if (vazio && (k === "func" ? !!prop[k] : prop[k] > 0)) out.push(k);
    });
    return out;
  }
  var COL = {func: "func", vendas: "vendas_c", mb: "mb_c", solred: "solred_c", cred: "cred_c", forn: "forn_c", tab: "tab_c", num: "num_c"};
  return {nome: nome, soma: soma, propostas: propostas, faltaNumerario: faltaNumerario, aPreencher: aPreencher, COL: COL};
})();
if (typeof module !== "undefined") module.exports = CAIXA_CBOS;

if (typeof window !== "undefined") (function () {
  var ROWS = {}, DIA_LIDO = null, vez = 0;

  async function carregar() {
    if (!ADMIN) return;
    var n = ++vez, est = EST, d = DIA;
    var r = await sb.from("msb_caixa_cbos").select("dia,fecho,tipo,colaborador,numerario_c,total_c,mb_c,solred_c,credito_c,movimentos").eq("estacao", est).eq("dia", d);
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
      dicas(t, prop, ROWS[t]);
    }
  }

  function dicas(t, prop, row) {
    Object.keys(prop).forEach(function (k) {
      var el = document.querySelector("#turnos input[data-t='" + t + "'][data-k='" + k + "']"); if (!el) return;
      var lab = el.parentElement, d = lab.querySelector(".cbosDica");
      if (!d) { d = document.createElement("small"); d.className = "cbosDica"; d.style.cssText = "display:block;font-size:12px;margin-top:3px"; lab.appendChild(d); }
      var r = LINHAS[t] || {}, v = r[CAIXA_CBOS.COL[k]], cbos = k === "func" ? prop[k] : fmt(prop[k]) + " €";
      var igual = k === "func" ? String(r.func || "").trim().toLowerCase() === String(prop[k]).toLowerCase()
        : v == null ? prop[k] === 0 : v === prop[k];
      var dif = k === "func" || igual ? "" : " · diferença " + fmt((v || 0) - prop[k]) + " €";
      var falta = k === "num" ? CAIXA_CBOS.faltaNumerario(row, prop[k]) : null;
      if (falta) igual = false;
      d.textContent = (k === "num" ? "CBOS (saídas + TABACO + entrega final): " : "CBOS: ") + cbos + dif +
        (falta ? " · ⚠️ folha do turno " + fmt(row.numerario_c) + " € (" + (falta > 0 ? "faltam " : "sobram ") + fmt(Math.abs(falta)) + " €)" : "");
      d.style.color = igual ? "var(--mut,#5B6B80)" : "#B45309";
    });
  }

  // Ao abrir um dia lê o CBOS; quando a Caixa se redesenha, repõe as dicas (sem voltar a gravar).
  var irDia0 = irDia;
  irDia = async function (d) { var r = await irDia0(d); try { await carregar(); } catch (e) { /* a Caixa funciona sem isto */ } return r; };
  var des0 = desenharDia;
  desenharDia = function (pronto) { var r = des0(pronto); if (pronto) aplicar(false); return r; };
})();
