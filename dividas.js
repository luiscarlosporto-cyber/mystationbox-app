/* mystationbox · Gestão → Equipa → Acordos de dívida (16/11/2026, proposta aceite pelo dono). Só administradores.
 * O administrador valida cada pagamento (data, valor, meio); a app grava, numera o recibo e gera o PDF com a rubrica do
 * gerente (a mesma do mapa de kms, msb_kms_config). O PDF fica guardado no arquivo privado e o dono envia-o pelo WhatsApp
 * (Partilhar no telemóvel; no computador descarrega). Nada se apaga: um engano anula-se com motivo.
 * Regras (plano, estado, extenso, sugestões do extrato) em dividas_regras.js. Dados pessoais só na base de dados. */
"use strict";
var DIV = {acordos: [], pag: {}, mov: {}, docs: {}, assin: null, blobs: {}, aberto: {}};
function falhouDiv(e) { var m = falhou(e); return /msb_dividas|does not exist|schema cache|42P01|PGRST205/i.test(m + " " + (e && e.code || "")) ? "Os acordos de dívida ainda não estão ativos na base de dados." : m; }
function eurDiv(c) { return DIVIDAS.eur(c); }
function nomeLojaDiv(id) { var e = (window.ESTS || []).find(function (x) { return x.id === id; }); return e ? (e.short_name || e.name) : id; }

async function carregarDividas() {
  var box = $("#divCorpo"); box.innerHTML = "<div class='mut'>A carregar…</div>";
  try {
    var r = await sb.from("msb_dividas").select("*").order("id"); if (r.error) throw r.error;
    DIV.acordos = r.data || [];
    if (!DIV.acordos.length) { box.innerHTML = "<div class='card' style='padding:14px'>Não há acordos de dívida registados.</div>"; return; }
    var ids = DIV.acordos.map(function (a) { return a.id; });
    var p = await sb.from("msb_dividas_pagamentos").select("*").in("divida_id", ids).order("data").order("id"); if (p.error) throw p.error;
    DIV.pag = {}; (p.data || []).forEach(function (x) { (DIV.pag[x.divida_id] = DIV.pag[x.divida_id] || []).push(x); });
    var k = await sb.from("msb_kms_config").select("assinatura").eq("id", 1).maybeSingle(); DIV.assin = k.data ? k.data.assinatura : null;
    await Promise.all(DIV.acordos.map(lerExtratoDiv).concat(DIV.acordos.map(lerDocsDiv)));
    desenharDividas();
  } catch (e) { box.innerHTML = "<div class='card msgErr' style='padding:12px'>✖ " + esc(falhouDiv(e)) + "</div>"; }
}
/* créditos do banco com o apelido do devedor, desde o primeiro mês (sugestões; o dono confirma) */
async function lerExtratoDiv(a) {
  DIV.mov[a.id] = [];
  var ap = a.devedor.normalize("NFD").replace(/[̀-ͯ]/g, "").split(/\s+/).filter(function (w) { return w.length >= 4; }).pop(); if (!ap) return;
  var raiz = ap.slice(0, 6);
  var r = await sb.from("msb_extratos").select("id,dia,valor_c,descricao,contraparte").eq("estacao", a.estacao).gt("valor_c", 0).gte("dia", a.primeiro_mes + "-01")
    .or("descricao.ilike.%" + raiz + "%,contraparte.ilike.%" + raiz + "%").order("dia").limit(200);
  if (!r.error) DIV.mov[a.id] = DIVIDAS.sugerir(r.data, a.devedor, a.primeiro_mes, DIV.pag[a.id]);
}

function desenharDividas() {
  var hoje = hojeISO(0);
  $("#divCorpo").innerHTML = DIV.acordos.map(function (a) {
    var P = DIV.pag[a.id] || [], E = DIVIDAS.estado(a, P, hoje), prox = E.proxima, ab = DIV.aberto[a.id];
    var est = E.falta_c === 0 ? "<span class='b ok'>✅ Liquidada</span>" : E.atrasadas.length ? "<span class='b bad'>❌ " + E.atrasadas.length + " em atraso · " + eurDiv(E.em_atraso_c) + "</span>" : "<span class='b ok'>✅ Em dia</span>";
    var linhas = ab ? E.linhas : E.linhas.filter(function (x) { return x.estado !== "por pagar"; }).concat(E.linhas.filter(function (x) { return x.estado === "por pagar"; }).slice(0, 2));
    var nomeEst = {paga: "✅ paga", parcial: "◐ parcial", atraso: "❌ em atraso", "por pagar": "por pagar"};
    var sug = DIV.mov[a.id] || [];
    return "<div class='card' style='padding:14px;display:grid;gap:12px'>" +
      "<div class='bar' style='justify-content:space-between'><div><b style='font-size:17px'>" + esc(a.devedor) + "</b><div class='mut' style='font-size:13px'>" + esc(nomeLojaDiv(a.estacao)) + " · acordo desde " + esc(nomeMes(a.primeiro_mes)) + " · vence ao dia " + a.dia_venc + "</div></div>" + est + "</div>" +
      "<div style='display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px'>" +
        [["Dívida", a.total_c], ["Pago", E.pago_c], ["Em falta", E.falta_c]].map(function (m) { return "<div class='card' style='padding:10px'><div class='mut' style='font-size:12px'>" + m[0] + "</div><b style='font-size:17px'>" + eurDiv(m[1]) + "</b></div>"; }).join("") +
        (prox ? "<div class='card' style='padding:10px'><div class='mut' style='font-size:12px'>Próxima</div><b style='font-size:15px'>n.º " + prox.n + " · " + dmy(prox.vence) + "</b><div class='mut' style='font-size:12px'>" + eurDiv(prox.valor_c - prox.pago_c) + "</div></div>" : "") + "</div>" +
      (sug.length ? "<div class='card' style='padding:10px;border:1px solid #f0b429'><b>ℹ️ No extrato do banco há " + (sug.length === 1 ? "1 entrada" : sug.length + " entradas") + " que parece" + (sug.length === 1 ? "" : "m") + " do " + esc(a.devedor.split(" ")[0]) + "</b>" +
        sug.map(function (m) { return "<div class='bar' style='margin-top:6px'><span>" + dmy(m.dia) + " · <b>" + eurDiv(m.valor_c) + "</b> · <span class='mut'>" + esc((m.descricao || "") + " " + (m.contraparte || "")) + "</span></span><button class='btn divUsar' data-a='" + a.id + "' data-m='" + m.id + "'>Usar no pagamento</button></div>"; }).join("") + "</div>" : "") +
      docsDiv(a) +
      (E.falta_c > 0 ? formPagDiv(a, prox) : "") +
      "<div class='sc'><table><thead><tr><th class='l'>N.º</th><th class='l'>Mês</th><th class='l'>Vence</th><th>Valor</th><th>Pago</th><th class='l'>Estado</th></tr></thead><tbody>" +
        linhas.map(function (x) { return "<tr><td class='l'>" + x.n + "</td><td class='l'>" + esc(nomeMes(x.mes)) + "</td><td class='l'>" + dmy(x.vence) + "</td><td class='n'>" + eurDiv(x.valor_c) + "</td><td class='n'>" + (x.pago_c ? eurDiv(x.pago_c) : "") + "</td><td class='l'>" + nomeEst[x.estado] + "</td></tr>"; }).join("") +
      "</tbody></table></div>" +
      "<div><button class='btn divTodas' data-a='" + a.id + "'>" + (ab ? "Mostrar só as recentes" : "Ver as " + E.linhas.length + " prestações") + "</button></div>" +
      "<b>Pagamentos validados</b>" + (P.length ? "<div class='sc'><table><thead><tr><th class='l'>Recibo</th><th class='l'>Data</th><th>Valor</th><th class='l'>Meio</th><th class='l'>Validado</th><th class='l'></th></tr></thead><tbody>" +
        P.slice().reverse().map(function (p) { var n = DIVIDAS.numeroRecibo(p.recibo_ano, p.recibo_seq), an = !!p.anulado_em;
          return "<tr" + (an ? " style='opacity:.6'" : "") + "><td class='l'><b>" + n + "</b>" + (an ? " <span class='b bad'>ANULADO</span>" : "") + "</td><td class='l'>" + dmy(p.data) + "</td><td class='n'>" + eurDiv(p.valor_c) + "</td><td class='l'>" + (p.meio === "numerario" ? "Numerário" : "Transferência") + (p.nota ? " · <span class='mut'>" + esc(p.nota) + "</span>" : "") + "</td>" +
            "<td class='l mut' style='font-size:12px'>" + esc(p.validado_por) + "<br>" + new Date(p.validado_em).toLocaleString("pt-PT") + (an ? "<br>anulado por " + esc(p.anulado_por) + ": " + esc(p.anulado_motivo) : "") + "</td>" +
            "<td class='l'><div class='bar'><button class='btn az divPart' data-p='" + p.id + "'>" + (navigator.canShare ? "📤 Partilhar" : "📄 Recibo") + "</button>" + (navigator.canShare ? "<button class='btn divPdf' data-p='" + p.id + "'>📄</button>" : "") + (an ? "" : "<button class='btn divAnular' data-p='" + p.id + "'>Anular</button>") + "</div></td></tr>"; }).join("") +
        "</tbody></table></div>" : "<div class='mut'>Ainda não há pagamentos validados.</div>") +
      "<div id='divMsg" + a.id + "'></div>" +
      "<p class='mut' style='margin:0;font-size:12px'>Recibo de quitação: prova o pagamento ao devedor. Não é fatura nem documento fiscal." + (DIV.assin ? "" : " ⚠️ Falta a rubrica do gerente (Documentos → Mapa de kms do gerente).") + "</p></div>";
  }).join("");
  $$("#divCorpo .divTodas").forEach(function (b) { b.onclick = function () { DIV.aberto[b.dataset.a] = !DIV.aberto[b.dataset.a]; desenharDividas(); }; });
  $$("#divCorpo .divValidar").forEach(function (b) { b.onclick = function () { validarPagDiv(+b.dataset.a); }; });
  $$("#divCorpo .divUsar").forEach(function (b) { b.onclick = function () { usarExtratoDiv(+b.dataset.a, +b.dataset.m); }; });
  $$("#divCorpo .divPart").forEach(function (b) { b.onclick = function () { partilharReciboDiv(+b.dataset.p, b, !!navigator.canShare); }; });
  $$("#divCorpo .divPdf").forEach(function (b) { b.onclick = function () { partilharReciboDiv(+b.dataset.p, b, false); }; });
  $$("#divCorpo .divAnular").forEach(function (b) { b.onclick = function () { anularPagDiv(+b.dataset.p); }; });
  $$("#divCorpo .divDocBtn").forEach(function (b) { b.onclick = function () { $("#divDocF" + b.dataset.a).click(); }; });
  $$("#divCorpo .divDocF").forEach(function (i) { i.onchange = function () { var f = Array.from(this.files); this.value = ""; if (f.length) carregarDocsDiv(+i.dataset.a, f); }; });
  $$("#divCorpo .divDocAbrir").forEach(function (b) { b.onclick = function () { abrirOriginal(b.dataset.c); }; });
}
/* Documentos do acordo (16/11/2026, pedido do dono): declaração assinada, comprovativos, outros. Ficam no arquivo privado,
   pasta <estação>/dividas/<acordo>/docs/, com a data no nome; nunca se substituem nem se apagam. */
var TIPOS_DOC_DIV = [["declaracao", "Declaração assinada"], ["comprovativo", "Comprovativo de pagamento"], ["outro", "Outro documento"]];
function pastaDocsDiv(a) { return a.estacao + "/dividas/" + a.id + "/docs"; }
async function lerDocsDiv(a) {
  var r = await sb.storage.from("msb-originais").list(pastaDocsDiv(a), {limit: 200, sortBy: {column: "name", order: "desc"}});
  DIV.docs[a.id] = r.error ? null : (r.data || []).filter(function (f) { return f.name && f.id; });
}
function nomeDocDiv(n) {   // 20261116-164700_declaracao_Acordo.pdf → tipo, data, nome
  var m = /^(\d{8})-(\d{6})_([a-z]+)_(.*)$/.exec(n); if (!m) return {tipo: "", data: "", nome: n};
  var t = TIPOS_DOC_DIV.find(function (x) { return x[0] === m[3]; });
  return {tipo: t ? t[1] : m[3], data: m[1].slice(6) + "/" + m[1].slice(4, 6) + "/" + m[1].slice(0, 4), nome: m[4].replace(/_/g, " ")};
}
function docsDiv(a) {
  var L = DIV.docs[a.id];
  return "<div class='card' style='padding:12px;display:grid;gap:8px'><div class='bar' style='justify-content:space-between'><b>📎 Documentos do acordo</b>" +
    (a.declaracao ? "<span class='b ok'>✅ Declaração assinada guardada</span>" : "<span class='b wn'>⚠️ Falta a declaração assinada</span>") + "</div>" +
    (L === null ? "<div class='mut'>Não consegui ler a lista de documentos.</div>" : !L || !L.length ? "<div class='mut'>Ainda não há documentos.</div>" :
      L.map(function (f) { var d = nomeDocDiv(f.name), kb = f.metadata && f.metadata.size ? Math.round(f.metadata.size / 1024) : 0;
        return "<div class='bar' style='justify-content:space-between'><span>📄 <b>" + esc(d.tipo || "Documento") + "</b> · " + esc(d.nome) + " <span class='mut' style='font-size:12px'>" + esc(d.data) + (kb ? " · " + (kb > 1024 ? (kb / 1024).toFixed(1).replace(".", ",") + " MB" : kb + " KB") : "") + "</span></span>" +
          "<button class='btn divDocAbrir' data-c='" + esc(pastaDocsDiv(a) + "/" + f.name) + "'>Abrir</button></div>"; }).join("")) +
    "<div class='bar'><select id='divDocT" + a.id + "'>" + TIPOS_DOC_DIV.map(function (t) { return "<option value='" + t[0] + "'" + (!a.declaracao && t[0] === "declaracao" ? " selected" : a.declaracao && t[0] === "comprovativo" ? " selected" : "") + ">" + t[1] + "</option>"; }).join("") + "</select>" +
    "<button class='btn divDocBtn' data-a='" + a.id + "'>⬆️ Carregar documento (PDF ou fotografia)</button><input type='file' class='divDocF' id='divDocF" + a.id + "' data-a='" + a.id + "' accept='application/pdf,image/*' multiple hidden></div>" +
    "<div id='divDocMsg" + a.id + "'></div></div>";
}
async function carregarDocsDiv(aid, ficheiros) {
  var a = DIV.acordos.find(function (x) { return x.id === aid; }), tipo = $("#divDocT" + aid).value, msg = $("#divDocMsg" + aid), feitos = 0;
  try {
    for (var i = 0; i < ficheiros.length; i++) {
      var f = ficheiros[i];
      if (f.size > 20 * 1024 * 1024) throw new Error("«" + f.name + "» tem mais de 20 MB.");
      if (!/^(application\/pdf|image\/)/.test(f.type)) throw new Error("«" + f.name + "» não é PDF nem fotografia.");
      msg.innerHTML = "<span class='mut'>A carregar " + (i + 1) + " de " + ficheiros.length + "…</span>";
      var agora = new Date(), carimbo = agora.getFullYear() + String(agora.getMonth() + 1).padStart(2, "0") + String(agora.getDate()).padStart(2, "0") + "-" + [agora.getHours(), agora.getMinutes(), agora.getSeconds()].map(function (n) { return String(n).padStart(2, "0"); }).join("") + (i ? String(i) : "");
      var limpo = f.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9.\-]+/g, "_").replace(/_+/g, "_").slice(-80);
      var cam = pastaDocsDiv(a) + "/" + carimbo + "_" + tipo + "_" + limpo;
      await guardarOriginal(cam, f, f.type);
      if (tipo === "declaracao" && !a.declaracao) { var u = await sb.from("msb_dividas").update({declaracao: cam}).eq("id", aid); if (u.error) throw u.error; a.declaracao = cam; }
      feitos++;
    }
    await lerDocsDiv(a); desenharDividas();
    $("#divDocMsg" + aid).innerHTML = "<span class='ok'>✔ " + (feitos === 1 ? "Documento guardado." : feitos + " documentos guardados.") + "</span>";
  } catch (e) { await lerDocsDiv(a); desenharDividas(); $("#divDocMsg" + aid).innerHTML = "<span class='bad'>✖ " + esc(falhouDiv(e)) + (feitos ? " (" + feitos + " já guardado" + (feitos > 1 ? "s" : "") + ")" : "") + "</span>"; }
}
function formPagDiv(a, prox) {
  var v = prox ? prox.valor_c - prox.pago_c : 0;
  return "<div class='card' style='padding:12px;display:grid;gap:8px;background:var(--fundo2, #f3f6fb)'><b>Validar pagamento recebido</b>" +
    "<div class='bar'><label>Data <input type='date' id='divData" + a.id + "' value='" + hojeISO(0) + "'></label>" +
    "<label>Valor € <input id='divValor" + a.id + "' class='enseIn' style='width:100px' inputmode='decimal' value='" + (v / 100).toFixed(2).replace(".", ",") + "'></label>" +
    "<label>Meio <select id='divMeio" + a.id + "'><option value='numerario'>Numerário</option><option value='transferencia'>Transferência</option></select></label></div>" +
    "<div class='bar'><input id='divNota" + a.id + "' placeholder='Nota (opcional)' maxlength='300' style='flex:1;min-width:180px'><input type='hidden' id='divExt" + a.id + "' value=''>" +
    "<button class='btn p divValidar' data-a='" + a.id + "'>✔ Validar e gerar recibo</button></div></div>";
}
function usarExtratoDiv(aid, mid) {
  var m = (DIV.mov[aid] || []).find(function (x) { return x.id === mid; }); if (!m) return;
  $("#divData" + aid).value = m.dia; $("#divValor" + aid).value = (m.valor_c / 100).toFixed(2).replace(".", ","); $("#divMeio" + aid).value = "transferencia";
  $("#divExt" + aid).value = String(m.id); $("#divNota" + aid).value = "Extrato " + dmy(m.dia); $("#divValor" + aid).scrollIntoView({behavior: "smooth", block: "center"});
}
function msgDiv(aid, html) { var e = $("#divMsg" + aid); if (e) e.innerHTML = html; }

async function validarPagDiv(aid) {
  var a = DIV.acordos.find(function (x) { return x.id === aid; }), P = DIV.pag[aid] || [];
  var data = $("#divData" + aid).value, valor = Math.round(Number(String($("#divValor" + aid).value).replace(/\s/g, "").replace(",", ".")) * 100), meio = $("#divMeio" + aid).value, nota = $("#divNota" + aid).value.trim(), ext = +$("#divExt" + aid).value || null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data > hojeISO(0)) return msgDiv(aid, "<span class='bad'>✖ Data inválida (não pode ser no futuro).</span>");
  if (!DIVIDAS.cabe(a, P, valor)) return msgDiv(aid, "<span class='bad'>✖ Valor inválido: tem de ser maior que zero e não pode passar o que falta (" + eurDiv(DIVIDAS.estado(a, P, hojeISO(0)).falta_c) + ").</span>");
  if (!await msbConfirma("Validar o pagamento de " + eurDiv(valor) + " de " + a.devedor + ", em " + (meio === "numerario" ? "numerário" : "transferência") + ", a " + dmy(data) + "? Fica registado com o seu nome e é gerado o recibo.", "Validar")) return;
  msgDiv(aid, "<span class='mut'>A gravar…</span>");
  var r = await sb.from("msb_dividas_pagamentos").insert({divida_id: aid, estacao: a.estacao, data: data, valor_c: valor, meio: meio, nota: nota, extrato_id: ext}).select().single();
  if (r.error) return msgDiv(aid, "<span class='bad'>✖ " + esc(falhouDiv(r.error)) + "</span>");
  (DIV.pag[aid] = DIV.pag[aid] || []).push(r.data);
  try { await emitirReciboDiv(r.data); } catch (e) { msbErro && msbErro(e); }
  await carregarDividas();
  msgDiv(aid, "<span class='ok'>✔ Pagamento validado. Recibo " + DIVIDAS.numeroRecibo(r.data.recibo_ano, r.data.recibo_seq) + " pronto: carregue em «" + (navigator.canShare ? "Partilhar" : "Recibo") + "».</span>");
}
/* gera o PDF uma vez e guarda-o no arquivo privado; o emitido nunca se substitui */
async function emitirReciboDiv(p) {
  var bytes = await fazerReciboDiv(p), blob = new Blob([bytes], {type: "application/pdf"}), cam = p.estacao + "/dividas/" + p.divida_id + "/recibo_" + p.recibo_ano + "-" + String(p.recibo_seq).padStart(3, "0") + ".pdf";
  DIV.blobs[p.id] = blob;
  await guardarOriginal(cam, blob, "application/pdf");
  var u = await sb.from("msb_dividas_pagamentos").update({recibo: cam}).eq("id", p.id).select().single(); if (u.error) throw u.error;
  Object.assign(p, u.data); return blob;
}
async function blobReciboDiv(p) {
  if (DIV.blobs[p.id]) return DIV.blobs[p.id];
  if (p.anulado_em) return (DIV.blobs[p.id] = new Blob([await fazerReciboDiv(p)], {type: "application/pdf"}));   // anulado: mostra-se com o carimbo, não se guarda
  if (!p.recibo) return emitirReciboDiv(p);
  var f = await sb.storage.from("msb-originais").download(p.recibo); if (f.error) throw f.error;
  return (DIV.blobs[p.id] = f.data);
}
function pagDiv(pid) { for (var k in DIV.pag) { var p = DIV.pag[k].find(function (x) { return x.id === pid; }); if (p) return p; } return null; }
async function partilharReciboDiv(pid, botao, partilhar) {
  var p = pagDiv(pid), a = DIV.acordos.find(function (x) { return x.id === p.divida_id; }), n = DIVIDAS.numeroRecibo(p.recibo_ano, p.recibo_seq), nome = "Recibo_" + n.replace("/", "-") + "_" + a.devedor.split(" ")[0] + ".pdf";
  try {
    var pronto = !!DIV.blobs[pid], blob = await blobReciboDiv(p);
    var file = new File([blob], nome, {type: "application/pdf"});
    if (partilhar && navigator.canShare && navigator.canShare({files: [file]})) {
      try { await navigator.share({files: [file], title: "Recibo " + n, text: "Recibo do pagamento de " + eurDiv(p.valor_c).replace(/ /g, " ") + " (" + dmy(p.data) + ")."}); return; }
      catch (e) { if (e && e.name === "AbortError") return; if (!pronto && e && e.name === "NotAllowedError") { botao.textContent = "📤 Toque outra vez"; return; } throw e; }
    }
    var url = URL.createObjectURL(blob), l = document.createElement("a"); l.href = url; l.download = nome; document.body.appendChild(l); l.click(); l.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  } catch (e) { msgDiv(p.divida_id, "<span class='bad'>✖ " + esc(falhouDiv(e)) + "</span>"); }
}
async function anularPagDiv(pid) {
  var p = pagDiv(pid), n = DIVIDAS.numeroRecibo(p.recibo_ano, p.recibo_seq);
  var motivo = prompt("Anular o recibo " + n + " (" + eurDiv(p.valor_c).replace(/ /g, " ") + "). O pagamento deixa de contar mas fica no histórico.\n\nMotivo:");
  if (motivo == null) return; motivo = motivo.trim(); if (motivo.length < 3) return msgDiv(p.divida_id, "<span class='bad'>✖ Para anular é preciso escrever o motivo.</span>");
  var r = await sb.from("msb_dividas_pagamentos").update({anulado_motivo: motivo, anulado_em: new Date().toISOString()}).eq("id", pid).select().single();
  if (r.error) return msgDiv(p.divida_id, "<span class='bad'>✖ " + esc(falhouDiv(r.error)) + "</span>");
  delete DIV.blobs[pid]; await carregarDividas(); msgDiv(p.divida_id, "<span class='ok'>✔ Recibo " + n + " anulado.</span>");
}

/* Recibo em PDF A5 ao alto: credora, quem pagou, valor (algarismos e extenso), o que cobre, saldo, data, rubrica do gerente */
async function fazerReciboDiv(p) {
  await carregarPdfLib();
  var a = DIV.acordos.find(function (x) { return x.id === p.divida_id; }), P = DIV.pag[a.id] || [], d = a.dados || {}, cr = d.credora || {}, dv = d.devedor || {};
  var ate = P.filter(function (x) { return !x.anulado_em && (x.data < p.data || (x.data === p.data && x.id <= p.id)); });   // situação logo depois deste pagamento
  var E = DIVIDAS.estado(a, p.anulado_em ? [] : ate, p.data), cobre = DIVIDAS.cobre(a, P, p.id), n = DIVIDAS.numeroRecibo(p.recibo_ano, p.recibo_seq);
  var PL = window.PDFLib, doc = await PL.PDFDocument.create(), F = await doc.embedFont(PL.StandardFonts.Helvetica), B = await doc.embedFont(PL.StandardFonts.HelveticaBold);
  var mm = function (v) { return v * 72 / 25.4; }, W = 148, H = 210, pg = doc.addPage([mm(W), mm(H)]);
  var azul = PL.rgb(0.102, 0.388, 0.91), escuro = PL.rgb(0.043, 0.239, 0.569), tinta = PL.rgb(0.1, 0.13, 0.17), cinz = PL.rgb(0.42, 0.45, 0.5), claro = PL.rgb(0.953, 0.965, 0.984), branco = PL.rgb(1, 1, 1);
  var limpa = function (s) { return String(s == null ? "" : s).replace(/[  ]/g, " ").replace(/[^\x20-\x7E\xA0-\xFF€—–]/g, ""); };
  var txt = function (s, x, y, o) { o = o || {}; var f = o.b ? B : F, sz = o.t || 9, t = limpa(s), w = f.widthOfTextAtSize(t, sz); pg.drawText(t, {x: mm(x) - (o.dir ? w : o.mid ? w / 2 : 0), y: mm(H - y), size: sz, font: f, color: o.c || tinta}); };
  var ret = function (x, y, w, h, cor) { pg.drawRectangle({x: mm(x), y: mm(H - y - h), width: mm(w), height: mm(h), color: cor}); };
  /* parágrafo com partes normais e em negrito, partido em linhas */
  var para = function (partes, x, y, larg, sz, ent) {
    var pal = []; partes.forEach(function (q) { limpa(q[0]).split(" ").forEach(function (w) { if (w) pal.push([w, q[1]]); }); });
    var linha = [], lw = 0, esp = F.widthOfTextAtSize(" ", sz), max = mm(larg);
    var colado = function (w) { return /^[,.;:)]/.test(w[0]); };   // pontuação logo a seguir à palavra anterior, sem espaço
    var deita = function () { var cx = mm(x); linha.forEach(function (w, i) { var f = w[1] ? B : F; if (i && colado(w)) cx -= esp; pg.drawText(w[0], {x: cx, y: mm(H - y), size: sz, font: f, color: tinta}); cx += f.widthOfTextAtSize(w[0], sz) + esp; }); y += ent; linha = []; lw = 0; };
    pal.forEach(function (w) { var ww = (w[1] ? B : F).widthOfTextAtSize(w[0], sz); if (linha.length && lw + esp + ww > max && !colado(w)) deita(); lw += (linha.length && !colado(w) ? esp : 0) + ww; linha.push(w); });
    if (linha.length) deita(); return y;
  };
  ret(0, 0, W, 22, azul);
  txt("Recibo de pagamento", 10, 10, {b: 1, t: 15, c: branco}); txt("Acordo de pagamento de dívida", 10, 16, {t: 8.5, c: PL.rgb(0.85, 0.9, 1)});
  txt("N.º " + n, W - 10, 10, {b: 1, t: 12, c: branco, dir: 1}); txt(dmy(p.data), W - 10, 16, {t: 9, c: branco, dir: 1});
  var y = 31;
  txt(cr.nome || "", 10, y, {b: 1, t: 10}); y += 4.6;
  if (cr.nif) { txt("NIF " + cr.nif, 10, y, {t: 8, c: cinz}); y += 4; }
  if (cr.morada) { y = para([[cr.morada, 0]], 10, y, W - 20, 8, 3.8); }
  if (cr.atividade) { y = para([[cr.atividade, 0]], 10, y, W - 20, 8, 3.8); }
  y += 6;
  y = para([["Recebemos de ", 0], [a.devedor, 1], [(dv.nif ? ", NIF " + dv.nif + "," : "") + " a quantia de ", 0], [eurDiv(p.valor_c), 1], ["(" + DIVIDAS.extenso(p.valor_c) + "),", 0],
    ["paga em " + (p.meio === "numerario" ? "numerário" : "transferência bancária") + " em " + dmy(p.data) + ".", 0]], 10, y, W - 20, 10, 5.2);
  y += 2.5;
  y = para([["Referente a " + (cobre.length ? DIVIDAS.textoCobre(cobre) : "pagamento") + " do plano de pagamento da " + (d.referencia || "declaração de reconhecimento de dívida") + ".", 0]], 10, y, W - 20, 9.5, 5);
  y += 5;
  var linhasR = [["Dívida reconhecida", a.total_c, 0], ["Total pago até esta data", E.pago_c, 0], ["Saldo em dívida", E.falta_c, 1]];
  ret(10, y - 4.5, W - 20, linhasR.length * 6.5 + (E.proxima ? 7 : 2), claro);
  linhasR.forEach(function (l) { txt(l[0], 14, y, {b: l[2], t: 9.5}); txt(eurDiv(l[1]), W - 14, y, {b: l[2], t: l[2] ? 11 : 9.5, dir: 1, c: l[2] ? escuro : tinta}); y += 6.5; });
  if (E.proxima) { txt("Próxima prestação: n.º " + E.proxima.n + ", " + eurDiv(E.proxima.valor_c - E.proxima.pago_c) + ", até " + dmy(E.proxima.vence), 14, y, {t: 8, c: cinz}); y += 7; }
  else { txt("Dívida integralmente paga.", 14, y, {t: 8.5, b: 1, c: escuro}); y += 4; }
  y += 8;
  txt((cr.local || "") + (cr.local ? ", " : "") + dmy(p.data), 10, y, {t: 9.5}); y += 6;
  var cx = W / 2 + 18;
  if (DIV.assin) { var png = await doc.embedPng(DIV.assin), sw = 46, sh = sw * png.height / png.width; if (sh > 20) { sh = 20; sw = sh * png.width / png.height; }
    pg.drawImage(png, {x: mm(cx - sw / 2), y: mm(H - (y + sh)), width: mm(sw), height: mm(sh)}); }
  y += 21;
  pg.drawLine({start: {x: mm(cx - 30), y: mm(H - y)}, end: {x: mm(cx + 30), y: mm(H - y)}, thickness: 0.5, color: cinz});
  txt("Pela credora" + (cr.representante ? " — " + cr.representante : ""), cx, y + 4, {t: 7.5, c: cinz, mid: 1});
  if (cr.cargo) txt(cr.cargo, cx, y + 7.5, {t: 7, c: cinz, mid: 1});
  txt("Recibo de quitação do valor indicado. Não é fatura nem documento fiscal.", 10, H - 14, {t: 6.5, c: cinz});
  txt("Validado por " + p.validado_por + " em " + new Date(p.validado_em).toLocaleString("pt-PT"), 10, H - 10.5, {t: 6.5, c: cinz});
  if (p.anulado_em) {
    pg.drawText("ANULADO", {x: mm(22), y: mm(70), size: 54, font: B, color: PL.rgb(0.8, 0.1, 0.1), opacity: 0.35, rotate: PL.degrees(30)});
    txt("Anulado em " + new Date(p.anulado_em).toLocaleString("pt-PT") + ": " + p.anulado_motivo, 10, H - 17.5, {t: 6.5, c: PL.rgb(0.75, 0.1, 0.1)});
  }
  await marcaPdf(doc, pg, F, B, mm(10), mm(5), 6.5);
  return doc.save();
}

/* para o Painel: prestações em atraso (sem tabelas ainda: não mostra nada) */
async function dividasEmAtraso() {
  try {
    var r = await sb.from("msb_dividas").select("*"); if (r.error || !r.data || !r.data.length) return [];
    var p = await sb.from("msb_dividas_pagamentos").select("divida_id,data,valor_c,id,anulado_em").in("divida_id", r.data.map(function (a) { return a.id; })); if (p.error) return [];
    var hoje = hojeISO(0);
    return r.data.map(function (a) { var E = DIVIDAS.estado(a, (p.data || []).filter(function (x) { return x.divida_id === a.id; }), hoje); return {estacao: a.estacao, devedor: a.devedor, n: E.atrasadas.length, valor_c: E.em_atraso_c}; }).filter(function (x) { return x.n > 0; });
  } catch (e) { return []; }
}
