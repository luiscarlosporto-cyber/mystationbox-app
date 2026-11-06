/* mystationbox beta · Etapa 3: Painel de Gestão do administrador. Três blocos sobre as duas lojas: Por decidir, Estado das lojas, Por fechar.
 * Só lê. Cada linha abre a página onde a coisa se resolve, já na loja certa. Vendas do mês fechado vêm da Folha de fecho do CBOS,
 * a única fonte igual nas duas lojas; Penafiel não regista turnos, por isso os turnos ficam só como indicador do mês em curso. */
"use strict";
(function () {
  var IND = [   // indicadores que se podem escolher e ordenar; valor por loja a partir de D (dados da loja)
    ["vend", "Vendas do mês", 1, function (D) { return D.f ? eur(D.f.dados.totais.formas) : null; }],
    ["lit", "Litros vendidos", 1, function (D) { return D.f && D.f.dados.totais.comb ? Math.round(D.f.dados.totais.comb[1] / 100).toLocaleString("pt-PT", {useGrouping: "always"}) + " L" : null; }],
    ["comb", "Combustível", 1, function (D) { return D.f && D.f.dados.totais.comb ? eur(D.f.dados.totais.comb[5]) : null; }],
    ["loja", "Loja", 1, function (D) { return D.f && D.f.dados.totais.loja ? eur(D.f.dados.totais.loja[5]) : null; }],
    ["mb", "Multibanco", 0, function (D) { return forma(D, ["CARTAO BANCARIO", "BANCARIO OFFLINE"]); }],
    ["sol", "Solred", 0, function (D) { return forma(D, ["SOLRED", "SOLRED OFFLINE"]); }],
    ["num", "Numerário", 0, function (D) { return forma(D, ["NUMERARIO"]); }],
    ["tur", "Mês em curso · vendas", 1, function (D) { return D.mes.length ? eur(D.mes.reduce(function (s, r) { return s + r.vendas_c; }, 0)) : "Sem turnos"; }],
    ["dif", "Mês em curso · diferença", 1, function (D) { if (!D.mes.length) return "Sem turnos"; return sinal(D.mes.reduce(function (s, r) { return s + (dif(r) || 0); }, 0)) + " €"; }],
    ["ont", "Ontem · vendas", 0, function (D) { var v = D.mes.concat(D.ant).filter(function (r) { return r.dia === hojeISO(-1); }); return v.length ? eur(v.reduce(function (s, r) { return s + r.vendas_c; }, 0)) : "Sem turnos"; }]
  ];
  function eur(c) { return fmt(c) + " €"; }
  function forma(D, ks) { if (!D.f || !D.f.dados.formas) return null; var F = D.f.dados.formas; return eur(ks.reduce(function (s, k) { return s + (F[k] || 0); }, 0)); }
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
      guarda("pedidos", sb.from("msb_pedidos").select("id,estacao,estado,de,ate,visto_em,pasta").eq("estado", "feito").is("visto_em", null)),
      guarda("documentos", sb.from("msb_docs").select("estacao,emissao").order("emissao", {ascending: false}).limit(40)),
      guarda("avisos", avisosRecentes(60).then(function (x) { return {data: x}; }))
    ]);
    return {hoje: hoje, mes: mes, ant: ant, tur: R[0], fol: R[1], sai: R[2], enc: R[3], pre: R[4], tms: R[5], vm: R[6], va: R[7], ped: R[8], doc: R[9], avi: R[10], falhas: f};
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
    (X.ped || []).forEach(function (p) { L.push({o: 3, t: "Vendas pedidas prontas", s: loja(p.estacao) + " · " + dmy(p.de) + " a " + dmy(p.ate), p: "avi", b: "Ver", arq: "p" + p.id}); });
    var S = {}; (X.sai || []).forEach(function (s) { var a = S[s.estacao] = S[s.estacao] || {n: 0, v: 0}; a.n++; a.v += s.valor_c || 0; });
    Object.keys(S).forEach(function (e) { L.push({o: 3, t: S[e].n === 1 ? "Saída de caixa por entregar" : S[e].n + " saídas de caixa por entregar", s: loja(e) + " · " + eur(S[e].v), e: e, p: "sai", b: "Ver"}); });
    return L.sort(function (a, b) { return a.o - b.o; });
  }

  function dadosLoja(X, e) {
    var f = (X.fol || []).find(function (x) { return x.estacao === e.id; }) || null, T = (X.tur || []).filter(function (r) { return r.estacao === e.id; });
    return {f: f, mes: T.filter(function (r) { return r.dia.slice(0, 7) === X.mes; }), ant: T.filter(function (r) { return r.dia.slice(0, 7) !== X.mes; }), T: T};
  }
  function estado(X) {
    var ativos = indAtivos(), meses = {};
    var DL = ESTS.map(function (e) { var D = dadosLoja(X, e); if (D.f) meses[D.f.mes] = 1; return D; });
    var ms = Object.keys(meses).sort(), tit = ms.length === 1 ? "Mês de " + nomeMes(ms[0]) : "Último mês fechado";
    var h = "<div class='bl'><h3>Estado das lojas<button class='mini' id='pnPers'>Personalizar</button></h3><div id='pnEdit' hidden></div>" +
      "<div class='pnT' style='--n:" + ESTS.length + "'><span class='cab'>" + tit + "</span>" + ESTS.map(function (e) { return "<button class='cab' data-loja='" + e.id + "'>" + esc(nomeLoja(e)) + "</button>"; }).join("");
    ativos.forEach(function (k) {
      var I = IND.find(function (x) { return x[0] === k; });
      h += "<span class='rot'>" + I[1] + "</span>" + DL.map(function (D) { var v = I[3](D); return "<b class='" + (v === "Sem turnos" || v == null ? "sem" : "") + "'>" + esc(v == null ? "—" : v) + "</b>"; }).join("");
    });
    return h + "</div><p class='rod'>Vendas com IVA, da Folha de fecho do CBOS. O mês em curso vem dos turnos registados.</p></div>";
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
    return "<div class='bl'><h3>Por fechar</h3><div class='pnT pnF' style='--n:" + ESTS.length + "'><span class='cab'></span>" + ESTS.map(function (e) { return "<span class='cab'>" + esc(nomeLoja(e)) + "</span>"; }).join("") +
      L.map(function (l) {
        return "<span class='rot'>" + l[0] + "</span>" + ESTS.map(function (e) { var r = l[1](e); return r ? "<button data-e='" + e.id + "' data-p='" + r[2] + "'>" + tag(r[0], r[1]) + "</button>" : "<b class='sem'>—</b>"; }).join("");
      }).join("") + "</div></div>";
  }
  function pintarDecidir(X) {
    var L = porDecidir(X);
    var arq = L.filter(function (x) { return x.arq; }).map(function (x) { return x.arq; });
    return "<div class='bl'><h3>Por decidir <span class='nr'>" + L.length + "</span>" + (arq.length > 1 ? "<button class='btn pnArqT' data-arq='" + arq.join(",") + "'>Arquivar tudo (" + arq.length + ")</button>" : "") + "</h3>" + (L.length ? L.map(function (x, i) {
      return "<div class='fila'><div>" + esc(x.t) + "<small>" + esc(x.s) + "</small></div><span class='pnBt'>" + (x.arq ? "<button class='btn' data-arq='" + x.arq + "' aria-label='" + esc("Arquivar: " + x.t) + "'>Arquivar</button>" : "") + "<button class='btn' data-e='" + (x.e || "") + "' data-p='" + x.p + "' aria-label='" + esc(x.b + ": " + x.t) + "'>" + x.b + "</button></span></div>";
    }).join("") : "<p class='vz'>Nada à espera da tua decisão.</p>") + "</div>";
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
  function desenhar(X) {
    var box = $("#iniCorpo");
    box.innerHTML = (X.falhas.length ? "<div class='aviso'><p>Não consegui ler: " + esc(X.falhas.join(", ")) + ". O que está em baixo pode estar incompleto.</p></div>" : "") +
      "<div class='pnCol'>" + pintarDecidir(X) + "</div><div class='pnCol'>" + estado(X) + porFechar(X) + "</div>";
    box.querySelectorAll("[data-p]").forEach(function (b) { b.onclick = function () { irLoja(b.dataset.e, b.dataset.p); }; });
    box.querySelectorAll("[data-arq]").forEach(function (b) { b.onclick = function () { b.disabled = true; arquivar(X, b.dataset.arq.split(",")); }; });
    box.querySelectorAll("[data-loja]").forEach(function (b) { b.onclick = function () { irLoja(b.dataset.loja, "reg"); }; });
    $("#pnPers").onclick = function () { editarInd(X); };
  }
  MSB_NAV.painel = async function () {
    var box = $("#iniCorpo"); box.className = "painel";
    box.innerHTML = "<div class='pnCol'><div class='bl ske' style='height:280px'></div></div><div class='pnCol'><div class='bl ske' style='height:200px'></div><div class='bl ske' style='height:160px'></div></div>";
    try { var X = await dados(); if (PAGINA === "ini") desenhar(X); aviSelo(); }
    catch (e) { box.innerHTML = "<div class='aviso'><p>" + esc(falhou(e)) + "</p></div>"; }
  };
})();
