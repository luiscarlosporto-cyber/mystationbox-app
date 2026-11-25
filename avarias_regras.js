// mystationbox · Avarias e ocorrências (25/11/2026). Regras: funções puras, sem ecrã nem base de dados.
// Testes em app/testes/avarias.js. Spec em docs/superpowers/specs/2026-11-25-avarias-design.md.
// As mesmas regras de permissão e de destinatários estão na base de dados (supabase/migrations/20261125_msb_avarias.sql),
// que é quem decide: aqui servem para o ecrã só mostrar os botões que vão ser aceites.
// Só dois perfis (dono, 25/11/2026): administrador e colaborador. «Responsável» é a pessoa a quem a avaria foi atribuída.
(function (raiz) {
  const ESTADOS = [
    { id: "aberta", txt: "Aberta", pl: "Abertas", ic: "📥" },
    { id: "em_analise", txt: "Em análise", pl: "Em análise", ic: "🔍" },
    { id: "em_resolucao", txt: "Em resolução", pl: "Em resolução", ic: "🛠️" },
    { id: "concluida", txt: "Concluída", pl: "Concluídas", ic: "✅" }
  ];
  const PRIORIDADES = [
    { id: "baixa", txt: "Baixa", ic: "⚪", peso: 1 },
    { id: "media", txt: "Média", ic: "🟡", peso: 2 },
    { id: "alta", txt: "Alta", ic: "🟠", peso: 3 },
    { id: "critica", txt: "Crítica", ic: "🔴", peso: 4 }
  ];
  const ABERTOS = ["aberta", "em_analise", "em_resolucao"];
  const MAX_FOTOS = 10, MAX_BYTES = 10 * 1024 * 1024, LADO_MAX = 1600;
  const TIPOS = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
  const SIGLA = { sto: "ST", pnf: "PN" };

  const estado = (id) => ESTADOS.find((e) => e.id === id);
  const prioridade = (id) => PRIORIDADES.find((p) => p.id === id);

  /* botão «mudar estado»: entre os estados abertos; concluir (com solução) e reabrir (com motivo) são ações próprias */
  function transicaoValida(de, para) {
    return de !== para && ABERTOS.indexOf(de) >= 0 && ABERTOS.indexOf(para) >= 0;
  }

  /* q = {admin, eu (user id), avaria: {criado_por, responsavel, estado}} */
  function pode(acao, q) {
    const a = q.avaria || {}, fechada = a.estado === "concluida", resp = !!a.responsavel && a.responsavel === q.eu;
    switch (acao) {
      case "registar": case "comentar": case "foto": return true;
      case "estado": case "concluir": return !fechada && (q.admin || resp);
      case "atribuir": return !fechada && !!q.admin;
      case "reabrir": return fechada && !!q.admin;
      case "categorias": return !!q.admin;
      default: return false;   // apagar ou alterar histórico: ninguém
    }
  }

  /* quem recebe cada evento (spec §6); as preferências de cada pessoa filtram depois, na base de dados */
  function destinatarios(evento, c) {
    let L;
    switch (evento) {
      case "nova": case "critica": L = c.admins || []; break;
      case "atribuida": L = [c.responsavel]; break;
      case "estado": case "concluida": L = [c.criador, c.responsavel].concat(c.admins || []); break;
      case "comentario": L = [c.criador, c.responsavel]; break;
      default: throw new Error("Evento desconhecido: " + evento);
    }
    return L.filter((u, i) => u && u !== c.autor && L.indexOf(u) === i);
  }

  /* devolve null se a fotografia serve, ou a mensagem a mostrar */
  function validarFoto(f) {
    const tipo = (f.type || "").toLowerCase(), heic = /\.(heic|heif)$/i.test(f.name || "");
    if (!(TIPOS.indexOf(tipo) >= 0 || (!tipo && heic))) return "«" + (f.name || "ficheiro") + "» não é uma fotografia (JPEG, PNG, WebP ou HEIC).";
    if (!f.size) return "«" + (f.name || "ficheiro") + "» está vazia.";
    if (f.size > MAX_BYTES) return "«" + (f.name || "ficheiro") + "» tem mais de 10 MB.";
    return null;
  }

  function dimensoes(w, h, max) {
    const m = max || LADO_MAX, k = Math.min(1, m / Math.max(w, h));
    return { w: Math.round(w * k), h: Math.round(h * k) };
  }

  function numeroTxt(est, n) { return (SIGLA[est] || String(est).toUpperCase()) + "-" + String(n).padStart(4, "0"); }
  function lerNumero(hash) {
    const m = /[#&]avaria=([A-Za-z]{2})-(\d+)/.exec(hash || "");
    if (!m) return null;
    const s = m[1].toUpperCase(), est = Object.keys(SIGLA).find((k) => SIGLA[k] === s);
    return est ? { estacao: est, numero: +m[2] } : null;
  }

  function idade(t, agora) {
    const min = Math.floor(((agora || Date.now()) - new Date(t).getTime()) / 60000);
    if (min < 2) return "agora";
    if (min < 60) return "há " + min + " min";
    const h = Math.floor(min / 60);
    if (h < 24) return "há " + h + " h";
    const d = Math.floor(h / 24);
    return "há " + d + (d === 1 ? " dia" : " dias");
  }

  /* dia em Portugal (aaaa-mm-dd), para os filtros de datas */
  const diaPT = (t) => new Date(t).toLocaleDateString("sv-SE", { timeZone: "Europe/Lisbon" });
  function filtrar(L, f) {
    return L.filter((x) => (!f.estacao || x.estacao === f.estacao) && (!f.prioridade || x.prioridade === f.prioridade) &&
      (!f.estado || x.estado === f.estado) && (!f.de || diaPT(x.criado_em) >= f.de) && (!f.ate || diaPT(x.criado_em) <= f.ate));
  }
  /* mais grave primeiro; dentro da mesma prioridade, a mais antiga primeiro (está há mais tempo à espera) */
  function ordenar(L) {
    return L.sort((a, b) => (prioridade(b.prioridade) || {}).peso - (prioridade(a.prioridade) || {}).peso || String(a.criado_em).localeCompare(String(b.criado_em)));
  }

  const api = { ESTADOS, PRIORIDADES, ABERTOS, MAX_FOTOS, MAX_BYTES, LADO_MAX, estado, prioridade, transicaoValida, pode, destinatarios, validarFoto, dimensoes, numeroTxt, lerNumero, idade, filtrar, ordenar, diaPT };
  if (typeof module !== "undefined") module.exports = api; else raiz.AVARIAS = api;
})(this);
