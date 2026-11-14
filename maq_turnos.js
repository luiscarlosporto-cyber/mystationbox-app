/* mystationbox · máquina de tabaco por turno (14/11/2026, pedido do dono, Penafiel), para a conferência das contas de cada turno.
 * Dados: pedidos «TURNOS» ao OCTAN AI, que lê no CBOS «Vendas por período → Turno por Intervalo» o tabaco de cada fecho:
 * 1 = M (t1), 2 = T (t2); o 3 é o OPT noturno e fica de fora (dono). Resposta em msb_pedidos.dias = {dia: {t1: linhas, t2: linhas}},
 * linhas = [código, artigo, quantidade, euros com IVA]. Os artigos da máquina são os mesmos do relatório do mês (regra do módulo de stock). */
"use strict";
var MAQT = (function () {
  /* Maços e euros da máquina numa lista de linhas do CBOS */
  function somar(linhas, cods) {
    var q = 0, v = 0;
    (linhas || []).forEach(function (l) { if (cods[String(l[0])]) { q += +l[2] || 0; v += Math.round((+l[3] || 0) * 100); } });
    return {qtd: Math.round(q * 100) / 100, valor_c: v};
  }
  /* Junta os pedidos feitos: o mais recente manda em cada dia */
  function porDia(pedidos) {
    var D = {};
    (pedidos || []).filter(function (p) { return p.estado === "feito" && p.dias; }).sort(function (a, b) { return a.id - b.id; })
      .forEach(function (p) { Object.keys(p.dias).forEach(function (d) { D[d] = p.dias[d]; }); });
    return D;
  }
  function addDia(d, n) { var x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
  /* Dias do mês já fechados (até ontem) sem leitura nem pedido em curso, em blocos de até 7 dias seguidos */
  function emFalta(mes, lidos, pendentes, hoje) {
    var falta = [], d = mes + "-01";
    for (; d.slice(0, 7) === mes && d < hoje; d = addDia(d, 1)) {
      var pend = (pendentes || []).some(function (p) { return d >= p.de && d <= p.ate; });
      if (!lidos[d] && !pend) falta.push(d);
    }
    var blocos = [];
    falta.forEach(function (d) { var b = blocos[blocos.length - 1]; if (b && addDia(b.ate, 1) === d && b.n < 7) { b.ate = d; b.n++; } else blocos.push({de: d, ate: d, n: 1}); });
    return blocos.map(function (b) { return {de: b.de, ate: b.ate}; });
  }
  /* Linhas da tabela: dia, M, T e o total do dia */
  function tabela(mes, lidos, cods) {
    var L = [], tot = {t1: {qtd: 0, valor_c: 0}, t2: {qtd: 0, valor_c: 0}};
    Object.keys(lidos).filter(function (d) { return d.slice(0, 7) === mes; }).sort().forEach(function (d) {
      var t1 = somar(lidos[d].t1, cods), t2 = somar(lidos[d].t2, cods);
      ["t1", "t2"].forEach(function (t) { var x = t === "t1" ? t1 : t2; tot[t].qtd += x.qtd; tot[t].valor_c += x.valor_c; });
      L.push({dia: d, t1: t1, t2: t2, valor_c: t1.valor_c + t2.valor_c, qtd: t1.qtd + t2.qtd});
    });
    return {linhas: L, total: tot, valor_c: tot.t1.valor_c + tot.t2.valor_c, qtd: tot.t1.qtd + tot.t2.qtd};
  }
  return {somar: somar, porDia: porDia, emFalta: emFalta, tabela: tabela, addDia: addDia};
})();
if (typeof module !== "undefined") module.exports = MAQT;

/* ——— ecrã (dentro da página da máquina de tabaco, debaixo do relatório do mês) ——— */
var MAQT_MES = null;
async function maqCodigos(w) {
  /* A mesma regra do relatório do mês (módulo de stock): categorias da máquina, catálogo e artigos, menos os vendidos ao balcão */
  return w.eval("(async () => { const r = await regraMaquina(); if (!r) { const c = {}; products.filter(p => p.maquina && p.repsol_code).forEach(p => c[p.repsol_code] = 1); return c; }" +
    " const cats = new Set(r.categorias), fora = new Set(r.fora || []), c = {}; for (const [k, v] of Object.entries(r.catalogo || {})) if (cats.has(v[1]) && !fora.has(k)) c[k] = 1;" +
    " for (const p of products) if (p.repsol_code && cats.has(p.category) && !fora.has(p.repsol_code)) c[p.repsol_code] = 1; return c; })()");
}
async function maqTurnos(w) {
  if (typeof w === "undefined" || !w || !w.document) return;
  var L = w.document.getElementById("maqList"); if (!L) return;
  var box = w.document.getElementById("msbMaqTurnos");
  if (!box) { box = w.document.createElement("div"); box.id = "msbMaqTurnos"; box.style.marginTop = "18px"; L.parentNode.insertBefore(box, L.nextSibling); }
  var est = EST, cfg = await sb.from("msb_config").select("maquina").eq("estacao", est).maybeSingle();
  if (!cfg.data || !cfg.data.maquina) { box.innerHTML = ""; return; }
  var mes = MAQT_MES || MES, hoje = new Date().toISOString().slice(0, 10), fim = MAQT.addDia(MAQT.addDia(mes + "-28", 7).slice(0, 7) + "-01", -1);
  box.innerHTML = "<div class='notice'>A carregar a máquina por turno…</div>";
  try {
    var cods = await maqCodigos(w);
    for (var k = 0; k < 5 && !Object.keys(cods || {}).length; k++) { await new Promise(function (ok) { setTimeout(ok, 2000); }); cods = await maqCodigos(w); }   // o módulo de stock ainda a carregar a regra
    if (!Object.keys(cods || {}).length) throw new Error("ainda não sei que artigos são da máquina. Abre de novo esta página daqui a pouco.");
    var r = await sb.from("msb_pedidos").select("id,de,ate,estado,dias,erro").eq("estacao", est).eq("pasta", "TURNOS").lte("de", fim).gte("ate", mes + "-01").order("id");
    if (r.error) throw r.error;
    var P = r.data || [], lidos = MAQT.porDia(P), pend = P.filter(function (p) { return p.estado === "pendente" || p.estado === "a_ler"; });
    var falta = MAQT.emFalta(mes, lidos, pend, hoje);
    if (falta.length && ADMIN) {   // pede sozinho os dias já fechados que faltam; o OCTAN AI lê com o PC ligado
      var ins = await sb.from("msb_pedidos").insert(falta.map(function (b) { return {estacao: est, de: b.de, ate: b.ate, pasta: "TURNOS", artigo: "", pedido_por: (PERFIL && PERFIL.display_name) || ""}; }));
      if (ins.error) throw ins.error;
      pend = pend.concat(falta);
    }
    var tr = await sb.from("msb_turnos").select("dia,turno,func").eq("estacao", est).gte("dia", mes + "-01").lte("dia", fim);
    var func = {}; (tr.data || []).forEach(function (t) { func[t.dia + t.turno] = t.func || ""; });
    var T = MAQT.tabela(mes, lidos, cods), n = function (v, c) { return FORMATOS.numero(v, c); }, eur = function (c) { return n(c / 100, 2); };
    var nm = new Date(mes + "-15").toLocaleDateString("pt-PT", {month: "long", year: "numeric"}), erro = P.filter(function (p) { return p.estado === "erro"; }).pop();
    var cel = function (x, f) { return "<td style='text-align:right;padding:5px 4px;white-space:nowrap'>" + (x.qtd ? "<b>" + eur(x.valor_c) + " €</b><br><small style='color:#6b7680'>" + n(x.qtd, 0) + " maços" + (f ? " · " + esc(f) : "") + "</small>" : "<span style='color:#9aa4ad'>—</span>" + (f ? "<br><small style='color:#6b7680'>" + esc(f) + "</small>" : "")) + "</td>"; };
    box.innerHTML = "<div style='display:flex;align-items:center;gap:8px;flex-wrap:wrap'><b style='font-size:17px'>Máquina de tabaco por turno</b>" +
      "<span style='margin-left:auto;display:flex;gap:6px;align-items:center'><button class='btn' id='mqtAnt'>‹</button><b style='text-transform:capitalize'>" + esc(nm) + "</b><button class='btn' id='mqtSeg'>›</button></span></div>" +
      "<p style='color:#6b7680;font-size:13px;margin:4px 0 8px'>Euros com IVA e maços de cada turno, lidos no CBOS pelo OCTAN AI (M = fecho 1, T = fecho 2; o OPT noturno fica de fora). Para conferir com a caixa de cada turno.</p>" +
      (pend.length ? "<div class='notice'>⏳ O OCTAN AI está a ler " + pend.length + " bloco(s) de dias no CBOS. Aparecem aqui sozinhos, com o PC ligado.</div>" : "") +
      (erro ? "<div class='notice' style='background:#fdecea'>⚠ Última leitura com erro: " + esc(erro.erro || "") + "</div>" : "") +
      (T.linhas.length ? "<div style='overflow-x:auto'><table style='width:100%;border-collapse:collapse;font-size:14px'><thead><tr><th style='text-align:left;padding:6px 4px'>Dia</th><th style='text-align:right;padding:6px 4px'>☀️ M</th><th style='text-align:right;padding:6px 4px'>🌙 T</th><th style='text-align:right;padding:6px 4px'>Dia</th></tr></thead><tbody>" +
        T.linhas.map(function (x) { return "<tr style='border-top:1px solid #e3e8ec'><td style='padding:5px 4px'>" + x.dia.slice(8) + "/" + x.dia.slice(5, 7) + "</td>" + cel(x.t1, func[x.dia + "t1"]) + cel(x.t2, func[x.dia + "t2"]) + "<td style='text-align:right;padding:5px 4px;white-space:nowrap'>" + eur(x.valor_c) + " €</td></tr>"; }).join("") +
        "</tbody><tfoot><tr style='border-top:2px solid #c9d1d8;font-weight:700'><td style='padding:6px 4px'>Total</td>" + cel(T.total.t1) + cel(T.total.t2) + "<td style='text-align:right;padding:6px 4px'>" + eur(T.valor_c) + " €<br><small style='color:#6b7680'>" + n(T.qtd, 0) + " maços</small></td></tr></tfoot></table></div>"
        : (pend.length ? "" : "<div class='notice'>Sem turnos lidos neste mês.</div>"));
    w.document.getElementById("mqtAnt").onclick = function () { MAQT_MES = MAQT.addDia(mes + "-01", -1).slice(0, 7); maqTurnos(w); };
    w.document.getElementById("mqtSeg").onclick = function () { MAQT_MES = MAQT.addDia(mes + "-28", 7).slice(0, 7); maqTurnos(w); };
    clearTimeout(maqTurnos.t);
    if (pend.length) maqTurnos.t = setTimeout(function () { if (PAGINA === "maq" && est === EST) maqTurnos(w); }, 60000);
  } catch (e) { box.innerHTML = "<div class='notice'>⚠ Máquina por turno: " + esc(falhou(e)) + "</div>"; }
}
async function maqTurnosAuto() {
  var est = EST;
  try {
    var w = await esperarNex(function (w) { try { return w.document.getElementById("maqList") && w.eval("typeof regraMaquina === 'function' && typeof company !== 'undefined' && !!company && products.length > 0"); } catch (e) { return false; } }, 45000);
    if (PAGINA === "maq" && est === EST) await maqTurnos(w);
  } catch (e) { /* o módulo de stock não abriu: o relatório do mês já avisa */ }
}
