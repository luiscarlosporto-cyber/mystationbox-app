/* mystationbox · motor de leitura (navegador e Node).
 * Tradução fiel dos leitores Python do PC (caixa_app/util.py, xls.py, pdf.py, docs_repsol.py,
 * verificacoes.py, fechos.py). Testado contra os resultados do Python nas mesmas amostras reais:
 * app/testes/comparar.js. Se mudar um, mude o outro e volte a correr a comparação. */
(function (raiz) {
"use strict";

/* ================================================================ números (util.py) */
function num1(x) {
  var s = String(x == null ? "" : x).replace(/[^0-9,.\-]/g, ""), c = s.lastIndexOf(","), p = s.lastIndexOf(".");
  if (c > -1 && p > -1) s = c > p ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (c > -1) s = s.replace(",", ".");
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return 0;   // float() do Python recusa o resto
  return parseFloat(s);
}
function num(x) {
  var z = String(x == null ? "" : x).replace(/\s/g, "");
  if (/^-?[0-9.,]+([-+][0-9.,]+)+$/.test(z)) return z.match(/[-+]?[0-9.,]+/g).reduce(function (a, q) { return a + num1(q); }, 0);
  return num1(x);
}
function f2(x) { return fixo(x, 2); }
function fixo(x, n) {   // "%.nf" do Python (arredondamento correto do valor binário)
  var s = x.toFixed(n);
  return s === "-0" + (n ? "." + "0".repeat(n) : "") ? s.slice(1) : s;
}
function pt(x) {   // só para mensagens: pt_txt do util.py (espaço que não parte a linha nos milhares)
  var s = f2(x).replace(".", ","), sinal = s.charAt(0) === "-" ? "-" : "";
  s = s.slice(sinal.length);
  var i = s.indexOf(","), int = s.slice(0, i);
  return sinal + int.replace(/\B(?=(\d{3})+$)/g, " ") + s.slice(i);
}
function _r(v) { return Math.round((v + 1e-9) * 100) / 100; }
function eur(v) { return pt(v) + " €"; }

/* ================================================================ .xls do sistema (xls.py) */
function u16(b, o) { return b[o] | (b[o + 1] << 8); }
function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 16777216; }
function f64(b, o) { return new DataView(b.buffer, b.byteOffset + o, 8).getFloat64(0, true); }
function cat(arrs) { var n = 0, i, o = 0; for (i = 0; i < arrs.length; i++) n += arrs[i].length; var r = new Uint8Array(n); for (i = 0; i < arrs.length; i++) { r.set(arrs[i], o); o += arrs[i].length; } return r; }
function dec(bytes, wide) {
  if (wide) { var s = ""; for (var i = 0; i + 1 < bytes.length; i += 2) s += String.fromCharCode(bytes[i] | (bytes[i + 1] << 8)); return s; }
  return String.fromCharCode.apply(null, Array.prototype.slice.call(bytes));
}
function oleWorkbook(data) {
  var sig = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  for (var k = 0; k < 8; k++) if (data[k] !== sig[k]) throw new Error("Isto não é um ficheiro .xls do sistema");
  var ss = 1 << u16(data, 30), mss = 1 << u16(data, 32);
  var dir0 = u32(data, 48), cutoff = u32(data, 56), mfat0 = u32(data, 60), dif0 = u32(data, 68), nDif = u32(data, 72), nu = ss / 4;
  function sec(n) { return data.subarray((n + 1) * ss, (n + 2) * ss); }
  function ints(b) { var o = []; for (var i = 0; i + 3 < b.length; i += 4) o.push(u32(b, i)); return o; }
  var difat = ints(data.subarray(76, 76 + 109 * 4)), s = dif0, i;
  for (i = 0; i < nDif; i++) { var blk = ints(sec(s)); difat = difat.concat(blk.slice(0, -1)); s = blk[blk.length - 1]; }
  var fat = [];
  difat.forEach(function (f) { if (f < 0xFFFFFFFA) fat = fat.concat(ints(sec(f))); });
  function cadeia(n) { var o = []; while (n < 0xFFFFFFFA && o.length < 200000) { o.push(n); n = fat[n]; } return o; }
  var dirs = cat(cadeia(dir0).map(sec)), achado = null;
  for (i = 0; i + 128 <= dirs.length; i += 128) {
    var e = dirs.subarray(i, i + 128), nl = u16(e, 64);
    var nome = dec(e.subarray(0, Math.max(nl - 2, 0)), true).toLowerCase();
    if ((nome === "workbook" || nome === "book") && e[66] === 2) { achado = [u32(e, 116), u32(e, 120)]; break; }
  }
  if (!achado) throw new Error("Folha de cálculo não encontrada no ficheiro");
  var ini = achado[0], tam = achado[1];
  if (tam >= cutoff) return cat(cadeia(ini).map(sec)).subarray(0, tam);
  var mini = cat(cadeia(u32(dirs, 116)).map(sec)), mfat = [];
  cadeia(mfat0).forEach(function (n) { mfat = mfat.concat(ints(sec(n))); });
  var partes = [], len = 0, n = ini;
  while (n < 0xFFFFFFFA && len < tam + mss) { var pz = mini.subarray(n * mss, (n + 1) * mss); partes.push(pz); len += pz.length; n = mfat[n]; }
  return cat(partes).subarray(0, tam);
}
function Leitor(blocos) { this.c = blocos; this.i = 0; this.p = 0; }
Leitor.prototype.bytes = function (n) {
  var out = [];
  while (n > 0) {
    if (this.p >= this.c[this.i].length) { this.i++; this.p = 0; }
    var k = Math.min(n, this.c[this.i].length - this.p);
    out.push(this.c[this.i].subarray(this.p, this.p + k)); this.p += k; n -= k;
  }
  return cat(out);
};
Leitor.prototype.texto = function () {
  var ln = u16(this.bytes(2), 0), fl = this.bytes(1)[0], wide = fl & 1;
  var nr = fl & 8 ? u16(this.bytes(2), 0) : 0, ne = fl & 4 ? u32(this.bytes(4), 0) : 0, s = "", resto = ln;
  while (resto > 0) {
    if (this.p >= this.c[this.i].length) { this.i++; this.p = 1; wide = this.c[this.i][0] & 1; }
    var per = wide ? 2 : 1, k = Math.min(resto, Math.floor((this.c[this.i].length - this.p) / per));
    if (k <= 0) throw new Error("texto inválido");
    s += dec(this.c[this.i].subarray(this.p, this.p + k * per), wide); this.p += k * per; resto -= k;
  }
  this.bytes(4 * nr + ne);
  return s;
};
function rk(v) {
  var x;
  if (v & 2) x = (v | 0) >> 2;
  else { var b = new DataView(new ArrayBuffer(8)); b.setUint32(0, 0, true); b.setUint32(4, (v & 0xFFFFFFFC) >>> 0, true); x = b.getFloat64(0, true); }
  return v & 1 ? x / 100 : x;
}
function celulas(wb) {
  var regs = [], i = 0, j;
  while (i + 4 <= wb.length) { var rid = u16(wb, i), ln = u16(wb, i + 2); regs.push([rid, wb.subarray(i + 4, i + 4 + ln), i]); i += 4 + ln; }
  var sst = [], folha = null;
  for (j = 0; j < regs.length; j++) {
    var r = regs[j];
    if (r[0] === 0x00FC) {
      var blocos = [r[1]];
      while (j + 1 < regs.length && regs[j + 1][0] === 0x003C) { j++; blocos.push(regs[j][1]); }
      var lt = new Leitor(blocos); lt.bytes(8);
      for (var q = 0, nq = u32(r[1], 4); q < nq; q++) sst.push(lt.texto());
    } else if (r[0] === 0x0085 && folha === null) folha = u32(r[1], 0);
  }
  if (folha === null) throw new Error("Sem folhas no ficheiro");
  var cel = new Map(), prof = 0, ultimo = null;
  function put(rr, cc, v) { cel.set(rr + "," + cc, v); }
  for (j = 0; j < regs.length; j++) {
    var id = regs[j][0], d = regs[j][1], off = regs[j][2];
    if (off < folha) continue;
    if (id === 0x0809) prof++;
    else if (id === 0x000A) { prof--; if (prof <= 0) break; }
    else if (id === 0x00FD) put(u16(d, 0), u16(d, 2), sst[u32(d, 6)]);
    else if (id === 0x0203) put(u16(d, 0), u16(d, 2), f64(d, 6));
    else if (id === 0x027E) put(u16(d, 0), u16(d, 2), rk(u32(d, 6)));
    else if (id === 0x00BD) { var c1 = u16(d, 2); for (var k = 0; k < Math.floor((d.length - 6) / 6); k++) put(u16(d, 0), c1 + k, rk(u32(d, 6 + 6 * k))); }
    else if (id === 0x0204) { var l2 = u16(d, 6), w = d[8] & 1; put(u16(d, 0), u16(d, 2), dec(d.subarray(9, 9 + l2 * (w ? 2 : 1)), w)); }
    else if (id === 0x0006) { if (d[12] === 0xff && d[13] === 0xff) ultimo = d[6] === 0 ? [u16(d, 0), u16(d, 2)] : null; else put(u16(d, 0), u16(d, 2), f64(d, 6)); }
    else if (id === 0x0207 && ultimo) { var l3 = u16(d, 0), w2 = d[2] & 1; put(ultimo[0], ultimo[1], dec(d.subarray(3, 3 + l3 * (w2 ? 2 : 1)), w2)); ultimo = null; }
  }
  return cel;
}
function norm(s) { return String(s).normalize("NFD").replace(/[^\x00-\x7f]/g, "").toUpperCase().trim(); }
function lerTurno(dados) {
  var linhas = {};
  celulas(oleWorkbook(dados)).forEach(function (v, k) { var p = k.split(","); (linhas[+p[0]] = linhas[+p[0]] || {})[+p[1]] = v; });
  var rows = Object.keys(linhas).map(Number).sort(function (a, b) { return a - b; });
  function achar(txt, col) {
    for (var a = 0; a < rows.length; a++) {
      var r = rows[a], cs = Object.keys(linhas[r]).map(Number).sort(function (x, y) { return x - y; });
      for (var b = 0; b < cs.length; b++) { var v = linhas[r][cs[b]]; if (typeof v === "string" && norm(v) === norm(txt) && (col == null || cs[b] === col)) return [r, cs[b]]; }
    }
    return null;
  }
  var out = {}, p = achar("Colaboradores");
  if (p) out.colaborador = String(linhas[p[0]][p[1] + 1] == null ? "" : linhas[p[0]][p[1] + 1]).trim();
  p = achar("Desde");
  if (p) {
    var t = String(linhas[p[0]][p[1] + 1] == null ? "" : linhas[p[0]][p[1] + 1]), m = t.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) out.data = m[3] + "-" + m[2] + "-" + m[1];
    var f = t.match(/Fecho:\s*(\d+)/); if (f) out.fecho = parseInt(f[1], 10);
  }
  p = achar("Vendas Brutas", 0);
  if (p) Object.keys(linhas[p[0]]).forEach(function (c) { var v = linhas[p[0]][c]; if (typeof v === "string" && norm(v) === "VENDAS LIQUIDAS") { var x = (linhas[p[0] + 1] || {})[c]; if (typeof x === "number") out.vendas = _r2(x); } });
  p = achar("Depósitos por Forma de Pagamento");
  if (p) {
    var r = p[0] + 2, outros = {};
    while (linhas[r]) {
      var lab = linhas[r][0], val = linhas[r][1];
      if (typeof lab !== "string" || norm(lab) === "TOTAL") break;
      if (typeof val === "number") {
        var n = norm(lab), k = n.indexOf("PRESENT") >= 0 ? "pres" : n.indexOf("SOLRED") >= 0 ? "solred" : (n.indexOf("CARTAO") >= 0 || n.indexOf("BANCARI") >= 0 || n.indexOf("MB") === 0) ? "mb" : n.indexOf("NUMERAR") >= 0 ? "num" : null;
        if (k) out[k] = _r2((out[k] || 0) + val); else outros[lab] = _r2(val);
      }
      r++;
    }
    out.outros = outros;
  }
  if (out.vendas == null && !("mb" in out || "solred" in out || "num" in out)) throw new Error("Não parece uma folha de turno do sistema");
  return out;
}
function _r2(x) { return Math.round(x * 100) / 100; }   // round(x, 2) do Python

/* ================================================================ PDF (pdf.py) */
var CP1252 = {0x80:"€",0x82:"‚",0x83:"ƒ",0x84:"„",0x85:"…",0x86:"†",0x87:"‡",0x88:"ˆ",0x89:"‰",0x8A:"Š",0x8B:"‹",0x8C:"Œ",0x8E:"Ž",0x91:"‘",0x92:"’",0x93:"“",0x94:"”",0x95:"•",0x96:"–",0x97:"—",0x98:"˜",0x99:"™",0x9A:"š",0x9B:"›",0x9C:"œ",0x9E:"ž",0x9F:"Ÿ"};
function cp1252(bin) {   // bin: "string binária" (um carácter por byte)
  var s = "";
  for (var i = 0; i < bin.length; i++) { var c = bin.charCodeAt(i); s += c >= 0x80 && c <= 0x9F ? (CP1252[c] || "\ufffd") : bin[i]; }
  return s;
}
function bin(u8) { var s = "", CH = 0x8000; for (var i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, Array.prototype.slice.call(u8.subarray(i, i + CH))); return s; }
function strs(tok) {
  var out = "", m, re1 = /<([0-9A-Fa-f \t\n\r\f\v]*)>/g;
  while ((m = re1.exec(tok))) {
    var h = m[1].replace(/[ \t\n\r\f\v]/g, ""); if (h.length % 2) h += "0";
    var b = ""; for (var i = 0; i < h.length; i += 2) b += String.fromCharCode(parseInt(h.substr(i, 2), 16));
    out += cp1252(b);
  }
  var re2 = /\(((?:\\[\s\S]|[^\\)])*)\)/g;
  while ((m = re2.exec(tok))) {
    var s = m[1].replace(/\\([nrtbf()\\])/g, function (_, k) { return {n: "\n", r: "", t: " ", b: "", f: ""}[k] !== undefined ? {n: "\n", r: "", t: " ", b: "", f: ""}[k] : k; });
    s = s.replace(/\\([0-7]{1,3})/g, function (_, k) { return String.fromCharCode(parseInt(k, 8) & 255); });
    out += cp1252(s);
  }
  return out;
}
/* inflate: função (Uint8Array) -> Promise<Uint8Array> ou Uint8Array; lança erro se não for deflate */
async function pdfPaginas(data, inflate) {
  var txt = bin(data), pags = [], re = /stream\r?\n([\s\S]*?)endstream/g, m;
  while ((m = re.exec(txt))) {
    var raw = m[1], s;
    try { var u = new Uint8Array(raw.length); for (var i = 0; i < raw.length; i++) u[i] = raw.charCodeAt(i); s = bin(await inflate(u)); }
    catch (e) { s = raw; }
    if (s.indexOf("Tj") < 0 && s.indexOf("TJ") < 0) continue;
    var itens = [], rk2 = /BT[ \t\n\r\f\v]+(-?[0-9.]+)[ \t\n\r\f\v]+(-?[0-9.]+)[ \t\n\r\f\v]+Td[ \t\n\r\f\v]*(\[[^\]]*\]|<[^>]*>|\((?:\\[\s\S]|[^\\)])*\))[ \t\n\r\f\v]*T[jJ]/g, k;
    while ((k = rk2.exec(s))) { var t = strs(k[3]); if (t.trim()) itens.push([parseFloat(k[1]), parseFloat(k[2]), t]); }
    itens.sort(function (a, b) { return (b[1] - a[1]) || (a[0] - b[0]); });
    var linhas = [], y0 = null;
    itens.forEach(function (it) { if (y0 === null || Math.abs(it[1] - y0) > 1.5) { linhas.push([]); y0 = it[1]; } linhas[linhas.length - 1].push([it[0], it[2]]); });
    pags.push(linhas.map(function (l) { return l.slice().sort(function (a, b) { return a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0); }).map(function (x) { return x[1]; }).join("  "); }));
  }
  return pags;
}

/* ================================================================ documentos Repsol (docs_repsol.py) */
function pn(s) {
  s = s.trim(); var neg = /-$/.test(s) || /^-/.test(s);
  s = s.replace(/^-+|-+$/g, ""); if (s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", ".");
  var v = parseFloat(s); return neg ? -v : v;
}
function _d(s) { return s.slice(6) + "-" + s.slice(3, 5) + "-" + s.slice(0, 2); }
var NUM3 = "-?[\\d.]+,\\d{3}-?", NUM2 = "-?[\\d.]+,\\d\\d-?", NUM6 = "-?[\\d.]+,\\d{6}-?", DT = "\\d\\d\\.\\d\\d\\.\\d{4}";
function R(src, fl) { return new RegExp(src, fl || ""); }
function match(re, s) { var m = re.exec(s); return m && m.index === 0 ? m : null; }   // re.match do Python
function todas(pags) { var o = []; pags.forEach(function (p) { p.forEach(function (l) { o.push(l); }); }); return o; }
function classificarDoc(pags) {
  var t = pags.map(function (p) { return p.slice(0, 12).join("\n"); }).join("\n"), L = todas(pags);
  if (L.some(function (l) { return /Visas?\s*\/\s*Multibanco|Tipo\s+P\.O\.S/.test(l); }) && L.some(function (l) { return l.indexOf("Total Debitos") >= 0; })) return "LIQ";
  if (/Nota de Cr/.test(t)) return "NDC";
  if (pags[0].some(function (l) { return l.indexOf("AUTOFACTURA") >= 0; })) return "VF";
  if (pags[0].some(function (l) { return l.indexOf("Conta Consigna") >= 0; })) return "CCS";
  return null;
}
function cab(pags, r) {
  var txt = pags[0].join("\n");
  var m = R("(?:Factura Conta Consigna\\S+ n\\S*|Nota de Cr\\S+ N\\S*|Documento N\\S*)\\s*:?\\s*([A-Z0-9]{4} [A-Z0-9]{4}/\\d+)").exec(txt);
  r.numero = m ? m[1].split("/").pop() : ""; r.serie = m ? m[1] : "";
  [["emissao", "Emiss[aã]o:?\\s+(" + DT + ")"], ["venc", "Vencimento:?\\s+(" + DT + ")"]].forEach(function (kp) { var mm = R(kp[1]).exec(txt); r[kp[0]] = mm ? _d(mm[1]) : ""; });
  m = /Liquida[cç][aã]o:?\s+(\d{5,})/.exec(txt); r.liq = m ? m[1] : "";
}
function strip(l) { return l.replace(/^\s+|\s+$/g, ""); }
function lerCCS(pags) {
  var r = {tipo: "CCS", linhas: [], bonus: [], tot: []}; cab(pags, r);
  var L = todas(pags).map(strip), m;
  var reL = R("LEITURA\\s+\\S+\\s+(" + DT + ")\\s+(.+?)\\s+(" + NUM3 + ")\\s+(" + NUM6 + ")\\s+(" + NUM6 + ")\\s+(" + NUM2 + ")\\s+(" + NUM2 + ")\\s+23");
  var reB = R("(CC[CS] Bonus .+?)\\s+(" + NUM3 + ")\\s+(" + NUM6 + ")\\s+(" + NUM2 + ")\\s+23");
  var reT = R("(.+?)\\s+(" + DT + ")\\s+(\\d+)\\s+(\\d+)\\s+(" + NUM3 + ")\\s+(" + NUM3 + ")\\s+(" + NUM3 + ")\\s*$");
  L.forEach(function (l) {
    if ((m = match(reL, l))) { r.linhas.push({data: _d(m[1]), prod: m[2].trim(), l: pn(m[3]), preco: pn(m[4]), cu: pn(m[5]), com: pn(m[6]), vliq: pn(m[7])}); return; }
    if ((m = match(reB, l))) { r.bonus.push({nome: m[1].trim(), l: pn(m[2]), u: pn(m[3]), v: pn(m[4])}); return; }
    if ((m = match(reT, l))) r.tot.push({prod: m[1].trim(), data: _d(m[2]), ini: parseInt(m[3], 10), fin: parseInt(m[4], 10), l: pn(m[5]), ccs: pn(m[6]), ncr: pn(m[7])});
  });
  var txt = L.join("\n");
  m = R("Importância a liquidar:\\s*(" + NUM2 + ")").exec(txt); r.total = m ? pn(m[1]) : null;
  m = R("23%\\s+(" + NUM2 + ")\\s+(" + NUM2 + ")").exec(txt); r.base = m ? pn(m[1]) : null; r.iva = m ? pn(m[2]) : null;
  L.forEach(function (l) { var mm = match(R("Comissões/Bónus\\s+(" + NUM2 + ")"), l); if (mm) r.resumo_bonus = pn(mm[1]); });
  r.resumo_vliq = null;
  L.forEach(function (l) { var mm = R("Conta Consigna.*\\)\\s+(" + NUM3 + ")\\s+(" + NUM2 + ")\\s+(" + NUM2 + ")\\s*$").exec(l);
    if (mm && r.resumo_vliq === null && l.indexOf("sem") >= 0) { r.resumo_vliq = pn(mm[3]); r.resumo_com = pn(mm[2]); r.resumo_l = pn(mm[1]); } });
  r.ok = r.linhas.length > 0 && r.total !== null;
  return r;
}
function lerNDC(pags) {
  var r = {tipo: "NDC", ncr: [], acerto: [], reemb: [], bonus: []}; cab(pags, r);
  var L = todas(pags).map(strip), sec = null, pre = "(\\d+)\\s+(" + DT + ")\\s+(\\d\\d:\\d\\d:\\d\\d)\\s+(" + DT + ")\\s+";
  var reN = R(pre + "(.+?)\\s+(" + NUM3 + ")\\s+(" + NUM6 + ")\\s+(" + NUM6 + ")\\s+(" + NUM2 + ")\\s+(" + NUM2 + ")\\s+23");
  var reA = R(pre + "(.+?)\\s+(" + NUM3 + ")\\s+(" + NUM6 + ")\\s+(" + NUM2 + ")\\s+23");
  var reB = R("(CC[CS] Bonus .+?)\\s+(" + NUM3 + ")\\s+(" + NUM6 + ")\\s+(" + NUM2 + ")\\s+23");
  L.forEach(function (l) {
    var m;
    if (/^NCR\. Litros/.test(l) && l.indexOf("Fecho") < 0 && !/\d,\d\d/.test(l)) { sec = "ncr"; return; }
    if (l.indexOf("Acerto de Comiss") === 0) { sec = "acerto"; return; }
    if (l.indexOf("Reembolso de desconto") === 0) { sec = "reemb"; return; }
    if (l.indexOf("Acerto Comiss") === 0) { sec = "bonus"; return; }
    if (l.indexOf("RESUMO") === 0) { sec = "resumo"; return; }
    if (sec === "ncr") { if ((m = match(reN, l))) r.ncr.push({fecho: m[1], data: _d(m[4]), prod: m[5].trim(), l: pn(m[6]), preco: pn(m[7]), cu: pn(m[8]), com: pn(m[9]), vliq: pn(m[10])}); }
    else if (sec === "acerto") { if ((m = match(reA, l))) r.acerto.push({fecho: m[1], data: _d(m[4]), prod: m[5].trim(), l: pn(m[6]), dif: pn(m[7]), vliq: pn(m[8])}); }
    else if (sec === "reemb") { if ((m = match(reA, l))) r.reemb.push({fecho: m[1], data: _d(m[4]), tipo: m[5].trim(), l: pn(m[6]), u: pn(m[7]), vliq: pn(m[8])}); }
    else if (sec === "bonus") { if ((m = match(reB, l))) r.bonus.push({nome: m[1].trim(), l: pn(m[2]), u: pn(m[3]), v: pn(m[4])}); }
  });
  var txt = L.join("\n"), m2;
  m2 = R("Valor Total:\\s*(" + NUM2 + ")").exec(txt); r.total = m2 ? pn(m2[1]) : null;
  m2 = R("23%\\s+(" + NUM2 + ")\\s+(" + NUM2 + ")").exec(txt); r.base = m2 ? pn(m2[1]) : null; r.iva = m2 ? pn(m2[2]) : null;
  L.forEach(function (l) { var mm = match(R("Acerte Comiss\\S+/B\\S+\\s+(" + NUM2 + ")"), l); if (mm) r.resumo_bonus = pn(mm[1]); });
  r.ok = r.ncr.length > 0 && r.total !== null;
  return r;
}
function lerVF(pags) {
  var r = {tipo: "VF", linhas: [], reemb: []}; cab(pags, r);
  var L = todas(pags).map(strip);
  var reL = R("Material / (.+?)\\s*/\\s*Solred\\s+Electr\\S+\\s+(\\d+)\\s+(" + DT + ")\\s+(" + NUM2 + ")\\s+L\\s+([\\d.]+)\\s+(" + NUM2 + ")\\s+23");
  var reR = R("(.+?)\\s+(" + DT + ")\\s+(\\d+)\\s+(" + DT + ")\\s+(\\d\\d:\\d\\d:\\d\\d)\\s+(" + NUM3 + ")\\s+(UN|L)\\s+(" + NUM2 + ")\\s+(" + NUM2 + ")\\s+23");
  L.forEach(function (l) {
    var m;
    if ((m = match(reL, l))) { r.linhas.push({prod: m[1].replace(/\s+/g, " ").trim(), fecho: m[2], data: _d(m[3]), l: pn(m[4]), u: parseFloat(m[5]), com: pn(m[6])}); return; }
    if ((m = match(reR, l))) r.reemb.push({prod: m[1].replace(/\s+/g, " ").trim(), fecho: m[3], data: _d(m[4]), q: pn(m[6]), vliq: pn(m[8]), reemb: pn(m[9])});
  });
  r.bens = [];
  var reBn = R("Precio / Reembolso.*?\\s(\\d+)\\s+(" + DT + ")\\s+(" + NUM2 + ")\\s+UN\\s+(" + NUM2 + ")\\s+\\*");
  L.forEach(function (l) { var m = match(reBn, l.replace(/\s+/g, " ")); if (m) r.bens.push({fecho: m[1], data: _d(m[2]), v: pn(m[4])}); });
  var txt = L.join("\n"), nums = [], mm, reN = /^\s*(\d{1,3}(?:\.\d{3})*[.,]\d\d)\s*$/gm;
  while ((mm = reN.exec(txt))) nums.push(mm[1]);
  r.total = nums.length ? pn(/^\d+\.\d\d$/.test(nums[nums.length - 1]) ? nums[nums.length - 1].replace(".", ",") : nums[nums.length - 1]) : null;
  r.ivas = [];
  L.forEach(function (l) {
    if (l.indexOf("IVA à taxa") !== 0) return;
    var x = l.replace(/IVA à taxa de [\d,]+%/g, "").replace(/\(.*?\)/g, ""), n = x.match(R(NUM2, "g"));
    if (n) r.ivas.push([pn(n[0]), n.length > 1 ? pn(n[1]) : 0.0]);
  });
  r.ok = (r.linhas.length > 0 || r.reemb.length > 0) && r.total !== null;
  return r;
}
function lerLIQ(pags) {
  var r = {tipo: "LIQ", itens: [], emissao: "", venc: "", liq: ""}, L = todas(pags).map(strip), txt = L.join("\n");
  var m = /Liquida[cç][aã]o:?\s+(\d{5,})/.exec(txt); r.liq = m ? m[1] : ""; r.numero = r.liq;
  [["emissao", "Emiss[aã]o:?\\s+(" + DT + ")"], ["venc", "Vencimento:?\\s+(" + DT + ")"]].forEach(function (kp) { var mm = R(kp[1]).exec(txt); r[kp[0]] = mm ? _d(mm[1]) : ""; });
  var reI = R("(Factura NSI V2|V/ Factura|NdC Cart\\S+ Posto V2|Visas?\\s*/\\s*Multibanco|[A-Za-zÀ-ÿ/ ]+?)\\s+(?:(\\d+)\\s+(\\d+)\\s+)?(\\d{8,})\\s+(" + DT + ")\\s+(" + DT + ")\\s+(" + NUM2 + ")\\s*$");
  L.forEach(function (l) {
    var mm = match(reI, l); if (!mm) return;
    var nome = mm[1].trim();
    r.itens.push({tipo: nome, pos: mm[2] || "", fecho: mm[3] ? String(parseInt(mm[3], 10)) : "", numdoc: mm[4], data: _d(mm[5]), venc: _d(mm[6]), valor: pn(mm[7]), deb: !/^(V\/|NdC|Visa)/.test(nome)});
  });
  [["tdeb", "Total Debitos\\s*:?\\s+(%s)"], ["tcred", "Total Creditos\\s*:?\\s+(%s)"], ["saldo", "Saldo\\s*:?\\s+(%s)"]].forEach(function (kp) {
    var mm = R(kp[1].replace("%s", NUM2)).exec(txt); r[kp[0]] = mm ? pn(mm[1]) : null; });
  m = /MONTANTE\s*:\s*([\d ]+,\d\d)/.exec(txt); r.montante = m ? pn(m[1].replace(/ /g, "")) : null;
  r.ok = r.itens.length > 0;
  return r;
}
function lerDocumento(pags) {
  var t = classificarDoc(pags);
  return t ? {LIQ: lerLIQ, CCS: lerCCS, NDC: lerNDC, VF: lerVF}[t](pags) : {tipo: null, ok: false};
}

/* ================================================================ verificações (verificacoes.py) */
var TOL = 0.02;
var POLITICA = {CC: {simples: 45.0, premium: 52.0}, MR: {simples: 37.0, premium: 44.0}, DI: {simples: 37.0, premium: 44.0}, SR: {simples: 26.0, premium: 27.0}};
var BONUS_POLITICA = [["Pag. Servicos", 1.0], ["Pag. Atempado", 2.0], ["G. Bancaria", 1.0], ["Factura Eletr", 1.0], ["Dinamizaçao", 22.0]];
function classe(prod) { var p = prod.toLowerCase(); return (p.indexOf("efitec") >= 0 || p.indexOf("premium") >= 0 || p.indexOf("e+") >= 0) ? "premium" : "simples"; }
function soma(a, f) { return a.reduce(function (s, x) { return s + f(x); }, 0); }
function dias(a, b) { return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5); }
function lstrip0(s) { return String(s).replace(/^0+/, ""); }
function politica(docs, add) {
  var ccs = docs.filter(function (d) { return d.tipo === "CCS"; }), totMenos = 0, totL = 0;
  ccs.forEach(function (d) {
    var g = "Política 2026 · fatura " + d.numero, menos = 0, lit = 0, taxas = {};
    d.linhas.forEach(function (l) { var c = classe(l.prod), fat = Math.abs(l.cu) * 1000; (taxas[c] = taxas[c] || {})[_r2(fat)] = 1; menos += (POLITICA.CC[c] - fat) * l.l / 1000; lit += l.l; });
    totMenos += menos; totL += lit;
    var resumo = Object.keys(taxas).sort().map(function (c) { return c + ": " + Object.keys(taxas[c]).map(Number).sort(function (a, b) { return a - b; }).map(function (x) { return f2(x).replace(".", ","); }).join("/") + " €/m³ (política " + fixo(POLITICA.CC[c], 0) + ")"; }).join(" · ");
    if (menos > 0.05) add(g, "aviso", "Comissão de consignação faturada abaixo da política 2026 — " + resumo + ". Diferença estimada: " + eur(menos) + " sem IVA em " + fixo(lit, 0) + " litros.");
    else add(g, "ok", "Comissão de consignação conforme a política 2026 (" + resumo + ")");
    var bon = {}, ordem = [];
    d.bonus.forEach(function (b) { BONUS_POLITICA.forEach(function (kv) { if (b.nome.toLowerCase().indexOf(kv[0].toLowerCase()) >= 0) { if (!(kv[0] in bon)) ordem.push(kv[0]); bon[kv[0]] = Math.abs(b.u) * 1000; } }); });
    var falta = BONUS_POLITICA.filter(function (kv) { return !(kv[0] in bon); }).map(function (kv) { return kv[0]; });
    var pol = {}; BONUS_POLITICA.forEach(function (kv) { pol[kv[0]] = kv[1]; });
    var difs = ordem.filter(function (k) { return Math.abs(bon[k] - pol[k]) > 0.01; }).map(function (k) { return k + ": " + fixo(bon[k], 1).replace(".", ",") + " em vez de " + fixo(pol[k], 1).replace(".", ","); });
    add(g, !falta.length && !difs.length ? "ok" : "aviso", !falta.length && !difs.length ? "Bónus (Pag. Serviços 1, Pag. atempado 2, Garantia bancária 1, Fatura eletrónica 1, Dinamização 22 €/m³) conforme a política" : "Bónus fora da política: " + difs.concat(falta.map(function (k) { return "falta " + k; })).join("; "));
    if (ordem.length && !d.bonus.some(function (b) { return b.nome.toLowerCase().indexOf("voc") >= 0; }))
      add(g, "info", "Não há bónus VoC (3 €/m³ = " + eur(3.0 * lit / 1000) + " nesta fatura): só é pago com avaliação global ≥ 4,67 (ou melhoria ≥ 0,05)");
  });
  if (totL) add("Política 2026 · resumo", totMenos > 0.05 ? "aviso" : "ok", totMenos > 0.05 ? "Consignação nas " + ccs.length + " fatura(s) carregada(s): " + fixo(totL, 0) + " litros, comissão faturada vs política 2026 = " + eur(totMenos) + " sem IVA a menos" : "Comissão de consignação conforme a política 2026");
  docs.filter(function (x) { return x.tipo === "VF"; }).forEach(function (d) {
    var bad = d.linhas.filter(function (l) { return Math.abs(l.u * 1000 - POLITICA.SR[classe(l.prod)]) > 0.01; });
    add("Política 2026 · autofatura " + d.numero, !bad.length ? "ok" : "aviso", !bad.length ? "Comissão Solred 26 €/m³ (simples) e 27 €/m³ (premium) conforme a política" : bad.length + " linha(s) com taxa Solred fora da política");
  });
  docs.filter(function (x) { return x.tipo === "NDC"; }).forEach(function (d) {
    var bad = 0, n = 0;
    d.acerto.forEach(function (a) { var c = classe(a.prod); n++; var base = {simples: 0.03145, premium: 0.038}[c]; if (Math.abs((base + a.dif) * 1000 - POLITICA.MR[c]) > 0.06) bad++; });
    if (n) add("Política 2026 · nota de crédito " + d.numero, !bad ? "ok" : "aviso", !bad ? "Comissão My Repsol/desconto imediato (base + acerto) = 37 €/m³ (simples) e 44 €/m³ (premium), conforme a política" : bad + " acerto(s) de comissão fora da política");
  });
}
/* app: {pos, dias: {dia: {t1:{campo:texto}, t2:{...}}}} — os valores de texto passam por num() */
function verificar(docs, app) {
  var out = [];
  function add(grupo, nivel, msg, ref) { out.push({grupo: grupo, nivel: nivel, msg: msg, ref: ref || ""}); }
  var pos = lstrip0(app.pos || "36613"), por = {LIQ: [], CCS: [], NDC: [], VF: []}, idx = {};
  docs.forEach(function (d) { if (por[d.tipo]) por[d.tipo].push(d); });
  ["CCS", "NDC", "VF"].forEach(function (t) { por[t].forEach(function (d) { idx[d.numero] = d; }); });
  por.LIQ.forEach(function (L) {
    var g = "Liquidação " + L.liq, deb = _r(soma(L.itens.filter(function (i) { return i.deb; }), function (i) { return i.valor; })), cred = _r(soma(L.itens.filter(function (i) { return !i.deb; }), function (i) { return i.valor; }));
    if (L.tdeb != null) { var o1 = Math.abs(deb - L.tdeb) <= TOL; add(g, o1 ? "ok" : "erro", "Soma dos débitos " + eur(deb) + " " + (o1 ? "=" : "≠") + " Total Débitos " + eur(L.tdeb)); }
    if (L.tcred != null) { var o2 = Math.abs(cred - L.tcred) <= TOL; add(g, o2 ? "ok" : "erro", "Soma dos créditos " + eur(cred) + " " + (o2 ? "=" : "≠") + " Total Créditos " + eur(L.tcred)); }
    if (L.saldo != null) { var o3 = Math.abs((L.tdeb - L.tcred) - L.saldo) <= TOL; add(g, o3 ? "ok" : "erro", "Saldo a pagar " + eur(L.saldo) + " (débitos − créditos)" + (o3 ? "" : " não confere")); }
    L.itens.forEach(function (i) {
      if (i.tipo.indexOf("Visa") === 0) return;
      var d = idx[i.numdoc];
      if (!d) add(g, "info", "Documento " + i.numdoc + " (" + i.tipo + ", " + eur(i.valor) + ") ainda não carregado");
      else { var ok = Math.abs(d.total - i.valor) <= TOL; add(g, ok ? "ok" : "erro", i.tipo + " " + i.numdoc + ": total do documento " + eur(d.total) + " " + (ok ? "=" : "≠") + " valor na liquidação " + eur(i.valor)); }
    });
    var outros = L.itens.filter(function (i) { return i.tipo.indexOf("Visa") === 0 && lstrip0(i.pos) !== pos; });
    if (outros.length) add(g, "info", outros.length + " crédito(s) Visas/Multibanco de outro POS ignorado(s): " + outros.map(function (i) { return "POS " + i.pos + " " + eur(i.valor); }).join(", "));
  });
  por.CCS.forEach(function (d) {
    var g = "Fatura consignação " + d.numero, bad = 0;
    d.linhas.forEach(function (l) { if (Math.abs(l.l * l.preco + l.com - l.vliq) > TOL || Math.abs(l.l * l.cu - l.com) > TOL) bad++; });
    add(g, !bad ? "ok" : "erro", !bad ? "Litros × preço − comissão = valor líquido em " + d.linhas.length + " linha(s)" : bad + " linha(s) com conta errada");
    var sv = _r(soma(d.linhas, function (l) { return l.vliq; })), sl = _r(soma(d.linhas, function (l) { return l.l; })), sc = _r(soma(d.linhas, function (l) { return l.com; }));
    var ok = d.resumo_vliq != null && Math.abs(sv - d.resumo_vliq) <= TOL && Math.abs(sl - d.resumo_l) <= 0.01 && Math.abs(sc - d.resumo_com) <= TOL;
    add(g, ok ? "ok" : "erro", ok ? "Totais do resumo (litros " + fixo(sl, 3).replace(".", ",") + ", valor " + eur(sv) + ") batem com as linhas" : "Totais do resumo não batem com as linhas");
    var bb = d.bonus.filter(function (b) { return Math.abs(Math.abs(b.l * b.u) - Math.abs(b.v)) > 0.05 || Math.abs(b.l - sl) > 0.01; }), sb = _r(soma(d.bonus, function (b) { return b.v; }));
    var okb = !bb.length && d.resumo_bonus != null && Math.abs(sb - d.resumo_bonus) <= TOL;
    add(g, okb ? "ok" : "erro", okb ? "Bónus/comissões (" + eur(sb) + ") calculados sobre os litros faturados" : "Bónus não confere com litros × taxa");
    if (d.base != null) { var okk = Math.abs(_r(sv + sb) - d.base) <= TOL && Math.abs(_r(d.base * 0.23) - d.iva) <= TOL && Math.abs(_r(d.base + d.iva) - d.total) <= TOL;
      add(g, okk ? "ok" : "erro", okk ? "Base " + eur(d.base) + " + IVA 23% " + eur(d.iva) + " = " + eur(d.total) + " a liquidar" : "Base/IVA/total não conferem"); }
    var bt = 0;
    d.tot.forEach(function (t) { if (Math.abs((t.fin - t.ini) - t.l) > 0.01 || Math.abs(t.ccs + t.ncr - t.l) > 0.01) bt++;
      var ll = _r(soma(d.linhas.filter(function (l) { return l.prod === t.prod && l.data === t.data; }), function (l) { return l.l; })); if (Math.abs(ll - t.ccs) > 0.01) bt++; });
    add(g, !bt ? "ok" : "erro", !bt ? "Totalizadores: final − inicial = litros faturados, por produto e dia" : bt + " diferença(s) entre totalizadores e litros faturados");
  });
  var tots = {}, tord = [];
  por.CCS.forEach(function (d) { d.tot.forEach(function (t) { if (!tots[t.prod]) { tots[t.prod] = {}; tord.push(t.prod); } tots[t.prod][t.data] = t; }); });
  var probs = [], nd = 0;
  tord.forEach(function (p) { var dm = tots[p], ds = Object.keys(dm).sort();
    for (var i = 0; i + 1 < ds.length; i++) { var a = ds[i], b = ds[i + 1], gap = dias(a, b); nd++;
      if (gap === 1 && dm[b].ini !== dm[a].fin) probs.push(p + ": " + a.slice(8) + "/" + a.slice(5, 7) + " fecha em " + dm[a].fin + " e " + b.slice(8) + "/" + b.slice(5, 7) + " abre em " + dm[b].ini);
      else if (gap > 1) probs.push(p + ": faltam dias entre " + a.slice(8) + "/" + a.slice(5, 7) + " e " + b.slice(8) + "/" + b.slice(5, 7)); } });
  if (tord.length) add("Totalizadores (continuidade)", !probs.length ? "ok" : "erro", !probs.length ? "O totalizador final de cada dia é o inicial do dia seguinte (" + nd + " passagens verificadas)" : probs.slice(0, 6).join("; "));
  var pr = {}, pord = [];
  por.CCS.forEach(function (d) { d.linhas.forEach(function (l) { if (!pr[l.prod]) { pr[l.prod] = {}; pord.push(l.prod); } pr[l.prod][l.preco + "|" + l.cu] = 1; }); });
  var mud = pord.filter(function (p) { return Object.keys(pr[p]).length > 1; });
  if (pord.length) add("Preços e comissões", !mud.length ? "ok" : "aviso", !mud.length ? "Preço de consignação e comissão por litro iguais em todas as faturas" : "Mudou preço/comissão em: " + mud.join(", "));
  por.NDC.forEach(function (d) {
    var g = "Nota de crédito " + d.numero;
    var bad = d.ncr.filter(function (l) { return Math.abs(l.l * l.preco + l.com - l.vliq) > TOL || Math.abs(l.l * l.cu - l.com) > TOL; }).length
      + d.acerto.filter(function (l) { return Math.abs(l.l * l.dif - l.vliq) > TOL; }).length
      + d.reemb.filter(function (l) { return Math.abs(Math.abs(l.l * l.u) - Math.abs(l.vliq)) > TOL; }).length
      + d.bonus.filter(function (b) { return Math.abs(Math.abs(b.l * b.u) - Math.abs(b.v)) > 0.05; }).length;
    var n = d.ncr.length + d.acerto.length + d.reemb.length + d.bonus.length;
    add(g, !bad ? "ok" : "erro", !bad ? "Todas as " + n + " linhas calculadas corretamente (litros × preço/taxa, arredondamentos até 5 cênt.)" : bad + " linha(s) com conta errada");
    var sm = _r(soma(d.ncr, function (l) { return l.vliq; }) + soma(d.acerto, function (l) { return l.vliq; }) + soma(d.reemb, function (l) { return l.vliq; }) + soma(d.bonus, function (b) { return b.v; }));
    var ok = d.base != null && Math.abs(sm - d.base) <= TOL && Math.abs(_r(d.base * 0.23) - d.iva) <= TOL && Math.abs(_r(d.base + d.iva) - d.total) <= TOL;
    add(g, ok ? "ok" : "erro", ok ? "Base " + eur(d.base) + " + IVA " + eur(d.iva) + " = " + eur(d.total) + " a receber" : "Soma das linhas " + eur(sm) + " não confere com base/IVA/total");
  });
  por.VF.forEach(function (d) {
    var g = "Autofatura Solred " + d.numero, bad = d.linhas.filter(function (l) { return Math.abs(l.l * l.u - l.com) > 0.011; }).length;
    add(g, !bad ? "ok" : "erro", !bad ? "Comissão = litros × taxa em " + d.linhas.length + " linha(s) de combustível" : bad + " linha(s) com comissão errada");
    var com = _r(soma(d.linhas, function (l) { return l.com; })), lav = _r(soma(d.reemb.filter(function (r) { return r.prod.indexOf("Lavagen") >= 0; }), function (r) { return r.vliq; }));
    var comb = _r(soma(d.reemb.filter(function (r) { return r.prod.indexOf("Lavagen") < 0; }), function (r) { return r.vliq; })), bens = _r(soma(d.bens || [], function (b) { return b.v; }));
    var bases = d.ivas.map(function (x) { return x[0]; }), e23 = _r(com + lav);
    var okb = bases.length === 3 ? (Math.abs(bases[0] - e23) <= TOL && Math.abs(bases[1] - bens) <= TOL && Math.abs(bases[2] - comb) <= TOL) : (bases.length >= 2 && Math.abs(soma(bases, function (x) { return x; }) - _r(com + lav + bens + comb)) <= 0.03);
    add(g, okb ? "ok" : "erro", okb ? "Bases de IVA batem com as linhas (comissões " + eur(com + lav) + ", reembolso combustível " + eur(comb) + ")" : "Bases de IVA não batem com as linhas");
    var tot = _r(soma(d.ivas, function (x) { return x[0] + x[1]; })), ok = Math.abs(tot - d.total) <= TOL && d.ivas.every(function (x) { return !x[1] || Math.abs(_r(x[0] * 0.23) - x[1]) <= TOL; });
    add(g, ok ? "ok" : "erro", ok ? "Bases + IVA = " + eur(d.total) : "Bases + IVA (" + eur(tot) + ") ≠ total (" + eur(d.total) + ")");
  });
  var sol = {};
  por.VF.forEach(function (d) { d.linhas.forEach(function (l) { var s = sol[l.fecho] = sol[l.fecho] || {data: l.data, vf: {}, ndc: {}, bruto: 0}; s.vf[l.prod] = (s.vf[l.prod] || 0) + l.l; }); });
  por.NDC.forEach(function (d) { d.ncr.forEach(function (l) { var s = sol[l.fecho] = sol[l.fecho] || {data: l.data, vf: {}, ndc: {}, bruto: 0}; s.ndc[l.prod] = (s.ndc[l.prod] || 0) + l.l; s.bruto += l.l * l.preco * 1.23; }); });
  Object.keys(sol).sort(function (a, b) { return parseInt(a, 10) - parseInt(b, 10); }).forEach(function (f) {
    var s = sol[f], g = "Solred · fecho " + f + " (" + s.data.slice(8) + "/" + s.data.slice(5, 7) + ")";
    var vv = Object.keys(s.vf), nn = Object.keys(s.ndc), lv = _r(soma(vv, function (k) { return s.vf[k]; })), ln = _r(soma(nn, function (k) { return s.ndc[k]; }));
    if (vv.length && nn.length) {
      var todos = vv.concat(nn.filter(function (k) { return vv.indexOf(k) < 0; })), ok = todos.every(function (p) { return Math.abs((s.vf[p] || 0) - (s.ndc[p] || 0)) <= 0.011; });
      add(g, ok ? "ok" : "erro", ok ? "Litros da autofatura (" + pt(lv) + ") = litros da nota de crédito (" + pt(ln) + ")" : "Litros da autofatura (" + f2(lv) + ") ≠ nota de crédito (" + f2(ln) + ")", s.data);
    }
    var lit = nn.length ? ln : lv, dd = app.dias[s.data];
    if (dd) {
      var la = soma(["t1", "t2"], function (t) { return num((dd[t] || {}).lit || ""); });
      if (la > 0) { var dif = _r(la - lit); add(g, Math.abs(dif) <= 1.0 ? "ok" : "erro", "Solred litros: app " + pt(la) + " L · documento " + pt(lit) + " L" + (Math.abs(dif) <= 1.0 ? "" : " · diferença " + pt(dif) + " L"), s.data); }
      else add(g, "info", "Sem “Solred litros” registados no app neste dia (documento: " + pt(lit) + " L)", s.data);
      if (nn.length) { var sa = soma(["t1", "t2"], function (t) { return num((dd[t] || {}).solred || ""); });
        if (sa > 0) add(g, "info", "Solred €: app " + eur(sa) + " · nota de crédito (litros × preço + IVA) ≈ " + eur(s.bruto) + " (diferença " + eur(sa - s.bruto) + ")", s.data); }
    } else add(g, "info", "Dia " + s.data + " não registado no app", s.data);
  });
  politica(docs, add);
  var fe = {};
  por.LIQ.forEach(function (L) { L.itens.forEach(function (i) { if (i.tipo.indexOf("Visa") === 0 && lstrip0(i.pos) === pos) fe[parseInt(i.fecho, 10) + "|" + i.data] = [parseInt(i.fecho, 10), i.data]; }); });
  var fl = Object.keys(fe).map(function (k) { return fe[k]; }).sort(function (a, b) { return a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0); }), falt = [];
  for (var i = 0; i + 1 < fl.length; i++) { var a = fl[i], b = fl[i + 1]; if (b[0] - a[0] > 1 && b[0] - a[0] <= 8 && dias(a[1], b[1]) <= 8) for (var x = a[0] + 1; x < b[0]; x++) falt.push(x); }
  if (falt.length) add("MB · fechos do POS", "info", "Fechos sem crédito em nenhum documento carregado: " + falt.join(", ") + " (podem estar noutro documento de liquidação)");
  else if (fl.length) add("MB · fechos do POS", "ok", "Sem saltos na sequência de fechos carregados (" + fl[0][0] + "–" + fl[fl.length - 1][0] + ")");
  return out;
}

/* ================================================================ fechos digitalizados (fechos.py) */
var TOLF = 0.015, POS_MB = "36613";
var TROCA = {O: "0", o: "0", Q: "0", "@": "0", D: "0", G: "0", U: "0", C: "0", c: "0", l: "1", I: "1", i: "1", "|": "1", "!": "1", L: "1", t: "1",
             Z: "2", z: "2", S: "5", s: "5", B: "8", g: "9", q: "9", A: "4", a: "4", b: "6"};
function digitos(tok) { return tok.replace(/./g, function (c) { return TROCA[c] || c; }); }
var RE_DIN = /(?<![\p{L}\p{N}_,])(\d{1,3}(?:\.\s?\d{3})+|\d+)\s?[,;.]\s?[,;]?\s?(\d\d)(?!\d)/gu;
function limpaLinha(l) {
  l = l.replace(/€/g, " € ").replace(/¢/g, " € ").replace(/©/g, " € ");
  return l.replace(/(?<![A-Za-z])[0-9OoQ@GDUlI|SBZgq]{1,4}(?:[.,;]\s?[0-9OoQ@GDUlI|SBZgq]{2,3})+(?![A-Za-z])/g, function (m) { return digitos(m); });
}
function valores(l) { var out = [], m; RE_DIN.lastIndex = 0; var s = limpaLinha(l); while ((m = RE_DIN.exec(s))) out.push(parseFloat(m[1].replace(/[.\s]/g, "") + "." + m[2])); return out; }
function dataISO(a, m, d) { var dt = new Date(Date.UTC(a, m - 1, d)); return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && a >= 1 ? dt.toISOString().slice(0, 10) : ""; }
function _data(txt) {
  var m = /Data\s*[:;|]?\s*([0-9OoQ@DlI|SBZ]{1,2})\s*[-\/]\s*([0-9OoQ@DlI|SBZ]{1,2})\s*[-\/]\s*([0-9OoQ@DlI|SBZ]{4})/.exec(txt);
  if (!m) return ""; var d = digitos(m[1]), mm = digitos(m[2]), a = digitos(m[3]);
  if (!/^\d+$/.test(d + mm + a)) return ""; return dataISO(+a, +mm, +d);
}
function _hora(txt) { var m = /Hora\s*[:;]?\s*([0-9OoQ@DlI|]{1,2})\s*:\s*([0-9OoQ@DlI|]{2})/.exec(txt); return m ? digitos(m[1]).padStart(2, "0") + ":" + digitos(m[2]) : ""; }
function turnoSugerido(dia, hora) {
  var h = /^\d\d$/.test((hora || "").slice(0, 2)) ? parseInt(hora.slice(0, 2), 10) : 12;
  if (!dia) return ["", hora ? (h >= 5 && h < 18 ? "t1" : "t2") : ""];
  if (h < 5) { var d = new Date(dia + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - 1); return [d.toISOString().slice(0, 10), "t2"]; }
  return [dia, h < 18 ? "t1" : "t2"];
}
function classificarFecho(txt) {
  var T = txt.toUpperCase();
  if (/FECH0? DE TURN|TOTAIS POR TIP|TOTA[IL1]S POR/.test(T) && /S[O0]LRED|TIPO CART/.test(T)) return "SOLRED";
  if (/TOTA[IL1]S TPA|T0TAIS TPA|VOLUC|PAGAMENT[O0] AUT|C[O0]NTRAT[O0]\s+NR|TPA DESAT|M[O0]VIMENTAR/.test(T)) return "MB";
  return "";
}
function linhasTxt(txt) { return txt.split(/\r\n|\r|\n|\v|\f|\x1c|\x1d|\x1e|\x85|\u2028|\u2029/); }   // str.splitlines()
function nContagem(l) { var n = l.split(",")[0].match(/\b([0-9OoQ@DlI|]{2,3})\b/g); if (!n) return null; var d = digitos(n[0]); return /^\d+$/.test(d) ? parseInt(d, 10) : null; }
function lerMB(txt) {
  var linhas = linhasTxt(txt).filter(function (l) { return l.trim(); });
  var r = {tipo: "MB", dia: _data(txt), hora: _hora(txt), tpa: "", periodo: "", compra: null, n_compra: null, devolucao: null, n_devolucao: null, contratos: [], total_movimentar: null};
  var m = /Autom\S*\s*[:;]?\s*([0-9OoQ@DlI|SBZ]{6,10})/.exec(txt);
  if (m) { r.tpa = lstrip0(digitos(m[1])); if (r.tpa.slice(-4) === lstrip0(POS_MB).slice(-4)) r.tpa = lstrip0(POS_MB); }
  m = /Per\s*([0-9OoQ@DlI|SBZasg]{3})\b/.exec(txt);
  if (m) { var p = digitos(m[1]); r.periodo = /^\d+$/.test(p) ? String(parseInt(p, 10)) : ""; }
  if (!r.dia) { m = /\b(\d\d)-(\d\d)-(\d\d)\s+(\d\d):(\d\d)/.exec(txt); if (m) { var dd = dataISO(2000 + +m[1], +m[2], +m[3]); if (dd) { r.dia = dd; r.hora = r.hora || m[4] + ":" + m[5]; } } }
  var em = false;
  linhas.forEach(function (l) {
    var U = l.toUpperCase(), v = valores(l);
    if (/C[O0]MPRA|MPRA\b|WP\s?RA/.test(U) && v.length && r.compra === null) { r.compra = v[v.length - 1]; r.n_compra = nContagem(l); }
    else if (/DEV[O0]?LU|V[O0]LUC|VULUC/.test(U) && v.length && r.devolucao === null) { r.devolucao = v[v.length - 1]; r.n_devolucao = nContagem(l); }
    else if (/C[O0]NTRAT|VAL[O0]R T[O0]TAL/.test(U)) em = true;
    else if (/M[O0]VIMENT/.test(U) || (/^\s*T[O0]TAL\s+A\b/.test(U) && v.length)) { r.total_movimentar = v.length ? v[v.length - 1] : null; em = false; }
    else if (em && v.length >= 2) {
      var sinal = /\d\s?-\s/.test(limpaLinha(l)) ? -1 : 1, nome = /^\s*([A-Za-z][A-Za-z\- ]{0,14}?)\s+[0-9OoQ@]/.exec(l);
      r.contratos.push({contrato: nome ? nome[1].trim() : l.slice(0, 12).trim(), valor: _r(sinal * v[v.length - 2]), desconto: v[v.length - 1]});
    }
  });
  if (r.compra === null && r.contratos.length && r.total_movimentar !== null) {
    /* COMPRA não lida: soma dos contratos − soma dos descontos = total a movimentar permite reconstruí-la */
    var sv = _r(soma(r.contratos, function (c) { return c.valor; })), sd = _r(soma(r.contratos, function (c) { return c.desconto; }));
    if (Math.abs(sv - sd - r.total_movimentar) <= 0.02) {
      r.compra = _r(soma(r.contratos.filter(function (c) { return c.valor > 0; }), function (c) { return c.valor; }));
      r.devolucao = _r(-soma(r.contratos.filter(function (c) { return c.valor < 0; }), function (c) { return c.valor; }));
      r.deduzido = {contratos: sv, descontos: sd};
    }
  }
  if (r.devolucao === null && r.compra !== null) r.devolucao = 0.0;
  r.mb = r.compra !== null ? _r(r.compra - r.devolucao) : null;
  return r;
}
function verificarMB(r) {
  var ch = [];
  if (r.mb === null) ch.push(["erro", "Não consegui ler a linha COMPRA. Escreva os valores a partir da fotografia (e, da próxima vez, fotografe o talão inteiro, do cabeçalho até ao TOTAL, direito e bem iluminado)."]);
  else if (r.deduzido) ch.push(["aviso", "A linha COMPRA não foi lida: compra − devolução deduzida das " + r.contratos.length + " linhas dos contratos (" + pt(r.deduzido.contratos) + " − descontos " + pt(r.deduzido.descontos) + " = total " + pt(r.total_movimentar) + "). Confira com a fotografia."]);
  if (r.tpa && r.tpa.slice(-4) !== lstrip0(POS_MB).slice(-4)) ch.push(["aviso", "Terminal " + r.tpa + " não é o do posto (" + POS_MB + ")."]);
  if (r.mb !== null && r.total_movimentar !== null) {
    var desc = _r(r.mb - r.total_movimentar);
    if (desc >= 0 && desc <= Math.max(0.6, 0.012 * r.mb)) ch.push(["ok", "Compra − devolução (" + pt(r.mb) + ") bate com o total a movimentar (" + pt(r.total_movimentar) + ") menos " + pt(desc) + " de comissões: leitura coerente."]);
    else ch.push(["aviso", "Compra − devolução (" + pt(r.mb) + ") não bate com o total a movimentar (" + pt(r.total_movimentar) + "). Confira com a fotografia."]);
  } else if (r.mb !== null) ch.push(["aviso", "Não li o total a movimentar: confira compra e devolução com a fotografia."]);
  if (!r.dia) ch.push(["aviso", "Não li a data: escolha o dia."]);
  return ch;
}
/* difflib.SequenceMatcher(None, a, b).ratio() e get_close_matches (sem "junk": textos curtos) */
function ratio(a, b) {
  function longest(alo, ahi, blo, bhi) {
    var bi = 0, bj = 0, bs = 0, j2len = {};
    for (var i = alo; i < ahi; i++) { var nj = {};
      for (var j = blo; j < bhi; j++) if (a[i] === b[j]) { var k = (j2len[j - 1] || 0) + 1; nj[j] = k; if (k > bs) { bi = i - k + 1; bj = j - k + 1; bs = k; } }
      j2len = nj; }
    return [bi, bj, bs];
  }
  function blocos(alo, ahi, blo, bhi) { var x = longest(alo, ahi, blo, bhi); if (!x[2]) return 0; return x[2] + (alo < x[0] && blo < x[1] ? blocos(alo, x[0], blo, x[1]) : 0) + (x[0] + x[2] < ahi && x[1] + x[2] < bhi ? blocos(x[0] + x[2], ahi, x[1] + x[2], bhi) : 0); }
  var t = a.length + b.length; return t ? 2 * blocos(0, a.length, 0, b.length) / t : 1;
}
function closeMatch(w, cands, cutoff) {
  var best = null, bs = -1;
  cands.forEach(function (c) { var s = ratio(c, w); if (s >= cutoff && s > bs) { bs = s; best = c; } });   // difflib: maior pontuação; em empate, a última
  cands.forEach(function (c) { var s = ratio(c, w); if (s === bs) best = c; });
  return best;
}
var SECOES = [["Operações", /^\s*OPERA/i], ["Solred", /TIPO\s*CART|TOTA\S*\s*POR/i], ["Desconto unitário", /DESC\S*\s*UNIT|SCONTO UNIT/i], ["Totais desconto", /^\s*TOTA\S*\s*DESC/i],
              ["Saldo redimido", /SALD\S*\s*RED/i], ["My Repsol", /MY\s*REP/i], ["Outros", /TOTA\S*\s*OUTR/i]];
var ROTULOS = {"Operações": ["VENDAS", "DEVOLUCOES", "DESCONTOS", "REEMBOLSO DESCONTOS"],
  _: ["GASOLEO", "GASOLINA 95", "DIESEL E+10", "G95PREMIUM", "EFITEC 98", "LAVAGENS", "DI 5CTS", "DI 6CTS", "BANCARIO", "DINHEIRO", "D. BANCARIO", "TOTAL", "SOLRED", "LOJA", "GPL"]};
function rotulo(l, secao) {
  var alfa = /^\s*([A-Za-zÀ-ÿ0-9.+ ]+?)\s*(?=[0-9OoQ@|]{1,3}\s|\s\d|$)/.exec(l);
  var bruto = (alfa ? alfa[1] : l).toUpperCase().replace(/Á/g, "A").replace(/Õ/g, "O").replace(/Ç/g, "C").replace(/[^A-Z0-9+. ]/g, "").replace(/\s+/g, " ").trim();
  var cands = (ROTULOS[secao] || []).concat(ROTULOS._), best = closeMatch(bruto, cands, 0.55);
  if (!best) { var so = /^[A-Z. ]+/.exec(bruto); best = so ? closeMatch(so[0].trim(), cands, 0.6) : null; }
  return best || "";
}
function lerSolred(txt) {
  var r = {tipo: "SOLRED", dia: _data(txt), hora: _hora(txt), operacao: "", id: "", desde: "", ate: "", turno_tpv: "", secoes: {}}, m;
  m = /Num\S*\s*da\s*Opera\S*\s*[:;]?\s*([0-9OoQ@DlI|SBZ\/]{4,8})/.exec(txt); if (m) r.operacao = digitos(m[1]).replace(/\D/g, "");
  m = /Id\s*[:;]\s*([0-9a-zA-Z\- ]{20,40})/.exec(txt); if (m) r.id = m[1].replace(/\s/g, "").slice(0, 36);
  m = /desde\s*:?\s*\n?\s*(\d\d-\d\d-\d{4})\s+([0-9:@ ]{5,9})/i.exec(txt); if (m) r.desde = m[1] + " " + digitos(m[2].replace(/ /g, "")).slice(0, 5);
  m = /at[ée]\s*:?\s*\n?\s*(\d\d-\d\d-\d{4})\s+([0-9:@ ]{5,9})/i.exec(txt);
  if (m) { r.ate = m[1] + " " + digitos(m[2].replace(/ /g, "")).slice(0, 5); r.hora = r.ate.slice(11, 16) || r.hora; if (!r.dia) { var d = r.ate.slice(0, 10).split("-"); r.dia = d[2] + "-" + d[1] + "-" + d[0]; } }
  var secao = "";
  linhasTxt(txt).forEach(function (l) {
    if (!l.trim()) return;
    for (var s = 0; s < SECOES.length; s++) if (SECOES[s][1].test(l)) { secao = SECOES[s][0]; return; }
    if (!secao || /^\s*N\S?\s*OP\b|^\s*\S{0,3}\s*N2 OP/i.test(l)) return;
    var rot = rotulo(l, secao); if (!rot || rot === "SOLRED") return;
    var limpa = limpaLinha(l); RE_DIN.lastIndex = 0; var m1 = RE_DIN.exec(limpa); RE_DIN.lastIndex = 0;
    var v = valores(l), antes = (m1 ? limpa.slice(0, m1.index) : limpa).trim().split(/\s+/).filter(Boolean), linha = {};
    if (antes.length > rot.split(" ").length) { var n = digitos(antes[antes.length - 1].replace(/^[.:;,'"“]+|[.:;,'"“]+$/g, "")); if (/^\d+$/.test(n) && n.length <= 4) linha.n = parseInt(n, 10); }
    if (secao === "Operações") { if (v.length) linha.valor = v[0]; }
    else if (secao === "Outros" || v.length >= 2) ["litros", "valor", "dt"].forEach(function (c, i) { if (i < v.length) linha[c] = v[i]; });
    else if (v.length === 1) linha.valor = v[0];
    if (Object.keys(linha).length) (r.secoes[secao] = r.secoes[secao] || {})[rot] = linha;
  });
  ["Solred", "Totais desconto", "Saldo redimido"].forEach(function (sec) {
    var S = r.secoes[sec] || {}, tot = S.TOTAL; if (!tot) return;
    ["litros", "valor"].forEach(function (col) {
      var ks = Object.keys(S), falta = ks.filter(function (k) { return k !== "TOTAL" && S[k][col] == null; });
      if (tot[col] != null && falta.length === 1 && ks.length > 2) {
        var outros = soma(ks.filter(function (k) { return k !== "TOTAL" && k !== falta[0]; }), function (k) { return S[k][col]; });
        S[falta[0]][col] = _r(tot[col] - outros); (S[falta[0]].deduzido = S[falta[0]].deduzido || []).push(col);
      }
    });
  });
  var sol = (r.secoes.Solred || {}).TOTAL || {};
  r.solred = sol.valor == null ? null : sol.valor; r.lit = sol.litros == null ? null : sol.litros;
  return r;
}
function verificarSolred(r) {
  var ch = [], S = r.secoes.Solred || {}, tot = S.TOTAL;
  if (!tot || tot.valor == null) { ch.push(["erro", "Não consegui ler o TOTAL Solred. Escreva os valores a partir da fotografia."]); return ch; }
  var prods = Object.keys(S).filter(function (k) { return k !== "TOTAL"; }).map(function (k) { return S[k]; });
  [["valor", "€"], ["litros", "litros"]].forEach(function (cn) { var col = cn[0];
    if (prods.length && tot[col] != null && prods.every(function (p) { return p[col] != null; })) { var s = _r(soma(prods, function (p) { return p[col]; }));
      if (Math.abs(s - tot[col]) <= TOLF) ch.push(["ok", "Solred " + cn[1] + ": soma dos combustíveis = total (" + pt(tot[col]) + ")."]);
      else ch.push(["aviso", "Solred " + cn[1] + ": a soma dos combustíveis (" + pt(s) + ") não dá o total lido (" + pt(tot[col]) + "). Confira com a fotografia."]); } });
  var ban = r.secoes.Outros || {};
  if (ban.BANCARIO && ban.BANCARIO.valor != null) { var dv = (ban["D. BANCARIO"] || {}).valor; var mbv = _r(ban.BANCARIO.valor - (dv == null ? 0 : dv) || 0); r.mb_tpv = mbv;
    ch.push(["info", "Pelo TPV, MB do turno = bancário − devoluções bancárias = " + pt(mbv) + " (deve ser igual ao fecho MB)."]); }
  var vend = ((r.secoes["Operações"] || {}).VENDAS || {}).valor;
  if (vend != null) { if (Math.abs(vend - tot.valor) <= TOLF) ch.push(["ok", "Vendas do turno no TPV (" + pt(vend) + ") = total Solred."]); else ch.push(["info", "Vendas do TPV " + pt(vend) + " ≠ total Solred " + pt(tot.valor) + "."]); }
  if (!r.dia) ch.push(["aviso", "Não li a data: escolha o dia."]);
  return ch;
}
/* leitura completa de um fecho (sem cruzamentos com a base de dados: esses faz o ecrã) */
function lerFecho(texto) {
  if (typeof texto !== "string" || texto.length > 50000) throw new Error("texto inválido");
  var tipo = classificarFecho(texto), r, ch;
  if (tipo === "MB") { r = lerMB(texto); ch = verificarMB(r); r.registo = {mb: r.mb}; }
  else if (tipo === "SOLRED") { r = lerSolred(texto); ch = verificarSolred(r); r.registo = {solred: r.solred, lit: r.lit}; }
  else throw new Error("Não reconheci o talão. Use o fecho MB (TOTAIS TPA) ou o fecho de turno Solred.");
  var ts = turnoSugerido(r.dia, r.hora); r.dia_sug = ts[0]; r.turno_sug = ts[1];
  r.verificacoes = ch.map(function (x) { return {nivel: x[0], msg: x[1]}; });
  return r;
}

/* pontuação de uma leitura de fecho, para escolher entre várias passagens de OCR */
function pontuarFecho(r) {
  if (!r) return -99;
  var p = 0;
  (r.verificacoes || []).forEach(function (c) { p += c.nivel === "ok" ? 3 : c.nivel === "erro" ? -5 : c.nivel === "aviso" ? -1 : 0; });
  if (r.tipo === "MB") { if (r.mb != null) p += 2; if (r.total_movimentar != null) p += 1; if (r.dia) p += 1; if (r.periodo) p += 1; }
  else { if (r.solred != null) p += 2; if (r.lit != null) p += 2; if (r.dia) p += 1; }
  return p;
}
/* ---------------- fecho contabilístico mensal do TMS (tradução de caixa_app/tms.py) ---------------- */
function tmsErro(m) { var e = new Error(m); e.naoReconhecido = true; return e; }
function inteiro100(s) {
  s = String(s == null ? "" : s).trim().replace(/ /g, "");
  if (!s) return null;
  var neg = s.charAt(0) === "-"; s = s.replace(/^[+-]+/, "");
  if (!/^\d*(,\d{0,2})?$/.test(s) || s === "" || s === ",") throw tmsErro("Número inválido no ficheiro do TMS: " + s);
  var k = s.indexOf(","), i = k < 0 ? s : s.slice(0, k), f = k < 0 ? "" : s.slice(k + 1);
  var v = parseInt(i || "0", 10) * 100 + parseInt((f + "00").slice(0, 2), 10);
  return neg ? -v : v;
}
function tmsInt(s) { if (!/^\d+$/.test(s || "")) throw tmsErro("Número de operações inválido no ficheiro do TMS: " + s); return parseInt(s, 10); }
function tmsData(s) { var m = /(\d{2})-(\d{2})-(\d{4})\s+(\d{2}:\d{2}:\d{2})/.exec(s || ""); return m ? m[3] + "-" + m[2] + "-" + m[1] + "T" + m[4] : null; }
function tmsDia(iso, n) { var p = iso.split("-"), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n)); return d.toISOString().slice(0, 10); }
function turnoDoFecho(iso) { var dia = iso.slice(0, 10), h = parseInt(iso.slice(11, 13), 10); if (h < 5) return {dia: tmsDia(dia, -1), turno: "t2"}; return {dia: dia, turno: h < 18 ? "t1" : "t2"}; }
function turnoSeguinte(t) { return t.turno === "t1" ? {dia: t.dia, turno: "t2"} : {dia: tmsDia(t.dia, 1), turno: "t1"}; }
function lerTMS(texto) {
  var linhas = texto.replace(/\r\n/g, "\n").split("\n");
  var r = {comercio: "", desde: null, ate: null, remessa: [null, null], operacoes: [], seccoes: []}, sec = null, grupo = null;
  linhas.forEach(function (bruta) {
    bruta = bruta.replace(/\r$/, "");
    if (!bruta.trim()) return;
    var c = bruta.split(";").map(function (x) { return x.trim(); }), k = c[0].toLowerCase();
    if (k.indexOf("comercio") === 0) { r.comercio = c.length > 1 ? c[1] : ""; return; }
    if (k.indexOf("operacoes realizadas desde") === 0) { r.desde = tmsData(c[1] || ""); return; }
    if (k.indexOf("operacoes realizadas ate") === 0) { r.ate = tmsData(c[1] || ""); return; }
    if (k.indexOf("remessa desde") === 0) { r.remessa[0] = /^\d+$/.test(c[1] || "") ? parseInt(c[1], 10) : null; return; }
    if (k.indexOf("remessa ate") === 0) { r.remessa[1] = /^\d+$/.test(c[1] || "") ? parseInt(c[1], 10) : null; return; }
    if (c[0].indexOf("___") === 0) { sec = {titulo: c.length > 1 ? c[1] : "", grupos: []}; r.seccoes.push(sec); grupo = null; return; }
    if (c.every(function (x) { return x === ""; })) return;
    if (k === "operacao" || (c[0] === "" && c.length > 1 && c[1].toUpperCase().charAt(0) === "N")) return;
    if (!sec) return;
    if (c.length === 1) { grupo = {nome: c[0], linhas: [], total: null}; sec.grupos.push(grupo); return; }
    if (sec.titulo.toUpperCase().indexOf("TOTAIS OPERACOES") === 0) { r.operacoes.push({op: c[0], n: tmsInt(c[1]), v: inteiro100(c[2])}); return; }
    if (!grupo) { grupo = {nome: sec.titulo.toUpperCase().indexOf("DESCONTO") >= 0 ? "POR DESCONTO" : "", linhas: [], total: null}; sec.grupos.push(grupo); }
    var ln = {nome: c[0], n: tmsInt(c[1]), l: inteiro100(c[2]) || 0, v: inteiro100(c[3]) || 0, dto: c.length > 4 ? inteiro100(c[4]) : null};
    if (c[0].toUpperCase() === "TOTAL") grupo.total = ln; else grupo.linhas.push(ln);
  });
  if (!r.comercio || !r.ate || !r.seccoes.length) throw tmsErro("Não é um fecho contabilístico mensal do TMS (falta o comércio, as datas ou os totais).");
  r.comercio = r.comercio.replace(/^0+/, "") || "0";
  r.mes = r.ate.slice(0, 7);
  r.turnos = {de: r.desde ? turnoSeguinte(turnoDoFecho(r.desde)) : {dia: r.mes + "-01", turno: "t1"}, ate: turnoDoFecho(r.ate)};
  r.verificacoes = verificarTMS(r);
  r.resumo = resumoTMS(r);
  return r;
}
function tmsGrupo(r, titulo, nome) {
  for (var i = 0; i < r.seccoes.length; i++) { var s = r.seccoes[i]; if (s.titulo.toUpperCase().indexOf(titulo) === 0) for (var j = 0; j < s.grupos.length; j++) if (s.grupos[j].nome.toUpperCase() === nome) return s.grupos[j]; }
  return null;
}
function tmsTot(g, campo) { if (!g) return 0; if (g.total) return g.total[campo] || 0; return g.linhas.reduce(function (a, l) { return a + (l[campo] || 0); }, 0); }
function tmsFmt(c) { var s = (Math.abs(c) / 100).toFixed(2).split("."); return (c < 0 ? "-" : "") + s[0].replace(/\B(?=(\d{3})+$)/g, " ") + "," + s[1]; }
function capitalizar(s) { return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); }
function tmsSomas(ls) { var o = {n: 0, l: 0, v: 0, dto: 0}; ls.forEach(function (l) { ["n", "l", "v", "dto"].forEach(function (k) { o[k] += l[k] || 0; }); }); return o; }
function verificarTMS(r) {
  var v = [];
  r.seccoes.forEach(function (s) { s.grupos.forEach(function (g) {
    if (!g.total || !g.linhas.length) return;
    var soma = tmsSomas(g.linhas), dif = ["n", "l", "v", "dto"].filter(function (k) { return soma[k] !== (g.total[k] || 0); });
    var nome = (capitalizar(s.titulo) + " · " + g.nome).replace(/^[ ·]+|[ ·]+$/g, "");
    v.push(dif.length ? {nivel: "erro", msg: nome + ": a soma dos produtos não dá o TOTAL (" + dif.join(", ") + ")."} :
      {nivel: "ok", msg: nome + ": produtos somam o TOTAL (" + g.total.n + " op. · " + tmsFmt(g.total.v) + " €)."});
  }); });
  ["TOTAIS DE DESCONTO UNITARIO", "TOTAIS REEMBOLSO DE DESCONTO UNITARIO"].forEach(function (titulo) {
    var a = tmsGrupo(r, titulo, "POR DESCONTO"), b = tmsGrupo(r, titulo, "TOTAIS DESCONTO");
    if (!(a && b && b.total)) return;
    var soma = tmsSomas(a.linhas), dif = ["n", "l", "v", "dto"].filter(function (k) { return soma[k] !== (b.total[k] || 0); }), nome = capitalizar(titulo);
    v.push(dif.length ? {nivel: "erro", msg: nome + ": por desconto ≠ por produto (" + dif.join(", ") + ")."} :
      {nivel: "ok", msg: nome + ": por desconto = por produto (" + tmsFmt(b.total.dto || 0) + " € de desconto)."});
  });
  return v;
}
function resumoTMS(r) {
  var T = "TOTAIS POR TIPO CARTAO", outros = {};
  r.seccoes.forEach(function (s) { if (s.titulo.toUpperCase().indexOf("TOTAIS OUTROS") === 0) s.grupos.forEach(function (g) { g.linhas.forEach(function (l) { outros[l.nome.toUpperCase()] = l; }); }); });
  function o(n, k) { return (outros[n] || {})[k] || 0; }
  var sol = tmsGrupo(r, T, "SOLRED"), dsol = tmsGrupo(r, T, "DEVOLUCION SOLRED"), pres = tmsGrupo(r, T, "SOLRED PRESENTE"), dpres = tmsGrupo(r, T, "DEVOLUCION SOLRED PRESENTE");
  var desc = tmsGrupo(r, "TOTAIS DE DESCONTO UNITARIO", "TOTAIS DESCONTO"), rdesc = tmsGrupo(r, "TOTAIS REEMBOLSO DE DESCONTO UNITARIO", "TOTAIS DESCONTO");
  var myr = tmsGrupo(r, "TOTAIS MY REPSOL", "MY REPSOL"), dmyr = tmsGrupo(r, "TOTAIS DEVOLUCAO DE MY REPSOL", "DEVOLUCION MY REPSOL");
  return {solred_c: tmsTot(sol, "v") - tmsTot(dsol, "v"), solred_cl: tmsTot(sol, "l") - tmsTot(dsol, "l"), pres_c: tmsTot(pres, "v") - tmsTot(dpres, "v"),
    mb_c: o("BANCARIAS", "v") - o("DEVOLUCION BANCARIA", "v"), num_c: o("EFECTIVO", "v") - o("DEVOLUCION EFECTIVO", "v"),
    desconto_c: tmsTot(desc, "dto") - tmsTot(rdesc, "dto"), desconto_cl: tmsTot(desc, "l") - tmsTot(rdesc, "l"), myrepsol_c: tmsTot(myr, "v") - tmsTot(dmyr, "v")};
}
function lerTMSBytes(u8) { return lerTMS(new TextDecoder("windows-1252").decode(u8)); }
/* ---------------- relatório "Turno por formas de cobrança" (CBOS) (tradução de caixa_app/vendas_cbos.py) ---------------- */
function cbosNum(t) { return inteiro100(t.replace(/\./g, "").replace(/€/g, "").replace(/%/g, "").trim()); }
function cbosCols(linha) {
  var out = [];
  linha.trim().split(/\s{2,}/).forEach(function (c) {
    var m;
    if ((c === "€" || c === "%") && out.length) out[out.length - 1] += c;
    else if (c && /^-?[\d.]*\d(?:,\d+)?[€%]?(?: -?[\d.]*\d(?:,\d+)?[€%]?)+$/.test(c)) c.split(" ").forEach(function (x) { out.push(x); });
    else if (c && /^.*\D(?: -?[\d.]*\d,\d+[€%]?){2,}$/.test(c) && (m = /^(.*?)((?: -?[\d.]*\d,\d+[€%]?){2,})$/.exec(c))) { out.push(m[1].trim()); m[2].trim().split(/\s+/).forEach(function (x) { out.push(x); }); }
    else if (c) out.push(c);
  });
  return out;
}
/* Nome da subfamília (igual a _sem_familia em vendas_cbos.py) */
function cbosSemFamilia(txt, fam, partido) {
  var T = txt.toUpperCase().split(/\s+/).filter(Boolean).join(" "), F = fam.toUpperCase().split(/\s+/).filter(Boolean).join(" ");
  if (!partido) return (T === F || T.indexOf(F + " ") === 0) ? (T.slice(F.length).trim() || F) : T;
  var t = T.split(" "); F.split(" ").forEach(function (w) { var i = t.indexOf(w); if (i >= 0) t.splice(i, 1); });
  return t.join(" ") || F;
}
function cbosENum(t) { return /^-?[\d.]*\d(,\d+)?\s*[€%]?$/.test(t.trim()); }
function cbosData(t) { var m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(t || ""); return m ? m[3] + "-" + m[2] + "-" + m[1] : null; }
function lerVendasCBOS(linhas) {
  var r = {posto: "", nome_posto: "", de: null, ate: null, comb: {}, loja: [], verificacoes: []}, sec = null, forma = null, fam = null, subC = {}, subF = {}, tot = {}, buf = [], pend = [];
  linhas.forEach(function (bruta) {
    var ln = bruta.trim(); if (!ln) return;
    var m = /Lojas:\s*(E\d{3,5})\s*-\s*(.+?)(?:\s{2,}|$)/.exec(ln);
    if (m) { r.posto = m[1]; r.nome_posto = m[2].trim(); }
    if (ln.indexOf("Desde:") === 0) { r.de = cbosData(ln.slice(0, 40)); m = /Até:\s*(\d{2}\/\d{2}\/\d{4})/.exec(ln); if (m) r.ate = cbosData(m[1]); return; }
    if (ln === "Vendas de combustível") { sec = "comb"; forma = null; return; }
    if (ln === "Vendas loja por família") { sec = "loja"; fam = null; return; }
    if (ln.indexOf("Vendas ") === 0 || ln.indexOf("Análises") === 0 || ln.indexOf("Movimentos") === 0) { if (ln.indexOf("Análises") !== 0) sec = null; return; }
    var c = cbosCols(ln);
    if (!c.length || c[0] === "Forma de pagamento" || c[0] === "Família") return;
    if (sec === "comb") {
      if (c[0].indexOf("Subtotal ") === 0) { if (c.length < 3) return; subC[c[0].slice(9).trim()] = [cbosNum(c[1]), cbosNum(c[2])]; return; }
      if (c[0] === "Total") { if (c.length < 3) return; tot.comb = [cbosNum(c[1]), cbosNum(c[2])]; return; }
      if (c.length === 9 && !cbosENum(c[0])) { forma = c[0].toLowerCase(); c = c.slice(1); }
      if (c.length === 8 && forma && !cbosENum(c[0])) (r.comb[forma] = r.comb[forma] || {})[c[0].toUpperCase()] = [cbosNum(c[1]), cbosNum(c[2]), cbosNum(c[5])];
      return;
    }
    if (sec === "loja") {
      /* nomes partidos em várias linhas: guardam-se as linhas até ao "Subtotal <família>" (igual ao Python) */
      if (c[0].indexOf("Subtotal ") === 0 && c.length >= 3) { var f = c[0].slice(9).trim(); subF[f] = [cbosNum(c[1]), cbosNum(c[2])];
        buf.forEach(function (b) { r.loja.push([f.toUpperCase(), cbosSemFamilia(b.txt, f, b.partido), b.n[0], b.n[1], b.n[4]]); }); buf = []; pend = []; return; }
      if (c[0] === "Total" && c.length >= 3) { tot.loja = [cbosNum(c[1]), cbosNum(c[2])]; sec = null; return; }
      var k = 0; while (k < c.length && !cbosENum(c[k])) k++;
      if (k === c.length) {
        if (ln === "Total" || ln === "% Sobre") return;
        var u = buf[buf.length - 1];
        if (u && u.partido && !u.fechado) { u.txt += " " + ln; u.fechado = true; } else pend.push(ln);
        return;
      }
      if (c.length - k === 7) { buf.push({txt: pend.concat(c.slice(0, k)).join(" "), n: c.slice(k).map(cbosNum), partido: pend.length > 0, fechado: false}); pend = []; }
    }
  });
  if (!r.posto || !r.de || !r.ate || !Object.keys(r.comb).length || !r.loja.length)
    throw tmsErro("Não é o relatório \"Turno por formas de cobrança\" com texto (falta o posto, o período ou as tabelas de vendas). Se foi impresso com \"Microsoft Print to PDF\", imprima de novo com \"Guardar como PDF\".");
  r.mes = r.ate.slice(0, 7);
  r.verificacoes = verificarCBOS(r, subC, subF, tot);
  return r;
}
function verificarCBOS(r, subC, subF, tot) {
  var v = [], somaP = function (o, i) { return Object.keys(o).reduce(function (a, k) { return a + o[k][i]; }, 0); };
  Object.keys(r.comb).forEach(function (f) {
    var P = r.comb[f], s = [somaP(P, 0), somaP(P, 1)], esp = subC[f.toUpperCase()], F = f.toUpperCase();
    if (!esp) v.push({nivel: "aviso", msg: "Combustível " + F + ": sem subtotal no relatório para conferir."});
    else if (Math.abs(s[0] - esp[0]) > 5 || Math.abs(s[1] - esp[1]) > 5) v.push({nivel: "erro", msg: "Combustível " + F + ": produtos não dão o subtotal (" + tmsFmt(esp[0]) + " L / " + tmsFmt(esp[1]) + " €)."});
    else v.push({nivel: "ok", msg: "Combustível " + F + ": produtos = subtotal (" + tmsFmt(s[0]) + " L · " + tmsFmt(s[1]) + " €)."});
  });
  if (tot.comb) {
    var s = [0, 0]; Object.keys(r.comb).forEach(function (f) { s[0] += somaP(r.comb[f], 0); s[1] += somaP(r.comb[f], 1); });
    v.push(Math.abs(s[0] - tot.comb[0]) <= 5 && Math.abs(s[1] - tot.comb[1]) <= 5 ? {nivel: "ok", msg: "Combustível: total " + tmsFmt(s[0]) + " L · " + tmsFmt(s[1]) + " € sem IVA."} : {nivel: "erro", msg: "Combustível: a soma não dá o total do relatório."});
  }
  Object.keys(subF).forEach(function (fm) {
    var esp = subF[fm], L = r.loja.filter(function (l) { return l[0] === fm.toUpperCase(); }), s = [L.reduce(function (a, l) { return a + l[2]; }, 0), L.reduce(function (a, l) { return a + l[3]; }, 0)];
    if (s[0] !== esp[0] || Math.abs(s[1] - esp[1]) > 5) v.push({nivel: "erro", msg: "Loja " + fm + ": subfamílias não dão o subtotal."});
  });
  if (tot.loja) {
    var t = [r.loja.reduce(function (a, l) { return a + l[2]; }, 0), r.loja.reduce(function (a, l) { return a + l[3]; }, 0)];
    v.push(t[0] === tot.loja[0] && Math.abs(t[1] - tot.loja[1]) <= 5 ? {nivel: "ok", msg: "Loja: " + Object.keys(subF).length + " famílias, total " + tmsFmt(t[1]) + " € sem IVA, subtotais conferidos."} : {nivel: "erro", msg: "Loja: a soma das famílias não dá o total do relatório."});
  } else v.push({nivel: "erro", msg: "Loja: sem total no relatório para conferir."});
  return v;
}
/* "Folha de Fecho de turno" do mês (CBOS) — na app: FOLHA DE FECHO TURNO MENSAL. Igual a caixa_app/folha_fecho.py.
   Vendas totais de combustível por produto (já com Solred), loja por família, formas de cobrança. Lê cada linha pelos números do fim. */
var FF_N = "-?\\d[\\d.]*(?:,\\d+)?";
var FF_PROD = new RegExp("^(\\d+)\\s+(.+?)\\s+(" + FF_N + ")\\s+(" + FF_N + ")\\s+(" + FF_N + ")€\\s*(" + FF_N + ")€\\s*(" + FF_N + ")€\\s*(" + FF_N + ")€$");
var FF_FAM = new RegExp("^(.+?)\\s+(" + FF_N + ")\\s+(" + FF_N + ")\\s+(" + FF_N + ")€\\s*(" + FF_N + ")€\\s*(" + FF_N + ")€\\s*(" + FF_N + ")€$");
var FF_TOT = new RegExp("^Total (Combust[ií]vel|Loja):\\s+(" + FF_N + ")\\s+(" + FF_N + ")\\s+(" + FF_N + ")€\\s*(" + FF_N + ")€\\s*(" + FF_N + ")€\\s*(" + FF_N + ")€$");
var FF_FORMA = new RegExp("^([A-Z][A-Z0-9 .\\-/]*?)\\s+(" + FF_N + ")$");
function ffN(t) { return inteiro100(t.replace(/\./g, "").replace(/€/g, "").trim()); }
function lerFolhaFecho(linhas) {
  var r = {posto: "", nome_posto: "", de: null, ate: null, comb: [], loja: [], formas: {}, totais: {}, verificacoes: []}, sec = null, tot = {}, formasTotal = null;
  linhas.forEach(function (bruta) {
    var ln = bruta.trim().replace(/\s+/g, " "), m; if (!ln) return;
    m = /Lojas: (E\d{3,5}) - (.+?)(?: \d{2}\/\d{2}\/\d{4}|$)/.exec(ln);
    if (m) { r.posto = m[1]; r.nome_posto = m[2].trim(); return; }
    if (ln.indexOf("Desde:") === 0) { r.de = cbosData(ln.slice(0, 20)); m = /Até: (\d{2}\/\d{2}\/\d{4})/.exec(ln); if (m) r.ate = cbosData(m[1]); return; }
    if (ln === "Vendas de Combustível") { sec = "comb"; return; }
    if (ln === "Vendas em Loja") { sec = "loja"; return; }
    if (ln === "Rendimentos por formas de cobrança") { sec = "formas"; return; }
    if (["Vendas Totais", "Movimentos de Caixa", "Balanço de Caixa", "Impostos"].indexOf(ln) >= 0) { sec = null; return; }
    m = FF_TOT.exec(ln);
    if (m) { tot[m[1].indexOf("Combust") === 0 ? "comb" : "loja"] = [2, 3, 4, 5, 6, 7].map(function (i) { return ffN(m[i]); }); sec = null; return; }
    if (sec === "comb") { m = FF_PROD.exec(ln); if (m) r.comb.push([m[2].toUpperCase(), ffN(m[3]), ffN(m[4]), ffN(m[5]), ffN(m[6]), ffN(m[7]), ffN(m[8]), m[1]]); return; }
    if (sec === "loja") { m = FF_FAM.exec(ln); if (m) r.loja.push([m[1].toUpperCase(), ffN(m[2]), ffN(m[3]), ffN(m[4]), ffN(m[5]), ffN(m[6]), ffN(m[7])]); return; }
    if (sec === "formas") {
      m = new RegExp("^Total: (" + FF_N + ")$").exec(ln); if (m) { formasTotal = ffN(m[1]); return; }
      m = FF_FORMA.exec(ln); if (m && m[1] !== "Forma de pagamento") r.formas[m[1].trim().replace(/\.+$/, "")] = ffN(m[2]);
    }
  });
  if (!r.posto || !r.de || !r.ate || !r.comb.length || !tot.comb)
    throw tmsErro("Não é a \"Folha de Fecho de turno\" do mês com texto (falta o posto, o período ou as vendas de combustível). Se foi impresso com \"Microsoft Print to PDF\", imprima de novo com \"Guardar como PDF\".");
  r.mes = r.ate.slice(0, 7);
  r.totais = {comb: tot.comb || null, loja: tot.loja || null, formas: formasTotal};
  r.verificacoes = verificarFolhaFecho(r);
  return r;
}
function verificarFolhaFecho(r) {
  var v = [], t = r.totais, soma = function (L, i) { return L.reduce(function (a, x) { return a + x[i]; }, 0); };
  var s = [1, 2, 3, 4, 5, 6].map(function (i) { return soma(r.comb, i); }), tc = t.comb;
  if (tc && s[0] === tc[0] && s[1] === tc[1] && [2, 3, 4, 5].every(function (i) { return Math.abs(s[i] - tc[i]) <= 5; }))
    v.push({nivel: "ok", msg: "Combustível: " + r.comb.length + " produtos = total (" + tmsFmt(s[1]) + " L · " + tmsFmt(s[5]) + " € líquidos)."});
  else v.push({nivel: "erro", msg: "Combustível: a soma dos produtos não dá o total do relatório."});
  r.comb.forEach(function (p) { if (Math.abs(p[3] - p[4] - p[5] - p[6]) > 2) v.push({nivel: "erro", msg: "Combustível " + p[0] + ": brutas − devoluções − descontos ≠ líquidas."}); });
  var tl = t.loja;
  if (r.loja.length) {
    var sl = [1, 2, 3, 4, 5, 6].map(function (i) { return soma(r.loja, i); });
    if (tl && sl[0] === tl[0] && sl[1] === tl[1] && [2, 3, 4, 5].every(function (i) { return Math.abs(sl[i] - tl[i]) <= 5; }))
      v.push({nivel: "ok", msg: "Loja: " + r.loja.length + " famílias = total (" + tmsFmt(sl[5]) + " € líquidos)."});
    else v.push({nivel: "erro", msg: "Loja: a soma das famílias não dá o total do relatório."});
  }
  var ks = Object.keys(r.formas);
  if (ks.length && t.formas != null) { var sf = ks.reduce(function (a, k) { return a + r.formas[k]; }, 0);
    v.push(Math.abs(sf - t.formas) <= 5 ? {nivel: "ok", msg: "Formas de cobrança: " + tmsFmt(sf) + " € = total."} : {nivel: "erro", msg: "Formas de cobrança: a soma não dá o total do relatório."}); }
  return v;
}
/* ---------------- tabela semanal de preços da Repsol para a ENSE (tradução de caixa_app/precos_repsol.py) ---------------- */
var PRECOS_ENSE = {
  "GASOLINAEFITEC98": "Gasolina I.O. 98 submetido a processo de aditivação suplementar",
  "GASOLINAS/CHUMBO95": "Gasolina simples 95",
  "EF95PREMIUM": "Gasolina I.O. 95 submetido a processo de aditivação suplementar",
  "GASOLEO": "Gasóleo simples",
  "REPSOLDIESELE+10": "Gasóleo rodoviário submetido a processo de aditivação suplementar",
  "AUTOGAS": "GPL Auto",
  "DIESELNEXA100%": "Gasóleo 100% Renovável - B100"
};
var PRECOS_FORA_ENSE = {"ADBLUEGRANEL": 1};
var PRECOS_MESES = ["JANEIRO", "FEVEREIRO", "MARCO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
function precosChave(nome) {
  var t = nome.toUpperCase(), tr = [["Á", "A"], ["À", "A"], ["Ã", "A"], ["Â", "A"], ["É", "E"], ["Ê", "E"], ["Í", "I"], ["Ó", "O"], ["Õ", "O"], ["Ô", "O"], ["Ú", "U"], ["Ç", "C"]];
  tr.forEach(function (x) { t = t.split(x[0]).join(x[1]); });
  return t.replace(/\s+/g, "");
}
function lerPrecosRepsol(linhas) {
  var N3 = "\\d+,\\d{3}", RE_P = new RegExp("^(.*?)\\s+(" + N3 + ")\\s+(" + N3 + ")\\s+(" + N3 + ")\\s+(" + N3 + ")\\s+(" + N3 + ")$"), mm = function (t) { return parseInt(t.replace(",", ""), 10); };
  var L = linhas.map(function (l) { return l.trim().replace(/\s+/g, " "); }).filter(function (l) { return l; }), texto = L.join(" ");
  if (texto.indexOf("Preços de Referência e de Preços Reduzidos") < 0 && texto.indexOf("Preços de Referência e Preços Reduzidos") < 0) throw tmsErro("Não é a tabela de preços da Repsol (falta «Preços de Referência e Preços Reduzidos»).");
  var r = {posto: "", nome_posto: "", vigor: "", hora: "", produtos: [], verificacoes: []}, m;
  for (var i = 0; i < L.length; i++) { m = /^(E\d{4}) (.+)$/.exec(L[i]); if (m) { r.posto = m[1]; r.nome_posto = m[2].trim(); break; } }
  m = /em vigor a partir das (\d{2})h (\d{2}) do dia (\d{1,2}) de ([A-Za-zçÇ]+) de (\d{4})/.exec(texto);
  if (m) { var k = PRECOS_MESES.indexOf(precosChave(m[4])); if (k >= 0) { r.vigor = m[5] + "-" + String(k + 1).padStart(2, "0") + "-" + String(parseInt(m[3], 10)).padStart(2, "0"); r.hora = m[1] + ":" + m[2]; } }
  var atual = null;
  L.forEach(function (l) {
    var p = RE_P.exec(l);
    if (p) { atual = {pdf: p[1], ref: mm(p[2]), preco: mm(p[3]), red_civa: mm(p[4]), red_siva: mm(p[5]), retalhista: mm(p[6])}; r.produtos.push(atual); return; }
    if (atual && l.length <= 20 && !new RegExp(N3).test(l)) atual.pdf += " " + l;
    atual = null;
  });
  var erros = [], vistos = {};
  if (!r.posto) erros.push("o PDF não diz o posto (E….)");
  if (!r.vigor) erros.push("não encontrei a data de entrada em vigor");
  if (!r.produtos.length) erros.push("não encontrei nenhum produto com preço");
  r.produtos.forEach(function (p) {
    p.chave = precosChave(p.pdf); p.ense = PRECOS_ENSE[p.chave] || null; p.fora = !!PRECOS_FORA_ENSE[p.chave];
    if (!p.ense && !p.fora) erros.push("produto «" + p.pdf + "» não tem campo ENSE conhecido");
    if (vistos[p.chave]) erros.push("produto «" + p.pdf + "» repetido");
    vistos[p.chave] = 1;
    if ((p.ref - p.preco) * 100 !== p.red_civa) erros.push(p.pdf + ": referência − reduzido (" + (p.ref - p.preco) + ") não bate com a redução " + p.red_civa);
    if (Math.abs(p.red_civa / 1.23 - p.red_siva) > 1.5) erros.push(p.pdf + ": redução s/IVA " + p.red_siva + " não corresponde a " + p.red_civa + " ÷ 1,23");
    if (!p.fora && !(p.preco >= 500 && p.preco <= 5000)) erros.push(p.pdf + ": preço " + p.preco + " fora do normal");
  });
  erros.forEach(function (e) { r.verificacoes.push({nivel: "erro", texto: e}); });
  if (!erros.length) r.verificacoes.push({nivel: "ok", texto: r.produtos.length + " produtos; referência − reduzido = redução em todos"});
  return r;
}
/* Fatura mensal «Taxas Exploração» da Repsol: igual a caixa_app/taxas_repsol.py (mudar um obriga a mudar o outro) */
function lerTaxasRepsol(linhas) {
  var CH = {"Taxa My Repsol DI": "mr_di", "Taxa My Repsol CC": "mr_cc", "Taxas Lojas Fixas": "loja", "Taxas Lavagens Fixas": "lavagem", "Taxas Combustíveis": "combustiveis"};
  var c = function (t) { return parseInt(t.replace(/\./g, "").replace(",", ""), 10); }, dt = function (t) { var d = t.split("."); return d[2] + "-" + d[1] + "-" + d[0]; };
  var L = linhas.map(function (l) { return l.trim().replace(/\s+/g, " "); }), texto = L.filter(function (l) { return l; }).join(" ");
  if (texto.indexOf("Taxas Exploração") < 0 || texto.indexOf("Repsol Portuguesa") < 0) throw tmsErro("Não é a fatura de taxas de exploração da Repsol (falta «Taxas Exploração»).");
  var r = {numero: "", data: "", vencimento: "", posto: "", nome_posto: "", linhas: [], mr_di_c: 0, mr_cc_c: 0, myrepsol_c: 0, loja_c: 0, lavagem_c: 0, combustiveis_c: 0, total_c: 0, iva_c: 0, pagar_c: 0, verificacoes: []}, m;
  m = /Documento nº (\S+ \S+\/\d+)/.exec(texto); if (m) r.numero = m[1];
  m = /(?:^|[^\wÀ-ÿ])Data (\d{2}\.\d{2}\.\d{4})/.exec(texto); if (m) r.data = dt(m[1]);
  m = /Data de Vencimento (\d{2}\.\d{2}\.\d{4})/.exec(texto); if (m) r.vencimento = dt(m[1]);
  m = /Cliente \.+: (E\d{4}) (.+?) Referência/.exec(texto); if (m) { r.posto = m[1]; r.nome_posto = m[2].trim(); }
  var erros = [], vistos = {}, RE = /(Taxa My Repsol DI|Taxa My Repsol CC|Taxas Lojas Fixas|Taxas Lavagens Fixas|Taxas Combustíveis) (L|UN) ([\d.]+,\d{2}) (\d+),(\d{6}) ([A-Z0-9]{2}) ([\d.]+,\d{2})/g;
  while ((m = RE.exec(texto))) {
    var k = CH[m[1]], l = {nome: m[1], un: m[2], qtd: c(m[3]), preco: parseInt(m[4], 10) * 1000000 + parseInt(m[5], 10), valor_c: c(m[7])};
    r.linhas.push(l);
    if (vistos[k]) erros.push("linha «" + l.nome + "» repetida");
    vistos[k] = 1; r[k + "_c"] = l.valor_c;
    if (Math.abs(l.qtd * l.preco - l.valor_c * 1000000) > 1000000) erros.push(l.nome + ": quantidade × preço não bate com o valor");
  }
  r.myrepsol_c = r.mr_di_c + r.mr_cc_c;
  m = /VALOR TOTAL S\/IVA\.*: ([\d.]+,\d{2})/.exec(texto); if (m) r.total_c = c(m[1]);
  m = /IVA à taxa de 23% ([\d.]+,\d{2}) ([\d.]+,\d{2})/.exec(texto);
  if (m) { r.iva_c = c(m[2]); if (c(m[1]) !== r.total_c) erros.push("a base do IVA não é igual ao total sem IVA"); }
  m = /VALOR A PAGAR \.*: ([\d.]+,\d{2})/.exec(texto); if (m) r.pagar_c = c(m[1]);
  if (!r.numero) erros.push("não encontrei o número do documento");
  if (!r.data) erros.push("não encontrei a data");
  if (!r.posto) erros.push("o PDF não diz o posto (E….)");
  if (!r.linhas.length) erros.push("não encontrei nenhuma taxa");
  var soma = r.linhas.reduce(function (s, x) { return s + x.valor_c; }, 0);
  if (!r.total_c || soma !== r.total_c) erros.push("a soma das linhas não bate com o total sem IVA: há uma linha que não conheço ou um valor errado");
  if (Math.abs(r.total_c * 23 - r.iva_c * 100) > 100) erros.push("o IVA não é 23 % do total");
  if (r.total_c + r.iva_c !== r.pagar_c) erros.push("total + IVA não bate com o valor a pagar");
  erros.forEach(function (e) { r.verificacoes.push({nivel: "erro", texto: e}); });
  if (!erros.length) r.verificacoes.push({nivel: "ok", texto: r.linhas.length + " linhas; contas certas"});
  return r;
}
/* Faturas e notas de crédito de serviços da Repsol (água, bónus, compensação): igual a caixa_app/servico_repsol.py (mudar um obriga a mudar o outro) */
function lerServicoRepsol(linhas) {
  var c = function (t) { return parseInt(t.replace(/\./g, "").replace(",", ""), 10); }, dt = function (t) { var d = t.split("."); return d[2] + "-" + d[1] + "-" + d[0]; };
  var L = linhas.map(function (l) { return l.trim().replace(/\s+/g, " "); }), texto = L.filter(function (l) { return l; }).join(" "), m;
  if (texto.indexOf("Repsol Portuguesa") < 0 || texto.indexOf("Taxas Exploração") >= 0 || texto.indexOf("Documento nº") < 0 || !/\bRef Descrição\b/.test(texto)) throw tmsErro("Não é uma fatura ou nota de crédito de serviços da Repsol.");
  var r = {tipo: texto.indexOf("NOTA DE CRÉDITO") >= 0 ? "NC" : "FT", numero: "", data: "", posto: "", linhas: [], ivas: [], total_c: 0, iva_c: 0, pagar_c: 0, mes: "", categoria: null, verificacoes: []}, erros = [];
  m = /Documento nº (\S+ \S+\/\d+)/.exec(texto); if (m) r.numero = m[1];
  m = /(?:^|[^\wÀ-ÿ])Data (\d{2}\.\d{2}\.\d{4})/.exec(texto); if (m) r.data = dt(m[1]);
  m = /Cliente \.+: (E\d{4}) /.exec(texto); if (m) r.posto = m[1];
  var RE = /\b(\d{5}) ([^\d.:].{0,60}?) UN ([\d.]+,\d{2}) (\d+),(\d{6}) ([A-Z0-9]{2}) ([\d.]+,\d{2})/g;
  while ((m = RE.exec(texto))) {
    var l = {ref: m[1], nome: m[2], qtd: c(m[3]), preco: parseInt(m[4], 10) * 1000000 + parseInt(m[5], 10), iva: m[6], valor_c: c(m[7])};
    r.linhas.push(l);
    if (Math.abs(l.qtd * l.preco - l.valor_c * 1000000) > 1000000) erros.push(l.nome + ": quantidade × preço não bate com o valor");
  }
  m = /VALOR TOTAL S\/IVA\.*: ([\d.]+,\d{2})/.exec(texto); if (m) r.total_c = c(m[1]);
  m = /VALOR A PAGAR \.*: ([\d.]+,\d{2})/.exec(texto); if (m) r.pagar_c = c(m[1]);
  var RI = /([A-Z0-9]{2}) IVA (?:à taxa de (\d+)%|não tributável.*?) ([\d.]+,\d{2}) ([\d.]+,\d{2})/g;
  while ((m = RI.exec(texto))) {
    var i = {cod: m[1], taxa: parseInt(m[2] || "0", 10), base_c: c(m[3]), iva_c: c(m[4])};
    r.ivas.push(i); r.iva_c += i.iva_c;
    if (Math.abs(i.base_c * i.taxa - i.iva_c * 100) > 100) erros.push("o IVA de " + i.taxa + " % não bate com a base");
  }
  if (!r.numero) erros.push("não encontrei o número do documento");
  if (!r.data) erros.push("não encontrei a data");
  if (!r.posto) erros.push("o PDF não diz o posto (E….)");
  if (!r.linhas.length) erros.push("não encontrei nenhuma linha");
  if (!r.total_c || r.linhas.reduce(function (s, x) { return s + x.valor_c; }, 0) !== r.total_c) erros.push("a soma das linhas não bate com o total sem IVA: há uma linha que não conheço ou um valor errado");
  if (r.ivas.reduce(function (s, x) { return s + x.base_c; }, 0) !== r.total_c) erros.push("as bases do IVA não batem com o total sem IVA");
  if (r.total_c + r.iva_c !== r.pagar_c) erros.push("total + IVA não bate com o valor a pagar");
  var P = [], RP = /\b\d{2}\.\d{4}-(\d{2})\.(\d{4})\b/g; while ((m = RP.exec(texto))) P.push(m[2] + "-" + m[1]);
  P.sort(); r.mes = P.length ? P[P.length - 1] : r.data.slice(0, 7);
  if (r.linhas.length && r.linhas.every(function (x) { return x.ref === "10054" || x.ref === "10055"; })) r.categoria = "Água";
  else if (r.linhas.length && r.linhas.every(function (x) { return x.ref === "10082" || x.ref === "10516"; })) r.categoria = "Outros bónus";   // bónus trimestral My Repsol e compensação de rede
  r.verificacoes = erros.length ? erros.map(function (e) { return {nivel: "erro", texto: e}; }) : [{nivel: "ok", texto: r.linhas.length + " linhas; contas certas"}];
  return r;
}
/* ---------------- valor total dos documentos da Saphety (tradução de caixa_app/total_documento.py) ---------------- */
function lerTotalDocumento(linhas) {
  var NUM = "-?\\d{1,3}(?:\\.\\d{3})*,\\d{2}-?|-?\\d+,\\d{2}-?";
  var c = function (txt) { var t = txt.trim(), neg = /-$/.test(t) || /^-/.test(t); t = t.replace(/^-+|-+$/g, ""); if (t.indexOf(",") >= 0) t = t.replace(/\./g, "").replace(",", "."); var v = Math.round(parseFloat(t) * 100); return neg ? -v : v; };
  var L = linhas.map(function (l) { return l.replace(/\s+/g, " ").trim(); }).filter(function (l) { return l; });
  var procura = function (re) { for (var i = 0; i < L.length; i++) { var m = re.exec(L[i]); if (m) return m; } return null; };
  var todas = function (re) { return L.map(function (l) { return re.exec(l); }).filter(function (m) { return m; }); };
  var r = {valor_c: null, regra: null, motivo: null}, m, v;
  m = procura(new RegExp("Importância a liquidar:\\s*(" + NUM + ")"));
  if (m) {
    v = c(m[1]);
    var q = todas(new RegExp("^23%\\s+(" + NUM + ")\\s+(" + NUM + ")$"));
    if (q.length) { var soma = q.reduce(function (s, x) { return s + c(x[1]) + c(x[2]); }, 0);
      if (Math.abs(soma - v) > 2) { r.motivo = "base + IVA (" + soma + ") não bate com a importância a liquidar (" + v + ")"; return r; } }
    r.valor_c = v; r.regra = "Importância a liquidar"; return r;
  }
  m = procura(new RegExp("^Valor Total:\\s*(" + NUM + ")$"));
  if (m) { r.valor_c = c(m[1]); r.regra = "Valor Total"; return r; }
  m = procura(new RegExp("VALOR A PAGAR \\.*:\\s*(" + NUM + ")"));
  if (m) { r.valor_c = c(m[1]); r.regra = "Valor a pagar"; return r; }
  m = procura(new RegExp("^Total factura\\s+(" + NUM + ")$"));
  if (m) { r.valor_c = c(m[1]); r.regra = "Total factura"; return r; }
  m = procura(new RegExp("^Saldo :\\s*(" + NUM + ")$"));
  var d = procura(new RegExp("^Total Debitos :\\s*(" + NUM + ")$")), cr = procura(new RegExp("^Total Creditos :\\s*(" + NUM + ")$"));
  if (m && d && cr) {
    var deb = c(d[1]), cred = c(cr[1]), saldo = c(m[1]);
    if (Math.abs(deb - cred) !== Math.abs(saldo)) { r.motivo = "débitos − créditos (" + (deb - cred) + ") não bate com o saldo (" + saldo + ")"; return r; }
    r.valor_c = deb - cred; r.regra = "Saldo da liquidação (débitos − créditos)"; return r;
  }
  for (var i = 0; i < L.length; i++) {
    if (L[i] !== "Valor Total") continue;
    var s2 = 0;
    for (var j = i + 1; j < Math.min(i + 12, L.length); j++) {
      var b = new RegExp("^IVA à taxa de [\\d,]+%.*?\\s(" + NUM + ")(?:\\s+(" + NUM + "))?$").exec(L[j]);
      if (b) { s2 += c(b[1]) + (b[2] ? c(b[2]) : 0); continue; }
      var t = /^(\d+\.\d{2})$/.exec(L[j]);
      if (t) { v = c(t[1]);
        if (s2 && Math.abs(s2 - v) > 2) { r.motivo = "bases + IVA (" + s2 + ") não batem com o valor total (" + v + ")"; return r; }
        r.valor_c = v; r.regra = "Valor Total (autofatura)"; return r; }
    }
    break;
  }
  m = procura(new RegExp("^TOTAL\\s+(" + NUM + ")$"));
  if (m) {
    v = c(m[1]);
    var st = procura(new RegExp("Subtotal :\\s*(" + NUM + ")$")), iva = procura(new RegExp("^TOTAL IVA\\s+(" + NUM + ")$"));
    if (st && iva && Math.abs(c(st[1]) + c(iva[1]) - v) > 2) { r.motivo = "subtotal + IVA não bate com o total"; return r; }
    r.valor_c = v; r.regra = "TOTAL"; return r;
  }
  r.motivo = "não encontrei a linha do total"; return r;
}
var MOTOR = {num: num, num1: num1, pt: pt, lerTurno: lerTurno, pdfPaginas: pdfPaginas, lerDocumento: lerDocumento, classificarDoc: classificarDoc, verificar: verificar,
  lerFecho: lerFecho, pontuarFecho: pontuarFecho, lerMB: lerMB, lerSolred: lerSolred, verificarMB: verificarMB, verificarSolred: verificarSolred, turnoSugerido: turnoSugerido, classificarFecho: classificarFecho, valores: valores, ratio: ratio,
  lerServicoRepsol: lerServicoRepsol, lerTMS: lerTMS, lerTMSBytes: lerTMSBytes, inteiro100: inteiro100, turnoDoFecho: turnoDoFecho, turnoSeguinte: turnoSeguinte, lerVendasCBOS: lerVendasCBOS, lerFolhaFecho: lerFolhaFecho, lerTaxasRepsol: lerTaxasRepsol, lerPrecosRepsol: lerPrecosRepsol, lerTotalDocumento: lerTotalDocumento, PRECOS_ENSE: PRECOS_ENSE};
if (typeof module !== "undefined" && module.exports) module.exports = MOTOR; else raiz.MOTOR = MOTOR;
})(typeof window !== "undefined" ? window : globalThis);
