/* mystationbox · avisos do OCTAN AI, o agente de compras e ENSE (05/11/2026).
 * O agente de compras (PC da loja) deixa aqui, todos os dias, o resultado da corrida: faturas guardadas como rascunho
 * no CBOS à espera de validação, faturas por resolver e erros. Vê-se o de todas as lojas, sem mudar de loja.
 * Quem escreve é a Edge Function msb-aviso; aqui só se lê e se marca como lido. Só administradores. */
"use strict";
var AVI_NIVEL = {erro: ["❌", "Erro"], atencao: ["⚠️", "Atenção"], ok: ["✅", "Feito"], info: ["ℹ️", "Sem novidades"]};
var AVI_HORAS = 26;   // corre às 08:00; mais do que isto sem aviso quer dizer que não correu
function aviLoja(id) { var e = (ESTS || []).find(function (x) { return x.id === id; }); return e ? e.name : id; }
function aviDataHora(t) { var d = new Date(t); return d.toLocaleDateString("pt-PT") + " " + d.toLocaleTimeString("pt-PT", {hour: "2-digit", minute: "2-digit"}); }
async function avisosRecentes(n) {
  var r = await sb.from("msb_avisos").select("*").order("criado", {ascending: false}).limit(n);
  if (r.error) throw r.error;
  return r.data || [];
}
function aviParado(L) {
  var c = L.find(function (a) { return a.tipo === "compras"; });
  return !!c && (Date.now() - new Date(c.criado).getTime()) / 36e5 > AVI_HORAS ? c : null;
}
/* ---- preços da ENSE, de todas as lojas: aprovar aqui e ver o histórico ---- */
var AVI_PRECOS = [], AVI_ESPERA = null, AVI_PD = [];
async function aviTodosPrecos() {
  var r = await sb.from("msb_precos").select("estacao,dia,hora,produtos,estado,comunicado_em,comunicado_por,aprovado_em,aprovado_por,ense_tentado_em,ense_erro").order("dia", {ascending: false}).limit(60);
  if (r.error) throw r.error;
  return AVI_PRECOS = r.data || [];
}
async function precosPorAprovar() {
  return (await aviTodosPrecos()).filter(function (x) { return x.estado === "lido" && (!x.aprovado_em || x.ense_erro); });
}
function aviQuadro(x) {
  var ant = AVI_PRECOS.filter(function (y) { return y.estacao === x.estacao && y.dia < x.dia; })[0], p = porCampo(x.produtos), a = ant ? porCampo(ant.produtos) : {};
  var linhas = Object.keys(p).map(function (c) { var d = a[c] != null ? p[c] - a[c] : null;
    return "<tr><td class='l'>" + esc(PRE_CURTO[c] || c) + "</td><td class='n'><b>" + m3(p[c]) + "</b></td><td class='n'>" + m3(a[c]) + "</td><td class='n'>" + (d == null ? "—" : d ? (d > 0 ? "+" : "") + m3(d) : "=") + "</td></tr>"; }).join("");
  return "<div class='card' style='padding:12px 14px;border:2px solid var(--laranja)'><b>📝 " + esc(aviLoja(x.estacao)) + " · preços em vigor a " + dmy(x.dia) + " " + esc(x.hora || "00:00") + "</b>" +
    (x.ense_erro ? "<div class='bad' style='margin-top:6px'>❌ " + esc(x.ense_erro) + "<br>Vê na ENSE se ficou gravado antes de tentar outra vez.</div>" : "") +
    "<div class='sc' style='margin-top:6px'><table><thead><tr><th class='l'>Combustível</th><th>Novo</th><th>Antes</th><th>Dif.</th></tr></thead><tbody>" + linhas + "</tbody></table></div>" +
    "<div class='bar' style='margin-top:8px'><button class='btn p' data-aprova='" + x.estacao + "|" + x.dia + "'>" + (x.ense_erro ? "↻ Verifiquei: tentar outra vez" : "✔ Aprovar e gravar na ENSE") + "</button></div></div>";
}
function aviEspera(x) {
  return "<div class='aviso'>⏳ " + esc(aviLoja(x.estacao)) + " · preços de " + dmy(x.dia) + (x.ense_tentado_em ? ": a gravar na ENSE." : ": aprovados. O OCTAN AI grava nos próximos minutos.") + "</div>";
}
function aviHistorico() {
  return (ESTS || []).map(function (e) {
    var L = AVI_PRECOS.filter(function (x) { return x.estacao === e.id; }).slice(0, 12);
    if (!L.length) return "";
    var v = {}; L.forEach(function (x) { Object.keys(porCampo(x.produtos)).forEach(function (c) { v[c] = 1; }); });
    var C = PRE_ORDEM.filter(function (c) { return v[c]; }).concat(Object.keys(v).filter(function (c) { return PRE_ORDEM.indexOf(c) < 0; }));
    return "<div class='card' style='padding:12px 14px'><b>📋 Histórico de preços · " + esc(e.name) + "</b><div class='sc' style='margin-top:6px'><table><thead><tr><th class='l'>Em vigor</th>" +
      C.map(function (c) { return "<th>" + esc(PRE_CURTO[c] || c) + "</th>"; }).join("") + "<th class='l'>ENSE</th></tr></thead><tbody>" +
      L.map(function (x) { var p = porCampo(x.produtos);
        return "<tr><td class='l'>" + dmy(x.dia) + "</td>" + C.map(function (c) { return "<td class='n'>" + m3(p[c]) + "</td>"; }).join("") +
          "<td class='l'>" + (x.estado === "comunicado" ? "<span class='ok'>✔ " + (x.comunicado_em ? new Date(x.comunicado_em).toLocaleDateString("pt-PT") : "") + "</span> " + esc(x.comunicado_por || "") : "Por gravar") + "</td></tr>"; }).join("") +
      "</tbody></table></div></div>";
  }).join("");
}
async function aviAprovar(est, dia) {
  if (!confirm("Aprovas estes preços de " + aviLoja(est) + "? O OCTAN AI vai gravá-los na ENSE.")) return;
  var r = await sb.from("msb_precos").update({aprovado_em: new Date().toISOString(), aprovado_por: (PERFIL && PERFIL.display_name) || "", ense_tentado_em: null, ense_erro: null}).eq("estacao", est).eq("dia", dia).eq("estado", "lido");
  if (r.error) return status(false, "⚠ " + falhou(r.error));
  carregarAvisos(); aviSelo();
}
/* ---- pedir vendas ao OCTAN AI: o PC lê no CBOS e devolve aqui ---- */
var AVI_PASTAS = [["TODAS", "Tudo"], ["TABACO", "Tabaco"], ["GAS", "Gás"], ["LOJA", "Loja"], ["IMPRENSA", "Imprensa"], ["JOGO", "Jogo"], ["LAVAGEM", "Lavagem"], ["LUBRIFICANTES", "Lubrificantes"], ["OUTROS COMBUSTIVEIS", "Outros combustíveis"]];
function aviForm() {
  return "<div class='card' style='padding:12px 14px'><b>🔎 Pedir vendas ao OCTAN AI</b>" +
    "<div style='display:grid;gap:8px;margin-top:8px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))'>" +
    "<label>Loja<select id='pvLoja'>" + (ESTS || []).map(function (e) { return "<option value='" + e.id + "'" + (e.id === EST ? " selected" : "") + ">" + esc(e.name) + "</option>"; }).join("") + "</select></label>" +
    "<label>O quê<select id='pvPasta'>" + AVI_PASTAS.map(function (p) { return "<option value='" + p[0] + "'>" + p[1] + "</option>"; }).join("") + "</select></label>" +
    "<label>De<input type='date' id='pvDe' value='" + hojeISO(-7) + "'></label><label>Até<input type='date' id='pvAte' value='" + hojeISO(-1) + "'></label>" +
    "<label>Artigo (opcional)<input id='pvArtigo' placeholder='ex.: TEREA'></label></div>" +
    "<div class='bar' style='margin-top:8px'><button class='btn p' id='pvPedir'>Pedir</button></div></div>";
}
function aviPedidos(L) {
  return L.map(function (p) {
    var t = "<b>" + esc(aviLoja(p.estacao)) + " · " + esc((AVI_PASTAS.find(function (x) { return x[0] === p.pasta; }) || [0, p.pasta])[1]) + (p.artigo ? " · " + esc(p.artigo) : "") + "</b><div class='mut'>" + dmy(p.de) + " a " + dmy(p.ate) + "</div>";
    if (p.estado === "pendente" || p.estado === "a_ler") return "<div class='aviso'>⏳ " + t + "O OCTAN AI responde nos próximos minutos.</div>";
    var vi = p.visto_em ? "" : "<div style='margin-top:8px'><button class='btn' data-pv='" + p.id + "'>✔ Visto</button></div>";
    if (p.estado === "erro") return "<div class='card' style='padding:12px 14px'>❌ " + t + "<div class='bad'>" + esc(p.erro) + "</div>" + vi + "</div>";
    var L2 = p.linhas || [], q = L2.reduce(function (s, x) { return s + x[2]; }, 0), v = L2.reduce(function (s, x) { return s + x[3]; }, 0);
    var usar = !p.artigo && (p.pasta === "TABACO" || p.pasta === "TODAS") && L2.length ? "<div class='bar' style='margin-top:8px'><button class='btn p' data-us='" + p.id + "|tabaco'>🛒 Encomenda Adelaide</button><button class='btn az' data-us='" + p.id + "|aquecido'>🛒 Encomenda Logista</button></div>" : "";
    return "<details class='card' style='padding:12px 14px'><summary>✅ " + t + "<div class='mut'>" + L2.length + " artigos · " + fmt(q * 100).replace(",00", "") + " un. · " + fmt(v * 100) + " €</div>" + usar + vi + "</summary>" +
      "<div class='sc' style='margin-top:6px'><table><thead><tr><th class='l'>Artigo</th><th>Qtd</th><th>Montante €</th></tr></thead><tbody>" +
      L2.map(function (x) { return "<tr><td class='l'>" + esc(x[1]) + "</td><td class='n'>" + fmt(x[2] * 100).replace(",00", "") + "</td><td class='n'>" + fmt(x[3] * 100) + "</td></tr>"; }).join("") + "</tbody></table></div></details>";
  }).join("");
}
/* Usa as vendas lidas no CBOS na Nova encomenda, pelo mesmo caminho do relatório em Excel: mesmas regras, confirmação e aprovação. */
async function aviUsar(id, sup) {
  var p = AVI_PD.find(function (x) { return x.id === id; }), e = (ESTS || []).find(function (x) { return x.id === p.estacao; });
  if (p.estacao !== EST) return status(false, "⚠ Este pedido é de " + aviLoja(p.estacao) + ". Mude de loja no cabeçalho e carregue de novo.");
  if (!e || !e.posto_repsol) return status(false, "⚠ A loja não tem o posto Repsol configurado.");
  var dias = [], d = new Date(p.de + "T12:00:00"), fim = new Date(p.ate + "T12:00:00");
  for (; d <= fim; d.setDate(d.getDate() + 1)) dias.push(dmy(d.toISOString().slice(0, 10)) + " - Quantidade");
  ir("nova");
  try {
    /* o módulo de stock demora a confirmar quem entrou: sem isto recusa a encomenda logo que abre */
    var w = await esperarNex(function (x) { try { return typeof x.salesChange === "function" && typeof x.carregarXlsx === "function" && x.eval("typeof currentRole !== 'undefined' && currentRole === 'admin'"); } catch (e) { return false; } });
    await w.carregarXlsx();
    var cab = ["Código", "Artigos"].concat(dias, ["Total quantidade", "Total Montante"]), L = [["Posto", e.posto_repsol + " - " + e.name], cab];
    (p.linhas || []).forEach(function (l) { L.push([l[0], l[1]].concat(dias.map(function () { return 0; }), [l[2], l[3]])); });
    var wb = w.XLSX.utils.book_new(); w.XLSX.utils.book_append_sheet(wb, w.XLSX.utils.aoa_to_sheet(L), "Vendas");
    var f = new w.File([w.XLSX.write(wb, {type: "array", bookType: "xlsx"})], "vendas_pedido_" + id + ".xlsx");
    return w.salesChange({target: {files: [f], value: "", dataset: {sup: sup}}});
  } catch (x) { status(false, "⚠ " + (x.message || x)); }
}
async function aviPedir() {
  var de = $("#pvDe").value, ate = $("#pvAte").value;
  if (!de || !ate || ate < de) return status(false, "⚠ Confirma as datas.");
  var r = await sb.from("msb_pedidos").insert({estacao: $("#pvLoja").value, de: de, ate: ate, pasta: $("#pvPasta").value, artigo: $("#pvArtigo").value.trim().slice(0, 60), pedido_por: (PERFIL && PERFIL.display_name) || ""});
  if (r.error) return status(false, "⚠ " + falhou(r.error));
  carregarAvisos();
}
/* número no botão Início, atualizado de 5 em 5 minutos enquanto a app está aberta */
async function aviSelo() {
  if (typeof ADMIN === "undefined" || !ADMIN) return;
  try {
    var P = await precosPorAprovar(), L = await avisosRecentes(60), n = P.length + L.filter(function (a) { return !a.lido_em && a.nivel !== "info"; }).length;
    if (window.MSB_NAV) return MSB_NAV.selo(n);
    var b = document.querySelector("#areas button[data-a='ini']"); if (!b) return;
    var s = b.querySelector(".aviSelo");
    if (!s) { s = document.createElement("b"); s.className = "aviSelo"; s.style.cssText = "background:var(--laranja);color:#fff;border-radius:9px;padding:0 6px;margin-left:4px;font-size:12px"; b.appendChild(s); }
    s.textContent = n; s.hidden = !n;
  } catch (e) { /* o selo nunca atrapalha o resto da app */ }
}
setInterval(aviSelo, 300000);

/* cartão do Início */
async function cartaoAvisos() {
  var L = await avisosRecentes(60), P = await precosPorAprovar();
  if (P.length) return cartao("avi", "OCTAN AI · por aprovar", String(P.length), P.length === 1 ? "Preços de " + esc(aviLoja(P[0].estacao)) + " à espera da tua aprovação para a ENSE" : "Tabelas de preços à espera da tua aprovação para a ENSE", "al");
  if (!L.length) return "";
  var porLer = L.filter(function (a) { return !a.lido_em && a.nivel !== "info"; }), erro = porLer.some(function (a) { return a.nivel === "erro"; }), p = aviParado(L);
  var mau = porLer.find(function (a) { return a.nivel === "erro"; }) || porLer[0];
  var t = p ? "O OCTAN AI não corre desde " + aviDataHora(p.criado) : mau ? mau.titulo : "Sem nada por ver";
  return cartao("avi", "OCTAN AI", String(porLer.length), esc(t), erro || p || porLer.length ? "al" : "ok");
}
async function carregarAvisos() {
  var box = $("#aviCorpo"); box.innerHTML = "<div class='mut'>A carregar…</div>";
  try {
    var L = await avisosRecentes(100), p = aviParado(L), h = "", P = await precosPorAprovar();
    h += P.map(aviQuadro).join("") + AVI_PRECOS.filter(function (x) { return x.estado === "lido" && x.aprovado_em && !x.ense_erro; }).map(aviEspera).join("");
    if (p) h += "<div class='bad'>⚠️ O OCTAN AI não corre desde " + aviDataHora(p.criado) + ". Confirma se o portátil da loja está ligado.</div>";
    var porLer = L.filter(function (a) { return !a.lido_em && a.nivel !== "info"; });
    if (porLer.length) h += "<div class='bar'><button class='btn' id='aviTudo'>✔ Marcar tudo como visto (" + porLer.length + ")</button></div>";
    if (!L.length) h += "<div class='mut'>Ainda não há avisos.</div>";
    var cartaoAviso = function (a) {
      var n = AVI_NIVEL[a.nivel] || ["", a.nivel], novo = !a.lido_em && a.nivel !== "info";
      return "<div class='card' style='padding:12px 14px" + (novo ? "" : ";opacity:.72") + "'><b>" + n[0] + " " + esc(a.titulo) + "</b>" +
        "<div class='mut'>" + esc(aviLoja(a.estacao)) + " · " + n[1] + " · " + aviDataHora(a.criado) + (a.lido_em ? " · visto por " + esc(a.lido_por || "") : "") + "</div>" +
        (a.detalhe ? "<div style='white-space:pre-wrap;margin-top:6px'>" + esc(a.detalhe) + "</div>" : "") +
        (novo ? "<div style='margin-top:8px'><button class='btn' data-avi='" + a.id + "'>✔ Visto</button></div>" : "") + "</div>";
    };
    var pd = await sb.from("msb_pedidos").select("*").order("criado", {ascending: false}).limit(30);
    var PD = AVI_PD = pd.data || [], feito = function (x) { return x.estado === "feito" || x.estado === "erro"; };
    var pAbertos = PD.filter(function (x) { return !x.visto_em || !feito(x); }), pArq = PD.filter(function (x) { return x.visto_em && feito(x); });
    var arq = L.filter(function (a) { return a.lido_em || a.nivel === "info"; });
    h += porLer.map(cartaoAviso).join("");
    if (L.length && !porLer.length) h += "<div class='mut'>Nada por ver. Os avisos já vistos estão no arquivo.</div>";
    var nArq = arq.length + pArq.length;
    var arquivo = nArq ? "<details class='card' style='padding:12px 14px'><summary><b>🗄️ Arquivo (" + nArq + ")</b></summary><div style='display:grid;gap:10px;margin-top:10px'>" + aviPedidos(pArq) + arq.map(cartaoAviso).join("") + "</div></details>" : "";
    box.innerHTML = aviForm() + aviPedidos(pAbertos) + h + aviHistorico() + arquivo;
    /* enquanto houver pedido em espera, a resposta aparece sozinha */
    clearTimeout(AVI_ESPERA);
    if (PD.some(function (x) { return x.estado === "pendente" || x.estado === "a_ler"; })) AVI_ESPERA = setTimeout(function () { if (PAGINA === "avi") carregarAvisos(); }, 20000);
    $("#pvPedir").onclick = aviPedir;
    $$("#aviCorpo [data-aprova]").forEach(function (b) { b.onclick = function () { var k = b.dataset.aprova.split("|"); aviAprovar(k[0], k[1]); }; });
    $$("#aviCorpo [data-avi]").forEach(function (b) { b.onclick = function () { aviVisto([Number(b.dataset.avi)]); }; });
    $$("#aviCorpo [data-us]").forEach(function (b) { b.onclick = function (ev) { ev.preventDefault(); var k = b.dataset.us.split("|"); aviUsar(Number(k[0]), k[1]); }; });
    $$("#aviCorpo [data-pv]").forEach(function (b) { b.onclick = async function (ev) { ev.preventDefault(); var r = await sb.from("msb_pedidos").update({visto_em: new Date().toISOString()}).eq("id", Number(b.dataset.pv)); if (r.error) return status(false, "⚠ " + falhou(r.error)); carregarAvisos(); }; });
    var t = $("#aviTudo"); if (t) t.onclick = function () { aviVisto(porLer.map(function (a) { return a.id; })); };
  } catch (e) { box.innerHTML = "<div class='bad'>" + esc(falhou(e)) + "</div>"; }
}
async function aviVisto(ids) {
  var u = await sb.auth.getUser(), quem = (u.data && u.data.user && u.data.user.email) || "";
  var r = await sb.from("msb_avisos").update({lido_em: new Date().toISOString(), lido_por: quem}).in("id", ids);
  if (r.error) return status(false, "⚠ " + falhou(r.error));
  carregarAvisos(); aviSelo();
}
