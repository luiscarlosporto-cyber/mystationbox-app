/* mystationbox · caixa de Penafiel no Registo diário (dono, 19/11/2026): cofre da máquina de tabaco e clientes que ficam a dever.
 * Contas em caixa_pnf_regras.js. Usa do index.html: sb, EST, DIA, LINHAS, ADMIN, PERFIL, totais, status, falhou, cent, fmt, eur, esc, dmy, iso, addDia.
 * Vendas tabaco máquina: as mesmas leituras do CBOS por turno da página da máquina (msb_pedidos «TURNOS», maq_turnos.js), só artigos da máquina.
 * Clientes a dever: tabela msb_clientes_dever; o trigger põe os totais no turno (dever_c, pagou_c) e a diferença conta-os. Nada se apaga. */
"use strict";
var PNF = {dia: null, ant: null, maq: {}, div: [], cods: null, aberto: null};

async function pnfCodigos() {   // artigos da máquina: a regra da estação (msb_config.maquina) sobre o catálogo e os artigos do stock (só leitura)
  if (PNF.cods) return PNF.cods;
  var c = await sb.from("msb_config").select("maquina").eq("estacao", "pnf").maybeSingle();
  var r = c.data && c.data.maquina, cods = {};
  if (!r) return (PNF.cods = cods);
  var cats = {}, fora = {}; (r.categorias || []).forEach(function (x) { cats[x] = 1; }); (r.fora || []).forEach(function (x) { fora[x] = 1; });
  Object.keys(r.catalogo || {}).forEach(function (k) { if (cats[r.catalogo[k][1]] && !fora[k]) cods[k] = 1; });
  var p = await sb.from("products").select("repsol_code,category").not("repsol_code", "is", null);
  (p.data || []).forEach(function (x) { if (cats[x.category] && !fora[x.repsol_code]) cods[x.repsol_code] = 1; });
  return (PNF.cods = cods);
}

async function pnfCarregar(d) {
  if (EST !== "pnf") return;
  PNF.dia = d;
  try {
    var a = CAIXA_PNF.anterior(d, "t1");
    var R = await Promise.all([
      sb.from("msb_turnos").select("cofre_c,macos_c").eq("estacao", "pnf").eq("dia", a.dia).eq("turno", a.turno).maybeSingle(),
      sb.from("msb_pedidos").select("id,de,ate,estado,dias").eq("estacao", "pnf").eq("pasta", "TURNOS").lte("de", d).gte("ate", d).order("id"),
      sb.from("msb_clientes_dever").select("*").eq("estacao", "pnf").or("and(pago_dia.is.null,anulado_em.is.null),dia.eq." + d + ",pago_dia.eq." + d).order("dia").order("turno").order("id"),
      pnfCodigos()
    ]);
    R.slice(0, 3).forEach(function (x) { if (x.error) throw x.error; });
    if (d !== PNF.dia || d !== DIA) return;
    PNF.ant = R[0].data || null;
    var lidos = MAQT.porDia(R[1].data || [])[d] || {}, cods = R[3];
    PNF.maq = {};
    ["t1", "t2"].forEach(function (t) { if (lidos[t] && Object.keys(cods).length) PNF.maq[t] = MAQT.somar(lidos[t], cods).valor_c; });
    var pend = (R[1].data || []).some(function (p) { return p.estado === "pendente" || p.estado === "a_ler"; });
    if (ADMIN && !pend && d < iso(new Date()) && (!lidos.t1 || !lidos.t2))   // pede ao OCTAN AI a leitura do dia, como a página da máquina
      await sb.from("msb_pedidos").insert({estacao: "pnf", de: d, ate: d, pasta: "TURNOS", artigo: "", pedido_por: (PERFIL && PERFIL.display_name) || ""});
    PNF.pend = pend || (d < iso(new Date()) && (!lidos.t1 || !lidos.t2));
    PNF.div = R[2].data || [];
    pnfDesenhar();
  } catch (e) { status(false, "⚠ Caixa de Penafiel: " + falhou(e)); }
}

function pnfTxtEstado(c) {
  return {falta_anterior: "<span class='chip c-in'>ℹ️ falta o contador do turno anterior</span>", falta_contador: "<span class='chip c-in'>ℹ️ falta o contador no fim</span>",
    espera_cbos: "<span class='chip c-in'>ℹ️ à espera das vendas da máquina (CBOS)</span>", certo: "<span class='chip c-ok'>✅ cofre certo</span>",
    falta: "<span class='chip c-er'>❌ cofre falta " + eur(-(c.dif || 0)) + "</span>", sobra: "<span class='chip c-wa'>⚠️ cofre sobra " + eur(c.dif || 0) + "</span>"}[c.estado];
}
function pnfDesenhar() {
  if (EST !== "pnf") { var bd = document.getElementById("pnf-dia"); if (bd) bd.hidden = true; return; }
  if (PNF.dia !== DIA) return;
  ["t1", "t2"].forEach(function (t) {
    var box = document.getElementById("pnf-" + t); if (!box) return;
    var r = LINHAS[t] || {}, ant = t === "t1" ? PNF.ant : (LINHAS.t1 || null), vm = PNF.maq[t] === undefined ? null : PNF.maq[t];
    var c = CAIXA_PNF.cofre(ant, r, vm), al = CAIXA_PNF.alerta(dif(r), c), dis = ADMIN ? "" : " disabled";
    var v = function (k) { return r[k] == null ? "" : fmt(r[k]); };
    var h = "<div class='lin'><b>🎰 Cofre da máquina</b><span class='mut'>" + (c.ini === null ? "início: —" : "início " + eur(c.ini) + " (" + fmt(c.iniCont) + " + " + fmt(c.iniMacos) + " maços)" + (c.manual ? " · definido à mão" : "")) +
      (ADMIN ? " <button class='mini' data-pini='" + t + "'>" + (c.manual ? "mudar início" : c.ini === null ? "Definir valor inicial" : "definir início") + "</button>" : "") + "</span></div>" +
      "<div class='fl'><label class='novo'>Contador no fim<input inputmode='decimal' data-pnf='cofre_c' data-t='" + t + "' value='" + v("cofre_c") + "' placeholder='0,00'" + dis + "></label>" +
      "<label class='novo'>Maços por fora (€)<input inputmode='decimal' data-pnf='macos_c' data-t='" + t + "' value='" + v("macos_c") + "' placeholder='0,00'" + dis + "></label></div>" +
      "<div class='lin'><span>Passa ao turno seguinte</span><b>" + (c.fim === null ? "—" : eur(c.fim)) + "</b></div>";
    if (ADMIN) h += "<div class='lin'><span>🎰 Vendas tabaco máquina <span class='mut'>(CBOS)</span></span><b>" + (vm === null ? (PNF.pend ? "<span class='mut'>a ler…</span>" : "—") : eur(vm)) + "</b></div>" +
      (c.devia === null ? "" : "<div class='lin'><span class='mut'>Devia ser: " + eur(c.ini) + " + " + eur(r.tab_c || 0) + " − " + eur(vm) + "</span><b>" + eur(c.devia) + "</b></div>") +
      "<div>" + pnfTxtEstado(c) + "</div>";
    if (ADMIN && al) h += "<div class='alerta'>⚠️ <b>" + (al.tipo === "esquecida" ? "Possível saída TABACO esquecida" : "Saída TABACO a mais?") + "</b>: " +
      (al.tipo === "esquecida" ? "falta " + eur(-dif(r)) + " na caixa e sobra " + eur(c.dif) + " no cofre. Pode ter sido posto cerca de " + eur(al.provavel_c) + " no cofre sem registo. Confirme antes de corrigir."
        : "sobra " + eur(dif(r)) + " na caixa e falta " + eur(-c.dif) + " no cofre: a saída TABACO pode estar acima do que foi posto no cofre.") +
      "<br><b>No total do turno (caixa + cofre): " + (al.total_c === 0 ? "bate certo ✅" : (al.total_c < 0 ? "faltam " : "sobram ") + eur(Math.abs(al.total_c))) + "</b></div>";
    /* clientes */
    var meus = PNF.div.filter(function (x) { return !(x.origem && x.anulado_em) && ((x.dia === DIA && x.turno === t) || (x.pago_dia === DIA && x.pago_turno === t)); });
    var nAb = CAIXA_PNF.porPagar(PNF.div, DIA, t).length;
    h += "<div class='lin' style='margin-top:6px'><b>👥 Clientes</b>" + (ADMIN ? "<span><button class='mini' data-pdv='" + t + "'>+ Ficou a dever</button> <button class='mini' data-ppg='" + t + "'" + (nAb ? "" : " disabled") + ">✔ Pagou dívida" + (nAb ? " (" + nAb + ")" : "") + "</button></span>" : "") + "</div>";
    meus.forEach(function (x) {
      var pago = x.pago_dia === DIA && x.pago_turno === t, an = !!x.anulado_em;
      h += "<div class='lin" + (an ? " anul" : "") + "'><span><b>" + esc(x.cliente) + "</b>" + (pago ? " pagou (" + esc(x.pago_meio) + ")" : (x.doc ? " · " + esc(x.doc) : "")) + (an ? " <span class='mut'>anulada: " + esc(x.anulado_motivo || "") + "</span>" : "") + "</span>" +
        "<span><span class='tg " + (pago ? "tp" : "tf") + "'>" + (pago ? "pagamento" : "ficou a dever") + "</span> <b>" + eur(x.valor_c) + "</b>" +
        (ADMIN && !an ? (pago ? " <button class='mini' data-pdes='" + x.id + "'>desfazer</button>" : (!x.pago_dia ? " <button class='mini' data-pan='" + x.id + "'>anular</button>" : " <span class='mut'>paga " + dmy(x.pago_dia).slice(0, 5) + "</span>")) : "") + "</span></div>";
    });
    box.innerHTML = h;
  });
  pnfDeposito();
  pnfLigar();
}
/* Numerário a depositar no banco, total do dia: aparece depois de fechado o turno 2 (por baixo do total do dia) */
function pnfDeposito() {
  var tot = document.getElementById("dRec"), card = tot && tot.closest(".card"); if (!card) return;
  var box = document.getElementById("pnf-dia");
  if (!box) { box = document.createElement("div"); box.id = "pnf-dia"; box.className = "pnf"; box.style.marginTop = "10px"; (card.querySelector(".cb") || card).appendChild(box); }
  var d = CAIXA_PNF.deposito(LINHAS.t1, LINHAS.t2, typeof SAIDAS !== "undefined" ? SAIDAS : []);
  box.hidden = !d;
  if (!d) { box.innerHTML = ""; return; }
  box.innerHTML = "<div class='lin'><b>🏦 Numerário a depositar no banco</b><b style='font-size:18px'>" + eur(d.valor_c) + "</b></div>" +
    "<div class='lin mut' style='font-size:13px'><span>Numerário T1 + T2 " + eur(d.num_c) + (d.saidas_c ? " − saídas de caixa " + eur(d.saidas_c) : "") + (d.tab_c ? " − saída TABACO " + eur(d.tab_c) : "") + "</span></div>";
}
function pnfLigar() {
  document.querySelectorAll("[data-pnf]").forEach(function (el) { el.onchange = function () { pnfGuardar(el); }; });
  document.querySelectorAll("[data-pini]").forEach(function (b) { b.onclick = function () { pnfInicio(b.dataset.pini); }; });
  document.querySelectorAll("[data-pdv]").forEach(function (b) { b.onclick = function () { pnfDever(b.dataset.pdv); }; });
  document.querySelectorAll("[data-ppg]").forEach(function (b) { b.onclick = function () { pnfPagar(b.dataset.ppg); }; });
  document.querySelectorAll("[data-pan]").forEach(function (b) { b.onclick = function () { pnfAnular(+b.dataset.pan); }; });
  document.querySelectorAll("[data-pdes]").forEach(function (b) { b.onclick = function () { pnfDesfazer(+b.dataset.pdes); }; });
}
async function pnfGuardar(el) {
  var t = el.dataset.t, k = el.dataset.pnf, val = el.value.trim(), c = cent(val);
  if (val && (isNaN(c) || c < 0)) { status(false, "Valor inválido"); return; }
  var linha = {estacao: EST, dia: DIA, turno: t}; linha[k] = c;
  try { var r = await sb.from("msb_turnos").upsert(linha, {onConflict: "estacao,dia,turno"}).select().single(); if (r.error) throw r.error; LINHAS[t] = r.data; totais(); status(true, "Guardado ✓"); }
  catch (e) { status(false, "⚠ " + falhou(e)); }
}
async function pnfRecarregarTurnos() {
  var r = await sb.from("msb_turnos").select("*").eq("estacao", EST).eq("dia", DIA); if (r.error) throw r.error;
  (r.data || []).forEach(function (x) { LINHAS[x.turno] = x; });
  await pnfCarregar(DIA); totais();
}

/* ——— janelas ——— */
function pnfJanela(html, ligar) {
  var bg = document.createElement("div"); bg.className = "pnfJan"; bg.innerHTML = "<div class='pnfCx' role='dialog' aria-modal='true'>" + html + "</div>";
  document.body.appendChild(bg);
  var fechar = function () { bg.remove(); };
  bg.onclick = function (e) { if (e.target === bg) fechar(); };
  ligar(bg, fechar);
  var i = bg.querySelector("input"); if (i) i.focus();
}
/* Valor inicial do cofre definido à mão (o primeiro turno, ou para recomeçar a contagem). Fica no histórico do turno. */
function pnfInicio(t) {
  var r = LINHAS[t] || {}, v = function (k) { return r[k] == null ? "" : fmt(r[k]); };
  pnfJanela("<h3>Valor inicial do cofre · " + (t === "t1" ? "Turno 1" : "Turno 2") + " de " + dmy(DIA) + "</h3><div class='mut'>O que o cofre tem no início deste turno. A partir daqui, cada turno começa com o fim do anterior. Deixe vazio para voltar a usar o fim do turno anterior.</div>" +
    "<div class='fl'><label>Contador no início<input id='pnfIc' inputmode='decimal' value='" + v("cofre_ini_c") + "' placeholder='0,00'></label><label>Maços por fora (€)<input id='pnfIm' inputmode='decimal' value='" + v("macos_ini_c") + "' placeholder='0,00'></label></div>" +
    "<p class='bad' id='pnfErr'></p><div class='bts'><button class='mini' data-x>Cancelar</button><button class='mini p' data-ok>Guardar</button></div>", function (bg, fechar) {
    bg.querySelector("[data-x]").onclick = fechar;
    bg.querySelector("[data-ok]").onclick = async function () {
      var err = bg.querySelector("#pnfErr"), tc = bg.querySelector("#pnfIc").value.trim(), tm = bg.querySelector("#pnfIm").value.trim(), c = cent(tc), m = cent(tm);
      if ((tc && (isNaN(c) || c < 0)) || (tm && (isNaN(m) || m < 0))) { err.textContent = "Valor inválido."; return; }
      if (!tc && tm) { err.textContent = "Escreva também o contador."; return; }
      try {
        var q = await sb.from("msb_turnos").upsert({estacao: EST, dia: DIA, turno: t, cofre_ini_c: c, macos_ini_c: tc ? (m || 0) : null}, {onConflict: "estacao,dia,turno"}).select().single(); if (q.error) throw q.error;
        LINHAS[t] = q.data; fechar(); totais(); status(true, "Valor inicial do cofre guardado ✓");
      } catch (e) { err.textContent = falhou(e); }
    };
  });
}
function pnfDever(t) {
  var cli = CAIXA_PNF.CLIENTES[0];
  var corpo = function () {
    return "<h3>Ficou a dever · " + (t === "t1" ? "Turno 1" : "Turno 2") + "</h3><div class='chips'>" + CAIXA_PNF.CLIENTES.concat(["Outro"]).map(function (c) { return "<button class='mini" + (c === cli ? " on" : "") + "' data-c='" + esc(c) + "'>" + esc(c) + "</button>"; }).join("") + "</div>" +
      (cli === "Outro" ? "<label>Nome do cliente<input id='pnfNome' maxlength='80'></label>" : "") +
      "<div class='fl'><label>Valor<input id='pnfVal' inputmode='decimal' placeholder='0,00'></label><label>Fatura nº / Solred offline<input id='pnfDoc' maxlength='80' style='text-align:left'></label></div>" +
      "<p class='bad' id='pnfErr'></p><div class='bts'><button class='mini' data-x>Cancelar</button><button class='mini p' data-ok>Registar</button></div>";
  };
  pnfJanela(corpo(), function liga(bg, fechar) {
    bg.querySelectorAll("[data-c]").forEach(function (b) { b.onclick = function () { cli = b.dataset.c; var v = bg.querySelector("#pnfVal").value, d = bg.querySelector("#pnfDoc").value; bg.firstChild.innerHTML = corpo(); bg.querySelector("#pnfVal").value = v; bg.querySelector("#pnfDoc").value = d; liga(bg, fechar); }; });
    bg.querySelector("[data-x]").onclick = fechar;
    bg.querySelector("[data-ok]").onclick = async function () {
      var err = bg.querySelector("#pnfErr"), v = cent(bg.querySelector("#pnfVal").value), nome = cli === "Outro" ? (bg.querySelector("#pnfNome").value || "").trim() : cli;
      if (!nome) { err.textContent = "Escreva o nome do cliente."; return; }
      if (!(v > 0)) { err.textContent = "Escreva o valor."; return; }
      this.disabled = true;
      try {
        var r = await sb.from("msb_clientes_dever").insert({estacao: EST, cliente: nome.slice(0, 80), valor_c: v, doc: bg.querySelector("#pnfDoc").value.trim().slice(0, 80), dia: DIA, turno: t}); if (r.error) throw r.error;
        fechar(); await pnfRecarregarTurnos(); status(true, nome + " ficou a dever " + eur(v) + " ✓");
      } catch (e) { this.disabled = false; err.textContent = falhou(e); }
    };
  });
}
function pnfPagar(t, sel0) {   // sel0: dívida já escolhida (quadro das Faltas, faltas.js)
  var L = CAIXA_PNF.porPagar(PNF.div, DIA, t), sel = L.some(function (x) { return x.id === sel0; }) ? sel0 : null, meio = "Numerário";
  var corpo = function (pv) {
    return "<h3>Pagou dívida · " + (t === "t1" ? "Turno 1" : "Turno 2") + "</h3><div class='mut'>Escolha o que está a pagar:</div>" +
      L.map(function (x) { return "<div class='opt" + (sel === x.id ? " on" : "") + "' data-s='" + x.id + "'><span><b>" + esc(x.cliente) + "</b> · " + dmy(x.dia).slice(0, 5) + " " + x.turno.toUpperCase() + (x.doc ? " · " + esc(x.doc) : "") + "</span><b>" + eur(x.valor_c) + "</b></div>"; }).join("") +
      (sel ? "<div class='fl'><label>Valor pago<input id='pnfPv' inputmode='decimal' value='" + esc(pv) + "'></label><label>Pagou com<span class='chips'>" + CAIXA_PNF.MEIOS.map(function (m) { return "<button class='mini" + (m === meio ? " on" : "") + "' data-m='" + m + "'>" + m + "</button>"; }).join("") + "</span></label></div>" : "") +
      "<p class='bad' id='pnfErr'></p><div class='bts'><button class='mini' data-x>Cancelar</button><button class='mini p' data-ok" + (sel ? "" : " disabled") + ">✔ Pago</button></div>";
  };
  var x0 = sel && L.find(function (y) { return y.id === sel; });
  pnfJanela(corpo(x0 ? fmt(x0.valor_c) : ""), function liga(bg, fechar) {
    var pv = function () { var i = bg.querySelector("#pnfPv"); return i ? i.value : ""; };
    bg.querySelectorAll("[data-s]").forEach(function (b) { b.onclick = function () { sel = +b.dataset.s; var x = L.find(function (y) { return y.id === sel; }); bg.firstChild.innerHTML = corpo(fmt(x.valor_c)); liga(bg, fechar); }; });
    bg.querySelectorAll("[data-m]").forEach(function (b) { b.onclick = function () { var v = pv(); meio = b.dataset.m; bg.firstChild.innerHTML = corpo(v); liga(bg, fechar); }; });
    bg.querySelector("[data-x]").onclick = fechar;
    bg.querySelector("[data-ok]").onclick = async function () {
      var err = bg.querySelector("#pnfErr"), x = L.find(function (y) { return y.id === sel; }), p;
      try { p = CAIXA_PNF.pagar(x, cent(pv()), meio); } catch (e) { err.textContent = e.message; return; }
      this.disabled = true;
      try {
        var agora = new Date().toISOString(), eu = (PERFIL && PERFIL.id) || null;
        if (p.resto_c) {   // pagamento parcial: o resto fica como dívida nova ligada a esta (no mesmo turno em que nasceu)
          var r0 = await sb.from("msb_clientes_dever").insert({estacao: EST, cliente: x.cliente, valor_c: p.resto_c, doc: ((x.doc ? x.doc + " · " : "") + "resto").slice(0, 80), dia: x.dia, turno: x.turno, origem: x.id}); if (r0.error) throw r0.error;
        }
        var r = await sb.from("msb_clientes_dever").update({valor_c: p.pago_c, pago_dia: DIA, pago_turno: t, pago_meio: meio, pago_em: agora, pago_por: eu}).eq("estacao", EST).eq("id", x.id).is("pago_dia", null); if (r.error) throw r.error;
        fechar(); await pnfRecarregarTurnos(); status(true, x.cliente + " pagou " + eur(p.pago_c) + (p.resto_c ? " (fica por pagar " + eur(p.resto_c) + ")" : "") + " ✓");
      } catch (e) { this.disabled = false; err.textContent = falhou(e); }
    };
  });
}
function pnfAnular(id) {
  var x = PNF.div.find(function (y) { return y.id === id; }); if (!x) return;
  pnfJanela("<h3>Anular a dívida de " + esc(x.cliente) + " (" + eur(x.valor_c) + ")</h3><div class='mut'>Fica registada como anulada, com o motivo; não se apaga.</div><label>Motivo<input id='pnfMot' maxlength='120' style='text-align:left'></label><p class='bad' id='pnfErr'></p><div class='bts'><button class='mini' data-x>Cancelar</button><button class='mini p' data-ok>Anular</button></div>", function (bg, fechar) {
    bg.querySelector("[data-x]").onclick = fechar;
    bg.querySelector("[data-ok]").onclick = async function () {
      var m = bg.querySelector("#pnfMot").value.trim(); if (!m) { bg.querySelector("#pnfErr").textContent = "Escreva o motivo."; return; }
      try { var r = await sb.from("msb_clientes_dever").update({anulado_em: new Date().toISOString(), anulado_por: (PERFIL && PERFIL.id) || null, anulado_motivo: m.slice(0, 120)}).eq("estacao", EST).eq("id", id).is("pago_dia", null); if (r.error) throw r.error; fechar(); await pnfRecarregarTurnos(); status(true, "Dívida anulada ✓"); }
      catch (e) { bg.querySelector("#pnfErr").textContent = falhou(e); }
    };
  });
}
async function pnfDesfazer(id) {
  var x = PNF.div.find(function (y) { return y.id === id; }); if (!x) return;
  if (!await msbConfirma("Desfazer o pagamento de " + x.cliente + " (" + eur(x.valor_c) + ")? A dívida volta a ficar por pagar.", "Desfazer")) return;
  try {
    var q = await sb.from("msb_clientes_dever").select("*").eq("estacao", EST).eq("origem", id).is("anulado_em", null); if (q.error) throw q.error;
    var resto = q.data || [], val = x.valor_c;
    if (resto.some(function (y) { return y.pago_dia; })) throw new Error("o resto desta dívida já foi pago: desfaça primeiro esse pagamento.");
    for (var i = 0; i < resto.length; i++) {   // junta o resto de volta (fica anulado, com o motivo)
      var a = await sb.from("msb_clientes_dever").update({anulado_em: new Date().toISOString(), anulado_por: (PERFIL && PERFIL.id) || null, anulado_motivo: "junto à dívida " + id + " (pagamento desfeito)"}).eq("estacao", EST).eq("id", resto[i].id); if (a.error) throw a.error;
      val += resto[i].valor_c;
    }
    var r = await sb.from("msb_clientes_dever").update({valor_c: val, pago_dia: null, pago_turno: null, pago_meio: null, pago_em: null, pago_por: null}).eq("estacao", EST).eq("id", id); if (r.error) throw r.error;
    await pnfRecarregarTurnos(); status(true, "Pagamento desfeito ✓");
  } catch (e) { status(false, "⚠ " + falhou(e)); }
}

/* ——— página «Clientes a dever» (Caixa, só Penafiel) ——— */
async function carregarClientesDever() {
  var box = document.getElementById("cdvCorpo"); if (!box) return;
  if (EST !== "pnf") { box.innerHTML = "<div class='card'><div class='cb mut'>Os clientes a dever só existem na caixa de Penafiel.</div></div>"; return; }
  box.innerHTML = "<div class='card'><div class='cb mut'>A carregar…</div></div>";
  try {
    var L = await lerTudo(function () { return sb.from("msb_clientes_dever").select("*").eq("estacao", "pnf"); }, ["id"]);
    if (L.error) throw L.error; L = L.data || L;
    var ab = L.filter(function (x) { return !x.pago_dia && !x.anulado_em; }), tot = ab.reduce(function (s, x) { return s + x.valor_c; }, 0), hoje = iso(new Date());
    var velho = function (x) { return x.dia <= addDia(hoje, -30); };
    var linha = function (x) {
      return "<tr" + (x.anulado_em || x.pago_dia ? " class='mut'" : "") + "><td class='l'><b>" + esc(x.cliente) + "</b></td><td>" + dmy(x.dia) + " " + x.turno.toUpperCase() + "</td><td class='l'>" + esc(x.doc) + "</td><td class='l'>" +
        (x.anulado_em ? "anulada: " + esc(x.anulado_motivo || "") : x.pago_dia ? "✅ paga " + dmy(x.pago_dia) + " " + x.pago_turno.toUpperCase() + " · " + esc(x.pago_meio) : (velho(x) ? "⚠️ por pagar há mais de 30 dias" : "por pagar")) + "</td><td class='n'>" + eur(x.valor_c) + "</td></tr>";
    };
    var ord = function (a, b) { return a.dia < b.dia ? 1 : a.dia > b.dia ? -1 : b.id - a.id; };
    box.innerHTML = "<div class='card'><div class='cb'><div class='res'><span>Por receber <b>" + eur(tot) + "</b> · " + ab.length + " dívida(s)</span><span>" + (ab.some(velho) ? "⚠️ há dívidas com mais de 30 dias" : "") + "</span></div></div></div>" +
      "<div class='sc'><table><thead><tr><th class='l'>Cliente</th><th>Turno</th><th class='l'>Documento</th><th class='l'>Estado</th><th>Valor</th></tr></thead><tbody>" +
      (L.length ? ab.sort(ord).map(linha).join("") + L.filter(function (x) { return x.pago_dia || x.anulado_em; }).sort(ord).slice(0, 200).map(linha).join("") : "<tr><td colspan='5' class='mut'>Ainda não há clientes a dever.</td></tr>") +
      "</tbody></table></div><p class='mut' style='font-size:13px'>Registam-se no Registo diário, em cada turno (👥 Clientes). Nada se apaga: uma dívida anulada fica com o motivo.</p>";
  } catch (e) { box.innerHTML = "<div class='card'><div class='cb bad'>" + esc(falhou(e)) + "</div></div>"; }
}
