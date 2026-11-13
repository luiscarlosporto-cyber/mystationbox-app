/* mystationbox · leitores na cloud: folha de turno (.xls), fechos digitalizados (MB/Solred) e documentos Repsol (PDF).
 * Usa o MOTOR (motor.js, igual aos leitores Python do PC) e as variáveis globais do index.html
 * (sb, EST, DIA, LINHAS, ADMIN, POSES, irDia, status, fmt, cent, eur, esc, dmy, num, iso, addDia, addMes, falhou). */
"use strict";
var CAMPO_COL = {func: "func", vendas: "vendas_c", mb: "mb_c", solred: "solred_c", pres: "pres_c", num: "num_c", forn: "forn_c", chq: "chq_c", lit: "lit_cl"};
var NOME_CAMPO = {func: "Funcionário", vendas: "Vendas", mb: "MB", solred: "Solred €", pres: "Solred presente", num: "Numerário", forn: "Fornecedores", chq: "Cheques", lit: "Solred litros"};
/* terminal automático de combustível (OPT, só MB e Solred): o seu MB conta à parte do MB da loja (dono, 12/11/2026) */
function posOpt(est) { return (POSES_OPT[est || EST] || "").replace(/^0+/, ""); }
/* créditos MB do terminal automático, tirados das liquidações guardadas (uma fonte só: msb_docs) */
function creditosOpt(docs) {
  var p = posOpt(), R = []; if (!p) return R;
  docs.forEach(function (d) { if (d.tipo !== "LIQ") return; (d.dados.itens || []).forEach(function (it) {
    if (it.tipo.indexOf("Visa") === 0 && String(it.pos).replace(/^0+/, "") === p) R.push({doc: d.numero, emissao: d.emissao, data: it.data, fecho: it.fecho, numdoc: it.numdoc, valor_c: Math.round(it.valor * 100)}); }); });
  return R.sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : 0; });
}
function posEst(est) { return (POSES[est || EST] || "").replace(/^0+/, ""); }
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
function prepararOCR(im, W, raio) {
  W = W || 1600; raio = raio == null ? 1 : raio;
  var H = Math.round(im.height * W / im.width), c = document.createElement("canvas"); c.width = W; c.height = H;
  var x = c.getContext("2d"); x.drawImage(im, 0, 0, W, H);
  var d = x.getImageData(0, 0, W, H), p = d.data, n = W * H, g = new Uint8ClampedArray(n), hist = new Array(256).fill(0), i;
  for (i = 0; i < n; i++) { var v = (p[i * 4] * 299 + p[i * 4 + 1] * 587 + p[i * 4 + 2] * 114) / 1000 | 0; g[i] = v; hist[v]++; }
  var lo = 0, hi = 255, acc = 0; while (acc + hist[lo] < n * .01) { acc += hist[lo]; lo++; } acc = 0; while (acc + hist[hi] < n * .01) { acc += hist[hi]; hi--; }
  var k = 255 / Math.max(1, hi - lo), o = new Uint8ClampedArray(n);
  for (var y = 0; y < H; y++) for (var xx = 0; xx < W; xx++) { var m = 255; for (var dy = -raio; dy <= raio; dy++) { var yy = y + dy; if (yy < 0 || yy >= H) continue; for (var dx = -raio; dx <= raio; dx++) { var x2 = xx + dx; if (x2 < 0 || x2 >= W) continue; var q = g[yy * W + x2]; if (q < m) m = q; } } o[y * W + xx] = m; }
  for (i = 0; i < n; i++) { var w = Math.max(0, Math.min(255, (o[i] - lo) * k)); p[i * 4] = p[i * 4 + 1] = p[i * 4 + 2] = w; }
  x.putImageData(d, 0, 0); return c;
}
function fotoJPEG(im) { var W = Math.min(1400, im.width), c = document.createElement("canvas"); c.width = W; c.height = Math.round(im.height * W / im.width); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
  return new Promise(function (ok) { c.toBlob(function (b) { ok(b); }, "image/jpeg", .82); }); }
$("#bFecho").onclick = function () { $("#fFecho").click(); };
$("#fFecho").onchange = async function () {
  var f = this.files[0]; this.value = ""; if (!f) return;
  painel("<h3>🧾 A ler o talão…</h3><p class='mut' style='margin:0'>Na primeira vez demora 20 a 40 segundos (descarrega o leitor de texto). Depois é mais rápido.</p><p class='mut' style='margin:0;font-size:13px'>📸 Para ler bem: o talão <b>inteiro</b> na fotografia (do cabeçalho ao TOTAL), direito, esticado e com boa luz, sem sombras.</p><div id='fcPr' class='mut' style='font-size:12px'></div>");
  FC = {r: null, foto: null, url: "", texto: ""};
  try {
    var im = await imagem(f); FC.foto = await fotoJPEG(im); FC.url = URL.createObjectURL(FC.foto);
    await carregarTesseract();
    var passo = "";
    var w = await Tesseract.createWorker("eng", 1, {logger: function (m) { if (m.status === "recognizing text" && $("#fcPr")) $("#fcPr").textContent = passo + " · " + Math.round(m.progress * 100) + "%"; }});
    /* várias leituras com tratamentos diferentes (medidos nas fotografias reais); fica a que tem as contas do talão a bater certo */
    var VARIANTES = [["1.ª leitura", 1600, 1, "6"], ["2.ª leitura (traço grosso)", 2200, 2, "6"], ["3.ª leitura (por blocos)", 1600, 1, "4"], ["4.ª leitura (sem filtro)", 1600, 0, "6"]];
    var melhor = null;
    for (var i = 0; i < VARIANTES.length; i++) {
      var v = VARIANTES[i]; passo = v[0];
      await w.setParameters({tessedit_pageseg_mode: v[3]});
      var res = await w.recognize(prepararOCR(im, v[1], v[2])), r = null;
      try { r = MOTOR.lerFecho(res.data.text); } catch (e) { r = null; }
      var pts = MOTOR.pontuarFecho(r);
      if (!melhor || pts > melhor.p) melhor = {p: pts, r: r, t: res.data.text, n: v[0]};
      var bom = r && r.verificacoes.filter(function (c) { return c.nivel === "ok"; }).length >= (r.tipo === "MB" ? 1 : 2) && !r.verificacoes.some(function (c) { return c.nivel === "erro"; });
      if (bom) break;   // contas do talão confirmadas: não é preciso ler outra vez
    }
    await w.terminate();
    FC.texto = melhor.t; FC.r = melhor.r; FC.passagem = melhor.n + " de " + (i < VARIANTES.length ? i + 1 : VARIANTES.length);
    if (!FC.r) throw new Error("Não reconheci o talão em nenhuma das leituras");
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
  if (lido.length) h += "<p class='mut' style='margin:0;font-size:12px'>Lido no talão: " + esc(lido.join(" · ")) + (FC.passagem ? " · " + esc(FC.passagem) : "") + "</p>";
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
/* Grava um documento Repsol já lido e, sendo liquidação, os créditos MB deste posto. Serve o PDF carregado à mão e o que vem da Saphety.
   A estação vem de quem chama e fica fixa até ao fim: mudar de estação a meio de uma leitura gravava documentos de Penafiel em Santo Tirso (corrigido 12/11/2026). */
async function guardarDocRepsol(rec, caminho, est) {
  var EST = est;
  var chave = rec.tipo + "|" + rec.numero, ex = await sb.from("msb_docs").select("chave").eq("estacao", EST).eq("chave", chave).maybeSingle();
  var r = await sb.from("msb_docs").upsert({estacao: EST, chave: chave, tipo: rec.tipo, numero: rec.numero, emissao: rec.emissao || null, dados: rec, pdf: caminho}, {onConflict: "estacao,chave"});
  if (r.error) throw r.error;
  var mb = 0;
  if (rec.tipo === "LIQ") {
    var cr = rec.itens.filter(function (it) { return it.tipo.indexOf("Visa") === 0 && it.pos.replace(/^0+/, "") === posEst(EST); }).map(function (it) {
      return {estacao: EST, chave: it.pos + "|" + it.fecho + "|" + it.numdoc, doc: rec.liq, emissao: rec.emissao || null, data: it.data, valor_c: Math.round(it.valor * 100), pos: it.pos, fecho: it.fecho, numdoc: it.numdoc}; });
    if (cr.length) { var r2 = await sb.from("msb_creditos_mb").upsert(cr, {onConflict: "estacao,chave"}); if (r2.error) throw r2.error; }
    mb = cr.length;
  }
  return {mb: mb, existia: !!ex.data};
}
/* Liquidações («Extrato de Conta») e autofaturas Solred (Z3AF) recolhidas pelo OCTAN AI na Saphety (07/11/2026): lidas aqui pelo mesmo leitor do PDF carregado à mão.
   O original fica onde a Saphety o guardou. O que não for liquidação reconhecida fica marcado «outro» e não grava nada. */
async function importarLiqSaphety() {
  if (!ADMIN) return 0;
  var EST = window.EST;   // fica fixa durante toda a leitura, mesmo que o utilizador mude de estação
  var r = await lerTudo(function () { return sb.from("msb_saphety_docs").select("numero,original").eq("estacao", EST).eq("estado", "recolhido").or("tipo.eq.Extrato de Conta,numero.like.Z3AF*"); }, ["numero"]); if (r.error) throw r.error;
  var n = 0;
  for (var i = 0; i < (r.data || []).length; i++) {
    var d = r.data[i], estado = "outro";
    try {
      var f = await sb.storage.from("msb-originais").download(d.original); if (f.error) throw f.error;
      var rec = MOTOR.lerDocumento(await MOTOR.pdfPaginas(new Uint8Array(await f.data.arrayBuffer()), inflar));
      if ((rec.tipo === "LIQ" || rec.tipo === "VF") && rec.ok) { await guardarDocRepsol(rec, d.original, EST); estado = rec.tipo === "LIQ" ? "liquidacao" : "autofatura"; n++; }
    } catch (e) { continue; }   // sem rede ou original em falta: tenta na próxima vez
    var u = await sb.from("msb_saphety_docs").update({estado: estado}).eq("estacao", EST).eq("numero", d.numero).eq("estado", "recolhido"); if (u.error) throw u.error;
  }
  return n;
}
async function carregarPdfs(files) {
  var box = $("#repProg"), linhas = [], ultimo = null, est = EST; box.hidden = false;   // estação fixa durante o carregamento
  function mostra() { box.innerHTML = "<b>📄 Documentos</b>" + linhas.map(function (l) { return "<div style='font-size:14px'>" + l + "</div>"; }).join(""); }
  for (var i = 0; i < files.length; i++) {
    var f = files[i]; linhas.push("⏳ " + esc(f.name)); mostra();
    try {
      var bytes = new Uint8Array(await f.arrayBuffer()), pags = await MOTOR.pdfPaginas(bytes, inflar);
      if (!pags.length) throw new Error("Não consegui ler este PDF");
      var rec = MOTOR.lerDocumento(pags);
      if (!rec.tipo || !rec.ok) throw new Error("Não reconheci este documento (use os PDF originais da Repsol)");
      var caminho = await guardarOriginal(est + "/repsol/" + rec.tipo + "_" + String(rec.numero).replace(/\W/g, "") + "_" + await sha(bytes) + ".pdf", f, "application/pdf");
      var g = await guardarDocRepsol(rec, caminho, est), mb = g.mb, ex = {data: g.existia};
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
    try { await importarLiqSaphety(); } catch (e) { msbAviso("Não consegui ler as liquidações da Saphety: " + falhou(e)); }
    var rd = await lerTudo(function () { return sb.from("msb_docs").select("chave,tipo,numero,emissao,dados,pdf").eq("estacao", EST); }, ["chave"]); if (rd.error) throw rd.error;
    var rc = await lerTudo(function () { return sb.from("msb_creditos_mb").select("*").eq("estacao", EST); }, ["chave"]); if (rc.error) throw rc.error;
    var rx = await lerTudo(function () { return sb.from("msb_transferencias").select("*").eq("estacao", EST); }, ["chave"]); if (rx.error) throw rx.error;
    var docs = rd.data || [], cred = rc.data || [];
    var trs = (rx.data || []).map(function (t) { return {chave: "TR|" + t.chave, doc: t.chave, numdoc: t.chave, data: t.dia, valor_c: t.valor_c, pos: "", fecho: "", transf: true, ttipo: t.tipo}; });
    var datas = cred.map(function (c) { return c.data; }).concat(trs.map(function (t) { return addDia(t.data, -11); })).concat(docs.map(function (d) { return d.emissao; }).filter(Boolean)).concat([M + "-01", addMes(M, 1) + "-01"]).sort();
    var ini = addDia(datas[0], -2), fim = addDia(datas[datas.length - 1], 2);
    var rt = await lerTudo(function () { return sb.from("msb_turnos").select("dia,turno,func,mb_c,solred_c,lit_cl").eq("estacao", EST).gte("dia", ini).lte("dia", fim); }, ["dia", "turno"]); if (rt.error) throw rt.error;
    var turnos = rt.data || [], dias = {};
    turnos.forEach(function (t) { var o = (dias[t.dia] = dias[t.dia] || {t1: {}, t2: {}})[t.turno]; if (t.lit_cl != null) o.lit = (t.lit_cl / 100).toFixed(2).replace(".", ","); if (t.solred_c != null) o.solred = (t.solred_c / 100).toFixed(2).replace(".", ","); });
    var ligados = ligarCreditos(cred, turnos), usados = {};
    ligados.forEach(function (l) { if (l.t) usados[l.t.dia + l.t.turno] = 1; });
    /* créditos pagos por transferência (transferencias.js): MB entram na conferência como os da liquidação */
    var ligMB = ligarTransf(trs.filter(function (t) { return t.ttipo === "MB"; }), turnos, "mb_c", usados);
    var ligSol = ligarTransf(trs.filter(function (t) { return t.ttipo === "SOLRED"; }), turnos, "solred_c", {});
    ligados = ligados.concat(ligMB);
    desenharRepsol(M, docs, ligados, turnos, MOTOR.verificar(docs.map(function (d) { return d.dados; }), {pos: posEst() || "36613", pos_opt: posOpt(), dias: dias}), ligMB, ligSol);
  } catch (e) { docsBox.innerHTML = "<div class='bad'>" + esc(falhou(e)) + "</div>"; }
}
function desenharRepsol(M, docs, ligados, turnos, checks, ligMB, ligSol) {
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
  var soltos = ligados.filter(function (l) { return !l.t && (l.c.data || "").slice(0, 7) === M; });
  var h = conferenciaMB(nm, tm, ligTurno, primeira, ultima, soltos) + seccaoOpt(M, nm, docs) + seccaoTransf(M, nm, ligMB || [], ligSol || []);
  if (falta.length) h += "<div class='liq'><h3>⚠️ MB por creditar (" + falta.length + ")<span class='mut' style='font-weight:400;font-size:13px'>turnos com MB sem crédito igual nos documentos carregados</span></h3><div class='sc'><table><thead><tr><th>Dia</th><th class='l'>Turno</th><th>MB registado</th><th class='l'>Crédito mais próximo</th></tr></thead><tbody>" +
    falta.map(function (x) { return "<tr><td>" + dmy(x.t.dia) + "</td><td class='l'>" + (x.t.turno === "t1" ? "☀️ T1" : "🌙 T2") + " " + esc(x.t.func || "") + "</td><td class='n'>" + fmt(x.t.mb_c) + "</td><td class='l'>" + (x.l ? "fecho " + esc(x.l.c.fecho) + " · " + fmt(x.l.c.valor_c) + " <span class='b wn'>dif. " + fmt(x.l.c.valor_c - x.t.mb_c) + "</span>" : "<span class='mut'>nenhum</span>") + "</td></tr>"; }).join("") + "</tbody></table></div></div>";
  if (!liqs.length && !outros.length && !h) h += "<div class='vazio'>Sem documentos da Repsol emitidos em " + esc(nm) + "." + (ADMIN ? " Carregue os PDF com o botão laranja (pode escolher vários)." : "") + "</div>";
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
  /* data de emissão do documento ao lado do número, e grupos por ordem de data */
  var emis = {}; docs.forEach(function (d) { if (d.emissao) emis[d.numero] = d.emissao; });
  var dataGrupo = function (k) { var m = k.match(/\d{6,}/); return m && emis[m[0]] || ""; };
  ord.sort(function (a, b) { var x = dataGrupo(a) || "9", y = dataGrupo(b) || "9"; return x < y ? -1 : x > y ? 1 : 0; });
  var ne = vis.filter(function (c) { return c.nivel === "erro"; }).length;
  $("#repChecks").innerHTML = vis.length ? "<h2>🔎 Verificações · " + esc(nm) + " <span class='b " + (ne ? "bad" : "ok") + "'>" + (ne ? ne + " erro(s)" : "tudo certo") + "</span></h2>" + ord.map(function (k) { var l = g[k], bad = l.some(function (c) { return c.nivel === "erro"; }), w = l.some(function (c) { return c.nivel === "aviso"; });
    return "<details class='grp'" + (bad || w ? " open" : "") + "><summary>" + (bad ? "❌ " : w ? "⚠️ " : "✅ ") + esc(k) + (dataGrupo(k) ? " <span style='font-weight:400'>· " + dmy(dataGrupo(k)) + "</span>" : "") + " <small class='mut' style='font-weight:400'>(" + l.length + ")</small></summary>" + l.map(linhaVerif).join("") + "</details>"; }).join("") : "";
  $$("#repDocs [data-pdf]").forEach(function (a) { a.onclick = function (ev) { ev.preventDefault(); abrirOriginal(a.dataset.pdf); }; });
  var bp = $("#bMbPdf"); if (bp) bp.onclick = function () { pdfMB(M); };
  var so = $("#mbSoNao"); if (so) so.onchange = function () { $$("#mbConf tbody tr").forEach(function (tr) { tr.hidden = so.checked && tr.dataset.ok === "1"; }); };
  $$("#repDocs tr[data-ir], #trConf tr[data-ir]").forEach(function (tr) { tr.style.cursor = "pointer"; tr.onclick = function () { vista("reg"); irDia(tr.dataset.ir); }; });
}
/* Conferência turno a turno: MB registado na caixa × MB creditado nos documentos de liquidação.
   Verde = creditado com o mesmo valor; laranja = ainda não creditado (em falta, por liquidar, com diferença ou sem verificação). */
var MBCONF = null;   // última conferência desenhada (para o PDF da contabilidade, mbpdf.js)
/* soltos: créditos MB do mês sem turno registado na caixa (ex.: Penafiel enquanto a caixa não é registada, dono 12/11/2026).
   Aparecem com o MB registado «em falta, por registar»; ao registar o turno, a ligação faz-se sozinha. */
function conferenciaMB(nm, tm, ligTurno, primeira, ultima, soltos) {
  soltos = soltos || [];
  if (!tm.length && !soltos.length) { MBCONF = null; return ""; }
  var R = [], T = {r: 0, c: 0, n: 0, nc: 0, d: 0, cm: 0, cs: 0}, linhas = tm.slice().sort(function (a, b) { return a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : a.turno < b.turno ? -1 : 1; }).map(function (t) {
    var l = ligTurno[t.dia + t.turno], ok = l && l.est === "ok", cred = l && l.c ? l.c.valor_c : null, est;
    /* data do documento que creditou (liquidação: emissão; transferência: dia): diz se o MB entrou no próprio mês ou depois (dono, 09/11/2026) */
    var em = l && l.c ? l.c.emissao || l.c.data : null, depois = em && em.slice(0, 7) > t.dia.slice(0, 7);
    if (cred != null) { if (depois) T.cs += cred; else T.cm += cred; }
    if (ok) est = "✔ creditado";
    else if (l && l.est === "dif") est = "⚠ creditado com diferença";
    else if (t.dia < primeira) est = "sem documento para verificar";
    else if (t.dia <= addDia(ultima, -1)) est = "✖ em falta nos documentos";
    else est = "⏳ ainda não liquidado";
    R.push({dia: t.dia, turno: t.turno, func: t.func || "", reg: t.mb_c, cred: cred, transf: !!(l && l.c && l.c.transf), demis: em || "", doc: l && l.c ? l.c.doc : "", fecho: l && l.c ? l.c.fecho : "", dcred: l && l.c ? l.c.data : "",
      est: ok ? "creditado" : l && l.est === "dif" ? "creditado com diferença" : t.dia < primeira ? "sem documento para verificar" : t.dia <= addDia(ultima, -1) ? "em falta nos documentos" : "ainda não liquidado"});
    T.r += t.mb_c; if (cred != null) { T.c += cred; T.d += cred - t.mb_c; } if (ok) T.n++; else T.nc += t.mb_c;
    R[R.length - 1].ord = t.dia + t.turno;
    return "<tr data-ord='" + t.dia + t.turno + "' class='" + (ok ? "lin-ok" : "lin-wn") + "' data-ir='" + t.dia + "' data-ok='" + (ok ? 1 : 0) + "'><td>" + dmy(t.dia).slice(0, 5) + "</td><td class='l'>" + (t.turno === "t1" ? "☀️ T1" : "🌙 T2") + " " + esc(t.func || "") + "</td><td class='n'>" + fmt(t.mb_c) + "</td><td class='n'>" + (cred == null ? "—" : fmt(cred)) + "</td><td class='l'>" + (l && l.c ? (l.c.transf ? "🏦 Transf. " + esc(l.c.doc) + " <small class='mut'>" + dmy(l.c.data).slice(0, 5) + "</small>" : "Liq. " + esc(l.c.doc) + " <small class='mut'>fecho #" + esc(l.c.fecho) + " · " + dmy(l.c.data).slice(0, 5) + "</small>") : "—") + "</td><td>" + (em ? (depois ? "<b style='color:var(--wn,#B45309)'>" + dmy(em) + "</b><br><small>⏭️ mês seguinte</small>" : dmy(em)) : "—") + "</td><td class='n'>" + (cred == null ? "—" : sinal(cred - t.mb_c)) + "</td><td class='l'><b>" + est + "</b></td></tr>";
  });
  T.pr = 0; T.npr = 0;
  soltos.forEach(function (l) { var c = l.c, em = c.emissao || c.data, depois = em && em.slice(0, 7) > c.data.slice(0, 7);
    if (depois) T.cs += c.valor_c; else T.cm += c.valor_c; T.c += c.valor_c; T.pr += c.valor_c; T.npr++;
    R.push({dia: c.data, turno: "", func: "", reg: null, cred: c.valor_c, transf: !!c.transf, demis: em || "", doc: c.doc, fecho: c.fecho, dcred: c.data, est: "MB registado em falta", ord: c.data + "z" + String(c.fecho).padStart(5, "0")});
    linhas.push("<tr data-ord='" + c.data + "z" + String(c.fecho).padStart(5, "0") + "' class='lin-wn' data-ir='" + c.data + "' data-ok='0'><td>" + dmy(c.data).slice(0, 5) + "</td><td class='l mut'>" + (c.transf ? "—" : "fecho #" + esc(c.fecho)) + "</td><td class='n'><b style='color:var(--wn,#B45309)'>por registar</b></td><td class='n'>" + fmt(c.valor_c) + "</td><td class='l'>" + (c.transf ? "🏦 Transf. " + esc(c.doc) : "Liq. " + esc(c.doc) + " <small class='mut'>fecho #" + esc(c.fecho) + " · " + dmy(c.data).slice(0, 5) + "</small>") + "</td><td>" + (em ? (depois ? "<b style='color:var(--wn,#B45309)'>" + dmy(em) + "</b>" : dmy(em)) : "—") + "</td><td class='n'>—</td><td class='l'><b style='color:var(--wn,#B45309)'>✖ MB registado em falta</b></td></tr>"); });
  R.sort(function (a, b) { return a.ord < b.ord ? -1 : a.ord > b.ord ? 1 : 0; });
  linhas.sort(function (a, b) { var x = a.match(/data-ord='([^']*)'/)[1], y = b.match(/data-ord='([^']*)'/)[1]; return x < y ? -1 : x > y ? 1 : 0; });
  MBCONF = {nm: nm, linhas: R, T: T};
  return "<div class='liq'><h3>💳 MB registado × creditado · " + esc(nm) + (ADMIN ? " <button class='btn' id='bMbPdf' style='font-size:13px;padding:4px 10px'>📄 PDF para a contabilidade</button>" : "") + "<span class='mut' style='font-weight:400;font-size:13px'>" + T.n + " de " + tm.length + " turnos creditados" + (T.npr ? " · " + T.npr + " créditos sem turno registado (" + fmt(T.pr) + " €)" : "") + " · no mês " + fmt(T.cm) + " € · no mês seguinte " + fmt(T.cs) + " € · por creditar " + fmt(T.nc) + " €</span></h3>" +
    "<label class='mut' style='font-size:13px;display:flex;gap:6px;align-items:center;margin:0 0 6px'><input type='checkbox' id='mbSoNao'> Mostrar só os não creditados</label>" +
    "<div class='sc'><table id='mbConf'><thead><tr><th>Dia</th><th class='l'>Turno</th><th>MB registado</th><th>MB creditado</th><th class='l'>Documento</th><th>Liquidação de</th><th>Diferença</th><th class='l'>Estado</th></tr></thead><tbody>" + linhas.join("") +
    "</tbody><tfoot><tr><th colspan='2' class='l'>Total</th><th class='n'>" + fmt(T.r) + "</th><th class='n'>" + fmt(T.c) + "</th><th></th><th class='l' style='font-weight:400;font-size:12.5px'>no mês " + fmt(T.cm) + " €<br>mês seguinte " + fmt(T.cs) + " €</th><th class='n'>" + sinal(T.d) + "</th><th class='l'>por creditar " + fmt(T.nc) + " €" + (T.npr ? "<br>por registar " + fmt(T.pr) + " €" : "") + "</th></tr></tfoot></table></div></div>";
}
/* MB do terminal automático no mês (pela data da operação): não tem turno na caixa, por isso não entra na conferência MB × turnos */
var MBOPT = null;   // para o PDF da contabilidade (mbpdf.js)
function seccaoOpt(M, nm, docs) {
  var L = creditosOpt(docs).filter(function (c) { return (c.data || "").slice(0, 7) === M; });
  MBOPT = posOpt() ? {pos: posOpt(), linhas: L, total: L.reduce(function (s, c) { return s + c.valor_c; }, 0)} : null;
  if (!MBOPT) return "";
  var cm = 0, cs = 0; L.forEach(function (c) { if ((c.emissao || "").slice(0, 7) > M) cs += c.valor_c; else cm += c.valor_c; });
  return "<div class='liq'><h3>⛽ MB do terminal automático · " + esc(nm) + "<span class='mut' style='font-weight:400;font-size:13px'>POS " + esc(MBOPT.pos) + " · pagamento na bomba (só MB e Solred) · " + L.length + " créditos · " + fmt(MBOPT.total) + " € · liquidado no mês " + fmt(cm) + " € · no mês seguinte " + fmt(cs) + " €</span></h3>" +
    (L.length ? "<div class='sc'><table><thead><tr><th>Dia da operação</th><th>Creditado</th><th class='l'>Documento</th><th>Liquidação de</th></tr></thead><tbody>" + L.map(function (c) {
      return "<tr><td>" + dmy(c.data) + "</td><td class='n'>" + fmt(c.valor_c) + "</td><td class='l'>Liq. " + esc(c.doc) + " · fecho " + esc(c.fecho) + "</td><td>" + (c.emissao ? dmy(c.emissao) : "—") + ((c.emissao || "").slice(0, 7) > M ? " <span class='b wn'>mês seguinte</span>" : "") + "</td></tr>"; }).join("") +
      "</tbody><tfoot><tr><th class='l'>Total</th><th class='n'>" + fmt(MBOPT.total) + "</th><th colspan='2'></th></tr></tfoot></table></div>"
      : "<p class='mut' style='margin:0;font-size:13px'>Sem créditos do terminal automático com operações em " + esc(nm) + " nos documentos carregados.</p>") + "</div>";
}
function chipDoc(x) { var d = x.dados; return "<span class='chip'>" + (NOMES_DOC[x.tipo] || x.tipo) + " <b>" + esc(x.numero) + "</b> · " + dmy(x.emissao).slice(0, 5) + (d.total != null ? " · " + MOTOR.pt(d.total) + " €" : "") + (x.pdf ? " <a href='#' data-pdf='" + esc(x.pdf) + "'>PDF</a>" : "") + "</span>"; }
