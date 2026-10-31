/* mystationbox · leitores na cloud: folha de turno (.xls), fechos digitalizados (MB/Solred) e documentos Repsol (PDF).
 * Usa o MOTOR (motor.js, igual aos leitores Python do PC) e as variáveis globais do index.html
 * (sb, EST, DIA, LINHAS, ADMIN, POSES, irDia, status, fmt, cent, eur, esc, dmy, num, iso, addDia, addMes, falhou). */
"use strict";
var CAMPO_COL = {func: "func", vendas: "vendas_c", mb: "mb_c", solred: "solred_c", pres: "pres_c", num: "num_c", forn: "forn_c", chq: "chq_c", lit: "lit_cl"};
var NOME_CAMPO = {func: "Funcionário", vendas: "Vendas", mb: "MB", solred: "Solred €", pres: "Solred presente", num: "Numerário", forn: "Fornecedores", chq: "Cheques", lit: "Solred litros"};
function posEst() { return (POSES[EST] || "").replace(/^0+/, ""); }
function raw2(v) { return num(v).toFixed(2).replace(".", ","); }
async function sha(bytes) { var h = await crypto.subtle.digest("SHA-256", bytes); return Array.from(new Uint8Array(h)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("").slice(0, 12); }
async function linhaTurno(d, t) { if (d === DIA && LINHAS[t]) return LINHAS[t]; var r = await sb.from("msb_turnos").select("*").eq("estacao", EST).eq("dia", d).eq("turno", t).maybeSingle(); return r.data || null; }
/* grava campos num turno (só os que mudam); valores em texto como se escrevem no ecrã */
async function gravarCampos(d, t, campos) {
  var atual = await linhaTurno(d, t) || {}, linha = {estacao: EST, dia: d, turno: t}, txt = Object.assign({}, atual.txt || {}), muda = 0;
  Object.keys(campos).forEach(function (k) {
    var v = campos[k]; if (v == null || String(v).trim() === "") return;
    if (k === "func") { if ((atual.func || "") !== String(v).trim()) { linha.func = String(v).trim().slice(0, 40); muda++; } return; }
    var col = CAMPO_COL[k], c = cent(v);
    if (atual[col] != null && atual[col] === c) return;
    linha[col] = c; txt[k] = String(v).trim(); muda++;
  });
  if (!muda) return 0;
  linha.txt = txt;
  var r = await sb.from("msb_turnos").upsert(linha, {onConflict: "estacao,dia,turno"}).select().single();
  if (r.error) throw r.error;
  if (d === DIA) LINHAS[t] = r.data;
  return muda;
}
/* guarda um original no arquivo privado; se já lá estiver (mesmo conteúdo), aproveita */
async function guardarOriginal(caminho, blob, tipo) {
  var r = await sb.storage.from("msb-originais").upload(caminho, blob, {contentType: tipo, upsert: false});
  if (r.error && !/exist|duplicate|409/i.test(r.error.message + " " + (r.error.statusCode || ""))) throw r.error;
  return caminho;
}
async function abrirOriginal(caminho) {
  var w = window.open("", "_blank");
  var r = await sb.storage.from("msb-originais").createSignedUrl(caminho, 300);
  if (r.error) { if (w) w.close(); status(false, "⚠ " + falhou(r.error)); return; }
  if (w) w.location = r.data.signedUrl; else location.href = r.data.signedUrl;
}
function painel(html) { var p = $("#painel"); p.hidden = !html; p.innerHTML = html ? "<div class='pn'>" + html + "</div>" : ""; if (html) p.scrollIntoView({behavior: "smooth", block: "start"}); return p; }
function fecharPainel() { painel(""); }
function linhaVerif(c) { return "<div>" + ({ok: "✅", aviso: "⚠️", erro: "❌", info: "ℹ️"}[c.nivel] || "•") + " " + esc(c.msg) + "</div>"; }

/* ================================================================ 1) folha de turno do sistema (.xls) */
$("#bXls").onclick = function () { $("#fXls").click(); };
$("#fXls").onchange = async function () {
  var f = this.files[0]; this.value = ""; if (!f) return;
  try {
    var x = MOTOR.lerTurno(new Uint8Array(await f.arrayBuffer())), d = x.data || DIA;
    var t = (LINHAS.t1 && LINHAS.t1.vendas_c != null && d === DIA) ? "t2" : "t1";
    var campos = [["func", x.colaborador || ""], ["vendas", x.vendas], ["mb", x.mb], ["solred", x.solred], ["pres", x.pres], ["num", x.num]];
    var h = "<h3>📥 Folha de turno do sistema" + (x.fecho ? " · fecho " + x.fecho : "") + "<button class='btn' id='xX'>✕ Cancelar</button></h3>";
    h += "<div class='ff'><label>Dia<input type='date' id='xD' value='" + d + "'></label><label>Turno<select id='xT'><option value='t1'" + (t === "t1" ? " selected" : "") + ">☀️ Turno 1</option><option value='t2'" + (t === "t2" ? " selected" : "") + ">🌙 Turno 2</option></select></label></div>";
    h += "<div class='ff'>" + campos.map(function (c) { var v = c[1]; return "<label>" + NOME_CAMPO[c[0]] + "<input class='" + (c[0] === "func" ? "" : "n") + "' data-x='" + c[0] + "' value='" + (v == null ? "" : (c[0] === "func" ? esc(v) : raw2(v))) + "'></label>"; }).join("") + "</div>";
    var outros = Object.keys(x.outros || {});
    if (outros.length) h += "<p class='mut' style='margin:0;font-size:13px'>Também na folha (não vai para o registo): " + outros.map(function (k) { return esc(k) + " " + raw2(x.outros[k]); }).join(" · ") + "</p>";
    h += "<div id='xCmp' class='chk'></div><div class='bar'><button class='btn p' id='xOk'>Gravar no turno</button></div>";
    painel(h);
    async function cmp() { var dd = $("#xD").value, tt = $("#xT").value, a = await linhaTurno(dd, tt) || {}, o = "";
      $$("#painel [data-x]").forEach(function (i) { var k = i.dataset.x, novo = i.value.trim(); if (!novo) return;
        var velho = k === "func" ? (a.func || "") : (a[CAMPO_COL[k]] == null ? "" : fmt(a[CAMPO_COL[k]]));
        var igual = k === "func" ? velho === novo : velho !== "" && a[CAMPO_COL[k]] === cent(novo);
        o += "<div>" + (igual ? "✅ " + NOME_CAMPO[k] + " já registado" : velho ? "⚠️ " + NOME_CAMPO[k] + ": <b>" + esc(velho) + "</b> passa a <b>" + esc(k === "func" ? novo : fmt(cent(novo))) + "</b>" : "➕ " + NOME_CAMPO[k] + ": vazio → <b>" + esc(k === "func" ? novo : fmt(cent(novo))) + "</b>") + "</div>"; });
      $("#xCmp").innerHTML = o; }
    $("#xX").onclick = fecharPainel; $("#xD").onchange = $("#xT").onchange = cmp; $$("#painel [data-x]").forEach(function (i) { i.oninput = cmp; }); cmp();
    $("#xOk").onclick = async function () { var b = this, campos2 = {}; b.disabled = true; $$("#painel [data-x]").forEach(function (i) { campos2[i.dataset.x] = i.value; });
      try { var dd = $("#xD").value, n = await gravarCampos(dd, $("#xT").value, campos2); fecharPainel(); await irDia(dd); status(true, n ? "Folha importada ✓ (" + n + " campo(s))" : "Nada a mudar: já estava registado"); }
      catch (e) { b.disabled = false; status(false, "⚠ " + falhou(e)); } };
  } catch (e) { status(false, "⚠ " + (e.message || e)); }
};

/* ================================================================ 2) fechos digitalizados */
var FC = null, TESS = null;
function carregarTesseract() {
  if (window.Tesseract) return Promise.resolve();
  if (TESS) return TESS;
  TESS = new Promise(function (ok, ko) { var s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js"; s.onload = ok; s.onerror = function () { TESS = null; ko(new Error("sem internet para o leitor de texto")); }; document.head.appendChild(s); });
  return TESS;
}
function imagem(file) { return new Promise(function (ok, ko) { var im = new Image(); im.onload = function () { ok(im); }; im.onerror = function () { ko(new Error("imagem inválida")); }; im.src = URL.createObjectURL(file); }); }
/* o mesmo tratamento afinado nos testes: 1600 px, contraste automático, engrossar os pontos da impressão */
function prepararOCR(im) {
  var W = 1600, H = Math.round(im.height * W / im.width), c = document.createElement("canvas"); c.width = W; c.height = H;
  var x = c.getContext("2d"); x.drawImage(im, 0, 0, W, H);
  var d = x.getImageData(0, 0, W, H), p = d.data, n = W * H, g = new Uint8ClampedArray(n), hist = new Array(256).fill(0), i;
  for (i = 0; i < n; i++) { var v = (p[i * 4] * 299 + p[i * 4 + 1] * 587 + p[i * 4 + 2] * 114) / 1000 | 0; g[i] = v; hist[v]++; }
  var lo = 0, hi = 255, acc = 0; while (acc + hist[lo] < n * .01) { acc += hist[lo]; lo++; } acc = 0; while (acc + hist[hi] < n * .01) { acc += hist[hi]; hi--; }
  var k = 255 / Math.max(1, hi - lo), o = new Uint8ClampedArray(n);
  for (var y = 0; y < H; y++) for (var xx = 0; xx < W; xx++) { var m = 255; for (var dy = -1; dy <= 1; dy++) { var yy = y + dy; if (yy < 0 || yy >= H) continue; for (var dx = -1; dx <= 1; dx++) { var x2 = xx + dx; if (x2 < 0 || x2 >= W) continue; var q = g[yy * W + x2]; if (q < m) m = q; } } o[y * W + xx] = m; }
  for (i = 0; i < n; i++) { var w = Math.max(0, Math.min(255, (o[i] - lo) * k)); p[i * 4] = p[i * 4 + 1] = p[i * 4 + 2] = w; }
  x.putImageData(d, 0, 0); return c;
}
function fotoJPEG(im) { var W = Math.min(1400, im.width), c = document.createElement("canvas"); c.width = W; c.height = Math.round(im.height * W / im.width); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
  return new Promise(function (ok) { c.toBlob(function (b) { ok(b); }, "image/jpeg", .82); }); }
$("#bFecho").onclick = function () { $("#fFecho").click(); };
$("#fFecho").onchange = async function () {
  var f = this.files[0]; this.value = ""; if (!f) return;
  painel("<h3>🧾 A ler o talão…</h3><p class='mut' style='margin:0'>Na primeira vez demora 20 a 40 segundos (descarrega o leitor de texto). Depois é mais rápido.</p><div id='fcPr' class='mut' style='font-size:12px'></div>");
  FC = {r: null, foto: null, url: "", texto: ""};
  try {
    var im = await imagem(f); FC.foto = await fotoJPEG(im); FC.url = URL.createObjectURL(FC.foto);
    await carregarTesseract();
    var w = await Tesseract.createWorker("eng", 1, {logger: function (m) { if (m.status === "recognizing text" && $("#fcPr")) $("#fcPr").textContent = "A reconhecer… " + Math.round(m.progress * 100) + "%"; }});
    await w.setParameters({tessedit_pageseg_mode: "6"});
    var res = await w.recognize(prepararOCR(im)); await w.terminate();
    FC.texto = res.data.text; FC.r = MOTOR.lerFecho(FC.texto);
  } catch (e) { FC.erro = e.message || String(e); }
  await desenharFecho();
};
async function desenharFecho() {
  var r = FC.r, h = "";
  if (!r) { h += "<p style='margin:0'><b>⚠ Não consegui ler o talão automaticamente</b> (" + esc(FC.erro || "") + "). Escolha o tipo e escreva os valores a partir da fotografia.</p>"; r = FC.r = {tipo: "MB", verificacoes: [], dia_sug: "", turno_sug: ""}; }
  var tipo = r.tipo, dia = r.dia_sug || DIA, tr = r.turno_sug || "t1";
  if (tipo === "MB" && r.periodo) { var cr = await sb.from("msb_creditos_mb").select("valor_c,doc,data").eq("estacao", EST).eq("fecho", r.periodo); r.credito = (cr.data || [])[0] || null; }
  h += "<h3>🧾 " + (tipo === "MB" ? "Fecho Multibanco (TOTAIS TPA)" : "Fecho de turno Solred (TPV)") + "<button class='btn' id='fcX'>✕ Cancelar</button></h3>";
  h += "<div class='fc-g'><div>" + (FC.url ? "<img class='fc-img' src='" + FC.url + "' alt='talão'>" : "") + "</div><div style='display:grid;gap:10px'>";
  h += "<div class='ff'><label>Tipo<select id='fcT'><option value='MB'" + (tipo === "MB" ? " selected" : "") + ">Multibanco</option><option value='SOLRED'" + (tipo === "SOLRED" ? " selected" : "") + ">Solred</option></select></label><label>Dia<input type='date' id='fcD' value='" + dia + "'></label><label>Turno<select id='fcU'><option value='t1'" + (tr === "t1" ? " selected" : "") + ">☀️ Turno 1</option><option value='t2'" + (tr === "t2" ? " selected" : "") + ">🌙 Turno 2</option></select></label></div>";
  var lido = [r.dia ? "data " + dmy(r.dia) : "", r.hora ? "hora " + r.hora : "", r.tpa ? "TPA " + r.tpa : "", r.periodo ? "período " + r.periodo : "", r.operacao ? "operação " + r.operacao : "", r.desde ? "de " + r.desde + " a " + r.ate : ""].filter(Boolean);
  if (lido.length) h += "<p class='mut' style='margin:0;font-size:12px'>Lido no talão: " + esc(lido.join(" · ")) + "</p>";
  h += "<b>Valores para o registo</b><div class='ff'>";
  if (tipo === "MB") h += "<label>Compra €<input class='n' id='fcC' inputmode='decimal' value='" + (r.compra == null ? "" : raw2(r.compra)) + "'></label><label>Devolução €<input class='n' id='fcV' inputmode='decimal' value='" + raw2(r.devolucao || 0) + "'></label><label>MB = compra − devolução<input class='n' id='fcM' disabled></label>";
  else h += "<label>Solred €<input class='n' id='fcS' inputmode='decimal' value='" + (r.solred == null ? "" : raw2(r.solred)) + "'></label><label>Solred litros<input class='n' id='fcL' inputmode='decimal' value='" + (r.lit == null ? "" : raw2(r.lit)) + "'></label>";
  h += "</div><div id='fcCmp' class='chk'></div><div class='chk'>" + (r.verificacoes || []).map(linhaVerif).join("") + "</div>";
  if (r.credito) h += "<div class='chk'><div>🏦 Período " + esc(r.periodo) + " creditado pela Repsol na liquidação " + esc(r.credito.doc) + ": <b>" + eur(r.credito.valor_c) + "</b></div></div>";
  h += fechoVariaveis(r);
  h += "<label class='visto'><input type='checkbox' id='fcOk'> <span><b>Visto:</b> conferi os valores com o talão</span></label>";
  h += "<div class='bar'><button class='btn p' id='fcGo' disabled>✓ Validar e registar</button><span id='fcMsg' class='mut' style='font-size:13px'></span></div>";
  h += "<details><summary class='mut' style='cursor:pointer;font-size:12px'>Texto lido (OCR)</summary><textarea class='ocr' readonly>" + esc(FC.texto || "") + "</textarea></details></div></div>";
  painel(h);
  $("#fcX").onclick = function () { FC = null; fecharPainel(); };
  $("#fcT").onchange = function () { FC.r.tipo = this.value; desenharFecho(); };
  ["#fcD", "#fcU", "#fcC", "#fcV", "#fcS", "#fcL"].forEach(function (s) { var e = $(s); if (e) e.oninput = e.onchange = fechoComparar; });
  $("#fcOk").onchange = function () { $("#fcGo").disabled = !this.checked; };
  $("#fcGo").onclick = fechoValidar; fechoComparar();
}
function fechoVariaveis(r) {
  var rows = [];
  (r.contratos || []).forEach(function (c, i) { rows.push(["Contratos", c.contrato, {valor: c.valor, desconto: c.desconto}, "c" + i]); });
  Object.keys(r.secoes || {}).forEach(function (s) { Object.keys(r.secoes[s]).forEach(function (k) { rows.push([s, k, r.secoes[s][k], s + "|" + k]); }); });
  if (!rows.length) return "";
  return "<details class='vars'><summary style='cursor:pointer;font-weight:700;font-size:13px'>📋 Todas as variáveis lidas (" + rows.length + " linhas) — pode corrigir</summary><div class='sc'><table><thead><tr><th>Secção</th><th class='l'>Linha</th><th>Nº</th><th>Litros</th><th>Valor €</th><th>Desc./DT</th></tr></thead><tbody>" +
    rows.map(function (x) { var v = x[2], dd = v.deduzido || [];
      function inp(col) { var val = v[col]; return "<td><input data-fv='" + esc(x[3]) + "|" + col + "' value='" + (val == null ? "" : col === "n" ? val : raw2(val)) + "'" + (dd.indexOf(col) >= 0 ? " title='deduzido do total' style='background:var(--wnb)'" : "") + "></td>"; }
      return "<tr><td><small>" + esc(x[0]) + "</small></td><td class='l'>" + esc(x[1]) + "</td>" + inp("n") + inp("litros") + inp("valor") + inp(x[0] === "Contratos" ? "desconto" : "dt") + "</tr>"; }).join("") + "</tbody></table></div></details>";
}
function fechoRegisto() {
  if ($("#fcT").value === "MB") { var c = $("#fcC").value.trim(), v = $("#fcV").value.trim(); if (!c) return {}; return {mb: v && num(v) !== 0 ? raw2(c) + "-" + raw2(v) : raw2(c)}; }
  var o = {}; if ($("#fcS").value.trim()) o.solred = raw2($("#fcS").value); if ($("#fcL").value.trim()) o.lit = raw2($("#fcL").value); return o;
}
async function fechoComparar() {
  var reg = fechoRegisto(), d = $("#fcD").value, t = $("#fcU").value, a = await linhaTurno(d, t) || {}, h = "";
  if ($("#fcM")) $("#fcM").value = reg.mb ? fmt(cent(reg.mb)) : "";
  Object.keys(reg).forEach(function (k) { var col = CAMPO_COL[k], novo = cent(reg[k]), velho = a[col];
    if (velho == null) h += "<div>➕ " + NOME_CAMPO[k] + " de " + dmy(d) + " " + (t === "t1" ? "T1" : "T2") + ": vazio → <b>" + fmt(novo) + "</b></div>";
    else if (velho === novo) h += "<div>✅ " + NOME_CAMPO[k] + " já registado com o mesmo valor (" + fmt(velho) + ")</div>";
    else h += "<div style='color:var(--wn)'>⚠️ " + NOME_CAMPO[k] + " de " + dmy(d) + " " + (t === "t1" ? "T1" : "T2") + " tem <b>" + fmt(velho) + "</b> e passará a <b>" + fmt(novo) + "</b></div>"; });
  if (FC && FC.r && FC.r.mb_tpv != null && a.mb_c != null) h += "<div>" + (Math.round(FC.r.mb_tpv * 100) === a.mb_c ? "✅" : "⚠️") + " MB registado (" + fmt(a.mb_c) + ") vs MB pelo TPV (" + raw2(FC.r.mb_tpv) + ")</div>";
  var e = $("#fcCmp"); if (e) e.innerHTML = h;
}
function fechoDados() {
  var d = JSON.parse(JSON.stringify(FC.r || {})); delete d.registo; delete d.verificacoes; delete d.credito;
  $$("#painel [data-fv]").forEach(function (e) { var p = e.dataset.fv.split("|"), col = p.pop(), v = e.value.trim(), val = v === "" ? null : (col === "n" ? parseInt(v, 10) : num(v));
    if (p.length === 1 && p[0].charAt(0) === "c" && d.contratos) { var c = d.contratos[+p[0].slice(1)]; if (c) c[col] = val; }
    else if (d.secoes && d.secoes[p[0]] && d.secoes[p[0]][p[1]]) d.secoes[p[0]][p[1]][col] = val; });
  return d;
}
async function fechoValidar() {
  var reg = fechoRegisto(); if (!Object.keys(reg).length) { $("#fcMsg").textContent = "Falta o valor."; return; }
  var b = $("#fcGo"); b.disabled = true; $("#fcMsg").textContent = "A gravar…";
  try {
    var tipo = $("#fcT").value, d = $("#fcD").value, t = $("#fcU").value, dados = fechoDados(), img = "";
    if (FC.foto) { var bytes = new Uint8Array(await FC.foto.arrayBuffer()); img = await guardarOriginal(EST + "/fechos/" + tipo + "_" + d + "_" + await sha(bytes) + ".jpg", FC.foto, "image/jpeg"); }
    var ident = dados.periodo || dados.operacao || dados.id || Math.random().toString(16).slice(2, 10);
    var r = await sb.from("msb_fechos").upsert({estacao: EST, chave: tipo + "|" + d + "|" + ident, tipo: tipo, dia: d, turno: t, dados: dados, texto: FC.texto || "", imagem: img,
      validado_por_nome: (PERFIL && PERFIL.display_name) || "", validado_em: new Date().toISOString()}, {onConflict: "estacao,chave"});
    if (r.error) throw r.error;
    var n = await gravarCampos(d, t, reg);
    FC = null; fecharPainel(); await irDia(d); status(true, "Fecho validado ✓" + (n ? " e registado" : " (o valor já estava registado)"));
  } catch (e) { b.disabled = false; $("#fcMsg").textContent = "⚠ " + falhou(e); }
}
window.fechosDoDia = async function () {
  var d = DIA, r = await sb.from("msb_fechos").select("chave,tipo,turno,imagem,validado_por_nome,validado_em").eq("estacao", EST).eq("dia", d).order("validado_em");
  if (d !== DIA) return;
  var box = $("#fechosDia"); box.innerHTML = (r.data || []).map(function (f) { return "<span class='chip'>🧾 " + (f.tipo === "MB" ? "Fecho MB" : "Fecho Solred") + " · " + (f.turno === "t1" ? "T1" : "T2") + " · ✔ " + esc(f.validado_por_nome || "—") + " " + new Date(f.validado_em).toLocaleTimeString("pt-PT", {hour: "2-digit", minute: "2-digit"}) + (f.imagem ? " <a href='#' data-img='" + esc(f.imagem) + "'>ver foto</a>" : "") + "</span>"; }).join("");
  box.querySelectorAll("[data-img]").forEach(function (a) { a.onclick = function (ev) { ev.preventDefault(); abrirOriginal(a.dataset.img); }; });
};

/* ================================================================ 3) documentos Repsol (PDF) */
async function inflar(u8) {   // DecompressionStream recusa bytes a seguir ao fim do zlib (o \r\n antes de "endstream"): tenta cortar
  for (var corte = 0; corte <= 2; corte++) {
    try { var s = new Blob([u8.subarray(0, u8.length - corte)]).stream().pipeThrough(new DecompressionStream("deflate")); return new Uint8Array(await new Response(s).arrayBuffer()); }
    catch (e) { /* tenta o seguinte */ }
  }
  throw new Error("não é deflate");
}
$("#bPdf").onclick = function () { $("#fPdf").click(); };
$("#fPdf").onchange = function () { var fs = Array.from(this.files || []); this.value = ""; if (fs.length) carregarPdfs(fs); };
$("#v-rep").addEventListener("dragover", function (e) { if (ADMIN) e.preventDefault(); });
$("#v-rep").addEventListener("drop", function (e) { if (!ADMIN) return; e.preventDefault(); var fs = Array.from(e.dataTransfer.files || []).filter(function (f) { return /pdf$/i.test(f.name) || f.type === "application/pdf"; }); if (fs.length) carregarPdfs(fs); });
async function carregarPdfs(files) {
  var box = $("#repProg"), linhas = [], ultimo = null; box.hidden = false;
  function mostra() { box.innerHTML = "<b>📄 Documentos</b>" + linhas.map(function (l) { return "<div style='font-size:14px'>" + l + "</div>"; }).join(""); }
  for (var i = 0; i < files.length; i++) {
    var f = files[i]; linhas.push("⏳ " + esc(f.name)); mostra();
    try {
      var bytes = new Uint8Array(await f.arrayBuffer()), pags = await MOTOR.pdfPaginas(bytes, inflar);
      if (!pags.length) throw new Error("Não consegui ler este PDF");
      var rec = MOTOR.lerDocumento(pags);
      if (!rec.tipo || !rec.ok) throw new Error("Não reconheci este documento (use os PDF originais da Repsol)");
      var caminho = await guardarOriginal(EST + "/repsol/" + rec.tipo + "_" + String(rec.numero).replace(/\W/g, "") + "_" + await sha(bytes) + ".pdf", f, "application/pdf");
      var chave = rec.tipo + "|" + rec.numero, ex = await sb.from("msb_docs").select("chave").eq("estacao", EST).eq("chave", chave).maybeSingle();
      var r = await sb.from("msb_docs").upsert({estacao: EST, chave: chave, tipo: rec.tipo, numero: rec.numero, emissao: rec.emissao || null, dados: rec, pdf: caminho}, {onConflict: "estacao,chave"});
      if (r.error) throw r.error;
      var mb = 0;
      if (rec.tipo === "LIQ") {
        var cr = rec.itens.filter(function (it) { return it.tipo.indexOf("Visa") === 0 && it.pos.replace(/^0+/, "") === posEst(); }).map(function (it) {
          return {estacao: EST, chave: it.pos + "|" + it.fecho + "|" + it.numdoc, doc: rec.liq, emissao: rec.emissao || null, data: it.data, valor_c: Math.round(it.valor * 100), pos: it.pos, fecho: it.fecho, numdoc: it.numdoc}; });
        if (cr.length) { var r2 = await sb.from("msb_creditos_mb").upsert(cr, {onConflict: "estacao,chave"}); if (r2.error) throw r2.error; }
        mb = cr.length;
      }
      var nomes = {LIQ: "Liquidação", CCS: "Fatura consignação", NDC: "Nota de crédito", VF: "Autofatura Solred"};
      linhas[linhas.length - 1] = "✅ " + nomes[rec.tipo] + " " + esc(rec.numero) + (rec.emissao ? " · " + dmy(rec.emissao) : "") + (mb ? " · " + mb + " crédito(s) MB" : "") + (ex.data ? " · já existia (atualizado)" : "");
      if (rec.emissao) ultimo = rec.emissao.slice(0, 7);
    } catch (e) { linhas[linhas.length - 1] = "❌ " + esc(f.name) + ": " + esc(e.message || falhou(e)); }
    mostra();
  }
  if (ultimo) $("#rMes").value = ultimo;
  carregarRepsol();
}
$("#rMes").onchange = function () { carregarRepsol(); };
$("#rAnt").onclick = function () { $("#rMes").value = addMes($("#rMes").value || MES, -1); carregarRepsol(); };
$("#rSeg").onclick = function () { $("#rMes").value = addMes($("#rMes").value || MES, 1); carregarRepsol(); };
var NOMES_DOC = {CCS: "Fatura consignação", NDC: "Nota de crédito", VF: "Autofatura Solred"};
/* liga cada crédito MB a um turno: mesmo valor no próprio dia, senão na véspera ou no dia seguinte */
function ligarCreditos(creditos, turnos) {
  var usados = {}, porDia = {}, res = {};
  turnos.forEach(function (t) { if (t.mb_c != null) (porDia[t.dia] = porDia[t.dia] || []).push(t); });
  var cs = creditos.slice().sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : a.fecho - b.fecho; });
  /* 1.ª passagem: valores iguais (próprio dia, depois véspera e dia seguinte) — tem prioridade */
  [0, -1, 1].forEach(function (off) { cs.forEach(function (c) { if (res[c.chave]) return;
    var t = (porDia[addDia(c.data, off)] || []).find(function (x) { return !usados[x.dia + x.turno] && x.mb_c === c.valor_c; });
    if (t) { usados[t.dia + t.turno] = 1; res[c.chave] = {c: c, t: t, est: "ok"}; } }); });
  /* 2.ª passagem: o que sobrou, com o turno livre mais próximo no próprio dia (diferença) */
  cs.forEach(function (c) { if (res[c.chave]) return;
    var t = (porDia[c.data] || []).filter(function (x) { return !usados[x.dia + x.turno]; }).sort(function (a, b) { return Math.abs(a.mb_c - c.valor_c) - Math.abs(b.mb_c - c.valor_c); })[0];
    if (t) { usados[t.dia + t.turno] = 1; res[c.chave] = {c: c, t: t, est: "dif"}; } else res[c.chave] = {c: c, t: null, est: "na"}; });
  return cs.map(function (c) { return res[c.chave]; });
}
async function carregarRepsol() {
  var M = $("#rMes").value || MES, docsBox = $("#repDocs"); docsBox.innerHTML = "<div class='mut'>A carregar…</div>"; $("#repChecks").innerHTML = ""; $("#mbTotem").innerHTML = "";
  try {
    var rd = await sb.from("msb_docs").select("chave,tipo,numero,emissao,dados,pdf").eq("estacao", EST); if (rd.error) throw rd.error;
    var rc = await sb.from("msb_creditos_mb").select("*").eq("estacao", EST); if (rc.error) throw rc.error;
    var docs = rd.data || [], cred = rc.data || [];
    var datas = cred.map(function (c) { return c.data; }).concat(docs.map(function (d) { return d.emissao; }).filter(Boolean)).concat([M + "-01", addMes(M, 1) + "-01"]).sort();
    var ini = addDia(datas[0], -2), fim = addDia(datas[datas.length - 1], 2);
    var rt = await sb.from("msb_turnos").select("dia,turno,func,mb_c,solred_c,lit_cl").eq("estacao", EST).gte("dia", ini).lte("dia", fim); if (rt.error) throw rt.error;
    var turnos = rt.data || [], dias = {};
    turnos.forEach(function (t) { var o = (dias[t.dia] = dias[t.dia] || {t1: {}, t2: {}})[t.turno]; if (t.lit_cl != null) o.lit = (t.lit_cl / 100).toFixed(2).replace(".", ","); if (t.solred_c != null) o.solred = (t.solred_c / 100).toFixed(2).replace(".", ","); });
    var ligados = ligarCreditos(cred, turnos);
    desenharRepsol(M, docs, ligados, turnos, MOTOR.verificar(docs.map(function (d) { return d.dados; }), {pos: posEst() || "36613", dias: dias}));
  } catch (e) { docsBox.innerHTML = "<div class='bad'>" + esc(falhou(e)) + "</div>"; }
}
function desenharRepsol(M, docs, ligados, turnos, checks) {
  var liqs = docs.filter(function (d) { return d.tipo === "LIQ" && (d.emissao || "").slice(0, 7) === M; }).sort(function (a, b) { return a.emissao < b.emissao ? 1 : -1; });
  var nums = {}; liqs.forEach(function (d) { nums[d.numero] = 1; });
  var outros = docs.filter(function (d) { return d.tipo !== "LIQ" && ((d.emissao || "").slice(0, 7) === M || nums[d.dados.liq]); });
  outros.forEach(function (d) { nums[d.numero] = 1; });
  /* relatório MB do mês (pelas datas dos turnos) */
  var tm = turnos.filter(function (t) { return t.dia.slice(0, 7) === M && t.mb_c; }), reg = tm.reduce(function (s, t) { return s + t.mb_c; }, 0);
  var ligTurno = {}; ligados.forEach(function (l) { if (l.t) ligTurno[l.t.dia + l.t.turno] = l; });
  var datasCred = ligados.map(function (l) { return l.c.data; }).sort(), primeira = datasCred[0] || "9999", ultima = datasCred[datasCred.length - 1] || "0000";
  var creditado = 0, falta = [], pend = [], semv = [];
  tm.forEach(function (t) { var l = ligTurno[t.dia + t.turno];
    if (l && l.est === "ok") creditado += t.mb_c;
    else if (t.dia < primeira) semv.push(t); else if (t.dia <= addDia(ultima, -1)) falta.push({t: t, l: l}); else pend.push(t); });
  var nm = new Date(M + "-15").toLocaleDateString("pt-PT", {month: "long", year: "numeric"});
  $("#mbTotem").innerHTML = "<div class='t'>Multibanco · " + esc(nm) + "</div>" + [["Registado", reg], ["Creditado ✔", creditado], ["Em falta", falta.reduce(function (s, x) { return s + x.t.mb_c; }, 0)], ["Ainda não liquidado", pend.reduce(function (s, t) { return s + t.mb_c; }, 0)], ["Sem verificação", semv.reduce(function (s, t) { return s + t.mb_c; }, 0)]]
    .map(function (x) { return "<div><div class='k'>" + x[0] + "</div><div class='v'>" + fmt(x[1]) + "<small>€</small></div></div>"; }).join("");
  var h = "";
  if (falta.length) h += "<div class='liq'><h3>⚠️ MB por creditar (" + falta.length + ")<span class='mut' style='font-weight:400;font-size:13px'>turnos com MB sem crédito igual nos documentos carregados</span></h3><div class='sc'><table><thead><tr><th>Dia</th><th class='l'>Turno</th><th>MB registado</th><th class='l'>Crédito mais próximo</th></tr></thead><tbody>" +
    falta.map(function (x) { return "<tr><td>" + dmy(x.t.dia) + "</td><td class='l'>" + (x.t.turno === "t1" ? "☀️ T1" : "🌙 T2") + " " + esc(x.t.func || "") + "</td><td class='n'>" + fmt(x.t.mb_c) + "</td><td class='l'>" + (x.l ? "fecho " + esc(x.l.c.fecho) + " · " + fmt(x.l.c.valor_c) + " <span class='b wn'>dif. " + fmt(x.l.c.valor_c - x.t.mb_c) + "</span>" : "<span class='mut'>nenhum</span>") + "</td></tr>"; }).join("") + "</tbody></table></div></div>";
  if (!liqs.length && !outros.length) h += "<div class='vazio'>Sem documentos da Repsol emitidos em " + esc(nm) + "." + (ADMIN ? " Carregue os PDF com o botão laranja (pode escolher vários)." : "") + "</div>";
  liqs.forEach(function (L) {
    var d = L.dados, mine = ligados.filter(function (l) { return l.c.doc === L.numero; });
    h += "<div class='liq'><h3><span>📄 Liquidação " + esc(L.numero) + "</span><span class='mut' style='font-weight:400'>emitida " + dmy(L.emissao) + (d.venc ? " · vence " + dmy(d.venc) : "") + "</span></h3>";
    h += "<div class='mut' style='font-size:13px'>Débitos " + (d.tdeb == null ? "—" : MOTOR.pt(d.tdeb) + " €") + " · Créditos " + (d.tcred == null ? "—" : MOTOR.pt(d.tcred) + " €") + " · <b>Saldo " + (d.saldo == null ? "—" : MOTOR.pt(d.saldo) + " €") + "</b>" + (L.pdf ? " · <a href='#' data-pdf='" + esc(L.pdf) + "'>PDF original</a>" : "") + "</div>";
    if (mine.length) h += "<div class='sc'><table><thead><tr><th>Fecho</th><th>Creditado</th><th class='l'>Turno</th><th>MB registado</th><th class='l'>Estado</th></tr></thead><tbody>" + mine.map(function (l) {
      return "<tr" + (l.t ? " data-ir='" + l.t.dia + "'" : "") + "><td>" + dmy(l.c.data).slice(0, 5) + " <small>#" + esc(l.c.fecho) + "</small></td><td class='n'>" + fmt(l.c.valor_c) + "</td><td class='l'>" + (l.t ? dmy(l.t.dia).slice(0, 5) + " " + (l.t.turno === "t1" ? "☀️ T1" : "🌙 T2") : "—") + "</td><td class='n'>" + (l.t ? fmt(l.t.mb_c) : "—") + "</td><td class='l'>" + (l.est === "ok" ? "<span class='b ok'>✔ creditado</span>" : l.est === "dif" ? "<span class='b bad'>⚠ dif. " + fmt(l.c.valor_c - l.t.mb_c) + "</span>" : "<span class='b wn'>? sem turno igual</span>") + "</td></tr>"; }).join("") + "</tbody></table></div>";
    else h += "<p class='mut' style='margin:0;font-size:13px'>Sem créditos Visas/Multibanco do POS " + esc(posEst()) + " neste documento.</p>";
    var rel = outros.filter(function (x) { return x.dados.liq === L.numero; });
    if (rel.length) h += "<div>" + rel.map(chipDoc).join("") + "</div>";
    h += "</div>";
  });
  var soltos = outros.filter(function (x) { return !liqs.some(function (L) { return L.numero === x.dados.liq; }); });
  if (soltos.length) h += "<div class='liq'><h3>Outros documentos de " + esc(nm) + "</h3><div>" + soltos.map(chipDoc).join("") + "</div></div>";
  $("#repDocs").innerHTML = h;
  /* verificações dos documentos deste mês */
  var vis = checks.filter(function (c) { if (!liqs.length && !outros.length) return false; var m = c.grupo.match(/\d{6,}/g); if (m) return m.some(function (n) { return nums[n]; }); if (/fecho \d+ \(/.test(c.grupo)) return !!c.ref && c.ref.slice(0, 7) === M; return true; });
  var g = {}, ord = []; vis.forEach(function (c) { if (!g[c.grupo]) { g[c.grupo] = []; ord.push(c.grupo); } g[c.grupo].push(c); });
  var ne = vis.filter(function (c) { return c.nivel === "erro"; }).length;
  $("#repChecks").innerHTML = vis.length ? "<h2>🔎 Verificações · " + esc(nm) + " <span class='b " + (ne ? "bad" : "ok") + "'>" + (ne ? ne + " erro(s)" : "tudo certo") + "</span></h2>" + ord.map(function (k) { var l = g[k], bad = l.some(function (c) { return c.nivel === "erro"; }), w = l.some(function (c) { return c.nivel === "aviso"; });
    return "<details class='grp'" + (bad || w ? " open" : "") + "><summary>" + (bad ? "❌ " : w ? "⚠️ " : "✅ ") + esc(k) + " <small class='mut' style='font-weight:400'>(" + l.length + ")</small></summary>" + l.map(linhaVerif).join("") + "</details>"; }).join("") : "";
  $$("#repDocs [data-pdf]").forEach(function (a) { a.onclick = function (ev) { ev.preventDefault(); abrirOriginal(a.dataset.pdf); }; });
  $$("#repDocs tr[data-ir]").forEach(function (tr) { tr.style.cursor = "pointer"; tr.onclick = function () { vista("reg"); irDia(tr.dataset.ir); }; });
}
function chipDoc(x) { var d = x.dados; return "<span class='chip'>" + (NOMES_DOC[x.tipo] || x.tipo) + " <b>" + esc(x.numero) + "</b> · " + dmy(x.emissao).slice(0, 5) + (d.total != null ? " · " + MOTOR.pt(d.total) + " €" : "") + (x.pdf ? " <a href='#' data-pdf='" + esc(x.pdf) + "'>PDF</a>" : "") + "</span>"; }
