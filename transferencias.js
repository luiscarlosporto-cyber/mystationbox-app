/* mystationbox · créditos MB e Solred pagos por transferência bancária (02/11/2026).
 * Em algumas estações (Penafiel) a Repsol paga parte dos créditos MB e Solred por transferência, fora da liquidação.
 * O ficheiro Excel ("NC transferência") tem as colunas N.º doc. · Tip · Data doc. · Venc. líquido · … · Mont. em MI.
 * N.º doc. começado por 484 = crédito MB; começado por 422 ou 822 = crédito Solred. Outro começo → o ficheiro é recusado.
 * Os montantes podem vir com sinal "−" (crédito): guarda-se o valor absoluto.
 * Os créditos MB entram na conferência "MB registado × creditado" como os da liquidação; procuram um turno com o
 * mesmo valor no próprio dia ou até 10 dias antes. Os Solred comparam-se com o Solred € dos turnos da mesma forma. */
"use strict";
function tipoTransf(n) { return /^484/.test(n) ? "MB" : /^[48]22/.test(n) ? "SOLRED" : null; }
function isoXls(v) {
  if (v instanceof Date) return v.getFullYear() + "-" + String(v.getMonth() + 1).padStart(2, "0") + "-" + String(v.getDate()).padStart(2, "0");
  if (typeof v === "number") { var d = new Date(Math.round((v - 25569) * 864e5)); return d.toISOString().slice(0, 10); }
  var m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/.exec(String(v || "").trim()); return m ? m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0") : null;
}
function valXls(v) {
  if (typeof v === "number") return v;
  var t = String(v == null ? "" : v).trim(), neg = /-$/.test(t) || /^-/.test(t);
  t = t.replace(/[-\s€]/g, ""); if (!t) return NaN;
  if (t.indexOf(",") >= 0) t = t.replace(/\./g, "").replace(",", ".");
  var n = Number(t); return neg ? -n : n;
}
/* Só lê o cabeçalho para saber se é este ficheiro (usado pelo 📥 Carregar). */
async function ehTransferencias(f) {
  try { await carregarXlsxMSB(); var wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), {type: "array", sheetRows: 15}), L = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header: 1, defval: null});
    return L.some(function (r) { var s = r.map(function (x) { return String(x || "").trim(); }); return s.some(function (x) { return /^N\.?º\s*doc/i.test(x); }) && s.some(function (x) { return /^Mont/i.test(x); }); }); }
  catch (e) { return false; }
}
async function lerTransferencias(f) {
  await carregarXlsxMSB();
  var wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), {type: "array", cellDates: true}), L = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header: 1, raw: true, defval: null});
  var h = L.findIndex(function (r) { return r.some(function (x) { return /^N\.?º\s*doc/i.test(String(x || "").trim()); }); });
  if (h < 0) throw new Error("Não é o ficheiro de créditos por transferência (falta a coluna «N.º doc.»).");
  var cab = L[h].map(function (x) { return String(x || "").trim(); }), col = function (re) { return cab.findIndex(function (x) { return re.test(x); }); };
  var iN = col(/^N\.?º\s*doc/i), iT = col(/^Tip/i), iD = col(/^Data doc/i), iV = col(/^Venc/i), iM = col(/^Mont/i);
  if (iD < 0 || iM < 0) throw new Error("Faltam as colunas «Data doc.» ou «Mont. em MI».");
  var linhas = [], erros = [], total = null;
  L.slice(h + 1).forEach(function (r, k) {
    var n = String(r[iN] == null ? "" : r[iN]).replace(/\D/g, "");
    if (!n) { if (r.some(function (x) { return /^TOTAL$/i.test(String(x || "").trim()); })) { var t = valXls(r[iM]); if (!isNaN(t)) total = Math.round(Math.abs(t) * 100); } return; }
    var tipo = tipoTransf(n), dia = isoXls(r[iD]), v = valXls(r[iM]);
    if (!tipo) return erros.push("linha " + (h + k + 2) + ": documento " + n + " não começa por 484 (MB) nem 422/822 (Solred)");
    if (!dia) return erros.push("linha " + (h + k + 2) + ": sem data do documento");
    if (isNaN(v) || !v) return erros.push("linha " + (h + k + 2) + ": montante inválido");
    linhas.push({chave: n, tipo: tipo, tipdoc: iT >= 0 ? String(r[iT] || "").trim() : null, dia: dia, venc: iV >= 0 ? isoXls(r[iV]) : null, valor_c: Math.round(Math.abs(v) * 100)});
  });
  if (erros.length) throw new Error("Ficheiro recusado, nada foi gravado. " + erros.join("; ") + ".");
  if (!linhas.length) throw new Error("O ficheiro não tem documentos.");
  var soma = linhas.reduce(function (s, l) { return s + l.valor_c; }, 0);
  if (total != null && total !== soma) throw new Error("A soma das linhas (" + fmt(soma) + " €) não bate com o TOTAL do ficheiro (" + fmt(total) + " €). Nada foi gravado.");
  return linhas;
}
async function importarTransferencias(f) {
  if (PAGINA !== "rep") ir("rep");
  var box = $("#repProg"); box.hidden = false; box.innerHTML = "⏳ A ler " + esc(f.name) + "…";
  try {
    var L = await lerTransferencias(f);
    var ex = await sb.from("msb_transferencias").select("chave").eq("estacao", EST).in("chave", L.map(function (l) { return l.chave; }));
    if (ex.error) throw ex.error;
    var ja = {}; (ex.data || []).forEach(function (x) { ja[x.chave] = 1; });
    var novas = L.filter(function (l) { return !ja[l.chave]; }), sm = function (t) { return L.filter(function (l) { return l.tipo === t; }).reduce(function (s, l) { return s + l.valor_c; }, 0); };
    box.innerHTML = "<b>🏦 Créditos por transferência · " + esc(f.name) + "</b><div class='mut' style='font-size:13px'>" + L.length + " documentos · MB " + fmt(sm("MB")) + " € · Solred " + fmt(sm("SOLRED")) + " €" + (L.length - novas.length ? " · " + (L.length - novas.length) + " já registado(s), não se repetem" : "") + "</div>" +
      "<div class='sc'><table><thead><tr><th class='l'>Documento</th><th class='l'>Tipo</th><th>Data</th><th>Valor</th><th class='l'></th></tr></thead><tbody>" +
      L.map(function (l) { return "<tr><td class='l'>" + esc(l.chave) + " <small class='mut'>" + esc(l.tipdoc || "") + "</small></td><td class='l'>" + (l.tipo === "MB" ? "💳 MB" : "⛽ Solred") + "</td><td>" + dmy(l.dia) + "</td><td class='n'>" + fmt(l.valor_c) + "</td><td class='l'>" + (ja[l.chave] ? "<span class='mut'>já registado</span>" : "novo") + "</td></tr>"; }).join("") + "</tbody></table></div>" +
      "<div class='bar'>" + (novas.length ? "<button class='btn p' id='trGravar'>✔ Gravar " + novas.length + " crédito(s)</button>" : "<span class='mut'>Nada de novo para gravar.</span>") + "<button class='btn' id='trFechar'>Fechar</button></div>";
    $("#trFechar").onclick = function () { box.hidden = true; };
    if (novas.length) $("#trGravar").onclick = async function () { this.disabled = true;
      try { var r = await sb.from("msb_transferencias").insert(novas.map(function (l) { return Object.assign({estacao: EST, fonte: f.name}, l); })); if (r.error) throw r.error;
        box.innerHTML = "<span class='ok'>✔ " + novas.length + " crédito(s) por transferência gravados.</span>";
        $("#rMes").value = novas.map(function (l) { return l.dia; }).sort().pop().slice(0, 7); carregarRepsol(); }
      catch (e) { this.disabled = false; box.insertAdjacentHTML("beforeend", "<div class='bad'>✖ " + esc(falhou(e)) + "</div>"); } };
  } catch (e) { box.innerHTML = "<div class='bad'>✖ " + esc(f.name) + ": " + esc(falhou(e)) + "</div>"; }
}
/* Liga créditos (MB ou Solred) por transferência a turnos: mesmo valor no próprio dia, depois na véspera… até 10 dias antes, e no dia seguinte. */
var TRANSF_DIAS = [0, -1, 1, -2, -3, -4, -5, -6, -7, -8, -9, -10];
function ligarTransf(trs, turnos, campo, usados) {
  var porDia = {}; turnos.forEach(function (t) { if (t[campo]) (porDia[t.dia] = porDia[t.dia] || []).push(t); });
  var res = {};
  TRANSF_DIAS.forEach(function (off) { trs.forEach(function (c) { if (res[c.chave]) return;
    var t = (porDia[addDia(c.data, off)] || []).find(function (x) { return !usados[x.dia + x.turno] && x[campo] === c.valor_c; });
    if (t) { usados[t.dia + t.turno] = 1; res[c.chave] = {c: c, t: t, est: "ok"}; } }); });
  return trs.map(function (c) { return res[c.chave] || {c: c, t: null, est: "na"}; });
}
/* Secção do mês na página Repsol e MB. */
function seccaoTransf(M, nm, ligMB, ligSol) {
  var l = ligMB.concat(ligSol).filter(function (x) { return x.c.data.slice(0, 7) === M; }).sort(function (a, b) { return a.c.data < b.c.data ? -1 : a.c.data > b.c.data ? 1 : 0; });
  if (!l.length) return "";
  var tot = function (t) { return l.filter(function (x) { return x.c.ttipo === t; }).reduce(function (s, x) { return s + x.c.valor_c; }, 0); };
  return "<div class='liq'><h3>🏦 Créditos por transferência · " + esc(nm) + "<span class='mut' style='font-weight:400;font-size:13px'>MB " + fmt(tot("MB")) + " € · Solred " + fmt(tot("SOLRED")) + " €</span></h3>" +
    "<div class='sc'><table id='trConf'><thead><tr><th>Data</th><th class='l'>Documento</th><th class='l'>Tipo</th><th>Creditado</th><th class='l'>Turno</th><th>Registado no turno</th><th class='l'>Estado</th></tr></thead><tbody>" +
    l.map(function (x) { var mb = x.c.ttipo === "MB", reg = x.t ? (mb ? x.t.mb_c : x.t.solred_c) : null;
      return "<tr class='" + (x.est === "ok" ? "lin-ok" : "lin-wn") + "'" + (x.t ? " data-ir='" + x.t.dia + "'" : "") + "><td>" + dmy(x.c.data) + "</td><td class='l'>" + esc(x.c.numdoc) + "</td><td class='l'>" + (mb ? "💳 MB" : "⛽ Solred") + "</td><td class='n'>" + fmt(x.c.valor_c) + "</td><td class='l'>" + (x.t ? dmy(x.t.dia).slice(0, 5) + " " + (x.t.turno === "t1" ? "☀️ T1" : "🌙 T2") + " " + esc(x.t.func || "") : "—") + "</td><td class='n'>" + (reg == null ? "—" : fmt(reg)) + "</td><td class='l'><b>" + (x.est === "ok" ? "✔ ligado ao turno" : "? sem turno com o mesmo valor") + "</b></td></tr>"; }).join("") +
    "</tbody></table></div>" + (ADMIN ? "<p class='mut' style='margin:6px 0 0;font-size:13px'>Procura-se um turno com o mesmo valor no próprio dia ou até 10 dias antes. Sem ligação: confirme o valor registado na caixa.</p>" : "") + "</div>";
}
$("#bTransf").onclick = function () { $("#fTransf").click(); };
$("#fTransf").onchange = function () { var f = this.files[0]; this.value = ""; if (f) importarTransferencias(f); };
