/* mystationbox · separador Tabaco: consulta (só leitura) dos dados da app Stock Tabaco, no mesmo Supabase.
 * Não escreve em nenhuma tabela do Stock Tabaco: contar, dar saídas e aprovar encomendas faz-se na app dele. */
"use strict";
var STOCK_APP = "https://luiscarlosporto-cyber.github.io/stock-tabaco-central/";
var TAB = {cat: [], enc: [], mov: [], aberta: null, filtro: ""};
function estadoEnc(s) { return {enviada: "<span class='b ok'>enviada</span>", pendente: "<span class='b wn'>por aprovar</span>", cancelada: "<span class='b'>cancelada</span>"}[s] || esc(s); }
function qtd(l) { return l.qty ? l.qty + " " + (l.unit === "volumes" ? "vol." : "un.") : "—"; }
async function carregarTabaco() {
  var box = $("#tabCorpo"); box.innerHTML = "<div class='mut'>A carregar…</div>";
  try {
    var r1 = await sb.from("product_company").select("product_id,stock,sales_month,sales_days").eq("company_id", EST); if (r1.error) throw r1.error;
    var r2 = await sb.from("products").select("id,name,category,volume_size,repsol_code"); if (r2.error) throw r2.error;
    var r3 = await sb.from("orders").select("id,created_at,created_by,operator,status,lines,count_lines,approved_by,sent_at,sent_to").eq("company_id", EST).order("created_at", {ascending: false}).limit(30); if (r3.error) throw r3.error;
    var r4 = await sb.from("stock_moves").select("created_at,product_name,move_type,quantity,stock_before,stock_after,operator,user_id").eq("company_id", EST).order("created_at", {ascending: false}).limit(50); if (r4.error) throw r4.error;
    var prod = {}; (r2.data || []).forEach(function (p) { prod[p.id] = p; });
    TAB.cat = (r1.data || []).map(function (pc) { var p = prod[pc.product_id] || {}; return {id: pc.product_id, nome: p.name || pc.product_id, cat: p.category || "Outros", vol: p.volume_size || 10, stock: pc.stock, vm: pc.sales_month, dias: pc.sales_days}; });
    TAB.enc = r3.data || []; TAB.mov = r4.data || [];
    desenharTabaco();
  } catch (e) { box.innerHTML = "<div class='bad'>" + esc(falhou(e)) + "</div>"; }
}
function desenharTabaco() {
  var h = "", enc = TAB.enc, ult = enc.find(function (o) { return o.status !== "cancelada"; }) || enc[0];
  /* resumo */
  var porCat = {}; TAB.cat.forEach(function (p) { porCat[p.cat] = (porCat[p.cat] || 0) + 1; });
  var semanal = TAB.cat.reduce(function (s, p) { return s + (p.vm && p.dias ? p.vm * 7 / p.dias : 0); }, 0);
  h += "<section class='totem'><div class='t'>Tabaco · " + esc(($("#hEst").textContent || "")) + "</div>" +
    "<div><div class='k'>Artigos</div><div class='v'>" + TAB.cat.length + "</div></div>" +
    "<div><div class='k'>Vendas/semana</div><div class='v'>" + Math.round(semanal) + "<small>maços/un.</small></div></div>" +
    "<div><div class='k'>Encomendas enviadas</div><div class='v'>" + enc.filter(function (o) { return o.status === "enviada"; }).length + "</div></div>" +
    "<div><div class='k'>Última encomenda</div><div class='v' style='font-size:20px'>" + (ult ? new Date(ult.created_at).toLocaleDateString("pt-PT") : "—") + "</div></div></section>";
  h += "<div class='aviso'><p>Contar o stock com a câmara, dar saídas e aprovar encomendas faz-se na app Stock Tabaco (mesma conta). Aqui é só consulta. <a class='btn az' style='display:inline-block;margin-left:6px;text-decoration:none' href='" + STOCK_APP + "' target='_blank' rel='noopener'>Abrir Stock Tabaco ↗</a></p></div>";
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
  h += "<div class='sc'><table><thead><tr><th>Artigo</th><th class='l'>Categoria</th><th>Vendas/mês</th><th>Por semana</th><th>Stock guardado</th></tr></thead><tbody>" +
    TAB.cat.filter(function (p) { return !f || p.nome.toLowerCase().indexOf(f) >= 0 || p.cat.toLowerCase().indexOf(f) >= 0; })
      .sort(function (a, b) { return (b.vm || 0) - (a.vm || 0) || (a.nome < b.nome ? -1 : 1); })
      .map(function (p) { return "<tr><td>" + esc(p.nome) + "</td><td class='l'>" + esc(p.cat) + "</td><td class='n'>" + (p.vm == null ? "—" : Math.round(p.vm)) + "</td><td class='n'>" + (p.vm && p.dias ? (p.vm * 7 / p.dias).toFixed(1).replace(".", ",") : "—") + "</td><td class='n mut'>" + (p.stock == null ? "—" : p.stock) + "</td></tr>"; }).join("") + "</tbody></table></div>";
  h += "<p class='mut' style='font-size:13px;margin:0'>Vendas a partir do export do software Repsol carregado no Stock Tabaco. O \"stock guardado\" não é atualizado pela contagem de domingo (limitação conhecida da app Stock Tabaco): a contagem real está nas encomendas.</p>";
  /* movimentos */
  if (TAB.mov.length) h += "<h2>Últimos movimentos</h2><div class='sc'><table><thead><tr><th>Quando</th><th class='l'>Artigo</th><th class='l'>Tipo</th><th>Qtd.</th><th>Antes → depois</th><th class='l'>Quem</th></tr></thead><tbody>" +
    TAB.mov.map(function (m) { return "<tr><td>" + new Date(m.created_at).toLocaleString("pt-PT", {day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"}) + "</td><td class='l'>" + esc(m.product_name) + "</td><td class='l'>" + esc(m.move_type) + "</td><td class='n'>" + m.quantity + "</td><td class='n'>" + m.stock_before + " → " + m.stock_after + "</td><td class='l'>" + esc(NOMES[m.user_id] || m.operator || "") + "</td></tr>"; }).join("") + "</tbody></table></div>";
  $("#tabCorpo").innerHTML = h;
  $$("#tabCorpo [data-enc]").forEach(function (b) { b.onclick = function () { TAB.aberta = TAB.aberta === b.dataset.enc ? null : b.dataset.enc; desenharTabaco(); }; });
  var inp = $("#tabF"); inp.oninput = function () { TAB.filtro = inp.value; var pos = inp.selectionStart; desenharTabaco(); var n = $("#tabF"); n.focus(); n.setSelectionRange(pos, pos); };
}
