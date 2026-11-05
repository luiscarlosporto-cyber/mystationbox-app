/* mystationbox · preços semanais da Repsol para a ENSE (03/11/2026).
 * O PDF «Alterações Preços.PDF» (SGP_DADOS_MESTRE@repsol.com, ao sábado) traz o preço de referência e o preço reduzido
 * de cada combustível e a data de entrada em vigor. Na ENSE (Balcão Único → Comercialização → Registo de preços praticados)
 * comunica-se o **Preço Reduzido (c/IVA)** — confirmado com o registo da ENSE de 02/11/2026.
 * Aqui: ler o PDF (MOTOR.lerPrecosRepsol, igual ao Python), guardar o original, mostrar o quadro para a ENSE com a semana
 * anterior e marcar como comunicado (quem e quando). As garrafas de gás não vêm no PDF: na ENSE ficam como estão. */
"use strict";
var PRE_ORDEM = ["Gasóleo rodoviário submetido a processo de aditivação suplementar", "Gasóleo simples", "Gasolina I.O. 95 submetido a processo de aditivação suplementar", "Gasolina I.O. 98 submetido a processo de aditivação suplementar", "Gasolina simples 95"];
var PRE_CURTO = {"Gasóleo rodoviário submetido a processo de aditivação suplementar": "Gasóleo aditivado", "Gasóleo simples": "Gasóleo simples", "Gasolina I.O. 95 submetido a processo de aditivação suplementar": "Gasolina 95 aditivada", "Gasolina I.O. 98 submetido a processo de aditivação suplementar": "Gasolina 98 aditivada", "Gasolina simples 95": "Gasolina simples 95", "GPL Auto": "GPL Auto (Autogás)", "Gasóleo 100% Renovável - B100": "Diesel Nexa 100% renovável"};
var PRE_CAMPOS = PRE_ORDEM;   // campos desta estação: os que aparecem nos PDF guardados (Penafiel tem também GPL Auto e Nexa)
function camposDe(L) { var v = {}; L.forEach(function (x) { (x.produtos || []).forEach(function (p) { if (p.ense) v[p.ense] = 1; }); });
  var o = PRE_ORDEM.filter(function (c) { return v[c]; }); Object.keys(v).forEach(function (c) { if (o.indexOf(c) < 0) o.push(c); }); return o.length ? o : PRE_ORDEM; }
var PRE_ALERTA = 100;   // variação semanal acima de 0,100 €/L → aviso
function m3(v) { return v == null ? "—" : (v / 1000).toFixed(3).replace(".", ","); }
function m4(v) { return v == null ? "—" : (v / 1000).toFixed(4).replace(".", ","); }
function porCampo(prods) { var o = {}; (prods || []).forEach(function (p) { if (p.ense) o[p.ense] = p.preco; }); return o; }
function ehPrecosPdf(txt) { return /ZRPT_PRECOS_DESCONTO/.test(txt); }

async function lerPdfPrecos(f) {
  var bytes = new Uint8Array(await f.arrayBuffer()), pags = await MOTOR.pdfPaginas(bytes, inflar);
  var L = []; pags.forEach(function (p) { p.forEach(function (l) { L.push(l); }); });
  var r = MOTOR.lerPrecosRepsol(L), est = ESTS.find(function (x) { return x.id === EST; }) || {};
  if (!est.posto_repsol) throw new Error("A loja aberta não tem o posto Repsol configurado: não posso confirmar que o PDF é dela.");
  if (r.posto && r.posto !== est.posto_repsol) {
    var outra = ESTS.find(function (x) { return x.posto_repsol === r.posto; });
    throw new Error("Este PDF é do posto " + r.posto + (outra ? " (" + outra.name + ")" : "") + ". Mude a loja no cabeçalho e carregue de novo.");
  }
  return {r: r, bytes: bytes};
}

async function importarPrecos(f) {
  if (PAGINA !== "pre") ir("pre");
  var box = $("#preMsg"); box.hidden = false; box.className = "aviso"; box.innerHTML = "⏳ A ler " + esc(f.name) + "…";
  try {
    var x = await lerPdfPrecos(f), r = x.r, erros = r.verificacoes.filter(function (v) { return v.nivel === "erro"; });
    if (erros.length) { box.innerHTML = "<b>❌ " + esc(f.name) + ": não foi gravado.</b>" + erros.map(function (e) { return "<div>• " + esc(e.texto) + "</div>"; }).join(""); return; }
    var ex = await sb.from("msb_precos").select("dia,estado,produtos").eq("estacao", EST).eq("dia", r.vigor).maybeSingle();
    if (ex.error) throw ex.error;
    if (ex.data && ex.data.estado === "comunicado") {
      var igual = JSON.stringify(porCampo(ex.data.produtos)) === JSON.stringify(porCampo(r.produtos));
      box.innerHTML = (igual ? "✔ Os preços em vigor a " + dmy(r.vigor) + " já estão registados e comunicados à ENSE (iguais a este PDF)." : "<b>⚠ Já há preços em vigor a " + dmy(r.vigor) + " comunicados à ENSE, diferentes deste PDF.</b> Não foram substituídos. Confirme qual é o PDF certo com a Repsol.");
      carregarPrecos(); return;
    }
    var h = await sha(x.bytes), caminho = EST + "/precos/precos_" + r.vigor + "_" + h + ".pdf";
    await guardarOriginal(caminho, new Blob([x.bytes], {type: "application/pdf"}), "application/pdf");
    var g = await sb.from("msb_precos").upsert({estacao: EST, dia: r.vigor, hora: r.hora || "00:00", produtos: r.produtos, original: caminho, hash: h, fonte: f.name}, {onConflict: "estacao,dia"});
    if (g.error) throw g.error;
    box.className = "msgOk"; box.innerHTML = "✔ Preços em vigor a " + dmy(r.vigor) + " às " + esc(r.hora) + " guardados (" + r.produtos.length + " combustíveis).";
    carregarPrecos();
  } catch (e) { box.className = "aviso"; box.innerHTML = "<div class='bad'>✖ " + esc(f.name) + ": " + esc(falhou(e)) + "</div>"; }
}

async function carregarPrecos() {
  var corpo = $("#preCorpo"); corpo.innerHTML = "<div class='mut'>A carregar…</div>";
  try {
    var q = await sb.from("msb_precos").select("dia,hora,produtos,estado,ense,comunicado_em,comunicado_por,original,fonte,aprovado_em,aprovado_por,ense_tentado_em,ense_erro").eq("estacao", EST).order("dia", {ascending: false}).limit(26);
    if (q.error) throw q.error;
    var L = q.data || [];
    if (!L.length) { corpo.innerHTML = "<div class='card' style='padding:14px'><b>Ainda não há preços guardados.</b><p class='mut'>Carregue o PDF «Alterações Preços» que a Repsol envia ao sábado (📄 aqui em cima ou 📥 Carregar no cabeçalho).</p></div>"; return; }
    PRE_CAMPOS = camposDe(L);
    var h = "", pend = L.filter(function (x) { return x.estado !== "comunicado"; }).sort(function (a, b) { return a.dia < b.dia ? -1 : 1; });
    pend.forEach(function (x) { h += quadroENSE(x, L); });
    h += "<div class='card' style='padding:14px'><h2>📋 Histórico de preços <span class='mut' style='font-weight:400;font-size:13px'>Preço Reduzido c/IVA, €/L</span></h2><div class='sc'><table><thead><tr><th class='l'>Em vigor</th>" +
      PRE_CAMPOS.map(function (c) { return "<th>" + esc(PRE_CURTO[c]) + "</th>"; }).join("") + "<th class='l'>ENSE</th><th></th></tr></thead><tbody>" +
      L.map(function (x, i) { var p = porCampo(x.produtos), a = L[i + 1] ? porCampo(L[i + 1].produtos) : {};
        return "<tr><td class='l'>" + dmy(x.dia) + " " + esc(x.hora || "") + "</td>" + PRE_CAMPOS.map(function (c) { var d = a[c] != null && p[c] != null ? p[c] - a[c] : null;
          return "<td class='n'>" + m3(p[c]) + (d ? " <small style='color:" + (d > 0 ? "var(--bad)" : "var(--ok)") + "'>" + (d > 0 ? "▲" : "▼") + "</small>" : "") + "</td>"; }).join("") +
          "<td class='l'>" + (x.estado === "comunicado" ? "<span class='ok'>✔ " + (x.comunicado_em ? new Date(x.comunicado_em).toLocaleDateString("pt-PT") : "") + "</span>" + (x.comunicado_por ? " <small class='mut'>" + esc(x.comunicado_por) + "</small>" : "") : "<b style='color:var(--laranja)'>⏳ por comunicar</b>") + "</td>" +
          "<td>" + (x.original ? "<button class='mini' data-orig='" + esc(x.original) + "'>PDF</button>" : "") + "</td></tr>"; }).join("") + "</tbody></table></div>" +
      "<p class='mut' style='margin:6px 0 0;font-size:13px'>" + (L.some(function (x) { return (x.produtos || []).some(function (p) { return p.fora; }); }) ? "O AdBlue a granel vem no PDF mas não se comunica à ENSE. " : "") + "▲ subiu · ▼ desceu face à semana anterior. As garrafas de gás não vêm no PDF da Repsol: na ENSE ficam com o último valor registado.</p></div>";
    corpo.innerHTML = h;
    $$("#preCorpo [data-orig]").forEach(function (b) { b.onclick = function () { abrirOriginal(b.dataset.orig); }; });
    $$("#preCorpo [data-apr]").forEach(function (b) { b.onclick = function () { aprovarOctan(b.dataset.apr); }; });
    $$("#preCorpo [data-com]").forEach(function (b) { b.onclick = function () { marcarComunicado(b.dataset.com, L.find(function (x) { return x.dia === b.dataset.com; })); }; });
  } catch (e) { corpo.innerHTML = "<div class='bad'>" + esc(falhou(e)) + "</div>"; }
}

/* Quadro para preencher a ENSE: campo, valor a escrever (4 casas, como no formulário), semana anterior, diferença, avisos. */
function quadroENSE(x, L) {
  var ant = L.filter(function (y) { return y.dia < x.dia; })[0], p = porCampo(x.produtos), a = ant ? porCampo(ant.produtos) : {}, avisos = [];
  PRE_CAMPOS.forEach(function (c) { if (p[c] == null) avisos.push("Falta o preço de «" + PRE_CURTO[c] + "» no PDF."); else if (a[c] != null && Math.abs(p[c] - a[c]) > PRE_ALERTA) avisos.push(PRE_CURTO[c] + ": variação de " + m3(p[c] - a[c]) + " €/L numa semana. Confirme no PDF."); });
  var hoje = new Date().toISOString().slice(0, 10);
  if (x.dia < hoje) avisos.push("A data em vigor (" + dmy(x.dia) + ") já passou.");
  return "<div class='card' style='padding:14px;border:2px solid var(--laranja)'><h2>📝 Para comunicar à ENSE · em vigor a " + dmy(x.dia) + " " + esc(x.hora || "00:00") + "</h2>" +
    "<p class='mut' style='margin:0 0 6px;font-size:13px'>Balcão Único → Comercialização → Registo de preços praticados → + Novo registo → instalação → Criar. Data em vigor: <b>" + dmy(x.dia) + " " + esc(x.hora || "00:00") + "</b>.</p>" +
    "<div class='sc'><table><thead><tr><th class='l'>Campo na ENSE</th><th>Escrever</th><th>Semana anterior</th><th>Diferença</th><th class='l'>No PDF da Repsol</th></tr></thead><tbody>" +
    PRE_CAMPOS.map(function (c) { var pr = (x.produtos || []).find(function (y) { return y.ense === c; }) || {}, d = p[c] != null && a[c] != null ? p[c] - a[c] : null;
      return "<tr><td class='l'>" + esc(c) + "</td><td class='n'><b>" + m4(p[c]) + "</b></td><td class='n'>" + m3(a[c]) + "</td><td class='n'>" + (d == null ? "—" : (d > 0 ? "+" : "") + m3(d)) + "</td><td class='l'>" + esc(pr.pdf || "—") + " <small class='mut'>ref. " + m3(pr.ref) + "</small></td></tr>"; }).join("") +
    "</tbody></table></div>" + (avisos.length ? avisos.map(function (t) { return "<div class='aviso' style='margin-top:6px'>⚠ " + esc(t) + "</div>"; }).join("") : "<div class='msgOk' style='margin-top:6px'>✔ Todos os campos com preço; variações normais face à semana anterior.</div>") +
    (ADMIN ? octanEstado(x) + "<div class='bar' style='margin-top:8px'>" + octanBotao(x) + "<button class='btn' data-com='" + x.dia + "'>✔ Já gravei na ENSE</button></div>" : "") + "</div>";
}

/* OCTAN AI: a aprovação aqui autoriza UMA gravação na ENSE; o PC verifica de 15 em 15 minutos. */
function octanEstado(x) {
  if (x.ense_erro) return "<div class='bad' style='margin-top:6px'>❌ O OCTAN AI não confirmou a gravação: " + esc(x.ense_erro) + "<br>Vê na ENSE se ficou gravado antes de tentar outra vez.</div>";
  if (x.ense_tentado_em) return "<div class='aviso' style='margin-top:6px'>⏳ O OCTAN AI está a gravar na ENSE.</div>";
  if (x.aprovado_em) return "<div class='aviso' style='margin-top:6px'>⏳ Aprovado por " + esc(x.aprovado_por || "") + ". O OCTAN AI grava nos próximos 15 minutos.</div>";
  return "";
}
function octanBotao(x) {
  if (x.ense_erro) return "<button class='btn p' data-apr='" + x.dia + "'>↻ Verifiquei: tentar outra vez</button>";
  return x.aprovado_em ? "" : "<button class='btn p' data-apr='" + x.dia + "'>🤖 Aprovar: OCTAN AI grava na ENSE</button>";
}
async function aprovarOctan(dia) {
  if (!confirm("Aprovas estes preços? O OCTAN AI vai gravá-los na ENSE com a data em vigor de " + dmy(dia) + ".")) return;
  var r = await sb.from("msb_precos").update({aprovado_em: new Date().toISOString(), aprovado_por: (PERFIL && PERFIL.display_name) || "", ense_tentado_em: null, ense_erro: null}).eq("estacao", EST).eq("dia", dia).eq("estado", "lido");
  if (r.error) { status(false, falhou(r.error)); return; }
  status(true, "Aprovado ✓"); carregarPrecos();
}

async function marcarComunicado(dia, x) {
  if (!confirm("Confirma que os preços em vigor a " + dmy(dia) + " já foram gravados na ENSE, iguais ao quadro?")) return;
  var r = await sb.from("msb_precos").update({estado: "comunicado", comunicado_em: new Date().toISOString(), comunicado_por: (PERFIL && PERFIL.display_name) || "", ense: {combustiveis: porCampo(x.produtos)}}).eq("estacao", EST).eq("dia", dia);
  if (r.error) { status(false, falhou(r.error)); return; }
  status(true, "Preços de " + dmy(dia) + " marcados como comunicados à ENSE ✓"); carregarPrecos();
}
$("#bPre").onclick = function () { $("#fPre").click(); };
$("#fPre").onchange = function () { var f = this.files[0]; this.value = ""; if (f) importarPrecos(f); };
