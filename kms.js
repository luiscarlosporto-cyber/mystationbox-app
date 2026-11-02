/* mystationbox · mapa de quilómetros do gerente (02/11/2026). Gestão → Mapa de kms do gerente. Só administradores.
 * Um mapa por mês, enviado à contabilidade em PDF com a assinatura do gerente.
 * Regras do utilizador: viatura alterna por mês (meses ímpares = Audi A4 70-RR-43, meses pares = Opel Zafira 94-MQ-91);
 * vai a Santo Tirso todos os dias úteis, de manhã ou de tarde, escolhido ao acaso em cada mês (a proposta é diferente
 * todos os meses e fica gravada; pode-se mudar cada dia à mão antes de gravar). Dias úteis = segunda a sexta sem
 * feriados nacionais (os municipais não entram: desmarque à mão). Dados fixos e assinatura em msb_kms_config. */
"use strict";
var KMS = {cfg: null, assin: null, mes: null, viatura: "", dias: {}, gravado: false};
function pascoa(a) { var b = a % 19, c = Math.floor(a / 100), d = a % 100, e = Math.floor(c / 4), f = c % 4, g = Math.floor((c + 8) / 25), h = Math.floor((c - g + 1) / 3), i = (19 * b + c - e - h + 15) % 30, k = Math.floor(d / 4), l = d % 4, m = (32 + 2 * f + 2 * k - i - l) % 7, n = Math.floor((b + 11 * m + 22 * l) / 451), mes = Math.floor((i + m - 7 * n + 114) / 31), dia = ((i + m - 7 * n + 114) % 31) + 1; return new Date(Date.UTC(a, mes - 1, dia)); }
function feriadosPT(a) {
  var p = pascoa(a), iso = function (d) { return d.toISOString().slice(0, 10); }, mais = function (n) { return iso(new Date(p.getTime() + n * 864e5)); };
  var f = {}; [["01-01", "Ano Novo"], ["04-25", "Dia da Liberdade"], ["05-01", "Dia do Trabalhador"], ["06-10", "Dia de Portugal"], ["08-15", "Assunção de Nossa Senhora"], ["10-05", "Implantação da República"], ["11-01", "Todos os Santos"], ["12-01", "Restauração da Independência"], ["12-08", "Imaculada Conceição"], ["12-25", "Natal"]].forEach(function (x) { f[a + "-" + x[0]] = x[1]; });
  f[mais(-2)] = "Sexta-feira Santa"; f[mais(60)] = "Corpo de Deus"; return f;
}
function diasDoMes(M) { var n = new Date(+M.slice(0, 4), +M.slice(5, 7), 0).getDate(), r = []; for (var d = 1; d <= n; d++) r.push(M + "-" + String(d).padStart(2, "0")); return r; }
function semana(iso) { return new Date(iso + "T12:00:00").getDay(); }   // 0 = domingo
function viaturaDoMes(M, c) { return +M.slice(5, 7) % 2 ? c.viaturas.impar : c.viaturas.par; }
function propostaKms(M) {
  var fer = feriadosPT(+M.slice(0, 4)), d = {};
  diasDoMes(M).forEach(function (x) { var w = semana(x); if (w > 0 && w < 6 && !fer[x]) d[x] = Math.random() < 0.5 ? "m" : "t"; });
  return d;
}
async function carregarKms() {
  var box = $("#kmsCorpo"), M = $("#kMes").value || mesHoje(); $("#kMes").value = M; box.innerHTML = "<div class='mut'>A carregar…</div>";
  try {
    var rc = await sb.from("msb_kms_config").select("dados,assinatura").eq("id", 1).maybeSingle(); if (rc.error) throw rc.error;
    if (!rc.data) throw new Error("Falta a configuração do mapa de kms.");
    KMS.cfg = rc.data.dados; KMS.assin = rc.data.assinatura; KMS.mes = M;
    var r = await sb.from("msb_kms").select("*").eq("mes", M).maybeSingle(); if (r.error) throw r.error;
    if (r.data) { KMS.viatura = r.data.viatura; KMS.dias = {}; r.data.dias.forEach(function (x) { KMS.dias[x[0]] = x[1]; }); KMS.km = r.data.km_dia; KMS.eur = +r.data.euro_km; KMS.gravado = true; }
    else { KMS.viatura = viaturaDoMes(M, KMS.cfg); KMS.dias = propostaKms(M); KMS.km = KMS.cfg.km_dia; KMS.eur = KMS.cfg.euro_km; KMS.gravado = false; }
    desenharKms();
  } catch (e) { box.innerHTML = "<div class='card msgErr' style='padding:12px'>✖ " + esc(falhou(e)) + "</div>"; }
}
function totaisKms() { var n = Object.keys(KMS.dias).length; return {n: n, km: n * KMS.km, eur: Math.round(n * KMS.km * KMS.eur * 100)}; }
function horas(p) { return p === "m" ? KMS.cfg.manha : KMS.cfg.tarde; }
function desenharKms() {
  var c = KMS.cfg, M = KMS.mes, fer = feriadosPT(+M.slice(0, 4)), sem = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"], t = totaisKms(), nv = c.nomes_viaturas || {};
  var regra = viaturaDoMes(M, c);
  $("#kmsCorpo").innerHTML =
    "<div class='card' style='padding:14px;display:grid;gap:10px'>" +
    "<div class='bar' style='justify-content:space-between'><b>" + (KMS.gravado ? "✔ Mapa gravado" : "🎲 Proposta (ainda não gravada)") + " · " + esc(nomeMes(M)) + "</b><span class='mut'>" + t.n + " dias · " + t.km + " km · <b>" + fmt(t.eur) + " €</b></span></div>" +
    "<div class='bar'><label>Viatura <select id='kmsViat'>" + [c.viaturas.impar, c.viaturas.par].map(function (v) { return "<option value='" + esc(v) + "'" + (v === KMS.viatura ? " selected" : "") + ">" + esc(v) + (nv[v] ? " · " + esc(nv[v]) : "") + "</option>"; }).join("") + "</select></label>" +
    (KMS.viatura !== regra ? "<span class='b wn'>a regra deste mês é " + esc(regra) + "</span>" : "<span class='mut' style='font-size:13px'>meses ímpares " + esc(c.viaturas.impar) + ", pares " + esc(c.viaturas.par) + "</span>") +
    "<label>km por dia <input id='kmsKm' class='enseIn' style='width:70px' inputmode='numeric' value='" + KMS.km + "'></label><label>€/km <input id='kmsEur' class='enseIn' style='width:70px' inputmode='decimal' value='" + String(KMS.eur).replace(".", ",") + "'></label></div>" +
    "<div class='sc'><table><thead><tr><th>Dia</th><th class='l'></th><th class='l'>Foi?</th><th class='l'>Período</th><th class='l'>Ida</th><th class='l'>Volta</th><th>km</th></tr></thead><tbody>" +
    diasDoMes(M).map(function (x) { var w = semana(x), p = KMS.dias[x], fds = w === 0 || w === 6, h = p ? horas(p) : null;
      return "<tr" + (fds || fer[x] ? " style='opacity:.6'" : "") + "><td>" + x.slice(8) + "</td><td class='l'>" + sem[w] + (fer[x] ? " · <small>" + esc(fer[x]) + "</small>" : "") + "</td>" +
        "<td class='l'><input type='checkbox' class='kmsVai' data-d='" + x + "'" + (p ? " checked" : "") + "></td>" +
        "<td class='l'>" + (p ? "<select class='kmsPer' data-d='" + x + "'><option value='m'" + (p === "m" ? " selected" : "") + ">☀️ manhã</option><option value='t'" + (p === "t" ? " selected" : "") + ">🌙 tarde</option></select>" : "") + "</td>" +
        "<td class='l'>" + (h ? esc(c.origem) + " " + h[0] + " → " + esc(c.destino) + " " + h[1] : "") + "</td><td class='l'>" + (h ? esc(c.destino) + " " + h[2] + " → " + esc(c.origem) + " " + h[3] : "") + "</td><td class='n'>" + (p ? KMS.km : "") + "</td></tr>"; }).join("") +
    "</tbody></table></div>" +
    "<div class='bar'><button class='btn p' id='kmsGravar'>✔ Gravar mapa</button><button class='btn' id='kmsSorteio' title='Escolhe de novo, ao acaso, manhã ou tarde para cada dia útil'>🎲 Nova proposta</button><button class='btn az' id='kmsPdf'>📄 PDF para a contabilidade</button><span id='kmsMsg'></span></div></div>" +
    "<div class='card' style='padding:14px;display:grid;gap:8px'><b>✍️ Assinatura do gerente</b>" +
    (KMS.assin ? "<img src='" + KMS.assin + "' alt='assinatura' style='max-width:240px;background:#fff;border-radius:8px;padding:6px'>" : "<span class='mut'>Sem assinatura.</span>") +
    "<div class='bar'><button class='btn' id='kmsAssBtn'>Trocar assinatura (fotografia em papel branco)</button><input type='file' id='kmsAss' accept='image/*' hidden></div>" +
    "<p class='mut' style='margin:0;font-size:13px'>" + esc(c.nome) + " · NIF " + esc(c.nif) + " · " + esc(c.empresa) + " (NIPC " + esc(c.nipc) + "). Trajeto " + esc(c.origem) + " ↔ " + esc(c.destino) + ", " + esc(c.justificacao) + ".</p></div>";
  var mudou = function () { if (KMS.gravado) { KMS.gravado = false; } desenharKms(); };
  $("#kmsViat").onchange = function () { KMS.viatura = this.value; mudou(); };
  $("#kmsKm").onchange = function () { var v = parseInt(this.value, 10); if (v > 0) KMS.km = v; mudou(); };
  $("#kmsEur").onchange = function () { var v = Number(String(this.value).replace(",", ".")); if (v > 0) KMS.eur = v; mudou(); };
  $$("#kmsCorpo .kmsVai").forEach(function (i) { i.onchange = function () { if (i.checked) KMS.dias[i.dataset.d] = Math.random() < 0.5 ? "m" : "t"; else delete KMS.dias[i.dataset.d]; mudou(); }; });
  $$("#kmsCorpo .kmsPer").forEach(function (s) { s.onchange = function () { KMS.dias[s.dataset.d] = s.value; mudou(); }; });
  $("#kmsSorteio").onclick = function () { if (KMS.gravado && !confirm("Substituir o mapa gravado por uma nova proposta? (só fica gravada se carregar em Gravar)")) return; KMS.dias = propostaKms(KMS.mes); KMS.viatura = viaturaDoMes(KMS.mes, KMS.cfg); mudou(); };
  $("#kmsGravar").onclick = gravarKms;
  $("#kmsPdf").onclick = pdfKms;
  $("#kmsAssBtn").onclick = function () { $("#kmsAss").click(); };
  $("#kmsAss").onchange = function () { var f = this.files[0]; this.value = ""; if (f) trocarAssinatura(f); };
}
async function gravarKms() {
  var t = totaisKms(); if (!t.n) { $("#kmsMsg").innerHTML = "<span class='bad'>Sem dias marcados.</span>"; return false; }
  var dias = Object.keys(KMS.dias).sort().map(function (d) { return [d, KMS.dias[d]]; });
  var r = await sb.from("msb_kms").upsert({mes: KMS.mes, viatura: KMS.viatura, dias: dias, km_dia: KMS.km, euro_km: KMS.eur, criado: new Date().toISOString()}, {onConflict: "mes"});
  if (r.error) { $("#kmsMsg").innerHTML = "<span class='bad'>✖ " + esc(falhou(r.error)) + "</span>"; return false; }
  KMS.gravado = true; desenharKms(); $("#kmsMsg").innerHTML = "<span class='ok'>✔ Gravado (" + t.n + " dias, " + t.km + " km).</span>"; return true;
}
/* fotografia da assinatura → PNG com fundo transparente (só a tinta), recortado */
async function trocarAssinatura(f) {
  try {
    var img = await new Promise(function (ok, ko) { var i = new Image(); i.onload = function () { ok(i); }; i.onerror = function () { ko(new Error("Não consegui abrir a imagem")); }; i.src = URL.createObjectURL(f); });
    var esc1 = Math.min(1, 1400 / img.width), w = Math.round(img.width * esc1), h = Math.round(img.height * esc1), cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    var cx = cv.getContext("2d"); cx.drawImage(img, 0, 0, w, h); var d = cx.getImageData(0, 0, w, h), p = d.data, x0 = w, y0 = h, x1 = 0, y1 = 0;
    var lum = []; for (var i = 0; i < p.length; i += 4) lum.push(0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2]);
    var fundo = lum.slice().sort(function (a, b) { return a - b; })[Math.floor(lum.length * 0.6)];   // papel
    for (var k = 0, j = 0; k < p.length; k += 4, j++) { var tinta = Math.max(0, Math.min(255, (fundo - lum[j] - 25) * 6));
      p[k] = 25; p[k + 1] = 40; p[k + 2] = 140; p[k + 3] = tinta; if (tinta > 100) { var x = j % w, y = Math.floor(j / w); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    if (x1 <= x0) throw new Error("Não encontrei a assinatura na imagem.");
    cx.putImageData(d, 0, 0);
    var o = document.createElement("canvas"), ow = x1 - x0 + 20, oh = y1 - y0 + 20, r = Math.min(1, 400 / ow); o.width = Math.round(ow * r); o.height = Math.round(oh * r);
    o.getContext("2d").drawImage(cv, x0 - 10, y0 - 10, ow, oh, 0, 0, o.width, o.height);
    var url = o.toDataURL("image/png");
    var g = await sb.from("msb_kms_config").update({assinatura: url}).eq("id", 1); if (g.error) throw g.error;
    KMS.assin = url; desenharKms(); $("#kmsMsg").innerHTML = "<span class='ok'>✔ Assinatura trocada.</span>";
  } catch (e) { $("#kmsMsg").innerHTML = "<span class='bad'>✖ " + esc(falhou(e)) + "</span>"; }
}
/* PDF A4 ao alto, como o mapa em Excel que se usava: todos os dias do mês, ida e volta, justificação e km; totais; recebido por; assinatura */
async function fazerPdfKms() {
  var P = window.PDFLib, doc = await P.PDFDocument.create(), F = await doc.embedFont(P.StandardFonts.Helvetica), B = await doc.embedFont(P.StandardFonts.HelveticaBold);
  var mm = function (v) { return v * 72 / 25.4; }, W = 210, H = 297, pg = doc.addPage([mm(W), mm(H)]), c = KMS.cfg, M = KMS.mes, t = totaisKms();
  var azul = P.rgb(0, 0.231, 0.361), lar = P.rgb(0.953, 0.424, 0.129), cinz = P.rgb(0.42, 0.45, 0.5), esc0 = P.rgb(0.1, 0.13, 0.17), claro = P.rgb(0.953, 0.957, 0.965), linha = P.rgb(0.82, 0.84, 0.87);
  var limpa = function (s) { return String(s).replace(/[  ]/g, " ").replace(/[^\x20-\x7E\xA0-\xFF€]/g, ""); };
  var txt = function (s, x, y, o) { o = o || {}; var f = o.b ? B : F, sz = o.t || 8, w = f.widthOfTextAtSize(limpa(s), sz); pg.drawText(limpa(s), {x: mm(x) - (o.dir ? w : o.mid ? w / 2 : 0), y: mm(H - y), size: sz, font: f, color: o.c || esc0}); };
  var ret = function (x, y, w, h, cor) { pg.drawRectangle({x: mm(x), y: mm(H - y - h), width: mm(w), height: mm(h), color: cor}); };
  var nm = nomeMes(M), mesNome = nm.split(" ")[0];
  ret(0, 0, W, 20, azul); ret(0, 20, W, 1.2, lar);
  txt("Mapa de quilómetros", 12, 9.5, {b: 1, t: 15, c: P.rgb(1, 1, 1)}); txt("Deslocações em viatura própria ao serviço da empresa", 12, 15.5, {t: 8.5, c: P.rgb(1, 0.78, 0.6)});
  txt("Mês: " + mesNome.toUpperCase() + "   Ano: " + M.slice(0, 4), W - 12, 9.5, {b: 1, t: 11, c: P.rgb(1, 1, 1), dir: 1}); txt("Viatura: " + KMS.viatura, W - 12, 15.5, {t: 9, c: P.rgb(1, 1, 1), dir: 1});
  var y = 29;
  txt("Empresa:", 12, y, {b: 1}); txt(c.empresa, 30, y); txt("NIPC: " + c.nipc, W - 12, y, {dir: 1}); y += 5;
  txt("Morada:", 12, y, {b: 1}); txt(c.morada, 30, y); y += 8;
  /* tabela */
  var X = [12, 21, 41, 53, 73, 85, 105, 117, 137, 149, 186, 198], cab = ["Dia", "Origem", "Partida", "Destino", "Chegada", "Origem", "Partida", "Destino", "Chegada", "Justificação", "Nº kms"];
  ret(12, y - 4, 186, 6.5, claro);
  cab.forEach(function (h, i) { txt(h, i === 10 ? X[11] - 1 : X[i] + 1, y, {b: 1, t: 7, c: cinz, dir: i === 10}); });
  y += 6;
  diasDoMes(M).forEach(function (d) { var p = KMS.dias[d], h = p ? horas(p) : null;
    pg.drawLine({start: {x: mm(12), y: mm(H - y - 1.8)}, end: {x: mm(198), y: mm(H - y - 1.8)}, thickness: 0.3, color: linha});
    txt(String(+d.slice(8)), X[0] + 1, y, {t: 7.5});
    if (h) { [c.origem, h[0], c.destino, h[1], c.destino, h[2], c.origem, h[3], c.justificacao].forEach(function (v, i) { txt(v, X[i + 1] + 1, y, {t: i === 8 ? 6.6 : 7.2}); });
      txt(String(KMS.km), X[11] - 1, y, {t: 7.5, b: 1, dir: 1}); }
    y += 5.6; });
  y += 3;
  txt("Total de km:", 150, y, {b: 1, t: 9}); txt(String(t.km), 198, y, {b: 1, t: 9, dir: 1}); y += 5.5;
  txt("Valor por km, conforme portaria: " + String(KMS.eur.toFixed(2)).replace(".", ",") + " €", 12, y, {t: 8.5, c: cinz});
  txt("Total recebido:", 150, y, {b: 1, t: 9}); txt(fmt(t.eur) + " €", 198, y, {b: 1, t: 10, dir: 1, c: azul}); y += 9;
  /* recebido por */
  ret(12, y - 4.5, 186, 46, claro);
  txt("Recebido por", 15, y, {b: 1, t: 9, c: azul}); y += 6;
  var ya = y;
  txt("Nome: " + c.nome, 15, y); y += 5.5; txt("Nº fiscal: " + c.nif, 15, y); y += 5.5;
  txt("Morada: " + c.morada.replace(/ (\d{4}-\d{3})/, " · $1"), 15, y, {t: 7.5}); y += 5.5;
  txt("Viatura: " + KMS.viatura + ((c.nomes_viaturas || {})[KMS.viatura] ? " (" + c.nomes_viaturas[KMS.viatura] + ")" : ""), 15, y);
  var ult = diasDoMes(M).pop(); txt("Data: " + dmy(ult), 15, y + 5.5);
  txt("Assinatura", 154, ya, {t: 7.5, c: cinz, mid: 1});
  if (KMS.assin) { var png = await doc.embedPng(KMS.assin), sw = 56, sh = sw * png.height / png.width; if (sh > 26) { sh = 26; sw = sh * png.width / png.height; }
    pg.drawImage(png, {x: mm(154 - sw / 2), y: mm(H - (ya + 3 + sh)), width: mm(sw), height: mm(sh)}); }
  pg.drawLine({start: {x: mm(122), y: mm(H - ya - 30)}, end: {x: mm(186), y: mm(H - ya - 30)}, thickness: 0.5, color: cinz});
  txt(c.nome, 154, ya + 33.5, {t: 7, c: cinz, mid: 1});
  txt("mystationbox · gerado em " + new Date().toLocaleString("pt-PT"), W - 12, H - 6, {t: 6.5, c: cinz, dir: 1});
  return doc.save();
}
async function pdfKms() {
  try {
    if (!KMS.gravado && !(await gravarKms())) return;
    await carregarPdfLib();
    var bytes = await fazerPdfKms(), url = URL.createObjectURL(new Blob([bytes], {type: "application/pdf"})), a = document.createElement("a");
    a.href = url; a.download = "Mapa_kms_" + KMS.mes + "_" + KMS.viatura.replace(/\W/g, "") + ".pdf"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  } catch (e) { $("#kmsMsg").innerHTML = "<span class='bad'>✖ " + esc(falhou(e)) + "</span>"; }
}
$("#kAnt").onclick = function () { $("#kMes").value = addMes($("#kMes").value || mesHoje(), -1); carregarKms(); };
$("#kSeg").onclick = function () { $("#kMes").value = addMes($("#kMes").value || mesHoje(), 1); carregarKms(); };
$("#kMes").onchange = carregarKms;
