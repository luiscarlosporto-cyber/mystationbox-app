// mystationbox · leitura completa de tabelas (13/11/2026). Testes em app/testes/ler_tudo.js.
// O Supabase devolve no máximo 1000 linhas por pedido, mesmo com .limit() maior, e não avisa.
// Uma leitura cortada dá totais errados em silêncio (CLAUDE.md, 7: «falhar com clareza»).
// lerTudo lê por páginas de 1000, ordenadas pela chave da tabela para não repetir nem saltar linhas.
// Uso: lerTudo(() => sb.from("t").select("a,b").eq("estacao", EST), ["id"])  →  {data, error}, como o Supabase.
(function (raiz) {
  const PASSO = 1000;          // limite do servidor (Supabase: max rows = 1000)
  const MAX_PAGINAS = 200;     // 200 000 linhas: acima disto há um erro de desenho, não uma tabela grande

  async function lerTudo(fazer, chave, passo) {
    passo = passo || PASSO;
    let out = [];
    for (let pag = 0; pag < MAX_PAGINAS; pag++) {
      let q = fazer();
      (chave || []).forEach(c => { q = q.order(c); });
      const r = await q.range(pag * passo, pag * passo + passo - 1);
      if (r.error) return { data: null, error: r.error };
      const d = r.data || [];
      out = out.concat(d);
      if (d.length < passo) return { data: out, error: null };
    }
    return { data: null, error: new Error("Leitura demasiado grande (mais de " + MAX_PAGINAS * passo + " linhas): pedido recusado.") };
  }

  const api = { lerTudo, PASSO };
  if (typeof module === "object" && module.exports) module.exports = api;
  else raiz.lerTudo = lerTudo;
})(typeof self !== "undefined" ? self : this);
