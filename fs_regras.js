/* mystationbox · Formação & Segurança: regras puras (sem ecrã nem base de dados), testadas em app/testes/formacao_sst.js.
 * As mesmas regras estão nas funções da base de dados (supabase/migrations/20261128_msb_formacao_sst.sql); mudar uma obriga a mudar a outra.
 * Decisões do dono (27/11/2026): formações + segurança no trabalho; cursos e testes dentro da app; medicina do trabalho só com
 * resultado e datas; «Prevenção em Segurança» repartida em 8 módulos (8 h); ritmo de 2 em 2 semanas; tempo mínimo de 50 % antes do teste. */
"use strict";
(function (raiz) {
  var DIA = 86400000;
  function d(iso) { var p = String(iso).slice(0, 10).split("-"); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function iso(ms) { return new Date(ms).toISOString().slice(0, 10); }
  function dias(de, ate) { return Math.round((d(ate) - d(de)) / DIA); }
  function somaDias(data, n) { return iso(d(data) + n * DIA); }
  function fimDoMes(a, m) { return new Date(Date.UTC(a, m + 1, 0)).getUTCDate(); }

  /* validade = data + meses (o dia passa para o último do mês quando não existe); sem meses = não expira (null) */
  function validade(data, meses) {
    if (!meses) return null;
    var p = String(data).slice(0, 10).split("-"), a = +p[0], m = +p[1] - 1 + Number(meses), dd = +p[2];
    a += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return iso(Date.UTC(a, m, Math.min(dd, fimDoMes(a, m))));
  }

  var ATRIB_ABERTA = ["por_comecar", "em_curso", "teste", "bloqueado", "aguarda", "fora_prazo"];
  /* estado de uma célula da matriz: valida · a_expirar (≤ 60 dias) · expirada · em_falta · planeada (há curso/percurso atribuído em aberto) */
  function estadoMatriz(registo, atribuicao, hoje) {
    if (atribuicao && ATRIB_ABERTA.indexOf(atribuicao.estado) >= 0 && (!registo || estadoValidade(registo, hoje) !== "valida")) return "planeada";
    if (!registo) return "em_falta";
    return estadoValidade(registo, hoje);
  }
  function estadoValidade(registo, hoje) {
    if (!registo.validade) return "valida";
    var n = dias(hoje, registo.validade);
    if (n < 0) return "expirada";
    return n <= 60 ? "a_expirar" : "valida";
  }

  /* horas de formação contínua do ano (só concluídas e que contam; o registo final de um percurso não volta a somar) */
  function horasAno(registos, ano) {
    var total = 0, porModo = {};
    (registos || []).forEach(function (r) {
      if (r.estado !== "concluida" || r.conta_horas === false || String(r.data).slice(0, 4) !== String(ano)) return;
      var h = Number(r.horas) || 0;
      total += h; porModo[r.modo] = (porModo[r.modo] || 0) + h;
    });
    return {total: arred(total), porModo: porModo};
  }
  function arred(x) { return Math.round(x * 100) / 100; }
  /* horas em falta dos dois anos anteriores (a lei transforma-as em crédito de horas do trabalhador). devidas: {ano: horas}, por omissão 40; 0 = não conta */
  function horasEmFalta(registos, anoAtual, devidas) {
    var out = [];
    [anoAtual - 2, anoAtual - 1].forEach(function (a) {
      var dv = devidas && devidas[a] != null ? Number(devidas[a]) : 40;
      if (!dv) return;
      out.push({ano: a, falta: arred(Math.max(0, dv - horasAno(registos, a).total))});
    });
    return out;
  }
  /* abaixo do ritmo: menos horas do que a parte do ano já passada pede */
  function abaixoDoRitmo(feitas, devidas, hoje) {
    var a = +String(hoje).slice(0, 4), passado = (d(hoje) - Date.UTC(a, 0, 1)) / (Date.UTC(a + 1, 0, 1) - Date.UTC(a, 0, 1));
    return Number(feitas) < Number(devidas) * passado - 0.01;
  }

  /* percurso: prazo de cada módulo, em escada a partir da data de atribuição */
  function prazosPercurso(inicio, n, intervaloDias) {
    var out = [];
    for (var i = 1; i <= n; i++) out.push(somaDias(inicio, intervaloDias * i));
    return out;
  }
  function progressoPercurso(atribs) {
    var feitos = (atribs || []).filter(function (a) { return a.estado === "concluido"; }).length;
    return feitos + " de " + (atribs || []).length;
  }

  /* tempo mínimo (segundos) antes de o teste abrir */
  function tempoMinimoSeg(horas, pct) { return Math.round(Number(horas) * 3600 * (Number(pct) || 0) / 100); }
  function podeIniciarTeste(x) {
    if (x.estado === "aguarda") return {ok: false, motivo: "Termine primeiro o módulo anterior."};
    if (x.estado === "concluido") return {ok: false, motivo: "Este curso já está concluído."};
    if (x.licoesFeitas < x.licoes) return {ok: false, motivo: "Faltam " + (x.licoes - x.licoesFeitas) + " lição(ões) por ver."};
    var falta = tempoMinimoSeg(x.horas, x.pctMin) - (Number(x.segundos) || 0);
    if (falta > 0) return {ok: false, motivo: "O teste abre daqui a " + Math.ceil(falta / 60) + " min de formação."};
    if (x.tentativasUsadas >= x.tentativas + (x.extra || 0)) return {ok: false, motivo: "Sem tentativas. Peça ao administrador para desbloquear."};
    return {ok: true};
  }

  /* correção: respostas = {idPergunta: [índices na ordem original]}; certa só se o conjunto for exatamente igual */
  function corrigir(perguntas, respostas) {
    var certas = 0, erradas = [];
    (perguntas || []).forEach(function (p) {
      var r = (respostas && respostas[p.id]) || [];
      var a = r.map(Number).sort().join(","), b = (p.certas || []).map(Number).sort().join(",");
      if (a === b && a !== "") certas++; else erradas.push(p.id);
    });
    var total = (perguntas || []).length;
    return {certas: certas, total: total, nota: total ? Math.round(certas * 100 / total) : 0, erradas: erradas};
  }
  function aprovado(nota, minima) { return Number(nota) >= Number(minima); }

  /* gerador pseudoaleatório com semente (só para testes reproduzíveis; no servidor é random()) */
  function gerador(semente) {
    var a = semente >>> 0;
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function baralhar(lista, rnd) {
    var a = (lista || []).slice(); rnd = rnd || Math.random;
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function sortear(ids, n, rnd) { return baralhar(ids, rnd).slice(0, Math.min(n, (ids || []).length)); }
  /* posições escolhidas no ecrã → índices originais (ordem[i] = índice original mostrado na posição i) */
  function desbaralhar(escolhidas, ordem) { return (escolhidas || []).map(function (i) { return ordem[i]; }).sort(); }

  /* período de uma verificação: diaria AAAA-MM-DD · semanal AAAA-Snn (semana ISO) · mensal AAAA-MM · trimestral AAAA-Tn */
  function semanaIso(data) {
    var t = d(data), dow = (new Date(t).getUTCDay() + 6) % 7, qui = t + (3 - dow) * DIA, a = new Date(qui).getUTCFullYear();
    return {ano: a, n: 1 + Math.floor((qui - Date.UTC(a, 0, 1)) / DIA / 7), domingo: iso(t + (6 - dow) * DIA)};
  }
  function periodo(tipo, data) {
    var s = String(data).slice(0, 10);
    if (tipo === "diaria") return s;
    if (tipo === "mensal") return s.slice(0, 7);
    if (tipo === "trimestral") return s.slice(0, 4) + "-T" + Math.ceil(+s.slice(5, 7) / 3);
    var w = semanaIso(s); return w.ano + "-S" + (w.n < 10 ? "0" : "") + w.n;
  }
  function fimPeriodo(tipo, data) {
    var s = String(data).slice(0, 10), a = +s.slice(0, 4), m = +s.slice(5, 7) - 1;
    if (tipo === "diaria") return s;
    if (tipo === "mensal") return iso(Date.UTC(a, m, fimDoMes(a, m)));
    if (tipo === "trimestral") { var mf = Math.ceil((m + 1) / 3) * 3 - 1; return iso(Date.UTC(a, mf, fimDoMes(a, mf))); }
    return semanaIso(s).domingo;
  }
  function naoOk(respostas) { return (respostas || []).filter(function (r) { return r.ok === false; }).map(function (r) { return r.item; }); }
  /* todos os itens respondidos; foto obrigatória só no Não OK */
  function verificacaoValida(respostas, itens) {
    var por = {}; (respostas || []).forEach(function (r) { por[r.item] = r; });
    var falta = (itens || []).filter(function (i) { return !por[i] || (por[i].ok !== true && por[i].ok !== false); });
    if (falta.length) return {ok: false, motivo: "Falta responder: " + falta.join(", ")};
    var semFoto = (respostas || []).filter(function (r) { return r.ok === false && !r.foto; }).map(function (r) { return r.item; });
    if (semFoto.length) return {ok: false, motivo: "Tire uma fotografia em: " + semFoto.join(", ")};
    return {ok: true};
  }

  /* marco do aviso de um prazo: 60, 30, 7 ou 0 (no dia ou já passado); null se faltar mais de 60 dias. Um aviso por marco. */
  function marcoAviso(prazo, hoje) {
    var n = dias(hoje, prazo);
    if (n > 60) return null;
    if (n > 30) return 60;
    if (n > 7) return 30;
    if (n > 0) return 7;
    return 0;
  }

  /* medicina do trabalho: só estes resultados; a ficha (opcional) só em PDF, na pasta do colaborador */
  var RESULTADOS_APTIDAO = ["apto", "apto_condicionado", "inapto"];
  function fichaAptidaoValida(caminho) { return /^aptidao\/\d+\/[^/]+\.pdf$/i.test(String(caminho || "")); }

  function horasTxt(h) {
    var min = Math.round(Number(h) * 60), hh = Math.floor(min / 60), mm = min % 60;
    if (!hh) return mm + " min";
    return hh + " h" + (mm ? " " + mm + " min" : "");
  }

  var ESTADOS_ATRIB = {por_comecar: "Por começar", em_curso: "Em curso", teste: "Teste por fazer", concluido: "Concluído",
    bloqueado: "Reprovado – bloqueado", fora_prazo: "Fora de prazo", aguarda: "Por abrir", anulado: "Anulado"};
  var CORES_MATRIZ = {valida: "🟢", a_expirar: "🟡", expirada: "🔴", em_falta: "⚪", planeada: "🔵"};

  var API = {validade: validade, estadoMatriz: estadoMatriz, horasAno: horasAno, horasEmFalta: horasEmFalta, abaixoDoRitmo: abaixoDoRitmo,
    prazosPercurso: prazosPercurso, progressoPercurso: progressoPercurso, tempoMinimoSeg: tempoMinimoSeg, podeIniciarTeste: podeIniciarTeste,
    corrigir: corrigir, aprovado: aprovado, gerador: gerador, baralhar: baralhar, sortear: sortear, desbaralhar: desbaralhar,
    periodo: periodo, fimPeriodo: fimPeriodo, naoOk: naoOk, verificacaoValida: verificacaoValida, marcoAviso: marcoAviso,
    RESULTADOS_APTIDAO: RESULTADOS_APTIDAO, fichaAptidaoValida: fichaAptidaoValida, horasTxt: horasTxt,
    ESTADOS_ATRIB: ESTADOS_ATRIB, CORES_MATRIZ: CORES_MATRIZ, ATRIB_ABERTA: ATRIB_ABERTA};
  if (typeof module !== "undefined" && module.exports) module.exports = API; else raiz.FS_REGRAS = API;
})(typeof window !== "undefined" ? window : this);
