/* mystationbox · menu por áreas (Fase 1 da reorganização aprovada a 01/11/2026).
 * 8 áreas fixas; cada uma tem páginas. Uma página é uma vista desta app (v-…) ou uma parte do módulo de stock,
 * que continua a ser o mesmo código (stock-tabaco-central), embutido sem cabeçalho nem menu próprios: aqui
 * escolhe-se o separador e mostram-se só os cartões dessa página. Nada foi apagado: tudo mudou de sítio. */
"use strict";
var AREAS = [
  {id: "ini", n: "🏠 Início", p: [["ini", "Resumo"]]},
  {id: "cx", n: "📝 Caixa", p: [["reg", "Registo do dia"], ["sai", "Saídas de caixa"], ["his", "Histórico"]]},
  {id: "ven", n: "📈 Vendas", adm: 1, p: [["ven", "Vendas e margens"], ["maq", "Máquina de tabaco"]]},
  {id: "com", n: "🛒 Compras", adm: 1, p: [["enc", "Por aprovar"], ["nova", "Nova encomenda"], ["comh", "Encomendas feitas"], ["ent", "Entrada de mercadoria"]]},
  {id: "stk", n: "📦 Stock", p: [["contar", "Contar"], ["ler", "Ler código"], ["stock", "Stock atual"], ["inv", "Inventário"], ["mov", "Movimentos"]]},
  {id: "conf", n: "🏦 Conferências", adm: 1, p: [["rep", "Repsol e Multibanco"], ["tms", "Fecho mensal TMS"]]},
  {id: "rel", n: "📊 Relatórios", adm: 1, p: [["mes", "Mês"], ["fun", "Por funcionário"]]},
  {id: "ges", n: "⚙️ Gestão", adm: 1, p: [["eq", "Equipa e acessos"], ["prod", "Produtos e códigos"], ["cfg", "Configuração do stock"]]}
];
/* páginas do módulo de stock: separador e cartões (pelo título) a mostrar ou esconder */
var NEXP = {
  contar: {tab: "count", hide: ["Encomenda para validar"]},
  enc: {tab: "count", only: ["Encomenda para validar"], vazio: "Não há encomendas por aprovar nesta loja. Faça uma em Compras → Nova encomenda."},
  ler: {tab: "scan"}, stock: {tab: "stock"}, inv: {tab: "inventory"},
  nova: {tab: "settings", only: ["Encomenda a partir das vendas", "Encomenda manual"]},
  ent: {tab: "settings", only: ["Entrada de mercadoria"]},
  maq: {tab: "settings", only: ["Vendas da máquina de tabaco"]},
  prod: {tab: "settings", only: ["Gestão de produtos"]},
  cfg: {tab: "settings", only: ["Configuração da base de dados central", "Importante"]}
};
var VISTA_DA = {ini: "ini", reg: "reg", sai: "sai", his: "his", ven: "tab", comh: "tab", mov: "tab", rep: "rep", tms: "tms", mes: "mes", fun: "fun", eq: "ges"};
var PAGINA = "ini";
function areasVisiveis() { return AREAS.filter(function (a) { return ADMIN || !a.adm; }); }
function areaDe(pg) { return AREAS.find(function (a) { return a.p.some(function (x) { return x[0] === pg; }); }); }

function montarMenu() {
  if (!$("#equipa").parentElement.matches("#v-ges")) $("#v-ges").appendChild($("#equipa"));
  $("#areas").innerHTML = areasVisiveis().map(function (a) { return "<button data-a='" + a.id + "'>" + a.n + "</button>"; }).join("");
  $$("#areas button").forEach(function (b) { b.onclick = function () { var a = AREAS.find(function (x) { return x.id === b.dataset.a; }); ir(a.p[0][0]); }; });
  ir("ini");
}
function marcar(pg) {
  PAGINA = pg; var a = areaDe(pg) || AREAS[0];
  $$("#areas button").forEach(function (b) { b.classList.toggle("on", b.dataset.a === a.id); });
  $("#subnav").innerHTML = a.p.length > 1 ? a.p.map(function (x) { return "<button data-p='" + x[0] + "'" + (x[0] === pg ? " class='on'" : "") + ">" + x[1] + "</button>"; }).join("") : "";
  $$("#subnav button").forEach(function (b) { b.onclick = function () { ir(b.dataset.p); }; });
}
/* ir para uma página (também chamado pelo módulo de stock, ex.: depois de criar uma encomenda) */
function ir(pg) {
  var a = areaDe(pg); if (!a || (a.adm && !ADMIN)) pg = "ini";
  if (NEXP[pg]) { vistaBase("nex"); marcar(pg); nexMostrar(pg); }
  else {
    var v = VISTA_DA[pg] || pg;
    if (v === "tab") TAB_PARTE = pg;
    vistaBase(v); marcar(pg);
  }
  window.scrollTo(0, 0);
}
window.msbIr = ir;
/* as vistas antigas chamam vista("reg"), etc.: passam a acertar também o menu */
var vistaBase = vista;
vista = function (v) { var pg = Object.keys(VISTA_DA).find(function (k) { return VISTA_DA[k] === v; }) || v; vistaBase(v); if (areaDe(pg)) marcar(pg); };
window.depoisVista = function (v) {
  if (v === "ini") carregarInicio();
  if (v === "tms") carregarTMS();
  if (v === "ges") carregarEquipa();
};

/* ---------------- módulo de stock embutido ---------------- */
var NEX_URL = "/stock-tabaco-central/", NEX_EST = null, NEX_PRONTO = false, NEX_PEND = null;
function prepararNexStock() {
  try {
    localStorage.setItem("stc_company", JSON.stringify(EST));
    var c = JSON.parse(localStorage.getItem("stc_cloud") || "null");
    if (!c || !c.url || !c.key) localStorage.setItem("stc_cloud", JSON.stringify({url: MSB_CONFIG.url, key: MSB_CONFIG.key}));
  } catch (e) { /* sem armazenamento: o módulo pede o login lá dentro */ }
}
function nexDoc() { try { var f = $("#nexFrame"); return f && f.contentDocument; } catch (e) { return null; } }
function nexAjustar() {
  var d = nexDoc(); if (!d || !d.head || d.getElementById("msb-embed")) return;
  var st = d.createElement("style"); st.id = "msb-embed";
  st.textContent = "header,nav,footer{display:none!important}main{padding-top:4px!important}body{background:transparent!important}";
  d.head.appendChild(st);
}
function nexMostrar(pg) {
  var box = $("#nexBox");
  if (NEX_EST !== EST || !$("#nexFrame")) {
    prepararNexStock(); NEX_EST = EST; NEX_PRONTO = false;
    box.innerHTML = "<iframe id='nexFrame' title='Stock e encomendas' src='" + NEX_URL + "?msb=" + Date.now() + "' allow='camera; clipboard-write' style='width:100%;height:calc(100dvh - 170px);min-height:520px;border:0;border-radius:12px;background:transparent'></iframe><div id='nexVazio' class='vazio' hidden></div>";
    $("#nexFrame").addEventListener("load", function () { NEX_PRONTO = true; nexAjustar(); if (NEX_PEND) nexAplicar(NEX_PEND); });
  }
  NEX_PEND = pg;
  if (NEX_PRONTO) nexAplicar(pg);
}
function nexAplicar(pg) {
  var cfg = NEXP[pg], d = nexDoc(); if (!cfg || !d) return;
  nexAjustar();
  var b = d.querySelector("nav button[data-tab='" + cfg.tab + "']");
  if (!b) { setTimeout(function () { if (PAGINA === pg) nexAplicar(pg); }, 400); return; }   // ainda a entrar
  b.click();
  var sec = d.getElementById("tab-" + cfg.tab), vis = 0;
  if (sec) Array.prototype.forEach.call(sec.querySelectorAll(".card"), function (c) {
    if (c.parentElement !== sec) return;
    var h = c.querySelector("h2"), t = h ? h.textContent.trim() : "";
    var ver = cfg.only ? cfg.only.indexOf(t) >= 0 : !(cfg.hide && cfg.hide.indexOf(t) >= 0);
    c.style.display = ver ? "" : "none";
    if (ver && !c.classList.contains("hidden")) vis++;
  });
  var vz = $("#nexVazio"); vz.hidden = !(cfg.vazio && !vis); vz.textContent = cfg.vazio || "";
  $("#nexFrame").style.display = vz.hidden ? "" : "none";
  try { d.defaultView.scrollTo(0, 0); } catch (e) { /* nada */ }
}

/* ---------------- Início ---------------- */
function hojeISO(n) { var d = new Date(); d.setDate(d.getDate() + (n || 0)); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function cartao(pg, titulo, grande, texto, tom) { return "<button class='c " + (tom || "") + "' data-p='" + pg + "'><h3>" + titulo + "</h3>" + (grande != null ? "<div class='g'>" + grande + "</div>" : "") + (texto ? "<p>" + texto + "</p>" : "") + "</button>"; }
async function carregarInicio() {
  var box = $("#iniCorpo"); box.innerHTML = "<div class='mut'>A carregar…</div>";
  try {
    var hoje = hojeISO(0), mes = hoje.slice(0, 7), L = await linhasMes(mes), h = "";
    var dHoje = L.filter(function (r) { return r.dia === hoje; }), dOntem = L.filter(function (r) { return r.dia === hojeISO(-1); });
    var T = {v: 0, d: 0, n: 0}; L.forEach(function (r) { T.v += r.vendas_c || 0; var x = dif(r); if (x != null) { T.d += x; T.n++; } });
    var dia = function (ls, nome) { var v = ls.reduce(function (s, r) { return s + (r.vendas_c || 0); }, 0), df = ls.reduce(function (s, r) { var x = dif(r); return s + (x || 0); }, 0);
      return cartao("reg", nome, ls.length ? fmt(v) + "<small> €</small>" : "—", ls.length ? ls.length + " de 2 turnos registados · diferença " + sinal(df) + " €" : "Nenhum turno registado", ls.length === 2 ? cls(df) === "bad" ? "bad" : "ok" : "al"); };
    h += dia(dHoje, "Hoje · " + dmy(hoje).slice(0, 5)) + dia(dOntem, "Ontem · " + dmy(hojeISO(-1)).slice(0, 5));
    h += cartao("mes", "Este mês · vendas", fmt(T.v) + "<small> €</small>", L.length + " turnos · diferença acumulada " + sinal(T.d) + " €", cls(T.d / Math.max(1, T.n)) === "bad" ? "bad" : "");
    var sai = await sb.from("msb_saidas").select("valor_c").eq("estacao", EST).is("recebido", null);
    var ns = (sai.data || []).length, vs = (sai.data || []).reduce(function (s, x) { return s + (x.valor_c || 0); }, 0);
    h += cartao("sai", "Saídas por entregar", ns ? fmt(vs) + "<small> €</small>" : "0", ns ? ns + " saída(s) de caixa ainda por entregar" : "Tudo entregue", ns ? "al" : "ok");
    if (ADMIN) {
      var dias = new Date().getDate() - 1, tem = {}; L.forEach(function (r) { if (r.dia < hoje) tem[r.dia + r.turno] = 1; });
      var falta = 0; for (var i = 1; i <= dias; i++) { var k = mes + "-" + String(i).padStart(2, "0"); if (!tem[k + "t1"]) falta++; if (!tem[k + "t2"]) falta++; }
      h += cartao("mes", "Turnos em falta este mês", String(falta), falta ? "Até ontem, sem registo" : "Todos registados até ontem", falta ? "al" : "ok");
      var o = await sb.from("orders").select("id,lines").eq("company_id", EST).eq("status", "pendente");
      var no = (o.data || []).length;
      h += cartao("enc", "Encomendas por aprovar", String(no), no ? "Abrir para ver o PDF e aprovar" : "Nenhuma à espera", no ? "al" : "ok");
      var ant = addMes(mes, -1), tm = await sb.from("msb_tms").select("chave").eq("estacao", EST).eq("mes", ant).limit(1);
      var temTms = (tm.data || []).length > 0;
      h += cartao("tms", "Fecho TMS de " + new Date(ant + "-15").toLocaleDateString("pt-PT", {month: "long"}), temTms ? "✔" : "—", temTms ? "Importado: ver a conferência" : "Ainda não carregado", temTms ? "ok" : "al");
      var dc = await sb.from("msb_docs").select("emissao").eq("estacao", EST).order("emissao", {ascending: false}).limit(1);
      var ult = dc.data && dc.data[0] && dc.data[0].emissao;
      h += cartao("rep", "Último documento Repsol", ult ? dmy(ult).slice(0, 5) : "—", ult ? "Emitido a " + dmy(ult) : "Nenhum carregado", "");
    }
    h += cartao("contar", "Stock de tabaco", "📦", "Contar, ler códigos e ver o stock", "");
    box.innerHTML = h;
    $$("#iniCorpo [data-p]").forEach(function (b) { b.onclick = function () { ir(b.dataset.p); }; });
  } catch (e) { box.innerHTML = "<div class='bad'>" + esc(falhou(e)) + "</div>"; }
}
