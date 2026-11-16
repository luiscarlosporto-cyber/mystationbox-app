// mystationbox · Combustível → Redução Repsol (16/11/2026). Regras: funções puras, sem ecrã nem base de dados.
// Testes em app/testes/reducao.js.
// A partir de 16/11/2026 a Repsol muda a «Redução Cêntimos€/litro» de cada PDF de preços (redução dinâmica).
// Pergunta do dono: a Repsol ganha ou perde com cada mudança? Compara-se cada PDF com o anterior, desde o PDF de
// 16/11/2026 (incluído, é o ponto de partida), e não com o desconto fixo antigo (decisão do dono, 16/11/2026).
//   ganho da Repsol = (redução do PDF anterior − redução do PDF novo) × litros vendidos sem Solred no período
// Positivo: a redução desceu e a Repsol ganha. Negativo: a redução subiu e a Repsol perde.
// Litros sem Solred = parte «consigna» do relatório CBOS «Turno por formas de cobrança» do mês (msb_vendas_mes),
// repartida por dia. Sem o relatório desse mês usa-se a média por dia do último mês carregado e marca-se «estimado».
// Unidades: redução em milésimos de cêntimo por litro (6000 = 6,000 c/L, como no PDF), litros em centilitros,
// euros em cêntimos.
(function (raiz) {
  const DESDE = "2026-11-16";

  /* produto do PDF de preços (chave) → nome no relatório CBOS */
  const CBOS = {
    "AUTOGAS": /GPL|GLP|AUTOGAS/,
    "GASOLINAEFITEC98": /EFITEC 98|98/,
    "GASOLINAS/CHUMBO95": /^GASOLINA (SIMPLES|95)/,
    "EF95PREMIUM": /EFITEC 95|95 PREM/,
    "GASOLEO": /^GAS[OÓ]LEO( SIMPLES)?$/,
    "REPSOLDIESELE+10": /E\+10/,
    "DIESELNEXA100%": /NEXA/
  };

  const diaMais = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const diasEntre = (de, ate) => Math.round((Date.parse(ate + "T12:00:00Z") - Date.parse(de + "T12:00:00Z")) / 864e5);   // ate exclusivo

  /* litros sem Solred por dia de cada produto, a partir de um relatório do mês (msb_vendas_mes) */
  function litrosPorDia(vm) {
    const dias = diasEntre(vm.de, diaMais(vm.ate, 1)), cons = ((vm.dados || {}).comb || {}).consigna || {}, r = {};
    if (!(dias > 0)) return r;
    Object.keys(CBOS).forEach(ch => {
      let cl = 0, achou = false;
      Object.keys(cons).forEach(nome => { if (CBOS[ch].test(nome) && !(ch !== "DIESELNEXA100%" && /NEXA/.test(nome))) { cl += cons[nome][0] || 0; achou = true; } });
      if (achou) r[ch] = cl / dias;
    });
    return r;
  }

  /* relatório a usar num dia: o do próprio mês; senão o último mês carregado (estimado) */
  function fonteDoDia(dia, vendas) {
    const M = dia.slice(0, 7), proprio = vendas.find(v => v.mes === M);
    if (proprio) return { vm: proprio, estimado: false };
    const ant = vendas.filter(v => v.mes < M).sort((a, b) => a.mes < b.mes ? 1 : -1)[0];
    return ant ? { vm: ant, estimado: true } : null;
  }

  const red = (pdf, ch) => { const p = (pdf.produtos || []).find(x => x.chave === ch); return p && !p.fora ? p : null; };

  /* precos: PDF guardados (msb_precos: dia, produtos). vendas: msb_vendas_mes (mes, de, ate, dados). hoje: aaaa-mm-dd.
     Devolve os períodos (um por PDF depois do ponto de partida), do mais recente para o mais antigo, e os totais por mês. */
  function calcular(precos, vendas, hoje) {
    const P = (precos || []).filter(x => x.dia >= DESDE).sort((a, b) => a.dia < b.dia ? -1 : 1), V = vendas || [];
    const cacheL = {}, litros = vm => cacheL[vm.mes] || (cacheL[vm.mes] = litrosPorDia(vm));
    const meses = {}, periodos = [];
    for (let i = 1; i < P.length; i++) {
      const ant = P[i - 1], novo = P[i], fimEx = P[i + 1] ? P[i + 1].dia : diaMais(hoje, 1);   // fim exclusivo: até hoje, incluído
      const dias = Math.max(0, diasEntre(novo.dia, fimEx));
      const chaves = (novo.produtos || []).filter(p => !p.fora && CBOS[p.chave]).map(p => p.chave);
      let estimado = false, semVendas = false;
      const linhas = chaves.map(ch => {
        const a = red(ant, ch), n = red(novo, ch);
        const L = { chave: ch, nome: n.pdf, red_ant: a ? a.red_civa : null, red: n.red_civa, dif: a ? a.red_civa - n.red_civa : null,
          dif_siva: a ? a.red_siva - n.red_siva : null, litros_cl: 0, ganho_c: 0, ganho_siva_c: 0, por_dia_c: null };
        for (let d = 0; d < dias; d++) {
          const dia = diaMais(novo.dia, d), f = fonteDoDia(dia, V);
          if (!f) { semVendas = true; continue; }
          if (f.estimado) estimado = true;
          L.litros_cl += litros(f.vm)[ch] || 0;
        }
        L.litros_cl = Math.round(L.litros_cl);
        if (L.dif != null) {
          L.ganho_c = Math.round(L.dif * L.litros_cl / 1e5);
          L.ganho_siva_c = Math.round(L.dif_siva * L.litros_cl / 1e5);
          const f = fonteDoDia(novo.dia, V);   // por dia: para o período que ainda não começou (ex.: o PDF de amanhã)
          if (f) L.por_dia_c = Math.round(L.dif * (litros(f.vm)[ch] || 0) / 1e5);
        }
        return L;
      });
      const soma = k => linhas.reduce((s, x) => s + (x[k] || 0), 0);
      const per = { dia: novo.dia, anterior: ant.dia, ate: diaMais(fimEx, -1), dias, futuro: novo.dia > hoje, estimado, semVendas, linhas,
        ganho_c: soma("ganho_c"), ganho_siva_c: soma("ganho_siva_c"), por_dia_c: linhas.some(x => x.por_dia_c != null) ? soma("por_dia_c") : null,
        mudou: linhas.filter(x => x.dif).length };
      periodos.push(per);
      /* totais por mês: cada dia do período conta no seu mês */
      for (let d = 0; d < dias; d++) {
        const dia = diaMais(novo.dia, d), M = dia.slice(0, 7), f = fonteDoDia(dia, V); if (!f) continue;
        const m = meses[M] || (meses[M] = { mes: M, ganho_c: 0, ganho_siva_c: 0, estimado: false });
        if (f.estimado) m.estimado = true;
        linhas.forEach(x => { if (x.dif == null) return; const l = litros(f.vm)[x.chave] || 0; m.ganho_c += x.dif * l / 1e5; m.ganho_siva_c += x.dif_siva * l / 1e5; });
      }
    }
    const M = Object.keys(meses).sort().reverse().map(k => Object.assign(meses[k], { ganho_c: Math.round(meses[k].ganho_c), ganho_siva_c: Math.round(meses[k].ganho_siva_c) }));
    return { desde: DESDE, partida: P[0] || null, periodos: periodos.reverse(), meses: M };
  }

  const API = { DESDE, CBOS, litrosPorDia, calcular };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else raiz.REDUCAO = API;
})(typeof window !== "undefined" ? window : this);
