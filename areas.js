/* mystationbox · menu por áreas (Fase 1 da reorganização aprovada a 01/11/2026).
 * 8 áreas fixas; cada uma tem páginas. Uma página é uma vista desta app (v-…) ou uma parte do módulo de stock,
 * que continua a ser o mesmo código (stock-tabaco-central), embutido sem cabeçalho nem menu próprios: aqui
 * escolhe-se o separador e mostram-se só os cartões dessa página. Nada foi apagado: tudo mudou de sítio. */
"use strict";
var AREAS = [   // ordem aprovada a 05/11/2026: decisão, operação e controlo, obrigações e regras. Terceiro campo: g = subgrupo, adm = só administrador.
  {id: "ini", n: "🏠 Painel", p: [["ini", "Painel de Gestão"], ["avi", "OCTAN AI", {adm: 1}]]},
  {id: "des", n: "📊 Desempenho", adm: 1, p: [["luc", "Lucro", {g: "Resultados"}], ["mes", "Resultado mensal", {g: "Resultados"}], ["ven", "Vendas e margens", {g: "Vendas"}], ["va", "Relatório de vendas", {g: "Vendas"}], ["maq", "Máquina de tabaco", {g: "Vendas"}], ["fun", "Por funcionário", {g: "Análise"}]]},
  {id: "tes", n: "💶 Tesouraria", p: [["reg", "Registo diário", {g: "Caixa"}], ["sai", "Saídas de caixa", {g: "Caixa"}], ["his", "Histórico", {g: "Caixa"}], ["rep", "Repsol e Multibanco", {g: "Conferências", adm: 1}], ["tms", "Fecho mensal TMS", {g: "Conferências", adm: 1}]]},
  {id: "cst", n: "🛒 Compras e Stocks", c: "Compras", p: [["enc", "Por aprovar", {g: "Compras", adm: 1}], ["nova", "Nova encomenda", {g: "Compras", adm: 1}], ["comh", "Encomendas feitas", {g: "Compras", adm: 1}], ["ent", "Entrada de mercadoria", {g: "Receções", adm: 1}], ["comb", "Entrada de combustível", {g: "Receções", adm: 1}], ["contar", "Contar", {g: "Stock"}], ["ler", "Ler código", {g: "Stock"}], ["stock", "Stock atual", {g: "Stock"}], ["inv", "Inventário", {g: "Stock"}], ["mov", "Movimentos", {g: "Stock"}]]},
  {id: "con", n: "📋 Conformidade", adm: 1, p: [["pre", "Preços ENSE", {g: "ENSE"}], ["ense", "Reporte mensal", {g: "ENSE"}], ["kms", "Mapa de kms do gerente", {g: "Contabilidade"}]]},
  {id: "adm", n: "⚙️ Administração", adm: 1, p: [["eq", "Equipa e acessos", {g: "Pessoas"}], ["mrg", "Margens e custos", {g: "Regras"}], ["prod", "Produtos e códigos", {g: "Regras"}], ["cfg", "Configuração do stock", {g: "Regras"}]]}
];
/* páginas do módulo de stock: separador e cartões (pelo título, ou "#id" do cartão) a mostrar ou esconder.
   O cartão da encomenda muda de título ("Encomenda LOGISTA · Penafiel · por validar"), por isso vai pelo id. */
var NEXP = {
  contar: {tab: "count", hide: ["Encomenda para validar", "#ordCard"]},
  enc: {tab: "count", only: ["Encomenda para validar", "#ordCard"], vazio: "Não há encomendas por aprovar nesta loja. Faça uma em Compras → Nova encomenda."},
  ler: {tab: "scan"}, stock: {tab: "stock"}, inv: {tab: "inventory"},
  nova: {tab: "settings", only: ["Encomenda a partir das vendas", "Encomenda manual"]},
  ent: {tab: "settings", only: ["Entrada de mercadoria"]},
  maq: {tab: "settings", only: ["Vendas da máquina de tabaco"]},
  prod: {tab: "settings", only: ["Gestão de produtos"]},
  cfg: {tab: "settings", only: ["Configuração da base de dados central", "Importante"]}
};
var VISTA_DA = {avi: "avi", ini: "ini", reg: "reg", sai: "sai", his: "his", ven: "tab", comh: "tab", mov: "tab", rep: "rep", tms: "tms", mes: "mes", fun: "fun", eq: "ges", luc: "luc", mrg: "mrg", comb: "comb", ense: "ense", va: "va", kms: "kms", pre: "pre"};
var PAGINA = "ini";
function areasVisiveis() { return AREAS.filter(function (a) { return ADMIN || !a.adm; }); }
function paginasDe(a) { return a.p.filter(function (x) { return ADMIN || !(x[2] && x[2].adm); }); }
function areaDe(pg) { return AREAS.find(function (a) { return a.p.some(function (x) { return x[0] === pg; }); }); }

function montarMenu() {
  if (!$("#equipa").parentElement.matches("#v-ges")) $("#v-ges").appendChild($("#equipa"));
  var vis = areasVisiveis(), mais = vis.some(function (a) { return AREAS_TEL.indexOf(a.id) < 0; });
  $("#areas").innerHTML = vis.map(function (a) { var i = a.n.indexOf(" "); return "<button data-a='" + a.id + "'" + (AREAS_TEL.indexOf(a.id) < 0 ? " class='extra'" : "") + "><i>" + a.n.slice(0, i) + "</i><span>" + (a.c ? "<em class='lg'>" + a.n.slice(i + 1) + "</em><em class='cu'>" + a.c + "</em>" : a.n.slice(i + 1)) + "</span></button>"; }).join("") +
    (mais ? "<button data-a='mais' class='so-tel'><i>☰</i><span>Mais</span></button>" : "");
  $$("#areas button").forEach(function (b) { b.onclick = function () { if (b.dataset.a === "mais") return abrirMais(); $("#maisMenu").hidden = true; var a = AREAS.find(function (x) { return x.id === b.dataset.a; }); ir(paginasDe(a)[0][0]); }; });
  ir("ini");
}
function marcar(pg) {
  PAGINA = pg; var a = areaDe(pg) || AREAS[0];
  $$("#areas button").forEach(function (b) { b.classList.toggle("on", b.dataset.a === a.id || (b.dataset.a === "mais" && AREAS_TEL.indexOf(a.id) < 0)); });
  var ps = paginasDe(a), gr = "";
  $("#subnav").innerHTML = ps.length > 1 ? ps.map(function (x) { var g = (x[2] && x[2].g) || "", t = g && g !== gr ? "<span class='subg'>" + g + "</span>" : ""; gr = g || gr; return t + "<button data-p='" + x[0] + "'" + (x[0] === pg ? " class='on'" : "") + ">" + x[1] + "</button>"; }).join("") : "";
  $$("#subnav button").forEach(function (b) { b.onclick = function () { ir(b.dataset.p); }; });
}
/* ir para uma página (também chamado pelo módulo de stock, ex.: depois de criar uma encomenda) */
function ir(pg) {
  var a = areaDe(pg), ent = a && a.p.find(function (x) { return x[0] === pg; }); if (!a || (a.adm && !ADMIN) || (ent[2] && ent[2].adm && !ADMIN)) pg = "ini";
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
  if (v === "luc") carregarLucro();
  if (v === "mrg") carregarMargens();
  if (v === "comb") carregarEntradasComb();
  if (v === "ense") carregarENSE();
  if (v === "va") carregarVendasArtigos();
  if (v === "kms") carregarKms();
  if (v === "pre") carregarPrecos();
  if (v === "avi") carregarAvisos();
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
/* mensagens do módulo de stock (dentro do iframe ficavam escondidas atrás da barra de baixo) */
window.msbAviso = function (t) {
  var e = $("#msbAviso"); if (!e) { e = document.createElement("div"); e.id = "msbAviso"; document.body.appendChild(e); }
  var mau = /erro|não |falh|vazia|sem /i.test(t);
  e.className = mau ? "msgErr" : "msgOk"; e.textContent = (mau ? "⚠ " : "✓ ") + t;
  e.style.cssText = "position:fixed;left:12px;right:12px;top:12px;z-index:100;padding:12px 14px;border-radius:12px;font-weight:600;box-shadow:0 6px 24px rgba(0,0,0,.25)";
  clearTimeout(window.msbAviso.t); window.msbAviso.t = setTimeout(function () { e.remove(); }, mau ? 8000 : 4000);
  e.onclick = function () { e.remove(); };
};
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
var NEX_OBS = null, NEX_T0 = 0;
function nexAplicar(pg) {
  var cfg = NEXP[pg], d = nexDoc(); if (!cfg || !d) return;
  nexAjustar();
  var b = d.querySelector("nav button[data-tab='" + cfg.tab + "']");
  if (!b) { setTimeout(function () { if (PAGINA === pg) nexAplicar(pg); }, 400); return; }   // ainda a entrar
  b.click(); NEX_T0 = Date.now();
  var sec = d.getElementById("tab-" + cfg.tab);
  if (sec) Array.prototype.forEach.call(sec.querySelectorAll(".card"), function (c) {
    if (c.parentElement !== sec) return;
    var h = c.querySelector("h2"), t = h ? h.textContent.trim() : "", em = function (l) { return !!l && (l.indexOf(t) >= 0 || (c.id && l.indexOf("#" + c.id) >= 0)); };
    c.style.display = (cfg.only ? em(cfg.only) : !em(cfg.hide)) ? "" : "none";
  });
  /* as encomendas chegam do servidor depois: vigiar os cartões e decidir o "vazio" só quando já carregou */
  if (NEX_OBS) NEX_OBS.disconnect();
  try { NEX_OBS = new d.defaultView.MutationObserver(function () { if (NEXP[PAGINA]) nexVis(PAGINA); }); NEX_OBS.observe(d.body, {subtree: true, attributes: true, attributeFilter: ["class"], childList: true}); } catch (e) { NEX_OBS = null; }
  nexVis(pg);
  try { d.defaultView.scrollTo(0, 0); } catch (e) { /* nada */ }
}
function nexVis(pg) {
  var cfg = NEXP[pg], d = nexDoc(); if (!cfg || !d) return;
  var sec = d.getElementById("tab-" + cfg.tab), vis = 0;
  if (sec) Array.prototype.forEach.call(sec.querySelectorAll(".card"), function (c) { if (c.parentElement === sec && c.style.display !== "none" && !c.classList.contains("hidden")) vis++; });
  var vz = $("#nexVazio"), espera = cfg.vazio && !vis && Date.now() - NEX_T0 < 6000;
  vz.hidden = !(cfg.vazio && !vis); vz.textContent = espera ? "A carregar…" : (cfg.vazio || "");
  $("#nexFrame").style.display = vz.hidden ? "" : "none";
  if (espera) setTimeout(function () { if (PAGINA === pg) nexVis(pg); }, 1000);
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
      return cartao("reg", nome, ls.length ? fmt(v) + "<small> €</small>" : "—", ls.length ? ls.length + " de 2 turnos registados · diferença " + sinal(df) + " €" : "Nenhum turno registado", ls.length === 2 ? cls(df) === "wn" ? "al" : "ok" : "al"); };
    h += dia(dHoje, "Hoje · " + dmy(hoje).slice(0, 5)) + dia(dOntem, "Ontem · " + dmy(hojeISO(-1)).slice(0, 5));
    h += cartao("mes", "Este mês · vendas", fmt(T.v) + "<small> €</small>", L.length + " turnos · diferença acumulada " + sinal(T.d) + " €", cls(T.d / Math.max(1, T.n)) === "wn" ? "al" : "");
    var sai = await sb.from("msb_saidas").select("valor_c").eq("estacao", EST).is("recebido", null);
    var ns = (sai.data || []).length, vs = (sai.data || []).reduce(function (s, x) { return s + (x.valor_c || 0); }, 0);
    h += cartao("sai", "Saídas por entregar", ns ? fmt(vs) + "<small> €</small>" : "0", ns ? ns + " saída(s) de caixa ainda por entregar" : "Tudo entregue", ns ? "al" : "ok");
    if (ADMIN) {
      try { h = (await cartaoAvisos()) + h; } catch (e) { /* os avisos nunca impedem o Início de abrir */ }
      aviSelo();
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

/* ---------------- 📥 Carregar ficheiro (um só botão, Fase 3 da proposta) ----------------
 * Reconhece o ficheiro pelo conteúdo e entrega-o ao leitor que já existia, na página certa:
 * folha de turno .xls → Caixa · fotografia de talão → Caixa (fecho digitalizado) · PDF Repsol → Conferências ·
 * fecho mensal TMS .csv → Conferências · relatório de vendas em Excel (.xlsx; CSV recusado: não traz a loja) → pergunta: encomenda (Adelaide/Logista)
 * ou vendas da máquina. Os leitores continuam a confirmar a loja e a recusar o que não reconhecem. */
async function tipoFicheiro(f) {
  var b = new Uint8Array(await f.slice(0, 64).arrayBuffer()), ini = String.fromCharCode.apply(null, b);
  if (/^image\//.test(f.type) || /\.(jpe?g|png|heic|webp)$/i.test(f.name)) return "foto";
  if (ini.slice(0, 4) === "%PDF") {   // relatório de vendas do CBOS (título "CBOS | Resultado turno…") ou documento Repsol
    var txt = new TextDecoder("latin1").decode(new Uint8Array(await f.slice(0, 200000).arrayBuffer()));
    if (ehPrecosPdf(txt)) return "precos";                                                                      // tabela semanal de preços (ENSE)
    if (/Folhas de turno|0046006F006C0068006100730020006400650020007400750072006E006F/i.test(txt)) return "folha";   // FOLHA DE FECHO TURNO MENSAL
    return /00430042004F0053|CBOS/i.test(txt) ? "cbos" : "pdf";                                                    // TURNO POR FORMAS DE COBRANÇA MENSAL
  }
  if (b[0] === 0xD0 && b[1] === 0xCF && b[2] === 0x11 && b[3] === 0xE0) return "xls";
  if (/^comercio;/i.test(ini.replace(/^﻿/, ""))) return "tms";
  if (b[0] === 0x50 && b[1] === 0x4B) return "vendas";             // relatório de vendas: só Excel (o CSV não diz a loja)
  if (/\.csv$/i.test(f.name)) return "csv";
  return "";
}
function esperarNex(prova, ms) {
  return new Promise(function (ok, ko) {
    var t0 = Date.now();
    (function v() { var w = null; try { w = $("#nexFrame") && $("#nexFrame").contentWindow; } catch (e) { /* nada */ }
      if (w && prova(w)) return ok(w);
      if (Date.now() - t0 > (ms || 20000)) return ko(new Error("o módulo de stock ainda não abriu; tente de novo"));
      setTimeout(v, 300); })();
  });
}
function escolherVendas(f) {
  painel("<h3>📈 Relatório de vendas: " + esc(f.name) + "</h3><p id='vaGuardado' class='mut' style='margin:0'>A guardar o relatório…</p><p class='mut' style='margin:0'>O que quer fazer com ele?</p>" +
    "<div class='bar'><button class='btn' data-v='so'>✔ Só guardar</button><button class='btn p' data-v='tabaco'>🛒 Encomenda de tabaco · ADELAIDE</button><button class='btn az' data-v='aquecido'>🛒 Encomenda de aquecido e recargas · LOGISTA</button><button class='btn' data-v='maq'>📈 Só ver as vendas da máquina</button><button class='btn' data-v=''>Cancelar</button></div>");
  ir("reg");
  /* fica sempre guardado na app (fonte única das vendas por artigo: ENSE, etc.) */
  guardarVendasExcel(f).then(function (r) { var e = $("#vaGuardado"); if (e) { e.className = "msgOk"; e.textContent = "✔ Guardado na app: vendas de " + dmy(r.de) + " a " + dmy(r.ate) + " (" + r.linhas.length + " artigos)."; } })
    .catch(function (e) { var x = $("#vaGuardado"); if (x) { x.className = "msgErr"; x.textContent = "✖ Não ficou guardado: " + falhou(e); } });
  $$("#painel [data-v]").forEach(function (b) { b.onclick = async function () {
    var o = b.dataset.v; fecharPainel(); if (!o) return;
    if (o === "so") { ir("va"); return; }
    ir(o === "maq" ? "maq" : "nova");
    try {
      var w = await esperarNex(function (w) { return o === "maq" ? w.document.getElementById("maqFile") && w.document.getElementById("maqFile").onchange : typeof w.salesChange === "function"; });
      var ev = {target: {files: [f], value: "", dataset: {sup: o}}};
      if (o === "maq") w.document.getElementById("maqFile").onchange(ev); else w.salesChange(ev);
    } catch (e) { status(false, "⚠ " + e.message); }
  }; });
}
async function carregarFicheiros(fs) {
  var g = {pdf: [], precos: [], cbos: [], folha: [], foto: [], xls: [], tms: [], vendas: [], csv: [], "": []};
  for (var i = 0; i < fs.length; i++) g[await tipoFicheiro(fs[i])].push(fs[i]);
  /* Excel de créditos MB/Solred por transferência: reconhece-se pelo cabeçalho (N.º doc. · Mont. em MI) */
  var trf = []; for (var k = g.vendas.length - 1; k >= 0; k--) if (await ehTransferencias(g.vendas[k])) trf.push(g.vendas.splice(k, 1)[0]);
  if (g[""].length || g.csv.length) ir("reg");      // a mensagem aparece na barra do Registo
  if (g[""].length) status(false, "⚠ Não reconheço: " + g[""].map(function (f) { return f.name; }).join(", ") + ". Ficheiros aceites: folha de turno (.xls), fotografia do talão, PDF da Repsol, fecho mensal TMS (.csv), relatório de vendas de tabaco (Excel .xlsx), relatório «Turno por formas de cobrança» (PDF feito com «Guardar como PDF»).");
  if (g.csv.length) status(false, "⚠ " + g.csv.map(function (f) { return f.name; }).join(", ") + ": o relatório de vendas tem de ser em Excel (.xlsx), porque o CSV não diz de que loja é.");
  if (g.tms.length) { ir("tms"); for (var j = 0; j < g.tms.length; j++) await importarTMS(g.tms[j]); }
  if (g.pdf.length) { ir("rep"); carregarPdfs(g.pdf); }
  for (var q = 0; q < g.precos.length; q++) await importarPrecos(g.precos[q]);
  if (g.cbos.length) await importarVendasCBOS(g.cbos[0]);
  if (g.folha.length) await importarFolhaFecho(g.folha[0]);
  if (g.xls.length) { ir("reg"); $("#fXls").onchange.call({files: [g.xls[0]], value: ""}); }
  if (g.foto.length) { ir("reg"); $("#fFecho").onchange.call({files: [g.foto[0]], value: ""}); }
  if (trf.length) await importarTransferencias(trf[0]);
  if (g.vendas.length) escolherVendas(g.vendas[0]);
  var varios = g.xls.length + g.foto.length + g.vendas.length > (g.xls.length ? 1 : 0) + (g.foto.length ? 1 : 0) + (g.vendas.length ? 1 : 0);
  if (varios) status(false, "⚠ Só se lê uma folha de turno, um talão e um relatório de vendas de cada vez: carregue os restantes depois.");
}
$("#bCarregar").onclick = function () { $("#fCarregar").click(); };
$("#fCarregar").onchange = function () { var fs = Array.from(this.files || []); this.value = ""; if (fs.length) carregarFicheiros(fs); };

/* ---------------- telemóvel: barra de áreas em baixo, "Mais" para as restantes ---------------- */
var AREAS_TEL = ["ini", "des", "tes", "cst"];
function abrirMais() {
  var el = $("#maisMenu"); el.hidden = !el.hidden; if (el.hidden) return;
  el.innerHTML = "<div class='mm'>" + areasVisiveis().filter(function (a) { return AREAS_TEL.indexOf(a.id) < 0; }).map(function (a) { return "<button data-a='" + a.id + "'>" + a.n + "</button>"; }).join("") + "</div>";
  $$("#maisMenu [data-a]").forEach(function (b) { b.onclick = function () { el.hidden = true; var a = AREAS.find(function (x) { return x.id === b.dataset.a; }); ir(a.p[0][0]); }; });
}
