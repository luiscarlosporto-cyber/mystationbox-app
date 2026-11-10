/* mystationbox · pesquisa de documentos (10/11/2026, pedido do dono).
 * Conformidade → Pesquisar documentos: procura por número, entre datas e entre valores, nas duas estações, em
 *   - documentos da Saphety recolhidos pelo OCTAN AI (liquidações, faturas, notas de crédito, autofaturas…);
 *   - despesas (faturas de fornecedores, recibos, guias), faturas digitalizadas e créditos por transferência.
 * O valor dos documentos da Saphety lê-se do próprio PDF com MOTOR.lerTotalDocumento (= caixa_app/total_documento.py)
 * e fica guardado em msb_saphety_docs.valor_c. O que não se consegue ler fica «valor por ler» (com o motivo), nunca
 * com um número aproximado: aparece na pesquisa por número e por data, não na pesquisa por valor.
 * Só lê; a única escrita é guardar o valor lido dos documentos da Saphety (administrador). */
"use strict";
var PDOC = {lista: null, aLer: false};
var PDOC_TIPOS = [["", "Todos os tipos"], ["liq", "Liquidação"], ["fat", "Fatura"], ["nc", "Nota de crédito"], ["auto", "Autofatura Solred"], ["desp", "Despesa"], ["forn", "Fatura de fornecedor (digitalizada)"], ["transf", "Crédito por transferência"]];
function pdocNorm(t) { return String(t || "").toLowerCase().replace(/[\s\/\-.]/g, "").replace(/^0+/, ""); }
/* tipo e nome legível de um documento da Saphety, pela série do número */
function pdocSaphety(d) {
  var n = d.numero || "", s = (/^([A-Z0-9]{3,4}) /.exec(n) || [])[1] || "";
  if (d.tipo === "Extrato de Conta") return {k: "liq", n: "Liquidação"};
  if (s === "Z3AF") return {k: "auto", n: "Autofatura Solred"};
  if (s === "Z3F2") return {k: "fat", n: "Fatura conta consignação"};
  if (s === "Z3FS") return {k: "fat", n: "Fatura de serviços (taxas, água…)"};
  if (s === "Z000") return {k: "fat", n: "Fatura de lubrificantes"};
  if (s === "Z3G4") return {k: "nc", n: "Nota de crédito (combustível)"};
  if (/Crédito/i.test(d.tipo || "")) return {k: "nc", n: "Nota de crédito"};
  return {k: "fat", n: d.tipo || "Fatura"};
}
async function pdocCarregar() {
  var q = function (p) { return p.then(function (r) { if (r.error) throw r.error; return r.data || []; }); };
  var R = await Promise.all([
    q(sb.from("msb_saphety_docs").select("estacao,numero,tipo,data,entidade,refs,original,estado,valor_c,valor_regra,valor_motivo,valor_lido_em").order("data", {ascending: false}).limit(5000)),
    q(sb.from("msb_despesas").select("id,estacao,dia,categoria,fornecedor,documento,valor_c,original,estado").order("dia", {ascending: false}).limit(5000)).catch(function () { return []; }),
    q(sb.from("msb_faturas_dig").select("estacao,fornecedor,numero,dia,total_c,original").order("dia", {ascending: false}).limit(5000)).catch(function () { return []; }),
    q(sb.from("msb_transferencias").select("estacao,chave,tipo,dia,valor_c").order("dia", {ascending: false}).limit(5000)).catch(function () { return []; })
  ]);
  var L = [], ja = {};
  R[0].forEach(function (d) { var t = pdocSaphety(d); ja[d.estacao + "|" + pdocNorm(d.numero)] = 1;
    L.push({e: d.estacao, k: t.k, tn: t.n, n: d.numero, d: d.data, ent: d.entidade || "Repsol", v: d.valor_c, vl: d.valor_lido_em, vm: d.valor_motivo, refs: d.refs || [], o: d.original, b: "orig", s: d}); });
  R[1].forEach(function (d) { if (d.documento && ja[d.estacao + "|" + pdocNorm(d.documento)]) return;   // já está como documento da Saphety
    L.push({e: d.estacao, k: "desp", tn: "Despesa · " + (d.categoria || ""), n: d.documento || "", d: d.dia, ent: d.fornecedor || "", v: d.valor_c, vl: 1, refs: [], o: d.original, b: "desp"}); });
  R[2].forEach(function (d) { L.push({e: d.estacao, k: "forn", tn: "Fatura de fornecedor", n: d.numero || "", d: d.dia, ent: d.fornecedor || "", v: d.total_c, vl: 1, refs: [], o: d.original, b: "orig"}); });
  R[3].forEach(function (d) { L.push({e: d.estacao, k: "transf", tn: "Crédito por transferência · " + (d.tipo === "MB" ? "MB" : "Solred"), n: d.chave, d: d.dia, ent: "Repsol", v: d.valor_c, vl: 1, refs: [], o: null}); });
  L.sort(function (a, b) { return (b.d || "") < (a.d || "") ? -1 : (b.d || "") > (a.d || "") ? 1 : 0; });
  PDOC.lista = L;
}
/* lê o valor dos documentos da Saphety que ainda não foram lidos (só administrador, porque grava) */
async function pdocLerValores() {
  if (!ADMIN || PDOC.aLer) return;
  var falta = PDOC.lista.filter(function (x) { return x.s && !x.vl && x.o; });
  if (!falta.length) return;
  PDOC.aLer = true;
  for (var i = 0; i < falta.length; i++) {
    var x = falta[i];
    $("#pdocProg").textContent = "⏳ A ler o valor dos documentos da Saphety: " + (i + 1) + " de " + falta.length + "…";
    try {
      var f = await sb.storage.from("msb-originais").download(x.o); if (f.error) throw f.error;
      var pags = await MOTOR.pdfPaginas(new Uint8Array(await f.data.arrayBuffer()), inflar), L = [];
      pags.forEach(function (p) { p.forEach(function (l) { L.push(l); }); });
      var r = MOTOR.lerTotalDocumento(L), agora = new Date().toISOString();
      var u = await sb.from("msb_saphety_docs").update({valor_c: r.valor_c, valor_regra: r.regra, valor_motivo: r.motivo, valor_lido_em: agora}).eq("estacao", x.e).eq("numero", x.n);
      if (u.error) throw u.error;
      x.v = r.valor_c; x.vl = agora; x.vm = r.motivo;
    } catch (e) { continue; }   // sem rede ou original em falta: tenta na próxima vez que abrir a página
    if (i % 10 === 9) pdocMostrar();
  }
  PDOC.aLer = false; $("#pdocProg").textContent = ""; pdocMostrar();
}
function pdocValor(t) { var s = String(t || "").trim(); if (!s) return null; var v = MOTOR.num(s); return isNaN(v) ? null : Math.round(Math.abs(v) * 100); }
function pdocMostrar() {
  var box = $("#pdocRes"); if (!box || !PDOC.lista) return;
  var est = $("#pdocEst").value, tipo = $("#pdocTipo").value, nn = pdocNorm($("#pdocNum").value), de = $("#pdocDe").value, ate = $("#pdocAte").value,
    vmin = pdocValor($("#pdocVmin").value), vmax = pdocValor($("#pdocVmax").value), porValor = vmin != null || vmax != null;
  var R = PDOC.lista.filter(function (x) {
    if (est && x.e !== est) return false;
    if (tipo && x.k !== tipo) return false;
    if (nn && pdocNorm(x.n).indexOf(nn) < 0 && !x.refs.some(function (r) { return pdocNorm(r).indexOf(nn) >= 0; })) return false;
    if (de && (!x.d || x.d < de)) return false;
    if (ate && (!x.d || x.d > ate)) return false;
    if (porValor) { if (x.v == null) return false; var a = Math.abs(x.v); if (vmin != null && a < vmin) return false; if (vmax != null && a > vmax) return false; }
    return true;
  });
  var porLer = PDOC.lista.filter(function (x) { return x.s && x.v == null; }).length, MAX = 300;
  var nomeEst = function (id) { var e = ESTS.find(function (y) { return y.id === id; }); return e ? (e.short_name || e.name) : id; };
  box.innerHTML = "<div class='mut' style='font-size:14px;margin:4px 0 8px'><b>" + R.length + "</b> documento" + (R.length === 1 ? "" : "s") + (R.length > MAX ? " (a mostrar os " + MAX + " mais recentes; afine a pesquisa)" : "") +
    (porValor && porLer ? " · " + porLer + " documento(s) da Saphety ainda sem valor não entram na pesquisa por valor" : "") + "</div>" +
    (R.length ? "<div style='display:grid;gap:8px'>" +
      R.slice(0, MAX).map(function (x) {
        var refs = x.refs.filter(function (r, i, a) { return a.indexOf(r) === i; });
        var val = x.v != null ? fmt(x.v) + " €" : x.s && x.vl ? "<span class='mut' title='" + esc(x.vm || "") + "'>valor por ler</span>" : "<span class='mut'>…</span>";
        return "<div class='card' style='padding:10px 12px;display:grid;gap:3px'>" +
          "<div style='display:flex;gap:10px;align-items:baseline'><b style='flex:1;min-width:0;overflow-wrap:anywhere'>" + esc(x.n || "—") + "</b><b style='white-space:nowrap;font-variant-numeric:tabular-nums'>" + val + "</b></div>" +
          "<div class='mut' style='font-size:13px'>" + esc(x.tn) + " · " + (x.d ? dmy(x.d) : "sem data") + (ESTS.length > 1 ? " · " + esc(nomeEst(x.e)) : "") + (x.ent ? " · " + esc(x.ent) : "") + "</div>" +
          "<div style='display:flex;gap:8px;align-items:center;flex-wrap:wrap'>" +
            (refs.length ? "<span style='font-size:12px;flex:1;min-width:0'>" + refs.slice(0, 6).map(function (r) { return "<a href='#' data-n='" + esc(r) + "'>↳ " + esc(r) + "</a>"; }).join(" ") + (refs.length > 6 ? " <span class='mut'>+" + (refs.length - 6) + "</span>" : "") + "</span>" : "<span style='flex:1'></span>") +
            (x.o ? "<button class='mini' data-o='" + esc(x.o) + "' data-b='" + x.b + "'>📄 Abrir PDF</button>" : "<span class='mut' style='font-size:12px'>sem PDF</span>") +
          "</div></div>";
      }).join("") + "</div>" : "<div class='vazio'>Nenhum documento com estes critérios.</div>");
  box.querySelectorAll("[data-o]").forEach(function (b) { b.onclick = function () { if (b.dataset.b === "desp") verDocumentoDespesa(b.dataset.o); else abrirOriginal(b.dataset.o); }; });
  box.querySelectorAll("[data-n]").forEach(function (a) { a.onclick = function (ev) { ev.preventDefault(); $("#pdocNum").value = a.dataset.n; $("#pdocTipo").value = ""; pdocMostrar(); }; });
}
async function carregarPesquisaDocs() {
  var box = $("#v-pdoc");
  if (!$("#pdocRes")) {
    box.innerHTML = "<div class='card' style='padding:14px'><h2 style='margin:0 0 4px'>🔎 Pesquisar documentos</h2>" +
      "<p class='mut' style='margin:0 0 10px;font-size:14px'>Liquidações, faturas, notas de crédito e autofaturas da Saphety, despesas e créditos por transferência. Escreva só parte do número, por exemplo «8442523» ou «4211798654». Os valores procuram-se sem sinal (uma nota de crédito de 147,23 € aparece entre 100 e 200).</p>" +
      "<div class='ff'><label>Estação<select id='pdocEst'><option value=''>Todas</option>" + ESTS.map(function (e) { return "<option value='" + e.id + "'>" + esc(e.short_name || e.name) + "</option>"; }).join("") + "</select></label>" +
      "<label>Tipo<select id='pdocTipo'>" + PDOC_TIPOS.map(function (t) { return "<option value='" + t[0] + "'>" + t[1] + "</option>"; }).join("") + "</select></label>" +
      "<label>N.º do documento<input id='pdocNum' placeholder='ex.: 8442523' autocomplete='off'></label>" +
      "<label>Data de<input id='pdocDe' type='date'></label><label>Data até<input id='pdocAte' type='date'></label>" +
      "<label>Valor de (€)<input id='pdocVmin' class='n' inputmode='decimal' placeholder='0,00'></label><label>Valor até (€)<input id='pdocVmax' class='n' inputmode='decimal' placeholder='0,00'></label></div>" +
      "<div class='bar' style='margin-top:8px'><button class='btn' id='pdocLimpar'>Limpar</button><button class='btn' id='pdocRecarregar'>↻ Atualizar</button><span id='pdocProg' class='mut' style='font-size:13px'></span></div></div>" +
      "<div id='pdocRes'><div class='mut'>A carregar…</div></div>";
    ["pdocEst", "pdocTipo", "pdocNum", "pdocDe", "pdocAte", "pdocVmin", "pdocVmax"].forEach(function (id) { $("#" + id).oninput = pdocMostrar; $("#" + id).onchange = pdocMostrar; });
    $("#pdocLimpar").onclick = function () { ["pdocNum", "pdocDe", "pdocAte", "pdocVmin", "pdocVmax"].forEach(function (id) { $("#" + id).value = ""; }); $("#pdocTipo").value = ""; $("#pdocEst").value = ""; pdocMostrar(); };
    $("#pdocRecarregar").onclick = function () { PDOC.lista = null; carregarPesquisaDocs(); };
  }
  try {
    if (!PDOC.lista) { $("#pdocRes").innerHTML = "<div class='mut'>A carregar…</div>"; await pdocCarregar(); }
    pdocMostrar(); pdocLerValores();
  } catch (e) { $("#pdocRes").innerHTML = "<div class='aviso'>⚠ " + esc(falhou(e)) + "</div>"; }
}
