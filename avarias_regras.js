// mystationbox · Avarias e ocorrências (25/11/2026). Regras: funções puras, sem ecrã nem base de dados.
// Testes em app/testes/avarias.js. Spec em docs/superpowers/specs/2026-11-25-avarias-design.md.
// As mesmas regras de permissão e de destinatários estão na base de dados (supabase/migrations/20261125_msb_avarias.sql),
// que é quem decide: aqui servem para o ecrã só mostrar os botões que vão ser aceites.
// Só dois perfis (dono, 25/11/2026): administrador e colaborador. «Responsável» é a pessoa a quem a avaria foi atribuída.
(function (raiz) {
  const ESTADOS = [
    /* nomes da sequência com prestadores (26/11/2026); os ids da base de dados não mudaram */
    { id: "aberta", txt: "Comunicada", pl: "Comunicadas", ic: "📥" },
    { id: "em_analise", txt: "Encaminhada", pl: "Encaminhadas", ic: "📨" },
    { id: "em_resolucao", txt: "Visita marcada", pl: "Com visita ou peça", ic: "📅" },
    { id: "concluida", txt: "Resolvida", pl: "Resolvidas", ic: "✅" }
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
      case "encaminhar": return !fechada && !!q.admin;
      case "validar": return a.estado === "em_analise" || a.estado === "em_resolucao";   // qualquer pessoa da estação (dono, 26/11/2026)
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

  /* prestador sugerido pelo tipo de avaria e pelo equipamento; null se não houver regra ou o prestador não existir na estação */
  function sugerirPrestador(P, categoria, equipamento) {
    const t = ((categoria || "") + " " + (equipamento || "")).toLowerCase();
    const achar = (re) => { const p = (P || []).find((x) => re.test(x.nome)); return p ? p.id : null; };
    if (/cerveja|barril|chopp|imperial/.test(t)) return achar(/super\s*bock/i);
    if (/caf[eé]|delta/.test(t)) return achar(/delta/i);
    if (/inform[aá]tica|pos\b|computador|impressora|rede/.test(t)) return achar(/inform[aá]tica/i);
    if (/bomba|combust|lavagem|aspira/.test(t)) return achar(/repsol/i);
    return null;
  }
  /* passos para o ecrã: Comunicada → Encaminhada → Visita marcada (ou À espera de peça) → Resolvida */
  function passos(a) {
    const i = ["aberta", "em_analise", "em_resolucao", "concluida"].indexOf(a.estado);
    const txt = ["Comunicada", "Encaminhada", a.aguarda_peca ? "À espera de peça" : "Visita marcada", "Resolvida"];
    return txt.map((t, k) => ({ txt: t, feito: k <= i, atual: k === i }));
  }
  /* por prestador: abertas, resolvidas e dias médios do encaminhamento até ficar resolvida */
  function resumoPrestadores(L) {
    const R = {};
    (L || []).forEach((a) => {
      if (!a.prestador_id) return;
      const r = R[a.prestador_id] || (R[a.prestador_id] = { abertas: 0, resolvidas: 0, soma: 0 });
      if (a.estado === "concluida") { r.resolvidas++; if (a.encaminhada_em && a.concluido_em) r.soma += (new Date(a.concluido_em) - new Date(a.encaminhada_em)) / 864e5; }
      else r.abertas++;
    });
    Object.keys(R).forEach((k) => { const r = R[k]; R[k] = { abertas: r.abertas, resolvidas: r.resolvidas, dias: r.resolvidas ? Math.round(r.soma / r.resolvidas * 10) / 10 : null }; });
    return R;
  }

  /* email ao prestador (26/11/2026): nome da estação com o número do posto, como o dono pediu no assunto */
  const ESTACAO_NOME = { sto: "Repsol Santo Tirso 1344", pnf: "Repsol Penafiel Circular 1346" };
  const MODELO_PADRAO = {
    assunto: "Avaria {numero} · {estacao} · {titulo}",
    corpo: "Bom dia,\n\nPedimos a vossa intervenção para a avaria abaixo.\n\n{quadro}\n\nObrigado.\nLuís Carlos\n{estacao}"
  };
  const CAMPOS = ["numero", "estacao", "titulo", "descricao", "prioridade", "equipamento", "comunicada_em"];
  /* modelo do prestador, senão o da estação, senão o padrão */
  function escolherModelo(M, estacao, prestadorId) {
    const L = M || [];
    return L.find((m) => m.estacao === estacao && m.prestador_id === prestadorId) || L.find((m) => m.estacao === estacao && !m.prestador_id) || MODELO_PADRAO;
  }
  /* troca {campo} pelos dados da avaria; {quadro} fica (é montado no servidor) e campos desconhecidos ficam como estão */
  function preencherModelo(t, a, extra) {
    const x = extra || {}, d = {
      numero: numeroTxt(a.estacao, a.numero), estacao: ESTACAO_NOME[a.estacao] || a.estacao, titulo: a.titulo || "", descricao: a.descricao || "",
      prioridade: (prioridade(a.prioridade) || {}).txt || a.prioridade || "", equipamento: x.equipamento || "",
      comunicada_em: a.criado_em ? new Date(a.criado_em).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", "") : ""
    };
    return String(t || "").replace(/\{(\w+)\}/g, (m, k) => (CAMPOS.indexOf(k) >= 0 ? d[k] : m));
  }

  const api = { ESTACAO_NOME, MODELO_PADRAO, CAMPOS, escolherModelo, preencherModelo, sugerirPrestador, passos, resumoPrestadores, ESTADOS, PRIORIDADES, ABERTOS, MAX_FOTOS, MAX_BYTES, LADO_MAX, estado, prioridade, transicaoValida, pode, destinatarios, validarFoto, dimensoes, numeroTxt, lerNumero, idade, filtrar, ordenar, diaPT };
  if (typeof module !== "undefined") module.exports = api; else raiz.AVARIAS = api;
})(this);
