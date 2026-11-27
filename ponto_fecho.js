/* mystationbox · Ponto Digital, fecho do mês (dono, 26/11/2026). Só administrador.
 * Pré-validação automática pelo horário (PONTO.preValidar): cada dia que bate certo fica «Pré-validado pelo horário»,
 * os outros ficam com a mensagem do que difere. Horas que contam: por defeito as do horário; o administrador escolhe
 * «picadas» dia a dia. Horas extra: escritas pelo administrador por colaborador (o tempo a mais calculado é referência).
 * Validar o mês (só o administrador) grava a fotografia do resumo e fecha o mês; o PDF para a contabilidade tem
 * horas normais, horas em feriado (pagas de outra forma, dono 27/11/2026), horas extra, total e faltas por baixa (código B).
 * Normais, feriado e extra vêm pré-preenchidas pelo horário (PONTO.resumoFecho + previstasMes) e o administrador pode
 * corrigir cada uma (msb_ponto_fecho_horas_gravar; vazio = vale o calculado). */
"use strict";
var PTF = {mes: null, est: null, d: null, aberto: {}};
var PTF_EMPRESA = {sto: "Porto João & Nunes, Lda.", pnf: "Porto & Nunes, Lda."};
var PTF_MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function ptfDescarregar(blob, nome) { var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000); }
function ptfMesTxt(m) { var p = m.split("-"); return PTF_MESES[+p[1] - 1] + " de " + p[0]; }
function ptfMesAnterior() { var h = ptgHoje().slice(0, 7).split("-"), a = +h[0], m = +h[1] - 1; if (!m) { m = 12; a--; } return a + "-" + String(m).padStart(2, "0"); }
/* mês que abre por defeito (dono, 27/11/2026): o mês atual; só nos primeiros 10 dias abre o anterior, que é o que está a fechar */
function ptfMesDefeito() { var h = ptgHoje(); return +h.slice(8, 10) <= 10 ? ptfMesAnterior() : h.slice(0, 7); }
function ptfUltimoDia(m) { var p = m.split("-"); return m + "-" + String(new Date(Date.UTC(+p[0], +p[1], 0)).getUTCDate()).padStart(2, "0"); }
function ptfNomeEst(e) { return (window.AVARIAS && AVARIAS.ESTACAO_NOME[e]) || ptgNomeEst(e); }

async function carregarPtf() {
  var box = $("#ptfCorpo"); if (!box) return;
  if (!ADMIN || window.GESTOR) { box.innerHTML = "<div class='card' style='padding:14px'>Só o administrador faz o fecho do mês.</div>"; return; }
  if (!PTF.mes) PTF.mes = ptfMesDefeito();
  if (!PTF.est) PTF.est = EST;
  var mes = PTF.mes, est = PTF.est, de = mes + "-01", ate = ptfUltimoDia(mes);
  box.innerHTML = "<div class='mut'>A preparar o fecho…</div>";
  try {
    var q = await Promise.all([
      sb.from("msb_colaboradores").select("id,nome,curto,ativo"),
      sb.from("msb_colab_lojas").select("colaborador_id,estacao,desde,ate").eq("estacao", est),
      lerTudo(function () { return sb.from("msb_horario_dias").select("dia,colaborador_id,codigo").eq("estacao", est).gte("dia", de).lte("dia", ate); }, ["dia", "colaborador_id"]),
      sb.from("msb_ponto_horas").select("codigo,parte,inicio,fim").eq("estacao", est),
      sb.from("msb_ponto_locais").select("*").eq("estacao", est).maybeSingle(),
      lerTudo(function () { return sb.from("msb_ponto_registos").select("id,colaborador_id,dia,tipo,hora,estado,anulado_por").eq("estacao", est).eq("teste", false).gte("dia", de).lte("dia", ate); }, ["id"]),
      sb.from("msb_ponto_registos").select("dia").eq("estacao", est).eq("teste", false).eq("estado", "aceite").order("dia").limit(1),
      sb.from("msb_ponto_fechos").select("*").eq("estacao", est).eq("mes", mes).maybeSingle(),
      sb.from("msb_ponto_fecho_dias").select("dia,colaborador_id,contar").eq("estacao", est).gte("dia", de).lte("dia", ate),
      sb.from("msb_ponto_fecho_extra").select("colaborador_id,extra_min,normais_min,feriado_min,nota").eq("estacao", est).eq("mes", mes)
    ]);
    q.slice(0, 7).forEach(function (r) { if (r.error) throw r.error; });
    var semTabelas = q.slice(7).some(function (r) { return r.error; });
    var D = {mes: mes, est: est, de: de, ate: ate, hoje: ptgHoje(), semTabelas: semTabelas, colabs: {}, fecho: semTabelas ? null : q[7].data, cont: {}, extra: {}, linhas: []};
    (q[0].data || []).forEach(function (c) { D.colabs[c.id] = c; });
    if (!semTabelas) { (q[8].data || []).forEach(function (x) { D.cont[x.dia + "|" + x.colaborador_id] = x.contar; }); (q[9].data || []).forEach(function (x) { D.extra[x.colaborador_id] = x; }); }
    var horas = {}; (q[3].data || []).forEach(function (h) { (horas[h.codigo] = horas[h.codigo] || []).push({inicio: ptgMinHora(h.inicio), fim: ptgMinHora(h.fim)}); });
    var hor = {}, ids = {}; (q[2].data || []).forEach(function (h) { hor[h.dia + "|" + h.colaborador_id] = h.codigo; ids[h.colaborador_id] = 1; });
    (q[1].data || []).forEach(function (l) { if ((!l.ate || l.ate >= de) && (!l.desde || l.desde <= ate)) ids[l.colaborador_id] = 1; });
    var reg = {}; (q[5].data || []).forEach(function (r) { if (!r.colaborador_id) return; ids[r.colaborador_id] = 1; (reg[r.dia + "|" + r.colaborador_id] = reg[r.dia + "|" + r.colaborador_id] || []).push(r); });
    var inicio = q[6].data && q[6].data[0] ? q[6].data[0].dia : null, cfg = q[4].data || {};
    D.inicio = inicio; D.fer = PONTO.feriados(+mes.slice(0, 4), est);
    Object.keys(ids).forEach(function (cid) {
      var c = D.colabs[cid] || {}, dias = [];
      ptgDias(de, ate).forEach(function (dia) {
        var cod = hor[dia + "|" + cid] || "", partes = horas[cod] || [], L = reg[dia + "|" + cid] || [];
        if (!partes.length && !L.length && cod !== "B") return;   // folgas, férias e dias sem turno nem picagens não entram
        var futuro = dia > D.hoje, semPonto = !inicio || dia < inicio || futuro;
        var R = PONTO.dia(L.map(function (r) { return {tipo: r.tipo, min: ptoMin(r.hora), estado: r.estado, anulado_por: r.anulado_por}; }), partes, cfg, dia === D.hoje ? ptoMin(new Date().toISOString()) : null);
        var x = {dia: dia, codigo: cod, partes: partes, R: R, semPonto: semPonto, futuro: futuro, contar: D.cont[dia + "|" + cid] || "horario"};
        x.pv = PONTO.preValidar(R, partes, cod, semPonto); dias.push(x);
      });
      if (!dias.length && !Object.keys(hor).some(function (k) { return k.split("|")[1] === cid && /^(F|MDF)$/.test(hor[k]); })) return;
      // pré-preenchido pelo horário; o que o administrador escreveu (não vazio) substitui o calculado
      var ex = D.extra[cid] || {}, cods = {};
      ptgDias(de, ate).forEach(function (dia) { if (hor[dia + "|" + cid]) cods[dia] = hor[dia + "|" + cid]; });
      var r = PONTO.resumoFecho(dias, null, D.fer, PONTO.previstasMes(mes, cods));
      var auto = {normais: r.normais, feriado: r.feriado, extra: r.extra};
      var f = {normais: ex.normais_min != null ? ex.normais_min : auto.normais, feriado: ex.feriado_min != null ? ex.feriado_min : auto.feriado, extra: ex.extra_min != null ? ex.extra_min : auto.extra};
      D.linhas.push({cid: +cid, nome: c.nome || c.curto || "?", dias: dias, nota: ex.nota || "", r: r, auto: auto, f: f, total: f.normais + f.feriado + f.extra, ferias: PONTO.feriasUteis(mes, cods),
        mudou: {normais: ex.normais_min != null, feriado: ex.feriado_min != null, extra: ex.extra_min != null}});
    });
    D.linhas.sort(function (a, b) { return a.nome.localeCompare(b.nome, "pt"); });
    if (mes !== PTF.mes || est !== PTF.est) return;
    PTF.d = D; ptfDesenhar();
  } catch (e) { box.innerHTML = "<div class='card msgErr' style='padding:12px'>✖ " + esc(falhouPto(e)) + "</div>"; }
}

function ptfDesenhar() {
  var D = PTF.d, box = $("#ptfCorpo"); if (!box || !D) return;
  var val = D.fecho && D.fecho.estado === "validado", terminou = D.mes < D.hoje.slice(0, 7), sel = D.mes;
  var T = D.linhas.reduce(function (t, l) { t.pre += l.dias.filter(function (d) { return d.pv.pre; }).length; t.msg += l.r.msg; t.contar += l.total; t.pic += l.r.picadas; t.extra += l.f.extra; t.baixa += l.r.baixa; t.normais += l.f.normais; t.feriado += l.f.feriado; t.ferias += l.ferias; return t; }, {pre: 0, msg: 0, contar: 0, pic: 0, extra: 0, baixa: 0, normais: 0, feriado: 0, ferias: 0});
  var ferMes = Object.keys(D.fer).filter(function (d) { return d.slice(0, 7) === D.mes; }).sort();
  var ini = (function () { var h = D.hoje.slice(0, 7).split("-"), a0 = +h[0] - 1, m0 = +h[1] + 1; if (m0 > 12) { m0 = 1; a0++; } return a0 + "-" + String(m0).padStart(2, "0"); })();   // últimos 12 meses (dono, 27/11/2026: «não vejo outros meses»)
  var meses = []; for (var m = ini; m <= D.hoje.slice(0, 7); ) { meses.push(m); var p = m.split("-"), a = +p[0], mm = +p[1] + 1; if (mm > 12) { mm = 1; a++; } m = a + "-" + String(mm).padStart(2, "0"); }
  if (meses.indexOf(sel) < 0) meses.unshift(sel);
  meses.reverse();   // o mais recente primeiro
  var estado = val ? "<span class='chip ptf-val'>✔ Validado pela administração · " + esc(D.fecho.validado_nome || "") + " · " + new Date(D.fecho.validado_em).toLocaleDateString("pt-PT", {timeZone: "Europe/Lisbon"}) + "</span>"
    : terminou ? "<span class='chip ptf-esp'>⏳ À espera da sua validação</span>" : "<span class='chip ptf-esp'>🕒 Mês em curso · valida-se a partir do dia 1</span>";
  var h = (D.semTabelas ? "<div class='card msgErr' style='padding:12px'>⚠ O fecho do mês ainda não está ativo na base de dados: pode ver a pré-validação, mas ainda não grava escolhas nem valida.</div>" : "") +
    "<div class='card' style='padding:16px 18px'><div style='display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start'><div><h2 style='margin:0'>Fecho de " + esc(ptfMesTxt(D.mes)) + "</h2><div class='mut'>Ponto Digital · " + esc(ptfNomeEst(D.est)) + "</div></div>" + estado + "</div>" +
    "<div class='ptf-passos'><span class='ok'>✔ Pré-validado automaticamente pelo horário</span><span>›</span><span class='" + (val ? "ok" : "at") + "'>" + (val ? "✔ " : "") + "Validar pela administração</span><span>›</span><span class='" + (val ? "ok" : "") + "'>Fechado + PDF</span></div>" +
    "<div class='ptg-filtros' style='margin-top:10px'><label>Mês<select id='ptfMes'>" + meses.map(function (x) { return "<option value='" + x + "'" + (x === sel ? " selected" : "") + ">" + esc(ptfMesTxt(x)) + "</option>"; }).join("") + "</select></label>" +
    "<label>Estação<select id='ptfEst'>" + (ESTS || []).map(function (e) { return "<option value='" + e.id + "'" + (e.id === D.est ? " selected" : "") + ">" + esc(e.short_name || e.name) + "</option>"; }).join("") + "</select></label></div>" +
    (D.inicio && D.inicio > D.de ? "<p class='mut' style='margin:8px 0 0'>O Ponto Digital começou nesta estação a " + ptgDataPT(D.inicio) + "/" + D.inicio.slice(0, 4) + ": os dias anteriores contam pelo horário.</p>" : "") + "</div>";
  h += "<div class='ptf-tiles'><div><small>Colaboradores</small><b>" + D.linhas.length + "</b></div><div><small>Dias pré-validados pelo horário</small><b>" + T.pre + "</b></div><div><small>Dias com mensagem</small><b style='color:#92400E'>" + T.msg + "</b></div>" +
    "<div><small>Horas normais</small><b>" + PONTO.hhmm(T.normais) + "</b></div><div><small>Horas em feriado</small><b>" + PONTO.hhmm(T.feriado) + "</b></div><div><small>Horas extra</small><b>" + PONTO.hhmm(T.extra) + "</b></div><div><small>Férias gozadas (dias úteis)</small><b>" + ptfDias(T.ferias) + "</b></div><div><small>Faltas por baixa</small><b>" + T.baixa + (T.baixa === 1 ? " dia" : " dias") + "</b></div></div>" +
    "<p class='mut' style='margin:-4px 2px 0;font-size:13px'>🎉 Feriados de " + esc(ptfMesTxt(D.mes)) + ": " + (ferMes.length ? ferMes.map(function (d) { return ptgDataPT(d) + " " + esc(D.fer[d]); }).join(" · ") : "nenhum") + ". Total: " + PONTO.hhmm(T.contar) + " (normais + feriado + extra). Os três valores vêm pré-preenchidos pelo horário e pode corrigi-los.</p>";
  h += "<div class='card' style='padding:14px 16px'><h3 style='margin:0 0 6px'>Resumo por colaborador</h3>" + (D.linhas.length ? D.linhas.map(function (l) {
    var ab = !!PTF.aberto[l.cid], r = l.r;
    return "<div class='ptf-col'><button class='ptf-cab' data-ab='" + l.cid + "' aria-expanded='" + ab + "'><b>" + (ab ? "▾ " : "▸ ") + esc(l.nome) + "</b>" +
      "<span>" + r.dias + " dias · horário " + PONTO.hhmm(r.horario) + " · picadas " + PONTO.hhmm(r.picadas) + "</span>" +
      "<span class='chip " + (r.msg ? "ptf-msg'>💬 " + r.msg + (r.msg === 1 ? " dia com mensagem" : " dias com mensagem") : "ptf-pre'>✅ Tudo pré-validado") + "</span></button>" +
      "<div class='ptf-num'>" + ptfCampo(l, "normais", "Horas normais", val) +
      ptfCampo(l, "feriado", "Horas em feriado", val, r.feriado_dias.length ? "🎉 " + r.feriado_dias.map(ptgDataPT).join(", ") : "") +
      ptfCampo(l, "extra", "Horas extra", val, "tempo a mais picado: " + PONTO.hhmm(r.tempo_mais)) +
      "<div><small>Total</small><b>" + PONTO.hhmm(l.total) + "</b>" + (l.total !== r.contar ? "<small style='color:#92400E'>⚠ horas trabalhadas: " + PONTO.hhmm(r.contar) + "</small>" : "") + "</div>" +
      "<div><small>Férias gozadas</small><b>" + ptfDias(l.ferias) + "</b><small>dias úteis</small></div>" +
      "<div><small>Faltas por baixa</small><b>" + r.baixa + "</b></div></div>" +
      (ab ? "<div class='sc'><table class='t ptf-dias'><thead><tr><th class='l'>Dia</th><th>Turno</th><th>Entrada</th><th>Saída</th><th class='l'>Pré-validação</th><th class='l'>Contar</th></tr></thead><tbody>" + l.dias.map(function (d) {
        var hH = PONTO.horasHorario(d.partes), P = d.R.pares;
        var pv = d.futuro ? "<span class='chip ptf-esp'>🕒 Ainda não chegou</span>" : d.dia === D.hoje ? "<span class='chip ptf-esp'>🕒 Hoje, ainda a decorrer</span>" : d.pv.semPonto ? "<span class='chip ptf-pre'>📅 Pelo horário (sem Ponto Digital)</span>" : d.codigo === "B" && !P.length ? "<span class='chip ptf-baixa'>Baixa</span>" :
          d.pv.pre ? "<span class='chip ptf-pre'>✅ Pré-validado pelo horário</span>" : "<span class='chip ptf-msg'>💬 " + esc(d.pv.msg) + "</span>";
        var cont = d.codigo === "B" && !P.length ? "<span class='mut'>—</span>" : "<div class='ptf-cont'><button data-ct='horario' data-d='" + d.dia + "' data-c='" + l.cid + "'" + (d.contar !== "picadas" ? " class='on'" : "") + (val || D.semTabelas ? " disabled" : "") + ">Horário " + PONTO.hhmm(hH) + "</button>" +
          "<button data-ct='picadas' data-d='" + d.dia + "' data-c='" + l.cid + "'" + (d.contar === "picadas" ? " class='on'" : "") + (val || D.semTabelas || d.semPonto ? " disabled" : "") + ">Picadas " + (P.length ? PONTO.hhmm(d.R.trabalhado) : "—") + "</button></div>";
        return "<tr><td class='l'>" + ptgSemana(d.dia) + " " + ptgDataPT(d.dia) + (D.fer[d.dia] ? " <span class='chip ptf-esp' title='" + esc(D.fer[d.dia]) + "'>🎉 Feriado</span>" : "") + "</td><td>" + esc(d.codigo || "—") + "</td><td>" + (P.length ? P.map(function (p) { return PONTO.hm(p.e); }).join("<br>") : "—") + "</td><td>" + (P.length ? P.map(function (p) { return p.s == null ? "—" : PONTO.hm(p.s); }).join("<br>") : "—") + "</td><td class='l'>" + pv + "</td><td class='l'>" + cont + "</td></tr>";
      }).join("") + "</tbody></table></div>" : "") + "</div>";
  }).join("") : "<p class='mut' style='margin:0'>Sem colaboradores com turnos ou picagens neste mês.</p>") + "</div>";
  h += "<div class='card' style='padding:14px 16px'><div class='ptf-fim'>" +
    (val ? "<button class='btn' id='ptfReabrir'>Reabrir o mês</button>" : "<button class='btn p' id='ptfValidar'" + (!terminou || D.semTabelas || !D.linhas.length ? " disabled" : "") + ">✅ Validar o mês (" + D.linhas.length + " colaboradores · " + PONTO.hhmm(T.contar) + " h)</button>") +
    "<button class='btn' id='ptfPdf'>⬇ PDF para a contabilidade</button></div>" +
    "<p class='mut' style='margin:8px 0 0;font-size:13px'>" + (val ? "Mês fechado: as picagens, as escolhas e as horas extra já não se alteram. Para mudar, reabra com motivo (fica registado)." + (D.fecho.reaberto_motivo ? " Já foi reaberto antes: «" + esc(D.fecho.reaberto_motivo) + "»." : "")
      : "Só o administrador valida. Ao validar, cada dia fica «Validado pela administração» e o mês fecha." + (terminou ? "" : " Este mês ainda está a decorrer.") + " O PDF antes de validar sai marcado como rascunho.") + "</p></div>";
  box.innerHTML = h;
  $("#ptfMes").onchange = function () { PTF.mes = this.value; carregarPtf(); };
  $("#ptfEst").onchange = function () { PTF.est = this.value; PTF.aberto = {}; carregarPtf(); };
  box.querySelectorAll("[data-ab]").forEach(function (b) { b.onclick = function () { PTF.aberto[b.dataset.ab] = !PTF.aberto[b.dataset.ab]; ptfDesenhar(); }; });
  box.querySelectorAll("[data-ct]").forEach(function (b) { b.onclick = async function () {
    if (b.classList.contains("on")) return;
    b.disabled = true;
    var r = await sb.rpc("msb_ponto_fecho_dia", {p_estacao: D.est, p_dia: b.dataset.d, p_colaborador: +b.dataset.c, p_contar: b.dataset.ct});
    if (r.error) { b.disabled = false; msbConfirma("✖ " + falhouPto(r.error), "OK"); return; }
    carregarPtf();
  }; });
  var gravar = async function (el, campo, cid, v) {
    el.disabled = true;
    var r = await sb.rpc("msb_ponto_fecho_horas_gravar", {p_estacao: D.est, p_mes: D.mes, p_colaborador: cid, p_campo: campo, p_min: v});
    if (r.error) { el.disabled = false; el.classList.add("bad"); msbConfirma("✖ " + falhouPto(r.error), "OK"); return; }
    carregarPtf();
  };
  box.querySelectorAll("[data-hc]").forEach(function (inp) { inp.onchange = function () {
    var v = PONTO.lerHHMM(inp.value); if (v == null) { inp.classList.add("bad"); return; }
    inp.classList.remove("bad");
    var l = D.linhas.find(function (x) { return x.cid === +inp.dataset.c; });
    gravar(inp, inp.dataset.hc, +inp.dataset.c, l && v === l.auto[inp.dataset.hc] ? null : v);   // igual ao calculado = volta ao automático
  }; });
  box.querySelectorAll("[data-rep]").forEach(function (b) { b.onclick = function () { gravar(b, b.dataset.rep, +b.dataset.c, null); }; });
  if ($("#ptfValidar")) $("#ptfValidar").onclick = ptfValidar;
  if ($("#ptfReabrir")) $("#ptfReabrir").onclick = ptfReabrir;
  $("#ptfPdf").onclick = ptfPdf;
}

function ptfDias(n) { return String(n).replace(".", ",") + (n === 1 ? " dia" : " dias"); }
/* um dos três valores: pré-preenchido pelo horário, editável enquanto o mês não está validado */
function ptfCampo(l, campo, rot, val, nota) {
  var D = PTF.d, v = l.f[campo], m = l.mudou[campo];
  var dica = m ? "<small style='color:#92400E'>✎ alterado · pelo horário: " + PONTO.hhmm(l.auto[campo]) + (val || D.semTabelas ? "" : " <button class='mini' data-rep='" + campo + "' data-c='" + l.cid + "' title='Voltar ao valor do horário'>↺</button>") + "</small>"
    : "<small>pelo horário</small>";
  return "<div><small>" + rot + "</small>" + (val || D.semTabelas ? "<b>" + PONTO.hhmm(v) + "</b>" : "<input class='ptf-ex' data-hc='" + campo + "' data-c='" + l.cid + "' value='" + PONTO.hhmm(v) + "' inputmode='numeric' aria-label='" + esc(rot) + " de " + esc(l.nome) + " (horas:minutos)'>") +
    dica + (nota ? "<small>" + esc(nota) + "</small>" : "") + "</div>";
}

function ptfResumo() {
  return PTF.d.linhas.map(function (l) { return {colaborador_id: l.cid, nome: l.nome, trabalhado_min: l.total, normais_min: l.f.normais, feriado_min: l.f.feriado, feriado_dias: l.r.feriado_dias, extra_min: l.f.extra,
    horas_horario: l.auto, alterado: l.mudou, ferias_dias: l.ferias, baixa_dias: l.r.baixa, dias_msg: l.r.msg, horario_min: l.r.horario, picadas_min: l.r.picadas}; });
}
async function ptfValidar() {
  var D = PTF.d, R = ptfResumo(), b = $("#ptfValidar");
  var msg = D.linhas.reduce(function (t, l) { return t + l.r.msg; }, 0);
  if (!await msbConfirma("Validar o fecho de " + ptfMesTxt(D.mes) + " em " + ptfNomeEst(D.est) + "?\n" + R.length + " colaboradores · " + PONTO.hhmm(R.reduce(function (t, x) { return t + x.trabalhado_min; }, 0)) + " h trabalhadas (das quais " + PONTO.hhmm(R.reduce(function (t, x) { return t + x.feriado_min; }, 0)) + " em feriado) · " +
    PONTO.hhmm(R.reduce(function (t, x) { return t + x.extra_min; }, 0)) + " h extra" + (msg ? "\n" + msg + " dias com mensagem contam como escolheu (por defeito, as horas do horário)." : "") + "\nO mês fica fechado.", "Validar o mês")) return;
  b.disabled = true;
  var r = await sb.rpc("msb_ponto_fecho_validar", {p_estacao: D.est, p_mes: D.mes, p_resumo: R});
  if (r.error) { b.disabled = false; msbConfirma("✖ " + falhouPto(r.error), "OK"); return; }
  await carregarPtf();
}
async function ptfReabrir() {
  var D = PTF.d, m = window.prompt("Motivo para reabrir o fecho de " + ptfMesTxt(D.mes) + " (fica registado):", "");
  if (m == null) return;
  var r = await sb.rpc("msb_ponto_fecho_reabrir", {p_estacao: D.est, p_mes: D.mes, p_motivo: m});
  if (r.error) { msbConfirma("✖ " + falhouPto(r.error), "OK"); return; }
  await carregarPtf();
}

/* PDF para a contabilidade: uma folha A4 com horas normais, em feriado, extra, total e faltas por baixa */
async function ptfPdf() {
  var D = PTF.d, val = D.fecho && D.fecho.estado === "validado", R = val && Array.isArray(D.fecho.resumo) ? D.fecho.resumo : ptfResumo();
  await carregarPdfLib();
  var P = window.PDFLib, doc = await P.PDFDocument.create(), F = await doc.embedFont(P.StandardFonts.Helvetica), B = await doc.embedFont(P.StandardFonts.HelveticaBold);
  var pg = doc.addPage([595.28, 841.89]), W = 595.28, x0 = 46, x1 = W - 46, y = 790;
  var az = P.rgb(0.043, 0.239, 0.569), cinz = P.rgb(0.39, 0.45, 0.55), preto = P.rgb(0.08, 0.13, 0.24), fundo = P.rgb(0.957, 0.969, 0.984);
  var safe = function (t) { return String(t).replace(/[^\x20-\x7E\xA0-\xFF–—‘’“”•…€]/g, "?"); };
  var txt = function (t, x, s, f, c) { pg.drawText(safe(t), {x: x, y: y, size: s, font: f || F, color: c || preto}); };
  var dir = function (t, xr, s, f, c) { t = safe(t); pg.drawText(t, {x: xr - (f || F).widthOfTextAtSize(t, s), y: y, size: s, font: f || F, color: c || preto}); };
  txt("Mapa de horas · " + ptfMesTxt(D.mes), x0, 19, B, az);
  dir("mystationbox", x1, 13, B, az); y -= 18;
  txt(PTF_EMPRESA[D.est] || "", x0, 11, B); dir("Emitido em " + new Date().toLocaleDateString("pt-PT", {timeZone: "Europe/Lisbon"}), x1, 9, F, cinz); y -= 14;
  txt(ptfNomeEst(D.est), x0, 10.5); y -= 10;
  pg.drawRectangle({x: x0, y: y, width: x1 - x0, height: 2.5, color: az}); y -= 22;
  txt("Período: " + ptgDataPT(D.de) + "/" + D.de.slice(0, 4) + " a " + ptgDataPT(D.ate) + "/" + D.ate.slice(0, 4) + " · Ponto Digital", x0, 10.5); y -= 24;
  if (!val) { txt("RASCUNHO · ainda não validado pela administração", x0, 10.5, B, P.rgb(0.6, 0.25, 0.05)); y -= 20; }
  // resumos validados antes de 27/11/2026 não tinham as horas em feriado: contam como normais
  var nor = function (l) { return l.normais_min != null ? l.normais_min : l.trabalhado_min - (l.feriado_min || 0); }, fe = function (l) { return l.feriado_min || 0; };
  var cols = [x0 + 6, 222, 280, 332, 386, 458, x1 - 6], br = P.rgb(1, 1, 1), fd = function (l) { return l.ferias_dias || 0; }, dtx = function (n) { return String(n).replace(".", ","); };
  pg.drawRectangle({x: x0, y: y - 16, width: x1 - x0, height: 32, color: az});
  y += 3; txt("Colaborador", cols[0], 10, B, br); dir("Horas", cols[1], 9.5, B, br); dir("Horas em", cols[2], 9.5, B, br); dir("Horas", cols[3], 9.5, B, br); dir("Total", cols[4], 9.5, B, br); dir("Férias", cols[5], 9.5, B, br); dir("Faltas por", cols[6], 9.5, B, br);
  y -= 12; dir("normais", cols[1], 9.5, B, br); dir("feriado", cols[2], 9.5, B, br); dir("extra", cols[3], 9.5, B, br); dir("de horas", cols[4], 9.5, B, br); dir("(dias úteis)", cols[5], 9.5, B, br); dir("baixa (dias)", cols[6], 9.5, B, br); y -= 25;
  var tot = {n: 0, f: 0, e: 0, b: 0, fe: 0};
  R.forEach(function (l, i) {
    if (i % 2) pg.drawRectangle({x: x0, y: y - 7, width: x1 - x0, height: 21, color: fundo});
    txt(l.nome, cols[0], 10.5); dir(PONTO.hhmm(nor(l)), cols[1], 10.5); dir(PONTO.hhmm(fe(l)), cols[2], 10.5, fe(l) ? B : F); dir(PONTO.hhmm(l.extra_min), cols[3], 10.5);
    dir(PONTO.hhmm(nor(l) + fe(l) + l.extra_min), cols[4], 10.5); dir(dtx(fd(l)), cols[5], 10.5); dir(String(l.baixa_dias), cols[6], 10.5);
    tot.n += nor(l); tot.f += fe(l); tot.e += l.extra_min; tot.b += l.baixa_dias; tot.fe += fd(l); y -= 21;
  });
  pg.drawRectangle({x: x0, y: y + 12, width: x1 - x0, height: 1.5, color: az}); y -= 4;
  txt("Total", cols[0], 10.5, B); dir(PONTO.hhmm(tot.n), cols[1], 10.5, B); dir(PONTO.hhmm(tot.f), cols[2], 10.5, B); dir(PONTO.hhmm(tot.e), cols[3], 10.5, B); dir(PONTO.hhmm(tot.n + tot.f + tot.e), cols[4], 10.5, B); dir(dtx(tot.fe), cols[5], 10.5, B); dir(String(tot.b), cols[6], 10.5, B); y -= 30;
  var ferMes = Object.keys(D.fer).filter(function (d) { return d.slice(0, 7) === D.mes; }).sort();
  var porFer = ferMes.map(function (d) {
    var q = R.filter(function (l) { return (l.feriado_dias || []).indexOf(d) >= 0; }).map(function (l) { return l.nome; });
    return ptgDataPT(d) + " " + D.fer[d] + (q.length ? ": " + q.join(", ") : ": ninguém trabalhou");
  });
  ["Horas no formato horas:minutos. Horas normais: as do horário em dias que não são feriado, salvo indicação contrária da administração dia a dia.",
   "Horas em feriado: as trabalhadas em feriados obrigatórios e no feriado municipal da estação (pagamento diferente).",
   "Pré-preenchidas pelo horário: extra = horas fora de feriado acima das previstas do mês (8 h por dia útil, menos férias e baixas); normais = o resto. A administração pode corrigir cada valor.",
   "Feriados do mês: " + (porFer.length ? porFer.join(" · ") : "nenhum") + ".",
   "Total = normais + feriado + extra. Férias gozadas: dias úteis marcados com F no horário, sem feriados (½ dia de férias = 0,5). Faltas por baixa: dias marcados com B no horário."].forEach(function (l) {
    var pal = l.split(" "), lin = "";   // quebra as linhas longas
    pal.forEach(function (w) { if (F.widthOfTextAtSize(safe(lin + " " + w), 8.5) > x1 - x0 && lin) { txt(lin, x0, 8.5, F, cinz); y -= 12; lin = w; } else lin = lin ? lin + " " + w : w; });
    if (lin) { txt(lin, x0, 8.5, F, cinz); y -= 12; }
  });
  y -= 16;
  pg.drawRectangle({x: x0, y: y - 9, width: x1 - x0, height: 26, borderColor: P.rgb(0.78, 0.82, 0.89), borderWidth: 0.8});
  txt(val ? "Validado pela administração: " + (D.fecho.validado_nome || "") + " · " + new Date(D.fecho.validado_em).toLocaleString("pt-PT", {timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"}).replace(",", " às")
    : "Por validar pela administração", x0 + 10, 10, B);
  y = 30; pg.drawLine({start: {x: x0, y: 42}, end: {x: x1, y: 42}, thickness: 0.5, color: P.rgb(0.85, 0.88, 0.93)});
  txt("mystationbox · Mapa de horas para a contabilidade", x0, 8, F, cinz); dir("Página 1 de 1", x1, 8, F, cinz);
  ptfDescarregar(new Blob([await doc.save()], {type: "application/pdf"}), "mapa-horas-" + D.est + "-" + D.mes + (val ? "" : "-rascunho") + ".pdf");
}
