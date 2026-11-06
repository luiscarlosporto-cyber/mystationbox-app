/* mystationbox · Tesouraria → Despesas (05/11/2026). Só administrador.
 * O OCTAN AI traz as despesas do email: com valor ficam por confirmar, sem valor ficam por preencher, com o documento ao lado.
 * Só as confirmadas contam no Lucro. Uma despesa nunca se apaga: fica ignorada. O histórico fica em msb_despesas_hist. */
"use strict";
var DSP = {mes: null, lista: [], fontes: [], taxaMes: true, editar: null, aberto: false, kms: {}};
function falhouDesp(e) { var m = falhou(e); return /msb_despesas|does not exist|schema cache|42P01|PGRST205/i.test(m + " " + (e && e.code || "")) ? "As despesas ainda não estão ativas na base de dados." : m; }
function quemSou() { return (PERFIL && PERFIL.display_name) || (EU && EU.email) || "administrador"; }
async function verDocumentoDespesa(caminho) {
  var w = window.open("", "_blank"), r = await sb.storage.from("msb-despesas").createSignedUrl(caminho, 300);
  if (r.error) { if (w) w.close(); return dspAviso(falhouDesp(r.error)); }
  if (w) w.location = r.data.signedUrl; else location.href = r.data.signedUrl;
}
function dspAviso(t, ok) { var s = $("#dspSt"); if (s) { s.className = "st " + (ok ? "ok" : "bad"); s.textContent = (ok ? "✔ " : "⚠ ") + t; } }
function dspOpcoes(sel) { return DESPESAS.CATEGORIAS.map(function (c) { return "<option" + (c === sel ? " selected" : "") + ">" + esc(c) + "</option>"; }).join(""); }
function dspMesPt(m) { return new Date(m + "-15").toLocaleDateString("pt-PT", {month: "long", year: "numeric"}); }
function dspData(d) { return d ? d.split("-").reverse().join("/") : ""; }

async function carregarDespesas() {
  if (!DSP.mes) DSP.mes = addMes(mesHoje(), 0);
  var box = $("#dspCorpo"); box.innerHTML = "<div class='mut'>A carregar…</div>";
  try {
    var r = await sb.from("msb_despesas").select("*").eq("estacao", EST).or("mes.eq." + DSP.mes + ",estado.in.(por_preencher,por_confirmar)").order("dia", {ascending: false}); if (r.error) throw r.error;
    var f = await sb.from("msb_despesas_fontes").select("*").eq("estacao", EST).order("categoria"); if (f.error) throw f.error;
    var t = await sb.from("msb_taxas_mes").select("mes").eq("estacao", EST).eq("mes", DSP.mes).maybeSingle();
    DSP.lista = r.data || []; DSP.fontes = f.data || []; DSP.taxaMes = !!t.data || !!t.error;   // a leitura falhar não pode inventar um aviso
    var mK = DSP.lista.filter(function (d) { return d.categoria === "Kms do gerente"; }).map(function (d) { return d.mes; }); DSP.kms = {};
    if (mK.length) { var k = await sb.from("msb_kms").select("mes,dias,km_dia,euro_km").in("mes", mK); if (k.error) throw k.error; (k.data || []).forEach(function (m) { DSP.kms[m.mes] = m; }); }
    desenharDespesas();
  } catch (e) { box.innerHTML = "<div class='bad'>" + esc(falhouDesp(e)) + "</div>"; }
}
function desenharDespesas() {
  var doMes = DSP.lista.filter(function (d) { return d.mes === DSP.mes; }), tratar = DSP.lista.filter(function (d) { return d.estado === "por_preencher" || d.estado === "por_confirmar"; });
  var R = DESPESAS.resumo(doMes), conf = doMes.filter(function (d) { return d.estado === "confirmada" || d.estado === "ignorada"; });
  var h = "<div class='bar'><button class='btn' id='dspAnt' aria-label='Mês anterior'>‹</button><input type='month' id='dspMes' value='" + esc(DSP.mes) + "'><button class='btn' id='dspSeg' aria-label='Mês seguinte'>›</button><button class='btn p' id='dspNova'>+ Acrescentar despesa</button></div><div class='st' id='dspSt' role='status'></div>";
  h += "<div id='dspForm'></div>";
  h += "<section class='totem'><div class='t'>Despesas · " + esc(dspMesPt(DSP.mes)) + "</div><div><div class='k'>Confirmadas</div><div class='v'>" + fmt(R.confirmadas_c) + "<small>€</small></div></div><div><div class='k'>Por tratar</div><div class='v'>" + tratar.length + "</div></div></section>";
  if (!DSP.taxaMes) h += "<div class='aviso'><p>⚠ A aguardar a fatura das taxas de exploração de " + esc(dspMesPt(DSP.mes)) + ". <a href='#' id='dspTaxas'>Escrever em Margens e custos</a>.</p></div>";
  h += "<div class='card' style='padding:14px;display:grid;gap:10px'><h2 style='margin:0'>Por tratar</h2>" + dspBotaoRecibos(tratar) + (tratar.length ? tratar.map(dspCartao).join("") : "<div class='mut'>Nada por tratar.</div>") + "</div>";
  h += "<div class='card' style='padding:14px;display:grid;gap:10px'><h2 style='margin:0'>Confirmadas no mês</h2>" + (conf.length ? "<div class='sc'><table><thead><tr><th class='l'>Categoria</th><th class='l'>Fornecedor</th><th class='l'>Documento</th><th>Valor</th><th class='l'></th></tr></thead><tbody>" + conf.map(dspLinha).join("") + "</tbody><tfoot><tr><td class='l' colspan='3'>Total</td><td class='n'><b>" + fmt(R.confirmadas_c) + "</b></td><td></td></tr></tfoot></table></div>" : "<div class='mut'>Ainda sem despesas confirmadas neste mês. No Lucro contam os custos fixos.</div>") + "</div>";
  h += "<details class='card' style='padding:14px'" + (DSP.aberto ? " open" : "") + " id='dspFontesBox'><summary><b>Fontes do email</b> <span class='mut'>(" + DSP.fontes.filter(function (f) { return f.ativo; }).length + " ativas)</span></summary><div id='dspFontes' style='display:grid;gap:10px;margin-top:10px'>" + dspFontes() + "</div></details>";
  $("#dspCorpo").innerHTML = h;
  $("#dspAnt").onclick = function () { DSP.mes = addMes(DSP.mes, -1); carregarDespesas(); };
  $("#dspSeg").onclick = function () { DSP.mes = addMes(DSP.mes, 1); carregarDespesas(); };
  $("#dspMes").onchange = function () { if (this.value) { DSP.mes = this.value; carregarDespesas(); } };
  $("#dspNova").onclick = function () { dspAbrir(null); };
  if ($("#dspRecibos")) $("#dspRecibos").onclick = function () { dspConfirmarRecibos(this); };
  if ($("#dspTaxas")) $("#dspTaxas").onclick = function (ev) { ev.preventDefault(); ir("mrg"); };
  $("#dspFontesBox").ontoggle = function () { DSP.aberto = this.open; };
  $$("#dspCorpo [data-acao]").forEach(function (b) { b.onclick = function () { dspAcao(b.dataset.acao, Number(b.dataset.id), b); }; });
}
function dspBotaoRecibos(tratar) {
  var L = DESPESAS.recibosJuntos(tratar);
  return L.length > 1 ? "<div class='bar'><button class='btn p' id='dspRecibos'>Confirmar os " + L.length + " valores dos recibos</button></div>" : "";
}
async function dspConfirmarRecibos(b) {
  var L = DESPESAS.recibosJuntos(DSP.lista), total = L.reduce(function (s, d) { return s + d.valor_c; }, 0);
  if (!(await msbConfirma("Confirmar " + L.length + " valores dos recibos, no total de " + fmt(total) + " €? Ficam a contar no Lucro.", "Confirmar"))) return;
  b.disabled = true;
  var r = await sb.from("msb_despesas").update({estado: "confirmada", confirmado_em: new Date().toISOString(), confirmado_por: quemSou()}).in("id", L.map(function (d) { return d.id; })).eq("estacao", EST).eq("estado", "por_confirmar");
  if (r.error) { b.disabled = false; return dspAviso(falhouDesp(r.error)); }
  await carregarDespesas(); dspAviso("Confirmados " + L.length + " valores.", true);
}
function dspKms(d) {
  var c = DESPESAS.compararKms(d, DSP.kms[d.mes]); if (!c) return "";
  if (c.estado === "igual") return "<div class='ok' style='font-size:13px'>✔ Igual ao mapa de kms da app</div>";
  return "<div class='bad' style='font-size:13px'>⚠ " + (c.estado === "sem_mapa" ? "Não há mapa de kms gravado neste mês" : "Diferente do mapa de kms da app: " + fmt(c.mapa_c) + " €") + "</div>";
}
function dspCartao(d) {
  var sem = d.valor_c == null;
  return "<div style='display:grid;gap:8px;border:1px solid var(--line,#d9dee3);border-radius:10px;padding:10px'><div><b>" + esc(d.colaborador || d.fornecedor) + "</b> <span class='mut'>· " + esc(d.categoria) + " · " + esc(dspMesPt(d.mes)) + "</span>" +
    "<div class='mut' style='font-size:13px'>" + dspData(d.dia) + (d.documento ? " · " + esc(d.documento) : "") + (d.debito ? " · débito a " + dspData(d.debito) : "") + (d.no_dl ? " · incluído na liquidação" : "") + (d.valor_c < 0 ? " · nota de crédito ou anulação" : "") + "</div></div>" +
    dspKms(d) + (d.nota ? "<div class='mut' style='font-size:13px'>" + esc(d.nota) + "</div>" : "") +
    "<div class='bar'><label style='display:grid;gap:2px;font-size:13px'>Valor (€)<input class='dspVal' data-id='" + d.id + "' inputmode='decimal' value='" + (sem ? "" : fmt(d.valor_c)) + "' placeholder='Por preencher' style='width:130px'></label><label style='display:grid;gap:2px;font-size:13px'>IVA incluído (€)<input class='dspIva' data-id='" + d.id + "' inputmode='decimal' value='" + (d.iva_c == null ? "" : fmt(d.iva_c)) + "' style='width:110px'></label>" +
    "<button class='btn p' data-acao='confirmar' data-id='" + d.id + "'>Confirmar</button>" + (d.original ? "<button class='btn' data-acao='ver' data-id='" + d.id + "'>Ver documento</button>" : "") +
    "<button class='btn' data-acao='editar' data-id='" + d.id + "'>Editar</button><button class='btn' data-acao='ignorar' data-id='" + d.id + "'>Ignorar</button></div></div>";
}
function dspLinha(d) {
  var ig = d.estado === "ignorada";
  return "<tr" + (ig ? " style='opacity:.55'" : "") + "><td class='l'>" + esc(d.categoria) + (d.colaborador ? " · " + esc(d.colaborador) : "") + "</td><td class='l'>" + esc(d.fornecedor) + (d.no_dl ? " <span class='mut'>(na liquidação)</span>" : "") + "</td><td class='l'>" + esc(d.documento || "") + (ig ? " <span class='mut'>ignorada</span>" : "") + "</td><td class='n'>" + fmt(d.valor_c) + "</td><td class='l'>" +
    (d.original ? "<button class='btn' data-acao='ver' data-id='" + d.id + "'>Ver</button> " : "") + "<button class='btn' data-acao='editar' data-id='" + d.id + "'>Editar</button></td></tr>";
}
function dspAbrir(d) {
  var v = d || {dia: hojeISO(0), mes: DSP.mes, categoria: "", fornecedor: "", origem: "manual"}; DSP.editar = v;
  $("#dspForm").innerHTML = "<div class='card' style='padding:14px;display:grid;gap:10px'><h2 style='margin:0'>" + (d ? "Editar despesa" : "Acrescentar despesa") + "</h2><div style='display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))'>" +
    "<label>Categoria<select id='dfCat' style='width:100%'><option value=''>Escolher…</option>" + dspOpcoes(v.categoria) + "</select></label>" +
    "<label>Fornecedor<input id='dfFor' style='width:100%' value='" + esc(v.fornecedor) + "'></label>" +
    "<label>Colaborador (salários)<input id='dfCol' style='width:100%' value='" + esc(v.colaborador || "") + "'></label>" +
    "<label>Data do documento<input id='dfDia' type='date' style='width:100%' value='" + esc(v.dia) + "'></label>" +
    "<label>Mês da despesa<input id='dfMes' type='month' style='width:100%' value='" + esc(v.mes) + "'></label>" +
    "<label>Documento<input id='dfDoc' style='width:100%' value='" + esc(v.documento || "") + "'></label>" +
    "<label>Valor com IVA (€)<input id='dfVal' inputmode='decimal' style='width:100%' value='" + (v.valor_c == null ? "" : fmt(v.valor_c)) + "'></label>" +
    "<label>IVA incluído (€)<input id='dfIva' inputmode='decimal' style='width:100%' value='" + (v.iva_c == null ? "" : fmt(v.iva_c)) + "'></label>" +
    "<label>Nota<input id='dfNota' style='width:100%' value='" + esc(v.nota || "") + "'></label></div>" +
    "<label style='display:flex;gap:8px;align-items:center'><input type='checkbox' id='dfDl'" + (v.no_dl ? " checked" : "") + "> Incluído na liquidação da Repsol</label>" +
    "<div class='bar'><button class='btn p' id='dfGravar'>Gravar</button><button class='btn' id='dfFechar'>Fechar</button></div><div id='dfHist' class='mut' style='font-size:13px'></div></div>";
  $("#dfFechar").onclick = function () { $("#dspForm").innerHTML = ""; };
  $("#dfGravar").onclick = dspGravar;
  $("#dspForm").scrollIntoView({behavior: "smooth", block: "start"});
  if (d) dspHistorico(d.id);
}
async function dspHistorico(id) {
  var r = await sb.from("msb_despesas_hist").select("quando,quem,campo,antes,depois").eq("despesa", id).order("id", {ascending: false}).limit(12);
  var box = $("#dfHist"); if (!box || r.error || !(r.data || []).length) return;
  box.innerHTML = "<b>Histórico</b>" + r.data.map(function (x) { return "<div>" + esc(new Date(x.quando).toLocaleString("pt-PT")) + " · " + esc(x.quem || "") + " · " + esc(x.campo) + (x.antes != null ? ": " + esc(x.antes) + " → " + esc(x.depois) : "") + "</div>"; }).join("");
}
async function dspGravar() {
  var v = DSP.editar, n = {categoria: $("#dfCat").value, fornecedor: $("#dfFor").value.trim(), colaborador: $("#dfCol").value.trim() || null, dia: $("#dfDia").value, mes: $("#dfMes").value, documento: $("#dfDoc").value.trim() || null,
    valor_c: DESPESAS.valorC($("#dfVal").value), iva_c: DESPESAS.valorC($("#dfIva").value), nota: $("#dfNota").value.trim() || null, no_dl: $("#dfDl").checked, origem: v.origem || "manual"};
  var e = DESPESAS.erros(n); if (e.length) return dspAviso(e.join(". "));
  try {
    if (v.id) {
      n.estado = n.valor_c == null ? "por_preencher" : v.estado === "por_preencher" ? "por_confirmar" : v.estado;
      var r = await sb.from("msb_despesas").update(n).eq("id", v.id).eq("estacao", EST); if (r.error) throw r.error;
    } else {
      n.estacao = EST; n.estado = "confirmada"; n.confirmado_em = new Date().toISOString(); n.confirmado_por = quemSou();
      var c = await sb.from("msb_despesas").insert(n); if (c.error) throw c.error;
    }
    DSP.mes = n.mes; await carregarDespesas(); dspAviso("Gravado. Fica no histórico.", true);
  } catch (x) { dspAviso(/msb_despesas_doc|duplicate/.test(falhou(x)) ? "Este documento já está registado." : falhouDesp(x)); }
}
async function dspAcao(a, id, b) {
  var d = DSP.lista.find(function (x) { return x.id === id; }); if (!d) return;
  if (a === "ver") return verDocumentoDespesa(d.original);
  if (a === "editar") return dspAbrir(d);
  try {
    var alt;
    if (a === "ignorar") { if (!(await msbConfirma("Ignorar esta despesa? Não conta no Lucro, mas fica registada."))) return; alt = {estado: "ignorada"}; }
    else {
      var val = DESPESAS.valorC(document.querySelector(".dspVal[data-id='" + id + "']").value);
      if (val == null || isNaN(val)) return dspAviso("Escreve o valor antes de confirmar: " + d.fornecedor);
      var iva = DESPESAS.valorC(document.querySelector(".dspIva[data-id='" + id + "']").value);
      if (typeof iva === "number" && isNaN(iva)) return dspAviso("IVA inválido: " + d.fornecedor);
      alt = {valor_c: val, iva_c: iva, estado: "confirmada", confirmado_em: new Date().toISOString(), confirmado_por: quemSou()};
    }
    b.disabled = true;
    var r = await sb.from("msb_despesas").update(alt).eq("id", id).eq("estacao", EST); if (r.error) throw r.error;
    await carregarDespesas(); dspAviso(a === "ignorar" ? "Ignorada." : "Confirmada.", true);
  } catch (e) { b.disabled = false; dspAviso(falhouDesp(e)); }
}
function dspFontes() {
  return "<div class='sc'><table><thead><tr><th class='l'>Despesa</th><th class='l'>Remetente</th><th class='l'>Assunto contém</th><th class='l'>Ativa</th></tr></thead><tbody>" + DSP.fontes.map(function (f) {
    return "<tr><td class='l'>" + esc(f.fornecedor) + " <span class='mut'>· " + esc(f.categoria) + "</span>" + (f.nota ? "<div class='mut' style='font-size:12px'>" + esc(f.nota) + "</div>" : "") + "</td><td class='l'>" + esc(f.remetente) + "</td><td class='l'>" + esc(f.assunto) + "</td><td class='l'><input type='checkbox' class='dfAtiva' data-id='" + f.id + "' aria-label='Ativa'" + (f.ativo ? " checked" : "") + "></td></tr>"; }).join("") + "</tbody></table></div>" +
    "<p class='mut' style='margin:0;font-size:13px'>Fornecedor novo: entra por preencher, com o documento ao lado. A loja é a da conta de email que o recebe.</p>" +
    "<div style='display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))'><label>Remetente<input id='ffRem' type='email' style='width:100%' placeholder='faturas@fornecedor.pt'></label><label>Assunto contém<input id='ffAss' style='width:100%'></label><label>Fornecedor<input id='ffFor' style='width:100%'></label><label>Categoria<select id='ffCat' style='width:100%'><option value=''>Escolher…</option>" + dspOpcoes("") + "</select></label></div><div class='bar'><button class='btn' id='ffNova'>+ Acrescentar fonte</button></div>";
}
document.addEventListener("click", async function (ev) {
  if (!ev.target.matches || ev.target.id !== "ffNova") return;
  var n = {estacao: EST, remetente: $("#ffRem").value.trim().toLowerCase(), assunto: $("#ffAss").value.trim(), fornecedor: $("#ffFor").value.trim(), categoria: $("#ffCat").value};
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(n.remetente) || !n.fornecedor || !n.categoria) return dspAviso("Preenche o remetente, o fornecedor e a categoria.");
  var r = await sb.from("msb_despesas_fontes").insert(n);
  if (r.error) return dspAviso(falhouDesp(r.error));
  DSP.aberto = true; await carregarDespesas(); dspAviso("Fonte acrescentada.", true);
});
document.addEventListener("change", async function (ev) {
  if (!ev.target.matches || !ev.target.matches(".dfAtiva")) return;
  var r = await sb.from("msb_despesas_fontes").update({ativo: ev.target.checked}).eq("id", Number(ev.target.dataset.id)).eq("estacao", EST);
  if (r.error) { ev.target.checked = !ev.target.checked; return dspAviso(falhouDesp(r.error)); }
  dspAviso("Guardado.", true);
});
/* Custos do mês para o Lucro. Sem a tabela ainda criada, ou se a leitura falhar, ficam os custos fixos. */
async function custosRealDoMes(fixos, mes) {
  try {
    var r = await sb.from("msb_despesas").select("categoria,valor_c,iva_c,estado").eq("estacao", EST).eq("mes", mes).eq("estado", "confirmada"); if (r.error) throw r.error;
    return DESPESAS.custosDoMes(fixos, r.data);
  } catch (e) { return DESPESAS.custosDoMes(fixos, []); }
}
