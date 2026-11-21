// mystationbox · Fraude: janelas de tempo sobre as vendas por colaborador dia a dia (dono, 21/11/2026: «15 dias» = os últimos 15 dias
// até ao último dia lido; «mês» = do dia 1 até ao último dia lido). Funções puras; testes em app/testes/fraude_janelas.js.
(function (raiz) {
  const iso = d => d.toISOString().slice(0, 10);
  const mais = (dia, n) => { const d = new Date(dia + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
  const fimDoMes = m => iso(new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0, 12)));

  function diasDe(ini, fim) {
    const R = [];
    for (let d = ini; d <= fim; d = mais(d, 1)) R.push(d);
    return R;
  }

  /* primeiro e último = dias com dados. «q»: blocos de 15 dias a acabar no último dia, para trás, enquanto o bloco tiver dias com dados.
     «m»: meses de calendário; o mês do último dia acaba nesse dia. Devolve por ordem do tempo [{id, ini, fim}]. */
  function janelas(primeiro, ultimo, modo) {
    if (!primeiro || !ultimo || primeiro > ultimo) return [];
    const R = [];
    if (modo === "q") {
      for (let fim = ultimo; fim >= primeiro; fim = mais(fim, -15)) {
        const ini = mais(fim, -14);
        R.unshift({ id: "D:" + ini + ":" + fim, ini, fim });
      }
      return R;
    }
    for (let m = primeiro.slice(0, 7); m <= ultimo.slice(0, 7); m = mais(fimDoMes(m), 1).slice(0, 7)) {
      const fim = fimDoMes(m) < ultimo ? fimDoMes(m) : ultimo;
      R.push({ id: m, ini: m + "-01", fim, completo: fim === fimDoMes(m) });
    }
    return R;
  }

  /* diario: {dia ISO: [[colaborador, família, qtd_c, valor_c]]} → o que FRAUDE.comparar recebe: linhas e dias com vendas de cada um */
  function juntar(diario, ini, fim) {
    const linhas = [], dias = {};
    for (const d of Object.keys(diario)) {
      if (d < ini || d > fim) continue;
      for (const [c, f, q, v] of diario[d]) {
        linhas.push({ colaborador: c, periodo: d, familia: f, qtd: q, valor_c: v });
        (dias[c] = dias[c] || new Set()).add(d);
      }
    }
    return { linhas, dias };
  }

  /* Intervalo de dias de um período guardado num registo: «D:ini:fim», mês «AAAA-MM» ou quinzena «AAAA-MM-1/2» */
  function intervalo(periodo) {
    const p = String(periodo || "");
    if (p.startsWith("D:")) { const a = p.split(":"); return [a[1], a[2]]; }
    if (/^\d{4}-\d{2}$/.test(p)) return [p + "-01", fimDoMes(p)];
    if (/^\d{4}-\d{2}-1$/.test(p)) return [p.slice(0, 7) + "-01", p.slice(0, 7) + "-15"];
    if (/^\d{4}-\d{2}-2$/.test(p)) return [p.slice(0, 7) + "-16", fimDoMes(p.slice(0, 7))];
    return null;
  }
  function sobrepoe(periodo, ini, fim) {
    const r = intervalo(periodo);
    return !!r && r[0] <= fim && r[1] >= ini;
  }

  const api = { diasDe, janelas, juntar, intervalo, sobrepoe, fimDoMes };
  if (typeof module !== "undefined") module.exports = api; else raiz.FRAJ = api;
})(this);
