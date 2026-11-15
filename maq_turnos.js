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
  /* Junta os pedidos feitos: o mais recente manda em cada turno de cada dia (o OCTAN AI lê M e T em separado, depois de cada fecho) */
  function porDia(pedidos) {
    var D = {};
    (pedidos || []).filter(function (p) { return p.estado === "feito" && p.dias; }).sort(function (a, b) { return a.id - b.id; })
      .forEach(function (p) { Object.keys(p.dias).forEach(function (d) { D[d] = Object.assign({}, D[d], p.dias[d]); }); });
    return D;
  }
  function addDia(d, n) { var x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
  /* Dias do mês já fechados (até ontem) sem os dois turnos lidos nem pedido em curso, em blocos de até 7 dias seguidos */
  function emFalta(mes, lidos, pendentes, hoje) {
    var falta = [], d = mes + "-01";
    for (; d.slice(0, 7) === mes && d < hoje; d = addDia(d, 1)) {
      var pend = (pendentes || []).some(function (p) { return d >= p.de && d <= p.ate; });
      if (!(lidos[d] && lidos[d].t1 && lidos[d].t2) && !pend) falta.push(d);
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
  /* Totais do mês por artigo da máquina (soma dos turnos M e T): substitui o relatório de vendas carregado à mão (dono, 14/11/2026) */
  function artigos(mes, lidos, cods) {
    var A = {};
    Object.keys(lidos).filter(function (d) { return d.slice(0, 7) === mes; }).forEach(function (d) {
      ["t1", "t2"].forEach(function (t) { ((lidos[d] || {})[t] || []).forEach(function (l) {
        var c = String(l[0]); if (!cods[c]) return;
        var x = A[c] = A[c] || {cod: c, name: l[1], qty: 0, valor_c: 0}; x.qty += +l[2] || 0; x.valor_c += Math.round((+l[3] || 0) * 100);
      }); });
    });
    return Object.keys(A).map(function (k) { return A[k]; }).filter(function (x) { return x.qty > 0; }).sort(function (a, b) { return b.qty - a.qty || a.name.localeCompare(b.name, "pt"); });
  }
  return {somar: somar, porDia: porDia, emFalta: emFalta, tabela: tabela, artigos: artigos, addDia: addDia};
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
    var AR = MAQT.artigos(mes, lidos, cods), pct = +cfg.data.maquina.margem_pct || null, dl = Object.keys(lidos).filter(function (d) { return d.slice(0, 7) === mes; }).sort();
    var per = dl.length ? dmy(dl[0]) + " a " + dmy(dl[dl.length - 1]) : nm, mg = pct ? Math.round(T.valor_c * pct / 100) : null;
    var est0 = ESTS.find(function (x) { return x.id === est; }) || {};
    MAQT.pdf = {loja: est0.short_name || est0.name || "", per: per, qty: T.qtd, valor: T.valor_c / 100, margem: mg == null ? null : mg / 100, pct: pct, linhas: AR.map(function (x) { return {name: x.name, qty: x.qty, valor: x.valor_c / 100}; })};
    var st0 = w.document.getElementById("maqStatus"), so = dl.length ? "none" : ""; L.style.display = so; if (st0) st0.style.display = so;   // com turnos lidos, o relatório carregado à mão deixa de ser preciso   // o relatório carregado à mão deixa de ser preciso
    var topo = "<div style='display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px'><b style='font-size:17px'>Máquina de tabaco · <span style='text-transform:capitalize'>" + esc(nm) + "</span></b>" +
      "<span style='margin-left:auto;display:flex;gap:6px;align-items:center'><button class='btn' id='mqtAnt'>‹</button><button class='btn' id='mqtSeg'>›</button></span></div>" +
      "<div class='notice' style='font-size:15px;line-height:1.6'><b>" + esc(per) + "</b> (" + dl.length + " dia(s) lidos)<br>" + n(T.qtd, 0) + " maços · <b>" + eur(T.valor_c) + " €</b>" + (mg != null ? " · margem " + n(pct, 2) + " % = " + eur(mg) + " €" : "") + "</div>" +
      (AR.length ? "<div style='overflow-x:auto'><table style='width:100%;border-collapse:collapse;font-size:14px;margin-top:8px'><thead><tr><th style='text-align:left;padding:6px 4px'>Artigo</th><th style='text-align:right;padding:6px 4px'>Maços</th><th style='text-align:right;padding:6px 4px'>€</th></tr></thead><tbody>" +
        AR.map(function (x) { return "<tr style='border-top:1px solid #e3e8ec'><td style='padding:5px 4px'>" + esc(x.name) + "</td><td style='text-align:right;padding:5px 4px;font-weight:600'>" + n(x.qty, 0) + "</td><td style='text-align:right;padding:5px 4px;white-space:nowrap'>" + eur(x.valor_c) + "</td></tr>"; }).join("") +
        "</tbody></table></div><div class='actions'><button class='btn' id='mqtPdf' style='flex:1'>📄 Descarregar PDF (uma folha)</button></div>" : "");
    box.innerHTML = topo + "<div style='display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:18px'><b style='font-size:17px'>Por turno</b></div>" +
      "" +
      "<p style='color:#6b7680;font-size:13px;margin:4px 0 8px'>Euros com IVA e maços de cada turno, lidos no CBOS pelo OCTAN AI sozinho depois de cada fecho (vê de hora a hora e logo depois das 14h, com o PC ligado). M = fecho 1, T = fecho 2; o OPT noturno fica de fora. Para conferir com a caixa de cada turno.</p>" +
      (pend.length ? "<div class='notice'>⏳ O OCTAN AI está a ler " + pend.length + " bloco(s) de dias no CBOS. Aparecem aqui sozinhos, com o PC ligado.</div>" : "") +
      (erro ? "<div class='notice' style='background:#fdecea'>⚠ Última leitura com erro: " + esc(erro.erro || "") + "</div>" : "") +
      (T.linhas.length ? "<div style='overflow-x:auto'><table style='width:100%;border-collapse:collapse;font-size:14px'><thead><tr><th style='text-align:left;padding:6px 4px'>Dia</th><th style='text-align:right;padding:6px 4px'>☀️ M</th><th style='text-align:right;padding:6px 4px'>🌙 T</th><th style='text-align:right;padding:6px 4px'>Dia</th></tr></thead><tbody>" +
        T.linhas.map(function (x) { return "<tr style='border-top:1px solid #e3e8ec'><td style='padding:5px 4px'>" + x.dia.slice(8) + "/" + x.dia.slice(5, 7) + "</td>" + cel(x.t1, func[x.dia + "t1"]) + cel(x.t2, func[x.dia + "t2"]) + "<td style='text-align:right;padding:5px 4px;white-space:nowrap'>" + eur(x.valor_c) + " €</td></tr>"; }).join("") +
        "</tbody><tfoot><tr style='border-top:2px solid #c9d1d8;font-weight:700'><td style='padding:6px 4px'>Total</td>" + cel(T.total.t1) + cel(T.total.t2) + "<td style='text-align:right;padding:6px 4px'>" + eur(T.valor_c) + " €<br><small style='color:#6b7680'>" + n(T.qtd, 0) + " maços</small></td></tr></tfoot></table></div>"
        : (pend.length ? "" : "<div class='notice'>Sem turnos lidos neste mês.</div>")) + (ADMIN ? "<div id='mqtEnvio' style='margin-top:18px'></div>" : "");
    if (ADMIN) maqEnvio(w, est);
    var bp = w.document.getElementById("mqtPdf"); if (bp) bp.onclick = function () { maqPdfFolha(MAQT.pdf).catch(function (e) { status(false, "⚠ PDF: " + falhou(e)); }); };
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

/* Envio da lista de cada turno por email a um colaborador (dono, 15/11/2026). Quem envia é o OCTAN AI, logo que o turno fecha. Só o administrador vê e muda. */
async function maqEnvio(w, est) {
  var box = w.document.getElementById("mqtEnvio"); if (!box) return;
  try {
    var d = await sb.from("msb_maq_destino").select("email,ativo").eq("estacao", est).maybeSingle(); if (d.error) throw d.error;
    var ev = await sb.from("msb_maq_envios").select("dia,turno,estado,erro,qtd,valor_c,enviado_em,criado").eq("estacao", est).order("dia", {ascending: false}).order("turno", {ascending: false}).limit(6); if (ev.error) throw ev.error;
    var D = d.data, E = ev.data || [], eur = function (c) { return FORMATOS.numero(c / 100, 2) + " €"; };
    var hora = function (t) { return t ? new Date(t).toLocaleString("pt-PT", {day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"}) : ""; };
    box.innerHTML = "<b style='font-size:17px'>📧 Envio por email</b>" +
      "<p style='color:#6b7680;font-size:13px;margin:4px 0 8px'>Logo que cada turno fecha, o OCTAN AI envia a lista desse turno (texto no email e PDF em anexo). O M segue pouco depois das 14h; o T à noite. Precisa do PC ligado.</p>" +
      "<div class='actions' style='gap:6px;flex-wrap:wrap'><input id='mqtEmail' type='email' placeholder='email do colaborador' value='" + esc(D ? D.email : "") + "' style='flex:1;min-width:220px'>" +
      "<button class='btn' id='mqtGuardar'>Guardar</button>" + (D ? "<button class='btn' id='mqtLigar'>" + (D.ativo ? "Desligar" : "Ligar") + "</button>" : "") + "</div>" +
      "<div class='notice'>" + (!D ? "ℹ️ Desligado: escreve o email e carrega em Guardar." : D.ativo ? "✅ Ligado: envia para <b>" + esc(D.email) + "</b>." : "⏸️ Desligado. Não envia nada.") + "</div>" +
      (E.length ? "<div style='overflow-x:auto'><table style='width:100%;border-collapse:collapse;font-size:14px'><thead><tr><th style='text-align:left;padding:6px 4px'>Turno</th><th style='text-align:right;padding:6px 4px'>Lista</th><th style='text-align:left;padding:6px 4px'>Estado</th></tr></thead><tbody>" +
        E.map(function (x) { return "<tr style='border-top:1px solid #e3e8ec'><td style='padding:5px 4px'>" + dmy(x.dia).slice(0, 5) + " " + (x.turno === "t1" ? "☀️ M" : "🌙 T") + "</td><td style='text-align:right;padding:5px 4px;white-space:nowrap'>" + (x.qtd == null ? "" : x.qtd + " maços · " + eur(x.valor_c)) + "</td><td style='padding:5px 4px'>" +
          (x.estado === "enviado" ? "✅ enviado " + hora(x.enviado_em) : x.estado === "erro" ? "❌ falhou: " + esc(x.erro || "") : "⏳ a enviar " + hora(x.criado)) + "</td></tr>"; }).join("") + "</tbody></table></div>" : "");
    w.document.getElementById("mqtGuardar").onclick = async function () {
      var v = w.document.getElementById("mqtEmail").value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return status(false, "⚠ Email inválido");
      var r = await sb.from("msb_maq_destino").upsert({estacao: est, email: v, ativo: true, atualizado_em: new Date().toISOString(), atualizado_por: (PERFIL && PERFIL.display_name) || ""});
      if (r.error) return status(false, "⚠ " + falhou(r.error));
      status(true, "✅ Envio da máquina para " + v); maqEnvio(w, est);
    };
    var bl = w.document.getElementById("mqtLigar"); if (bl) bl.onclick = async function () {
      var r = await sb.from("msb_maq_destino").update({ativo: !D.ativo, atualizado_em: new Date().toISOString(), atualizado_por: (PERFIL && PERFIL.display_name) || ""}).eq("estacao", est);
      if (r.error) return status(false, "⚠ " + falhou(r.error)); maqEnvio(w, est);
    };
  } catch (e) { box.innerHTML = "<div class='notice'>⚠ Envio por email: " + esc(falhou(e)) + "</div>"; }
}
