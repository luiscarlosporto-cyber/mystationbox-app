/* mystationbox · leitura de faturas digitalizadas (05/11/2026). Sem ecrã: recebe o texto do leitor e o QR fiscal e devolve a fatura.
 * O formato é o de agente/leitura/digitalizadas.py, que volta a conferir tudo no PC: valores sem IVA em cêntimos e número como no CBOS.
 * Só propõe. O que não bater certo fica marcado para corrigir no cartão, e nada segue sem visto. */
"use strict";
var FATURAS = (function () {
  var FORN = {mcunha: {nome: "M.Cunha", nif: "500172382", ean: true}, vendeiro: {nome: "Vendeiro", nif: "", ean: false}};
  var NIF_LOJA = {sto: "515786217", pnf: "517959054"};

  function digito(c) { var s = 0; for (var i = 0; i < 12; i++) s += +c[i] * (i % 2 ? 3 : 1); return (10 - s % 10) % 10; }
  function eanValido(c) { return /^\d{13}$/.test(c) && digito(c) === +c[12]; }
  /* o leitor troca letras por números e perde vírgulas; estes valores têm sempre duas casas */
  function digitos(t) { return String(t).replace(/[lIi|!]/g, "1").replace(/[oO]/g, "0").replace(/S/g, "5").replace(/B/g, "8").replace(/\D/g, ""); }
  function cent(t) { var d = digitos(t); return d ? parseInt(d, 10) : null; }
  function codigo(t) {
    var c = String(t).replace(/O/g, "0").replace(/\D+$/, "").replace(/\D/g, "");
    if (c.length === 12) c += digito(c);   // a última coluna do código sai cortada na fatura
    return c;
  }
  function qr(t) {
    var o = {}; String(t || "").split("*").forEach(function (p) { var i = p.indexOf(":"); if (i > 0) o[p.slice(0, i)] = p.slice(i + 1); });
    return o.A && o.B && o.O ? o : null;
  }
  function c2(v) { return Math.round(parseFloat(v) * 100); }
  function deQR(q, d) {   // o QR fiscal é a melhor fonte: não depende de ler a imagem letra a letra
    if (!q) return;
    d.qr = true; d.cliente_nif = q.B;
    if (/^\d{8}$/.test(q.F || "")) d.data = q.F.slice(0, 4) + "-" + q.F.slice(4, 6) + "-" + q.F.slice(6);
    d.total_c = c2(q.O); d.imposto_c = c2(q.N || 0); d.bases = {};
    [["I3", 6], ["I5", 13], ["I7", 23]].forEach(function (x) { if (q[x[0]]) d.bases[x[1]] = c2(q[x[0]]); });
    if (q.I2) d.bases[0] = c2(q.I2);
  }
  function lerMCunha(t, q) {
    var d = {fornecedor: "mcunha", numero: "", data: "", cliente_nif: "", total_c: 0, imposto_c: 0, bases: {}, linhas: [], qr: false};
    var n = t.match(/FT\s*(\d+\/\d+)/); if (n) d.numero = n[1];
    var dt = t.match(/Data\s+emiss\S*\s+(\d\d)\/(\d\d)\/(\d{4})/); if (dt) d.data = dt[3] + "-" + dt[2] + "-" + dt[1];
    var nif = t.match(/N\.?\s*[LI1]\.?\s*F\.?\s+(\d{9})/); if (nif) d.cliente_nif = nif[1];
    var tot = t.match(/Total\s+EUR\s+([\d.,]+)/); if (tot) d.total_c = cent(tot[1]);
    t.split("\n").forEach(function (l) {
      l = l.replace(/^\W*§/, "5");   // o leitor confunde o 5 inicial
      var b = l.match(/(?:^|\s)(\d{1,2})\s*%\s+([\d.,]+)\s+([\d.,]+)/); if (b) { d.bases[+b[1]] = cent(b[2]); d.imposto_c += cent(b[3]); return; }
      var m = l.match(/^\W*([0-9O]{11,13}[0-9A-Z]?)[\s.,:;]+(.+?)\s+(\d+)[.,]?\s+(UNI|EMB|GFA|CX|PAC|LT|KG)\b\S*\s+(.+?)\s+(\d{1,2})\s+([\dlIiOo.,]+)\s*$/);
      if (!m) return;
      var par = m[5].trim().split(/\s+/), preco = cent(par[0]), lido = cent(par.slice(1).join("")), qtd = +m[3], iva = +m[6];
      if (par.length === 1) { var dg = digitos(par[0]), meio = dg.length / 2 | 0; preco = parseInt(dg.slice(0, meio), 10); lido = parseInt(dg.slice(meio), 10); }
      var conta = qtd * preco, pu = cent(m[7]), okPreco = Math.abs(Math.round(preco * (100 + iva) / 100) - pu) <= 1;
      /* quantidade × preço manda quando o preço bate com o preço com IVA da mesma linha */
      var valor = okPreco ? conta : lido, cod = codigo(m[1]);
      d.linhas.push({codigo: cod, descricao: m[2].replace(/\s+\d+\s*[xX]\s*\d+$/, "").trim(), qtd: qtd, valor_c: valor, iva: iva, duvida: !eanValido(cod) || (!okPreco && conta !== lido)});
    });
    deQR(q, d);
    if (q && q.G) d.numero = q.G.replace(/^\S+\s+/, "");
    return d;
  }
  function lerVendeiro(t, q) {
    var d = {fornecedor: "vendeiro", numero: "", data: "", cliente_nif: "", total_c: 0, imposto_c: 0, bases: {}, linhas: [], qr: false};
    var n = t.match(/FACT\s+[T1I]\s*(\d)\s*(\d)\s*\/\s*(\d+)/); if (n) d.numero = "T" + n[1] + n[2] + "/" + n[3];
    var dt = t.match(/(20\d\d-\d\d-\d\d)\s+\d\d[:.]\d\d/) || t.match(/(20\d\d-\d\d-\d\d)/); if (dt) d.data = dt[1];
    var nif = t.match(/PT\s*(\d{9})/); if (nif) d.cliente_nif = nif[1];
    var tot = t.match(/Total\s*\(Euros\)\s*:?\s*([\d.,]+)/); if (tot) d.total_c = cent(tot[1]);
    var iva = t.match(/Total\s+IVA\s*:?\s*([\d.,]+)/); if (iva) d.imposto_c = cent(iva[1]);
    var re = /(\d{6})\s*-\s*([^\n]+)\n\s*([\d.,]+)\s+([\d.,]+)\s*UN\s+[\d.,]+\s+(\d{1,2})\s*%/g, m;
    while ((m = re.exec(t))) {
      var preco = cent(m[3]), qtd = Math.round(parseFloat(m[4].replace(",", "."))), taxa = +m[5], comIva = preco * qtd;
      d.linhas.push({codigo: m[1], descricao: m[2].trim(), qtd: qtd, valor_c: Math.round(comIva * 100 / (100 + taxa)), iva: taxa, duvida: false});
    }
    var soma = d.linhas.reduce(function (s, l) { return s + l.valor_c; }, 0), taxa1 = d.linhas[0] ? d.linhas[0].iva : 23;
    if (d.total_c && d.imposto_c) d.bases[taxa1] = d.total_c - d.imposto_c; else if (soma) { d.bases[taxa1] = soma; d.total_c = d.total_c || Math.round(soma * (100 + taxa1) / 100); d.imposto_c = d.total_c - soma; }
    /* preços com IVA: a passagem a sem IVA pode falhar 1 ou 2 cêntimos na soma */
    var dif = (d.bases[taxa1] || 0) - soma; if (d.linhas.length && Math.abs(dif) <= 2) d.linhas[0].valor_c += dif;
    deQR(q, d);
    return d;
  }
  function ler(texto, qrTexto) {
    var q = qr(qrTexto), t = String(texto || "");
    if ((q && q.A === FORN.mcunha.nif) || /M\.?\s*CUNHA|500172382/i.test(t)) return lerMCunha(t, q);
    if (/Vendeiro|FACT\s+[T1I]\s*\d\s*\d\s*\//i.test(t)) return lerVendeiro(t, q);
    return null;
  }
  function verificar(d) {
    var e = [], somas = {};
    if (!FORN[d.fornecedor]) e.push("Escolha o fornecedor");
    if (!d.numero) e.push("Falta o número da fatura");
    if (!/^\d{4}-\d\d-\d\d$/.test(d.data || "")) e.push("Falta a data da fatura");
    if (!d.linhas.length) e.push("A fatura não tem linhas");
    d.linhas.forEach(function (l, i) {
      var r = "Linha " + (i + 1) + ": ";
      if (!(l.qtd > 0) || !(l.valor_c > 0)) e.push(r + "quantidade ou valor em falta");
      if (!l.codigo) e.push(r + "falta o código");
      else if (FORN[d.fornecedor] && FORN[d.fornecedor].ean && !eanValido(l.codigo)) e.push(r + "código de barras inválido");
      somas[l.iva] = (somas[l.iva] || 0) + (l.valor_c || 0);
    });
    var base = 0;
    Object.keys(d.bases).forEach(function (t) { base += d.bases[t]; if ((somas[t] || 0) !== d.bases[t]) e.push("Linhas a " + t + " %: somam " + ((somas[t] || 0) / 100).toFixed(2).replace(".", ",") + " €, a fatura diz " + (d.bases[t] / 100).toFixed(2).replace(".", ",") + " €"); });
    Object.keys(somas).forEach(function (t) { if (!(t in d.bases)) e.push("Há linhas a " + t + " % sem base de IVA na fatura"); });
    if (!d.total_c || d.total_c !== base + d.imposto_c) e.push("O total não é igual à base mais o IVA");
    return e;
  }
  return {ler: ler, verificar: verificar, eanValido: eanValido, FORN: FORN, NIF_LOJA: NIF_LOJA};
})();
if (typeof module !== "undefined") module.exports = FATURAS;
