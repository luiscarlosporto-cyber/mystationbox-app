/* mystationbox · relatório de vendas por artigo em Excel (software Repsol), 02/11/2026.
 * É a fonte única das vendas por artigo dentro da app: cada ficheiro carregado (em Vendas → Relatório de vendas,
 * ou pelo 📥 Carregar) fica guardado em msb_vendas_artigos por estação e período. A linha "Posto: E1344 - …" tem de
 * ser a loja aberta. A leitura é a mesma do módulo de stock (vendasDeLinhas): cabeçalho "Código", colunas
 * "dd/mm/aaaa - Quantidade" por dia, "Total quantidade", "Total Montante" e "Família". O período vem da linha "Data:".
 * Para servir a tudo (ex.: garrafas de gás para a ENSE), exporte com o Nó de todas as famílias, não só TABACO. */
"use strict";
var xlsxP = null;
function carregarXlsxMSB() {
  if (window.XLSX) return Promise.resolve();
  if (xlsxP) return xlsxP;
  xlsxP = new Promise(function (ok, ko) { var s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"; s.onload = ok; s.onerror = function () { xlsxP = null; ko(new Error("Não foi possível carregar o leitor de Excel (sem internet?)")); }; document.head.appendChild(s); });
  return xlsxP;
}
function isoDeDMY(t) { var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t || ""); return m ? m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0") : null; }
async function lerVendasExcel(f) {
  await carregarXlsxMSB();
  var wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), {type: "array"}), ws = wb.Sheets[wb.SheetNames[0]], L = XLSX.utils.sheet_to_json(ws, {header: 1, raw: true, defval: null});
  var pr = L.find(function (r) { return /^Posto/i.test(String(r[0] || "")); }), pt = pr ? String(pr[1] || "") + " " + String(pr[0] || "") : "";
  var mp = /\b(E\d{3,5})\b/i.exec(pt), posto = mp ? mp[1].toUpperCase() : "";
  var h = L.findIndex(function (r) { return String(r[0] || "").trim() === "Código"; });
  if (h < 0) throw new Error("Não é o relatório de vendas por artigo (falta a coluna «Código»).");
  var cab = L[h].map(function (x) { return String(x || "").trim(); }), datas = cab.map(function (x) { return (/^(\d{1,2}\/\d{1,2}\/\d{4}) - Quantidade$/.exec(x) || [])[1]; }).filter(Boolean);
  var iq = cab.indexOf("Total quantidade"), im = cab.indexOf("Total Montante"), ifam = cab.indexOf("Família"), linhas = [];
  L.slice(h + 1).forEach(function (r) { var c = String(r[0] == null ? "" : r[0]).trim(); if (!/^\d+$/.test(c)) return;
    linhas.push([c, String(r[1] || "").trim(), Number(r[iq >= 0 ? iq : r.length - 3]) || 0, Math.round((Number(r[im >= 0 ? im : r.length - 2]) || 0) * 100) / 100, ifam >= 0 ? String(r[ifam] || "").trim() : ""]); });
  if (!linhas.length) throw new Error("O ficheiro não tem artigos.");
  /* período: linha "Data: … Desde: dd/mm/aaaa … Até: dd/mm/aaaa"; senão as colunas por dia */
  var ld = L.find(function (r) { return /^Data/i.test(String(r[0] || "")); }), td = ld ? String(ld[1] || "") : "", de = null, ate = null;
  var md = /Desde:\s*(\d{1,2}\/\d{1,2}\/\d{4})/.exec(td), ma = /Até:\s*(\d{1,2}\/\d{1,2}\/\d{4})/.exec(td);
  if (md && ma) { de = isoDeDMY(md[1]); ate = isoDeDMY(ma[1]); }
  else { var isos = datas.map(isoDeDMY).filter(Boolean).sort(); if (isos.length) { de = isos[0]; ate = isos[isos.length - 1]; } }
  if (!de || !ate) throw new Error("Não consegui ler o período do relatório (linha «Data: Desde … Até …»).");
  var no = L.find(function (r) { return /^Nó/i.test(String(r[0] || "")); }), noTxt = no ? String(no[1] || "").trim() : "";
  var dias = Math.round((new Date(ate + "T12:00:00") - new Date(de + "T12:00:00")) / 864e5) + 1;
  return {posto: posto, nomePosto: pt.trim(), de: de, ate: ate, dias: dias, no: noTxt, linhas: linhas};
}
/* Lê, confere a loja e guarda. Devolve a leitura. */
async function guardarVendasExcel(f) {
  var r = await lerVendasExcel(f);
  if (!r.posto) throw new Error("O ficheiro não diz de que posto é (falta a linha «Posto»). Exporte de novo do software Repsol.");
  var est = ESTS.find(function (x) { return (x.posto_repsol || "").toUpperCase() === r.posto; });
  if (!est) throw new Error("O relatório é do posto " + r.posto + ", que não é nenhuma das suas lojas.");
  if (est.id !== EST) throw new Error("Este relatório é de " + (est.name || est.short_name) + " (posto " + r.posto + "), mas está a trabalhar em " + $("#hEst").textContent + ". Mude de loja no topo e carregue de novo.");
  var g = await sb.from("msb_vendas_artigos").upsert({estacao: EST, de: r.de, ate: r.ate, dias: r.dias, posto: r.posto, linhas: r.linhas, fonte: f.name + (r.no ? " · nó " + r.no : ""), criado: new Date().toISOString()}, {onConflict: "estacao,de,ate"});
  if (g.error) throw g.error;
  return r;
}
/* O relatório que cobre o mês inteiro (o mais curto que o cubra); senão null. */
async function vendasArtigosDoMes(M) {
  var fim = addDia(addMes(M, 1) + "-01", -1);
  var r = await sb.from("msb_vendas_artigos").select("de,ate,dias,linhas,fonte").eq("estacao", EST).lte("de", M + "-01").gte("ate", fim);
  if (r.error) throw r.error;
  return (r.data || []).sort(function (a, b) { return a.dias - b.dias; })[0] || null;
}

/* ---------------- Vendas → Relatório de vendas (Excel) ---------------- */
async function carregarVendasArtigos() {
  var box = $("#vaCorpo"); box.innerHTML = "<div class='mut'>A carregar…</div>";
  try {
    var r = await sb.from("msb_vendas_artigos").select("de,ate,dias,fonte,criado,linhas").eq("estacao", EST).order("ate", {ascending: false}).limit(24);
    if (r.error) throw r.error;
    var L = r.data || [];
    box.innerHTML = "<div class='card'><div class='cb'><p class='mut' style='margin:0 0 8px'>Relatório de vendas por artigo exportado do software Repsol, em Excel. Para o mês, exporte de dia 1 ao último dia e com <b>todas as famílias</b> (não só TABACO). Fica guardado e é usado na app (ENSE: garrafas de gás; e o que mais precisar).</p>" +
      (L.length ? "<div class='sc'><table><thead><tr><th class='l'>Período</th><th>Dias</th><th>Artigos</th><th>Montante</th><th class='l'>Ficheiro</th><th class='l'>Carregado</th></tr></thead><tbody>" +
        L.map(function (x) { var t = x.linhas.reduce(function (s, l) { return s + (l[3] || 0); }, 0); return "<tr><td class='l'>" + dmy(x.de) + " a " + dmy(x.ate) + "</td><td class='n'>" + x.dias + "</td><td class='n'>" + x.linhas.length + "</td><td class='n'>" + fmt(Math.round(t * 100)) + " €</td><td class='l'>" + esc(x.fonte) + "</td><td class='l'>" + dmy(x.criado) + "</td></tr>"; }).join("") + "</tbody></table></div>"
        : "<p class='mut' style='margin:0'>Ainda não há relatórios guardados nesta loja.</p>") + "</div></div>";
  } catch (e) { box.innerHTML = "<div class='card msgErr' style='padding:12px'>✖ " + esc(falhou(e)) + "</div>"; }
}
/* a mensagem fica num sítio próprio (#vaMsg), para a lista não a apagar quando se atualiza */
function msgVa(cls, t) { var e = $("#vaMsg"); e.hidden = !t; e.className = "card " + cls; e.style.padding = "12px"; e.textContent = t || ""; }
async function importarVendasExcel(f) {
  if (PAGINA !== "va") ir("va");
  msgVa("mut", "⏳ A ler " + f.name + "…");
  try { var r = await guardarVendasExcel(f);
    msgVa("msgOk", "✔ Relatório de " + dmy(r.de) + " a " + dmy(r.ate) + " (" + r.dias + " dias, " + r.linhas.length + " artigos" + (r.no ? ", nó " + r.no : "") + ") guardado." + (/^TABACO$/i.test(r.no) ? " Atenção: este ficheiro só tem tabaco; para as garrafas de gás da ENSE exporte com todas as famílias." : ""));
    await carregarVendasArtigos(); }
  catch (e) { msgVa("msgErr", "✖ " + f.name + ": " + falhou(e)); }
}
$("#bVa").onclick = function () { $("#fVa").click(); };
$("#fVa").onchange = function () { var f = this.files[0]; this.value = ""; if (f) importarVendasExcel(f); };

/* Máquina de tabaco (06/11/2026, pedido do utilizador): usa sozinha o último relatório guardado nesta loja, sem escolher ficheiro.
   O módulo de stock lê Excel: refaz-se um Excel com o mesmo formato (Posto, Data, Código, colunas por dia, totais, família). */
function excelDeVendas(v, est) {
  var dmy2 = function (iso) { var p = iso.split("-"); return +p[2] + "/" + +p[1] + "/" + p[0]; }, dias = [];
  for (var d = v.de; d <= v.ate; d = addDia(d, 1)) dias.push(dmy2(d));
  var cab = ["Código", "Artigo"].concat(dias.map(function (x) { return x + " - Quantidade"; }), ["Total quantidade", "Total Montante", "Família"]);
  var L = [["Posto", (v.posto || est.posto_repsol || "") + " - " + (est.name || est.short_name || "")], ["Data", "Desde: " + dmy2(v.de) + " Até: " + dmy2(v.ate)], [], cab];
  v.linhas.forEach(function (l) { L.push([l[0], l[1]].concat(dias.map(function () { return null; }), [l[2], l[3], l[4] || ""])); });
  var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(L), "Vendas");
  return new File([XLSX.write(wb, {type: "array", bookType: "xlsx"})], "vendas_" + v.de + "_" + v.ate + ".xlsx", {type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
}
var MAQ_AUTO = "";
async function maqAuto() {
  var est = EST;
  try {
    var r = await sb.from("msb_vendas_artigos").select("de,ate,dias,linhas,posto").eq("estacao", est).order("ate", {ascending: false}).order("dias", {ascending: false}).limit(1);
    if (r.error) throw r.error;
    var v = (r.data || [])[0], chave = v ? est + v.de + v.ate : est;
    if (!v || MAQ_AUTO === chave || PAGINA !== "maq" || est !== EST) return;
    await carregarXlsxMSB();
    var w = await esperarNex(function (w) { return w.document.getElementById("maqFile") && w.document.getElementById("maqFile").onchange; });
    if (PAGINA !== "maq" || est !== EST) return;
    MAQ_AUTO = chave;
    await w.document.getElementById("maqFile").onchange({target: {files: [excelDeVendas(v, ESTS.find(function (x) { return x.id === est; }) || {})], value: ""}});
    var st = w.document.getElementById("maqStatus"); if (st && !/^Erro/.test(st.textContent)) st.textContent += " Do relatório guardado na app (Vendas → Relatório de vendas).";
  } catch (e) { status(false, "⚠ Máquina de tabaco: " + falhou(e)); }
}
