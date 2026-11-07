/* mystationbox beta · Etapa 3: Painel de Gestão do administrador (desenho aprovado a 06/11/2026): loja e mês, cartões, vendas por dia, Por decidir, combustível e loja, como recebeste, Por fechar.
 * Cada linha abre a página onde a coisa se resolve, já na loja certa. Abre no mês em curso até ontem, lido no CBOS pelo OCTAN AI
 * (pedido automático, pasta PAINEL, um por dia e por loja); ‹ › mudam para meses inteiros: Folha de fecho do CBOS ou, se não houver, leitura pedida ao OCTAN AI. */
"use strict";
(function () {
  var IND = [   // indicadores que se podem escolher e ordenar: id, nome, de início?, valor por loja a partir de D (número ou null), formato
    ["vend", "Vendas com IVA", 1, function (D) { return D.c ? D.c.total : D.f ? D.f.dados.totais.formas : null; }, "eur"],
    ["lit", "Litros vendidos", 1, function (D) { return D.c ? D.c.litros : D.f && D.f.dados.totais.comb ? D.f.dados.totais.comb[1] / 100 : null; }, "lit"],
    ["comb", "Combustível com IVA", 1, function (D) { return D.c ? D.c.comb : D.f && D.f.dados.totais.comb ? D.f.dados.totais.comb[5] : null; }, "eur"],
    ["loja", "Loja com IVA", 1, function (D) { return D.c ? D.c.total - D.c.comb : D.f && D.f.dados.totais.loja ? D.f.dados.totais.loja[5] : null; }, "eur"],
    ["mb", "Multibanco", 0, function (D) { return forma(D, ["CARTAO BANCARIO", "BANCARIO OFFLINE"]); }, "eur"],
    ["sol", "Solred", 0, function (D) { return forma(D, ["SOLRED", "SOLRED OFFLINE"]); }, "eur"],
    ["num", "Numerário", 0, function (D) { return forma(D, ["NUMERARIO"]); }, "eur"],
    ["tur", "Mês em curso · vendas", 0, function (D) { return D.mes.length ? D.mes.reduce(function (s, r) { return s + r.vendas_c; }, 0) : null; }, "eur"],
    ["dif", "Mês em curso · diferença", 0, function (D) { return D.mes.length ? D.mes.reduce(function (s, r) { return s + (dif(r) || 0); }, 0) : null; }, "dif"],
    ["ont", "Ontem · vendas", 0, function (D) { var v = D.mes.concat(D.ant).filter(function (r) { return r.dia === hojeISO(-1); }); return v.length ? v.reduce(function (s, r) { return s + r.vendas_c; }, 0) : null; }, "eur"]
  ];
  var RITMO = {vend: 1, lit: 1, comb: 1, loja: 1};   // somam dia a dia: dá para comparar o valor por dia com o mês anterior
  function num(n, c) { return FORMATOS.numero(n, c); }
  function eur(c) { return num(c / 100, 2) + " €"; }
  function eur0(c) { return num(Math.round(c / 100), 0) + " €"; }
  function formato(n, t) { return t === "eur" ? eur(n) : t === "lit" ? num(Math.round(n), 0) + " L" : sinal(Math.round(n)) + " €"; }
  function forma(D, ks) { if (!D.f || !D.f.dados.formas) return null; var F = D.f.dados.formas; return ks.reduce(function (s, k) { return s + (F[k] || 0); }, 0); }
  function Maius(t) { return t.replace(/^./, function (l) { return l.toUpperCase(); }); }
  function nomeMes(m) { return new Date(m + "-15").toLocaleDateString("pt-PT", {month: "long"}); }
  function nomeLoja(e) { return e.short_name || e.name; }
  function ler(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function gravar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* vale só nesta sessão */ } }
  function indAtivos() {
    var s = ler("msb_ind"), base = IND.filter(function (x) { return x[2]; }).map(function (x) { return x[0]; });
    return s && s.length ? s.filter(function (k) { return IND.some(function (x) { return x[0] === k; }); }) : base;
  }
  function tag(t, tom) { return "<span class='tag t-" + tom + "'>" + esc(t) + "</span>"; }

  async function ler2(p) { var r = await p; if (r.error) throw r.error; return r.data || []; }
  async function dados() {
    var hoje = hojeISO(0), mes = hoje.slice(0, 7), ant = addMes(mes, -1), f = [], guarda = function (nome, p) { return ler2(p).catch(function (e) { f.push(nome); console.warn(nome, e); return null; }); };
    var R = await Promise.all([
      guarda("turnos", sb.from("msb_turnos").select("estacao,dia,turno,vendas_c,mb_c,solred_c,pres_c,num_c,forn_c,chq_c").gte("dia", ant + "-01").not("vendas_c", "is", null)),
      guarda("folha de fecho", sb.from("msb_folha_fecho").select("estacao,mes,dados").order("mes", {ascending: false}).limit(8)),
      guarda("saídas", sb.from("msb_saidas").select("estacao,valor_c").is("recebido", null)),
      guarda("encomendas", sb.from("orders").select("id,company_id,lines,created_at").eq("status", "pendente")),
      guarda("preços", sb.from("msb_precos").select("estacao,dia,estado,aprovado_em,ense_erro").order("dia", {ascending: false}).limit(12)),
      guarda("TMS", sb.from("msb_tms").select("estacao").eq("mes", ant)),
      guarda("relatórios", sb.from("msb_vendas_mes").select("estacao").eq("mes", ant)),
      guarda("vendas por artigo", sb.from("msb_vendas_artigos").select("estacao,de,ate").lte("de", ant + "-01").gte("ate", ant + "-28")),
      guarda("pedidos", sb.from("msb_pedidos").select("id,estacao,estado,de,ate,visto_em,pasta").eq("estado", "feito").is("visto_em", null).neq("pasta", "PAINEL")),
      guarda("documentos", sb.from("msb_docs").select("estacao,emissao").order("emissao", {ascending: false}).limit(40)),
      guarda("avisos", avisosRecentes(60).then(function (x) { return {data: x}; })),
      guarda("mês em curso", pedidosMes(mes)),
      guarda("mês anterior", pedidosMes(ant))
    ]);
    return {cur: (R[11] || []).concat(R[12] || []), hoje: hoje, mes: mes, ant: ant, tur: R[0], fol: R[1], sai: R[2], enc: R[3], pre: R[4], tms: R[5], vm: R[6], va: R[7], ped: R[8], doc: R[9], avi: R[10], falhas: f};
  }

  function pedidosMes(m) { return sb.from("msb_pedidos").select("id,estacao,estado,de,ate,linhas,dias,familias").eq("pasta", "PAINEL").gte("de", m + "-01").lt("de", addMes(m, 1) + "-01").order("id", {ascending: false}).limit(6); }
  /* Mês em curso: uma leitura por dia e por loja, até ontem; no dia 1 ainda não há nada. Mês fechado: uma leitura do mês inteiro. Traz também as vendas por dia. */
  async function pedir(X, m) {
    var ontem = hojeISO(-1), ate = m === X.mes ? ontem : PN.ultimoDia(m); if (!ADMIN || !X.cur || ate.slice(0, 7) !== m) return;
    var falta = ESTS.filter(function (e) { return PN.pedir(X.cur, e.id, m, ate); }); if (!falta.length) return;
    var L = falta.map(function (e) { return {estacao: e.id, de: m + "-01", ate: ate, pasta: "PAINEL", artigo: "", pedido_por: "Painel", visto_em: new Date().toISOString()}; });
    var r = await sb.from("msb_pedidos").insert(L); if (r.error) throw r.error;
    X.cur = L.map(function (q) { return Object.assign({estado: "pendente"}, q); }).concat(X.cur);
  }
  function mesCurso(X, id, M) {   // códigos de 1 ou 2 algarismos = combustíveis, como na família do CBOS
    var p = (X.cur || []).find(function (q) { return q.estacao === id && q.de.slice(0, 7) === M && q.estado === "feito" && q.linhas; }); if (!p) return null;
    var c = {ate: p.ate, total: 0, comb: 0, litros: 0};
    p.linhas.forEach(function (l) { var v = Math.round(l[3] * 100); c.total += v; if (/^\d{1,2}$/.test(l[0])) { c.comb += v; c.litros += l[2]; } });
    return c;
  }
  var MES_V = null, NR_V = 0, LOJA_V = "todas";   // mês e loja escolhidos; null = mês em curso
  function idsVer() { return LOJA_V === "todas" ? ESTS.map(function (e) { return e.id; }) : [LOJA_V]; }
  function lojasVer() { return ESTS.filter(function (e) { return LOJA_V === "todas" || e.id === LOJA_V; }); }
  async function lerMes(X, m) {
    var a = await sb.from("msb_folha_fecho").select("estacao,mes,dados").eq("mes", m), b = await pedidosMes(m);
    if (a.error || b.error) throw a.error || b.error;
    X.fol = (X.fol || []).filter(function (x) { return x.mes !== m; }).concat(a.data || []);
    X.cur = (b.data || []).concat((X.cur || []).filter(function (x) { return x.de.slice(0, 7) !== m; }));
  }
  /* Enquanto o OCTAN AI lê, volta a ver de 30 em 30 segundos, no máximo 4 minutos */
  async function aguardar(X, nr) {
    var M = MES_V || X.mes, A = addMes(M, -1), ids = ESTS.map(function (e) { return e.id; });
    for (var i = 0; i < 8 && (PN.aLer(X.cur, M, ids) || PN.aLer(X.cur, A, ids)); i++) {
      await new Promise(function (ok) { setTimeout(ok, 30000); });
      if (nr !== NR_V || PAGINA !== "ini") return;
      await lerMes(X, M); await lerMes(X, A); desenhar(X);
    }
  }
  async function verMes(X, m) {
    var nr = ++NR_V; MES_V = m === X.mes ? null : m;
    try {
      await lerMes(X, m); await lerMes(X, addMes(m, -1));
      await pedir(X, m); await pedir(X, addMes(m, -1));
      if (nr !== NR_V || PAGINA !== "ini") return;
      desenhar(X); await aguardar(X, nr);
    } catch (e) { msbAviso("Erro: " + falhou(e)); }
  }
  function porDecidir(X) {
    var L = [], loja = function (id) { var e = ESTS.find(function (x) { return x.id === id; }); return e ? nomeLoja(e) : id; };
    (X.avi || []).filter(function (a) { return !a.lido_em && (a.nivel === "erro" || a.nivel === "atencao"); }).forEach(function (a) {
      var ense = a.tipo === "ense" && /preç|ENSE/i.test(a.titulo || "");   // ENSE é o único crítico: só sai depois de tratado
      L.push({o: a.nivel === "erro" ? 0 : 2, t: a.titulo, s: loja(a.estacao) + " · OCTAN AI", e: a.estacao, p: "avi", b: "Ver", arq: ense ? "" : "a" + a.id});
    });
    var par = X.avi && aviParado(X.avi); if (par) L.push({o: 0, t: "O OCTAN AI não corre desde " + aviDataHora(par.criado), s: "Confirma se o PC está ligado", p: "avi", b: "Ver"});
    (X.pre || []).filter(function (x) { return x.estado === "lido" && (!x.aprovado_em || x.ense_erro); }).forEach(function (x) {
      L.push({o: 1, t: x.ense_erro ? "Preços ENSE por gravar" : "Preços ENSE por aprovar", s: loja(x.estacao) + " · em vigor a " + dmy(x.dia), e: x.estacao, p: "pre", b: "Ver"});
    });
    (X.enc || []).forEach(function (o) {
      L.push({o: 1, t: "Encomenda por aprovar", s: loja(o.company_id) + " · " + (o.lines || []).length + " artigos", e: o.company_id, p: "enc", b: "Ver"});
    });
    (X.ped || []).forEach(function (p) { L.push({o: 3, t: "Vendas pedidas prontas", s: loja(p.estacao) + " · " + dmy(p.de) + " a " + dmy(p.ate), e: p.estacao, p: "avi", b: "Ver", arq: "p" + p.id}); });
    var S = {}; (X.sai || []).forEach(function (s) { var a = S[s.estacao] = S[s.estacao] || {n: 0, v: 0}; a.n++; a.v += s.valor_c || 0; });
    Object.keys(S).forEach(function (e) { L.push({o: 3, t: S[e].n === 1 ? "Saída de caixa por entregar" : S[e].n + " saídas de caixa por entregar", s: loja(e) + " · " + eur(S[e].v), e: e, p: "sai", b: "Ver"}); });
    return L.filter(function (x) { return LOJA_V === "todas" || !x.e || x.e === LOJA_V; }).sort(function (a, b) { return a.o - b.o; });
  }

  function dadosLoja(X, e, M) {
    M = M || MES_V || X.mes;
    var f = (X.fol || []).find(function (x) { return x.estacao === e.id && x.mes === M; }) || null, T = (X.tur || []).filter(function (r) { return r.estacao === e.id; });
    var c = f ? null : mesCurso(X, e.id, M);
    return {c: c, f: f, mes: T.filter(function (r) { return r.dia.slice(0, 7) === X.mes; }), ant: T.filter(function (r) { return r.dia.slice(0, 7) !== X.mes; }), T: T};
  }
  function soma(X, I, M) {   // soma das lojas escolhidas; só se todas tiverem valor
    var v = lojasVer().map(function (e) { return I[3](dadosLoja(X, e, M)); });
    return v.some(function (x) { return x == null; }) ? null : v.reduce(function (a, b) { return a + b; }, 0);
  }
  function tituloMes(X) {
    var M = MES_V || X.mes, ates = lojasVer().map(function (e) { var c = dadosLoja(X, e).c; return c ? c.ate : ""; }).filter(Boolean).sort();
    return Maius(nomeMes(M)) + (M.slice(0, 4) !== X.mes.slice(0, 4) ? " " + M.slice(0, 4) : "") + (M === X.mes && ates.length ? " até " + dmy(ates[0]).slice(0, 5) : "");
  }
  function diasVistos(X, M) {   // dias que o valor do mês cobre
    var ates = ESTS.map(function (e) { var c = dadosLoja(X, e, M).c; return c ? c.ate : ""; }).filter(Boolean).sort();
    return ates.length ? +ates[0].slice(8) : PN.diasMes(M);
  }
  function cartoes(X) {
    var M = MES_V || X.mes, A = addMes(M, -1), d = diasVistos(X, M), d0 = PN.diasMes(A), lista = indAtivos();
    return "<div class='pnKs'>" + lista.map(function (k, i) {
      var I = IND.find(function (x) { return x[0] === k; }), v = soma(X, I, M), rit = RITMO[k] ? PN.ritmo(v, d, soma(X, I, A), d0) : null, sub = "";
      if (rit != null) sub = "<span class='pn" + (rit >= 0 ? "Sobe" : "Desce") + "'>" + (rit >= 0 ? "▲ " : "▼ ") + num(Math.abs(rit), 1) + " %</span> por dia face a " + nomeMes(A);
      if (i === 0 && k === "vend" && v != null) sub += M === X.mes && d < PN.diasMes(M) ? " · a este ritmo, cerca de " + eur0(v / d * PN.diasMes(M)) + " no fim do mês" : (sub ? " · " : "") + eur0(v / d) + " por dia";
      var porLoja = LOJA_V === "todas" && ESTS.length > 1 ? "<small>" + ESTS.map(function (e) { var x = I[3](dadosLoja(X, e, M)); return esc(nomeLoja(e)) + " " + (x == null ? "—" : k === "lit" ? formato(x, "lit") : I[4] === "eur" ? eur0(x) : formato(x, I[4])); }).join(" · ") + "</small>" : "";
      return "<div class='pnK" + (i ? "" : " hero") + "'><span class='rt'>" + I[1] + "</span><strong" + (v == null ? ">—" : " data-n='ind-" + k + "' data-v='" + v + "' data-t='" + I[4] + "'>" + formato(v, I[4])) + "</strong><p>" + sub + "</p>" + porLoja + "</div>";
    }).join("") + "</div>";
  }
  var GR = null, FAM_V = "TODAS";   // dados do gráfico que está no ecrã; família escolhida
  var NOMES_FAM = {TODAS: "Todas", COMBUSTIVEIS: "Combustíveis", RESTO: "Loja e restantes", TABACO: "Tabaco", LOJA: "Loja", CAFETARIA: "Cafetaria", GAS: "Gás", LAVAGEM: "Lavagem", IMPRENSA: "Imprensa", LUBRIFICANTES: "Lubrificantes", "ADBLUE EMBALADO": "AdBlue embalado", "PROMOCOES REPSOL": "Promoções Repsol", "SEM FAMÍLIA": "Sem família"};
  function nomeFam(f) { return NOMES_FAM[f] || Maius(f.toLowerCase()); }
  function somaSerie(v) { return v ? v.reduce(function (s, x) { return s + (x || 0); }, 0) : null; }
  /* Vendas por família e por dia (aprovado a 06/11/2026): combustíveis em litros, o resto em dinheiro, o mês contra o anterior */
  function grafico(X) {
    var M = MES_V || X.mes, A = addMes(M, -1), ids = idsVer(), TF = PN.totaisFam(X.cur, A, ids) || PN.totaisFam(X.cur, M, ids) || {};
    var lista = ["TODAS", "COMBUSTIVEIS", "RESTO"].concat(Object.keys(TF).filter(function (f) { return f !== "COMBUSTIVEIS"; }).sort(function (x, y) { return TF[y][1] - TF[x][1]; }).slice(0, 6));
    if (lista.indexOf(FAM_V) < 0) lista.push(FAM_V);
    var lit = FAM_V === "COMBUSTIVEIS", a = PN.serieFam(X.cur, M, ids, FAM_V), b = PN.serieFam(X.cur, A, ids, FAM_V), nome = LOJA_V === "todas" ? "as duas estações" : nomeLoja(ESTS.find(function (e) { return e.id === LOJA_V; }));
    var fv = function (v) { return v == null ? "—" : lit ? num(Math.round(v), 0) + " L" : eur(v * 100); };
    var d = diasVistos(X, M), d0 = PN.diasMes(A), sa = somaSerie(a), sb2 = somaSerie(b), r = PN.ritmo(sa, d, sb2, d0);
    var h = "<section class='bl pnC8'><h3>Vendas por dia · " + esc(nomeFam(FAM_V)) + " · " + esc(nome) + "</h3><p class='pnSub'>" + (FAM_V === "TODAS" && Object.keys(TF).length ? "Combustíveis em litros, as outras famílias em € com IVA, lidas no CBOS pelo OCTAN AI. Toca numa família para a ver dia a dia." : (lit ? "Litros vendidos" : "Vendas com IVA") + ", lidas no CBOS pelo OCTAN AI. Passa o rato ou o dedo para ver cada dia.") + "</p>" +
      "<div class='pnChips'>" + lista.map(function (f) { return "<button data-fam='" + esc(f) + "' class='" + (f === FAM_V ? "on" : "") + "' aria-pressed='" + (f === FAM_V) + "'>" + esc(nomeFam(f)) + "</button>"; }).join("") + "</div>" +
      "<div class='pnKp'><div><small>" + esc(tituloMes(X)) + "</small><b>" + fv(sa) + "</b></div><div><small>" + esc(Maius(nomeMes(A))) + "</small><b>" + fv(sb2) + "</b></div><div><small>Por dia, face a " + esc(nomeMes(A)) + "</small><b class='" + (r == null ? "" : r >= 0 ? "pnSobe" : "pnDesce") + "'>" + (r == null ? "—" : (r >= 0 ? "▲ " : "▼ ") + num(Math.abs(r), 1) + " %") + "</b></div></div>";
    GR = null;
    if (FAM_V === "TODAS" && Object.keys(TF).length) return h.replace(/<div class='pnKp'>[\s\S]*$/, "") + quadros(X, M, A, ids, TF) + "</section>";
    if (!a && !b) return h + "<div class='pnVaz'>" + (PN.aLer(X.cur, M, ids) || PN.aLer(X.cur, A, ids) ? "<b>A ler as vendas por dia no CBOS</b>Aparecem aqui daqui a uns minutos, com o PC ligado." : "<b>Sem vendas por dia para mostrar</b>O OCTAN AI ainda não leu este mês no CBOS. Volto a pedir quando abrires o Painel.") + "</div></section>";
    var N = Math.max(PN.diasMes(M), PN.diasMes(A)), S = function (l) { var r = (l || []).slice(); while (r.length < N) r.push(null); return r; };
    var A1 = S(a), B1 = S(b), top = PN.escala(Math.max.apply(null, A1.concat(B1).map(function (x) { return x || 0; })));
    GR = {a: A1, b: B1, top: top, n: N, ma: nomeMes(M), mb: nomeMes(A), lit: lit};
    var rot = function (v) { return lit ? num(v, 0) + " L" : v >= 1000 ? num(v / 1000, v % 1000 ? 1 : 0) + " mil €" : num(v, 0) + " €"; }, xs = [1, 5, 10, 15, 20, 25, N];
    return h + "<div class='pnLeg'><span><i></i>" + Maius(GR.ma) + "</span>" + (b ? "<span><i class='b'></i>" + Maius(GR.mb) + "</span>" : "") + "</div>" +
      "<div class='pnGraf' id='pnGraf'><svg viewBox='0 0 700 230' preserveAspectRatio='none' role='img' aria-label='Vendas por dia de " + esc(GR.ma) + (b ? " comparadas com " + esc(GR.mb) : "") + "'>" +
      [0, 1, 2, 3].map(function (i) { var y = i * 230 / 3; return "<line class='gl' x1='0' x2='700' y1='" + y + "' y2='" + y + "'></line>"; }).join("") +
      "<path class='l2' id='pnL2'></path><path class='ar' id='pnAr'></path><path class='l1' id='pnL1'></path></svg>" +
      [0, 1, 2, 3].map(function (i) { return "<span class='yl' style='top:" + (i * 100 / 3) + "%'>" + rot(top * (3 - i) / 3) + "</span>"; }).join("") +
      "<span class='gu' id='pnGu' hidden></span><span class='pt' id='pnPt' hidden></span><div class='di' id='pnDi' hidden></div></div>" +
      "<div class='pnX'>" + xs.map(function (x) { return "<span style='left:" + ((x - 1) / (N - 1) * 100) + "%'>" + x + "</span>"; }).join("") + "</div></section>";
  }
  /* «Todas» (aprovado a 07/11/2026): um quadro por família, porque litros e euros não se somam. Combustíveis em litros e em grande; o resto em € com IVA */
  function quadros(X, M, A, ids, TF) {
    var FN = PN.totaisFam(X.cur, M, ids) || {}, d = diasVistos(X, M), d0 = PN.diasMes(A), N = Math.max(PN.diasMes(M), PN.diasMes(A));
    var ks = Object.keys(TF).concat(Object.keys(FN).filter(function (k) { return !TF[k]; })).filter(function (k) { return k !== "COMBUSTIVEIS"; })
      .sort(function (x, y) { return ((TF[y] || FN[y])[1]) - ((TF[x] || FN[x])[1]); });
    if (TF.COMBUSTIVEIS || FN.COMBUSTIVEIS) ks.unshift("COMBUSTIVEIS");
    var linha = function (v, top, H) { var r = ""; (v || []).forEach(function (x, i) { if (x == null) return; r += (r ? "L" : "M") + (i * 300 / (N - 1)).toFixed(1) + " " + (H - x / top * H).toFixed(1); }); return r; };
    return "<div class='pnLeg'><span><i></i>" + Maius(nomeMes(M)) + "</span><span><i class='b'></i>" + Maius(nomeMes(A)) + "</span></div><div class='pnQds'>" + ks.map(function (f) {
      var lit = f === "COMBUSTIVEIS", a = PN.serieFam(X.cur, M, ids, f), b = PN.serieFam(X.cur, A, ids, f), sa = somaSerie(a), sb = somaSerie(b), r = PN.ritmo(sa, d, sb, d0), H = lit ? 120 : 64;
      var fv = function (v) { return v == null ? "—" : lit ? num(Math.round(v), 0) + " L" : eur(v * 100); };
      var top = Math.max.apply(null, (a || []).concat(b || []).map(function (x) { return x || 0; })) * 1.1 || 1, l1 = linha(a, top, H), ult = -1, pri = -1;
      (a || []).forEach(function (x, i) { if (x != null) { ult = i; if (pri < 0) pri = i; } });
      var ar = l1 ? l1 + "L" + (ult * 300 / (N - 1)).toFixed(1) + " " + H + "L" + (pri * 300 / (N - 1)).toFixed(1) + " " + H + "Z" : "";
      return "<button class='pnQd" + (lit ? " gr" : "") + "' data-fam='" + esc(f) + "' title='Ver " + esc(nomeFam(f)) + " dia a dia'><span class='cb'><b>" + esc(nomeFam(f)) + "</b><span class='un'>" + (lit ? "litros" : "€ com IVA") + "</span></span>" +
        "<span class='ns'><strong>" + fv(sa) + "</strong><small>" + esc(nomeMes(A)) + " " + fv(sb) + "</small>" + (r == null ? "" : "<em class='" + (r >= 0 ? "pnSobe" : "pnDesce") + "'>" + (r >= 0 ? "▲ " : "▼ ") + num(Math.abs(r), 1) + " % por dia</em>") + "</span>" +
        "<svg viewBox='0 0 300 " + H + "' preserveAspectRatio='none' aria-hidden='true' style='height:" + H + "px'><path class='ar' d='" + ar + "'></path><path class='l2' d='" + linha(b, top, H) + "'></path><path class='l1' d='" + l1 + "'></path></svg>" +
        "<span class='ex'><span>1</span><span>15</span><span>" + N + "</span></span></button>";
    }).join("") + "</div>";
  }
  function caminho(v) {
    var d = "", n = GR.n - 1;
    v.forEach(function (x, i) { if (x == null) return; d += (d ? "L" : "M") + (i * 700 / n).toFixed(1) + " " + (230 - x / GR.top * 230).toFixed(1); });
    return d;
  }
  function pintarLinhas(a, b) {
    var l1 = $("#pnL1"); if (!l1) return;
    var d = caminho(a), n = GR.n - 1, ult = -1, pri = -1; a.forEach(function (x, i) { if (x != null) { ult = i; if (pri < 0) pri = i; } });
    l1.setAttribute("d", d); $("#pnL2").setAttribute("d", caminho(b));
    $("#pnAr").setAttribute("d", d ? d + "L" + (ult * 700 / n).toFixed(1) + " 230L" + (pri * 700 / n).toFixed(1) + " 230Z" : "");
  }
  function ligarGrafico() {
    var g = $("#pnGraf"); if (!g || !GR) return;
    var gu = $("#pnGu"), pt = $("#pnPt"), di = $("#pnDi"), G = GR;
    function sai() { gu.hidden = pt.hidden = di.hidden = true; }
    g.onpointerleave = sai;
    g.onpointermove = function (e) {
      var r = g.getBoundingClientRect(), i = Math.max(0, Math.min(G.n - 1, Math.round((e.clientX - r.left) / r.width * (G.n - 1)))), x = i / (G.n - 1) * 100, a = G.a[i], b = G.b[i];
      if (a == null && b == null) return sai();
      gu.hidden = di.hidden = false; gu.style.left = x + "%";
      pt.hidden = a == null; if (a != null) { pt.style.left = x + "%"; pt.style.top = (100 - a / G.top * 100) + "%"; }
      di.style.left = Math.min(82, Math.max(18, x)) + "%";
      di.innerHTML = "<b>Dia " + (i + 1) + "</b><br>" + Maius(G.ma) + ": " + (a == null ? "sem leitura" : G.lit ? num(Math.round(a), 0) + " L" : eur(a * 100)) + "<br>" + Maius(G.mb) + ": " + (b == null ? "sem leitura" : G.lit ? num(Math.round(b), 0) + " L" : eur(b * 100));
    };
  }
  /* Todas as famílias: quantidade e dinheiro do mês contra o anterior; tocar numa família mostra os dias */
  function tabelaFam(X) {
    var M = MES_V || X.mes, A = addMes(M, -1), ids = idsVer(), FN = PN.totaisFam(X.cur, M, ids), FO = PN.totaisFam(X.cur, A, ids);
    var h = "<section class='bl pnC12'><h3>Vendas por família</h3><p class='pnSub'>Quantidade e dinheiro com IVA. Litros nos combustíveis, unidades nas outras famílias. «Por dia» compara a média diária.</p>";
    if (!FN && !FO) return h + "<p class='vz'>" + (PN.aLer(X.cur, M, ids) || PN.aLer(X.cur, A, ids) ? "A ler as famílias no CBOS: aparecem daqui a uns minutos, com o PC ligado." : "Ainda não há vendas por família deste mês.") + "</p></section>";
    FN = FN || {}; FO = FO || {};
    var d = diasVistos(X, M), d0 = PN.diasMes(A), ks = Object.keys(FO).concat(Object.keys(FN).filter(function (k) { return !FO[k]; })).sort(function (x, y) { return (FO[y] || [0, 0])[1] - (FO[x] || [0, 0])[1] || (FN[y] || [0, 0])[1] - (FN[x] || [0, 0])[1]; });
    return h + "<div class='sc'><table class='pnFam'><thead><tr><th class='l'>Família</th><th>" + esc(Maius(nomeMes(M))) + " €</th><th>" + esc(Maius(nomeMes(A))) + " €</th><th>" + esc(Maius(nomeMes(M))) + " qtd.</th><th>" + esc(Maius(nomeMes(A))) + " qtd.</th><th>Por dia</th></tr></thead><tbody>" +
      ks.map(function (k) { var a = FN[k] || [0, 0], b = FO[k] || [0, 0], r = PN.ritmo(a[1], d, b[1], d0);
        return "<tr class='" + (FAM_V === k ? "sel" : "") + "'><td class='l'><button data-fam='" + esc(k) + "'>" + esc(nomeFam(k)) + "</button></td><td>" + eur(a[1] * 100) + "</td><td>" + eur(b[1] * 100) + "</td><td>" + num(Math.round(a[0]), 0) + "</td><td>" + num(Math.round(b[0]), 0) + "</td><td class='" + (r == null ? "" : r >= 0 ? "pnSobe" : "pnDesce") + "'>" + (r == null ? "—" : (r >= 0 ? "▲ " : "▼ ") + num(Math.abs(r), 1) + " %") + "</td></tr>"; }).join("") +
      "</tbody></table></div></section>";
  }
  function barras(X) {
    var I = function (k) { return IND.find(function (x) { return x[0] === k; }); }, L = ESTS.map(function (e) { var D = dadosLoja(X, e); return {e: e, c: I("comb")[3](D), l: I("loja")[3](D)}; });
    var top = Math.max.apply(null, L.map(function (x) { return (x.c || 0) + (x.l || 0); })) || 1;
    return "<section class='bl pnC4'><h3>Combustível e loja</h3><p class='pnSub'>" + esc(tituloMes(X)) + ", com IVA.</p>" + L.map(function (x) {
      if (x.c == null) return "<div class='pnBar'><div class='ln'><span>" + esc(nomeLoja(x.e)) + "</span><span>—</span></div></div>";
      var t = x.c + x.l;
      return "<div class='pnBar" + (LOJA_V === "todas" || LOJA_V === x.e.id ? "" : " fora") + "'><div class='ln'><span>" + esc(nomeLoja(x.e)) + "</span><span>" + eur0(t) + "</span></div>" +
        "<div class='tr' role='img' aria-label='" + esc(nomeLoja(x.e)) + ": combustível " + eur0(x.c) + ", loja " + eur0(x.l) + "'><span class='az' data-w='" + (x.c / top * 100) + "' data-n='bc-" + x.e.id + "'></span><span class='lj' data-w='" + (x.l / top * 100) + "' data-n='bl-" + x.e.id + "'></span></div>" +
        "<small>Loja " + eur0(x.l) + " · " + num(x.l / t * 100, 1) + " % do total</small></div>";
    }).join("") + "<div class='pnCh'><span><i></i>Combustível</span><span><i class='lj'></i>Loja</span></div></section>";
  }
  var FATIAS = [["MB", "Multibanco", "--pn1"], ["SOL", "Solred", "--pn2"], ["NUM", "Numerário", "--pn3"], ["CRE", "Crédito", "--pn4"], ["OUT", "Outros", "--pn5"]];
  function recebido_(X) {
    var M = MES_V || X.mes, ms = (X.fol || []).filter(function (f) { return f.mes <= M && f.dados && f.dados.formas; }).map(function (f) { return f.mes; }).sort(), ult = ms.filter(function (m) { return !idsVer().some(function (id) { return !(X.fol || []).some(function (f) { return f.mes === m && f.estacao === id; }); }); }).pop();
    if (!ult) return "<section class='bl pnC4'><h3>Como recebeste</h3><p class='vz'>Ainda não há Folha de fecho deste mês nem de um mês anterior.</p></section>";
    var R = PN.formas((X.fol || []).filter(function (f) { return f.mes === ult && idsVer().indexOf(f.estacao) >= 0; }).map(function (f) { return f.dados.formas; }));
    var T = Object.keys(R).reduce(function (s, k) { return s + R[k]; }, 0) || 1, C = 339.292, ac = 0, L = FATIAS.filter(function (f) { return R[f[0]] > 0; });
    return "<section class='bl pnC4'><h3>Como recebeste</h3><p class='pnSub'>" + Maius(nomeMes(ult)) + (ult === (MES_V || X.mes) ? "" : ", último mês fechado") + ".</p><div class='pnDon'><div class='an'><svg viewBox='0 0 132 132' role='img' aria-label='" + L.map(function (f) { return f[1] + " " + num(R[f[0]] / T * 100, 1) + " %"; }).join(", ") + "'>" +
      L.map(function (f) { var p = R[f[0]] / T * 100, of = ac; ac += p; return "<circle cx='66' cy='66' r='54' style='stroke:var(" + f[2] + ")' data-dv='" + (p / 100 * C) + "' data-do='" + (-of / 100 * C) + "' data-n='fa-" + f[0] + "'></circle>"; }).join("") +
      "</svg><div class='ce'><b>" + eur0(T) + "</b>recebido</div></div><div class='dl'>" + L.map(function (f) { return "<div><i style='background:var(" + f[2] + ")'></i><span>" + f[1] + "</span><b>" + num(R[f[0]] / T * 100, 1) + " %</b></div>"; }).join("") + "</div></div></section>";
  }
  var TW = 0, ANTES = {};   // animação em curso e valores que estavam no ecrã
  function animar(box) {
    var tw = ++TW, nums = box.querySelectorAll("[data-t]"), bars = box.querySelectorAll("[data-w]"), don = box.querySelectorAll("[data-dv]"), G = GR;
    var val = function (x) { return ANTES[x.dataset.n] || 0; }, serA = G && ANTES.a && ANTES.a.length === G.n ? ANTES.a : G && G.a.map(function (v) { return v == null ? null : 0; }), serB = G && ANTES.b && ANTES.b.length === G.n ? ANTES.b : G && G.b.map(function (v) { return v == null ? null : 0; });
    function mistura(a, b, k) { return b.map(function (v, i) { return v == null ? null : (a[i] || 0) + (v - (a[i] || 0)) * k; }); }
    function passo(k) {
      nums.forEach(function (x) { var a = val(x), v = +x.dataset.v; x.textContent = formato(a + (v - a) * k, x.dataset.t); });
      bars.forEach(function (x) { var a = val(x), v = +x.dataset.w; x.style.width = (a + (v - a) * k) + "%"; });
      don.forEach(function (x) { var a = val(x), v = +x.dataset.dv, p = a + (v - a) * k; x.style.strokeDasharray = p + " 339.292"; x.style.strokeDashoffset = x.dataset.do * k; });
      if (G) pintarLinhas(mistura(serA, G.a, k), mistura(serB, G.b, k));
    }
    function guarda() {
      ANTES = {}; nums.forEach(function (x) { ANTES[x.dataset.n] = +x.dataset.v; }); bars.forEach(function (x) { ANTES[x.dataset.n] = +x.dataset.w; }); don.forEach(function (x) { ANTES[x.dataset.n] = +x.dataset.dv; });
      if (G) { ANTES.a = G.a; ANTES.b = G.b; }
    }
    var quieto = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (quieto || document.hidden) { passo(1); guarda(); return; }
    var t0 = performance.now(), dur = 800;
    (function vai() {
      if (tw !== TW) return;
      var k = Math.min(1, (performance.now() - t0) / dur);
      passo(1 - Math.pow(1 - k, 3));
      if (k < 1) requestAnimationFrame(vai); else guarda();
    })();
  }
  function porFechar(X) {
    var ontem = new Date().getDate() - 1;
    function turnos(e) {
      var D = dadosLoja(X, e), ult = D.T.map(function (r) { return r.dia; }).sort().pop();
      if (!D.ant.length && !D.mes.length) return ["Sem turnos", "az", "reg"];
      var tem = {}; D.mes.forEach(function (r) { tem[r.dia + r.turno] = 1; }); var fal = 0;
      for (var i = 1; i <= ontem; i++) { var k = X.mes + "-" + String(i).padStart(2, "0"); if (!tem[k + "t1"]) fal++; if (!tem[k + "t2"]) fal++; }
      return fal ? [fal + " em falta · último " + dmy(ult).slice(0, 5), "at", "reg"] : ["Em dia", "ok", "reg"];
    }
    function tem(L, e) { return (L || []).some(function (x) { return x.estacao === e; }); }
    function rel(e) {
      var n = (tem(X.fol && X.fol.filter(function (x) { return x.mes === X.ant; }), e) ? 1 : 0) + (tem(X.vm, e) ? 1 : 0) + (tem(X.va, e) ? 1 : 0);
      return n === 3 ? ["Completos", "ok", "ense"] : [n + " de 3", "at", n ? "ense" : "ense"];
    }
    function preco(e) {
      var u = (X.pre || []).find(function (x) { return x.estacao === e; });
      if (!u) return ["Sem tabela", "at", "pre"];
      return u.estado === "comunicado" ? ["Em dia · " + dmy(u.dia).slice(0, 5), "ok", "pre"] : ["Por comunicar · " + dmy(u.dia).slice(0, 5), "at", "pre"];
    }
    function doc(e) { var d = (X.doc || []).find(function (x) { return x.estacao === e; }); return d ? [dmy(d.emissao).slice(0, 5), "az", "rep"] : ["Nenhum", "at", "rep"]; }
    var L = [
      ["Turnos do mês", function (e) { return turnos(e); }],
      ["Fecho TMS de " + nomeMes(X.ant), function (e) { return X.tms ? (tem(X.tms, e.id) ? ["Carregado", "ok", "tms"] : ["Por carregar", "at", "tms"]) : null; }],
      ["Relatórios CBOS de " + nomeMes(X.ant), function (e) { return rel(e.id); }],
      ["Preços ENSE", function (e) { return X.pre ? preco(e.id) : null; }],
      ["Último documento Repsol", function (e) { return X.doc ? doc(e.id) : null; }]
    ];
    return "<section class='bl pnC4'><h3>Por fechar</h3><div class='pnT pnF' style='--n:" + lojasVer().length + "'><span class='cab'></span>" + lojasVer().map(function (e) { return "<span class='cab'>" + esc(nomeLoja(e)) + "</span>"; }).join("") +
      L.map(function (l) {
        return "<span class='rot'>" + l[0] + "</span>" + lojasVer().map(function (e) { var r = l[1](e); return r ? "<button data-e='" + e.id + "' data-p='" + r[2] + "'>" + tag(r[0], r[1]) + "</button>" : "<b class='sem'>—</b>"; }).join("");
      }).join("") + "</div></section>";
  }
  function pintarDecidir(X) {
    var L = porDecidir(X);
    var arq = L.filter(function (x) { return x.arq; }).map(function (x) { return x.arq; });
    return "<section class='bl pnC4 pnDec'><h3>Por decidir <span class='nr'>" + L.length + "</span>" + (arq.length > 1 ? "<button class='btn pnArqT' data-arq='" + arq.join(",") + "'>Arquivar tudo (" + arq.length + ")</button>" : "") + "</h3>" + (L.length ? L.map(function (x, i) {
      return "<div class='fila'><div>" + esc(x.t) + "<small>" + esc(x.s) + "</small></div><span class='pnBt'>" + (x.arq ? "<button class='btn' data-arq='" + x.arq + "' aria-label='" + esc("Arquivar: " + x.t) + "'>Arquivar</button>" : "") + "<button class='btn' data-e='" + (x.e || "") + "' data-p='" + x.p + "' aria-label='" + esc(x.b + ": " + x.t) + "'>" + x.b + "</button></span></div>";
    }).join("") : "<p class='vz'>Nada à espera da tua decisão.</p>") + "</section>";
  }
  async function arquivar(X, chaves) {   // avisos e vendas pedidas ficam no Arquivo da página OCTAN AI
    var u = await sb.auth.getUser(), quem = (u.data && u.data.user && u.data.user.email) || "", agora = new Date().toISOString();
    var av = [], pe = []; chaves.forEach(function (k) { (k[0] === "a" ? av : pe).push(k.slice(1)); });
    var r1 = av.length ? await sb.from("msb_avisos").update({lido_em: agora, lido_por: quem}).in("id", av) : {};
    var r2 = pe.length ? await sb.from("msb_pedidos").update({visto_em: agora}).in("id", pe.map(Number)) : {};
    if (r1.error || r2.error) return msbAviso("Erro: " + falhou(r1.error || r2.error));
    (X.avi || []).forEach(function (a) { if (av.indexOf(String(a.id)) >= 0) a.lido_em = agora; });
    X.ped = (X.ped || []).filter(function (p) { return pe.indexOf(String(p.id)) < 0; });
    desenhar(X); if (window.aviSelo) aviSelo();
  }
  function irLoja(e, pg) {
    if (e && e !== EST) { var s = $("#selEst"); s.value = e; PAGINA = pg; s.onchange(); }
    else ir(pg);
  }
  function editarInd(X) {
    var box = $("#pnEdit"), A = indAtivos();
    function pinta() {
      var fora = IND.filter(function (x) { return A.indexOf(x[0]) < 0; }).map(function (x) { return x[0]; });
      box.innerHTML = A.concat(fora).map(function (k, i) {
        var I = IND.find(function (x) { return x[0] === k; }), on = A.indexOf(k) >= 0;
        return "<div class='ed'><label><input type='checkbox' data-k='" + k + "'" + (on ? " checked" : "") + ">" + I[1] + "</label>" + (on ? "<button class='mini' data-m='-1' data-k='" + k + "' aria-label='Subir " + I[1] + "'" + (i ? "" : " disabled") + ">Subir</button><button class='mini' data-m='1' data-k='" + k + "' aria-label='Descer " + I[1] + "'" + (i < A.length - 1 ? "" : " disabled") + ">Descer</button>" : "") + "</div>";
      }).join("") + "<div class='bar' style='margin-top:6px'><button class='btn' id='pnFim'>Fechar</button></div>";
      box.querySelectorAll("input").forEach(function (c) { c.onchange = function () { var k = c.dataset.k; if (c.checked) A.push(k); else A = A.filter(function (x) { return x !== k; }); guardar(); }; });
      box.querySelectorAll("[data-m]").forEach(function (b) { b.onclick = function () { var i = A.indexOf(b.dataset.k), j = i + (+b.dataset.m), t = A[i]; A[i] = A[j]; A[j] = t; guardar(); }; });
      $("#pnFim").onclick = function () { desenhar(X); };
    }
    function guardar() { gravar("msb_ind", A); pinta(); }
    box.hidden = false; pinta();
  }
  function topo(X) {
    var atual = !MES_V || MES_V === X.mes;
    return "<div class='pnTopo'>" + (ESTS.length > 1 ? "<div class='pnSeg' role='group' aria-label='Escolher estação'>" + [{id: "todas", n: "Todas"}].concat(ESTS.map(function (e) { return {id: e.id, n: nomeLoja(e)}; })).map(function (l) { return "<button data-ver='" + l.id + "' aria-pressed='" + (LOJA_V === l.id) + "' class='" + (LOJA_V === l.id ? "on" : "") + "'>" + esc(l.n) + "</button>"; }).join("") + "</div>" : "") +
      "<div class='pnMes'><button id='pnAnt' aria-label='Mês anterior'>‹</button><b>" + esc(tituloMes(X)) + "</b><button id='pnSeg' aria-label='Mês seguinte'" + (atual ? " disabled" : "") + ">›</button></div>" +
      "<button class='mini' id='pnPers'>Personalizar</button></div><div id='pnEdit' hidden></div>";
  }
  function desenhar(X) {
    var box = $("#iniCorpo");
    if (LOJA_V !== "todas" && !ESTS.some(function (e) { return e.id === LOJA_V; })) LOJA_V = "todas";
    var falta = ESTS.some(function (e) { var D = dadosLoja(X, e); return !D.c && !D.f; }), M = MES_V || X.mes;
    box.innerHTML = (X.falhas.length ? "<div class='aviso'><p>Não consegui ler: " + esc(X.falhas.join(", ")) + ". O que está em baixo pode estar incompleto.</p></div>" : "") + topo(X) + cartoes(X) +
      "<div class='pnGrade'>" + grafico(X) + pintarDecidir(X) + barras(X) + recebido_(X) + porFechar(X) + tabelaFam(X) + "</div>" +
      "<p class='rod'>" + (falta ? "A ler no CBOS pelo OCTAN AI: os valores aparecem daqui a uns minutos, com o PC ligado." : M === X.mes ? "Vendas com IVA, lidas no CBOS pelo OCTAN AI, até ontem. O ritmo por dia e a estimativa do mês são contas simples, não são valores do CBOS." : "Vendas com IVA, do mês inteiro.") + "</p>";
    box.querySelectorAll("[data-p]").forEach(function (b) { b.onclick = function () { irLoja(b.dataset.e, b.dataset.p); }; });
    box.querySelectorAll("[data-arq]").forEach(function (b) { b.onclick = function () { b.disabled = true; arquivar(X, b.dataset.arq.split(",")); }; });
    box.querySelectorAll("[data-ver]").forEach(function (b) { b.onclick = function () { LOJA_V = b.dataset.ver; desenhar(X); }; });
    box.querySelectorAll("[data-fam]").forEach(function (b) { b.onclick = function () { FAM_V = b.dataset.fam; ANTES.a = ANTES.b = null; desenhar(X); if (b.closest(".pnFam")) $("#pnGraf") && box.querySelector(".pnChips").scrollIntoView({block: "nearest", behavior: "smooth"}); }; });
    $("#pnPers").onclick = function () { editarInd(X); };
    $("#pnAnt").onclick = function () { verMes(X, addMes(MES_V || X.mes, -1)); };
    $("#pnSeg").onclick = function () { verMes(X, addMes(MES_V || X.mes, 1)); };
    ligarGrafico(); animar(box);
  }
  MSB_NAV.painel = async function () {
    var box = $("#iniCorpo"); box.className = "painel";
    box.innerHTML = "<div class='pnKs'><div class='pnK hero bl ske' style='height:118px'></div><div class='pnK bl ske'></div><div class='pnK bl ske'></div><div class='pnK bl ske'></div></div><div class='pnGrade'><div class='bl ske pnC8' style='height:340px'></div><div class='bl ske pnC4' style='height:340px'></div></div>";
    var nr = ++NR_V;
    try {
      var X = await dados(); await pedir(X, X.mes); await pedir(X, X.ant);
      if (nr === NR_V && PAGINA === "ini") { desenhar(X); aviSelo(); aguardar(X, nr); }
    }
    catch (e) { box.innerHTML = "<div class='aviso'><p>" + esc(falhou(e)) + "</p></div>"; }
  };
})();
