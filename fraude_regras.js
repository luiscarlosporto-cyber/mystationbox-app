// mystationbox · Controlo → Fraude (12/11/2026). Regras: funções puras, sem ecrã nem base de dados. Testes em app/testes/fraude.js.
// Valores em cêntimos. Índice = venda por dia do colaborador ÷ mediana dos colegas × 100.
(function (raiz) {
  const CRITICAS = ['LOJA_TOTAL', 'TABACO', 'LOJA', 'CAFETARIA'];
  const COMBUSTIVEL = ['COMBUSTIVEIS', 'OUTROS COMBUSTIVEIS'];  // «loja» (GLOSSARY) = tudo o que não é combustível
  const ORDEM = ['LOJA_TOTAL', 'TABACO', 'LOJA', 'CAFETARIA', 'COMBUSTIVEIS', 'GAS', 'LUBRIFICANTES', 'PROMOCOES REPSOL'];
  const SEM_COLABORADOR = ['EMPREGADOOPT', 'LUIS CARLOSJOAO'];  // terminal automático (OPT) e o administrador: fora da comparação (dono, 12/11/2026)
  const MIN_DIAS = 5;            // abaixo disto: amostra curta
  const MIN_VALOR_DIA_C = 2000;  // colegas com menos de 20 € por dia nesta categoria: só informa
  const LIMITES = { critica: { ok: 90, aviso: 80, alto: 110 }, outra: { ok: 80, aviso: 65, alto: 120 } };

  const mediana = v => {
    const s = [...v].sort((a, b) => a - b), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  // linhas: [{colaborador, periodo, familia, qtd, valor_c}] ; dias: {colaborador: Set(dias)}
  // turnos (opcional): {colaborador: n.º de turnos do horário}; sem ele, conta-se por dia com vendas.
  function comparar(linhas, dias, turnos) {
    const cols = Object.keys(dias).filter(c => !SEM_COLABORADOR.includes(c));
    const por = {};
    linhas = linhas.concat(linhas.filter(l => !COMBUSTIVEL.includes(l.familia)).map(l => ({ ...l, familia: 'LOJA_TOTAL' })));
    for (const l of linhas) {
      if (SEM_COLABORADOR.includes(l.colaborador)) continue;
      const k = l.colaborador + '|' + l.familia;
      const x = por[k] || (por[k] = { qtd: 0, valor_c: 0 });
      x.qtd += l.qtd; x.valor_c += l.valor_c;
    }
    const familias = [...new Set(linhas.map(l => l.familia))]
      .sort((a, b) => (ORDEM.indexOf(a) + 1 || 99) - (ORDEM.indexOf(b) + 1 || 99));
    const res = {};
    for (const f of familias) {
      res[f] = {};
      const expo = c => (turnos && turnos[c] > 0 ? turnos[c] : dias[c].size);
      const porDia = c => ((por[c + '|' + f] || {}).valor_c || 0) / (expo(c) || 1);
      for (const c of cols) {
        const colegas = cols.filter(o => o !== c && expo(o) >= MIN_DIAS);
        const v = porDia(c), x = por[c + '|' + f] || { qtd: 0, valor_c: 0 };
        const r = { dias: expo(c), por_turno: !!(turnos && turnos[c] > 0), valor_c: x.valor_c, qtd: x.qtd, dia_c: Math.round(v), indice: null, dif_dia_c: null, nivel: 'curta' };
        if (expo(c) >= MIN_DIAS && colegas.length >= 1) {
          const ref = mediana(colegas.map(porDia));
          r.ref_dia_c = Math.round(ref);
          r.dif_dia_c = Math.round(v - ref);
          if (ref >= MIN_VALOR_DIA_C) { r.indice = Math.round(100 * v / ref); r.nivel = nivel(f, r.indice); }
          else r.nivel = 'info';
        }
        res[f][c] = r;
      }
    }
    return { colaboradores: cols, familias, res };
  }

  function nivel(familia, indice) {
    const L = CRITICAS.includes(familia) ? LIMITES.critica : LIMITES.outra;
    if (indice > L.alto) return 'acima';
    if (indice >= L.ok) return 'ok';
    if (indice >= L.aviso) return 'aviso';
    return 'critico';
  }

  // Persistência: dois períodos seguidos abaixo de «ok» passam a crítico.
  function comPersistencia(anterior, atual) {
    for (const f in atual.res) for (const c in atual.res[f]) {
      const a = anterior && anterior.res[f] && anterior.res[f][c], r = atual.res[f][c];
      if (r.nivel === 'aviso' && a && (a.nivel === 'aviso' || a.nivel === 'critico')) { r.nivel = 'critico'; r.repetido = true; }
    }
    return atual;
  }

  /* Horário × vendas (dono, 12/11/2026): os turnos contam pelo horário selado.
     M ou T = 1 turno; MT = 2 turnos, exceto em Penafiel, onde MT não conta (dono). Um dia escalado aqui em que a pessoa só vendeu
     na outra estação conta lá; vender aqui sem estar escalado conta 1 turno (troca) e fica listado.
     horario: [{col, est, dia, codigo}] das duas estações; vendas: {est: {col: Set(dias ISO)}}; dias: lista de dias ISO do período. */
  function turnosHorario(est, dias, horario, vendas) {
    const peso = h => h.codigo === 'MT' ? (h.est === 'pnf' ? 0 : 2) : (h.codigo === 'M' || h.codigo === 'T' ? 1 : 0);
    const naLista = new Set(dias), esc = {}, outra = {};
    for (const h of horario) {
      if (!naLista.has(h.dia) || !h.col || peso(h) === 0) continue;
      const m = h.est === est ? esc : outra;
      (m[h.col] = m[h.col] || {})[h.dia] = Math.max(peso(h), (m[h.col] || {})[h.dia] || 0);
    }
    const aqui = vendas[est] || {}, la = Object.keys(vendas).filter(e => e !== est).map(e => vendas[e]);
    const vendeuLa = (c, d) => la.some(v => v[c] && v[c].has(d));
    const cols = new Set(Object.keys(esc).concat(Object.keys(aqui))), turnos = {}, det = {};
    for (const c of cols) {
      const x = { turnos: 0, escalados: 0, certos: 0, semVendas: [], foraEscala: [], naOutra: [] };
      for (const d of dias) {
        const e = (esc[c] || {})[d] || 0, v = !!(aqui[c] && aqui[c].has(d));
        if (e) x.escalados += e;
        if (e && v) { x.certos++; x.turnos += e; }
        else if (e && !v && vendeuLa(c, d)) x.naOutra.push(d);
        else if (e && !v) { x.semVendas.push(d); x.turnos += e; }
        else if (!e && v && !((outra[c] || {})[d])) { x.foraEscala.push(d); x.turnos += 1; }
        else if (!e && v) x.turnos += 1;
      }
      turnos[c] = x.turnos; det[c] = x;
    }
    return { turnos, det };
  }

  const api = { turnosHorario, comparar, nivel, comPersistencia, mediana, CRITICAS, LIMITES, MIN_DIAS, MIN_VALOR_DIA_C, SEM_COLABORADOR };
  if (typeof module !== 'undefined') module.exports = api; else raiz.FRAUDE = api;
})(this);
