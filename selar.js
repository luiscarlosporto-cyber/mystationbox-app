/* mystationbox · Selar turno na Caixa (dono, 21/11/2026): bloqueia o turno para não se mexer sem querer; «Reabrir» volta a deixar mexer.
 * Guarda msb_turnos.selado_em/selado_por (histórico em msb_eventos). Um turno selado fica com a moldura verde e tudo o que se edita nele
 * desligado (campos, saídas, cofre, clientes, saídas TABACO). O quadro Faltas continua a poder dar uma saída como recebida.
 * Usa do index.html: sb, EST, DIA, ADMIN, PERFIL, LINHAS, guardar, desenharDia, status, falhou, esc. */
"use strict";
(function () {
  function selado(t) { return !!(LINHAS[t] && LINHAS[t].selado_em); }
  window.turnoSelado = selado;

  function aplicar() {
    ["t1", "t2"].forEach(function (t) {
      var h = document.querySelector("#turnos .ch." + t); if (!h) return;
      var card = h.closest(".card"), s = selado(t);
      var b = h.querySelector("[data-selar]");
      if (ADMIN && !b) { b = document.createElement("button"); b.className = "mini"; b.dataset.selar = t; b.style.marginLeft = "8px"; h.appendChild(b); b.onclick = function () { mudar(t); }; }
      if (b) { b.textContent = s ? "🔓 Reabrir" : "🔒 Selar"; b.title = s ? "Selado: carregue para voltar a poder mexer neste turno" : "Bloquear este turno para não se mexer sem querer"; }
      card.style.outline = s ? "2px solid #15803D" : ""; card.style.outlineOffset = s ? "-2px" : "";
      card.querySelectorAll("input,button,select,textarea").forEach(function (el) {
        if (el.dataset.selar) return;
        if (s) { if (!el.disabled) { el.disabled = true; el.dataset.seladoOff = "1"; } }
        else if (el.dataset.seladoOff) { el.disabled = false; delete el.dataset.seladoOff; }
      });
    });
  }

  async function mudar(t) {
    var s = selado(t);
    if (s && !confirm("Reabrir o " + (t === "t1" ? "Turno 1" : "Turno 2") + "? Fica outra vez editável.")) return;
    var linha = {estacao: EST, dia: DIA, turno: t, selado_em: s ? null : new Date().toISOString(), selado_por: s ? null : (PERFIL && PERFIL.id) || null};
    try {
      var r = await sb.from("msb_turnos").upsert(linha, {onConflict: "estacao,dia,turno"}).select().single(); if (r.error) throw r.error;
      LINHAS[t] = r.data; aplicar(); status(true, s ? "Turno reaberto ✓" : "Turno selado 🔒");
    } catch (e) { status(false, "⚠ " + falhou(e)); }
  }

  // Não gravar num turno selado, venha de onde vier (pré-preenchimento do CBOS incluído).
  var guardar0 = guardar;
  guardar = async function (el) { if (el && el.dataset && selado(el.dataset.t)) { status(false, "🔒 Turno selado: reabra-o para mexer"); return; } return guardar0(el); };

  // Sempre que o turno é redesenhado (Caixa, saídas, cofre de Penafiel, saídas TABACO), volta a aplicar.
  var vez = null;
  function agendar() { if (vez) return; vez = setTimeout(function () { vez = null; aplicar(); }, 0); }
  var des0 = desenharDia;
  desenharDia = function (p) { var r = des0(p); aplicar(); return r; };
  var tt = document.getElementById("turnos"); if (tt) new MutationObserver(agendar).observe(tt, {childList: true, subtree: true});
  window.selarAplicar = aplicar;
})();
