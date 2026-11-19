/* Horários · Fases 1 e 2: consultar, editar, verificar as regras (horario_regras.js) e exportar para o Picaponto e PDF.
 * O funcionário só vê o da sua loja (RLS). Editar e exportar é só do administrador; cada célula alterada fica em msb_eventos. */
"use strict";
(function () {
  var MES = null, SEM = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"], X = null;
  function hoje() { return hojeISO(0); }
  function feriados(ano) {
    var f = {}, n = feriadosPT(ano), p = pascoa(ano); Object.keys(n).forEach(function (d) { f[d] = 1; });
    f[new Date(p.getTime() - 47 * 864e5).toISOString().slice(0, 10)] = 1; return f;
  }
  function nomeMes(m) { var t = new Date(m + "-15").toLocaleDateString("pt-PT", {month: "long"}); return t.charAt(0).toUpperCase() + t.slice(1) + " " + m.slice(0, 4); }
  function semAcento(t) { return t.normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function loja() { return (ESTS || []).find(function (e) { return e.id === EST; }) || {}; }
  function nomeLoja() { var e = loja(); return "Repsol " + (e.short_name === "Penafiel" ? "Penafiel Circular" : e.short_name || ""); }
  function ficheiro(ext) { return "horario_" + semAcento(nomeMes(X.M).toLowerCase().replace(" ", "_")) + "_" + semAcento(nomeLoja().toLowerCase()).replace(/ /g, "_") + (X.estado === "simulacao" ? "_SIMULACAO" : "") + "." + ext; }
  function descarregar(blob, nome) { var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000); }

  function linhas() {   // para as regras: uma linha por pessoa, com o que está no ecrã
    return X.P.filter(function (l) { return !l.espelho; }).map(function (l) {   // quem segue outra pessoa não conta para a cobertura
      var g = X.G[l.colaborador_id] || {}, c = X.C[l.colaborador_id] || {}, ant = X.ANT[l.colaborador_id] || [];
      return {nome: c.curto || "", escala: l.escala, abate: abate(l.colaborador_id), dias: X.dias.map(function (d) { return g[d] || ""; }), ant: ant.map(function (a) { return a[1]; }), fdsAnt: X.FDS[l.colaborador_id] || ""};
    });
  }
  function celulas() {
    var t = function (d) { var iso = X.M + "-" + String(d).padStart(2, "0"), w = new Date(iso + "T12:00:00").getDay(); return {w: w, cl: (X.fer[iso] ? "fer " : (w === 0 || w === 6) ? "fds " : "") + (iso === hoje() ? "hj" : "")}; };
    var eu = ((PERFIL && PERFIL.display_name) || "").trim().split(/\s+/)[0], EX = mapaExtras();
    var h = "<div class='sc' id='horSc'><table class='hor" + (X.ed ? " aeditar" : "") + "'><thead><tr><th class='l'>Colaborador</th>" + X.dias.map(function (d) { var k = t(d); return "<th class='" + k.cl + "'>" + d + "<small>" + SEM[k.w] + "</small></th>"; }).join("") + "<th>Turnos</th></tr></thead><tbody>";
    X.P.forEach(function (l) {
      var c = X.C[l.colaborador_id] || {}, g = X.G[l.colaborador_id] || {}, tur = 0, fixo = !!l.espelho;
      h += "<tr" + (c.curto === eu ? " class='eu'" : "") + "><td class='l' title='" + esc(c.nome || "") + "'>" + esc(c.curto || "") + (fixo && X.ed ? "<small>segue " + esc((X.C[l.espelho] || {}).curto || "") + "</small>" : "") + "</td>" + X.dias.map(function (d) {
        var v = g[d] || ""; if (v === "M" || v === "T" || v === "MT") tur++;
        var mudou = X.ALT[l.colaborador_id + "|" + d] != null, fx = (X.FX[l.colaborador_id] || {})[d], es = (X.EM[l.colaborador_id] || {})[d], sg = (X.SUG || {})[l.colaborador_id + "|" + d];
        if (!v && foraDe(l.colaborador_id, d)) return "<td class='" + t(d).cl + " fora' title='Ainda não estava ou já saiu'>·</td>";
        return "<td class='" + t(d).cl + (mudou ? " alt" : "") + (sg ? " sug" : "") + (fx ? " fx" : "") + ((EX[l.colaborador_id] || []).indexOf(d) >= 0 ? " ex" : "") + "'" + (es ? " title='" + esc(TIPOS[es.tipo][0] + (es.nota ? ": " + es.nota : "")) + "'" : fx ? " title='Turno fixado'" : "") + (X.ed ? " data-c='" + l.colaborador_id + "' data-d='" + d + "' tabindex='0' role='button' aria-label='" + esc(c.curto || "") + " dia " + d + "'" : "") + ">" + v + (es && TIPOS[es.tipo][2] ? "<small>" + TIPOS[es.tipo][2] + "</small>" : "") + (sg ? "<span class='sg'>→ " + esc(sg.para) + "</span>" : "") + "</td>";
      }).join("") + "<td class='n'>" + tur + "</td></tr>";
    });
    return h + "</tbody></table></div>";
  }
  function opRegras() { return {y: +X.M.slice(0, 4), m: +X.M.slice(5), fer: X.fer, mt: X.mt, semMT: X.semMT}; }
  function mapaExtras() {   // só para o administrador: sem os dias especiais a conta sairia errada. Quem segue outra pessoa leva as mesmas marcas
    var M = {}; if (!ADMIN) return M;
    var E = HOR.extras(linhas(), opRegras());
    X.P.forEach(function (l) { var d = E[(X.C[l.colaborador_id] || {}).curto || ""]; if (d && d.length) M[l.colaborador_id] = d; });
    X.P.forEach(function (l) { if (l.espelho && M[l.espelho]) M[l.colaborador_id] = M[l.espelho].filter(function (d) { return (X.G[l.colaborador_id] || {})[d] === (X.G[l.espelho] || {})[d]; }); });
    return M;
  }
  function verif() { return HOR.verificar(linhas(), opRegras()); }
  function errosNovos() { return verif().erros.filter(function (e) { return (X.ER0 || []).indexOf(e.msg) < 0; }); }
  /* Depois de uma mudança à mão (dono, 19/11/2026): só muda a célula tocada. Se ficar um erro, a app sugere mudanças (a laranja) e espera pelo ✔ */
  function inviavel() {
    if (!X.ed) return "";
    if (X.calc) return "<div class='aviso'><p>⏳ A procurar sugestões…</p></div>";
    var L = errosNovos().map(function (e) { return e.msg; }), S = Object.keys(X.SUG || {});
    if (X.inv) L.unshift(X.inv);
    if (!L.length && !S.length) return "";
    var nome = function (k) { return (X.C[+k.split("|")[0]] || {}).curto || ""; };
    return "<div class='aviso hinv' role='alert'>" + (L.length ? "<ul class='hl'>" + L.slice(0, 5).map(function (t) { return "<li>❌ " + esc(t) + "</li>"; }).join("") + "</ul>" + (L.length > 5 ? "<p>E mais " + (L.length - 5) + ".</p>" : "") : "") +
      (S.length ? "<p><b>A app sugere " + S.length + (S.length === 1 ? " mudança" : " mudanças") + "</b> (a laranja na grelha). Nada muda sem o seu ✔:</p><div style='display:grid;gap:6px'>" + S.map(function (k) { var g = X.SUG[k];
        return "<div class='bar'><span>" + esc(nome(k)) + ", dia " + k.split("|")[1] + ": " + esc(g.de || "vazio") + " → <b>" + esc(g.para || "vazio") + "</b></span><button class='btn' data-sok='" + k + "'>✔ Aceitar</button><button class='btn' data-sno='" + k + "'>Ignorar</button></div>"; }).join("") +
        "</div>" + (S.length > 1 ? "<div class='bar' style='margin-top:6px'><button class='btn p' id='sugTodas'>✔ Aceitar todas</button><button class='btn' id='sugNada'>Ignorar todas</button></div>" : "")
        : L.length ? "<p>Pode deixar assim (o administrador pode quebrar as regras), mudar outro turno, ou carregar em ✨ Propor horário.</p>" : "") + "</div>";
  }
  function aceitarSug(k) { var g = X.SUG[k], a = k.split("|"); delete X.SUG[k]; if (g) { pôr(+a[0], +a[1], g.para, false); X.P.forEach(function (l) { if (l.espelho === +a[0] && !(X.FX[l.colaborador_id] || {})[+a[1]] && !foraDe(l.colaborador_id, +a[1])) pôr(l.colaborador_id, +a[1], g.para, false); }); } }
  /* As regras escritas, cada uma com ✅ ⚠️ ❌ (dono, 19/11/2026: o administrador pode quebrá-las; a app avisa os erros críticos) */
  var REGRAS = [["Todos os dias uma pessoa de manhã e uma de tarde", /sem manhã|sem tarde/], ["Nunca tarde → manhã no dia seguinte", /T→M/], ["Máximo 5 dias seguidos", /dias seguidos/], ["MT só onde existe", /MT não existe/],
    ["Só uma pessoa de tarde", /mais de uma pessoa de tarde/], ["Fins de semana: sábado = domingo e a rodar (manhã → tarde → folga)", /sábado|fim de semana/], ["Um MT por semana, nunca em feriado", /MT \(devia|MT em feriado/]];
  function regras() {
    var r = verif(); X.R = r;
    var linha = function (ic, t, L) { return "<tr><td style='width:28px'>" + ic + "</td><td class='l' style='position:static;box-shadow:none;font-weight:500'>" + esc(t) + "</td><td class='l mut' style='position:static;box-shadow:none;font-weight:400'>" + esc(L.slice(0, 3).join(" · ") + (L.length > 3 ? " · e mais " + (L.length - 3) : "")) + "</td></tr>"; };
    var h = "<div class='bl'><h3>Regras " + (r.erros.length ? "<span class='tag t-er'>" + r.erros.length + " erro(s) crítico(s)</span>" : "<span class='tag t-ok'>✔ Sem erros críticos</span>") + "</h3><div class='sc'><table>";
    REGRAS.forEach(function (g, i) {
      if (i === 3 && X.mt) return; if (i === 6 && !X.mt) return;
      var E = r.erros.filter(function (e) { return g[1].test(e.msg); }).map(function (e) { return e.msg; }), A = r.avisos.filter(function (e) { return g[1].test(e.msg); }).map(function (e) { return e.msg; });
      h += linha(E.length ? "❌" : A.length ? "⚠️" : "✅", g[0], E.concat(A));
    });
    var M = r.metas.filter(function (m) { return m.extra; }).map(function (m) { return m.nome + " " + (m.extra > 0 ? "+" : "") + m.extra + " h"; });
    h += linha(M.length ? "⚠️" : "✅", "Horas do mês: 40 h por semana, 8 h por turno; cada feriado em dia útil desconta 8 h", M);
    h += "</table></div><p class='rod'>❌ crítico: a app pergunta antes de gravar ou aprovar, mas pode fazê-lo na mesma. ⚠️ só aviso.</p>";
    if (ADMIN) h += "<div class='sc' style='margin-top:8px'><table><thead><tr><th class='l'>Horas</th><th>Previstas no mês</th><th>Ausências</th><th>A realizar</th><th>Extra</th></tr></thead><tbody>" +
      r.metas.map(function (m) { return "<tr><td class='l'>" + esc(m.nome) + "</td><td class='n'>" + r.base * 8 + " h</td><td class='n'>" + (m.ausencias ? "−" + m.ausencias * 8 + " h" : "—") + "</td><td class='n'>" + m.turnos * 8 + " h</td><td class='n'>" + (m.extra ? (m.extra > 0 ? "+" : "") + m.extra + " h" : "—") + "</td></tr>"; }).join("") +
      "</tbody></table></div><p class='rod'>Previstas: dias úteis do mês sem feriados × 8 h (" + r.base + " dias). Ausências: férias, baixa, formação e dias fora da equipa. A realizar: turnos marcados × 8 h. Extra = a realizar − (previstas − ausências).</p>";
    return h + "</div>";
  }
  function pintar() {
    var box = $("#v-hor"), n = Object.keys(X.ALT).length, b = "<div class='bar'><button class='btn' id='horAnt' aria-label='Mês anterior'>‹</button><input type='month' id='horMes' value='" + X.M + "'><button class='btn' id='horSeg' aria-label='Mês seguinte'>›</button>" +
      "<span class='tag " + (X.apr ? "t-ok'>Aprovado" : X.estado === "simulacao" ? "t-at'>Em preparação" : "t-ok'>Horário real") + "</span>";
    /* ecrã simples (dono, 19/11/2026): Propor horário · Aprovar · Exportar; o resto em ⋯ */
    if (ADMIN && X.P.length) b += (n ? "<button class='btn p' id='horGrava'" + (X.calc ? " disabled" : "") + ">Gravar " + n + "</button><button class='btn' id='horFim'>Desfazer</button>" : "") +
      (X.apr ? "<button class='btn" + (n ? "" : " p") + "' id='horEnv'>" + (X.env ? "Reenviar aos funcionários" : "Enviar aos funcionários") + "</button>"
        : "<button class='btn' id='horProj'" + (X.calc ? " disabled" : "") + ">✨ Propor horário</button><button class='btn" + (n ? "" : " p") + "' id='horSelo'>✔ Aprovar</button>") +
      "<button class='btn' id='horExp'>⬇ Exportar ▾</button><button class='btn' id='horMais' aria-label='Mais opções'>⋯</button>";
    if (ADMIN && X.menu === "exp") b += "</div><div class='bar'><button class='btn' id='horPdf'>📄 PDF</button><button class='btn' id='horXls'>📊 Excel do Picaponto</button>";
    if (ADMIN && X.menu === "mais") b += "</div><div class='bar'>" + (X.apr ? "<button class='btn' id='horTira'>Tirar a aprovação</button>" : (X.INI ? "<button class='btn' id='horIni'>Voltar ao horário inicial</button>" : "") + "<button class='btn' id='horDefIni'>Guardar como inicial</button>");
    box.innerHTML = b + "</div>" + (ADMIN && X.P.length ? equipa() : "") + (ADMIN && X.apr && X.env && X.atu > X.env ? "<div class='aviso'><p>⚠ Alterado depois de enviado. Os funcionários ainda têm a versão anterior: carrega em Reenviar.</p></div>" : "") + (ADMIN && X.apr && !X.env ? "<div class='aviso'><p>Horário selado. Falta enviar aos funcionários.</p></div>" : "") + (X.envio ? cartaoEnvio() : "") + (X.esp ? cartaoEsp() : "") + inviavel() + (X.P.length ? celulas() + "<p class='rod'>M manhã · T tarde · MT turno M/T · FG folga · F férias · FD feriado. Fundo azul: fim de semana; creme: feriado." + (ADMIN ? " <span class='exl'>M</span> Turno extra." : "") + (X.ESP.length ? " Especiais: B baixa · Fr formação · A aniversário · O outros."  : "") + (X.ed ? " Toque numa célula para mudar o turno. A app nunca muda outros turnos sozinha: se faltar alguma coisa, sugere (a laranja) e espera pelo seu ✔. ✨ Propor horário refaz o mês, menos o que já passou, o que mudou à mão (sublinhado) e as férias." : "") + "</p>" + regras()
      : "<div class='vazio'>" + (ADMIN ? "Ainda não há horário de " + nomeMes(X.M) + " nesta estação." : "O horário de " + nomeMes(X.M) + " ainda não está disponível.") + (ADMIN ? "<p><button class='btn p' id='horNovo'>Criar horário do mês</button></p>" : "") + "</div>");
    $("#horAnt").onclick = function () { sair(function () { abrir(addMes(X.M, -1)); }); };
    $("#horSeg").onclick = function () { sair(function () { abrir(addMes(X.M, 1)); }); };
    $("#horMes").onchange = function () { var v = this.value; if (v) sair(function () { abrir(v); }); };
    var e = function (id, f) { var x = $(id); if (x) x.onclick = f; };
    e("#horFim", function () { sair(function () { abrir(X.M); }); });
    e("#horExp", function () { X.menu = X.menu === "exp" ? "" : "exp"; pintar(); }); e("#horMais", function () { X.menu = X.menu === "mais" ? "" : "mais"; pintar(); });
    if (X.esp) ligarEsp(); e("#horProj", propor); ligarEquipa();
    [].forEach.call(document.querySelectorAll("#v-hor [data-sok]"), function (x) { x.onclick = function () { aceitarSug(x.dataset.sok); pintar(); }; });
    [].forEach.call(document.querySelectorAll("#v-hor [data-sno]"), function (x) { x.onclick = function () { delete X.SUG[x.dataset.sno]; pintar(); }; });
    e("#sugTodas", function () { Object.keys(X.SUG).forEach(aceitarSug); pintar(); }); e("#sugNada", function () { X.SUG = {}; pintar(); }); e("#horIni", voltarInicial); e("#horDefIni", definirInicial); e("#horGrava", gravar); e("#horSelo", selar); e("#horTira", tirarSelo); e("#horEnv", abrirEnvio); if (X.envio) ligarEnvio(); e("#horXls", excel); e("#horPdf", pdf); e("#horNovo", criar);
    var sc = $("#horSc"); if (sc) {
      var alvo = sc.querySelector("th.hj"); if (alvo && X.rolar) { sc.scrollLeft = Math.max(0, alvo.offsetLeft - 140); X.rolar = false; }
      if (X.ed) { sc.onclick = function (ev) { var t = ev.target.closest("td[data-c]"); if (t) escolher(t); }; sc.onkeydown = function (ev) { if (ev.key === "Enter" || ev.key === " ") { var t = ev.target.closest("td[data-c]"); if (t) { ev.preventDefault(); escolher(t); } } }; }
    }
  }
  /* 👥 Equipa do mês (dono, 19/11/2026): acrescentar ou retirar pessoas; férias e baixa a partir do nome */
  function dmCurto(iso) { return iso.slice(8) + "/" + iso.slice(5, 7); }
  function equipa() {
    var fim = X.M + "-" + String(X.dias.length).padStart(2, "0");
    var h = "<div class='bl'><h3>👥 Equipa do mês</h3><div class='bar'>" + X.P.map(function (l) {
      var c = X.C[l.colaborador_id] || {}, x = [];
      if (l.desde && l.desde > X.M + "-01" && l.desde <= fim) x.push("desde " + dmCurto(l.desde));
      if (l.ate && l.ate >= X.M + "-01" && l.ate < fim) x.push("até " + dmCurto(l.ate));
      if (l.espelho) x.push("faz o da " + ((X.C[l.espelho] || {}).curto || ""));
      return "<button class='btn" + (X.pess === l.colaborador_id ? " p" : "") + "' data-pess='" + l.colaborador_id + "'>" + esc(c.curto || "") + (x.length ? " <small>" + esc(x.join(" · ")) + "</small>" : "") + "</button>";
    }).join("") + "<button class='btn' id='horAdd'>+ Acrescentar</button></div>";
    if (X.pess) {
      var c = X.C[X.pess] || {};
      h += "<div class='aviso' style='margin-top:8px;display:grid;gap:8px'><b>" + esc(c.nome || c.curto || "") + "</b><div class='bar'><button class='btn' id='pesEsp'>🏖️ Férias, baixa, formação…</button></div>" +
        "<div class='bar'><label>Retirar do horário: último dia <input type='date' id='pesAte' min='" + hojeISO(-1) + "' value='" + hojeISO(-1) + "'></label><button class='btn' id='pesTira'>Retirar</button><button class='btn' id='pesFim'>Fechar</button></div></div>";
    }
    if (X.add) {
      var fora = Object.keys(X.C).map(Number).filter(function (i) { return !X.P.some(function (l) { return l.colaborador_id === i; }); });
      h += "<div class='aviso' style='margin-top:8px;display:grid;gap:8px'><b>Acrescentar ao horário</b><div class='ff'>" +
        "<label>Quem<select id='addQuem'><option value=''>Pessoa nova</option>" + fora.map(function (i) { return "<option value='" + i + "'>" + esc(X.C[i].nome || X.C[i].curto) + "</option>"; }).join("") + "</select></label>" +
        "<label class='addNovo'>Nome completo<input id='addNome'></label><label class='addNovo'>Nome curto (no horário)<input id='addCurto'></label>" +
        "<label>Desde<input type='date' id='addDesde' value='" + (hoje().slice(0, 7) === X.M ? hoje() : X.M + "-01") + "'></label>" +
        "<label>Código no Picaponto<input id='addCod' inputmode='numeric'></label>" +
        "<label>Horário<select id='addEsp'><option value=''>Próprio (conta para a escala)</option>" + X.P.filter(function (l) { return l.escala && !l.espelho; }).map(function (l) { return "<option value='" + l.colaborador_id + "'>Faz o da " + esc((X.C[l.colaborador_id] || {}).curto || "") + "</option>"; }).join("") + "</select></label></div>" +
        "<div class='bar'><button class='btn p' id='addOk'>Acrescentar</button><button class='btn' id='addFim'>Cancelar</button></div></div>";
    }
    return h + "</div>";
  }
  function ligarEquipa() {
    var e = function (id, f) { var x = $(id); if (x) x.onclick = f; };
    [].forEach.call(document.querySelectorAll("#v-hor [data-pess]"), function (b) { b.onclick = function () { X.pess = X.pess === +b.dataset.pess ? null : +b.dataset.pess; X.add = null; pintar(); }; });
    e("#horAdd", function () { X.add = X.add ? null : {}; X.pess = null; pintar(); });
    e("#pesFim", function () { X.pess = null; pintar(); });
    e("#pesEsp", function () { X.esp = true; X.espF = novoEspF(); X.espF.c = X.pess; X.pess = null; pintar(); var o = $("#espOk"); if (o) o.scrollIntoView({block: "center"}); });
    e("#pesTira", retirar); e("#addFim", function () { X.add = null; pintar(); }); e("#addOk", acrescentar);
    var q = $("#addQuem"); if (q) q.onchange = function () { [].forEach.call(document.querySelectorAll(".addNovo"), function (x) { x.hidden = !!q.value; }); var l = X.LJ.find(function (z) { return z.colaborador_id === +q.value; }); if (l) $("#addCod").value = l.codigo; };
  }
  async function retirar() {
    var id = X.pess, ult = $("#pesAte").value, c = X.C[id] || {};
    if (!ult) return msbAviso("Erro: escolha o último dia.");
    if (ult < hojeISO(-1)) return msbAviso("Erro: os dias que já passaram ficam como estão; o último dia tem de ser ontem ou depois.");
    if (Object.keys(X.ALT).length) return msbAviso("Erro: grave ou desfaça as alterações primeiro.");
    if (!await msbConfirma(c.curto + " deixa de estar no horário depois de " + dmy(ult) + ". Os turnos marcados depois desse dia são apagados (fica o registo). Continuar?", "Retirar")) return;
    try {
      var r = await sb.from("msb_colab_lojas").update({ate: ult}).eq("colaborador_id", id).eq("estacao", EST); if (r.error) throw r.error;
      var d = await sb.from("msb_horario_dias").delete().eq("colaborador_id", id).eq("estacao", EST).gt("dia", ult); if (d.error) throw d.error;
      msbAviso(c.curto + " retirado(a) do horário depois de " + dmy(ult) + "."); X.pess = null; abrir(X.M);
    } catch (x) { msbAviso("Erro: " + falhou(x)); }
  }
  async function acrescentar() {
    var quem = +$("#addQuem").value || null, desde = $("#addDesde").value, cod = $("#addCod").value.trim(), esp = +$("#addEsp").value || null;
    if (!desde) return msbAviso("Erro: escolha desde quando.");
    if (!/^\d{1,4}$/.test(cod)) return msbAviso("Erro: escreva o código do Picaponto (número).");
    if (X.LJ.some(function (l) { return l.codigo === cod && l.colaborador_id !== quem; })) return msbAviso("Erro: o código " + cod + " já é de outra pessoa nesta estação.");
    try {
      var nome;
      if (!quem) {
        nome = $("#addNome").value.trim(); var curto = $("#addCurto").value.trim() || nome.split(/\s+/)[0];
        if (!nome) return msbAviso("Erro: escreva o nome.");
        var c = await sb.from("msb_colaboradores").insert({nome: nome, curto: curto, ativo: true}).select("id").single(); if (c.error) throw c.error;
        quem = c.data.id;
      } else { nome = X.C[quem].nome; var a = await sb.from("msb_colaboradores").update({ativo: true}).eq("id", quem); if (a.error) throw a.error; }
      var ja = X.LJ.find(function (l) { return l.colaborador_id === quem; }), ordem = X.LJ.reduce(function (m, l) { return Math.max(m, l.ordem || 0); }, 0) + 1;
      var dados = {codigo: cod, desde: desde, ate: null, escala: !esp, espelho: esp};
      var r = ja ? await sb.from("msb_colab_lojas").update(dados).eq("colaborador_id", quem).eq("estacao", EST)
        : await sb.from("msb_colab_lojas").insert(Object.assign({colaborador_id: quem, estacao: EST, ordem: ordem, nome_picaponto: semAcento(nome).toUpperCase()}, dados));
      if (r.error) throw r.error;
      msbAviso(nome + " acrescentado(a) desde " + dmy(desde) + ". Carregue em ✨ Propor horário para lhe dar turnos."); X.add = null; abrir(X.M);
    } catch (x) { msbAviso("Erro: " + falhou(x)); }
  }
  function sair(seg) {
    if (!X || !Object.keys(X.ALT).length) return seg();
    msbConfirma("Há alterações por gravar. Sair sem gravar?", "Sair sem gravar").then(function (ok) { if (ok) { ADIAR[EST + X.M] = 1; seg(); } });
  }
  function escolher(td) {
    var f = $("#horPop"); if (f) f.remove();
    var id = +td.dataset.c, d = +td.dataset.d, c = X.C[id] || {}, m = document.createElement("div"); m.id = "horPop";
    var es = (X.EM[id] || {})[d]; if (es) return editarEsp(es);
    var cods = HOR.CODIGOS.filter(function (k) { return k !== "MT" || X.mt; });
    var fx = (X.FX[id] || {})[d], atual = (X.G[id] || {})[d] || "";
    m.innerHTML = "<b>Turno · " + esc(c.curto || "") + " · dia " + d + "</b><div>" + cods.map(function (k) { return "<button data-k='" + k + "'>" + k + "</button>"; }).join("") + (/^(F|FD)$/.test(atual) ? "<button data-k=''>Limpar</button>" : X.apr ? "" : fx ? "<button data-s='1'>Soltar turno</button>" : atual ? "<button data-f='1'>Fixar turno</button>" : "") + "</div>";
    m.onclick = function (e) {
      var b = e.target.closest("button"); if (!b) return; m.remove();
      if (b.dataset.f) { pôr(id, d, atual, true); pintar(); }   // fica como está: não é preciso ajustar nada
      else if (b.dataset.s) definir(id, d, atual, false); else definir(id, d, b.dataset.k, !!b.dataset.k);
    };
    $("#vApp").appendChild(m);
    var r = td.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
    m.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left - w / 2)) + "px"; m.style.top = (r.bottom + h + 8 < innerHeight ? r.bottom + 4 : Math.max(8, r.top - h - 4)) + "px";
    m.querySelector("button").focus();
  }
  function pôr(i, d, k, fx) {
    var g = X.G[i] = X.G[i] || {}, F = X.FX[i] = X.FX[i] || {}, ori = (X.ORI[i] || {})[d] || "", oriF = !!(X.FXO[i] || {})[d], ch = i + "|" + d;
    if (k) g[d] = k; else delete g[d];
    if (fx) F[d] = true; else delete F[d];
    if (k === ori && !!fx === oriF) delete X.ALT[ch]; else X.ALT[ch] = k;
  }
  function definir(id, d, k, fx) {
    pôr(id, d, k, fx); X.P.forEach(function (l) { if (l.espelho === id && !(X.FX[l.colaborador_id] || {})[d] && !foraDe(l.colaborador_id, d)) pôr(l.colaborador_id, d, k, false); });   // o que se mudou na própria pessoa mantém-se
    ajustar();
  }
  function ajustar() {   // depois de uma mudança: nada muda sozinho; se ficar um erro novo, a app procura sugestões
    X.SUG = {}; X.inv = ""; X.nr = (X.nr || 0) + 1;   // um cálculo ainda a correr já não vale: não sabe desta mudança
    if (X.apr || !errosNovos().length) { X.calc = false; clearTimeout(X.tm); return pintar(); }
    X.calc = true; pintar();
    clearTimeout(X.tm); X.tm = setTimeout(function () { projetar("sugerir"); }, 500);   // vários toques seguidos dão uma só procura
  }
  async function propor() {
    if (!await msbConfirma("A app faz uma proposta para o mês. Ficam como estão: os dias que já passaram, os turnos mudados à mão (sublinhados) e as férias. Só fica guardado quando carregar em Gravar.", "Propor horário")) return;
    X.SUG = {}; projetar("propor");
  }
  /* Dias especiais: cada período põe o código no horário (fixado) e o ajuste trata do resto. Motivo só para administradores (RLS) */
  var TIPOS = {ferias: ["Férias", "F", ""], baixa: ["Baixa doença", "FG", "B"], formacao: ["Formação", "FG", "Fr"], aniversario: ["Dia de aniversário", "FG", "A"], outros: ["Outros", "FG", "O"]}, ADIAR = {};
  function diasDe(e) {
    var ini = X.M + "-01", fim = X.M + "-" + String(X.dias.length).padStart(2, "0"), L = [];
    if (e.ate < ini || e.de > fim) return L;
    for (var d = e.de < ini ? 1 : +e.de.slice(8), f = e.ate > fim ? X.dias.length : +e.ate.slice(8); d <= f; d++) L.push(d);
    return L;
  }
  function mapaEsp() { X.EM = {}; X.ESP.forEach(function (e) { var m = X.EM[e.colaborador_id] = X.EM[e.colaborador_id] || {}; diasDe(e).forEach(function (d) { m[d] = e; }); }); }
  /* fora do período da pessoa nesta estação (msb_colab_lojas.desde / ate, 19/11/2026): entrou ou saiu a meio do mês */
  function foraDe(id, d) {
    var l = (X.LJ || []).find(function (q) { return q.colaborador_id === id; }) || {}, iso = X.M + "-" + String(d).padStart(2, "0");
    return !!((l.desde && iso < l.desde) || (l.ate && iso > l.ate));
  }
  function abate(id) {   // férias contam pelo código F; baixa, formação e outros contam em dias úteis. O aniversário é só um dia de folga: não baixa a meta (dono, 19/11/2026)
    var n = 0, m = X.EM[id] || {};
    X.dias.forEach(function (d) { var iso = X.M + "-" + String(d).padStart(2, "0"), w = new Date(iso + "T12:00:00").getDay(); if (!m[d] && foraDe(id, d) && w > 0 && w < 6 && !X.fer[iso]) n++; });   // dias úteis fora do período baixam a meta
    Object.keys(m).forEach(function (d) {
      var e = m[d], iso = X.M + "-" + String(d).padStart(2, "0"), w = new Date(iso + "T12:00:00").getDay();
      if (e.tipo !== "ferias" && e.tipo !== "aniversario" && w > 0 && w < 6 && !X.fer[iso]) n++;
    });
    return n;
  }
  function aplicarEsp() {
    var n = 0;
    X.ESP.forEach(function (e) {
      var id = e.colaborador_id, k = TIPOS[e.tipo][1];
      if (!X.P.some(function (l) { return l.colaborador_id === id; })) return;
      diasDe(e).forEach(function (d) { if ((X.G[id] || {})[d] !== k || !(X.FX[id] || {})[d]) { pôr(id, d, k, true); n++; } });
    });
    if (n) X.ed = true;
    return n;
  }
  async function lerEsp(ids) {
    var r = await sb.from("msb_horario_especiais").select("id,colaborador_id,tipo,de,ate,nota").in("colaborador_id", ids).lte("de", X.M + "-" + String(X.dias.length).padStart(2, "0")).gte("ate", X.M + "-01").order("de");
    if (r.error) throw r.error;
    X.ESP = r.data; mapaEsp();
  }
  function cartaoEsp() {
    var f = X.espF, op = X.P.map(function (l) { var c = X.C[l.colaborador_id] || {}; return "<option value='" + l.colaborador_id + "'" + (+f.c === l.colaborador_id ? " selected" : "") + ">" + esc(c.curto || "") + "</option>"; }).join(""), ti = Object.keys(TIPOS).map(function (k) { return "<option value='" + k + "'" + (f.t === k ? " selected" : "") + ">" + TIPOS[k][0] + "</option>"; }).join("");
    return "<div class='bl'><h3>Especiais</h3><div class='ff'><label>Funcionário<select id='espC'><option value=''></option>" + op + "</select></label><label>Tipo<select id='espT'>" + ti + "</select></label><label>De<input type='date' id='espDe' value='" + esc(f.de) + "'></label><label>Até<input type='date' id='espAte' value='" + esc(f.ate) + "'></label><label>Nota<input id='espN' value='" + esc(f.n) + "'></label></div>" +
      "<div class='bar' style='margin-top:8px'><button class='btn p' id='espOk'>" + (f.id ? "Guardar alteração" : "Marcar") + "</button>" + "<button class='btn' id='espFecha'>Fechar</button>" + (f.id ? "<button class='btn' id='espLimpa'>Cancelar</button><button class='btn' id='espDel'>Apagar</button>" : "") + "</div>" +
      (X.ESP.length ? "<div class='sc' style='margin-top:8px'><table><thead><tr><th class='l'>Funcionário</th><th class='l'>Tipo</th><th>De</th><th>Até</th><th class='l'>Nota</th></tr></thead><tbody>" + X.ESP.map(function (e) { return "<tr><td class='l'><a href='#' data-esp='" + e.id + "'>" + esc((X.C[e.colaborador_id] || {}).curto || "") + "</a></td><td class='l'>" + TIPOS[e.tipo][0] + "</td><td>" + dmy(e.de) + "</td><td>" + dmy(e.ate) + "</td><td class='l'>" + esc(e.nota || "") + "</td></tr>"; }).join("") + "</tbody></table></div><p class='rod'>Toca no nome para mudar ou apagar.</p>" : "<p class='rod'>Sem dias especiais neste mês.</p>") + "</div>";
  }
  function novoEspF() { return {id: null, c: "", t: "ferias", de: "", ate: "", n: ""}; }
  function ligarEsp() {
    var f = X.espF, liga = function (id, k) { var x = $(id); x.onchange = x.oninput = function () { f[k] = x.value; if (k === "de" && (!f.ate || f.ate < f.de)) { f.ate = f.de; $("#espAte").value = f.de; } }; };
    liga("#espC", "c"); liga("#espT", "t"); liga("#espDe", "de"); liga("#espAte", "ate"); liga("#espN", "n");
    $("#espOk").onclick = guardarEsp;
    $("#espFecha").onclick = function () { X.esp = false; X.espF = novoEspF(); pintar(); };
    var e = function (id, g) { var x = $(id); if (x) x.onclick = g; };
    e("#espLimpa", function () { X.espF = novoEspF(); pintar(); }); e("#espDel", apagarEsp);
    [].forEach.call(document.querySelectorAll("#v-hor a[data-esp]"), function (a) { a.onclick = function (ev) { ev.preventDefault(); editarEsp(X.ESP.find(function (q) { return q.id === +a.dataset.esp; })); }; });
  }
  function editarEsp(e) { X.esp = true; X.espF = {id: e.id, c: e.colaborador_id, t: e.tipo, de: e.de, ate: e.ate, n: e.nota || "", old: e}; pintar(); $("#espOk").scrollIntoView({block: "center"}); }
  async function soltarOutrosMeses(e) {   // nos outros meses a folga fica, mas deixa de estar presa; ajusta-se ao abrir esse mês
    var ini = X.M + "-01", fim = addMes(X.M, 1) + "-01";
    if (e.de < ini) await sb.from("msb_horario_dias").update({fixo: false}).eq("colaborador_id", e.colaborador_id).gte("dia", e.de).lte("dia", e.ate).lt("dia", ini);
    if (e.ate >= fim) await sb.from("msb_horario_dias").update({fixo: false}).eq("colaborador_id", e.colaborador_id).gte("dia", e.de).lte("dia", e.ate).gte("dia", fim);
  }
  function depoisEsp(antes) {   // antes = dias do período antigo neste mês: os que deixaram de ser especiais voltam a ficar livres
    mapaEsp();
    var n = 0, id = antes.id;
    antes.d.forEach(function (d) { if (!(X.EM[id] || {})[d]) { pôr(id, d, "", false); n++; } });
    n += aplicarEsp(); X.espF = novoEspF();
    if (n) { X.ed = true; ajustar(); } else pintar();
  }
  async function guardarEsp() {
    var f = X.espF, de = f.de, ate = f.ate || f.de, c = +f.c;
    if (!c) return msbAviso("Erro: escolhe o funcionário.");
    if (!de) return msbAviso("Erro: escolhe a data.");
    if (ate < de) return msbAviso("Erro: a data final é anterior à inicial.");
    try {
      var q = await sb.from("msb_horario_especiais").select("id").eq("colaborador_id", c).lte("de", ate).gte("ate", de);
      if (q.error) throw q.error;
      if (q.data.some(function (x) { return x.id !== f.id; })) return msbAviso("Erro: essa pessoa já tem um dia especial nesse período.");
      var dados = {colaborador_id: c, tipo: f.t, de: de, ate: ate, nota: f.n.trim() || null};
      var r = f.id ? await sb.from("msb_horario_especiais").update(dados).eq("id", f.id) : await sb.from("msb_horario_especiais").insert(Object.assign({criado_por: EU && EU.id}, dados));
      if (r.error) throw r.error;
      var antes = {id: f.old ? f.old.colaborador_id : c, d: f.old ? diasDe(f.old) : []};
      if (f.old) await soltarOutrosMeses(f.old);
      await lerEsp(X.P.map(function (l) { return l.colaborador_id; }));
      depoisEsp(antes);
    } catch (e) { msbAviso("Erro: " + falhou(e)); }
  }
  async function apagarEsp() {
    var f = X.espF, e = f.old; if (!e) return;
    if (!await msbConfirma("Apagar " + TIPOS[e.tipo][0] + " de " + ((X.C[e.colaborador_id] || {}).curto || "") + "? Esses dias voltam a ficar livres no horário.", "Apagar")) return;
    try {
      var r = await sb.from("msb_horario_especiais").delete().eq("id", e.id);
      if (r.error) throw r.error;
      var antes = {id: e.colaborador_id, d: diasDe(e)};
      await soltarOutrosMeses(e);
      await lerEsp(X.P.map(function (l) { return l.colaborador_id; }));
      depoisEsp(antes);
    } catch (x) { msbAviso("Erro: " + falhou(x)); }
  }
  /* Projetar o resto: fica o que está fixado, as férias e os dias que já passaram; o resto do mês sai das regras */
  var HIGHS = "https://cdn.jsdelivr.net/npm/highs@1.15.4/build/";
  function calcular(lp, auto) {
    var src = "importScripts('" + HIGHS + "highs.js');onmessage=async function(e){try{var h=await Module({locateFile:function(f){return '" + HIGHS + "'+f}});postMessage({ok:h.solve(e.data,{time_limit:" + (auto ? 25 : 75) + ",mip_rel_gap:" + (auto ? 0.005 : 0.03) + "})})}catch(x){postMessage({erro:String(x)})}}";
    return new Promise(function (ok, ko) {
      var w = new Worker(URL.createObjectURL(new Blob([src], {type: "text/javascript"}))), t = setTimeout(function () { w.terminate(); ko(new Error("O cálculo demorou demasiado.")); }, 120000);
      w.onmessage = function (e) { clearTimeout(t); w.terminate(); if (e.data.erro) ko(new Error(e.data.erro)); else ok(e.data.ok); };
      w.onerror = function (e) { clearTimeout(t); w.terminate(); ko(new Error(e.message || "Não consegui abrir o motor de cálculo.")); };
      w.postMessage(lp);
    });
  }
  async function dadosProjecao(auto) {
    var ano = +X.M.slice(0, 4), mes = +X.M.slice(5), hj = hoje(), base = HOR.meta(ano, mes, X.dias.length, X.fer);
    var ES = X.P.filter(function (l) { return l.escala && !l.espelho; });
    var AC = X.AC;
    if (!AC) {
      var h = await sb.from("msb_horario_dias").select("colaborador_id,codigo").eq("estacao", EST).gte("dia", addMes(X.M, -6) + "-01").lt("dia", X.M + "-01").in("codigo", ["M", "T", "MT"]).limit(3000);
      if (h.error) throw h.error;
      AC = {}; h.data.forEach(function (x) { var a = AC[x.colaborador_id] = AC[x.colaborador_id] || {M: 0, T: 0}; if (x.codigo !== "T") a.M++; if (x.codigo !== "M") a.T++; });
      X.AC = AC;
    }
    var minM = Infinity, minT = Infinity; ES.forEach(function (l) { var a = AC[l.colaborador_id] || {M: 0, T: 0}; minM = Math.min(minM, a.M); minT = Math.min(minT, a.T); });
    var P = ES.map(function (l) {
      var g = X.G[l.colaborador_id] || {}, fx = X.FX[l.colaborador_id] || {}, fixos = {}, fu = 0, a = AC[l.colaborador_id] || {M: 0, T: 0};
      X.dias.forEach(function (d) {
        var c = g[d], iso = X.M + "-" + String(d).padStart(2, "0");
        if (!c && foraDe(l.colaborador_id, d)) { fixos[d] = "FG"; return; }   // ainda não tinha entrado ou já saiu: a escala não lhe dá turnos (no ecrã fica vazio)
        if (!c) return;
        if (fx[d] || c === "F" || c === "FD" || iso < hj) fixos[d] = c;
        var w = new Date(iso + "T12:00:00").getDay(); if (c === "F" && w > 0 && w < 6 && !X.fer[iso]) fu++;
      });
      return {id: l.colaborador_id, fixos: fixos, ant: (X.ANT[l.colaborador_id] || []).slice(-6).map(function (x) { return x[1]; }), fdsAnt: X.FDS[l.colaborador_id] || "", meta: base - fu - abate(l.colaborador_id), off: {M: a.M - minM, T: a.T - minT}, reforco: l.codigo === X.reforco, atual: auto ? Object.assign({}, g) : null};
    });
    var oM = {}, oT = {}, fora = 0;
    X.P.forEach(function (l) { if (l.escala || l.espelho) return; X.dias.forEach(function (d) { var c = (X.G[l.colaborador_id] || {})[d]; if (c === "M" || c === "MT") { oM[d] = (oM[d] || 0) + 1; fora++; } if (c === "T" || c === "MT") { oT[d] = (oT[d] || 0) + 1; fora++; } }); });
    var sem = X.mt && !X.semMT ? HOR.semanasMT(ano, mes, X.dias.length, X.fer) : [];
    HORG.alvos(P, 2 * X.dias.length + sem.length - fora);
    return {P: P, op: {y: ano, m: mes, fer: X.fer, mtSemanas: sem, outrosM: oM, outrosT: oT}};
  }
  async function projetar(modo) {   // "sugerir" = depois de uma mudança, mexe no mínimo e só mostra; "propor" = refaz o mês e põe no ecrã
    var auto = modo === "sugerir";
    if (X.apr) return;
    var ES = X.P.filter(function (l) { return l.escala && !l.espelho; }), ctx = X, nr = X.nr = (X.nr || 0) + 1;
    if (!ES.length) { X.calc = false; pintar(); return msbAviso("Erro: não há pessoas na escala deste mês."); }
    clearTimeout(X.tm); X.calc = true; X.inv = ""; pintar();
    try {
      var D = await dadosProjecao(auto), r = await calcular(HORG.modelo(D.P, D.op), auto);
      if (ctx !== X || nr !== X.nr) return;   // entretanto mudou de mês ou voltou a editar
      if (!r || !r.Columns || /infeasible/i.test(r.Status || "")) { X.calc = false; X.inv = "Com os turnos mudados à mão não há forma de cobrir todos os turnos do mês."; pintar(); return msbAviso("Sem sugestão: veja a razão em cima."); }
      var S = HORG.ler(D.P, D.op, r.Columns), mudou = 0;
      if (auto) {
        X.SUG = {};
        D.P.forEach(function (p, i) { X.dias.forEach(function (d) { if (p.fixos[d] || (X.FX[p.id] || {})[d]) return; var de = (X.G[p.id] || {})[d] || ""; if (de !== S[i][d]) X.SUG[p.id + "|" + d] = {de: de, para: S[i][d]}; }); });
        X.calc = false; pintar(); var k = Object.keys(X.SUG).length;
        return msbAviso(k ? "A app sugere " + k + " mudança(s). Aceite ou ignore." : "Não encontrei sugestão que resolva sem mexer no que mudou à mão.");
      }
      D.P.forEach(function (p, i) { X.dias.forEach(function (d) {
        if (p.fixos[d] || (X.FX[p.id] || {})[d]) return;
        if ((X.G[p.id] || {})[d] !== S[i][d]) mudou++;
        pôr(p.id, d, S[i][d], false); X.P.forEach(function (l) { if (l.espelho === p.id && !(X.FX[l.colaborador_id] || {})[d] && !foraDe(l.colaborador_id, d)) pôr(l.colaborador_id, d, S[i][d], false); });
      }); });
      X.calc = false; pintar();
      msbAviso("Proposta pronta (" + mudou + " turno(s) mudados). Veja e carregue em Gravar.");
    } catch (e) { if (ctx !== X || nr !== X.nr) return; X.calc = false; pintar(); msbAviso("Erro: " + falhou(e)); }
  }
  async function gravar() {
    var n = X.R.erros.length;
    if (n && !await msbConfirma("O horário tem " + n + " erro(s) nas regras. Gravar na mesma?", "Gravar na mesma")) return;
    var est = EST, P = [], D = [], jaHa = Object.keys(X.ORI).length;
    Object.keys(X.ALT).forEach(function (k) {
      var a = k.split("|"), dia = X.M + "-" + String(a[1]).padStart(2, "0");
      if (X.ALT[k]) P.push({estacao: est, dia: dia, colaborador_id: +a[0], codigo: X.ALT[k], fixo: !!(X.FX[a[0]] || {})[a[1]], atualizado_em: new Date().toISOString(), atualizado_por: EU && EU.id}); else D.push({dia: dia, c: +a[0]});
    });
    try {
      if (!X.INI) {   // primeira gravação de um mês sem inicial: o que lá estava, ou esta versão se estava vazio
        var ini = await sb.from("msb_horario_inicial").insert({estacao: est, mes: X.M, dias: jaHa ? fotografia(X.ORI, X.FXO) : fotografia(X.G, X.FX), criado_por: EU && EU.id});
        if (ini.error) throw ini.error;
      }
      if (P.length) { var r = await sb.from("msb_horario_dias").upsert(P, {onConflict: "estacao,dia,colaborador_id"}); if (r.error) throw r.error; }
      for (var i = 0; i < D.length; i++) { var q = await sb.from("msb_horario_dias").delete().eq("estacao", est).eq("dia", D[i].dia).eq("colaborador_id", D[i].c); if (q.error) throw q.error; }
      await sb.from("msb_horario_meses").update({atualizado_em: new Date().toISOString(), origem: "Editado na app"}).eq("estacao", est).eq("mes", X.M);
      delete ADIAR[est + X.M]; msbAviso("Horário gravado"); X.ALT = {}; abrir(X.M);
    } catch (e) { msbAviso("Erro: " + falhou(e)); }
  }
  function fotografia(G, F) {
    var L = []; Object.keys(G).forEach(function (i) { Object.keys(G[i]).forEach(function (d) { L.push([+d, +i, G[i][d], !!(F[i] || {})[d]]); }); });
    return L;
  }
  async function voltarInicial() {
    if (!X.INI) return;
    if (!await msbConfirma("Voltar ao horário inicial de " + nomeMes(X.M) + "? Só fica guardado quando carregares em Gravar.", "Voltar ao inicial")) return;
    clearTimeout(X.tm); X.nr = (X.nr || 0) + 1; X.calc = false;
    var S = {}; X.INI.dias.forEach(function (x) { (S[x[1]] = S[x[1]] || {})[x[0]] = [x[2], x[3]]; });
    Object.keys(S).forEach(function (i) { if (!X.P.some(function (l) { return l.colaborador_id === +i; })) { var l = X.LJ.find(function (q) { return q.colaborador_id === +i; }); if (l) X.P.push(l); } });
    X.P.forEach(function (l) { X.dias.forEach(function (d) { var v = (S[l.colaborador_id] || {})[d] || ["", false]; pôr(l.colaborador_id, d, v[0], v[1]); }); });
    pintar(); msbAviso("Voltei ao horário inicial. Confere e grava.");
  }
  async function definirInicial() {
    if (!await msbConfirma("Guardar o horário de " + nomeMes(X.M) + " como está agora como horário inicial? O inicial anterior é substituído.", "Guardar como inicial")) return;
    var dias = fotografia(X.ORI, X.FXO), r = await sb.from("msb_horario_inicial").upsert({estacao: EST, mes: X.M, dias: dias, criado_em: new Date().toISOString(), criado_por: EU && EU.id}, {onConflict: "estacao,mes"});
    if (r.error) return msbAviso("Erro: " + falhou(r.error));
    X.INI = {dias: dias}; msbAviso("Horário inicial guardado");
  }
  async function selar() {
    var n = verif().erros.length;
    if (Object.keys(X.ALT).length) return msbAviso("Erro: grave as alterações antes de aprovar.");
    if (!await msbConfirma("Aprovar o horário de " + nomeMes(X.M) + "? Os funcionários passam a vê-lo na app." + (n ? " Atenção: tem " + n + " erro(s) crítico(s) nas regras." : ""), "Aprovar")) return;
    var r = await sb.from("msb_horario_meses").update({estado: "real", aprovado_em: new Date().toISOString(), aprovado_por: quemSou()}).eq("estacao", EST).eq("mes", X.M);
    if (r.error) return msbAviso("Erro: " + falhou(r.error)); abrir(X.M);
  }
  async function tirarSelo() {
    if (!await msbConfirma("Tirar a aprovação de " + nomeMes(X.M) + "? Os funcionários deixam de ver este horário até o aprovar outra vez.", "Tirar a aprovação")) return;
    var r = await sb.from("msb_horario_meses").update({estado: "simulacao", aprovado_em: null, aprovado_por: null}).eq("estacao", EST).eq("mes", X.M);
    if (r.error) return msbAviso("Erro: " + falhou(r.error)); abrir(X.M);
  }
  /* Envio aos funcionários: fica na app (quem tem conta vê o que está selado) e segue o PDF, por email pelo OCTAN AI ou partilhado pelo telemóvel */
  function linhasEnvio() { return X.P.filter(function (l) { return Object.keys(X.G[l.colaborador_id] || {}).length; }); }
  async function abrirEnvio() {
    if (Object.keys(X.ALT).length) return msbAviso("Erro: grava as alterações antes de enviar.");
    var ids = linhasEnvio().map(function (l) { return l.colaborador_id; }), c = await sb.from("msb_colab_contactos").select("colaborador_id,email").in("colaborador_id", ids), u = await sb.from("msb_horario_envios").select("estado,para,erro,criado").eq("estacao", EST).eq("mes", X.M).order("id", {ascending: false}).limit(1);
    if (c.error || u.error) return msbAviso("Erro: " + falhou(c.error || u.error));
    X.MAIL = {}; (c.data || []).forEach(function (x) { X.MAIL[x.colaborador_id] = x.email; });
    try {   // o email da conta da app (Equipa) manda; o guardado só serve a quem não tem conta
      var q = await sb.functions.invoke("msb-equipa", {body: {acao: "listar"}});
      if (!q.error && q.data && q.data.equipa) {
        var A = HOR.emailsContas(ids.map(function (i) { return {id: i, nome: (X.C[i] || {}).nome}; }), q.data.equipa.map(function (p) { return {nome: p.display_name, email: p.email, banido: p.banido}; }));
        X.CONTA = {}; Object.keys(A).forEach(function (i) { if (X.MAIL[i] !== A[i]) { X.MAIL[i] = A[i]; X.CONTA[i] = 1; } });   // regra do dono: manda o email da equipa
      }
    } catch (e) { /* sem contas: escreve-se à mão */ }
    X.ultEnv = (u.data || [])[0] || null; X.envio = true; pintar();
  }
  function cartaoEnvio() {
    var u = X.ultEnv, E = {pendente: "Na fila: sai dentro de minutos, com o PC ligado.", a_enviar: "A enviar.", enviado: "Enviado.", erro: "Falhou: "};
    return "<div class='aviso' style='display:grid;gap:8px'><b>Enviar o horário de " + esc(nomeMes(X.M)) + "</b><div class='mut' style='font-size:13px'>O PDF leva os turnos extra assinalados. Quem tem conta também vê o horário na app.</div>" +
      linhasEnvio().map(function (l) { var c = X.C[l.colaborador_id] || {}, m = X.MAIL[l.colaborador_id] || ""; return "<label style='display:grid;grid-template-columns:24px minmax(90px,150px) minmax(0,1fr);gap:8px;align-items:center;margin:0'><input type='checkbox' class='envSim' data-c='" + l.colaborador_id + "'" + (m ? " checked" : "") + " aria-label='Enviar a " + esc(c.curto || "") + "'><span>" + esc(c.curto || "") + "</span><input type='email' class='envMail' data-c='" + l.colaborador_id + "' value='" + esc(m) + "' placeholder='email' autocomplete='off' title='" + ((X.CONTA || {})[l.colaborador_id] ? "Email da conta da app" : "") + "'></label>"; }).join("") +
      "<div class='bar'><button class='btn p' id='envMail'>Enviar por email</button><button class='btn' id='envPdf'>Partilhar PDF</button><button class='btn' id='envFim'>Fechar</button></div>" +
      (u ? "<div class='mut' style='font-size:13px'>Último envio: " + u.para.length + " pessoa(s) · " + esc(E[u.estado] || "") + (u.estado === "erro" ? esc(u.erro || "") : "") + "</div>" : "") + "</div>";
  }
  function ligarEnvio() {
    $("#envFim").onclick = function () { X.envio = false; pintar(); };
    $("#envMail").onclick = enviarEmail; $("#envPdf").onclick = partilhar;
    [].forEach.call(document.querySelectorAll(".envMail"), function (i) { i.oninput = function () { var s = document.querySelector(".envSim[data-c='" + i.dataset.c + "']"); s.checked = !!i.value.trim(); }; });
  }
  async function marcarEnviado() {
    var t = new Date().toISOString(), r = await sb.from("msb_horario_meses").update({enviado_em: t}).eq("estacao", EST).eq("mes", X.M); if (r.error) throw r.error;
    X.env = t;
  }
  async function enviarEmail() {
    var b = $("#envMail"), L = [].filter.call(document.querySelectorAll(".envSim"), function (s) { return s.checked; }).map(function (s) { return {c: +s.dataset.c, e: document.querySelector(".envMail[data-c='" + s.dataset.c + "']").value}; }), T = HOR.emails(L.map(function (x) { return x.e; }));
    if (T.maus.length) return msbAviso("Erro: email inválido: " + T.maus.join(", "));
    if (!T.ok.length) return msbAviso("Erro: escreve pelo menos um email.");
    if (!await msbConfirma("Enviar o horário de " + nomeMes(X.M) + " a " + T.ok.length + " pessoa(s)?", "Enviar")) return;
    b.disabled = true;
    try {
      var C = L.filter(function (x) { return x.e.trim().toLowerCase() !== X.MAIL[x.c] || (X.CONTA || {})[x.c]; }).map(function (x) { return {colaborador_id: x.c, email: x.e.trim().toLowerCase()}; });
      if (C.length) { var r0 = await sb.from("msb_colab_contactos").upsert(C, {onConflict: "colaborador_id"}); if (r0.error) throw r0.error; }
      var cam = EST + "/horarios/" + X.M + "_" + Date.now() + ".pdf", r1 = await sb.storage.from("msb-originais").upload(cam, await gerarPdf(true), {contentType: "application/pdf", upsert: false}); if (r1.error) throw r1.error;
      var r2 = await sb.from("msb_horario_envios").insert({estacao: EST, mes: X.M, para: T.ok, assunto: "Horário de " + nomeMes(X.M) + " · " + nomeLoja(), original: cam, pedido_por: quemSou()}); if (r2.error) throw r2.error;
      await marcarEnviado(); X.envio = false; pintar(); msbAviso("Na fila: o OCTAN AI envia dentro de minutos, com o PC ligado.");
    } catch (e) { b.disabled = false; msbAviso("Erro: " + falhou(e)); }
  }
  async function partilhar() {
    try {
      var blob = await gerarPdf(true), f = new File([blob], ficheiro("pdf"), {type: "application/pdf"});
      if (navigator.canShare && navigator.canShare({files: [f]})) { try { await navigator.share({files: [f], title: "Horário de " + nomeMes(X.M)}); } catch (e) { if (e.name === "AbortError") return; throw e; } }
      else { descarregar(blob, ficheiro("pdf")); msbAviso("PDF descarregado: envia-o por WhatsApp ou email."); }
      await marcarEnviado(); pintar();
    } catch (e) { msbAviso("Erro: " + falhou(e)); }
  }
  async function criar() {
    var r = await sb.from("msb_horario_meses").upsert({estacao: EST, mes: X.M, estado: "simulacao", origem: "Criado na app"}, {onConflict: "estacao,mes"});
    if (r.error) return msbAviso("Erro: " + falhou(r.error)); X.criado = true; abrir(X.M);
  }
  /* Excel com a estrutura do template do Picaponto: título em C1, dias da semana na linha 2, Código | Colaborador | dias na linha 3, legenda em AI:AJ */
  async function excel() {
    var inval = [], val = {}; X.leg.forEach(function (l) { val[l[0]] = 1; });
    X.P.forEach(function (l) { X.dias.forEach(function (d) { var v = (X.G[l.colaborador_id] || {})[d]; if (v && !val[v]) inval.push((X.C[l.colaborador_id] || {}).curto + " dia " + d + ": " + v); }); if (!l.nome_picaponto) inval.push((X.C[l.colaborador_id] || {}).curto + ": sem nome do Picaponto"); });
    if (inval.length) return msbAviso("Erro: o Picaponto não aceitaria " + inval.slice(0, 4).join("; "));
    var n = X.R.erros.length; if (n && !await msbConfirma("O horário tem " + n + " erro(s) nas regras. Exportar na mesma?", "Exportar na mesma")) return;
    await carregarXlsxMSB();
    var AI = 34, A = [], lin = function () { return new Array(AI + 2).fill(null); };
    var l1 = lin(); l1[2] = nomeMes(X.M); A.push(l1);
    var l2 = lin(); X.dias.forEach(function (d) { l2[1 + d] = SEM[new Date(X.M + "-" + String(d).padStart(2, "0") + "T12:00:00").getDay()]; }); A.push(l2);
    var l3 = lin(); l3[0] = "Código"; l3[1] = "Colaborador"; X.dias.forEach(function (d) { l3[1 + d] = d; }); l3[AI] = "Códigos"; l3[AI + 1] = "Período de Horário"; A.push(l3);
    var nl = Math.max(X.P.length, X.leg.length);
    for (var i = 0; i < nl; i++) {
      var r = lin(), p = X.P[i], g = X.leg[i];
      if (p) { r[0] = +p.codigo; r[1] = p.nome_picaponto; X.dias.forEach(function (d) { var v = (X.G[p.colaborador_id] || {})[d]; if (v) r[1 + d] = v; }); }
      if (g) { r[AI] = g[0]; r[AI + 1] = g[1]; }
      A.push(r);
    }
    var ws = XLSX.utils.aoa_to_sheet(A), wb = XLSX.utils.book_new();
    ws["!merges"] = [{s: {r: 0, c: 2}, e: {r: 0, c: 1 + X.dias.length}}];
    ws["!cols"] = [{wch: 8}, {wch: 24}].concat(new Array(31).fill({wch: 5}));
    XLSX.utils.book_append_sheet(wb, ws, nomeMes(X.M));
    var bin = XLSX.write(wb, {bookType: "xlsx", type: "array"});
    descarregar(new Blob([bin], {type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}), ficheiro("xlsx"));
    msbAviso("Excel pronto para importar no Picaponto");
  }
  /* A4 deitada, uma página, sem a coluna Código */
  async function pdf() { descarregar(await gerarPdf(false), ficheiro("pdf")); }
  async function gerarPdf(funcionarios) {   // para os funcionários vai sem a marcação dos turnos extra, que na app só o administrador vê
    await carregarPdfLib();
    var P = window.PDFLib, doc = await P.PDFDocument.create(), F = await doc.embedFont(P.StandardFonts.Helvetica), B = await doc.embedFont(P.StandardFonts.HelveticaBold), pg = doc.addPage([841.89, 595.28]);
    var W = 841.89, M = 28, nome = 96, col = (W - 2 * M - nome) / X.dias.length, alt = 26, y = 595.28 - 44;
    var az = P.rgb(0, 0.231, 0.361), tx = P.rgb(0.09, 0.14, 0.19), lin = P.rgb(0.8, 0.84, 0.88), fds = P.rgb(0.918, 0.941, 0.969), fe = P.rgb(0.984, 0.945, 0.89);
    pg.drawText(nomeLoja() + " – Horário " + nomeMes(X.M), {x: M, y: y + 12, size: 15, font: B, color: az});
    var centro = function (t, x, yy, fonte, s, cor) { pg.drawText(t, {x: x + col / 2 - fonte.widthOfTextAtSize(t, s) / 2, y: yy, size: s, font: fonte, color: cor || tx}); };
    var fundo = function (d, yy, h) { var iso = X.M + "-" + String(d).padStart(2, "0"), w = new Date(iso + "T12:00:00").getDay(), c = X.fer[iso] ? fe : (w === 0 || w === 6) ? fds : null; if (c) pg.drawRectangle({x: M + nome + (d - 1) * col, y: yy, width: col, height: h, color: c}); };
    y -= 20;
    X.dias.forEach(function (d) { fundo(d, y - 8, alt + 4); centro(String(d), M + nome + (d - 1) * col, y + 8, B, 9); centro(SEM[new Date(X.M + "-" + String(d).padStart(2, "0") + "T12:00:00").getDay()], M + nome + (d - 1) * col, y - 3, F, 6.5); });
    pg.drawText("Colaborador", {x: M + 3, y: y + 3, size: 9, font: B, color: tx}); y -= 8;
    pg.drawLine({start: {x: M, y: y}, end: {x: W - M, y: y}, thickness: 0.8, color: az});
    var EX = mapaExtras(), ver = P.rgb(0.749, 0.902, 0.776), linhas = X.P.filter(function (l) { return Object.keys(X.G[l.colaborador_id] || {}).length; });
    linhas.forEach(function (l) {
      var c = X.C[l.colaborador_id] || {}; y -= alt;
      X.dias.forEach(function (d) { fundo(d, y, alt); var v = (X.G[l.colaborador_id] || {})[d] || "", e = (EX[l.colaborador_id] || []).indexOf(d) >= 0; if (e) pg.drawRectangle({x: M + nome + (d - 1) * col, y: y, width: col, height: alt, color: ver}); if (v) centro(v, M + nome + (d - 1) * col, y + 9, e ? B : F, 9); });
      pg.drawText(c.nome || "", {x: M + 3, y: y + 9, size: 9, font: B, color: tx});
      pg.drawLine({start: {x: M, y: y}, end: {x: W - M, y: y}, thickness: 0.4, color: lin});
    });
    pg.drawText("M manhã · T tarde" + (X.mt ? " · MT turno M/T" : "") + " · FG folga · F férias · FD feriado", {x: M, y: y - 16, size: 8, font: F, color: tx});
    { var lx = M + F.widthOfTextAtSize("M manhã · T tarde" + (X.mt ? " · MT turno M/T" : "") + " · FG folga · F férias · FD feriado", 8) + 14; pg.drawRectangle({x: lx, y: y - 18, width: 11, height: 11, color: ver, borderColor: P.rgb(0.08, 0.19, 0.11), borderWidth: 0.6}); pg.drawText("Turno extra", {x: lx + 15, y: y - 16, size: 8, font: B, color: tx}); }
    await marcaPdf(doc, pg, F, B, M, 18);
    return new Blob([await doc.save()], {type: "application/pdf"});
  }
  async function abrir(M) {
    var box = $("#v-hor"); M = M || MES || hoje().slice(0, 7); MES = M; var est = EST; if (X) clearTimeout(X.tm);
    box.innerHTML = "<div class='bl ske' style='height:260px'></div>";
    try {
      var ini = addDia(M + "-01", -14), fim = addMes(M, 1) + "-01";
      var R = await Promise.all([
        sb.from("msb_horario_dias").select("dia,colaborador_id,codigo,fixo").eq("estacao", est).gte("dia", ini).lt("dia", fim).limit(2000),
        sb.from("msb_colab_lojas").select("colaborador_id,codigo,ordem,nome_picaponto,escala,espelho,desde,ate").eq("estacao", est).order("ordem"),
        sb.from("msb_colaboradores").select("id,curto,nome,ativo"),
        sb.from("msb_horario_meses").select("estado,sem_mt,aprovado_em,enviado_em,atualizado_em").eq("estacao", est).eq("mes", M).maybeSingle(),
        sb.from("msb_config").select("horario").eq("estacao", est).maybeSingle(),
        sb.from("msb_horario_inicial").select("dias").eq("estacao", est).eq("mes", M).maybeSingle()
      ]);
      R.forEach(function (r) { if (r.error) throw r.error; });
      if (est !== EST || M !== MES) return;
      var ano = +M.slice(0, 4), n = new Date(ano, +M.slice(5), 0).getDate(), cfg = (R[4].data && R[4].data.horario) || {};
      var C = {}; R[2].data.forEach(function (c) { C[c.id] = c; });
      var dias = []; for (var d = 1; d <= n; d++) dias.push(d);
      var G = {}, ORI = {}, ANT = {}, FX = {}, FXO = {};
      R[0].data.forEach(function (x) {
        var i = x.colaborador_id;
        if (x.dia.slice(0, 7) === M) { (G[i] = G[i] || {})[+x.dia.slice(8)] = x.codigo; (ORI[i] = ORI[i] || {})[+x.dia.slice(8)] = x.codigo; if (x.fixo) { (FX[i] = FX[i] || {})[+x.dia.slice(8)] = true; (FXO[i] = FXO[i] || {})[+x.dia.slice(8)] = true; } }
        else (ANT[i] = ANT[i] || []).push([x.dia, x.codigo]);
      });
      Object.keys(ANT).forEach(function (i) { ANT[i].sort(function (a, b) { return a[0] < b[0] ? -1 : 1; }); });
      var FDS = {}; Object.keys(ANT).forEach(function (i) { ANT[i].forEach(function (a) { var w = new Date(a[0] + "T12:00:00").getDay(); if (w === 6 || w === 0) FDS[i] = a[1]; }); });
      var existe = !!R[3].data && (ADMIN || R[3].data.estado === "real"), P = existe ? R[1].data.filter(function (l) { return G[l.colaborador_id] || ((C[l.colaborador_id] || {}).ativo && (!l.desde || l.desde < fim) && (!l.ate || l.ate >= M + "-01")); }) : [];
      X = {M: M, dias: dias, fer: feriados(ano), G: G, ORI: ORI, ANT: ANT, FX: FX, FXO: FXO, reforco: cfg.reforco, INI: R[5].data, LJ: R[1].data, ER0: [], inv: "", ESP: [], EM: {}, esp: !!(X && X.esp && X.M === M), espF: novoEspF(), FDS: FDS, C: C, P: P, ALT: {}, ed: !!ADMIN, menu: "", SUG: {}, pess: null, add: null, rolar: true, apr: existe ? R[3].data.aprovado_em : null, env: existe ? R[3].data.enviado_em : null, atu: existe ? R[3].data.atualizado_em : null, envio: false, MAIL: {}, ultEnv: null, estado: existe ? R[3].data.estado : "simulacao", semMT: existe && R[3].data.sem_mt, mt: !!cfg.mt, leg: cfg.legenda || []};
      var nEsp = 0;
      if (ADMIN) { await lerEsp(R[1].data.map(function (l) { return l.colaborador_id; })); if (est !== EST || M !== MES) return; X.ER0 = verif().erros.map(function (e) { return e.msg; }); if (!ADIAR[est + M] && !X.apr) nEsp = aplicarEsp(); }
      if (nEsp) ajustar(); else pintar();
    } catch (e) { box.innerHTML = "<div class='aviso'><p>" + esc(falhou(e)) + "</p></div>"; }
  }
  MSB_NAV.horario = function () { abrir(); };
  MSB_NAV.antesLoja = function () {   // mudar de loja com alterações por gravar perdia-as
    if (PAGINA !== "hor" || !X || !Object.keys(X.ALT).length) return Promise.resolve(true);
    return msbConfirma("Há alterações por gravar. Mudar de estação sem gravar?", "Mudar sem gravar");
  };
})();
