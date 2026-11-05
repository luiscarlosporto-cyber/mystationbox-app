/* mystationbox · digitalizar faturas de fornecedores (05/11/2026). Fotografia ou PDF → leitor de texto no aparelho e QR fiscal →
 * cartão com a imagem ao lado → correção e visto → original na cloud e leitura em msb_faturas_dig → o PC recebe-a e o OCTAN AI cria o rascunho no CBOS.
 * A leitura só propõe: sem as contas certas e sem visto, nada segue. Fornecedores: M.Cunha e Vendeiro (faturas_ler.js). */
"use strict";
var FD = null, JSQR = null;
function carregarJsQR() {
  if (window.jsQR) return Promise.resolve();
  if (JSQR) return JSQR;
  JSQR = new Promise(function (ok, ko) { var s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js"; s.onload = ok; s.onerror = function () { JSQR = null; ko(new Error("sem leitor de QR")); }; document.head.appendChild(s); });
  return JSQR;
}
async function paginasImagem(f) {   // cada página como imagem, a 300 dpi nos PDF
  if (!/pdf/i.test(f.type) && !/\.pdf$/i.test(f.name)) return [await imagem(f)];
  await carregarPdfJsCBOS();
  var doc = await pdfjsLib.getDocument({data: new Uint8Array(await f.arrayBuffer())}).promise, out = [];
  for (var i = 1; i <= Math.min(doc.numPages, 4); i++) {
    var p = await doc.getPage(i), v = p.getViewport({scale: 1}), esc2 = 2480 / v.width, vp = p.getViewport({scale: esc2}), c = document.createElement("canvas");
    c.width = vp.width; c.height = vp.height; await p.render({canvasContext: c.getContext("2d"), viewport: vp}).promise; out.push(c);
  }
  return out;
}
function lerQRDe(im) {   // o QR costuma estar no topo da página; procura-se primeiro aí e noutras escalas
  if (!window.jsQR) return "";
  var W = im.width, H = im.height, zonas = [[.6, 0, .4, .25], [0, 0, 1, .35], [0, .6, 1, .4], [0, 0, 1, 1]];
  for (var z = 0; z < zonas.length; z++) for (var e = 0; e < 3; e++) {
    var k = [1, .5, .75][e], sx = zonas[z][0] * W, sy = zonas[z][1] * H, sw = zonas[z][2] * W, sh = zonas[z][3] * H, c = document.createElement("canvas");
    c.width = Math.round(sw * k); c.height = Math.round(sh * k);
    var x = c.getContext("2d", {willReadFrequently: true}); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, sx, sy, sw, sh, 0, 0, c.width, c.height);
    var r = jsQR(x.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
    if (r && /^A:\d{9}\*B:/.test(r.data)) return r.data;
  }
  return "";
}
function pontos(d) { return d ? 100 - FATURAS.verificar(d).length + d.linhas.length : -1; }
async function digitalizarFatura(f) {
  if (!ADMIN) return;
  if (PAGINA !== "dig") ir("dig");
  var box = $("#digCorpo");
  box.innerHTML = "<div class='card' style='padding:14px'><b>⏳ A ler " + esc(f.name) + "…</b><p class='mut' style='margin:6px 0 0'>Na primeira vez demora mais, porque descarrega o leitor. A fatura não sai do aparelho nesta fase.</p><div id='digPr' class='mut' style='font-size:12px'></div></div>";
  FD = {f: f, url: /pdf/i.test(f.type) || /\.pdf$/i.test(f.name) ? "" : URL.createObjectURL(f), pdf: /pdf/i.test(f.type) || /\.pdf$/i.test(f.name), d: null, texto: "", erro: ""};
  try {
    var pags = await paginasImagem(f), qr = "";
    if (FD.pdf) FD.url = pags[0].toDataURL("image/jpeg", .8);   // a imagem da 1.ª página: nem todos os telemóveis mostram PDF dentro da página
    try { await carregarJsQR(); } catch (e) { /* sem QR lê-se só o texto */ }
    for (var q = 0; q < pags.length && !qr; q++) qr = lerQRDe(pags[q]);
    await carregarTesseract();
    var passo = "", w = await Tesseract.createWorker("eng", 1, {logger: function (m) { if (m.status === "recognizing text" && $("#digPr")) $("#digPr").textContent = passo + " · " + Math.round(m.progress * 100) + "%"; }});
    await w.setParameters({tessedit_pageseg_mode: "6"});
    var melhor = null, tentativas = [["1.ª leitura", 2480, 0], ["2.ª leitura (traço grosso)", 2480, 1]];
    for (var t = 0; t < tentativas.length; t++) {
      passo = tentativas[t][0];
      var txt = "";
      for (var p = 0; p < pags.length; p++) txt += (await w.recognize(prepararOCR(pags[p], tentativas[t][1], tentativas[t][2]))).data.text + "\n";
      var d = FATURAS.ler(txt, qr);
      if (!melhor || pontos(d) > pontos(melhor.d)) melhor = {d: d, t: txt};
      if (d && !FATURAS.verificar(d).length) break;
    }
    await w.terminate();
    FD.d = melhor.d; FD.texto = melhor.t;
  } catch (e) { FD.erro = falhou(e); }
  if (!FD.d) FD.d = {fornecedor: "", numero: "", data: "", cliente_nif: "", total_c: 0, imposto_c: 0, bases: {23: 0}, linhas: [], qr: false};
  desenharFatura();
}
function dinheiro(c) { return ((c || 0) / 100).toFixed(2).replace(".", ","); }
function daMoeda(v) { var c = Math.round(parseFloat(String(v).replace(/\s/g, "").replace(",", ".")) * 100); return isNaN(c) ? 0 : c; }
function lojaDaFatura(d) { var o = null; Object.keys(FATURAS.NIF_LOJA).forEach(function (k) { if (FATURAS.NIF_LOJA[k] === d.cliente_nif) o = k; }); return o; }
function desenharFatura() {
  var d = FD.d, loja = lojaDaFatura(d) || EST, B = Object.keys(d.bases);
  var h = "<div class='card'><div class='cb' style='display:grid;gap:12px'><h3 style='margin:0;display:flex;justify-content:space-between;gap:8px'>🧾 Conferir a fatura<button class='btn' id='digX'>✕ Cancelar</button></h3>" +
    (FD.erro ? "<div class='msgErr' style='padding:8px 10px;border-radius:8px'>⚠ A leitura automática falhou (" + esc(FD.erro) + "). Pode escrever os dados a partir da imagem.</div>" : "") +
    (d.qr ? "<div class='msgOk' style='padding:8px 10px;border-radius:8px'>✔ QR fiscal lido: fornecedor, cliente, data, número, IVA e total vêm dele.</div>" : "<div class='mut' style='font-size:13px'>Sem QR fiscal lido: confira o número, a data e os totais com atenção.</div>") +
    "<div class='fc-g'><div>" + (FD.url ? "<img class='fc-img' style='max-height:760px' src='" + FD.url + "' alt='fatura'>" : "") + "</div><div style='display:grid;gap:10px;align-content:start'>" +
    "<div class='ff'><label>Fornecedor<select id='dF'><option value=''>Escolher…</option>" + Object.keys(FATURAS.FORN).map(function (k) { return "<option value='" + k + "'" + (d.fornecedor === k ? " selected" : "") + ">" + esc(FATURAS.FORN[k].nome) + "</option>"; }).join("") + "</select></label>" +
    "<label>Loja<select id='dL'>" + Object.keys(FATURAS.NIF_LOJA).map(function (k) { var e = ESTS.find(function (x) { return x.id === k; }); return "<option value='" + k + "'" + (loja === k ? " selected" : "") + ">" + esc(e ? e.name : k) + "</option>"; }).join("") + "</select></label>" +
    "<label>Número<input id='dN' value='" + esc(d.numero) + "'></label><label>Data<input type='date' id='dD' value='" + esc(d.data) + "'></label></div>" +
    "<div style='overflow-x:auto'><table style='min-width:560px'><thead><tr><th>Código</th><th>Artigo</th><th>Qtd.</th><th>Valor sem IVA €</th><th>IVA %</th><th></th></tr></thead><tbody id='dLs'></tbody></table></div>" +
    "<div class='bar'><button class='btn' id='dMais'>+ Acrescentar linha</button></div>" +
    "<div class='ff'>" + B.map(function (t) { return "<label>Base a " + esc(t) + " %<input data-b='" + esc(t) + "' inputmode='decimal' value='" + dinheiro(d.bases[t]) + "'></label>"; }).join("") +
    "<label>IVA €<input id='dI' inputmode='decimal' value='" + dinheiro(d.imposto_c) + "'></label><label>Total €<input id='dT' inputmode='decimal' value='" + dinheiro(d.total_c) + "'></label></div>" +
    "<div id='dChk'></div><label style='display:flex;gap:8px;align-items:center'><input type='checkbox' id='dV'> Confirmo que conferi estes dados com a fatura</label>" +
    "<div class='bar'><button class='btn p' id='dOk' disabled>✔ Enviar ao OCTAN AI</button></div><div id='dMsg'></div></div></div></div></div>";
  $("#digCorpo").innerHTML = h;
  desenharLinhas();
  $("#digX").onclick = function () { FD = null; carregarFaturasDig(); };
  $("#dMais").onclick = function () { lerCartao(); d.linhas.push({codigo: "", descricao: "", qtd: 1, valor_c: 0, iva: +(B[0] || 23)}); desenharLinhas(); conferirCartao(); };
  ["#dF", "#dL", "#dN", "#dD", "#dI", "#dT", "#dV"].forEach(function (s) { $(s).oninput = conferirCartao; $(s).onchange = conferirCartao; });
  $$("#digCorpo [data-b]").forEach(function (i) { i.oninput = conferirCartao; });
  $("#dOk").onclick = enviarFatura;
  conferirCartao();
}
function desenharLinhas() {
  $("#dLs").innerHTML = FD.d.linhas.map(function (l, i) {
    return "<tr" + (l.duvida ? " style='background:rgba(243,108,33,.15)'" : "") + "><td><input data-c='codigo' data-i='" + i + "' value='" + esc(l.codigo) + "' style='width:125px'></td><td><input data-c='descricao' data-i='" + i + "' value='" + esc(l.descricao) + "' style='min-width:170px;width:100%'></td>" +
      "<td><input data-c='qtd' data-i='" + i + "' inputmode='numeric' value='" + l.qtd + "' style='width:56px'></td><td><input data-c='valor' data-i='" + i + "' inputmode='decimal' value='" + dinheiro(l.valor_c) + "' style='width:80px'></td>" +
      "<td><input data-c='iva' data-i='" + i + "' inputmode='numeric' value='" + l.iva + "' style='width:46px'></td><td><button class='btn' data-t='" + i + "' title='Tirar esta linha'>✕</button></td></tr>";
  }).join("");
  $$("#dLs input").forEach(function (i) { i.oninput = conferirCartao; });
  $$("#dLs [data-t]").forEach(function (b) { b.onclick = function () { lerCartao(); FD.d.linhas.splice(+b.dataset.t, 1); desenharLinhas(); conferirCartao(); }; });
}
function lerCartao() {
  var d = FD.d; d.fornecedor = $("#dF").value; d.numero = $("#dN").value.trim(); d.data = $("#dD").value;
  d.cliente_nif = FATURAS.NIF_LOJA[$("#dL").value]; d.imposto_c = daMoeda($("#dI").value); d.total_c = daMoeda($("#dT").value);
  $$("#digCorpo [data-b]").forEach(function (i) { d.bases[i.dataset.b] = daMoeda(i.value); });
  $$("#dLs input").forEach(function (i) { var l = d.linhas[+i.dataset.i], c = i.dataset.c;
    if (c === "valor") l.valor_c = daMoeda(i.value); else if (c === "qtd" || c === "iva") l[c] = parseInt(i.value, 10) || 0; else l[c] = i.value.trim(); });
}
function conferirCartao() {
  lerCartao();
  var e = FATURAS.verificar(FD.d), loja = $("#dL").value;
  if (loja !== EST) e.push("Mude a loja no cabeçalho para a loja desta fatura");
  $("#dChk").innerHTML = e.length ? "<div class='msgErr' style='padding:8px 10px;border-radius:8px'>" + e.map(function (x) { return "<div>• " + esc(x) + "</div>"; }).join("") + "</div>" : "<div class='msgOk' style='padding:8px 10px;border-radius:8px'>✔ As contas batem certo.</div>";
  $("#dOk").disabled = !!e.length || !$("#dV").checked;
}
async function enviarFatura() {
  var b = $("#dOk"), m = $("#dMsg"), d = FD.d; b.disabled = true; m.textContent = "A enviar…";
  try {
    var bytes = new Uint8Array(await FD.f.arrayBuffer()), h = await sha(bytes), ext = FD.pdf ? "pdf" : (FD.f.name.split(".").pop() || "jpg").toLowerCase();
    var caminho = EST + "/faturas/" + d.fornecedor + "_" + d.numero.replace(/\W+/g, "-") + "_" + h + "." + ext;
    await guardarOriginal(caminho, new Blob([bytes], {type: FD.f.type || "application/octet-stream"}), FD.f.type || "application/octet-stream");
    var bases = {}; Object.keys(d.bases).forEach(function (t) { bases[t] = d.bases[t]; });
    var dados = {fornecedor: d.fornecedor, numero: d.numero, data: d.data, cliente_nif: d.cliente_nif, total_c: d.total_c, imposto_c: d.imposto_c, bases: bases, origem: caminho,
      linhas: d.linhas.map(function (l) { return {codigo: l.codigo, descricao: l.descricao, qtd: l.qtd, valor_c: l.valor_c, iva: l.iva}; })};
    var r = await sb.from("msb_faturas_dig").insert({estacao: EST, fornecedor: d.fornecedor, numero: d.numero, dia: d.data, total_c: d.total_c, dados: dados, original: caminho, hash: h, visto_por: (PERFIL && PERFIL.display_name) || "administrador"});
    if (r.error) { if (r.error.code === "23505") throw new Error("Esta fatura já foi enviada."); throw r.error; }
    FD = null; await carregarFaturasDig("✔ Fatura enviada. O PC recebe-a em 2 minutos, no máximo, e o rascunho é criado na corrida das 06:00 ou em compras CORRER.");
  } catch (e) { m.innerHTML = "<div class='bad'>✖ " + esc(falhou(e)) + "</div>"; b.disabled = false; }
}
async function carregarFaturasDig(msg) {
  var c = $("#digCorpo"); if (FD) return;
  c.innerHTML = (msg ? "<div class='msgOk' style='padding:8px 10px;border-radius:8px'>" + esc(msg) + "</div>" : "") + "<div class='mut'>A carregar…</div>";
  try {
    var q = await sb.from("msb_faturas_dig").select("fornecedor,numero,dia,total_c,estado,criado,original,visto_por").eq("estacao", EST).order("criado", {ascending: false}).limit(30);
    if (q.error) throw q.error;
    var L = q.data || [];
    c.innerHTML = (msg ? "<div class='msgOk' style='padding:8px 10px;border-radius:8px'>" + esc(msg) + "</div>" : "") + "<div class='card'><div class='cb' style='display:grid;gap:8px'><h3 style='margin:0'>Faturas enviadas</h3>" +
      (L.length ? "<div style='overflow-x:auto'><table><thead><tr><th>Data</th><th>Fornecedor</th><th>Número</th><th>Total</th><th>Estado</th><th>Visto</th><th></th></tr></thead><tbody>" + L.map(function (x, i) {
        return "<tr><td>" + dmy(x.dia) + "</td><td>" + esc((FATURAS.FORN[x.fornecedor] || {}).nome || x.fornecedor) + "</td><td>" + esc(x.numero) + "</td><td>" + dinheiro(x.total_c) + " €</td><td>" + (x.estado === "no_pc" ? "✔ No PC" : "⏳ A caminho do PC") + "</td><td>" + esc(x.visto_por) + "</td><td><button class='btn' data-o='" + i + "'>📄</button></td></tr>"; }).join("") + "</tbody></table></div>" : "<p class='mut' style='margin:0'>Ainda não há faturas digitalizadas nesta loja.</p>") + "</div></div>";
    $$("#digCorpo [data-o]").forEach(function (b) { b.onclick = function () { abrirOriginal(L[+b.dataset.o].original); }; });
  } catch (e) { c.innerHTML = "<div class='bad'>✖ " + esc(falhou(e)) + "</div>"; }
}
$("#bDig").onclick = function () { $("#fDig").click(); };
$("#bDigFoto").onclick = function () { $("#fDigFoto").click(); };
$("#fDig").onchange = $("#fDigFoto").onchange = function () { var f = this.files[0]; this.value = ""; if (f) digitalizarFatura(f); };
