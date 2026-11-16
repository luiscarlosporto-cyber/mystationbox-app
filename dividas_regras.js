// mystationbox · Gestão → Acordos de dívida (16/11/2026). Regras: funções puras, sem ecrã nem base de dados.
// Testes em app/testes/dividas.js. Valores em cêntimos; datas em texto aaaa-mm-dd.
// O plano não se grava: calcula-se do acordo (total, prestação, primeiro mês, dia). Uma fonte por informação.
// O que se paga cobre as prestações por ordem (a declaração deixa pagar mais e assim reduz as prestações).
(function (raiz) {
  const TOLERANCIA_DIAS = 4;   // vence a 1 → só fica «em atraso» depois do dia 5 (proposta aceite pelo dono, 16/11/2026)

  const mesMais = (M, n) => { const a = +M.slice(0, 4), m = +M.slice(5, 7) - 1 + n; return (a + Math.floor(m / 12)) + "-" + String((m % 12 + 12) % 12 + 1).padStart(2, "0"); };
  const diaMais = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const eur = c => { const s = Math.abs(c), i = String(Math.floor(s / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, " "); return (c < 0 ? "-" : "") + i + "," + String(s % 100).padStart(2, "0") + " €"; };

  function plano(a) {
    if (!(a.total_c > 0 && a.prestacao_c > 0)) throw new Error("Acordo sem valores.");
    if (!/^\d{4}-\d{2}$/.test(a.primeiro_mes || "")) throw new Error("Acordo sem primeiro mês.");
    const dia = String(a.dia_venc || 1).padStart(2, "0"), L = [];
    for (let falta = a.total_c, n = 1; falta > 0; n++) {
      const v = Math.min(a.prestacao_c, falta), mes = mesMais(a.primeiro_mes, n - 1);
      L.push({ n, mes, vence: mes + "-" + dia, valor_c: v }); falta -= v;
    }
    return L;
  }

  const validos = pg => (pg || []).filter(p => !p.anulado_em).sort((x, y) => x.data < y.data ? -1 : x.data > y.data ? 1 : (x.id || 0) - (y.id || 0));

  function estado(a, pagamentos, hoje) {
    const P = plano(a), pago = validos(pagamentos).reduce((s, p) => s + p.valor_c, 0);
    let resto = pago, em_atraso_c = 0;
    const linhas = P.map(x => {
      const pago_c = Math.min(x.valor_c, Math.max(0, resto)); resto -= pago_c;
      const limite = diaMais(x.vence, TOLERANCIA_DIAS);
      const est = pago_c === x.valor_c ? "paga" : hoje > limite ? "atraso" : pago_c > 0 ? "parcial" : "por pagar";
      if (est === "atraso") em_atraso_c += x.valor_c - pago_c;
      return Object.assign({}, x, { pago_c, limite, estado: est });
    });
    return { linhas, pago_c: pago, falta_c: a.total_c - pago, em_atraso_c, atrasadas: linhas.filter(x => x.estado === "atraso"), proxima: linhas.find(x => x.estado !== "paga") || null };
  }

  /* prestações cobertas por um pagamento (id), contando os pagamentos válidos anteriores */
  function cobre(a, pagamentos, id) {
    const V = validos(pagamentos), i = V.findIndex(p => p.id === id); if (i < 0) return [];
    let antes = V.slice(0, i).reduce((s, p) => s + p.valor_c, 0), este = V[i].valor_c; const out = [];
    for (const x of plano(a)) {
      if (este <= 0) break;
      const livre = x.valor_c - Math.min(x.valor_c, antes); antes = Math.max(0, antes - x.valor_c);
      if (livre <= 0) continue;
      const v = Math.min(livre, este); este -= v;
      out.push({ n: x.n, valor_c: v, completa: v === livre });
    }
    return out;
  }
  function lista(ns) { return ns.length === 1 ? ns[0] : ns.slice(0, -1).join(", ") + " e " + ns[ns.length - 1]; }
  function textoCobre(C) {
    const cheias = C.filter(c => c.completa).map(c => c.n), partes = C.filter(c => !c.completa), t = [];
    if (cheias.length) t.push((cheias.length === 1 ? "prestação " : "prestações ") + lista(cheias) + (cheias.length === 1 ? " (paga)" : " (pagas)"));
    partes.forEach(c => t.push("parte da prestação " + c.n + " (" + eur(c.valor_c).replace(/ /g, " ") + ")"));
    return lista(t);
  }

  function cabe(a, pagamentos, valor_c) { const pago = validos(pagamentos).reduce((s, p) => s + p.valor_c, 0); return valor_c > 0 && pago + valor_c <= a.total_c; }

  const UN = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "catorze", "quinze", "dezasseis", "dezassete", "dezoito", "dezanove"];
  const DZ = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const CT = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
  function ate999(n) {
    if (n === 100) return "cem";
    const c = Math.floor(n / 100), r = n % 100, t = [];
    if (c) t.push(CT[c]);
    if (r) t.push(r < 20 ? UN[r] : DZ[Math.floor(r / 10)] + (r % 10 ? " e " + UN[r % 10] : ""));
    return t.join(" e ");
  }
  const junta = (alto, r) => r === 0 ? alto : alto + (r < 100 || r % 100 === 0 ? " e " : " ") + ate999(r);
  function inteiro(n) {
    if (n < 1000) return ate999(n);
    if (n < 1e6) { const m = Math.floor(n / 1000); return junta(m === 1 ? "mil" : ate999(m) + " mil", n % 1000); }
    const M = Math.floor(n / 1e6), r = n % 1e6, alto = M === 1 ? "um milhão" : inteiro(M) + " milhões";
    return r === 0 ? alto : alto + (r < 1000 || (r % 1000 === 0 && r < 1e5) ? " e " : " ") + inteiro(r);
  }
  function extenso(c) {
    const e = Math.floor(c / 100), ct = c % 100, t = [];
    if (e) t.push(e === 1 ? "um euro" : inteiro(e) + (e % 1e6 === 0 ? " de euros" : " euros"));
    if (ct || !e) t.push(ct === 1 ? "um cêntimo" : inteiro(ct) + " cêntimos");
    return t.join(" e ");
  }

  const numeroRecibo = (ano, seq) => ano + "/" + String(seq).padStart(3, "0");

  /* créditos do extrato que parecem pagamentos do devedor: entrada, com o apelido dele, desde o primeiro mês, ainda por ligar */
  const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  function sugerir(movs, devedor, primeiro_mes, pagamentos) {
    const ap = norm(devedor).split(/\s+/).filter(w => w.length >= 4).pop(); if (!ap) return [];
    const ligados = new Set((pagamentos || []).filter(p => p.extrato_id && !p.anulado_em).map(p => p.extrato_id));
    return (movs || []).filter(m => m.valor_c > 0 && m.dia >= primeiro_mes + "-01" && !ligados.has(m.id) && new RegExp("\\b" + ap + "\\b").test(norm((m.descricao || "") + " " + (m.contraparte || ""))));
  }

  const api = { plano, estado, cobre, textoCobre, cabe, extenso, numeroRecibo, sugerir, eur, TOLERANCIA_DIAS };
  if (typeof module !== "undefined") module.exports = api; else raiz.DIVIDAS = api;
})(this);
