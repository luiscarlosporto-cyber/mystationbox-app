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
var AVI_PRECOS = [];
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
  return "<div class='aviso'>⏳ " + esc(aviLoja(x.estacao)) + " · preços de " + dmy(x.dia) + (x.ense_tentado_em ? ": a gravar na ENSE." : ": aprovados. O OCTAN AI grava nos próximos 15 minutos.") + "</div>";
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
/* número no botão Início, atualizado de 5 em 5 minutos enquanto a app está aberta */
async function aviSelo() {
  if (typeof ADMIN === "undefined" || !ADMIN) return;
  try {
    var P = await precosPorAprovar(), L = await avisosRecentes(60), n = P.length + L.filter(function (a) { return !a.lido_em && a.nivel !== "info"; }).length;
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
    h += L.map(function (a) {
      var n = AVI_NIVEL[a.nivel] || ["", a.nivel], novo = !a.lido_em && a.nivel !== "info";
      return "<div class='card' style='padding:12px 14px" + (novo ? "" : ";opacity:.72") + "'><b>" + n[0] + " " + esc(a.titulo) + "</b>" +
        "<div class='mut'>" + esc(aviLoja(a.estacao)) + " · " + n[1] + " · " + aviDataHora(a.criado) + (a.lido_em ? " · visto por " + esc(a.lido_por || "") : "") + "</div>" +
        (a.detalhe ? "<div style='white-space:pre-wrap;margin-top:6px'>" + esc(a.detalhe) + "</div>" : "") +
        (novo ? "<div style='margin-top:8px'><button class='btn' data-avi='" + a.id + "'>✔ Visto</button></div>" : "") + "</div>";
    }).join("");
    box.innerHTML = h + aviHistorico();
    $$("#aviCorpo [data-aprova]").forEach(function (b) { b.onclick = function () { var k = b.dataset.aprova.split("|"); aviAprovar(k[0], k[1]); }; });
    $$("#aviCorpo [data-avi]").forEach(function (b) { b.onclick = function () { aviVisto([Number(b.dataset.avi)]); }; });
    var t = $("#aviTudo"); if (t) t.onclick = function () { aviVisto(porLer.map(function (a) { return a.id; })); };
  } catch (e) { box.innerHTML = "<div class='bad'>" + esc(falhou(e)) + "</div>"; }
}
async function aviVisto(ids) {
  var u = await sb.auth.getUser(), quem = (u.data && u.data.user && u.data.user.email) || "";
  var r = await sb.from("msb_avisos").update({lido_em: new Date().toISOString(), lido_por: quem}).in("id", ids);
  if (r.error) return status(false, "⚠ " + falhou(r.error));
  carregarAvisos(); aviSelo();
}
