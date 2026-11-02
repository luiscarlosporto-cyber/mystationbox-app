/* mystationbox · PDF de uma página de relatório a partir do que está no ecrã (02/11/2026).
 * Lê o conteúdo já desenhado (totem de totais, avisos, cartões com título, notas e tabelas) e passa-o para um A4 ao alto,
 * com o nome da estação no cabeçalho e a marca no rodapé (marcaPdf, combustivel.js). Usado em Relatórios → Lucro. */
"use strict";
async function pdfDaPagina(el, titulo, sub, ficheiro) {
  await carregarPdfLib();
  var P = window.PDFLib, doc = await P.PDFDocument.create(), F = await doc.embedFont(P.StandardFonts.Helvetica), B = await doc.embedFont(P.StandardFonts.HelveticaBold);
  var mm = function (v) { return v * 72 / 25.4; }, W = 210, H = 297, M = 14, pg, y;
  var azul = P.rgb(0, 0.231, 0.361), lar = P.rgb(0.953, 0.424, 0.129), cinz = P.rgb(0.42, 0.45, 0.5), esc0 = P.rgb(0.1, 0.13, 0.17), claro = P.rgb(0.953, 0.957, 0.965), linha = P.rgb(0.85, 0.87, 0.9), verde = P.rgb(0.09, 0.5, 0.3), verm = P.rgb(0.75, 0.2, 0.1);
  var limpa = function (t) { return String(t || "").replace(/[  ]/g, " ").replace(/[−–]/g, "-").replace(/[^\x20-\x7E\xA0-\xFF€]/g, "").replace(/\s+/g, " ").trim(); };
  var larg = function (s, t, b) { return (b ? B : F).widthOfTextAtSize(limpa(s), t) / 72 * 25.4; };
  var txt = function (s, x, yy, o) { o = o || {}; var f = o.b ? B : F, t = o.t || 8.5, s2 = limpa(s), w = f.widthOfTextAtSize(s2, t);
    pg.drawText(s2, {x: mm(x) - (o.dir ? w : 0), y: mm(H - yy), size: t, font: f, color: o.c || esc0}); };
  var ret = function (x, yy, w, h, cor) { pg.drawRectangle({x: mm(x), y: mm(H - yy - h), width: mm(w), height: mm(h), color: cor}); };
  var quebra = function (s, max, t, b) { var out = [], cur = ""; limpa(s).split(" ").forEach(function (p) { var n = cur ? cur + " " + p : p; if (larg(n, t, b) > max && cur) { out.push(cur); cur = p; } else cur = n; }); if (cur) out.push(cur); return out; };
  var est = (ESTS.find(function (x) { return x.id === EST; }) || {});
  function pagina(primeira) {
    pg = doc.addPage([mm(W), mm(H)]);
    if (primeira) {
      ret(0, 0, W, 22, azul); ret(0, 22, W, 1.2, lar);
      txt(titulo, M, 10.5, {b: 1, t: 15, c: P.rgb(1, 1, 1)}); txt(sub, M, 17.5, {t: 9, c: P.rgb(1, 0.78, 0.6)});
      txt(est.name || $("#hEst").textContent || "", W - M, 10.5, {dir: 1, t: 9.5, b: 1, c: P.rgb(1, 1, 1)});
      if (est.posto_repsol) txt("Posto " + est.posto_repsol, W - M, 17.5, {dir: 1, t: 8.5, c: P.rgb(1, 1, 1)});
      y = 31;
    } else { y = 14; txt(titulo + " · " + sub + " (continuação)", M, y, {b: 1, t: 9.5, c: azul}); y += 7; }
  }
  var cabeca = function (h) { if (y + h > H - 18) pagina(false); };
  pagina(true);
  /* totem: pares rótulo / valor */
  var tot = el.querySelector(".totem");
  if (tot) {
    var t0 = tot.querySelector(".t"), kv = Array.prototype.filter.call(tot.children, function (c) { return c.querySelector && c.querySelector(".k"); });
    if (t0) { txt(t0.textContent, M, y, {b: 1, t: 8, c: lar}); y += 4; }
    var bw = (W - 2 * M - (kv.length - 1) * 3) / kv.length;
    kv.forEach(function (c, i) { var x = M + i * (bw + 3), v = c.querySelector(".v"), sm = v.querySelector("small"), un = sm ? sm.textContent : "", val = v.textContent.replace(un, "");
      var cor = v.style.color ? (/7CE3A0/i.test(v.style.color) || /124, 227, 160/.test(v.style.color) ? verde : verm) : esc0;
      ret(x, y, bw, 15, claro); txt(c.querySelector(".k").textContent, x + 2.5, y + 4.8, {t: 7, c: cinz}); txt(val + " " + un, x + 2.5, y + 11.5, {b: 1, t: 11.5, c: cor}); });
    y += 21;
  }
  /* avisos, cartões, notas finais, pela ordem do ecrã */
  Array.prototype.forEach.call(el.children, function (n) {
    if (n.classList.contains("totem")) return;
    if (n.classList.contains("aviso") || n.tagName === "P") {
      var ls = quebra(n.textContent, W - 2 * M - 4, 7.8); cabeca(ls.length * 4 + 4);
      if (n.classList.contains("aviso")) ret(M, y - 3.6, 1, ls.length * 4 + 1.2, lar);
      ls.forEach(function (l) { txt(l, M + (n.classList.contains("aviso") ? 3 : 0), y, {t: 7.8, c: n.tagName === "P" ? cinz : esc0}); y += 4; }); y += 3; return;
    }
    if (!n.classList.contains("card")) return;
    var h2 = n.querySelector("h2"); cabeca(20);
    if (h2) { txt(h2.textContent, M, y + 1, {b: 1, t: 11, c: azul}); y += 6.5; }
    Array.prototype.forEach.call(n.querySelectorAll("p.mut, .aviso p"), function (p) { quebra(p.textContent, W - 2 * M, 7.3).forEach(function (l) { cabeca(4); txt(l, M, y, {t: 7.3, c: cinz}); y += 3.8; }); });
    y += 1.5;
    Array.prototype.forEach.call(n.querySelectorAll("table"), function (tb) {
      var rows = Array.prototype.map.call(tb.querySelectorAll("tr"), function (tr) { return {sec: tr.parentNode.tagName, c: Array.prototype.map.call(tr.children, function (td) { return td.textContent; })}; });
      var nc = Math.max.apply(null, rows.map(function (r) { return r.c.length; }));
      var wd = []; for (var i = 0; i < nc; i++) wd[i] = Math.max.apply(null, rows.map(function (r) { return r.c[i] ? larg(r.c[i], 7.6, r.sec !== "TBODY") : 0; })) + 3;
      var soma = wd.reduce(function (s, v) { return s + v; }, 0), escala = (W - 2 * M) / soma; if (escala < 1) wd = wd.map(function (v) { return v * escala; }); else wd[0] += (W - 2 * M) - soma;
      var xs = [M]; wd.forEach(function (v, i) { xs[i + 1] = xs[i] + v; });
      rows.forEach(function (r, k) {
        var cab = r.sec === "THEAD", pe = r.sec === "TFOOT"; cabeca(6);
        if (cab) ret(M, y - 4, W - 2 * M, 6, claro);
        if (pe) pg.drawLine({start: {x: mm(M), y: mm(H - y + 4)}, end: {x: mm(W - M), y: mm(H - y + 4)}, thickness: 0.6, color: cinz});
        r.c.forEach(function (c, i) { var t = cab ? 6.8 : 7.6, s = c; while (s.length > 3 && larg(s, t, cab || pe) > wd[i] - 1.5) s = s.slice(0, -2) + "…";
          if (i === 0) txt(s, xs[i] + 1.5, y, {t: t, b: cab || pe, c: cab ? cinz : esc0}); else txt(s, xs[i + 1] - 1.5, y, {t: t, b: cab || pe, c: cab ? cinz : esc0, dir: 1}); });
        if (!cab && !pe) pg.drawLine({start: {x: mm(M), y: mm(H - y - 1.8)}, end: {x: mm(W - M), y: mm(H - y - 1.8)}, thickness: 0.25, color: linha});
        y += cab ? 6 : 5.4;
      });
      y += 4;
    });
    y += 3;
  });
  var pags = doc.getPages();
  for (var i = 0; i < pags.length; i++) { pg = pags[i];
    txt("gerado em " + new Date().toLocaleString("pt-PT") + " · página " + (i + 1) + " de " + pags.length, W - M, H - 6, {t: 6.5, c: cinz, dir: 1});
    await marcaPdf(doc, pg, F, B, mm(M), mm(6), 7); }
  var bytes = await doc.save(), url = URL.createObjectURL(new Blob([bytes], {type: "application/pdf"})), a = document.createElement("a");
  a.href = url; a.download = ficheiro; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
}
$("#bLucPdf").onclick = async function () {
  var m = $("#lMes").value || MES, b = this; if (!$("#lucCorpo .totem")) { status(false, "Sem dados para este mês."); return; }
  b.disabled = true;
  try { await pdfDaPagina($("#lucCorpo"), "Lucro estimado", new Date(m + "-15").toLocaleDateString("pt-PT", {month: "long", year: "numeric"}).replace(/^./, function (c) { return c.toUpperCase(); }), "Lucro_" + (EST || "") + "_" + m + ".pdf"); }
  catch (e) { status(false, e.message || String(e)); }
  b.disabled = false;
};
