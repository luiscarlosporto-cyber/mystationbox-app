/* mystationbox · rentabilidade (01/11/2026).
 * Gestão → Margens e custos: margem por categoria (combustível em €/litro, separado em simples e premium;
 * loja em % sobre a base sem IVA) e custos fixos mensais, por estação.
 * Relatórios → Lucro: vendas do mês (relatório "Turno por formas de cobrança") × margens − custos fixos.
 * Regra do utilizador: consignação = litros em consignação − litros com desconto imediato (do fecho mensal TMS);
 * cada um destes e o Solred têm a sua margem por litro. Tudo é ESTIMATIVA: mostra-se sempre de onde vem cada número. */
"use strict";
function falhouLucro(e) { var m = falhou(e); return /msb_(margens|custos|vendas_mes)|does not exist|schema cache|42P01|PGRST205/i.test(m + " " + (e && e.code || "")) ? "Esta parte ainda não está ativa na base de dados: falta autorizar a criação das tabelas de margens, custos e vendas do mês." : m; }
var COMB_CAT = [["consignacao", "Consignação (sem desconto)"], ["desconto", "Desconto imediato My Repsol"], ["solred", "Solred"]];
function premium(p) { return /E\+10|EFITEC/i.test(p); }
function tmsParaRelatorio(n) { n = n.toUpperCase().trim(); return n === "GASOLINA 95" ? "GASOLINA SIMPLES" : n; }
function chaveLoja(fam, sub) { return "loja:" + fam + (sub ? "/" + sub : ""); }
var LOJA_SUB = [["TABACO", "ACESSORIOS TABACARIA"]];   // subfamílias com margem própria (acessórios ≠ tabaco)

async function lerMargens() {
  var r = await sb.from("msb_margens").select("chave,valor,unidade").eq("estacao", EST); if (r.error) throw r.error;
  var m = {}; (r.data || []).forEach(function (x) { m[x.chave] = Number(x.valor); }); return m;
}
async function lerCustos() {
  var r = await sb.from("msb_custos").select("id,nome,valor_c").eq("estacao", EST).order("nome"); if (r.error) throw r.error; return r.data || [];
}
async function familiasConhecidas(M) {
  var r = await sb.from("msb_vendas_mes").select("dados").eq("estacao", EST).order("mes", {ascending: false}).limit(3);
  var f = {}; ((r.data || [])).forEach(function (v) { ((v.dados || {}).loja || []).forEach(function (l) { f[l[0]] = 1; }); });
  Object.keys(M).forEach(function (k) { if (k.indexOf("loja:") === 0) f[k.slice(5).split("/")[0]] = 1; });
  ["CAFETARIA", "GAS", "IMPRENSA", "LAVAGEM", "LOJA", "LUBRIFICANTES", "TABACO"].forEach(function (x) { f[x] = 1; });
  return Object.keys(f).sort();
}
function num4(v) { return v == null || isNaN(v) ? "" : String(v).replace(".", ","); }
function lerNum(s) { s = String(s || "").trim().replace(/\s/g, "").replace(",", "."); if (!s) return null; var n = Number(s); return isFinite(n) ? n : NaN; }

/* ---------------- Gestão → Margens e custos ---------------- */
async function carregarMargens() {
  var box = $("#mrgCorpo"); box.innerHTML = "<div class='mut'>A carregar…</div>";
  try {
    var M = await lerMargens(), C = await lerCustos(), F = await familiasConhecidas(M);
    var h = "<div class='card' style='padding:14px;display:grid;gap:10px'><h2 style='margin:0'>⛽ Combustível · margem por litro (€/L)</h2>" +
      "<p class='mut' style='margin:0;font-size:13px'>Valores iniciais = política comercial 2026 sem bónus (ex.: 45 €/m³ = 0,045 €/L). Ajuste aos valores reais do seu contrato, com bónus se quiser incluí-los.</p>" +
      "<div class='sc'><table><thead><tr><th class='l'>Categoria</th><th>Simples (gasóleo, gasolina)</th><th>Premium (Diesel e+10, Efitec)</th></tr></thead><tbody>" +
      COMB_CAT.map(function (c) { return "<tr><td class='l'>" + c[1] + "</td>" + ["simples", "premium"].map(function (t) { var k = "comb:" + c[0] + ":" + t; return "<td class='n'><input class='mg' data-k='" + k + "' data-u='eur_litro' inputmode='decimal' value='" + num4(M[k]) + "' style='width:90px;text-align:right'> €/L</td>"; }).join("") + "</tr>"; }).join("") +
      "</tbody></table></div></div>";
    var linhas = []; F.forEach(function (f) { linhas.push([f, ""]); LOJA_SUB.forEach(function (s) { if (s[0] === f) linhas.push([f, s[1]]); }); });
    h += "<div class='card' style='padding:14px;display:grid;gap:10px'><h2 style='margin:0'>🛍️ Loja · margem por categoria (% sobre a venda sem IVA)</h2>" +
      "<p class='mut' style='margin:0;font-size:13px'>Deixe vazio o que não sabe: no relatório de lucro aparece como \"margem por definir\" e não entra na conta. Tabaco: 6,8 % é a média das faturas da Adelaide.</p>" +
      "<div class='sc'><table><thead><tr><th class='l'>Categoria (família do relatório de vendas)</th><th>Margem</th></tr></thead><tbody>" +
      linhas.map(function (l) { var k = chaveLoja(l[0], l[1]); return "<tr><td class='l'>" + esc(l[0]) + (l[1] ? " · <span class='mut'>" + esc(l[1]) + "</span>" : "") + "</td><td class='n'><input class='mg' data-k='" + esc(k) + "' data-u='pct' inputmode='decimal' value='" + num4(M[k]) + "' style='width:80px;text-align:right'> %</td></tr>"; }).join("") +
      "</tbody></table></div></div>";
    h += "<div class='card' style='padding:14px;display:grid;gap:10px'><h2 style='margin:0'>🧾 Custos fixos por mês</h2>" +
      "<p class='mut' style='margin:0;font-size:13px'>Salários, renda, luz, água, comunicações, seguros, contabilidade… Valores aproximados chegam.</p>" +
      "<div id='custosLista' style='display:grid;gap:6px'>" + C.map(function (c) { return linhaCusto(c.nome, c.valor_c / 100); }).join("") + "</div>" +
      "<div class='bar'><button class='btn' id='custoMais'>+ Acrescentar custo</button></div></div>";
    h += "<div class='bar'><button class='btn p' id='mrgGravar'>Gravar margens e custos</button><span class='st' id='mrgSt'></span></div>";
    box.innerHTML = h;
    $("#custoMais").onclick = function () { $("#custosLista").insertAdjacentHTML("beforeend", linhaCusto("", null)); };
    $("#mrgGravar").onclick = gravarMargens;
  } catch (e) { box.innerHTML = "<div class='bad'>" + esc(falhouLucro(e)) + "</div>"; }
}
function linhaCusto(nome, v) { return "<div class='bar custo'><input class='cn' placeholder='Ex.: Salários' value='" + esc(nome || "") + "' style='flex:1;min-width:0'><input class='cv' inputmode='decimal' placeholder='0,00' value='" + (v == null ? "" : num4(v.toFixed(2))) + "' style='width:110px;text-align:right'> €<button class='mini' onclick='this.parentElement.remove()'>✕</button></div>"; }
async function gravarMargens() {
  var st = $("#mrgSt"), b = $("#mrgGravar"); st.className = "st"; st.textContent = "";
  try {
    var up = [], del = [], erro = "";
    $$("#mrgCorpo input.mg").forEach(function (i) { var v = lerNum(i.value); if (v === null) del.push(i.dataset.k); else if (isNaN(v) || v < 0 || (i.dataset.u === "pct" && v >= 100)) erro = "Valor inválido: " + i.value; else up.push({estacao: EST, chave: i.dataset.k, valor: v, unidade: i.dataset.u, atualizado: new Date().toISOString()}); });
    var custos = []; $$("#custosLista .custo").forEach(function (d) { var n = d.querySelector(".cn").value.trim(), v = lerNum(d.querySelector(".cv").value); if (!n && v === null) return; if (!n || v === null || isNaN(v) || v < 0) erro = "Custo incompleto: " + (n || "sem nome"); else custos.push({estacao: EST, nome: n.slice(0, 80), valor_c: Math.round(v * 100)}); });
    if (erro) throw new Error(erro);
    b.disabled = true;
    if (up.length) { var r1 = await sb.from("msb_margens").upsert(up, {onConflict: "estacao,chave"}); if (r1.error) throw r1.error; }
    if (del.length) { var r2 = await sb.from("msb_margens").delete().eq("estacao", EST).in("chave", del); if (r2.error) throw r2.error; }
    var r3 = await sb.from("msb_custos").delete().eq("estacao", EST); if (r3.error) throw r3.error;
    if (custos.length) { var r4 = await sb.from("msb_custos").insert(custos); if (r4.error) throw r4.error; }
    st.className = "st ok"; st.textContent = "✔ Gravado. Fica no histórico.";
  } catch (e) { st.className = "st bad"; st.textContent = "⚠ " + falhou(e); } finally { b.disabled = false; }
}

/* ---------------- Relatórios → Lucro ---------------- */
function descontoTMS(t) {
  var out = {}; if (!t) return null;
  function soma(titulo, sinal) {
    (t.seccoes || []).forEach(function (s) { if (s.titulo.toUpperCase().indexOf(titulo) !== 0) return;
      s.grupos.forEach(function (g) { if (g.nome.toUpperCase() !== "TOTAIS DESCONTO") return;
        g.linhas.forEach(function (l) { var p = tmsParaRelatorio(l.nome); out[p] = (out[p] || 0) + sinal * (l.l || 0); }); }); });
  }
  soma("TOTAIS DE DESCONTO UNITARIO", 1); soma("TOTAIS REEMBOLSO DE DESCONTO UNITARIO", -1);
  return out;   // centilitros por produto
}
function diasEntre(a, b) { return Math.round((new Date(b) - new Date(a)) / 864e5) + 1; }
function eurL(v) { return v == null ? "—" : v.toLocaleString("pt-PT", {minimumFractionDigits: 3, maximumFractionDigits: 4}); }
function litros2(cl) { return (cl / 100).toLocaleString("pt-PT", {minimumFractionDigits: 2, maximumFractionDigits: 2}); }

async function carregarLucro() {
  var box = $("#lucCorpo"); box.innerHTML = "<div class='mut'>A carregar…</div>";
  try {
    if (!$("#lMes").value) {   // abre no último mês com relatório de vendas
      var ul = await sb.from("msb_vendas_mes").select("mes").eq("estacao", EST).order("mes", {ascending: false}).limit(1);
      $("#lMes").value = (ul.data && ul.data[0] && ul.data[0].mes) || MES;
    }
    var m = $("#lMes").value;
    var rv = await sb.from("msb_vendas_mes").select("de,ate,dados,fonte").eq("estacao", EST).eq("mes", m).maybeSingle(); if (rv.error) throw rv.error;
    if (!rv.data) { box.innerHTML = "<div class='vazio'>Sem relatório de vendas deste mês. Carregue o relatório \"Turno por formas de cobrança\" do mês (ou até hoje, para a projeção): no CBOS, imprimir → <b>Guardar como PDF</b>.</div>"; return; }
    var V = rv.data, D = V.dados, M = await lerMargens(), C = await lerCustos();
    var rt = await sb.from("msb_tms").select("dados").eq("estacao", EST).eq("mes", m).order("ate", {ascending: false}).limit(1);
    var DESC = descontoTMS(rt.data && rt.data[0] && rt.data[0].dados);
    var h = "", totM = 0, falta = [];
    /* combustível */
    var prods = Object.keys(Object.assign({}, D.comb.consigna || {}, D.comb.solred || {})).sort(), linhas = "", tl = {cons: 0, desc: 0, sol: 0}, mC = 0;
    prods.forEach(function (p) {
      var t = premium(p) ? "premium" : "simples", cons = ((D.comb.consigna || {})[p] || [0])[0], sol = ((D.comb.solred || {})[p] || [0])[0];
      var desc = DESC ? Math.min(cons, Math.max(0, Math.round(DESC[p] || 0))) : 0, pura = cons - desc;
      var mc = M["comb:consignacao:" + t], md = M["comb:desconto:" + t], ms = M["comb:solred:" + t];
      [["consignação", mc], ["desconto imediato", md], ["Solred", ms]].forEach(function (x) { if (x[1] == null && falta.indexOf("combustível: " + x[0] + " " + t) < 0) falta.push("combustível: " + x[0] + " " + t); });
      var mg = (pura / 100) * (mc || 0) + (desc / 100) * (md || 0) + (sol / 100) * (ms || 0);
      mC += mg; tl.cons += pura; tl.desc += desc; tl.sol += sol;
      linhas += "<tr><td class='l'>" + esc(p) + " <span class='mut' style='font-size:12px'>" + t + "</span></td><td class='n'>" + litros2(cons) + "</td><td class='n'>" + litros2(desc) + "</td><td class='n'><b>" + litros2(pura) + "</b></td><td class='n'>" + litros2(sol) + "</td><td class='n'><b>" + fmt(Math.round(mg * 100)) + "</b></td></tr>";
    });
    totM += mC;
    h += "<div class='card' style='padding:14px;display:grid;gap:8px'><h2 style='margin:0'>⛽ Combustível</h2>" +
      (DESC ? "<p class='mut' style='margin:0;font-size:13px'>Consignação = litros em consignação − litros com desconto imediato (fecho mensal TMS, já sem os reembolsos).</p>"
            : "<div class='aviso'><p>⚠ Sem fecho mensal TMS deste mês: não sei os litros com desconto imediato, por isso todo o consignado conta como consignação. Carregue o TMS para o valor certo.</p></div>") +
      "<div class='sc'><table><thead><tr><th class='l'>Produto</th><th>Consignado (L)</th><th>− Desconto imediato (L)</th><th>= Consignação (L)</th><th>Solred (L)</th><th>Margem €</th></tr></thead><tbody>" + linhas +
      "</tbody><tfoot><tr><td class='l'>Total</td><td class='n'>" + litros2(tl.cons + tl.desc) + "</td><td class='n'>" + litros2(tl.desc) + "</td><td class='n'>" + litros2(tl.cons) + "</td><td class='n'>" + litros2(tl.sol) + "</td><td class='n'><b>" + fmt(Math.round(mC * 100)) + "</b></td></tr></tfoot></table></div></div>";
    /* loja */
    var fams = {}; (D.loja || []).forEach(function (l) {
      var kSub = chaveLoja(l[0], l[1]), usaSub = M[kSub] != null, cat = usaSub ? l[0] + " · " + l[1] : l[0], k = usaSub ? kSub : chaveLoja(l[0]);
      var f = fams[cat] || (fams[cat] = {base: 0, liq: 0, k: k}); f.base += l[3]; f.liq += l[4];
    });
    var mL = 0, lj = Object.keys(fams).sort(function (a, b) { return fams[b].base - fams[a].base; }).map(function (c) {
      var f = fams[c], pct = M[f.k], mg = pct == null ? null : f.base * pct / 100; if (mg != null) mL += mg; else falta.push("loja: " + c);
      return "<tr><td class='l'>" + esc(c) + "</td><td class='n'>" + fmt(f.base) + "</td><td class='n'>" + (pct == null ? "<a href='#' data-ir='mrg' class='mut'>por definir</a>" : num4(pct) + " %") + "</td><td class='n'><b>" + (mg == null ? "—" : fmt(Math.round(mg))) + "</b></td></tr>";
    }).join("");
    totM += mL / 100;
    h += "<div class='card' style='padding:14px;display:grid;gap:8px'><h2 style='margin:0'>🛍️ Loja</h2><div class='sc'><table><thead><tr><th class='l'>Categoria</th><th>Vendas sem IVA €</th><th>Margem</th><th>Margem €</th></tr></thead><tbody>" + lj +
      "</tbody><tfoot><tr><td class='l'>Total</td><td class='n'>" + fmt(Object.keys(fams).reduce(function (s, c) { return s + fams[c].base; }, 0)) + "</td><td></td><td class='n'><b>" + fmt(Math.round(mL)) + "</b></td></tr></tfoot></table></div></div>";
    /* resultado e projeção */
    var custos = C.reduce(function (s, c) { return s + c.valor_c; }, 0) / 100;
    var diasMes = new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate(), dias = V.de && V.ate ? diasEntre(V.de, V.ate) : diasMes, fator = dias < diasMes ? diasMes / dias : 1;
    var c2 = function (v) { return fmt(Math.round(v * 100)); };
    var res = totM - custos * Math.min(1, dias / diasMes), proj = totM * fator - custos;
    h = "<section class='totem'><div class='t'>Lucro estimado · " + esc(new Date(m + "-15").toLocaleDateString("pt-PT", {month: "long", year: "numeric"})) + " · " + dmy(V.de) + " a " + dmy(V.ate) + "</div>" +
      "<div><div class='k'>Margem combustível</div><div class='v'>" + c2(mC) + "<small>€</small></div></div>" +
      "<div><div class='k'>Margem loja</div><div class='v'>" + c2(mL / 100) + "<small>€</small></div></div>" +
      "<div><div class='k'>Custos fixos</div><div class='v'>" + c2(custos) + "<small>€/mês</small></div></div>" +
      "<div><div class='k'>" + (fator > 1 ? "Resultado até " + dmy(V.ate).slice(0, 5) : "Resultado do mês") + "</div><div class='v' style='color:" + (res >= 0 ? "#7CE3A0" : "#FF9B85") + "'>" + c2(res) + "<small>€</small></div></div>" +
      (fator > 1 ? "<div><div class='k'>Projeção do mês (" + diasMes + " dias)</div><div class='v' style='color:" + (proj >= 0 ? "#7CE3A0" : "#FF9B85") + "'>" + c2(proj) + "<small>€</small></div></div>" : "") +
      "</section>" + (falta.length ? "<div class='aviso'><p>⚠ Margens por definir (não entram na conta): " + esc(falta.join(", ")) + ". <a href='#' data-ir='mrg'>Definir em Gestão → Margens e custos</a>.</p></div>" : "") +
      (!C.length ? "<div class='aviso'><p>ℹ️ Sem custos fixos: o valor acima é só a margem bruta. <a href='#' data-ir='mrg'>Acrescentar custos</a>.</p></div>" : "") + h +
      "<p class='mut' style='font-size:12px;margin:0'>Estimativa: margens por categoria definidas em Gestão; sem IVA. Fonte das vendas: " + esc(V.fonte || "relatório de vendas") + (fator > 1 ? ". Projeção = margem até agora × " + diasMes + "/" + dias + " dias − custos fixos do mês." : ".") + "</p>";
    box.innerHTML = h;
    $$("#lucCorpo [data-ir]").forEach(function (a) { a.onclick = function (ev) { ev.preventDefault(); ir(a.dataset.ir); }; });
  } catch (e) { box.innerHTML = "<div class='bad'>" + esc(falhouLucro(e)) + "</div>"; }
}
$("#lMes").onchange = carregarLucro;
$("#lAnt").onclick = function () { $("#lMes").value = addMes($("#lMes").value || MES, -1); carregarLucro(); };
$("#lSeg").onclick = function () { $("#lMes").value = addMes($("#lMes").value || MES, 1); carregarLucro(); };

/* ---------------- carregar o relatório de vendas do mês (PDF "Guardar como PDF" do CBOS) ----------------
 * O texto sai pelo pdf.js (cdnjs; as fontes deste PDF não as lê o leitor simples do motor). As linhas montam-se
 * pela posição: itens à mesma altura, separados por 2 espaços quando há um intervalo entre colunas. */
var pdfjsCBOS = null;
function carregarPdfJsCBOS() {
  if (window.pdfjsLib) return Promise.resolve();
  if (pdfjsCBOS) return pdfjsCBOS;
  pdfjsCBOS = new Promise(function (ok, ko) { var s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = function () { pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; ok(); };
    s.onerror = function () { pdfjsCBOS = null; ko(new Error("sem internet para ler o PDF")); }; document.head.appendChild(s); });
  return pdfjsCBOS;
}
async function linhasPdf(bytes) {
  await carregarPdfJsCBOS();
  var doc = await pdfjsLib.getDocument({data: bytes}).promise, out = [];
  for (var n = 1; n <= doc.numPages; n++) {
    var tc = await (await doc.getPage(n)).getTextContent(), itens = tc.items.filter(function (i) { return i.str && i.str.trim(); })
      .map(function (i) { return {x: i.transform[4], y: i.transform[5], w: i.width, t: i.str}; });
    itens.sort(function (a, b) { return b.y - a.y || a.x - b.x; });
    var linhas = [];
    itens.forEach(function (i) { var l = linhas[linhas.length - 1]; if (l && Math.abs(l.y - i.y) <= 2) l.it.push(i); else linhas.push({y: i.y, it: [i]}); });
    linhas.forEach(function (l) { l.it.sort(function (a, b) { return a.x - b.x; }); var s = "", fim = null;
      l.it.forEach(function (i) { var gap = fim == null ? 0 : i.x - fim; s += fim == null ? i.t : (gap > 4 ? "  " : gap > 0.8 ? " " : "") + i.t; fim = i.x + i.w; });
      out.push(s); });
  }
  return out;
}
async function importarVendasCBOS(f) {
  ir("luc"); var box = $("#lucCorpo"); box.innerHTML = "<div class='mut'>A ler " + esc(f.name) + "…</div>";
  try {
    var bytes = new Uint8Array(await f.arrayBuffer()), L = await linhasPdf(bytes.slice()), r;
    try { r = MOTOR.lerVendasCBOS(L); } catch (e) { throw new Error(e.message); }
    var est = ESTS.find(function (x) { return x.posto_repsol && x.posto_repsol.toUpperCase() === r.posto; }) ||
              ESTS.find(function (x) { return !x.posto_repsol && semAcentosCBOS(r.nome_posto).indexOf(semAcentosCBOS(x.short_name || x.name)) >= 0; });
    if (!est) throw new Error("O relatório é do posto " + r.posto + " - " + r.nome_posto + ", que não é nenhuma das suas lojas.");
    if (est.id !== EST) throw new Error("Este relatório é de " + (est.name || est.short_name) + " (posto " + r.posto + "), mas está a trabalhar em " + $("#hEst").textContent + ". Mude de loja no topo e carregue de novo.");
    var erros = r.verificacoes.filter(function (v) { return v.nivel === "erro"; });
    if (erros.length) { box.innerHTML = "<div class='card' style='padding:12px;border:2px solid var(--bad)'><b>❌ O relatório tem contas que não batem certo. Não foi gravado.</b>" + erros.map(linhaVerif).join("") + "</div>"; return; }
    var h = await sha(bytes), caminho = EST + "/vendas/cbos_" + r.mes + "_" + h + ".pdf";
    await guardarOriginal(caminho, new Blob([bytes], {type: "application/pdf"}), "application/pdf");
    var g = await sb.from("msb_vendas_mes").upsert({estacao: EST, mes: r.mes, de: r.de, ate: r.ate, dados: r, fonte: f.name + " · " + caminho}, {onConflict: "estacao,mes"});
    if (g.error) throw g.error;
    $("#lMes").value = r.mes; await carregarLucro();
    box.insertAdjacentHTML("afterbegin", "<div class='card msgOk' style='padding:12px'>✔ Turno por formas de cobrança mensal de " + dmy(r.de) + " a " + dmy(r.ate) + " carregado. " + r.verificacoes.map(function (v) { return esc(v.msg); }).join(" ") + "</div>");
  } catch (e) { box.innerHTML = "<div class='card' style='padding:12px;border:2px solid var(--bad);color:var(--bad)'>✖ " + esc(falhouLucro(e)) + "</div>"; }
}
function semAcentosCBOS(t) { return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\bSTO\.?\s/g, "SANTO ").replace(/^REPSOL\s+/, ""); }
$("#bCbos").onclick = function () { $("#fCbos").click(); };
$("#fCbos").onchange = function () { var f = this.files[0]; this.value = ""; if (f) importarVendasCBOS(f); };
