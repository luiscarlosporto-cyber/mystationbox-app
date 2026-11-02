/* mystationbox · combustíveis: entradas (guias de remessa) e relatório mensal para a ENSE (02/11/2026).
 * Entradas: Compras → Entrada de combustível (msb_comb_entradas). Combustível em litros; GPL auto entra em kg e
 * converte-se para litros (msb_config.ense.gpl_kg_litros, 1 kg = 1,8 L); o GPL mostra sempre kg e litros; garrafas de gás em unidades.
 * ENSE: Relatórios → ENSE mensal. Produtos recebidos = soma das entradas do mês; total de vendas e vendas a cartão
 * frotista = relatório de vendas do mês do software Repsol (msb_vendas_mes, consigna + Solred; Solred = frotista).
 * O que não vem de documentos (garrafas) ou precise de correção escreve-se na tabela e fica em msb_ense ("manual").
 * O PDF segue a ordem e as unidades do formulário da ENSE. */
"use strict";
var ENSE_PROD = {
  butano13: {n: "Garrafas GPL - Butano 13Kg", u: "un", art: /BUTANO\D*13(?![\d,.])/}, propano11: {n: "Garrafas GPL - Propano 11Kg", u: "un", art: /PROPANO\D*11(?![\d,.])/},
  gas95: {n: "Gasolina simples 95", u: "L", cbos: /^GASOLINA (SIMPLES|95)/}, gas95ad: {n: "Gasolina I.O. 95 submetido a processo de aditivação suplementar", u: "L", cbos: /EFITEC 95|95 PREM/},
  gas98ad: {n: "Gasolina I.O. 98 submetido a processo de aditivação suplementar", u: "L", cbos: /EFITEC 98|98/}, gasoleo: {n: "Gasóleo simples", u: "L", cbos: /^GASOLEO$|^GASÓLEO$|^GASOLEO SIMPLES/},
  gasoleoad: {n: "Gasóleo rodoviário submetido a processo de aditivação suplementar", u: "L", cbos: /E\+10|DIESEL/},
  butano6: {n: "Garrafas GPL - Butano 6 kg", u: "un", art: /BUTANO\D*6(?![\d,.])/}, butano12: {n: "Garrafas GPL - Butano 12 kg", u: "un", art: /BUTANO\D*12(?![\d,.])/}, butano12_5: {n: "Garrafas GPL - Butano 12,5 kg", u: "un", art: /BUTANO\D*12[,.]5(?!\d)/},
  gplauto: {n: "GPL Auto", u: "L", kg: 1, cbos: /GPL|GLP|AUTOGAS/},
  nexa: {n: "Nexa (combustível 100% renovável)", u: "L", cbos: /NEXA/}
};
var ENSE_CFG = {};
async function cfgENSE() {
  if (ENSE_CFG[EST]) return ENSE_CFG[EST];
  var r = await sb.from("msb_config").select("ense").eq("estacao", EST).maybeSingle();
  var c = (r.data && r.data.ense) || {produtos: ["butano13", "propano11", "gas95", "gas95ad", "gas98ad", "gasoleo", "gasoleoad", "butano6", "butano12", "butano12_5"], gpl_kg_litros: 1.8};
  return (ENSE_CFG[EST] = c);
}
function q100(v) { return v == null ? "" : (v / 100).toLocaleString("pt-PT", {minimumFractionDigits: v % 100 ? 2 : 0, maximumFractionDigits: 2}); }
function unid(p) { return ENSE_PROD[p].u === "L" ? "litros" : "unidades"; }
function mesHoje() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }
function falhouComb(e) { var m = falhou(e); return /msb_comb|msb_ense|does not exist|schema cache/.test(m) ? "As tabelas dos combustíveis ainda não estão ativas no servidor." : m; }

/* ---------------- Entrada de combustível ---------------- */
var ED = null;   // guia a ser editada (null = guia nova)
async function carregarEntradasComb() {
  ED = null; var box = $("#combCorpo"), M = $("#cMes").value || mesHoje(); $("#cMes").value = M;
  box.innerHTML = "<div class='mut'>A carregar…</div>";
  try {
    var c = await cfgENSE(), fim = addMes(M, 1) + "-01";
    var r = await sb.from("msb_comb_entradas").select("*").eq("estacao", EST).gte("dia", M + "-01").lt("dia", fim).order("dia", {ascending: false}).order("id", {ascending: false});
    if (r.error) throw r.error;
    var L = r.data || [], tot = {};
    var totKg = {}; L.forEach(function (x) { tot[x.produto] = (tot[x.produto] || 0) + x.qtd; if (x.kg != null) totKg[x.produto] = (totKg[x.produto] || 0) + x.kg; });
    /* uma guia de remessa = uma entrada com todos os produtos descarregados (cada produto fica numa linha da tabela, com a mesma guia) */
    var liq = c.produtos.filter(function (p) { return ENSE_PROD[p].u === "L"; });
    var h = ADMIN ? "<div class='card'><div class='cb' style='display:grid;gap:10px'><h3 style='margin:0' id='ceTit'>⛽ Registar guia de remessa</h3>" +
      "<div style='display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px'>" +
      "<label>Data<input type='date' id='ceDia' value='" + (M === mesHoje() ? hojeISO(0) : M + "-01") + "'></label>" +
      "<label>Nº da guia de remessa<input id='ceGuia' maxlength='40' placeholder='ex.: GR 123456'></label>" +
      "<label>Nota<input id='ceNota' maxlength='200' placeholder='opcional'></label></div>" +
      "<div class='sc'><table><thead><tr><th class='l'>Produto</th><th>Quantidade recebida</th><th class='l'>Unidade</th></tr></thead><tbody>" +
      liq.map(function (p) { return "<tr><td class='l'>" + esc(ENSE_PROD[p].n) + "</td><td class='n'><input class='enseIn ceQ' data-p='" + p + "' inputmode='decimal' placeholder='0'>" + (ENSE_PROD[p].kg ? "<br><small class='mut ceConv' data-p='" + p + "'></small>" : "") + "</td><td class='l'>" + (ENSE_PROD[p].kg ? "kg" : "litros") + "</td></tr>"; }).join("") +
      "</tbody></table></div><div class='mut' style='font-size:13px'>Preencha só os produtos desta guia; os outros ficam em branco." + (liq.some(function (p) { return ENSE_PROD[p].kg; }) ? " GPL: escreva os kg; 1 kg = " + String(c.gpl_kg_litros).replace(".", ",") + " L." : "") + "</div>" +
      "<div class='bar'><button class='btn p' id='ceGravar'>✔ Registar guia</button><button class='btn' id='ceCancelar' hidden>Cancelar edição</button><span id='ceMsg'></span></div></div></div>" +
      "<div class='card'><div class='cb' style='display:grid;gap:8px'><h3 style='margin:0'>📥 Carregar do sistema Repsol</h3><p class='mut' style='margin:0;font-size:13px'>Ficheiro Excel «Histórico de movimentos de carburante» (receções). A app mostra as guias antes de gravar e não repete as que já estão registadas.</p>" +
      "<div class='bar'><button class='btn' id='ceHist'>📥 Carregar histórico de movimentos (Excel)</button><input type='file' id='fCeHist' accept='.xlsx,.xls' hidden></div><div id='ceHistMsg'></div></div></div>" : "";
    h += "<div class='card'><div class='cb'><h3 style='margin:0 0 8px'>Totais recebidos · " + esc(nomeMes(M)) + "</h3><div class='sc'><table><thead><tr><th class='l'>Produto</th><th>Recebido</th><th class='l'>Unidade</th></tr></thead><tbody>" +
      c.produtos.filter(function (p) { return ENSE_PROD[p].u === "L"; }).map(function (p) { return "<tr><td class='l'>" + esc(ENSE_PROD[p].n) + "</td><td class='n'>" + (ENSE_PROD[p].kg ? "<b>" + q100(totKg[p] || 0) + "</b> kg = " : "") + "<b>" + (tot[p] ? q100(tot[p]) : "0") + "</b></td><td class='l'>" + unid(p) + "</td></tr>"; }).join("") + "</tbody></table></div></div></div>";
    var G = [], gi = {};
    L.forEach(function (x) { var k = x.dia + "|" + (x.guia || "") + "|" + (x.guia ? "" : String(x.criado).slice(0, 16)); if (!gi[k]) { gi[k] = {dia: x.dia, guia: x.guia, nota: x.nota, it: []}; G.push(gi[k]); } gi[k].it.push(x); if (x.nota && !gi[k].nota) gi[k].nota = x.nota; });
    h += "<div class='card'><div class='cb'><h3 style='margin:0 0 8px'>Guias registadas (" + G.length + ")</h3>" + (G.length ? "<div class='sc'><table><thead><tr><th>Data</th><th class='l'>Guia</th><th class='l'>Produtos</th><th>Total</th><th class='l'>Nota</th>" + (ADMIN ? "<th></th>" : "") + "</tr></thead><tbody>" +
      G.map(function (g) { var t = g.it.reduce(function (a, x) { return a + x.qtd; }, 0);
        return "<tr><td>" + dmy(g.dia) + "</td><td class='l'><b>" + (esc(g.guia) || "<span class='mut'>sem nº</span>") + "</b></td><td class='l'>" + g.it.map(function (x) { return esc((ENSE_PROD[x.produto] || {n: x.produto}).n) + ": <b>" + q100(x.qtd) + " L</b>" + (x.kg != null ? " <small class='mut'>(" + q100(x.kg) + " kg)</small>" : ""); }).join("<br>") + "</td><td class='n'><b>" + q100(t) + " L</b></td><td class='l'>" + esc(g.nota || "") + "</td>" +
          (ADMIN ? "<td style='white-space:nowrap'><button class='btn' data-editar='" + G.indexOf(g) + "' title='Editar esta guia'>✏️</button> <button class='btn' data-apagar='" + g.it.map(function (x) { return x.id; }).join(",") + "' title='Apagar esta guia'>🗑</button></td>" : "") + "</tr>"; }).join("") + "</tbody></table></div>" : "<p class='mut' style='margin:0'>Ainda não há guias neste mês.</p>") + "</div></div>";
    box.innerHTML = h;
    if (ADMIN) {
      $$("#combCorpo .ceQ").forEach(function (el) { el.oninput = function () { var p = el.dataset.p, x = $("#combCorpo .ceConv[data-p='" + p + "']"), v = num(el.value);
        if (x) x.textContent = v > 0 ? "= " + (Math.round(v * c.gpl_kg_litros * 100) / 100).toLocaleString("pt-PT") + " litros" : ""; }; });
      $("#ceHist").onclick = function () { $("#fCeHist").click(); };
      $("#fCeHist").onchange = function () { var f = this.files[0]; this.value = ""; if (f) importarHistCarburante(f, c, L); };
      $("#ceGravar").onclick = async function () {
        var b = this, dia = $("#ceDia").value, guia = $("#ceGuia").value.trim(), nota = $("#ceNota").value.trim(), msg = $("#ceMsg"), linhas = [], mau = null;
        if (!dia) { msg.innerHTML = "<span class='bad'>Escolha a data.</span>"; return; }
        $$("#combCorpo .ceQ").forEach(function (el) { var t = el.value.trim(); if (!t) return; var v = num(t), p = el.dataset.p;
          if (isNaN(v) || v < 0) { mau = ENSE_PROD[p].n; return; } if (!(v > 0)) return;
          linhas.push({estacao: EST, dia: dia, produto: p, qtd: Math.round((ENSE_PROD[p].kg ? v * c.gpl_kg_litros : v) * 100), kg: ENSE_PROD[p].kg ? Math.round(v * 100) : null, guia: guia, nota: nota}); });
        if (mau) { msg.innerHTML = "<span class='bad'>Quantidade inválida em " + esc(mau) + ".</span>"; return; }
        if (!linhas.length) { msg.innerHTML = "<span class='bad'>Escreva a quantidade de pelo menos um produto.</span>"; return; }
        b.disabled = true;
        try {
          if (ED) {   /* editar a guia: atualiza as linhas que ficam, acrescenta as novas e apaga as que ficaram em branco (tudo fica no histórico) */
            var porP = {}; ED.it.forEach(function (x) { porP[x.produto] = x; });
            for (var i = 0; i < linhas.length; i++) { var l = linhas[i], ant = porP[l.produto];
              if (ant) { var u = await sb.from("msb_comb_entradas").update({dia: l.dia, qtd: l.qtd, kg: l.kg, guia: l.guia, nota: l.nota}).eq("id", ant.id); if (u.error) throw u.error; delete porP[l.produto]; }
              else { var n = await sb.from("msb_comb_entradas").insert(l); if (n.error) throw n.error; } }
            var sobra = Object.keys(porP).map(function (k) { return porP[k].id; });
            if (sobra.length) { var d = await sb.from("msb_comb_entradas").delete().in("id", sobra); if (d.error) throw d.error; }
          } else { var g = await sb.from("msb_comb_entradas").insert(linhas); if (g.error) throw g.error; }
          if (dia.slice(0, 7) !== $("#cMes").value) $("#cMes").value = dia.slice(0, 7);
          var era = ED; ED = null;
          await carregarEntradasComb(); $("#ceMsg").innerHTML = "<span class='ok'>✔ Guia " + esc(guia || "sem nº") + (era ? " alterada" : " registada") + ": " + linhas.length + " produto(s).</span>"; }
        catch (e) { b.disabled = false; msg.innerHTML = "<span class='bad'>✖ " + esc(falhouComb(e)) + "</span>"; }
      };
      $$("#combCorpo [data-editar]").forEach(function (b) { b.onclick = function () {
        var g = G[+b.dataset.editar]; ED = g;
        $("#ceDia").value = g.dia; $("#ceGuia").value = g.guia || ""; $("#ceNota").value = g.nota || "";
        $$("#combCorpo .ceQ").forEach(function (el) { var x = g.it.find(function (y) { return y.produto === el.dataset.p; }); var v = x ? (ENSE_PROD[x.produto].kg && x.kg != null ? x.kg : x.qtd) : null; el.value = v == null ? "" : String(v / 100).replace(".", ","); if (el.oninput) el.oninput(); });
        $("#ceTit").textContent = "✏️ Editar guia " + (g.guia || "sem nº") + " de " + dmy(g.dia);
        $("#ceGravar").textContent = "✔ Guardar alterações"; $("#ceCancelar").hidden = false; $("#ceMsg").innerHTML = "";
        $("#ceTit").scrollIntoView({behavior: "smooth", block: "center"}); }; });
      $("#ceCancelar").onclick = function () { ED = null; carregarEntradasComb(); };
      $$("#combCorpo [data-apagar]").forEach(function (b) { b.onclick = async function () {
        if (!b.dataset.conf) { b.dataset.conf = 1; b.textContent = "Apagar?"; return; }
        b.disabled = true; var g = await sb.from("msb_comb_entradas").delete().in("id", b.dataset.apagar.split(",").map(Number));
        if (g.error) { b.textContent = "✖"; status(false, falhouComb(g.error)); } else carregarEntradasComb(); }; });
    }
  } catch (e) { box.innerHTML = "<div class='card msgErr' style='padding:12px'>✖ " + esc(falhouComb(e)) + "</div>"; }
}
/* Histórico de movimentos de carburante (Excel do sistema Repsol): colunas Data, Turno, Loja, Tipo, Nº Documento, Fornecedor,
   Tanque, Produto, Volume, Volume a 15 graus, Temperatura, Montante Total. Só as linhas "Recepciones"; Volume em litros
   (o GLP também vem em litros: os kg calculam-se pelo fator). Antes de gravar mostra-se o que entra; não se repete o que já existe. */
async function importarHistCarburante(f, c, existentes) {
  var box = $("#ceHistMsg"), m = function (cls, t) { box.className = cls; box.style.padding = "10px"; box.style.borderRadius = "10px"; box.innerHTML = t; };
  m("mut", "⏳ A ler " + esc(f.name) + "…");
  try {
    await carregarXlsxMSB();
    var wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), {type: "array"}), L = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header: 1, raw: true, defval: ""});
    var h = L.findIndex(function (r) { return r.some(function (x) { return String(x).trim() === "Nº Documento"; }) && r.some(function (x) { return String(x).trim() === "Produto"; }); });
    if (h < 0) throw new Error("Não é o «Histórico de movimentos de carburante» (faltam as colunas Nº Documento e Produto).");
    var cab = L[h].map(function (x) { return String(x).trim(); }), col = function (n) { return cab.indexOf(n); };
    var iD = col("Data"), iL = col("Loja"), iT = col("Tipo"), iN = col("Nº Documento"), iTq = col("Tanque"), iP = col("Produto"), iV = col("Volume");
    var novos = [], fora = [], postos = {};
    L.slice(h + 1).forEach(function (r) {
      if (!/^Recep/i.test(String(r[iT]))) return;
      var mp = /\b(E\d{3,5})\b/.exec(String(r[iL])); if (mp) postos[mp[1]] = 1;
      var d = /(\d{2})\/(\d{2})\/(\d{4})/.exec(String(r[iD])); if (!d) return;
      var nome = semAcentosCBOS(r[iP]), p = /NEXA/.test(nome) ? (c.produtos.indexOf("nexa") >= 0 ? "nexa" : null) : c.produtos.find(function (k) { return k !== "nexa" && ENSE_PROD[k].u === "L" && ENSE_PROD[k].cbos && ENSE_PROD[k].cbos.test(nome); });
      var v = Number(r[iV]) || 0; if (!(v > 0)) return;
      if (!p) { fora.push(String(r[iP])); return; }
      novos.push({estacao: EST, dia: d[3] + "-" + d[2] + "-" + d[1], produto: p, qtd: Math.round(v * 100), kg: ENSE_PROD[p].kg ? Math.round(v / c.gpl_kg_litros * 100) : null, guia: String(r[iN]).trim(), nota: String(r[iTq]).trim() + " · do sistema Repsol"});
    });
    var ps = Object.keys(postos), est = ESTS.find(function (x) { return (x.posto_repsol || "").toUpperCase() === ps[0]; });
    if (ps.length !== 1) throw new Error(ps.length ? "O ficheiro tem várias lojas (" + ps.join(", ") + "). Exporte só uma." : "O ficheiro não diz de que loja é (coluna Loja).");
    if (!est || est.id !== EST) throw new Error("Este ficheiro é do posto " + ps[0] + (est ? " (" + (est.short_name || est.name) + ")" : "") + ", mas está a trabalhar em " + $("#hEst").textContent + ". Mude de loja no topo e carregue de novo.");
    if (!novos.length) throw new Error("Não há receções de combustível no ficheiro.");
    /* não repetir: o que já existe com o mesmo dia, guia, produto e quantidade */
    var dias = novos.map(function (x) { return x.dia; }).sort(), ex = await sb.from("msb_comb_entradas").select("dia,guia,produto,qtd").eq("estacao", EST).gte("dia", dias[0]).lte("dia", dias[dias.length - 1]);
    if (ex.error) throw ex.error;
    var ja = {}; (ex.data || []).forEach(function (x) { var k = x.dia + "|" + x.guia + "|" + x.produto + "|" + x.qtd; ja[k] = (ja[k] || 0) + 1; });
    var gravar = novos.filter(function (x) { var k = x.dia + "|" + x.guia + "|" + x.produto + "|" + x.qtd; if (ja[k]) { ja[k]--; return false; } return true; });
    var guias = {}; gravar.forEach(function (x) { var k = x.dia + "|" + x.guia; (guias[k] = guias[k] || []).push(x); });
    var tot = gravar.reduce(function (a, x) { return a + x.qtd; }, 0);
    m("card", "<b>" + esc(f.name) + "</b>: " + novos.length + " receções, " + (novos.length - gravar.length) + " já registadas" + (fora.length ? ", " + fora.length + " de produtos sem linha na ENSE (" + esc(fora.join(", ")) + ")" : "") + ".<br>" +
      (gravar.length ? "Vão entrar <b>" + Object.keys(guias).length + " guias</b> (" + gravar.length + " linhas, " + q100(tot) + " L):<div class='sc' style='margin-top:6px'><table><thead><tr><th>Data</th><th class='l'>Guia</th><th class='l'>Produtos</th></tr></thead><tbody>" +
        Object.keys(guias).sort().map(function (k) { var g = guias[k]; return "<tr><td>" + dmy(g[0].dia) + "</td><td class='l'><b>" + esc(g[0].guia) + "</b></td><td class='l'>" + g.map(function (x) { return esc(ENSE_PROD[x.produto].n) + ": " + q100(x.qtd) + " L" + (x.kg != null ? " (" + q100(x.kg) + " kg)" : ""); }).join("<br>") + "</td></tr>"; }).join("") +
        "</tbody></table></div><div class='bar' style='margin-top:8px'><button class='btn p' id='ceHistOk'>✔ Gravar " + Object.keys(guias).length + " guias</button><button class='btn' id='ceHistNao'>Cancelar</button></div>"
        : "Nada novo para gravar."));
    if (!gravar.length) return;
    $("#ceHistNao").onclick = function () { box.innerHTML = ""; box.className = ""; };
    $("#ceHistOk").onclick = async function () { this.disabled = true;
      try { var g = await sb.from("msb_comb_entradas").insert(gravar); if (g.error) throw g.error;
        $("#cMes").value = gravar.map(function (x) { return x.dia; }).sort().pop().slice(0, 7);
        await carregarEntradasComb(); var b2 = $("#ceHistMsg"); b2.className = "msgOk"; b2.style.padding = "10px"; b2.style.borderRadius = "10px"; b2.textContent = "✔ " + Object.keys(guias).length + " guias do sistema Repsol gravadas (" + gravar.length + " linhas)."; }
      catch (e) { this.disabled = false; m("msgErr", "✖ " + esc(falhouComb(e))); } };
  } catch (e) { m("msgErr", "✖ " + esc(f.name) + ": " + esc(falhouComb(e))); }
}
function nomeMes(M) { return new Date(M + "-15").toLocaleDateString("pt-PT", {month: "long", year: "numeric"}); }
$("#cMes").onchange = carregarEntradasComb;
$("#cAnt").onclick = function () { $("#cMes").value = addMes($("#cMes").value || mesHoje(), -1); carregarEntradasComb(); };
$("#cSeg").onclick = function () { $("#cMes").value = addMes($("#cMes").value || mesHoje(), 1); carregarEntradasComb(); };

/* ---------------- Relatório mensal ENSE ---------------- */
var ENSE_DADOS = null;
async function carregarENSE() {
  var box = $("#enseCorpo"), M = $("#eMes").value || addMes(mesHoje(), -1); $("#eMes").value = M;
  box.innerHTML = "<div class='mut'>A carregar…</div>";
  try {
    var c = await cfgENSE(), fim = addMes(M, 1) + "-01";
    var re = await sb.from("msb_comb_entradas").select("produto,qtd,kg").eq("estacao", EST).gte("dia", M + "-01").lt("dia", fim); if (re.error) throw re.error;
    var rv = await sb.from("msb_vendas_mes").select("dados,de,ate,fonte").eq("estacao", EST).eq("mes", M).maybeSingle();
    var rf = await sb.from("msb_folha_fecho").select("dados,de,ate,fonte").eq("estacao", EST).eq("mes", M).maybeSingle();
    var FF = rf && !rf.error && rf.data ? rf.data : null;
    var rm = await sb.from("msb_ense").select("produto,campo,valor").eq("estacao", EST).eq("mes", M); if (rm.error) throw rm.error;
    var auto = {}, man = {}, semProd = [], gas = null;
    c.produtos.forEach(function (p) { auto[p] = {recebidos: 0, vendas_qtd: null, vendas_valor: null, frota_qtd: null}; });
    (re.data || []).forEach(function (x) { if (auto[x.produto]) { auto[x.produto].recebidos += x.qtd; if (x.kg != null) auto[x.produto].recebidos_kg = (auto[x.produto].recebidos_kg || 0) + x.kg; } });
    var V = rv && !rv.error && rv.data ? rv.data.dados : null;
    if (V) {
      c.produtos.forEach(function (p) { if (ENSE_PROD[p].cbos) { auto[p].vendas_qtd = 0; auto[p].vendas_valor = 0; auto[p].frota_qtd = 0; } });
      ["consigna", "solred"].forEach(function (forma) { Object.keys((V.comb || {})[forma] || {}).forEach(function (nome) {
        var v = V.comb[forma][nome], p = /NEXA/.test(nome) ? (c.produtos.indexOf("nexa") >= 0 ? "nexa" : null) : c.produtos.find(function (k) { return k !== "nexa" && ENSE_PROD[k].cbos && ENSE_PROD[k].cbos.test(nome); });
        if (!p) { if (!/AD ?BLUE/.test(nome)) semProd.push(nome); return; }
        auto[p].vendas_qtd += v[0]; auto[p].vendas_valor += v[2]; if (forma === "solred") auto[p].frota_qtd += v[0]; }); });
      (V.loja || []).forEach(function (l) { if (/^GAS$/.test(l[0])) gas = (gas || 0) + l[2]; });
    }
    /* vendas totais de combustível (já com Solred): FOLHA DE FECHO TURNO MENSAL, quando existe (volume e vendas líquidas) */
    if (FF) {
      c.produtos.forEach(function (p) { if (ENSE_PROD[p].cbos) { auto[p].vendas_qtd = 0; auto[p].vendas_valor = 0; if (auto[p].frota_qtd == null) auto[p].frota_qtd = null; } });
      FF.dados.comb.forEach(function (x) { var nome = x[0], p = /NEXA/.test(nome) ? (c.produtos.indexOf("nexa") >= 0 ? "nexa" : null) : c.produtos.find(function (k) { return k !== "nexa" && ENSE_PROD[k].cbos && ENSE_PROD[k].cbos.test(nome); });
        if (!p) { if (semProd.indexOf(nome) < 0 && !/AD ?BLUE/.test(nome)) semProd.push(nome); return; } auto[p].vendas_qtd += x[2]; auto[p].vendas_valor += x[6]; });
      FF.dados.loja.forEach(function (l) { if (l[0] === "GAS") gas = l[2]; });
    }
    /* garrafas de gás: relatório de vendas por artigo (Excel) do mês; recebidas = vendidas (regra do utilizador, 02/11/2026) */
    var VA = await vendasArtigosDoMes(M), gasNao = [];
    if (VA) {
      c.produtos.forEach(function (p) { if (ENSE_PROD[p].art) { auto[p].vendas_qtd = 0; auto[p].vendas_valor = 0; auto[p].frota_qtd = 0; } });
      VA.linhas.forEach(function (l) { var nm = semAcentosCBOS(l[1]), fam = semAcentosCBOS(l[4] || ""), p = (!fam || /GAS/.test(fam)) ? c.produtos.find(function (k) { return ENSE_PROD[k].art && ENSE_PROD[k].art.test(nm); }) : null;
        if (p) { auto[p].vendas_qtd += Math.round(l[2] * 100); auto[p].vendas_valor += Math.round(l[3] * 100); }
        else if ((/^GAS$/.test(fam) || /BUTANO|PROPANO/.test(nm)) && !/ISQUEIRO|CLIPPER|REDUTOR|REGULADOR|MANGUEIRA/.test(nm) && l[2]) gasNao.push(l[1] + " (" + l[2] + ")"); });
      c.produtos.forEach(function (p) { if (ENSE_PROD[p].art) auto[p].recebidos = auto[p].vendas_qtd; });
    }
    (rm.data || []).forEach(function (x) { (man[x.produto] = man[x.produto] || {})[x.campo] = x.valor; });
    ENSE_DADOS = {M: M, c: c, auto: auto, man: man, V: V, fonte: V ? rv.data : null, ff: FF, va: VA};
    var val = function (p, k) { return man[p] && man[p][k] != null ? man[p][k] : auto[p][k]; };
    var cel = function (p, k, euro) { var m = man[p] && man[p][k] != null, v = val(p, k), kg = !euro && ENSE_PROD[p].kg ? kgENSE(ENSE_DADOS, p, k) : null;
      return "<td class='n'>" + (ADMIN ? "<input class='enseIn" + (m ? " man" : "") + "' data-p='" + p + "' data-k='" + k + "' inputmode='decimal' value='" + (v == null ? "" : euro ? fmt(v) : q100(v)) + "' placeholder='0' title='" + (m ? "escrito à mão" : "calculado") + "'>" : (v == null ? "—" : euro ? fmt(v) : q100(v))) + (kg != null ? "<br><small class='mut'>= " + q100(kg) + " kg</small>" : "") + "</td>"; };
    var h = "<div class='card'><div class='cb' style='display:grid;gap:6px'>" +
      (FF ? "<div class='msgOk' style='padding:8px 10px;border-radius:8px'>✔ Vendas totais de combustível: FOLHA DE FECHO TURNO MENSAL de " + dmy(FF.de) + " a " + dmy(FF.ate) + ".</div>"
          : "<div class='msgErr' style='padding:8px 10px;border-radius:8px'>⚠ Falta a FOLHA DE FECHO TURNO MENSAL de " + esc(nomeMes(M)) + " (vendas totais de combustível)." + (V ? " Por agora usam-se os totais do TURNO POR FORMAS DE COBRANÇA MENSAL." : "") + " Carregue-a no botão 📥 acima.</div>") +
      (V ? "<div class='msgOk' style='padding:8px 10px;border-radius:8px'>✔ Vendas Solred (cartão frotista): TURNO POR FORMAS DE COBRANÇA MENSAL de " + dmy(rv.data.de) + " a " + dmy(rv.data.ate) + ".</div>"
         : "<div class='msgErr' style='padding:8px 10px;border-radius:8px'>⚠ Falta o TURNO POR FORMAS DE COBRANÇA MENSAL de " + esc(nomeMes(M)) + " (vendas Solred para o cartão frotista). Carregue-o no botão 📥 acima.</div>") +
      (semProd.length ? "<div class='mut' style='font-size:13px'>Produtos do relatório sem linha na ENSE (não contados): " + semProd.map(esc).join(", ") + ".</div>" : "") +
      (VA ? "<div class='msgOk' style='padding:8px 10px;border-radius:8px'>✔ Garrafas de gás do relatório de vendas por artigo (Excel) de " + dmy(VA.de) + " a " + dmy(VA.ate) + ". Recebidas = vendidas.</div>"
          : "<div class='msgErr' style='padding:8px 10px;border-radius:8px'>⚠ Falta o relatório de vendas por artigo (Excel) do mês inteiro de " + esc(nomeMes(M)) + ". Carregue-o em Vendas → Relatório de vendas (Excel) ou no 📥 Carregar.</div>") +
      (gasNao.length ? "<div class='mut' style='font-size:13px'>Artigos de gás no Excel sem linha na ENSE: " + gasNao.map(esc).join(", ") + ".</div>" : "") +
      (gas != null && VA ? "<div class='mut' style='font-size:13px'>Conferência: garrafas na família GAS do relatório de turnos = " + q100(gas) + ".</div>" : "") +
      "<div class='mut' style='font-size:13px'>Os campos a laranja foram escritos à mão e substituem o valor calculado. Para voltar ao calculado, apague o número.</div></div></div>";
    h += "<div class='card'><div class='cb'><div class='sc'><table id='enseTab'><thead><tr><th class='l'>Produto</th><th class='l'>Un.</th><th>Produtos recebidos</th><th>Vendas (quantidade)</th><th>Vendas (€ com IVA)</th><th>Vendas cartão frotista</th></tr></thead><tbody>" +
      c.produtos.map(function (p) { return "<tr><td class='l'>" + esc(ENSE_PROD[p].n) + "</td><td class='l'>" + unid(p) + "</td>" + cel(p, "recebidos") + cel(p, "vendas_qtd") + cel(p, "vendas_valor", true) + cel(p, "frota_qtd") + "</tr>"; }).join("") +
      "</tbody></table></div></div></div>";
    box.innerHTML = h;
    $$("#enseTab .enseIn").forEach(function (el) { el.onchange = function () { gravarENSE(el); }; });
  } catch (e) { box.innerHTML = "<div class='card msgErr' style='padding:12px'>✖ " + esc(falhouComb(e)) + "</div>"; }
}
/* GPL: kg da guia quando há (recebidos sem correção); senão litros ÷ fator */
function kgENSE(D, p, k) { var m = D.man[p] && D.man[p][k] != null, v = m ? D.man[p][k] : D.auto[p][k];
  if (v == null) return null; if (k === "recebidos" && !m && D.auto[p].recebidos_kg != null) return D.auto[p].recebidos_kg; return Math.round(v / D.c.gpl_kg_litros); }
async function gravarENSE(el) {
  var D = ENSE_DADOS, p = el.dataset.p, k = el.dataset.k, t = el.value.trim(), euro = k === "vendas_valor";
  try {
    if (t === "") { var a = await sb.from("msb_ense").delete().eq("estacao", EST).eq("mes", D.M).eq("produto", p).eq("campo", k); if (a.error) throw a.error; }
    else { var v = num(t); if (isNaN(v) || v < 0) throw new Error("Valor inválido");
      var g = await sb.from("msb_ense").upsert({estacao: EST, mes: D.M, produto: p, campo: k, valor: Math.round(v * 100), atualizado: new Date().toISOString()}, {onConflict: "estacao,mes,produto,campo"}); if (g.error) throw g.error; }
    status(true, "Guardado ✓"); await carregarENSE();
  } catch (e) { status(false, falhouComb(e)); }
}
$("#eMes").onchange = carregarENSE;
$("#eAnt").onclick = function () { $("#eMes").value = addMes($("#eMes").value || mesHoje(), -1); carregarENSE(); };
$("#eSeg").onclick = function () { $("#eMes").value = addMes($("#eMes").value || mesHoje(), 1); carregarENSE(); };

/* PDF (pdf-lib por cdnjs), nas três partes do formulário da ENSE, pela mesma ordem e unidades */
var pdfLibP = null;
function carregarPdfLib() {
  if (window.PDFLib) return Promise.resolve();
  if (pdfLibP) return pdfLibP;
  pdfLibP = new Promise(function (ok, ko) { var s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js"; s.onload = ok; s.onerror = function () { pdfLibP = null; ko(new Error("Não foi possível carregar o gerador de PDF (sem internet?)")); }; document.head.appendChild(s); });
  return pdfLibP;
}
/* Marca registada em todos os relatórios PDF (02/11/2026): logótipo pequeno + "mystationbox®" no rodapé, à esquerda.
   O nome da estação vai no cabeçalho de cada relatório, nunca junto ao logótipo. */
var marcaPng = null;
async function marcaPdf(doc, pg, F, B, x, y, t) {   // x, y em pontos (canto inferior esquerdo), t = tamanho da letra
  t = t || 7.5;
  try { if (!marcaPng) marcaPng = new Uint8Array(await (await fetch("marca_pdf.png")).arrayBuffer()); var im = await doc.embedPng(marcaPng), h = t * 1.7;
    pg.drawImage(im, {x: x, y: y - t * 0.35, width: h * im.width / im.height, height: h}); return; } catch (e) { /* sem imagem: só texto */ }
  var P = window.PDFLib, az = P.rgb(0.039, 0.173, 0.278), la = P.rgb(0.953, 0.424, 0.129);
  pg.drawText("mystation", {x: x, y: y, size: t, font: B, color: az}); x += B.widthOfTextAtSize("mystation", t);
  pg.drawText("box", {x: x, y: y, size: t, font: B, color: la}); x += B.widthOfTextAtSize("box", t);
  pg.drawText("\u00AE", {x: x + 0.5, y: y + t * 0.45, size: t * 0.55, font: F, color: la});
}
/* PDF numa só página A4 (deitada): uma tabela com uma linha por produto e as três partes do formulário da ENSE em colunas
   (recebidos · total de vendas em quantidade e € · cartão frotista). Combustíveis primeiro, depois garrafas de gás. */
async function fazerPdfENSE(D, inst) {
  var P = window.PDFLib, doc = await P.PDFDocument.create(), F = await doc.embedFont(P.StandardFonts.Helvetica), B = await doc.embedFont(P.StandardFonts.HelveticaBold);
  var mm = function (v) { return v * 72 / 25.4; }, W = 297, H = 210, pg = doc.addPage([mm(W), mm(H)]), cfg = D.c;
  var azul = P.rgb(0, 0.231, 0.361), lar = P.rgb(0.953, 0.424, 0.129), cinz = P.rgb(0.42, 0.45, 0.5), esc0 = P.rgb(0.1, 0.13, 0.17), claro = P.rgb(0.953, 0.957, 0.965);
  var limpa = function (t) { return String(t).replace(/[  ]/g, " ").replace(/[^\x20-\x7E\xA0-\xFF€]/g, ""); };
  var txt = function (s, x, y, o) { o = o || {}; var f = o.b ? B : F, t = o.t || 9, w = f.widthOfTextAtSize(limpa(s), t);
    pg.drawText(limpa(s), {x: mm(x) - (o.dir ? w : o.mid ? w / 2 : 0), y: mm(H - y), size: t, font: f, color: o.c || esc0}); };
  var ret = function (x, y, w, h, cor) { pg.drawRectangle({x: mm(x), y: mm(H - y - h), width: mm(w), height: mm(h), color: cor}); };
  var val = function (p, k) { return D.man[p] && D.man[p][k] != null ? D.man[p][k] : D.auto[p][k]; };
  var curto = {gas95ad: "Gasolina I.O. 95 com aditivação suplementar", gas98ad: "Gasolina I.O. 98 com aditivação suplementar", gasoleoad: "Gasóleo rodoviário com aditivação suplementar"};
  /* cabeçalho */
  ret(0, 0, W, 22, azul); ret(0, 22, W, 1.2, lar);
  txt("Reporte mensal à ENSE", 14, 10, {b: 1, t: 16, c: P.rgb(1, 1, 1)});
  txt(nomeMes(D.M).replace(/^./, function (c) { return c.toUpperCase(); }), 14, 17.5, {t: 10.5, c: P.rgb(1, 0.78, 0.6)});
  txt("Entidade: " + (cfg.entidade || "Porto João & Nunes LDA."), W - 14, 10, {dir: 1, t: 10, c: P.rgb(1, 1, 1)});
  txt("Instalação: " + inst, W - 14, 17.5, {dir: 1, t: 10, c: P.rgb(1, 1, 1)});
  /* colunas */
  var X = {prod: 14, un: 112, rec: 160, vq: 196, ve: 232, fr: 270}, y = 32;
  ret(14, y - 5, W - 28, 13, claro);
  txt("Produto", X.prod + 2, y + 2.3, {b: 1, t: 8.5, c: cinz}); txt("Unidade", X.un, y + 2.3, {b: 1, t: 8.5, c: cinz});
  txt("Produtos recebidos", X.rec, y, {b: 1, t: 8.5, c: azul, dir: 1}); txt("quantidade", X.rec, y + 4.5, {t: 7.5, c: cinz, dir: 1});
  txt("Total de vendas", (X.vq + X.ve) / 2 - 8, y, {b: 1, t: 8.5, c: azul, mid: 1}); txt("quantidade", X.vq, y + 4.5, {t: 7.5, c: cinz, dir: 1}); txt("€ (com IVA)", X.ve, y + 4.5, {t: 7.5, c: cinz, dir: 1});
  txt("Vendas cartão frotista", X.fr, y, {b: 1, t: 8.5, c: azul, dir: 1}); txt("quantidade", X.fr, y + 4.5, {t: 7.5, c: cinz, dir: 1});
  y += 13;
  var linha = function (p, i) {
    var gpl = ENSE_PROD[p].kg, alt = gpl ? 9 : 6.4;
    if (i % 2) ret(14, y - 4.3, W - 28, alt, claro);
    txt(curto[p] || ENSE_PROD[p].n, X.prod + 2, y, {t: 9});
    txt(ENSE_PROD[p].u === "L" ? "litros" : "unidades", X.un, y, {t: 8.5, c: cinz});
    [["recebidos", X.rec], ["vendas_qtd", X.vq], ["vendas_valor", X.ve, 1], ["frota_qtd", X.fr]].forEach(function (k) {
      var v = val(p, k[0]); txt(v == null ? "-" : k[2] ? fmt(v) : q100(v), k[1], y, {b: 1, t: 9.5, dir: 1});
      if (gpl && !k[2] && v != null) txt("= " + q100(kgENSE(D, p, k[0])) + " kg", k[1], y + 3.7, {t: 7, c: cinz, dir: 1});
    });
    y += alt;
  };
  var grupo = function (titulo, ps) {
    if (!ps.length) return;
    txt(titulo, X.prod, y + 1, {b: 1, t: 9.5, c: lar}); y += 6.5;
    ps.forEach(linha);
    if (ps[0] && ENSE_PROD[ps[0]].u === "L") { /* total de litros dos combustíveis */
      pg.drawLine({start: {x: mm(14), y: mm(H - y + 3.6)}, end: {x: mm(W - 14), y: mm(H - y + 3.6)}, thickness: 0.6, color: cinz});
      txt("Total combustíveis", X.prod + 2, y + 0.5, {b: 1, t: 9}); txt("litros", X.un, y + 0.5, {t: 8.5, c: cinz});
      [["recebidos", X.rec], ["vendas_qtd", X.vq], ["vendas_valor", X.ve, 1], ["frota_qtd", X.fr]].forEach(function (k) {
        var t = ps.reduce(function (a, p) { return a + (val(p, k[0]) || 0); }, 0); txt(k[2] ? fmt(t) : q100(t), k[1], y + 0.5, {b: 1, t: 9.5, dir: 1}); });
      y += 7;
    }
    y += 2;
  };
  grupo("Combustíveis", cfg.produtos.filter(function (p) { return ENSE_PROD[p].u === "L"; }));
  grupo("Garrafas de gás (GPL)", cfg.produtos.filter(function (p) { return ENSE_PROD[p].u !== "L"; }));
  /* fontes e notas */
  y = Math.max(y + 2, H - 22);
  pg.drawLine({start: {x: mm(14), y: mm(H - y + 4)}, end: {x: mm(W - 14), y: mm(H - y + 4)}, thickness: 0.4, color: claro});
  txt("Fontes: vendas de combustível: Folha de fecho turno mensal" + (D.ff ? " (" + dmy(D.ff.de) + " a " + dmy(D.ff.ate) + ")" : " (em falta)") +
      "; cartão frotista: Turno por formas de cobrança mensal, Solred" + (D.fonte ? " (" + dmy(D.fonte.de) + " a " + dmy(D.fonte.ate) + ")" : " (em falta)") + ".", 14, y + 1, {t: 7.5, c: cinz});
  txt("Recebidos: guias de remessa registadas na app. Garrafas de gás: relatório de vendas por artigo" + (D.va ? " (" + dmy(D.va.de) + " a " + dmy(D.va.ate) + ")" : " (em falta)") + "; recebidas = vendidas." +
      (cfg.produtos.indexOf("gplauto") >= 0 ? " GPL: 1 kg = " + String(cfg.gpl_kg_litros).replace(".", ",") + " litros." : "") + " Valores de venda com IVA.", 14, y + 5, {t: 7.5, c: cinz});
  txt("gerado em " + new Date().toLocaleString("pt-PT"), W - 14, H - 6, {t: 7, c: cinz, dir: 1});
  await marcaPdf(doc, pg, F, B, mm(14), mm(6), 7.5);
  return doc.save();
}
async function pdfENSE() {
  var D = ENSE_DADOS; if (!D) return;
  try {
    await carregarPdfLib();
    var bytes = await fazerPdfENSE(D, $("#hEst").textContent || ""), url = URL.createObjectURL(new Blob([bytes], {type: "application/pdf"})), a = document.createElement("a");
    a.href = url; a.download = "ENSE_" + (EST || "") + "_" + D.M + ".pdf"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  } catch (e) { status(false, e.message); }
}
$("#bEnsePdf").onclick = pdfENSE;

/* FOLHA DE FECHO TURNO MENSAL: PDF do CBOS "Folha de Fecho de turno" do mês (leitor em motor.js, igual ao Python) */
window.msgENSE = msgENSE;
function msgENSE(cls, t) { var e = $("#enseMsg"); e.hidden = !t; e.className = "card " + cls; e.style.padding = "12px"; e.textContent = t || ""; }
async function importarFolhaFecho(f) {
  if (PAGINA !== "ense") ir("ense");
  if (window.tipoFicheiro && await tipoFicheiro(f) === "cbos") return importarVendasCBOS(f);   // escolheu o turno por formas de cobrança neste botão
  msgENSE("mut", "⏳ A ler " + f.name + "…");
  try {
    var bytes = new Uint8Array(await f.arrayBuffer()), L = await linhasPdf(bytes.slice()), r = MOTOR.lerFolhaFecho(L);
    var est = ESTS.find(function (x) { return (x.posto_repsol || "").toUpperCase() === r.posto; });
    if (!est) throw new Error("A folha é do posto " + r.posto + " - " + r.nome_posto + ", que não é nenhuma das suas lojas.");
    if (est.id !== EST) throw new Error("Esta folha é de " + (est.name || est.short_name) + " (posto " + r.posto + "), mas está a trabalhar em " + $("#hEst").textContent + ". Mude de loja no topo e carregue de novo.");
    var erros = r.verificacoes.filter(function (v) { return v.nivel === "erro"; });
    if (erros.length) throw new Error("As contas da folha não batem certo; não foi gravada. " + erros.map(function (v) { return v.msg; }).join(" "));
    var h = await sha(bytes), caminho = EST + "/vendas/folha_fecho_" + r.mes + "_" + h + ".pdf";
    await guardarOriginal(caminho, new Blob([bytes], {type: "application/pdf"}), "application/pdf");
    var g = await sb.from("msb_folha_fecho").upsert({estacao: EST, mes: r.mes, de: r.de, ate: r.ate, dados: r, fonte: f.name + " · " + caminho, criado: new Date().toISOString()}, {onConflict: "estacao,mes"});
    if (g.error) throw g.error;
    $("#eMes").value = r.mes; await carregarENSE();
    msgENSE("msgOk", "✔ Folha de fecho turno mensal de " + dmy(r.de) + " a " + dmy(r.ate) + " gravada. " + r.verificacoes.map(function (v) { return v.msg; }).join(" "));
  } catch (e) { msgENSE("msgErr", "✖ " + f.name + ": " + falhouComb(e)); }
}
$("#bFF").onclick = function () { $("#fFF").click(); };
$("#fFF").onchange = function () { var f = this.files[0]; this.value = ""; if (f) importarFolhaFecho(f); };
$("#bFC").onclick = function () { $("#fFC").click(); };
$("#fFC").onchange = function () { var f = this.files[0]; this.value = ""; if (f) importarVendasCBOS(f); };
