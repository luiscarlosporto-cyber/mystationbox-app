/* mystationbox · Saídas TABACO de Penafiel, uma a uma, no turno da Caixa (dono, 21/11/2026).
 * É o dinheiro que sai da caixa para a máquina do tabaco (da Adelaide Sousa Ferreira). Vêm do CBOS (msb-ense → msb_saidas_tabaco) e
 * editam-se aqui: corrigir o valor, anular (ex.: o funcionário registou duas vezes) com motivo, acrescentar uma que faltou.
 * O campo «Saída TABACO» do turno (msb_turnos.tab_c) é a soma das que contam: com saídas na lista, deixa de se escrever à mão.
 * Nada se apaga. O relatório da máquina mostra-as já validadas (maq_turnos.js). Usa do index.html e caixa_pnf.js:
 * sb, EST, DIA, ADMIN, PERFIL, LINHAS, guardar, irDia, pnfDesenhar, pnfJanela, cent, fmt, eur, esc, status, falhou. */
"use strict";
var SAIDAS_TABACO = (function () {
  function ativas(L, t) { return (L || []).filter(function (x) { return x.turno === t && !x.anulado_em; }); }
  function soma(L, t) { return ativas(L, t).reduce(function (s, x) { return s + x.valor_c; }, 0); }
  /* O que o campo do turno deve mostrar: null = sem saídas na lista (fica como está, à mão) */
  function campo(L, t) { return (L || []).some(function (x) { return x.turno === t; }) ? soma(L, t) : null; }
  return {ativas: ativas, soma: soma, campo: campo};
})();
if (typeof module !== "undefined") module.exports = SAIDAS_TABACO;

if (typeof window !== "undefined") (function () {
  var ST = {dia: null, est: null, L: []}, vez = 0;

  async function carregar() {
    var n = ++vez, d = DIA, est = EST;
    if (est !== "pnf") { ST = {dia: d, est: est, L: []}; return; }
    var r = await sb.from("msb_saidas_tabaco").select("*").eq("estacao", "pnf").eq("dia", d).order("criado").order("id");
    if (r.error || n !== vez || d !== DIA || est !== EST) return;
    ST = {dia: d, est: est, L: r.data || []};
    desenhar();
    for (var t of ["t1", "t2"]) {   // campo vazio com saídas na lista: preenche com a soma (nunca por cima do que está escrito)
      var c = SAIDAS_TABACO.campo(ST.L, t), r0 = LINHAS[t] || {};
      if (c !== null && c > 0 && (r0.tab_c === null || r0.tab_c === undefined) && !(window.turnoSelado && turnoSelado(t))) await acertar(t);
    }
  }

  function desenhar() {
    if (EST !== "pnf" || ST.dia !== DIA) return;
    ["t1", "t2"].forEach(function (t) {
      var box = document.getElementById("pnf-" + t); if (!box) return;
      var sec = box.querySelector(".stab");
      if (!sec) { sec = document.createElement("div"); sec.className = "stab"; sec.style.cssText = "margin-bottom:10px;padding-bottom:8px;border-bottom:1px dashed var(--bd,#E3E9F1)"; box.insertBefore(sec, box.firstChild); }
      var L = ST.L.filter(function (x) { return x.turno === t; }), soma = SAIDAS_TABACO.soma(ST.L, t), r = LINHAS[t] || {};
      var h = "<div class='lin'><b>🎰 Saídas TABACO (para a máquina)</b><b>" + eur(soma) + "</b></div>";
      L.forEach(function (x) {
        var an = !!x.anulado_em;
        h += "<div class='lin" + (an ? " anul" : "") + "' style='gap:8px'><span>" + esc(window.CAIXA_CBOS ? CAIXA_CBOS.nome(x.colaborador) : x.colaborador) +
          (x.cbos_id ? " <span class='mut' style='font-size:11px'>CBOS" + (x.cbos_valor_c !== x.valor_c && x.cbos_valor_c ? " " + eur(x.cbos_valor_c) : "") + "</span>" : " <span class='mut' style='font-size:11px'>à mão</span>") +
          (an ? " <span class='mut'>anulada: " + esc(x.anulado_motivo || "") + "</span>" : "") + "</span>" +
          (an ? "<span style='text-decoration:line-through'>" + eur(x.valor_c) + "</span>"
            : "<span style='display:flex;gap:6px;align-items:center'><input inputmode='decimal' data-stv='" + esc(x.id) + "' value='" + fmt(x.valor_c) + "' style='width:90px;text-align:right'" + (ADMIN ? "" : " disabled") + ">" +
              (ADMIN ? "<button class='mini' data-stan='" + esc(x.id) + "'>anular</button>" : "") + "</span>") + "</div>";
      });
      if (!L.length) h += "<div class='mut' style='font-size:13px'>Sem saídas TABACO do CBOS neste turno.</div>";
      if (ADMIN) h += "<div style='margin-top:6px'><button class='mini' data-stnova='" + t + "'>+ Saída TABACO</button></div>";
      var c = SAIDAS_TABACO.campo(ST.L, t);
      if (c !== null && r.tab_c != null && r.tab_c !== c)
        h += "<div class='alerta'>⚠️ O campo Saída TABACO (" + eur(r.tab_c) + ") não é a soma das saídas (" + eur(c) + "). " + (ADMIN ? "<button class='mini' data-stuse='" + t + "'>Usar a soma</button>" : "") + "</div>";
      sec.innerHTML = h;
      // com saídas na lista, o campo do turno é a soma: não se escreve à mão
      var el = document.querySelector("#turnos input[data-t='" + t + "'][data-k='tab']");
      if (el) { el.readOnly = c !== null; el.title = c !== null ? "Soma das saídas TABACO do turno (edite-as na lista por baixo)" : ""; }
      sec.querySelectorAll("[data-stv]").forEach(function (i) { i.onchange = function () { valor(i.dataset.stv, i); }; });
      sec.querySelectorAll("[data-stan]").forEach(function (b) { b.onclick = function () { anular(b.dataset.stan); }; });
      sec.querySelectorAll("[data-stnova]").forEach(function (b) { b.onclick = function () { nova(b.dataset.stnova); }; });
      sec.querySelectorAll("[data-stuse]").forEach(function (b) { b.onclick = function () { acertar(b.dataset.stuse); }; });
    });
  }

  /* Campo do turno = soma das saídas que contam (gravado como qualquer campo da Caixa, com histórico) */
  async function acertar(t) {
    var el = document.querySelector("#turnos input[data-t='" + t + "'][data-k='tab']"), c = SAIDAS_TABACO.campo(ST.L, t);
    if (!el || c === null) return;
    el.value = fmt(c);
    await guardar(el);
    desenhar();
  }
  function bloqueado(t) { if (window.turnoSelado && turnoSelado(t)) { status(false, "🔒 Turno selado: reabra-o para mexer"); return true; } return false; }
  function linha(id) { return ST.L.find(function (x) { return x.id === id; }); }

  async function valor(id, i) {
    var x = linha(id); if (!x || bloqueado(x.turno)) return;
    var v = cent(i.value);
    if (!(v > 0)) { status(false, "Valor inválido: para tirar uma saída use «anular»"); i.value = fmt(x.valor_c); return; }
    try {
      var r = await sb.from("msb_saidas_tabaco").update({valor_c: v}).eq("estacao", "pnf").eq("id", id).is("anulado_em", null).select().single(); if (r.error) throw r.error;
      ST.L = ST.L.map(function (y) { return y.id === id ? r.data : y; }); await acertar(x.turno); status(true, "Saída TABACO corrigida ✓");
    } catch (e) { status(false, "⚠ " + falhou(e)); }
  }

  function anular(id) {
    var x = linha(id); if (!x || bloqueado(x.turno)) return;
    pnfJanela("<h3>Anular a saída TABACO de " + eur(x.valor_c) + "</h3><div class='mut'>Fica riscada, com o motivo; não se apaga.</div><label>Motivo<input id='stMot' maxlength='120' style='text-align:left' placeholder='ex.: registada duas vezes'></label><p class='bad' id='stErr'></p><div class='bts'><button class='mini' data-x>Cancelar</button><button class='mini p' data-ok>Anular</button></div>",
      function (bg, fechar) {
        bg.querySelector("[data-x]").onclick = fechar;
        bg.querySelector("[data-ok]").onclick = async function () {
          var m = bg.querySelector("#stMot").value.trim(); if (!m) { bg.querySelector("#stErr").textContent = "Escreva o motivo."; return; }
          this.disabled = true;
          try {
            var r = await sb.from("msb_saidas_tabaco").update({anulado_em: new Date().toISOString(), anulado_por: (PERFIL && PERFIL.id) || null, anulado_motivo: m.slice(0, 120)})
              .eq("estacao", "pnf").eq("id", id).is("anulado_em", null).select().single(); if (r.error) throw r.error;
            ST.L = ST.L.map(function (y) { return y.id === id ? r.data : y; }); fechar(); await acertar(x.turno); status(true, "Saída TABACO anulada ✓");
          } catch (e) { this.disabled = false; bg.querySelector("#stErr").textContent = falhou(e); }
        };
      });
  }

  function nova(t) {
    if (bloqueado(t)) return;
    pnfJanela("<h3>Nova saída TABACO · " + (t === "t1" ? "Turno 1" : "Turno 2") + "</h3><label>Valor<input id='stVal' inputmode='decimal'></label><p class='bad' id='stErr'></p><div class='bts'><button class='mini' data-x>Cancelar</button><button class='mini p' data-ok>Acrescentar</button></div>",
      function (bg, fechar) {
        bg.querySelector("[data-x]").onclick = fechar;
        bg.querySelector("[data-ok]").onclick = async function () {
          var v = cent(bg.querySelector("#stVal").value); if (!(v > 0)) { bg.querySelector("#stErr").textContent = "Escreva o valor."; return; }
          this.disabled = true;
          var id = Array.from(crypto.getRandomValues(new Uint8Array(8))).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
          try {
            var r = await sb.from("msb_saidas_tabaco").insert({estacao: "pnf", id: id, dia: DIA, turno: t, valor_c: v, colaborador: ((LINHAS[t] || {}).func || "").slice(0, 120)}).select().single(); if (r.error) throw r.error;
            ST.L = ST.L.concat([r.data]); fechar(); await acertar(t); status(true, "Saída TABACO acrescentada ✓");
          } catch (e) { this.disabled = false; bg.querySelector("#stErr").textContent = falhou(e); }
        };
      });
  }

  // Ao abrir um dia lê a lista; sempre que o bloco de Penafiel se redesenha, volta a pô-la no turno.
  var irDia0 = irDia;
  irDia = async function (d) { var r = await irDia0(d); try { await carregar(); } catch (e) { /* a Caixa funciona sem isto */ } return r; };
  if (typeof pnfDesenhar === "function") { var pd0 = pnfDesenhar; pnfDesenhar = function () { var r = pd0.apply(this, arguments); desenhar(); return r; }; }
})();
