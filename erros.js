// mystationbox · registo dos erros da app (13/11/2026). Testes em app/testes/erros.js.
// Cada erro que aparece num telemóvel ou computador grava uma linha em msb_erros (só acrescenta; só o administrador lê).
// Nunca atrapalha a app: se a gravação falhar, desiste em silêncio. Máximo 15 erros diferentes por sessão.
(function (raiz) {
  const MAX = 15;
  const IGNORAR = [/ResizeObserver loop/i, /Script error\.?$/i, /AbortError/i];

  function novoEstado() { return { vistos: {}, n: 0 }; }

  // Decide se um erro se grava: não repete a mesma mensagem, não passa do máximo, ignora ruído do navegador.
  function deveRegistar(estado, msg) {
    msg = String(msg || "").trim();
    if (!msg || IGNORAR.some(r => r.test(msg))) return false;
    if (estado.vistos[msg] || estado.n >= MAX) return false;
    estado.vistos[msg] = 1; estado.n++;
    return true;
  }

  function linha(e, extra) {
    const m = (e && (e.message || e.error_description)) || String(e);
    return {
      mensagem: String(m).slice(0, 500) || "erro sem mensagem",
      pilha: e && e.stack ? String(e.stack).slice(0, 2000) : null,
      estacao: extra.estacao === "sto" || extra.estacao === "pnf" ? extra.estacao : null,
      versao: extra.versao ? String(extra.versao).slice(0, 20) : null,
      pagina: extra.pagina ? String(extra.pagina).slice(0, 60) : null,
      agente: extra.agente ? String(extra.agente).slice(0, 300) : null
    };
  }

  const api = { deveRegistar, novoEstado, linha, MAX };
  if (typeof module === "object" && module.exports) { module.exports = api; return; }

  const estado = novoEstado();
  raiz.msbErro = function (e) {
    try {
      const l = linha(e, { estacao: raiz.EST, versao: raiz.VERSAO_APP, pagina: raiz.PAGINA || location.hash, agente: navigator.userAgent });
      if (!raiz.sb || !deveRegistar(estado, l.mensagem)) return;
      raiz.sb.from("msb_erros").insert(l).then(function () {}, function () {});
    } catch (x) { /* o registo de erros nunca causa outro erro */ }
  };
  raiz.addEventListener("error", function (ev) { raiz.msbErro(ev.error || ev.message); });
  raiz.addEventListener("unhandledrejection", function (ev) { raiz.msbErro(ev.reason); });
})(typeof self !== "undefined" ? self : this);
