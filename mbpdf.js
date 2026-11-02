/* mystationbox · PDF mensal dos créditos MB para a contabilidade (02/11/2026).
 * Usa a conferência "MB registado × creditado" já desenhada (MBCONF, leitores.js): uma linha por turno com o MB registado
 * na caixa, o valor creditado, o documento (liquidação + fecho, ou transferência) e o estado; totais e resumo por documento.
 * A4 ao alto, várias páginas se for preciso. pdf-lib (carregarPdfLib, combustivel.js). */
"use strict";
async function fazerPdfMB(M, C, ent, inst) {
  var P = window.PDFLib, doc = await P.PDFDocument.create(), F = await doc.embedFont(P.StandardFonts.Helvetica), B = await doc.embedFont(P.StandardFonts.HelveticaBold);
  var mm = function (v) { return v * 72 / 25.4; }, W = 210, H = 297, pg, y;
  var azul = P.rgb(0, 0.231, 0.361), lar = P.rgb(0.953, 0.424, 0.129), cinz = P.rgb(0.42, 0.45, 0.5), esc0 = P.rgb(0.1, 0.13, 0.17), claro = P.rgb(0.953, 0.957, 0.965);
  var verde = P.rgb(0.09, 0.5, 0.3), lar2 = P.rgb(0.75, 0.3, 0.05), verdeF = P.rgb(0.91, 0.97, 0.93), larF = P.rgb(1, 0.95, 0.9);
  var limpa = function (t) { return String(t).replace(/[  ]/g, " ").replace(/[^\x20-\x7E\xA0-\xFF€]/g, ""); };
  var txt = function (s, x, yy, o) { o = o || {}; var f = o.b ? B : F, t = o.t || 8.5, w = f.widthOfTextAtSize(limpa(s), t);
    pg.drawText(limpa(s), {x: mm(x) - (o.dir ? w : o.mid ? w / 2 : 0), y: mm(H - yy), size: t, font: f, color: o.c || esc0}); };
  var ret = function (x, yy, w, h, cor) { pg.drawRectangle({x: mm(x), y: mm(H - yy - h), width: mm(w), height: mm(h), color: cor}); };
  var titulo = "Créditos Multibanco · " + C.nm.replace(/^./, function (c) { return c.toUpperCase(); });
  var X = {dia: 14, tur: 29, reg: 76, cred: 99, doc: 103, dif: 160, est: 163};
  function cabTabela() {
    ret(14, y - 4.5, W - 28, 7.5, claro);
    txt("Dia", X.dia, y, {b: 1, t: 7.5, c: cinz}); txt("Turno", X.tur, y, {b: 1, t: 7.5, c: cinz});
    txt("MB registado", X.reg, y, {b: 1, t: 7.5, c: cinz, dir: 1}); txt("MB creditado", X.cred, y, {b: 1, t: 7.5, c: cinz, dir: 1});
    txt("Documento", X.doc, y, {b: 1, t: 7.5, c: cinz}); txt("Diferença", X.dif, y, {b: 1, t: 7.5, c: cinz, dir: 1}); txt("Estado", X.est, y, {b: 1, t: 7.5, c: cinz});
    y += 7;
  }
  function novaPagina(primeira, semTabela) {
    pg = doc.addPage([mm(W), mm(H)]);
    if (primeira) {
      ret(0, 0, W, 24, azul); ret(0, 24, W, 1.2, lar);
      txt(titulo, 14, 11, {b: 1, t: 15, c: P.rgb(1, 1, 1)});
      txt("Multibanco registado na caixa × creditado pela Repsol", 14, 18.5, {t: 9, c: P.rgb(1, 0.78, 0.6)});
      txt(ent, W - 14, 11, {dir: 1, t: 9, c: P.rgb(1, 1, 1)}); txt(inst, W - 14, 18.5, {dir: 1, t: 9, c: P.rgb(1, 1, 1)});
      y = 34;
      var T = C.T, cx = [["Registado na caixa", T.r], ["Creditado", T.c], ["Por creditar", T.nc]], bw = (W - 28 - 8) / 3;
      cx.forEach(function (k, i) { var x = 14 + i * (bw + 4); ret(x, y - 4, bw, 15, i === 2 && T.nc ? larF : i === 1 ? verdeF : claro);
        txt(k[0], x + 3, y + 0.5, {t: 7.5, c: cinz}); txt(fmt(k[1]) + " €", x + 3, y + 7.5, {b: 1, t: 12, c: i === 2 && T.nc ? lar2 : i === 1 ? verde : esc0}); });
      y += 17;
      txt(T.n + " de " + C.linhas.length + " turnos creditados com o mesmo valor. Diferença total creditado - registado (só turnos com crédito): " + sinalPdf(T.d) + " €.", 14, y, {t: 8, c: cinz});
      y += 8;
    } else { y = 16; txt(titulo + " (continuação)", 14, y, {b: 1, t: 10, c: azul}); y += 8; }
    if (!semTabela) cabTabela();
  }
  function sinalPdf(c) { return (c > 0 ? "+" : "") + fmt(c); }
  novaPagina(true);
  C.linhas.forEach(function (r, i) {
    if (y > H - 20) novaPagina(false);
    var ok = r.est === "creditado";
    ret(14, y - 4, W - 28, 6, ok ? verdeF : larF); ret(14, y - 4, 0.9, 6, ok ? verde : lar);
    txt(dmy(r.dia).slice(0, 5), X.dia + 2, y); txt((r.turno === "t1" ? "T1" : "T2") + (r.func ? " " + r.func : ""), X.tur, y);
    txt(fmt(r.reg), X.reg, y, {dir: 1}); txt(r.cred == null ? "-" : fmt(r.cred), X.cred, y, {dir: 1});
    txt(r.doc ? (r.transf ? "Transf. " + r.doc : "Liq. " + r.doc + " · fecho " + r.fecho) + " · " + dmy(r.dcred).slice(0, 5) : "-", X.doc, y, {t: 7.5});
    txt(r.cred == null ? "-" : sinalPdf(r.cred - r.reg), X.dif, y, {dir: 1});
    txt(r.est, X.est, y, {b: 1, t: 7.5, c: ok ? verde : lar2});
    y += 6;
  });
  if (y > H - 20) novaPagina(false);
  pg.drawLine({start: {x: mm(14), y: mm(H - y + 3.5)}, end: {x: mm(W - 14), y: mm(H - y + 3.5)}, thickness: 0.6, color: cinz});
  y += 1.5; txt("Total", X.dia + 2, y, {b: 1}); txt(fmt(C.T.r), X.reg, y, {b: 1, dir: 1}); txt(fmt(C.T.c), X.cred, y, {b: 1, dir: 1}); txt(sinalPdf(C.T.d), X.dif, y, {b: 1, dir: 1}); txt("por creditar " + fmt(C.T.nc), X.est, y, {b: 1, t: 7.5, c: C.T.nc ? lar2 : verde});
  y += 10;
  /* resumo por documento de crédito */
  var porDoc = {}, ord = [];
  C.linhas.forEach(function (r) { if (r.cred == null) return; var k = (r.transf ? "Transferência " : "Liquidação ") + r.doc; if (!porDoc[k]) { porDoc[k] = {n: 0, v: 0}; ord.push(k); } porDoc[k].n++; porDoc[k].v += r.cred; });
  if (ord.length) {
    if (y > H - 50) novaPagina(false, true);
    txt("Resumo por documento de crédito", 14, y, {b: 1, t: 10, c: azul}); y += 6;
    var cabRes = function () { ret(14, y - 4.5, 150, 7, claro); txt("Documento", 16, y, {b: 1, t: 7.5, c: cinz}); txt("Turnos", 120, y, {b: 1, t: 7.5, c: cinz, dir: 1}); txt("Creditado", 160, y, {b: 1, t: 7.5, c: cinz, dir: 1}); y += 6.5; };
    cabRes(); var tg = 0;
    ord.sort().forEach(function (k) { if (y > H - 20) { novaPagina(false, true); cabRes(); }
      txt(k, 16, y); txt(String(porDoc[k].n), 120, y, {dir: 1, c: cinz}); txt(fmt(porDoc[k].v) + " €", 160, y, {dir: 1}); tg += porDoc[k].v; y += 5.2; });
    pg.drawLine({start: {x: mm(14), y: mm(H - y + 3.5)}, end: {x: mm(164), y: mm(H - y + 3.5)}, thickness: 0.6, color: cinz});
    y += 1.5; txt("Total creditado", 16, y, {b: 1}); txt(fmt(tg) + " €", 160, y, {b: 1, dir: 1});
  }
  /* rodapé em todas as páginas */
  var pags = doc.getPages();
  pags.forEach(function (p, i) { pg = p;
    txt("Turnos com MB registado no mês; crédito ligado ao turno com o mesmo valor (liquidação: próprio dia, véspera ou dia seguinte; transferência: até 10 dias antes). Valores em euros.", 14, H - 10, {t: 6.5, c: cinz});
    txt("mystationbox · gerado em " + new Date().toLocaleString("pt-PT") + " · página " + (i + 1) + " de " + pags.length, W - 14, H - 6, {t: 6.5, c: cinz, dir: 1}); });
  return doc.save();
}
async function pdfMB(M) {
  if (!MBCONF) return;
  try {
    await carregarPdfLib();
    var cfg = await cfgENSE(), est = ESTS.find(function (x) { return x.id === EST; }) || {};
    var bytes = await fazerPdfMB(M, MBCONF, cfg.entidade || "Porto João & Nunes LDA.", (est.posto_repsol ? est.posto_repsol + " · " : "") + ($("#hEst").textContent || ""));
    var url = URL.createObjectURL(new Blob([bytes], {type: "application/pdf"})), a = document.createElement("a");
    a.href = url; a.download = "Creditos_MB_" + (EST || "") + "_" + M + ".pdf"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  } catch (e) { status(false, e.message); }
}
