/* mystationbox · Ponto Digital (dono, 25/11/2026): regras sem ecrã, para se poder testar: node app/testes/ponto.js.
 * A picagem é validada no servidor (msb_ponto_picar). Aqui só se classifica o que já está gravado, com as regras
 * em vigor nas Definições (tolerâncias, tempo a mais, saída esquecida): mudar uma regra não altera picagens,
 * só a forma como se leem. Horas em minutos desde a meia-noite (hora de Portugal). Só entrada e saída, sem pausas. */
"use strict";
var PONTO = (function () {
  var MOTIVOS = {
    fora_raio: "Está fora da estação",
    precisao_fraca: "Sinal de localização fraco",
    sequencia: "Picagem fora de ordem",
    sem_local: "A estação ainda não tem localização definida",
    inativo: "O Ponto Digital ainda não está ativo nesta estação",
    sem_conta: "A sua conta não está ligada a um colaborador",
    sem_permissao: "Não está na equipa desta estação. Fale com o administrador",
    sem_localizacao: "Não foi possível obter a localização"
  };
  function motivo(r) {
    var t = MOTIVOS[r.motivo] || "Picagem recusada";
    if (r.motivo === "fora_raio" && r.distancia_m != null) t += " (a " + r.distancia_m + " m). Aproxime-se e tente de novo.";
    else if (r.motivo === "precisao_fraca") t += ". Vá para o exterior e tente de novo.";
    else if (r.motivo === "sequencia") t += (r.tipo === "entrada" ? ": já tem uma entrada aberta." : ": não há entrada aberta.");
    return t;
  }
  function validas(L) { return (L || []).filter(function (r) { return r.estado === "aceite" && r.anulado_por == null; }).sort(function (a, b) { return a.min - b.min; }); }
  /* o que o botão faz a seguir: entrada se não houver entrada aberta */
  function proxima(L) { var v = validas(L); return v.length && v[v.length - 1].tipo === "entrada" ? "saida" : "entrada"; }
  function hm(m) { if (m == null) return ""; m = Math.round(m); return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); }
  function duracao(m) { m = Math.round(m || 0); return Math.floor(m / 60) + " h " + String(m % 60).padStart(2, "0"); }

  /* Um colaborador num dia. L = picagens [{tipo, min, estado, anulado_por}]; partes = [{inicio, fim}] do código do horário
   * (vazio = sem turno previsto); cfg = regras da estação; agora = minuto atual se o dia é hoje (null para dias passados). */
  function dia(L, partes, cfg, agora) {
    cfg = cfg || {}; partes = (partes || []).slice().sort(function (a, b) { return a.inicio - b.inicio; });
    var v = validas(L), pares = [], aberto = null, sobra = [];
    v.forEach(function (r) {
      if (r.tipo === "entrada") { if (aberto) pares.push({e: aberto.min, s: null}); aberto = r; }
      else if (aberto) { pares.push({e: aberto.min, s: r.min}); aberto = null; }
      else sobra.push(r.min);   // saída sem entrada (só por correção mal feita)
    });
    if (aberto) pares.push({e: aberto.min, s: null});
    var tolE = cfg.tol_entrada_min || 0, tolS = cfg.tol_saida_min || 0, extraMin = cfg.extra_min || 0, esquecH = cfg.saida_esquecida_h || 2;
    var R = {trabalhado: 0, atraso: 0, antecipada: 0, extra: 0, faltas: [], sem_saida: [], fora_horario: !partes.length && pares.length > 0, partes: [], avisos: []};
    var usados = {};
    partes.forEach(function (p, i) {
      var k = -1, melhor = Infinity;   // o par cuja entrada está mais perto do início desta parte
      pares.forEach(function (x, j) { var d = Math.abs(x.e - p.inicio); if (!usados[j] && d < melhor && x.e < p.fim) { melhor = d; k = j; } });
      var o = {parte: i + 1, inicio: p.inicio, fim: p.fim, entrada: null, saida: null, atraso: 0, antecipada: 0, extra: 0, estado: ""};
      if (k < 0) {
        o.estado = agora == null || agora > p.inicio + tolE ? "falta" : "por_entrar";
        if (o.estado === "falta") R.faltas.push(i + 1);
      } else {
        usados[k] = 1; var x = pares[k]; o.entrada = x.e; o.saida = x.s;
        if (x.e - p.inicio > tolE) o.atraso = x.e - p.inicio;
        if (cfg.antecedencia_max_min != null && p.inicio - x.e > cfg.antecedencia_max_min) R.avisos.push("Entrada às " + hm(x.e) + ", mais de " + cfg.antecedencia_max_min + " min antes do turno");
        if (x.s != null && p.fim - x.s > tolS) o.antecipada = p.fim - x.s;
        var fimReal = x.s, inicioCedo = Math.max(0, p.inicio - x.e);
        if (fimReal != null && fimReal - p.fim >= extraMin) o.extra += fimReal - p.fim;
        if (inicioCedo >= extraMin) o.extra += inicioCedo;
        if (x.s == null) { o.estado = agora != null && agora <= p.fim + esquecH * 60 ? "ao_servico" : "sem_saida"; if (o.estado === "sem_saida") R.sem_saida.push(i + 1); }
        else o.estado = "completo";
      }
      R.atraso += o.atraso; R.antecipada += o.antecipada; R.extra += o.extra; R.partes.push(o);
    });
    pares.forEach(function (x, j) {
      if (x.s != null) R.trabalhado += x.s - x.e;
      else if (agora != null) R.trabalhado += Math.max(0, agora - x.e);
      if (!usados[j] && partes.length) R.avisos.push("Picagem fora do turno às " + hm(x.e));
      if (!partes.length && x.s == null && (agora == null)) R.sem_saida.push(0);
    });
    if (sobra.length) R.avisos.push("Saída sem entrada às " + sobra.map(hm).join(", "));
    R.pares = pares;
    return R;
  }
  /* Gestão de Picagens (dono, 26/11/2026): um estado por colaborador e dia, para a tabela do administrador.
   * R = resultado de dia(); o = {corrigido: houve correção nesse dia, recusadas: n.º de picagens recusadas}.
   * Ordem: em falta > por validar > atraso > regularizado > correto. null = dia sem turno e sem picagens (não aparece). */
  var ESTADOS = {
    falta: {txt: "Picagem em falta", ic: "❌", ord: 0}, pendente: {txt: "Por validar", ic: "⏳", ord: 1},
    atraso: {txt: "Atraso", ic: "⚠️", ord: 2}, regularizado: {txt: "Regularizado", ic: "✏️", ord: 3},
    correto: {txt: "Correto", ic: "✅", ord: 4}, curso: {txt: "Ao serviço", ic: "🟢", ord: 5}
  };
  function estadoDia(R, o) {
    o = o || {};
    if (!R.partes.length && !R.pares.length) return o.recusadas ? "pendente" : null;
    if (R.faltas.length || R.sem_saida.length) return "falta";
    if (R.fora_horario || R.avisos.length || o.recusadas) return o.corrigido && !R.avisos.length && !R.fora_horario ? "regularizado" : "pendente";
    if (R.atraso || R.antecipada) return "atraso";
    if (R.partes.some(function (p) { return p.estado === "ao_servico" || p.estado === "por_entrar"; })) return "curso";
    return o.corrigido ? "regularizado" : "correto";
  }
  /* motivos da regularização (lista do pedido do dono) */
  var MOTIVOS_CORR = [["esqueceu", "Esqueceu-se de picar"], ["sem_rede", "Sem rede"], ["sem_bateria", "Telemóvel sem bateria"],
    ["gps", "A localização (GPS) falhou"], ["fora", "Trabalho fora da estação"], ["outro", "Outro"]];
  /* texto gravado em msb_ponto_correcoes.motivo: «Motivo — justificação» (mínimo de 5 letras, regra da base de dados) */
  function motivoCorrecao(id, just) {
    var m = MOTIVOS_CORR.find(function (x) { return x[0] === id; }), j = String(just || "").trim();
    if (!m) return null;
    if (id === "outro" && j.length < 5) return null;
    return m[1] + (j ? " — " + j : "");
  }
  /* Fecho do mês (dono, 26/11/2026): pré-validação pelo horário. Devolve {pre: true} quando bate certo com o turno,
   * ou {pre: false, msg} com o que difere. semPonto = dia antes de o Ponto começar na estação (conta pelo horário). */
  function horasHorario(partes) { return (partes || []).reduce(function (t, p) { return t + (p.fim - p.inicio); }, 0); }
  function preValidar(R, partes, codigo, semPonto) {
    partes = (partes || []).slice().sort(function (a, b) { return a.inicio - b.inicio; });
    if (semPonto) return {pre: true, semPonto: true};
    if (!partes.length) return R.pares.length ? {pre: false, msg: "Picou num dia sem turno" + (codigo ? " (" + codigo + ")" : "")} : {pre: true};
    var M = [];
    R.partes.forEach(function (o) {
      if (o.estado === "falta") M.push("Sem entrada (turno às " + hm(o.inicio) + ")");
      else {
        if (o.atraso) M.push("Entrou às " + hm(o.entrada) + ", o turno começa às " + hm(o.inicio) + " (+" + o.atraso + " min)");
        if (o.estado === "sem_saida") M.push("Sem saída registada (turno até " + hm(o.fim) + ")");
        else if (o.antecipada) M.push("Saiu às " + hm(o.saida) + ", o turno acaba às " + hm(o.fim) + " (−" + o.antecipada + " min)");
      }
    });
    R.avisos.forEach(function (a) { M.push(a); });
    return M.length ? {pre: false, msg: M.join(" · ")} : {pre: true};
  }
  /* resumo de um colaborador no mês. dias = [{partes, codigo, R, contar ('horario'|'picadas'), semPonto}] */
  /* Feriados que contam para o pagamento (dono, 27/11/2026): os 13 nacionais obrigatórios e o municipal da estação.
   * O Carnaval não conta (não é obrigatório). Devolve {"AAAA-MM-DD": nome}. */
  var MUNICIPAL = {sto: ["07-11", "Feriado municipal (São Bento)"], pnf: ["11-11", "Feriado municipal (São Martinho)"]};
  function pascoa(a) { var b = a % 19, c = Math.floor(a / 100), d = a % 100, e = Math.floor(c / 4), f = c % 4, g = Math.floor((c + 8) / 25), h = Math.floor((c - g + 1) / 3), i = (19 * b + c - e - h + 15) % 30, k = Math.floor(d / 4), l = d % 4, m = (32 + 2 * f + 2 * k - i - l) % 7, n = Math.floor((b + 11 * m + 22 * l) / 451), mes = Math.floor((i + m - 7 * n + 114) / 31), dia = ((i + m - 7 * n + 114) % 31) + 1; return Date.UTC(a, mes - 1, dia); }
  function feriados(ano, estacao) {
    var f = {}, p = pascoa(ano), mais = function (n) { return new Date(p + n * 864e5).toISOString().slice(0, 10); };
    [["01-01", "Ano Novo"], ["04-25", "Dia da Liberdade"], ["05-01", "Dia do Trabalhador"], ["06-10", "Dia de Portugal"], ["08-15", "Assunção de Nossa Senhora"], ["10-05", "Implantação da República"],
     ["11-01", "Todos os Santos"], ["12-01", "Restauração da Independência"], ["12-08", "Imaculada Conceição"], ["12-25", "Natal"]].forEach(function (x) { f[ano + "-" + x[0]] = x[1]; });
    f[mais(-2)] = "Sexta-feira Santa"; f[mais(0)] = "Páscoa"; f[mais(60)] = "Corpo de Deus";
    if (MUNICIPAL[estacao]) f[ano + "-" + MUNICIPAL[estacao][0]] = MUNICIPAL[estacao][1];
    return f;
  }
  /* Horas previstas do mês, como no Horário (horario_regras.js, meta): 8 h por dia útil (seg. a sex.) que não é feriado,
   * menos os dias úteis de férias (F), baixa (B) e falta justificada (FJ). Os feriados aqui são os do Horário: nacionais + Carnaval.
   * cods = {"AAAA-MM-DD": código do horário} do colaborador nesse mês. Devolve minutos. */
  function feriadosHorario(ano) { var f = feriados(ano, null), p = pascoa(ano); f[new Date(p - 47 * 864e5).toISOString().slice(0, 10)] = "Carnaval"; return f; }
  function previstasMes(mes, cods) {
    var a = +mes.slice(0, 4), m = +mes.slice(5, 7), n = new Date(Date.UTC(a, m, 0)).getUTCDate(), fer = feriadosHorario(a), dias = 0;
    for (var d = 1; d <= n; d++) {
      var iso = mes + "-" + String(d).padStart(2, "0"), w = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
      if (w > 0 && w < 6 && !fer[iso] && !{F: 1, B: 1, FJ: 1}[(cods || {})[iso]]) dias++;
    }
    return dias * 480;
  }
  /* Dias úteis de férias gozadas no mês (dono, 27/11/2026): F em dia útil que não é feriado; MDF (½ dia de férias) conta 0,5 */
  function feriasUteis(mes, cods) {
    var a = +mes.slice(0, 4), fer = feriadosHorario(a), t = 0;
    Object.keys(cods || {}).forEach(function (iso) {
      if (iso.slice(0, 7) !== mes) return;
      var w = new Date(iso + "T12:00:00Z").getUTCDay();
      if (w === 0 || w === 6 || fer[iso]) return;
      if (cods[iso] === "F") t += 1; else if (cods[iso] === "MDF") t += 0.5;
    });
    return t;
  }
  /* Pré-preenchido pelo horário (dono, 27/11/2026): feriado = horas que contam em dias de feriado (fer = feriados());
   * horas extra = horas fora de feriado acima das previstas do mês; normais = o resto. Total = normais + feriado + extra.
   * extraMin (gravado pelo administrador) substitui o extra calculado; sem previstas, não há extra calculado. */
  function resumoFecho(dias, extraMin, fer, previstas) {
    var o = {horario: 0, picadas: 0, contar: 0, tempo_mais: 0, baixa: 0, dias: 0, msg: 0, feriado: 0, feriado_dias: []};
    dias.forEach(function (d) {
      var h = horasHorario(d.partes), t = d.R ? d.R.trabalhado : 0, v = d.pv || preValidar(d.R, d.partes, d.codigo, d.semPonto);
      if (d.codigo === "B") o.baixa++;
      if (h || t) o.dias++;
      o.horario += h; o.picadas += t; o.tempo_mais += d.R ? d.R.extra : 0;
      var c = d.contar === "picadas" ? t : h;
      o.contar += c;
      if (c && fer && d.dia && fer[d.dia]) { o.feriado += c; o.feriado_dias.push(d.dia); }
      if (!v.pre) o.msg++;
    });
    var fora = o.contar - o.feriado;
    o.extra_auto = previstas == null ? 0 : Math.max(0, fora - previstas);
    o.normais = fora - o.extra_auto;
    o.extra = extraMin == null ? o.extra_auto : extraMin;
    return o;
  }
  function hhmm(m) { m = Math.round(m || 0); return Math.floor(m / 60) + ":" + String(m % 60).padStart(2, "0"); }
  function lerHHMM(t) { var x = /^\s*(\d{1,4})(?:[:h,.]\s*(\d{1,2}))?\s*$/.exec(String(t || "0")); if (!x) return null; var mi = +(x[2] || 0); return mi > 59 ? null : +x[1] * 60 + mi; }

  return {horasHorario: horasHorario, preValidar: preValidar, resumoFecho: resumoFecho, feriados: feriados, feriadosHorario: feriadosHorario, previstasMes: previstasMes, feriasUteis: feriasUteis, hhmm: hhmm, lerHHMM: lerHHMM,
    motivo: motivo, proxima: proxima, dia: dia, hm: hm, duracao: duracao, MOTIVOS: MOTIVOS, ESTADOS: ESTADOS, estadoDia: estadoDia, MOTIVOS_CORR: MOTIVOS_CORR, motivoCorrecao: motivoCorrecao};
})();
if (typeof module !== "undefined") module.exports = PONTO;
