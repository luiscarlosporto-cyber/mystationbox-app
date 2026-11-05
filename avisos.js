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
/* cartão do Início */
async function cartaoAvisos() {
  var L = await avisosRecentes(60);
  if (!L.length) return "";
  var porLer = L.filter(function (a) { return !a.lido_em && a.nivel !== "info"; }), erro = porLer.some(function (a) { return a.nivel === "erro"; }), p = aviParado(L);
  var mau = porLer.find(function (a) { return a.nivel === "erro"; }) || porLer[0];
  var t = p ? "O OCTAN AI não corre desde " + aviDataHora(p.criado) : mau ? mau.titulo : "Sem nada por ver";
  return cartao("avi", "OCTAN AI", String(porLer.length), esc(t), erro || p || porLer.length ? "al" : "ok");
}
async function carregarAvisos() {
  var box = $("#aviCorpo"); box.innerHTML = "<div class='mut'>A carregar…</div>";
  try {
    var L = await avisosRecentes(100), p = aviParado(L), h = "";
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
    box.innerHTML = h;
    $$("#aviCorpo [data-avi]").forEach(function (b) { b.onclick = function () { aviVisto([Number(b.dataset.avi)]); }; });
    var t = $("#aviTudo"); if (t) t.onclick = function () { aviVisto(porLer.map(function (a) { return a.id; })); };
  } catch (e) { box.innerHTML = "<div class='bad'>" + esc(falhou(e)) + "</div>"; }
}
async function aviVisto(ids) {
  var u = await sb.auth.getUser(), quem = (u.data && u.data.user && u.data.user.email) || "";
  var r = await sb.from("msb_avisos").update({lido_em: new Date().toISOString(), lido_por: quem}).in("id", ids);
  if (r.error) return status(false, "⚠ " + falhou(r.error));
  carregarAvisos();
}
