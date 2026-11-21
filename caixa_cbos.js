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
  /* pagas = dívidas antigas pagas no turno por meio (CAIXA_PNF.pagas): o MB e o Solred não estão na folha do CBOS e somam-se,
     para o campo ficar igual ao TPA (dono, 21/11/2026); o numerário já vem na entrega final. */
  function propostas(row, estacao, pagas) {
    if (!row) return {};
    var p = {};
    if (row.colaborador && !/[,;/]| e /.test(row.colaborador)) p.func = nome(row.colaborador);
    // Folha do turno (correspondência do dono, 19/11/2026). SOLRED OFFLINE fica de fora: é «Ficou a dever», decide-se à mão.
    // Vendas do OPT (dono, 21/11/2026): o CBOS mete-as no turno mas não estão na caixa do funcionário; tiram-se. Enquanto não
    // forem lidas (opt_em vazio), Vendas, MB e Solred não se propõem, para não entrar um valor com o OPT lá dentro.
    if (row.opt_em) {
      var o = opt(row);
      if (row.total_c != null) p.vendas = row.total_c - o.total;
      if (row.mb_c != null) p.mb = row.mb_c - o.mb + (pagas && pagas.MB || 0);
      if (row.solred_c != null) p.solred = row.solred_c - o.solred + (pagas && pagas.Solred || 0);
    }
    if (estacao === "pnf" && row.credito_c != null) p.cred = row.credito_c;
    var f = soma(row, "fornecedores");
    if (f != null) p.forn = f;
    if (estacao === "pnf") { var t = soma(row, "saida_tabaco"); if (t != null) p.tab = t; }
    // só com a entrega final registada: sem ela o turno ainda não está fechado no CBOS e a soma ficava curta
    if (f != null && row.movimentos.some(function (x) { return x.destino === "entrega_final"; })) p.num = soma(row, "saida") + soma(row, "saida_tabaco") + soma(row, "entrega_final");
    return p;
  }
  /* Vendas do OPT dentro do turno (POS TPV 191: MB e Solred), em cêntimos. */
  function opt(row) {
    var mb = row && row.opt_mb_c || 0, solred = row && row.opt_solred_c || 0, outras = row && row.opt_outras_c || 0;
    return {mb: mb, solred: solred, outras: outras, total: mb + solred + outras};
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
  return {nome: nome, soma: soma, opt: opt, propostas: propostas, faltaNumerario: faltaNumerario, aPreencher: aPreencher, COL: COL};
})();
if (typeof module !== "undefined") module.exports = CAIXA_CBOS;

if (typeof window !== "undefined") (function () {
  var ROWS = {}, DIA_LIDO = null, vez = 0, PAGAS = [];

  async function carregar() {
    if (!ADMIN) return;
    var n = ++vez, est = EST, d = DIA;
    var r = await sb.from("msb_caixa_cbos").select("dia,fecho,tipo,colaborador,numerario_c,total_c,mb_c,solred_c,credito_c,movimentos,opt_mb_c,opt_solred_c,opt_outras_c,opt_em").eq("estacao", est).eq("dia", d);
    if (r.error || n !== vez || est !== EST || d !== DIA) return;   // sem acesso, ou o dia/estação mudou entretanto
    PAGAS = [];
    if (est === "pnf") { var q = await sb.from("msb_clientes_dever").select("pago_dia,pago_turno,pago_meio,valor_c,anulado_em").eq("estacao", "pnf").eq("pago_dia", d); if (!q.error) PAGAS = q.data || []; }
    if (n !== vez || est !== EST || d !== DIA) return;
    ROWS = {}; DIA_LIDO = d;
    (r.data || []).forEach(function (x) { if (x.tipo === "t1" || x.tipo === "t2" || x.tipo === "opt") ROWS[x.tipo] = x; });
    await aplicar(true);
  }

  async function aplicar(preencher) {
    if (DIA_LIDO !== DIA) return;
    for (var t of ["t1", "t2"]) {
      var pg = EST === "pnf" && window.CAIXA_PNF ? CAIXA_PNF.pagas(typeof PNF !== "undefined" && PNF.dia === DIA ? PNF.div : PAGAS, DIA, t) : null;
      var prop = CAIXA_CBOS.propostas(ROWS[t], EST, pg);
      if (preencher) {
        for (var k of CAIXA_CBOS.aPreencher(LINHAS[t], prop)) {
          var el = document.querySelector("#turnos input[data-t='" + t + "'][data-k='" + k + "']");
          if (!el || el.disabled || el.value.trim()) continue;
          el.value = k === "func" ? prop[k] : fmt(prop[k]);
          await guardar(el);   // um de cada vez: cada gravação junta o seu campo à mesma linha do turno
        }
      }
      dicas(t, prop, ROWS[t], pg);
    }
    linhaOpt();
  }

  /* Vendas do OPT do dia, fora da caixa dos turnos: as que o CBOS meteu nos turnos 1 e 2 e o fecho 3 (OPT da noite). */
  function linhaOpt() {
    var tot = document.getElementById("dRec"), card = tot && tot.closest(".card"); if (!card) return;
    var box = document.getElementById("cbosOpt");
    if (!box) { box = document.createElement("div"); box.id = "cbosOpt"; box.className = "mut"; box.style.cssText = "font-size:13px;margin-top:8px"; (card.querySelector(".cb") || card).appendChild(box); }
    var meio = function (mb, sol) { return [mb ? "MB " + fmt(mb) + " €" : "", sol ? "Solred " + fmt(sol) + " €" : ""].filter(Boolean).join(" + "); };
    var partes = [];
    ["t1", "t2"].forEach(function (t) { var o = CAIXA_CBOS.opt(ROWS[t]); if (o.total) partes.push((t === "t1" ? "no turno 1: " : "no turno 2: ") + meio(o.mb, o.solred + o.outras)); });
    var n = ROWS.opt; if (n && (n.mb_c || n.solred_c)) partes.push("da noite (fecho 3): " + meio(n.mb_c, n.solred_c));
    box.hidden = !partes.length;
    box.textContent = partes.length ? "⛽ Vendas do OPT (fora da caixa dos turnos) " + partes.join(" · ") : "";
  }

  function dicas(t, prop, row, pg) {
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
      var mais = pg && (k === "mb" ? pg.MB : k === "solred" ? pg.Solred : 0), o = CAIXA_CBOS.opt(row);
      var semOpt = k === "vendas" ? o.total : k === "mb" ? o.mb : k === "solred" ? o.solred : 0;
      d.textContent = (k === "num" ? (EST === "pnf" ? "CBOS (saídas + TABACO + entrega final): " : "CBOS (saídas + entrega final): ") : "CBOS: ") + cbos + (semOpt ? " (sem OPT " + fmt(semOpt) + " €)" : "") + (mais ? " (com " + fmt(mais) + " € de dívidas pagas)" : "") + dif +
        (falta ? " · ⚠️ folha do turno " + fmt(row.numerario_c) + " € (" + (falta > 0 ? "faltam " : "sobram ") + fmt(Math.abs(falta)) + " €)" : "");
      d.style.color = igual ? "var(--mut,#5B6B80)" : "#B45309";
    });
  }

  // Ao abrir um dia lê o CBOS; quando a Caixa se redesenha, repõe as dicas (sem voltar a gravar).
  window.cbosDicas = function () { aplicar(false); };   // depois de um pagamento de dívida (caixa_pnf.js)
  var irDia0 = irDia;
  irDia = async function (d) { var r = await irDia0(d); try { await carregar(); } catch (e) { /* a Caixa funciona sem isto */ } return r; };
  var des0 = desenharDia;
  desenharDia = function (pronto) { var r = des0(pronto); if (pronto) aplicar(false); return r; };
})();
