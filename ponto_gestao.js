/* mystationbox · Ponto Digital, Gestão de Picagens (fase A do projeto do dono, 26/11/2026). Só administrador.
 * Tabela de todos os colaboradores e dias (só desde que o Ponto começou a ser usado em cada estação), com o estado
 * de cada dia (regras em ponto_regras.js) e a regularização: hora efetiva, motivo e justificação, gravada por
 * msb_ponto_corrigir. O registo original nunca se altera nem apaga: fica anulado e aponta para o novo. */
"use strict";
var PTG = {f: {}, d: null};

function ptgHoje() { return new Date().toLocaleDateString("sv-SE", {timeZone: "Europe/Lisbon"}); }
function ptgDias(de, ate) { var L = [], d = new Date(de + "T12:00:00Z"), f = new Date(ate + "T12:00:00Z"); while (d <= f) { L.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); } return L; }
function ptgDataPT(d) { var p = d.split("-"); return p[2] + "/" + p[1]; }
function ptgSemana(d) { return ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][new Date(d + "T12:00:00Z").getUTCDay()]; }
function ptgMinHora(t) { var p = String(t || "").split(":"); return +p[0] * 60 + +(p[1] || 0); }
/* «2026-11-26» + «08:05» em hora de Portugal → instante ISO (trata a hora de verão) */
function ptgInstante(dia, hhmm) {
  var alvo = ptgMinHora(hhmm), t = new Date(dia + "T" + hhmm + ":00Z");
  for (var i = 0; i < 2; i++) { var m = ptoMin(t.toISOString()), dif = m - alvo; if (dif > 720) dif -= 1440; if (dif < -720) dif += 1440; t = new Date(t.getTime() - dif * 60000); }
  return t.toISOString();
}
function ptgNomeEst(id) { var e = (ESTS || []).find(function (x) { return x.id === id; }); return e ? (e.short_name || e.name) : id; }

async function carregarPtg() {
  var box = $("#ptgCorpo"); if (!box) return;
  if (!ADMIN || window.GESTOR) { box.innerHTML = "<div class='card' style='padding:14px'>Só o administrador vê a Gestão de Picagens.</div>"; return; }
  var F = PTG.f, hoje = ptgHoje();
  if (!F.de) { F.de = hoje.slice(0, 8) + "01"; F.ate = hoje; F.est = ""; F.colab = ""; F.estado = ""; }
  box.innerHTML = "<div class='mut'>A carregar…</div>";
  try {
    var ests = (ESTS || []).map(function (e) { return e.id; });
    var q = await Promise.all([
      sb.from("msb_colaboradores").select("id,nome,curto,ativo"),
      sb.from("msb_colab_lojas").select("colaborador_id,estacao,desde,ate").in("estacao", ests),
      lerTudo(function () { return sb.from("msb_horario_dias").select("estacao,dia,colaborador_id,codigo").in("estacao", ests).gte("dia", F.de).lte("dia", F.ate); }, ["estacao", "dia", "colaborador_id"]),
      sb.from("msb_ponto_horas").select("estacao,codigo,parte,inicio,fim").in("estacao", ests),
      sb.from("msb_ponto_locais").select("*").in("estacao", ests),
      lerTudo(function () { return sb.from("msb_ponto_registos").select("id,estacao,colaborador_id,dia,tipo,hora,estado,motivo,distancia_m,precisao_m,turno_codigo,origem,anulado_por").in("estacao", ests).eq("teste", false).gte("dia", F.de).lte("dia", F.ate); }, ["id"]),
      lerTudo(function () { return sb.from("msb_ponto_correcoes").select("id,estacao,registo_original,registo_novo,acao,motivo,feito_por,feito_em").in("estacao", ests).gte("feito_em", F.de); }, ["id"]),
      sb.from("profiles").select("user_id,display_name"),
      sb.from("msb_ponto_registos").select("estacao,dia").eq("teste", false).eq("estado", "aceite").order("dia").limit(1000)
    ]);
    q.forEach(function (r) { if (r.error) throw r.error; });
    var D = {hoje: hoje, colabs: {}, lojas: q[1].data || [], hor: {}, horas: {}, cfg: {}, reg: q[5].data || [], corr: q[6].data || [], quem: {}, inicio: {}};
    (q[0].data || []).forEach(function (c) { D.colabs[c.id] = c; });
    (q[2].data || []).forEach(function (h) { D.hor[h.estacao + "|" + h.dia + "|" + h.colaborador_id] = h.codigo; });
    (q[3].data || []).forEach(function (h) { (D.horas[h.estacao + "|" + h.codigo] = D.horas[h.estacao + "|" + h.codigo] || []).push({inicio: ptgMinHora(h.inicio), fim: ptgMinHora(h.fim)}); });
    (q[4].data || []).forEach(function (l) { D.cfg[l.estacao] = l; });
    (q[7].data || []).forEach(function (p) { D.quem[p.user_id] = p.display_name; });
    (q[8].data || []).forEach(function (r) { if (!D.inicio[r.estacao]) D.inicio[r.estacao] = r.dia; });   // 1.º dia com picagens a sério
    PTG.d = D; ptgCalcular(); ptgDesenhar();
  } catch (e) { box.innerHTML = "<div class='card msgErr' style='padding:12px'>✖ " + esc(falhouPto(e)) + "</div>"; }
}

/* linhas: colaborador × estação × dia, desde o início do Ponto na estação */
function ptgCalcular() {
  var D = PTG.d, F = PTG.f, linhas = [], agora = ptoMin(new Date().toISOString());
  var porDia = {}; D.reg.forEach(function (r) { var k = r.estacao + "|" + r.dia + "|" + r.colaborador_id; (porDia[k] = porDia[k] || []).push(r); });
  var corrigidos = {}; D.corr.forEach(function (c) { if (c.registo_original) corrigidos[c.registo_original] = 1; if (c.registo_novo) corrigidos[c.registo_novo] = 1; });
  Object.keys(D.inicio).forEach(function (est) {
    var de = F.de > D.inicio[est] ? F.de : D.inicio[est], ate = F.ate < D.hoje ? F.ate : D.hoje; if (de > ate) return;
    var ids = {}; D.lojas.forEach(function (l) { if (l.estacao === est && (!l.ate || l.ate >= de) && (!l.desde || l.desde <= ate)) ids[l.colaborador_id] = l; });
    D.reg.forEach(function (r) { if (r.estacao === est && r.colaborador_id) ids[r.colaborador_id] = ids[r.colaborador_id] || {}; });
    Object.keys(ids).forEach(function (cid) {
      var l = ids[cid];
      ptgDias(de, ate).forEach(function (dia) {
        if ((l.desde && dia < l.desde) || (l.ate && dia > l.ate)) { if (!porDia[est + "|" + dia + "|" + cid]) return; }
        var cod = D.hor[est + "|" + dia + "|" + cid] || "", partes = D.horas[est + "|" + cod] || [], L = porDia[est + "|" + dia + "|" + cid] || [];
        var R = PONTO.dia(L.map(function (r) { return {id: r.id, tipo: r.tipo, min: ptoMin(r.hora), estado: r.estado, anulado_por: r.anulado_por}; }), partes, D.cfg[est] || {}, dia === D.hoje ? agora : null);
        var st = PONTO.estadoDia(R, {corrigido: L.some(function (r) { return corrigidos[r.id]; }), recusadas: L.filter(function (r) { return r.estado === "rejeitada"; }).length});
        if (!st) return;
        linhas.push({est: est, cid: +cid, nome: (D.colabs[cid] || {}).curto || (D.colabs[cid] || {}).nome || "?", dia: dia, cod: cod, R: R, st: st, L: L, partes: partes});
      });
    });
  });
  linhas.sort(function (a, b) { return a.dia < b.dia ? 1 : a.dia > b.dia ? -1 : PONTO.ESTADOS[a.st].ord - PONTO.ESTADOS[b.st].ord || a.nome.localeCompare(b.nome, "pt"); });
  PTG.linhas = linhas;
}

function ptgDesenhar() {
  var box = $("#ptgCorpo"), D = PTG.d, F = PTG.f, E = PONTO.ESTADOS; if (!box || !D) return;
  var todas = PTG.linhas.filter(function (x) { return (!F.est || x.est === F.est) && (!F.colab || String(x.cid) === F.colab); });
  var L = todas.filter(function (x) { return !F.estado || x.st === F.estado; });
  var cont = {}; todas.forEach(function (x) { cont[x.st] = (cont[x.st] || 0) + 1; });
  var nomes = {}; PTG.linhas.forEach(function (x) { nomes[x.cid] = x.nome; });
  var sem = !Object.keys(D.inicio).length;
  var h = "<div class='card' style='padding:14px'><div style='display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center'><h3 style='margin:0 0 4px'>Gestão de Picagens</h3><button class='btn' id='ptgFecho'>Fecho do mês</button></div>" +
    "<p class='mut' style='margin:0 0 10px'>Todos os colaboradores e dias desde que o Ponto Digital começou a ser usado em cada estação" +
    Object.keys(D.inicio).map(function (k) { return " · " + esc(ptgNomeEst(k)) + " desde " + ptgDataPT(D.inicio[k]); }).join("") + ". Toque numa linha para ver ou regularizar.</p>" +
    "<div class='ptg-filtros'><label>Estação<select id='ptgEst'><option value=''>Todas</option>" + (ESTS || []).map(function (e) { return "<option value='" + e.id + "'" + (F.est === e.id ? " selected" : "") + ">" + esc(e.short_name || e.name) + "</option>"; }).join("") + "</select></label>" +
    "<label>Colaborador<select id='ptgColab'><option value=''>Todos</option>" + Object.keys(nomes).sort(function (a, b) { return nomes[a].localeCompare(nomes[b], "pt"); }).map(function (k) { return "<option value='" + k + "'" + (F.colab === k ? " selected" : "") + ">" + esc(nomes[k]) + "</option>"; }).join("") + "</select></label>" +
    "<label>De<input type='date' id='ptgDe' value='" + F.de + "'></label><label>Até<input type='date' id='ptgAte' value='" + F.ate + "'></label></div>" +
    "<div class='ptg-chips'><button data-st=''" + (!F.estado ? " class='on'" : "") + ">Todos <b>" + todas.length + "</b></button>" + Object.keys(E).sort(function (a, b) { return E[a].ord - E[b].ord; }).map(function (k) {
      return cont[k] ? "<button data-st='" + k + "'" + (F.estado === k ? " class='on'" : "") + ">" + E[k].ic + " " + E[k].txt + " <b>" + cont[k] + "</b></button>" : ""; }).join("") + "</div></div>";
  h += "<div class='card' style='padding:0'>" + (sem ? "<p class='mut' style='padding:14px;margin:0'>Ainda não há picagens a sério em nenhuma estação.</p>" : L.length ?
    "<div class='sc'><table class='t ptg-t'><thead><tr><th class='l'>Colaborador</th><th class='l'>Estado</th><th>Data</th><th>Turno</th><th>Entrada</th><th>Saída</th><th>Horas</th><th>Tempo a mais</th><th>Estação</th></tr></thead><tbody>" +
    L.map(function (x, i) {
      var P = x.R.pares, e = E[x.st];
      var est = esc(x.est === "sto" ? "ST" : x.est === "pnf" ? "PN" : x.est), stH = "<span class='ptg-st ptg-" + x.st + "'>" + e.ic + " " + e.txt + "</span>" + (x.R.atraso ? " <span class='mut'>+" + x.R.atraso + " min</span>" : "");
      return "<tr data-i='" + PTG.linhas.indexOf(x) + "' tabindex='0'><td class='l'><b>" + esc(x.nome) + "</b></td><td class='l'>" + stH + "</td><td>" + ptgSemana(x.dia) + " " + ptgDataPT(x.dia) + "</td><td>" + esc(x.cod || "—") + "</td>" +
        "<td>" + (P.length ? P.map(function (p) { return PONTO.hm(p.e); }).join("<br>") : "—") + "</td><td>" + (P.length ? P.map(function (p) { return p.s == null ? "—" : PONTO.hm(p.s); }).join("<br>") : "—") + "</td>" +
        "<td>" + (x.R.trabalhado ? PONTO.duracao(x.R.trabalhado) : "—") + "</td><td>" + (x.R.extra ? PONTO.duracao(x.R.extra) : "—") + "</td><td>" + est + "</td></tr>";
    }).join("") + "</tbody></table></div>" : "<p class='mut' style='padding:14px;margin:0'>Nada com estes filtros.</p>") + "</div>";
  box.innerHTML = h;
  var mud = function (k, el, recarregar) { el.onchange = function () { F[k] = el.value; if (recarregar) carregarPtg(); else ptgDesenhar(); }; };
  $("#ptgFecho").onclick = function () { ir("ptf"); };
  mud("est", $("#ptgEst")); mud("colab", $("#ptgColab")); mud("de", $("#ptgDe"), 1); mud("ate", $("#ptgAte"), 1);
  box.querySelectorAll("[data-st]").forEach(function (b) { b.onclick = function () { F.estado = b.dataset.st; ptgDesenhar(); }; });
  box.querySelectorAll("tr[data-i]").forEach(function (tr) { tr.onclick = function () { ptgAbrir(PTG.linhas[+tr.dataset.i]); }; tr.onkeydown = function (ev) { if (ev.key === "Enter") tr.click(); }; });
}

/* janela de um colaborador num dia: picagens, histórico das correções e regularização */
function ptgAbrir(x) {
  var D = PTG.d, E = PONTO.ESTADOS, e = E[x.st];
  var corr = D.corr.filter(function (c) { return x.L.some(function (r) { return r.id === c.registo_original || r.id === c.registo_novo; }); });
  var porId = {}; D.reg.forEach(function (r) { porId[r.id] = r; });
  var dl = document.createElement("dialog"); dl.className = "avDlg"; document.body.appendChild(dl);
  var aceites = x.L.filter(function (r) { return r.estado === "aceite" && r.anulado_por == null; });
  var falta = x.R.partes.filter(function (p) { return !p.entrada || p.saida == null; })[0];
  var sugTipo = falta ? (falta.entrada == null ? "entrada" : "saida") : "entrada", sugHora = falta ? PONTO.hm(falta.entrada == null ? falta.inicio : falta.fim) : "";
  dl.innerHTML = "<div class='avDlg-cab'><b>" + esc(x.nome) + " · " + ptgSemana(x.dia) + " " + ptgDataPT(x.dia) + " · " + esc(ptgNomeEst(x.est)) + "</b><button class='np-x' aria-label='Fechar'>✕</button></div><div class='avDlg-corpo'>" +
    "<p style='margin:0'><span class='ptg-st ptg-" + x.st + "'>" + e.ic + " " + e.txt + "</span> · Turno <b>" + esc(x.cod || "sem turno") + "</b>" +
    (x.partes.length ? " (" + x.partes.slice().sort(function (a, b) { return a.inicio - b.inicio; }).map(function (p) { return PONTO.hm(p.inicio) + "–" + PONTO.hm(p.fim); }).join(" e ") + ")" : "") + "</p>" +
    "<p class='mut' style='margin:0'>Trabalhado " + PONTO.duracao(x.R.trabalhado) + (x.R.extra ? " · tempo a mais " + PONTO.duracao(x.R.extra) : "") + (x.R.atraso ? " · atraso " + x.R.atraso + " min" : "") + (x.R.antecipada ? " · saída antecipada " + x.R.antecipada + " min" : "") + "</p>" +
    (x.R.avisos.length ? "<p class='msgErr' style='margin:0'>" + x.R.avisos.map(esc).join("<br>") + "</p>" : "") +
    "<div class='avSec'><h4>Picagens do dia</h4>" + (x.L.length ? "<ul class='ptg-pic'>" + x.L.slice().sort(function (a, b) { return a.hora < b.hora ? -1 : 1; }).map(function (r) {
      var anul = r.anulado_por != null, novo = anul && r.anulado_por !== r.id ? porId[r.anulado_por] : null;
      return "<li class='" + (r.estado !== "aceite" ? "rej" : anul ? "anul" : "") + "'><b>" + ptoHora(r.hora) + "</b> " + (r.tipo === "entrada" ? "Entrada" : "Saída") +
        (r.estado !== "aceite" ? " · ❌ recusada: " + esc(PONTO.MOTIVOS[r.motivo] || r.motivo || "") + (r.distancia_m != null ? " (" + r.distancia_m + " m)" : "") :
          anul ? (novo ? " · corrigida para " + ptoHora(novo.hora) : " · anulada") : r.origem === "correcao" ? " · ✏️ regularizada" : " · ✅ GPS" + (r.distancia_m != null ? " a " + r.distancia_m + " m" : "")) +
        (r.estado === "aceite" && !anul ? " <button class='mini' data-alt='" + r.id + "'>Corrigir hora</button> <button class='mini' data-anu='" + r.id + "'>Anular</button>" : "") + "</li>";
    }).join("") + "</ul>" : "<p class='mut' style='margin:0'>Sem picagens.</p>") + "</div>" +
    "<div class='avSec' id='ptgReg'><h4 id='ptgRegT'>Regularizar: acrescentar picagem</h4>" +
    "<div class='avLinha'><label class='avCampo'>Tipo <select id='ptgTipo'><option value='entrada'" + (sugTipo === "entrada" ? " selected" : "") + ">Entrada</option><option value='saida'" + (sugTipo === "saida" ? " selected" : "") + ">Saída</option></select></label>" +
    "<label class='avCampo'>Hora efetiva <input type='time' id='ptgHora' value='" + sugHora + "'></label></div>" +
    "<label class='avCampo'>Motivo <select id='ptgMot'><option value=''>— escolher —</option>" + PONTO.MOTIVOS_CORR.map(function (m) { return "<option value='" + m[0] + "'>" + esc(m[1]) + "</option>"; }).join("") + "</select></label>" +
    "<label class='avCampo'>Justificação <textarea id='ptgJust' rows='2' maxlength='400' placeholder='Obrigatória em «Outro»'></textarea></label>" +
    "<div class='avLinha'><button class='btn p' id='ptgValidar'>✅ Validar</button><button class='btn' id='ptgNovo' hidden>Voltar a acrescentar</button></div><p class='avMsg' id='ptgMsg' role='status'></p></div>" +
    "<div class='avSec'><h4>Histórico de correções <i>" + corr.length + "</i></h4>" + (corr.length ? "<ul class='ptg-pic'>" + corr.map(function (c) {
      var o = porId[c.registo_original], n = porId[c.registo_novo];
      var o_ = o ? (o.tipo === "entrada" ? "Entrada " : "Saída ") + ptoHora(o.hora) : "", n_ = n ? (n.tipo === "entrada" ? "Entrada " : "Saída ") + ptoHora(n.hora) : "";
      return "<li><b>" + (c.acao === "acrescentar" ? "Acrescentada: " + n_ : c.acao === "anular" ? "Anulada: " + o_ : o_ + " → " + (n ? ptoHora(n.hora) : "")) + "</b><br><span class='mut'>" + esc(c.motivo) + " · " + esc(D.quem[c.feito_por] || "administrador") + " · " +
        new Date(c.feito_em).toLocaleString("pt-PT", {timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"}) + "</span></li>"; }).join("") + "</ul>" : "<p class='mut' style='margin:0'>Sem correções.</p>") + "</div></div>";
  var fechar = function () { try { dl.close(); } catch (er) { /* já fechada */ } dl.remove(); };
  dl.querySelector(".np-x").onclick = fechar;
  var modo = {acao: "acrescentar", reg: null};
  function porModo(acao, r) {
    modo = {acao: acao, reg: r}; var t = dl.querySelector("#ptgRegT");
    dl.querySelector("#ptgTipo").disabled = acao !== "acrescentar"; dl.querySelector("#ptgHora").disabled = acao === "anular";
    if (r) { dl.querySelector("#ptgTipo").value = r.tipo; dl.querySelector("#ptgHora").value = ptoHora(r.hora); }
    t.textContent = acao === "acrescentar" ? "Regularizar: acrescentar picagem" : acao === "alterar_hora" ? "Regularizar: corrigir a hora de " + ptoHora(r.hora) : "Regularizar: anular a picagem das " + ptoHora(r.hora);
    dl.querySelector("#ptgNovo").hidden = acao === "acrescentar"; dl.querySelector("#ptgReg").scrollIntoView({behavior: "smooth"});
  }
  dl.querySelectorAll("[data-alt]").forEach(function (b) { b.onclick = function () { porModo("alterar_hora", aceites.find(function (r) { return r.id === +b.dataset.alt; })); }; });
  dl.querySelectorAll("[data-anu]").forEach(function (b) { b.onclick = function () { porModo("anular", aceites.find(function (r) { return r.id === +b.dataset.anu; })); }; });
  dl.querySelector("#ptgNovo").onclick = function () { porModo("acrescentar", null); };
  dl.querySelector("#ptgValidar").onclick = async function () {
    var b = this, m = dl.querySelector("#ptgMsg"), hora = dl.querySelector("#ptgHora").value;
    var mot = PONTO.motivoCorrecao(dl.querySelector("#ptgMot").value, dl.querySelector("#ptgJust").value);
    var erro = !dl.querySelector("#ptgMot").value ? "Escolha o motivo." : !mot ? "Escreva a justificação (pelo menos 5 letras)." : modo.acao !== "anular" && !hora ? "Escreva a hora efetiva." : "";
    if (erro) { m.textContent = erro; m.className = "avMsg bad"; return; }
    var resumo = modo.acao === "acrescentar" ? "Acrescentar " + (dl.querySelector("#ptgTipo").value === "entrada" ? "entrada" : "saída") + " às " + hora : modo.acao === "alterar_hora" ? "Corrigir " + ptoHora(modo.reg.hora) + " para " + hora : "Anular a picagem das " + ptoHora(modo.reg.hora);
    if (!await msbConfirma(resumo + " de " + x.nome + " em " + ptgDataPT(x.dia) + "?\nMotivo: " + mot + "\nO registo original fica guardado.", "Validar")) return;
    b.disabled = true;
    var r = await sb.rpc("msb_ponto_corrigir", {p_acao: modo.acao, p_motivo: mot, p_registo: modo.reg ? modo.reg.id : null,
      p_hora: modo.acao === "anular" ? null : ptgInstante(x.dia, hora), p_estacao: modo.acao === "acrescentar" ? x.est : null,
      p_colaborador: modo.acao === "acrescentar" ? x.cid : null, p_tipo: modo.acao === "acrescentar" ? dl.querySelector("#ptgTipo").value : null});
    if (r.error) { b.disabled = false; m.textContent = "✖ " + falhouPto(r.error); m.className = "avMsg bad"; return; }
    fechar(); await carregarPtg();
    var nx = PTG.linhas.find(function (l) { return l.est === x.est && l.cid === x.cid && l.dia === x.dia; }); if (nx) ptgAbrir(nx);
  };
  dl.showModal();
}
