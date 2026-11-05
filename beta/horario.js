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
      return {nome: c.curto || "", escala: l.escala, dias: X.dias.map(function (d) { return g[d] || ""; }), ant: ant.map(function (a) { return a[1]; }), fdsAnt: X.FDS[l.colaborador_id] || ""};
    });
  }
  function celulas() {
    var t = function (d) { var iso = X.M + "-" + String(d).padStart(2, "0"), w = new Date(iso + "T12:00:00").getDay(); return {w: w, cl: (X.fer[iso] ? "fer " : (w === 0 || w === 6) ? "fds " : "") + (iso === hoje() ? "hj" : "")}; };
    var eu = ((PERFIL && PERFIL.display_name) || "").trim().split(/\s+/)[0];
    var h = "<div class='sc' id='horSc'><table class='hor" + (X.ed ? " aeditar" : "") + "'><thead><tr><th class='l'>Colaborador</th>" + X.dias.map(function (d) { var k = t(d); return "<th class='" + k.cl + "'>" + d + "<small>" + SEM[k.w] + "</small></th>"; }).join("") + "<th>Turnos</th></tr></thead><tbody>";
    X.P.forEach(function (l) {
      var c = X.C[l.colaborador_id] || {}, g = X.G[l.colaborador_id] || {}, tur = 0, fixo = !!l.espelho;
      h += "<tr" + (c.curto === eu ? " class='eu'" : "") + "><td class='l' title='" + esc(c.nome || "") + "'>" + esc(c.curto || "") + (fixo && X.ed ? "<small>segue " + esc((X.C[l.espelho] || {}).curto || "") + "</small>" : "") + "</td>" + X.dias.map(function (d) {
        var v = g[d] || ""; if (v === "M" || v === "T" || v === "MT") tur++;
        var mudou = X.ALT[l.colaborador_id + "|" + d] != null, fx = (X.FX[l.colaborador_id] || {})[d];
        return "<td class='" + t(d).cl + (mudou ? " alt" : "") + (fx ? " fx" : "") + "'" + (fx ? " title='Turno fixado'" : "") + (X.ed && !fixo ? " data-c='" + l.colaborador_id + "' data-d='" + d + "' tabindex='0' role='button' aria-label='" + esc(c.curto || "") + " dia " + d + "'" : "") + ">" + v + "</td>";
      }).join("") + "<td class='n'>" + tur + "</td></tr>";
    });
    return h + "</tbody></table></div>";
  }
  function regras() {
    var L = linhas(), r = HOR.verificar(L, {y: +X.M.slice(0, 4), m: +X.M.slice(5), fer: X.fer, mt: X.mt, semMT: X.semMT}); X.R = r;
    var h = "<div class='bl'><h3>Regras " + (r.erros.length ? "<span class='tag t-er'>" + r.erros.length + " a corrigir</span>" : "<span class='tag t-ok'>✔ Sem erros</span>") + (r.avisos.length ? "<span class='tag t-at'>" + r.avisos.length + " avisos</span>" : "") + "</h3>";
    if (r.erros.length) h += "<ul class='hl'>" + r.erros.map(function (e) { return "<li>" + esc(e.msg) + "</li>"; }).join("") + "</ul>";
    if (r.avisos.length) h += "<details><summary>Ver avisos</summary><ul class='hl'>" + r.avisos.map(function (e) { return "<li>" + esc(e.msg) + "</li>"; }).join("") + "</ul></details>";
    if (ADMIN) h += "<div class='sc' style='margin-top:8px'><table><thead><tr><th class='l'>Colaborador</th><th>Turnos</th><th>Meta</th><th>Férias (dias úteis)</th><th>Diferença</th></tr></thead><tbody>" +
      r.metas.map(function (m) { return "<tr><td class='l'>" + esc(m.nome) + "</td><td class='n'>" + m.turnos + "</td><td class='n'>" + m.meta + "</td><td class='n'>" + m.ferias + "</td><td class='n'>" + (m.extra > 0 ? "+" : "") + m.extra + " h</td></tr>"; }).join("") + "</tbody></table></div>";
    return h + "</div>";
  }
  function pintar() {
    var box = $("#v-hor"), n = Object.keys(X.ALT).length, b = "<div class='bar'><button class='btn' id='horAnt' aria-label='Mês anterior'>‹</button><input type='month' id='horMes' value='" + X.M + "'><button class='btn' id='horSeg' aria-label='Mês seguinte'>›</button>" +
      "<span class='tag " + (X.estado === "simulacao" ? "t-at'>Simulação" : "t-ok'>Horário real") + "</span>";
    if (ADMIN && X.P.length) b += X.ed
      ? "<button class='btn az' id='horProj'" + (X.calc ? " disabled" : "") + ">" + (X.calc ? "A ajustar…" : "Projetar o resto") + "</button><button class='btn' id='horIni'" + (X.INI ? "" : " disabled") + ">Horário inicial</button><button class='btn p' id='horGrava'" + (n && !X.calc ? "" : " disabled") + ">Gravar" + (n ? " " + n : "") + "</button><button class='btn' id='horFim'>Sair da edição</button>"
      : "<button class='btn' id='horEd'>Editar</button><button class='btn' id='horDefIni'>Guardar como inicial</button><button class='btn' id='horEst'>" + (X.estado === "simulacao" ? "Passar a real" : "Passar a simulação") + "</button><button class='btn' id='horXls'>Excel Picaponto</button><button class='btn' id='horPdf'>PDF</button>";
    box.innerHTML = b + "</div>" + (X.P.length ? celulas() + "<p class='rod'>M manhã · T tarde · MT turno M/T · FG folga · F férias · FD feriado. Fundo azul: fim de semana; creme: feriado." + (X.ed ? " Toca numa célula e escolhe o turno: fica fixado (sublinhado) e a app ajusta o resto do mês às regras. Projetar o resto refaz tudo o que não está fixado. Horário inicial volta à versão de partida do mês." : "") + "</p>" + regras()
      : "<div class='vazio'>Ainda não há horário de " + nomeMes(X.M) + " nesta loja." + (ADMIN ? "<p><button class='btn p' id='horNovo'>Criar horário do mês</button></p>" : "") + "</div>");
    $("#horAnt").onclick = function () { sair(function () { abrir(addMes(X.M, -1)); }); };
    $("#horSeg").onclick = function () { sair(function () { abrir(addMes(X.M, 1)); }); };
    $("#horMes").onchange = function () { var v = this.value; if (v) sair(function () { abrir(v); }); };
    var e = function (id, f) { var x = $(id); if (x) x.onclick = f; };
    e("#horEd", function () { X.ed = true; pintar(); });
    e("#horFim", function () { sair(function () { abrir(X.M); }); });
    e("#horProj", projetar); e("#horIni", voltarInicial); e("#horDefIni", definirInicial); e("#horGrava", gravar); e("#horEst", mudarEstado); e("#horXls", excel); e("#horPdf", pdf); e("#horNovo", criar);
    var sc = $("#horSc"); if (sc) {
      var alvo = sc.querySelector("th.hj"); if (alvo && X.rolar) { sc.scrollLeft = Math.max(0, alvo.offsetLeft - 140); X.rolar = false; }
      if (X.ed) { sc.onclick = function (ev) { var t = ev.target.closest("td[data-c]"); if (t) escolher(t); }; sc.onkeydown = function (ev) { if (ev.key === "Enter" || ev.key === " ") { var t = ev.target.closest("td[data-c]"); if (t) { ev.preventDefault(); escolher(t); } } }; }
    }
  }
  function sair(seg) {
    if (!X || !Object.keys(X.ALT).length) return seg();
    msbConfirma("Há alterações por gravar. Sair sem gravar?", "Sair sem gravar").then(function (ok) { if (ok) seg(); });
  }
  function escolher(td) {
    var f = $("#horPop"); if (f) f.remove();
    var id = +td.dataset.c, d = +td.dataset.d, c = X.C[id] || {}, m = document.createElement("div"); m.id = "horPop";
    var cods = HOR.CODIGOS.filter(function (k) { return k !== "MT" || X.mt; });
    var fx = (X.FX[id] || {})[d];
    m.innerHTML = "<b>Fixar turno · " + esc(c.curto || "") + " · dia " + d + "</b><div>" + cods.map(function (k) { return "<button data-k='" + k + "'>" + k + "</button>"; }).join("") + "<button data-k=''>Limpar</button>" + (fx && "F FD".indexOf((X.G[id] || {})[d]) < 0 ? "<button data-s='1'>Soltar</button>" : "") + "</div>";
    m.onclick = function (e) {
      var b = e.target.closest("button"); if (!b) return; m.remove();
      if (b.dataset.s) definir(id, d, (X.G[id] || {})[d] || "", false); else definir(id, d, b.dataset.k, !!b.dataset.k);
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
    pôr(id, d, k, fx); X.P.forEach(function (l) { if (l.espelho === id) pôr(l.colaborador_id, d, k, fx); });
    X.calc = true; pintar();
    clearTimeout(X.tm); X.tm = setTimeout(function () { projetar(true); }, 500);   // vários toques seguidos dão um só ajuste
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
        var c = g[d], iso = X.M + "-" + String(d).padStart(2, "0"); if (!c) return;
        if (fx[d] || c === "F" || c === "FD" || iso < hj) fixos[d] = c;
        var w = new Date(iso + "T12:00:00").getDay(); if (c === "F" && w > 0 && w < 6 && !X.fer[iso]) fu++;
      });
      return {id: l.colaborador_id, fixos: fixos, ant: (X.ANT[l.colaborador_id] || []).slice(-6).map(function (x) { return x[1]; }), fdsAnt: X.FDS[l.colaborador_id] || "", meta: base - fu, off: {M: a.M - minM, T: a.T - minT}, reforco: l.codigo === X.reforco, atual: auto ? Object.assign({}, g) : null};
    });
    var oM = {}, oT = {}, fora = 0;
    X.P.forEach(function (l) { if (l.escala || l.espelho) return; X.dias.forEach(function (d) { var c = (X.G[l.colaborador_id] || {})[d]; if (c === "M" || c === "MT") { oM[d] = (oM[d] || 0) + 1; fora++; } if (c === "T" || c === "MT") { oT[d] = (oT[d] || 0) + 1; fora++; } }); });
    var sem = X.mt && !X.semMT ? HOR.semanasMT(ano, mes, X.dias.length, X.fer) : [];
    HORG.alvos(P, 2 * X.dias.length + sem.length - fora);
    return {P: P, op: {y: ano, m: mes, fer: X.fer, mtSemanas: sem, outrosM: oM, outrosT: oT}};
  }
  async function projetar(auto) {   // auto = ajuste depois de uma edição: mexe só no necessário
    var ES = X.P.filter(function (l) { return l.escala && !l.espelho; }), ctx = X, nr = X.nr = (X.nr || 0) + 1;
    if (!ES.length) { X.calc = false; pintar(); return msbAviso("Erro: não há pessoas na escala deste mês."); }
    clearTimeout(X.tm); X.calc = true; pintar();
    try {
      var D = await dadosProjecao(auto === true), r = await calcular(HORG.modelo(D.P, D.op), auto === true);
      if (ctx !== X || nr !== X.nr) return;   // entretanto mudou de mês ou voltou a editar
      if (!r || !r.Columns || /infeasible/i.test(r.Status || "")) throw new Error("Não há solução com estes turnos fixados. Solta algum turno.");
      var S = HORG.ler(D.P, D.op, r.Columns), mudou = 0;
      D.P.forEach(function (p, i) { X.dias.forEach(function (d) {
        if (p.fixos[d]) return;
        if ((X.G[p.id] || {})[d] !== S[i][d]) mudou++;
        pôr(p.id, d, S[i][d], false); X.P.forEach(function (l) { if (l.espelho === p.id) pôr(l.colaborador_id, d, S[i][d], false); });
      }); });
      X.calc = false; pintar();
      var er = X.R.erros;
      msbAviso(er.length ? "Atenção: " + er[0].msg + (er.length > 1 ? " (+" + (er.length - 1) + ")" : "") : auto === true ? (mudou ? "Ajustei " + mudou + " turno(s). Confere e grava." : "Não foi preciso mudar mais nada.") : "Proposta pronta. Ajusta o que quiseres e grava.");
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
      msbAviso("Horário gravado"); X.ALT = {}; abrir(X.M);
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
  async function mudarEstado() {
    var novo = X.estado === "simulacao" ? "real" : "simulacao";
    if (!await msbConfirma(novo === "real" ? "Passar " + nomeMes(X.M) + " a horário real?" : "Passar " + nomeMes(X.M) + " a simulação?", "Confirmar")) return;
    var r = await sb.from("msb_horario_meses").update({estado: novo}).eq("estacao", EST).eq("mes", X.M);
    if (r.error) return msbAviso("Erro: " + falhou(r.error)); abrir(X.M);
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
  async function pdf() {
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
    var linhas = X.P.filter(function (l) { return Object.keys(X.G[l.colaborador_id] || {}).length; });
    linhas.forEach(function (l) {
      var c = X.C[l.colaborador_id] || {}; y -= alt;
      X.dias.forEach(function (d) { fundo(d, y, alt); var v = (X.G[l.colaborador_id] || {})[d] || ""; if (v) centro(v, M + nome + (d - 1) * col, y + 9, F, 9); });
      pg.drawText(c.nome || "", {x: M + 3, y: y + 9, size: 9, font: B, color: tx});
      pg.drawLine({start: {x: M, y: y}, end: {x: W - M, y: y}, thickness: 0.4, color: lin});
    });
    pg.drawText("M manhã · T tarde" + (X.mt ? " · MT turno M/T" : "") + " · FG folga · F férias · FD feriado", {x: M, y: y - 16, size: 8, font: F, color: tx});
    await marcaPdf(doc, pg, F, B, M, 18);
    descarregar(new Blob([await doc.save()], {type: "application/pdf"}), ficheiro("pdf"));
  }
  async function abrir(M) {
    var box = $("#v-hor"); M = M || MES || hoje().slice(0, 7); MES = M; var est = EST; if (X) clearTimeout(X.tm);
    box.innerHTML = "<div class='bl ske' style='height:260px'></div>";
    try {
      var ini = addDia(M + "-01", -14), fim = addMes(M, 1) + "-01";
      var R = await Promise.all([
        sb.from("msb_horario_dias").select("dia,colaborador_id,codigo,fixo").eq("estacao", est).gte("dia", ini).lt("dia", fim).limit(2000),
        sb.from("msb_colab_lojas").select("colaborador_id,codigo,ordem,nome_picaponto,escala,espelho").eq("estacao", est).order("ordem"),
        sb.from("msb_colaboradores").select("id,curto,nome,ativo"),
        sb.from("msb_horario_meses").select("estado,sem_mt").eq("estacao", est).eq("mes", M).maybeSingle(),
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
      var existe = !!R[3].data, P = existe ? R[1].data.filter(function (l) { return G[l.colaborador_id] || (C[l.colaborador_id] || {}).ativo; }) : [];
      X = {M: M, dias: dias, fer: feriados(ano), G: G, ORI: ORI, ANT: ANT, FX: FX, FXO: FXO, reforco: cfg.reforco, INI: R[5].data, LJ: R[1].data, FDS: FDS, C: C, P: P, ALT: {}, ed: !!(X && X.criado), rolar: true, estado: existe ? R[3].data.estado : "simulacao", semMT: existe && R[3].data.sem_mt, mt: !!cfg.mt, leg: cfg.legenda || []};
      pintar();
    } catch (e) { box.innerHTML = "<div class='aviso'><p>" + esc(falhou(e)) + "</p></div>"; }
  }
  MSB_NAV.horario = function () { abrir(); };
  MSB_NAV.antesLoja = function () {   // mudar de loja com alterações por gravar perdia-as
    if (PAGINA !== "hor" || !X || !Object.keys(X.ALT).length) return Promise.resolve(true);
    return msbConfirma("Há alterações por gravar. Mudar de loja sem gravar?", "Mudar sem gravar");
  };
})();
