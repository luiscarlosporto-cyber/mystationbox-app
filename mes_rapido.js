/* Mudar de mês mais depressa (dono, 21/11/2026). Um mês que já foi aberto aparece logo, esbatido e sem botões,
   enquanto a app volta a ler a base de dados; a leitura nova substitui-o sempre. Assim nunca fica um valor antigo:
   o que se guarda é só o desenho da última vez, em memória, e apaga-se ao sair da conta.
   Também impede que um mês pedido antes apareça por cima do mês pedido depois (cliques rápidos em ‹ ›). */
var MES_RAPIDO = (function () {
  var MAX = 24, guardado = new Map(), vez = {};

  function comecar(pagina, chave) {
    var n = (vez[pagina] || 0) + 1, k = pagina + "|" + chave;
    vez[pagina] = n;
    var atual = function () { return vez[pagina] === n; };
    return {
      antes: guardado.has(k) ? guardado.get(k) : null,
      atual: atual,
      guardar: function (html) {
        if (!atual()) return;
        guardado.delete(k); guardado.set(k, html);
        while (guardado.size > MAX) guardado.delete(guardado.keys().next().value);
      }
    };
  }

  function aEspera(html) {
    return "<div class='msbAntes' inert aria-busy='true' style='opacity:.55;pointer-events:none'><p class='rod'>A atualizar…</p>" + html + "</div>";
  }

  function limpar() {   // ao sair da conta: esquece os desenhos e anula as leituras que ainda estejam a meio
    guardado.clear();
    Object.keys(vez).forEach(function (p) { vez[p]++; });
  }

  return {comecar: comecar, aEspera: aEspera, limpar: limpar};
})();
if (typeof module !== "undefined") module.exports = MES_RAPIDO;
