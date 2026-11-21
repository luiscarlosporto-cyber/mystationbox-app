/* mystationbox · quadro «Faltas» à direita do Registo diário (dono, 21/11/2026).
 * Saídas de caixa por entregar de todas as datas da estação, com «✔ Recebido» (data de hoje); o turno onde a saída nasceu
 * mostra-a logo como entregue, porque é o mesmo registo (msb_saidas.recebido). Em Penafiel também os clientes a dever por pagar,
 * com o pagamento no turno escolhido do dia aberto (o mesmo da Caixa, caixa_pnf.js). Volta a ler depois de cada gravação.
 * Usa do index.html: sb, EST, DIA, ADMIN, SAIDAS, VISTA, desenharSaidas, carregarSaidas, irDia, iso, eur, esc, dmy, status, falhou. */
"use strict";
var FALTAS_REGRAS = (function () {
  /* Linhas do quadro: saídas por entregar com o funcionário do turno em que nasceram (se a Caixa o tiver). */
  function saidas(L, turnos) {
    var func = {};
    (turnos || []).forEach(function (t) { func[t.dia + "|" + t.turno] = t.func || ""; });
    return (L || []).filter(function (s) { return !s.recebido; }).map(function (s) {
      // o nome do CBOS (saída criada a partir do CBOS) manda; senão, o funcionário escrito no turno da Caixa
      return {id: s.id, dia: s.dia, turno: s.turno, valor_c: s.valor_c, nota: s.nota || "", func: s.colaborador || func[s.dia + "|" + s.turno] || ""};
    }).sort(function (a, b) { return a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : a.turno < b.turno ? -1 : a.turno > b.turno ? 1 : 0; });
  }
  function total(L) { return (L || []).reduce(function (s, x) { return s + x.valor_c; }, 0); }
  return {saidas: saidas, total: total};
})();
if (typeof module !== "undefined") module.exports = FALTAS_REGRAS;

if (typeof window !== "undefined") (function () {
  var vez = 0, espera = null;

  async function carregar() {
    var box = document.getElementById("faltas"); if (!box) return;
    if (!ADMIN) { box.hidden = true; return; }
    var n = ++vez, est = EST;
    try {
      var s = await sb.from("msb_saidas").select("*").eq("estacao", est).is("recebido", null).order("dia").order("criado").limit(500); if (s.error) throw s.error;
      var dias = (s.data || []).map(function (x) { return x.dia; }).filter(function (d, i, a) { return a.indexOf(d) === i; });
      var t = dias.length ? await sb.from("msb_turnos").select("dia,turno,func").eq("estacao", est).in("dia", dias) : {data: []}; if (t.error) throw t.error;
      var c = est === "pnf" ? await sb.from("msb_clientes_dever").select("*").eq("estacao", "pnf").is("pago_dia", null).is("anulado_em", null).order("dia").order("turno").order("id") : {data: null};
      if (c.error) throw c.error;
      if (n !== vez || est !== EST) return;   // outra leitura mais recente, ou mudou a estação
      desenhar(box, FALTAS_REGRAS.saidas(s.data, t.data), c.data);
    } catch (e) { if (n === vez) box.innerHTML = "<h2>Faltas</h2><div class='bad'>" + esc(falhou(e)) + "</div>"; }
  }
  function agendar() { clearTimeout(espera); espera = setTimeout(carregar, 150); }

  function desenhar(box, S, C) {
    var turno = function (t) { return t === "t1" ? "Turno 1" : t === "t2" ? "Turno 2" : t; };
    var h = "<div style='display:flex;justify-content:space-between;align-items:baseline'><h2 style='margin:0'>Faltas</h2><span class='mut' style='font-size:12px'>todas as datas</span></div>" +
      "<div style='display:flex;justify-content:space-between;margin-top:12px'><b>Saídas de caixa por entregar</b><b>" + eur(FALTAS_REGRAS.total(S)) + "</b></div>";
    h += S.length ? S.map(function (x) {
      return "<div style='border:1px solid var(--bd);border-radius:12px;padding:10px 12px;margin-top:8px;display:flex;justify-content:space-between;align-items:center;gap:10px'>" +
        "<div><b>" + eur(x.valor_c) + "</b><div class='mut' style='font-size:12px'>" + dmy(x.dia).slice(0, 5) + " · " + turno(x.turno) + (x.func ? " · " + esc(window.CAIXA_CBOS ? CAIXA_CBOS.nome(x.func) : x.func) : "") + (x.nota ? " · " + esc(x.nota) : "") + "</div></div>" +
        "<button class='mini' data-frec='" + esc(x.id) + "' style='background:var(--okb);min-height:40px;white-space:nowrap'>✔ Recebido</button></div>";
    }).join("") : "<div class='ok' style='margin-top:8px'>✔ Nenhuma saída por entregar.</div>";
    if (C) {
      h += "<div style='display:flex;justify-content:space-between;margin-top:16px;padding-top:12px;border-top:1px solid var(--bd)'><b>Clientes a dever</b><b>" + eur(FALTAS_REGRAS.total(C)) + "</b></div>";
      h += C.length ? C.map(function (x) {
        return "<div style='border:1px solid var(--bd);border-radius:12px;padding:10px 12px;margin-top:8px'><div style='display:flex;justify-content:space-between;gap:8px'><b>" + esc(x.cliente) + "</b><b>" + eur(x.valor_c) + "</b></div>" +
          "<div class='mut' style='font-size:12px'>" + dmy(x.dia).slice(0, 5) + " · " + turno(x.turno) + (x.doc ? " · " + esc(x.doc) : "") + "</div>" +
          "<div style='display:flex;gap:6px;flex-wrap:wrap;margin-top:6px'><span class='mut' style='font-size:12px;align-self:center'>Pagou hoje no</span>" +
          "<button class='mini' data-fpag='t1' data-fid='" + x.id + "'>Turno 1</button><button class='mini' data-fpag='t2' data-fid='" + x.id + "'>Turno 2</button></div></div>";
      }).join("") : "<div class='ok' style='margin-top:8px'>✔ Nenhum cliente a dever.</div>";
    }
    box.innerHTML = h;
    box.querySelectorAll("[data-frec]").forEach(function (b) { b.onclick = function () { recebido(b, b.dataset.frec); }; });
    box.querySelectorAll("[data-fpag]").forEach(function (b) { b.onclick = function () { pagou(b.dataset.fpag, +b.dataset.fid); }; });
  }

  async function recebido(b, id) {
    b.disabled = true;
    try {
      var r = await sb.from("msb_saidas").update({recebido: iso(new Date())}).eq("estacao", EST).eq("id", id).is("recebido", null).select().single(); if (r.error) throw r.error;
      if (r.data.dia === DIA) { SAIDAS = SAIDAS.map(function (s) { return s.id === r.data.id ? r.data : s; }); desenharSaidas(r.data.turno); }
      if (VISTA === "sai") carregarSaidas();
      status(true, "Saída de " + eur(r.data.valor_c) + " de " + dmy(r.data.dia) + " recebida ✓");
      agendar();
    } catch (e) { b.disabled = false; status(false, "⚠ " + falhou(e)); }
  }

  /* Penafiel: abre o pagamento da Caixa (caixa_pnf.js) no turno escolhido do dia aberto, já com esta dívida escolhida.
     O dia aberto tem de ser hoje: o pagamento entra na caixa desse turno. */
  function pagou(t, id) {
    if (DIA !== iso(new Date())) { status(false, "⚠ Para registar um pagamento, abra o dia de hoje na Caixa."); return; }
    if (typeof pnfPagar !== "function") return;
    pnfPagar(t, id);
  }

  // Sempre atual: volta a ler depois de abrir um dia, de mexer nas saídas ou nas dívidas.
  var irDia0 = irDia;
  irDia = async function (d) { var r = await irDia0(d); agendar(); return r; };
  var des0 = desenharSaidas;
  desenharSaidas = function (t) { var r = des0(t); agendar(); return r; };
  if (typeof pnfRecarregarTurnos === "function") {
    var rec0 = pnfRecarregarTurnos;
    pnfRecarregarTurnos = async function () { var r = await rec0.apply(this, arguments); agendar(); return r; };
  }
  window.faltasCarregar = carregar;
})();
