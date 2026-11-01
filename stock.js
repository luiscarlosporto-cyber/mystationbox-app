/* mystationbox · separador Tabaco: consulta (só leitura) dos dados da app Stock Tabaco, no mesmo Supabase.
 * Não escreve em nenhuma tabela do Stock Tabaco: contar, dar saídas e aprovar encomendas faz-se na app dele. */
"use strict";
var STOCK_APP = "https://luiscarlosporto-cyber.github.io/stock-tabaco-central/";
/* O NexStock (Stock Tabaco) corre inteiro dentro deste separador, sem cópia do código: está publicado no mesmo
 * endereço base (luiscarlosporto-cyber.github.io), por isso partilha o login (mesma sessão Supabase no navegador)
 * e a estação escolhida (localStorage "stc_company"). Esconde-se só o cabeçalho dele, porque o do mystationbox já lá está. */
var NEX_URL = "/stock-tabaco-central/", TAB_VISTA = "nex", NEX_EST = null;
function prepararNexStock() {
  try {
    localStorage.setItem("stc_company", JSON.stringify(EST));
    var c = JSON.parse(localStorage.getItem("stc_cloud") || "null");
    if (!c || !c.url || !c.key) localStorage.setItem("stc_cloud", JSON.stringify({url: MSB_CONFIG.url, key: MSB_CONFIG.key}));
  } catch (e) { /* sem armazenamento: o NexStock pede o login dentro do separador */ }
}
function ajustarNexStock(fr) {
  try {
    var d = fr.contentDocument; if (!d || d.getElementById("msb-embed")) return;
    var st = d.createElement("style"); st.id = "msb-embed";
    st.textContent = "header{display:none!important}main{padding-top:4px!important}";
    d.head.appendChild(st);
  } catch (e) { /* outra origem: fica com o cabeçalho dele */ }
}
function mostrarNexStock() {
  var box = $("#tabCorpo");
  if (NEX_EST === EST && box.querySelector("iframe")) return;
  prepararNexStock(); NEX_EST = EST;
  box.innerHTML = "<iframe id='nexFrame' title='NexStock · tabaco' src='" + NEX_URL + "?msb=" + Date.now() + "' allow='camera; clipboard-write' style='width:100%;height:calc(100dvh - 150px);min-height:520px;border:1px solid var(--bd);border-radius:12px;background:#f2f5f9'></iframe>" +
    "<p class='mut' style='font-size:12px;margin:0'>NexStock dentro do mystationbox. Se pedir login, use a mesma conta. <a href='" + STOCK_APP + "' target='_blank' rel='noopener'>Abrir em ecrã próprio ↗</a></p>";
  var fr = $("#nexFrame"); fr.addEventListener("load", function () { ajustarNexStock(fr); });
}
function tabaco(v) { TAB_VISTA = v; $$("#tabSub button").forEach(function (b) { b.classList.toggle("on", b.dataset.t === v); }); if (v === "nex") mostrarNexStock(); else { NEX_EST = null; carregarTabacoResumo(); } }
var TAB = {cat: [], enc: [], mov: [], aberta: null, filtro: ""};
function estadoEnc(s) { return {enviada: "<span class='b ok'>enviada</span>", pendente: "<span class='b wn'>por aprovar</span>", cancelada: "<span class='b'>cancelada</span>"}[s] || esc(s); }
function qtd(l) { return l.qty ? l.qty + " " + (l.unit === "volumes" ? "vol." : "un.") : "—"; }
function carregarTabaco() { tabaco(TAB_VISTA); }
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
  h += "<div class='aviso'><p>Resumo só de consulta. Para contar, ler códigos, fazer e aprovar encomendas use <b>📦 NexStock</b>, aqui ao lado.</p></div>";
  /* encomendas */
  h += "<h2>Encomendas ao fornecedor</h2>";
  if (!enc.length) h += "<div class='vazio'>Sem encomendas desta estação.</div>";
  enc.forEach(function (o) {
    var L = Array.isArray(o.lines) ? o.lines : [], pedidos = L.filter(function (l) { return l.qty > 0; });
    var vol = pedidos.filter(function (l) { return l.unit === "volumes"; }).reduce(function (s, l) { return s + l.qty; }, 0), un = pedidos.filter(function (l) { return l.unit !== "volumes"; }).reduce(function (s, l) { return s + l.qty; }, 0);
    var aberta = TAB.aberta === o.id;
    h += "<div class='liq'><h3><span>" + new Date(o.created_at).toLocaleString("pt-PT", {day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"}) + " · " + estadoEnc(o.status) + "</span><span class='mut' style='font-weight:400;font-size:13px'>" +
      pedidos.length + " artigos · " + vol + " vol. + " + un + " un." + (o.sent_to ? " · para " + esc(o.sent_to) : "") + (o.operator ? " · contou " + esc(o.operator) : "") + "</span></h3>" +
      "<div><button class='mini' data-enc='" + o.id + "'>" + (aberta ? "Esconder" : "Ver linhas") + "</button></div>";
    if (aberta) h += "<div class='sc'><table><thead><tr><th>Artigo</th><th class='l'>Categoria</th><th>Contado</th><th>Sugerido</th><th>Encomendado</th></tr></thead><tbody>" +
      L.slice().sort(function (a, b) { return (b.qty || 0) - (a.qty || 0) || (a.name < b.name ? -1 : 1); }).map(function (l) {
        return "<tr><td>" + esc(l.name) + (l.top ? " <span class='b ok'>top</span>" : "") + (l.manual ? " <span class='b wn'>ajustado</span>" : "") + "</td><td class='l'>" + esc(l.category || "") + "</td><td class='n'>" + (l.counted == null ? "—" : l.counted) + "</td><td class='n'>" + (l.suggested == null ? "—" : l.suggested) + "</td><td class='n'><b>" + qtd(l) + "</b></td></tr>"; }).join("") + "</tbody></table></div>";
    h += "</div>";
  });
  /* catálogo */
  h += "<h2>Catálogo e vendas</h2><div class='bar'><input id='tabF' placeholder='Pesquisar artigo…' value='" + esc(TAB.filtro) + "' style='flex:1;min-width:0;border:1px solid var(--bd);border-radius:10px;padding:8px;background:var(--card)'></div>";
  var f = TAB.filtro.toLowerCase(), cats = Object.keys(porCat).sort();
  h += "<div class='sc'><table><thead><tr><th>Artigo</th><th class='l'>Categoria</th><th>Vendas/mês</th><th>Por semana</th>" + (ADMIN ? "<th>Margem</th><th>Margem/mês</th>" : "") + "<th>Stock guardado</th></tr></thead><tbody>" +
    TAB.cat.filter(function (p) { return !f || p.nome.toLowerCase().indexOf(f) >= 0 || p.cat.toLowerCase().indexOf(f) >= 0; })
      .sort(function (a, b) { return (b.vm || 0) - (a.vm || 0) || (a.nome < b.nome ? -1 : 1); })
      .map(function (p) { return "<tr><td>" + esc(p.nome) + "</td><td class='l'>" + esc(p.cat) + "</td><td class='n'>" + (p.vm == null ? "—" : Math.round(p.vm)) + "</td><td class='n'>" + (p.vm && p.dias ? (p.vm * 7 / p.dias).toFixed(1).replace(".", ",") : "—") + "</td>" +
        (ADMIN ? "<td class='n'>" + (p.pct == null ? "<span class='mut'>sem preço</span>" : p.pct.toFixed(1).replace(".", ",") + " %") + "</td><td class='n'>" + (p.mmes == null ? "—" : fmt(Math.round(p.mmes)) + " €") + "</td>" : "") + "<td class='n mut'>" + (p.stock == null ? "—" : p.stock) + "</td></tr>"; }).join("") + "</tbody></table></div>";
  if (ADMIN) h += "<p class='mut' style='font-size:13px;margin:0'>Margem = PVP − preço de compra das últimas faturas da Adelaide Sousa Ferreira (" + comPreco + " de " + TAB.cat.length + " artigos com preço). Margem/mês = margem por maço ou unidade × vendas de 30 dias.</p>";
  h += "<p class='mut' style='font-size:13px;margin:0'>Vendas a partir do export do software Repsol carregado no Stock Tabaco. O \"stock guardado\" não é atualizado pela contagem de domingo (limitação conhecida da app Stock Tabaco): a contagem real está nas encomendas.</p>";
  /* movimentos */
  if (TAB.mov.length) h += "<h2>Últimos movimentos</h2><div class='sc'><table><thead><tr><th>Quando</th><th class='l'>Artigo</th><th class='l'>Tipo</th><th>Qtd.</th><th>Antes → depois</th><th class='l'>Quem</th></tr></thead><tbody>" +
    TAB.mov.map(function (m) { return "<tr><td>" + new Date(m.created_at).toLocaleString("pt-PT", {day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"}) + "</td><td class='l'>" + esc(m.product_name) + "</td><td class='l'>" + esc(m.move_type) + "</td><td class='n'>" + m.quantity + "</td><td class='n'>" + m.stock_before + " → " + m.stock_after + "</td><td class='l'>" + esc(NOMES[m.user_id] || m.operator || "") + "</td></tr>"; }).join("") + "</tbody></table></div>";
  $("#tabCorpo").innerHTML = h;
  $$("#tabCorpo [data-enc]").forEach(function (b) { b.onclick = function () { TAB.aberta = TAB.aberta === b.dataset.enc ? null : b.dataset.enc; desenharTabaco(); }; });
  var inp = $("#tabF"); inp.oninput = function () { TAB.filtro = inp.value; var pos = inp.selectionStart; desenharTabaco(); var n = $("#tabF"); n.focus(); n.setSelectionRange(pos, pos); };
}
