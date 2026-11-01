/* mystationbox · tabaco: vendas e margens, encomendas feitas e movimentos (só leitura das tabelas do stock, no mesmo Supabase).
 * Não escreve nada: contar, dar saídas, fazer e aprovar encomendas faz-se nas páginas de Stock e Compras (módulo de stock embutido, areas.js). */
"use strict";
/* Partes deste ecrã (01/11/2026): "ven" = Vendas e margens · "comh" = Compras → encomendas feitas · "mov" = Stock → movimentos. */
var TAB_PARTE = "ven";
function tabaco(parte) { TAB_PARTE = parte || TAB_PARTE; carregarTabacoResumo(); }
var TAB = {cat: [], enc: [], mov: [], aberta: null, filtro: "", sel: {}, canceladas: false};
function estadoEnc(s) { return {enviada: "<span class='b ok'>enviada</span>", pendente: "<span class='b wn'>por aprovar</span>", cancelada: "<span class='b'>cancelada</span>"}[s] || esc(s); }
function qtd(l) { return l.qty ? l.qty + " " + (l.unit === "volumes" ? "vol." : "un.") : "—"; }
function carregarTabaco() { carregarTabacoResumo(); }
async function carregarTabacoResumo() {
  var box = $("#tabCorpo"); box.innerHTML = "<div class='mut'>A carregar…</div>";
  try {
    var r1 = await sb.from("product_company").select("product_id,stock,sales_month,sales_days").eq("company_id", EST); if (r1.error) throw r1.error;
    var r2 = await sb.from("products").select("id,name,category,volume_size,repsol_code"); if (r2.error) throw r2.error;
    var r3 = await sb.from("orders").select("id,created_at,created_by,operator,status,lines,count_lines,approved_by,sent_at,sent_to").eq("company_id", EST).order("created_at", {ascending: false}).limit(30); if (r3.error) throw r3.error;
    var r4 = await sb.from("stock_moves").select("created_at,product_name,move_type,quantity,stock_before,stock_after,operator,user_id").eq("company_id", EST).order("created_at", {ascending: false}).limit(50); if (r4.error) throw r4.error;
    var r5 = ADMIN ? await sb.from("tabaco_precos").select("product_id,pvp_c,custo_c,unidade") : {data: []};   // só administradores
    var preco = {}; (r5.data || []).forEach(function (x) { preco[x.product_id] = x; });
    var prod = {}; (r2.data || []).forEach(function (p) { prod[p.id] = p; });
    TAB.cat = (r1.data || []).map(function (pc) { var p = prod[pc.product_id] || {}; var pr = preco[pc.product_id], vol = p.volume_size || 10, mu = pr ? (pr.pvp_c - pr.custo_c) / (pr.unidade === "volume" ? vol : 1) : null;
      return {id: pc.product_id, nome: p.name || pc.product_id, cat: p.category || "Outros", vol: vol, stock: pc.stock, vm: pc.sales_month, dias: pc.sales_days,
        pct: pr ? (pr.pvp_c - pr.custo_c) / pr.pvp_c * 100 : null, mu: mu, mmes: mu != null && pc.sales_month && pc.sales_days ? mu * pc.sales_month * 30 / pc.sales_days : null}; });
    TAB.enc = r3.data || []; TAB.mov = r4.data || [];
    desenharTabaco();
  } catch (e) { box.innerHTML = "<div class='bad'>" + esc(falhou(e)) + "</div>"; }
}
function desenharTabaco() {
  var h = "", enc = TAB.enc, ult = enc.find(function (o) { return o.status !== "cancelada"; }) || enc[0];
  /* resumo */
  var porCat = {}; TAB.cat.forEach(function (p) { porCat[p.cat] = (porCat[p.cat] || 0) + 1; });
  var margemMes = TAB.cat.reduce(function (s, p) { return s + (p.mmes || 0); }, 0), comPreco = TAB.cat.filter(function (p) { return p.pct != null; }).length;
  var semanal = TAB.cat.reduce(function (s, p) { return s + (p.vm && p.dias ? p.vm * 7 / p.dias : 0); }, 0);
  h += "<section class='totem'><div class='t'>Tabaco · " + esc(($("#hEst").textContent || "")) + "</div>" +
    "<div><div class='k'>Artigos</div><div class='v'>" + TAB.cat.length + "</div></div>" +
    "<div><div class='k'>Vendas/semana</div><div class='v'>" + Math.round(semanal) + "<small>maços/un.</small></div></div>" +
    (ADMIN && comPreco ? "<div><div class='k'>Margem estimada/mês</div><div class='v'>" + fmt(Math.round(margemMes)) + "<small>€</small></div></div>" : "") +
    "<div><div class='k'>Encomendas enviadas</div><div class='v'>" + enc.filter(function (o) { return o.status === "enviada"; }).length + "</div></div>" +
    "<div><div class='k'>Última encomenda</div><div class='v' style='font-size:20px'>" + (ult ? new Date(ult.created_at).toLocaleDateString("pt-PT") : "—") + "</div></div></section>";
  var P = TAB_PARTE, so = function (x) { return P === x; };
  if (!so("ven")) h = "";
  /* encomendas */
  if (so("comh")) {
  h += "<h2>Encomendas feitas ao fornecedor</h2>";
  var pend = enc.filter(function (o) { return o.status === "pendente"; }), nCanc = enc.filter(function (o) { return o.status === "cancelada"; }).length, nSel = pend.filter(function (o) { return TAB.sel[o.id]; }).length;
  if (ADMIN && pend.length) h += "<div class='bar' style='background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:8px 10px'><label style='display:flex;gap:6px;align-items:center;font-weight:600'><input type='checkbox' id='encTodas'" + (nSel === pend.length ? " checked" : "") + "> Selecionar todas por aprovar (" + pend.length + ")</label>" +
    "<button class='btn' id='encElim'" + (nSel ? "" : " disabled") + ">🗑 Eliminar selecionadas (" + nSel + ")</button><span class='mut' style='font-size:12px'>Eliminar = cancelar: não segue nada para o fornecedor e fica no histórico.</span></div>";
  if (nCanc) h += "<div><button class='mini' id='encCanc'>" + (TAB.canceladas ? "Esconder" : "Mostrar") + " canceladas (" + nCanc + ")</button></div>";
  if (!enc.length) h += "<div class='vazio'>Sem encomendas desta estação.</div>";
  enc.filter(function (o) { return TAB.canceladas || o.status !== "cancelada"; }).forEach(function (o) {
    var L = Array.isArray(o.lines) ? o.lines : [], pedidos = L.filter(function (l) { return l.qty > 0; });
    var vol = pedidos.filter(function (l) { return l.unit === "volumes"; }).reduce(function (s, l) { return s + l.qty; }, 0), un = pedidos.filter(function (l) { return l.unit !== "volumes"; }).reduce(function (s, l) { return s + l.qty; }, 0);
    var aberta = TAB.aberta === o.id;
    var pe = ADMIN && o.status === "pendente";
    h += "<div class='liq'" + (pe && TAB.sel[o.id] ? " style='border-color:var(--laranja)'" : "") + "><h3><span>" + (pe ? "<input type='checkbox' data-sel='" + o.id + "'" + (TAB.sel[o.id] ? " checked" : "") + " aria-label='Selecionar' style='width:20px;height:20px;vertical-align:middle;margin-right:6px'>" : "") + new Date(o.created_at).toLocaleString("pt-PT", {day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"}) + " · " + estadoEnc(o.status) + "</span><span class='mut' style='font-weight:400;font-size:13px'>" +
      pedidos.length + " artigos · " + vol + " vol. + " + un + " un." + (o.sent_to ? " · para " + esc(o.sent_to) : "") + (o.operator ? " · contou " + esc(o.operator) : "") + "</span></h3>" +
      "<div class='bar'><button class='mini' data-enc='" + o.id + "'>" + (aberta ? "Esconder" : "Ver linhas") + "</button>" +
      (pe ? "<button class='btn p' data-apr='" + o.id + "'>✓ Aprovar (ver PDF)</button><button class='btn' data-del='" + o.id + "'>🗑 Eliminar</button>" : "") + "</div>";
    if (aberta) h += "<div class='sc'><table><thead><tr><th>Artigo</th><th class='l'>Categoria</th><th>Contado</th><th>Sugerido</th><th>Encomendado</th></tr></thead><tbody>" +
      L.slice().sort(function (a, b) { return (b.qty || 0) - (a.qty || 0) || (a.name < b.name ? -1 : 1); }).map(function (l) {
        return "<tr><td>" + esc(l.name) + (l.top ? " <span class='b ok'>top</span>" : "") + (l.manual ? " <span class='b wn'>ajustado</span>" : "") + "</td><td class='l'>" + esc(l.category || "") + "</td><td class='n'>" + (l.counted == null ? "—" : l.counted) + "</td><td class='n'>" + (l.suggested == null ? "—" : l.suggested) + "</td><td class='n'><b>" + qtd(l) + "</b></td></tr>"; }).join("") + "</tbody></table></div>";
    h += "</div>";
  });
  }
  /* catálogo */
  if (so("ven")) {
  h += "<h2>Catálogo e vendas</h2><div class='bar'><input id='tabF' placeholder='Pesquisar artigo…' value='" + esc(TAB.filtro) + "' style='flex:1;min-width:0;border:1px solid var(--bd);border-radius:10px;padding:8px;background:var(--card)'></div>";
  var f = TAB.filtro.toLowerCase(), cats = Object.keys(porCat).sort();
  h += "<div class='sc'><table><thead><tr><th>Artigo</th><th class='l'>Categoria</th><th>Vendas/mês</th><th>Por semana</th>" + (ADMIN ? "<th>Margem</th><th>Margem/mês</th>" : "") + "<th>Stock guardado</th></tr></thead><tbody>" +
    TAB.cat.filter(function (p) { return !f || p.nome.toLowerCase().indexOf(f) >= 0 || p.cat.toLowerCase().indexOf(f) >= 0; })
      .sort(function (a, b) { return (b.vm || 0) - (a.vm || 0) || (a.nome < b.nome ? -1 : 1); })
      .map(function (p) { return "<tr><td>" + esc(p.nome) + "</td><td class='l'>" + esc(p.cat) + "</td><td class='n'>" + (p.vm == null ? "—" : Math.round(p.vm)) + "</td><td class='n'>" + (p.vm && p.dias ? (p.vm * 7 / p.dias).toFixed(1).replace(".", ",") : "—") + "</td>" +
        (ADMIN ? "<td class='n'>" + (p.pct == null ? "<span class='mut'>sem preço</span>" : p.pct.toFixed(1).replace(".", ",") + " %") + "</td><td class='n'>" + (p.mmes == null ? "—" : fmt(Math.round(p.mmes)) + " €") + "</td>" : "") + "<td class='n mut'>" + (p.stock == null ? "—" : p.stock) + "</td></tr>"; }).join("") + "</tbody></table></div>";
  if (ADMIN) h += "<p class='mut' style='font-size:13px;margin:0'>Margem = PVP − preço de compra das últimas faturas da Adelaide Sousa Ferreira (" + comPreco + " de " + TAB.cat.length + " artigos com preço). Margem/mês = margem por maço ou unidade × vendas de 30 dias.</p>";
  h += "<p class='mut' style='font-size:13px;margin:0'>Vendas a partir do último relatório de vendas carregado (Compras → Nova encomenda). O \"stock guardado\" não é atualizado pela contagem de domingo: a contagem real está nas encomendas.</p>";
  }
  /* movimentos */
  if (so("mov")) h += TAB.mov.length ? "" : "<div class='vazio'>Sem movimentos registados.</div>";
  if (so("mov") && TAB.mov.length) h += "<h2>Últimos movimentos</h2><div class='sc'><table><thead><tr><th>Quando</th><th class='l'>Artigo</th><th class='l'>Tipo</th><th>Qtd.</th><th>Antes → depois</th><th class='l'>Quem</th></tr></thead><tbody>" +
    TAB.mov.map(function (m) { return "<tr><td>" + new Date(m.created_at).toLocaleString("pt-PT", {day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"}) + "</td><td class='l'>" + esc(m.product_name) + "</td><td class='l'>" + esc(m.move_type) + "</td><td class='n'>" + m.quantity + "</td><td class='n'>" + m.stock_before + " → " + m.stock_after + "</td><td class='l'>" + esc(NOMES[m.user_id] || m.operator || "") + "</td></tr>"; }).join("") + "</tbody></table></div>";
  $("#tabCorpo").innerHTML = h;
  $$("#tabCorpo [data-sel]").forEach(function (c) { c.onchange = function () { if (c.checked) TAB.sel[c.dataset.sel] = 1; else delete TAB.sel[c.dataset.sel]; desenharTabaco(); }; });
  if ($("#encTodas")) $("#encTodas").onchange = function () { var on = this.checked; TAB.sel = {}; if (on) TAB.enc.forEach(function (o) { if (o.status === "pendente") TAB.sel[o.id] = 1; }); desenharTabaco(); };
  if ($("#encCanc")) $("#encCanc").onclick = function () { TAB.canceladas = !TAB.canceladas; desenharTabaco(); };
  if ($("#encElim")) $("#encElim").onclick = function () { var ids = Object.keys(TAB.sel); if (ids.length) eliminarEncomendas(ids, this); };
  $$("#tabCorpo [data-del]").forEach(function (b) { b.onclick = function () { eliminarEncomendas([b.dataset.del], b); }; });
  $$("#tabCorpo [data-apr]").forEach(function (b) { b.onclick = function () { aprovarEncomenda(b.dataset.apr); }; });
  $$("#tabCorpo [data-enc]").forEach(function (b) { b.onclick = function () { TAB.aberta = TAB.aberta === b.dataset.enc ? null : b.dataset.enc; desenharTabaco(); }; });
  var inp = $("#tabF"); if (inp) inp.oninput = function () { TAB.filtro = inp.value; var pos = inp.selectionStart; desenharTabaco(); var n = $("#tabF"); n.focus(); n.setSelectionRange(pos, pos); };
}

/* Eliminar = cancelar (status "cancelada"): nada segue para o fornecedor e a encomenda fica no histórico.
 * Pede um segundo toque para confirmar. Só encomendas ainda por aprovar. */
async function eliminarEncomendas(ids, b) {
  if (b.dataset.conf !== "1") { b.dataset.conf = "1"; b.textContent = "Confirmar: eliminar " + (ids.length > 1 ? ids.length + " encomendas" : "esta encomenda"); b.classList.add("p"); return; }
  b.disabled = true;
  try {
    var r = await sb.from("orders").update({status: "cancelada"}).in("id", ids).eq("status", "pendente").select("id");
    if (r.error) throw r.error;
    TAB.sel = {}; status(true, (r.data || []).length + " encomenda(s) eliminada(s)");
    await carregarTabacoResumo();
  } catch (e) { b.disabled = false; alertaTab("⚠ Não foi possível eliminar: " + falhou(e)); }
}
/* Aprovar abre a encomenda em Compras → Por aprovar, com o PDF para ver antes de enviar. */
async function aprovarEncomenda(id) {
  ir("enc");
  try {
    var w = await esperarNex(function (w) { return typeof w.msbAbrirEncomenda === "function"; });
    await w.msbAbrirEncomenda(id);
  } catch (e) { alertaTab("⚠ " + e.message); }
}
function alertaTab(m) { var box = NEXP[PAGINA] ? $("#nexBox") : $("#tabCorpo"); if (box) box.insertAdjacentHTML("afterbegin", "<div class='card msgErr' style='padding:12px'>" + esc(m) + "</div>"); }
