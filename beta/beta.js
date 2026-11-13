/* mystationbox beta · navegação da Etapa 2: menu lateral recolhível, caminho, pesquisa (Ctrl+K), botão Novo e barra do telemóvel.
 * Só muda como se chega às páginas: as páginas, os dados e as regras são os da app. Liga-se em areas.js por window.MSB_NAV. */
"use strict";
(function () {
  var ICONES = {
    p: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    d: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
    t: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>',
    c: '<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    f: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
    a: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
    b: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    m: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    r: '<path d="M15 6l-6 6 6 6"/>',
    s: '<path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9"/>',
    g: '<path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M4 10h10M14 8l3 2v8a1.5 1.5 0 0 0 3 0V9l-3-3"/>',
    h: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M3 4h2l2.5 11h11L21 7H6.5"/>',
    k: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    o: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
    u: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14c2.8 0 5 2.2 5 5"/>'
  };
  /* páginas que no menu são uma só, com separadores em cima */
  var GRUPOS = [{n: "Receções", p: ["ent", "dig"]}, {n: "Vendas", p: ["ven", "va", "maq"]}];
  function grupoDe(pg) { return GRUPOS.find(function (g) { return g.p.indexOf(pg) >= 0; }); }
  var IC_AREA = {ini: "p", cx: "t", cmb: "g", stk: "c", cpr: "h", cnf: "f", frn: "k", res: "d", fra: "b", dcs: "o", eqp: "u", def: "a"};
  /* título de cada bloco do menu (Dia a dia · Controlo · Gestão), quando a área seguinte muda de bloco; o funcionário, com 2 áreas, não os vê */
  function blocoDe(x) { var b = ""; for (var i = 0; i < AREAS.length; i++) { if (AREAS[i].b) b = AREAS[i].b; if (AREAS[i] === x) return b; } return b; }
  function blocos(L) { var ant = ""; return function (x) { var b = blocoDe(x); if (!ADMIN || b === ant) return ""; ant = b; return "<b class='bBloco'>" + b + "</b>"; }; }
  function ic(n) { return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + ICONES[n] + "</svg>"; }
  function nomeArea(a) { return a.n.slice(a.n.indexOf(" ") + 1); }
  function sem(t) { return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
  function ler(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function gravar(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sem armazenamento: vale só nesta sessão */ } }

  var SELO = 0;
  function seloH(x) { return x.id === "ini" && SELO ? "<i class='selo'>" + SELO + "</i>" : ""; }
  /* números sempre agrupados, também com 4 algarismos: 4 174,50 € */
  /* o Registo do dia só se lê quando se abre: no arranque abre-se o Painel */
  var irDiaReal = window.irDia, DIA_ADIADO = false;
  window.irDia = function (d) { if (window.PAGINA === "reg") { DIA_ADIADO = false; return irDiaReal(d); } DIA = d; DIA_ADIADO = true; return Promise.resolve(); };
  var recolhido = ler("msb_lat") === "1";
  function acertarLargura() { document.body.classList.toggle("b-rec", recolhido || innerWidth <= 1024); }

  function montar() {
    if ($("#bLat")) return;
    MSB_NAV.paginas();
    var app = $("#vApp"), lat = document.createElement("aside"), topo = document.createElement("div");
    lat.id = "bLat"; lat.setAttribute("aria-label", "Menu");
    lat.innerHTML = "<div class='marca'><img src='logo.svg' alt=''><img class='wm' src='marca_clara.png' alt='mystationbox'></div><div id='bAreas'></div>" +
      "<div class='fim'><span id='bQuem'></span><button id='bRec' title='Recolher o menu'>" + ic("r") + "<span class='tx'>Recolher menu</span></button></div>";
    topo.id = "bTopo";
    topo.innerHTML = "<div id='bCam'></div><button id='bBusca' aria-label='Procurar'>" + ic("b") + "<span>Procurar</span><kbd>Ctrl K</kbd></button><button id='bNovo' aria-haspopup='menu'>" + ic("m") + "<span>Novo</span></button>";
    var main = app.querySelector("main"), chips = document.createElement("div"), barra = document.createElement("nav");
    chips.id = "bChips"; barra.id = "bBarra"; barra.setAttribute("aria-label", "Áreas");
    app.insertBefore(lat, app.firstChild); app.insertBefore(topo, main); app.insertBefore(chips, main); app.appendChild(barra);
    topo.insertBefore($("#selEst"), $("#bNovo"));   // o mesmo seletor de loja, com a mesma função (escondido: troca-se pela marca da estação)
    var marcaEst = document.createElement("button"); marcaEst.id = "bEstP"; topo.insertBefore(marcaEst, topo.firstChild);
    marcaEst.onclick = function () { var o = ESTS.find(function (e) { return e.id !== EST; }); if (!o || ESTS.length < 2) return; var s = $("#selEst"); s.value = o.id; s.onchange(); };
    var sair = $("#bSair"); sair.textContent = "Sair"; topo.appendChild(sair);
    $("#bQuem").textContent = $("#hQuem").textContent;

    $("#bAreas").onclick = function (e) {
      var b = e.target.closest("button"); if (!b) return;
      if (b.dataset.p) return ir(b.dataset.p);
      var a = AREAS.find(function (x) { return x.id === b.dataset.a; }); ir(paginasDe(a)[0][0]);
    };
    var tabs = document.createElement("div"); tabs.id = "bTabs"; tabs.setAttribute("role", "tablist"); main.querySelector(".wrap").prepend(tabs);
    tabs.onclick = function (e) { var b = e.target.closest("button"); if (b) ir(b.dataset.p); };
    limpar(main); new MutationObserver(function (L) { L.forEach(function (m) { m.addedNodes.forEach(limpar); }); }).observe(main, {childList: true, subtree: true});
    main.addEventListener("input", validar);
    chips.onclick = function (e) { var b = e.target.closest("button"); if (b) ir(b.dataset.p); };
    barra.onclick = function (e) {
      var b = e.target.closest("button"); if (!b) return;
      if (b.dataset.a === "mais") return abrirMais();
      fecharTudo(); var a = AREAS.find(function (x) { return x.id === b.dataset.a; }); ir(paginasDe(a)[0][0]);
    };
    $("#bRec").onclick = function () { recolhido = !recolhido; gravar("msb_lat", recolhido ? "1" : "0"); acertarLargura(); };
    $("#bBusca").onclick = abrirPesquisa;
    $("#bNovo").onclick = function (e) { e.stopPropagation(); alternarNovo(); };
    addEventListener("resize", acertarLargura); acertarLargura();
    document.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); abrirPesquisa(); }
      else if (e.key === "Escape") fecharTudo();
    });
    document.addEventListener("click", function (e) { var m = $("#bNovoM"); if (m && !m.contains(e.target)) m.remove(); });
  }

  var ABERTA = "";
  /* estação bem visível (dono, 10/11/2026): cor, sigla, nome e posto na barra de cima e uma borda da mesma cor na página.
     Não depende só da cor: a sigla e o nome estão sempre escritos. No Painel e em Comparar estações (as duas) não aparece. */
  var EST_ID = {sto: {s: "ST", c: "#0E7C7B"}, pnf: {s: "PN", c: "#6B4FBB"}};
  var DUAS = ["ini", "cmp", "car", "doc", "forn"];
  function estInfo(id) { var e = ESTS.find(function (x) { return x.id === id; }) || {}, k = EST_ID[id] || {s: String(id || "").slice(0, 2).toUpperCase(), c: "#566878"}; return {e: e, s: k.s, c: k.c, n: e.short_name || e.name || id}; }
  function pintarEst(pg) {
    var duas = DUAS.indexOf(pg) >= 0, i = estInfo(EST), b = $("#bEstP"), troca = ESTS.length > 1;
    document.body.classList.toggle("b-duas", duas); document.body.style.setProperty("--est", i.c);
    if (!b) return;
    b.hidden = duas;
    b.innerHTML = "<b>" + i.s + "</b><span class='n'>" + esc(i.n) + "</span>" + (i.e.posto_repsol ? "<span class='po'>· " + esc(i.e.posto_repsol) + "</span>" : "") + (troca ? "<span class='tr' aria-hidden='true'>⇄</span>" : "");
    b.title = troca ? "Estação aberta: " + i.n + ". Carregar para trocar de estação." : "Estação: " + i.n;
    b.setAttribute("aria-label", b.title); b.disabled = !troca;
  }
  function marcar(pg, a) {
    pintarEst(pg);
    if (pg === "reg" && DIA_ADIADO) { DIA_ADIADO = false; irDiaReal(DIA); }
    $("#bQuem").textContent = $("#hQuem").textContent;
    if (pg !== ABERTA) { ABERTA = pg; setTimeout(function () { if (PAGINA === pg) MSB_NAV.abrirPagina(pg); }); }
    var ps = paginasDe(a), gr = "", atual = a.p.find(function (x) { return x[0] === pg; }), grp = grupoDe(pg);
    var vistos = {}, itens = ps.filter(function (p) { var g = grupoDe(p[0]); if (!g) return true; if (vistos[g.n]) return false; return vistos[g.n] = 1; });
    function emFoco(p) { var g = grupoDe(p[0]); return p[0] === pg || (g && g === grp); }
    function rotulo(p) { var g = grupoDe(p[0]); return g ? g.n : p[1]; }
    var bl = blocos();
    $("#bAreas").innerHTML = areasVisiveis().map(function (x) {
      var on = x.id === a.id, h = bl(x) + "<button data-a='" + x.id + "' title='" + nomeArea(x) + "'" + (on ? " class='on' aria-current='true'" : "") + ">" + ic(IC_AREA[x.id]) + "<span class='tx'>" + nomeArea(x) + "</span>" + seloH(x) + "</button>";
      if (on && ps.length > 1) h += "<div class='sub'>" + itens.map(function (p) {
        var g = (p[2] && p[2].g) || "", t = g && g !== gr && !grupoDe(p[0]) ? "<b>" + g + "</b>" : ""; if (!grupoDe(p[0])) gr = g || gr;
        return t + "<button data-p='" + p[0] + "'" + (emFoco(p) ? " class='on' aria-current='page'" : "") + ">" + rotulo(p) + "</button>";
      }).join("") + "</div>";
      return h;
    }).join("");
    $("#bCam").innerHTML = "<span class='ar'>" + nomeArea(a) + "</span><span class='sep ar'> › </span>" + (grp ? "<span class='ar'>" + grp.n + "</span><span class='sep ar'> › </span>" : "") + "<b>" + (atual ? atual[1] : "") + "</b>";
    var tabs = $("#bTabs"), noG = grp ? grp.p.filter(function (k) { return ps.some(function (p) { return p[0] === k; }); }) : [];
    tabs.innerHTML = noG.length > 1 ? noG.map(function (k) { var p = ps.find(function (x) { return x[0] === k; }); return "<button data-p='" + k + "' role='tab' aria-selected='" + (k === pg) + "'" + (k === pg ? " class='on'" : "") + ">" + p[1] + "</button>"; }).join("") : "";
    var chips = $("#bChips");
    chips.innerHTML = ps.length > 1 ? itens.map(function (p) { return "<button data-p='" + p[0] + "'" + (emFoco(p) ? " class='on'" : "") + ">" + rotulo(p) + "</button>"; }).join("") : "";
    var on = chips.querySelector(".on"); if (on) chips.scrollLeft = Math.max(0, on.offsetLeft - 40);
    var vis = areasVisiveis(), noTel = vis.filter(function (x) { return AREAS_TEL.indexOf(x.id) >= 0; });
    var fora = AREAS_TEL.indexOf(a.id) < 0;
    $("#bBarra").innerHTML = noTel.map(function (x) { return "<button data-a='" + x.id + "'" + (x.id === a.id ? " class='on'" : "") + ">" + ic(IC_AREA[x.id]) + (x.c || nomeArea(x)) + seloH(x) + "</button>"; }).join("") +
      "<button data-a='mais'" + (fora ? " class='on'" : "") + ">" + ic("x") + "Mais</button>";
    document.title = (DUAS.indexOf(pg) < 0 ? estInfo(EST).s + " · " : "") + (atual ? atual[1] + " · " : "") + "mystationbox";
  }

  function fecharTudo() { ["#bNovoM", "#bPesq", "#bMais"].forEach(function (s) { var e = $(s); if (e) e.remove(); }); }

  /* ---- sem emoji no conteúdo: tira-os do texto que as páginas escrevem. Fica ✔ e ⚠, que dizem o estado;
     um botão que só tem o emoji fica como está, para não ficar vazio. ---- */
  var EMO = /(?:\p{Emoji_Presentation}|(?![\u26A0\u2714])\p{Extended_Pictographic}\uFE0F|[\u2600\u2601\u270F\u2709\u2699\u2328\u23F1\u231A\u2702\u{1F5A8}\u{1F5D1}\u{1F5C4}\u{1F5BC}\u{1F3F7}\u{1F58A}\u{1F4FD}\u{1F6E2}\u{1F321}\u{1F6CD}])\uFE0F?\s*/gu;
  var ROTULO = {"\u270F": "Editar", "\u{1F5D1}": "Apagar", "\u{1F4C4}": "PDF", "\u{1F4CB}": "Copiar", "\u{1F4AC}": "WhatsApp", "\u{1F3B2}": "Gerar", "\u{1F4CE}": "Original", "\u{1F441}": "Ver", "\u{1F4E4}": "Enviar"};
  function trocarTexto(t) { return t.replace(/\u2705\s*/g, "\u2714 ").replace(/\u274C\s*/g, "\u2716 ").replace(EMO, ""); }
  function limpar(n) {
    if (!n || n.nodeType === 8) return;
    var w = n.nodeType === 3 ? null : (n.ownerDocument || document).createTreeWalker(n, 4), T = n.nodeType === 3 ? [n] : [], x;
    while (w && (x = w.nextNode())) T.push(x);
    T.forEach(function (t) {
      var p = t.parentNode; if (!p || /^(SCRIPT|STYLE|TEXTAREA)$/.test(p.nodeName)) return;
      var v = t.nodeValue, r = trocarTexto(v); if (r === v) return;
      if (!r.trim() && !p.textContent.replace(v, "").trim() && !p.querySelector("img,svg")) { var nome = ROTULO[v.trim().replace(/\uFE0F/g, "")]; if (nome) t.nodeValue = nome; return; }
      t.nodeValue = r;
    });
    if (n.nodeType === 3) return;
    /* o módulo de stock escreve depois de abrir: vigia-se o documento dele uma só vez */
    var d = n.ownerDocument; if (d && d !== document && !d.__msbLimpo) { d.__msbLimpo = 1; new d.defaultView.MutationObserver(function (L) { L.forEach(function (m) { m.addedNodes.forEach(limpar); }); }).observe(d.body, {childList: true, subtree: true}); ligarNex(d); }
  }

  /* ---- módulo de stock (Etapa 6): tudo por fora, o código dele não muda e a versão atual fica igual ---- */
  function ligarNex(d) {
    var w = d.defaultView, l = d.createElement("link"); l.rel = "stylesheet"; l.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"; d.head.appendChild(l);
    /* As janelas do navegador pedem a resposta na hora; a da app só responde depois. Por isso, num clique, a primeira passagem
       para ali e abre a janela da app; com a resposta, o mesmo botão volta a correr e recebe-a. Fora de um clique fica a do navegador. */
    var R = {}, nConf = w.confirm, nPrompt = w.prompt;
    function botao() { var e = w.event; return e && e.type === "click" && e.target && e.target.closest && e.target.closest("button"); }
    function repetir(b, chave, valor) {
      if (!b.isConnected) return window.msbAviso("A lista mudou entretanto. Carrega outra vez no botão.");
      R[chave] = {v: valor}; try { b.click(); } finally { R = {}; }
    }
    w.confirm = function (t) {
      if (R[t]) return R[t].v;
      var b = botao(); if (!b) return nConf.call(w, t);
      confirma(t).then(function (ok) { if (ok) repetir(b, t, true); });
      return false;
    };
    w.prompt = function (t, val) {
      if (R[t]) return R[t].v;
      var b = botao(); if (!b) return nPrompt.call(w, t, val);
      confirma(t, "Confirmar", val == null ? "" : String(val)).then(function (v) { if (v !== false) repetir(b, t, v); });
      return null;
    };
    /* Stock atual: 20 artigos de cada vez; os outros continuam na lista, para a procura do módulo os encontrar */
    var L = d.getElementById("stockList"), lim = 20; if (!L) return;
    var mais = d.createElement("button"); mais.type = "button"; mais.className = "btn alt"; mais.style.cssText = "width:100%;margin-top:10px"; L.parentNode.insertBefore(mais, L.nextSibling);
    function cortar() {
      var C = [].slice.call(L.children); C.forEach(function (c, i) { c.style.display = i < lim ? "" : "none"; });
      mais.hidden = C.length <= lim; mais.style.display = mais.hidden ? "none" : ""; mais.textContent = "Ver mais " + Math.min(20, C.length - lim) + " · " + Math.min(lim, C.length) + " de " + C.length;
    }
    mais.onclick = function () { lim += 20; cortar(); };
    new w.MutationObserver(function () { lim = 20; cortar(); }).observe(L, {childList: true}); cortar();
  }

  /* ---- erro junto do campo do Registo, enquanto se escreve ---- */
  function validar(e) {
    var c = e.target; if (!c.matches || !c.matches("#turnos .fl input[data-k]") || c.dataset.k === "func") return;
    var v = c.value.trim(), mau = !!v && (/[^0-9.,\s+\-]/.test(v) || isNaN(num(v))), m = c.parentNode.querySelector(".m");
    c.classList.toggle("err", mau); c.setAttribute("aria-invalid", mau);
    if (mau && !m) { m = document.createElement("span"); m.className = "m"; m.textContent = "Valor inválido. Só números, ex.: 1367,88"; c.parentNode.appendChild(m); }
    if (!mau && m) m.remove();
  }

  /* ---- confirmação com o aspeto da app ---- */
  function confirma(texto, acao, campo) {   // com campo: pede um valor e devolve-o, ou false
    return new Promise(function (fim) {
      var d = document.createElement("dialog"); d.id = "bConf";
      d.innerHTML = "<p></p><div><button class='btn' value='n'>Cancelar</button><button class='btn p' value='s'></button></div>";
      d.querySelector("p").textContent = texto; d.querySelector(".p").textContent = acao || "Confirmar";
      if (window.EST && DUAS.indexOf(window.PAGINA) < 0) { var ie = estInfo(EST), et = document.createElement("small"); et.className = "est"; et.textContent = ie.s + " · " + ie.n; d.insertBefore(et, d.firstChild); }
      var c = null; if (campo != null) { c = document.createElement("input"); c.value = campo; d.insertBefore(c, d.lastChild); c.onkeydown = function (e) { if (e.key === "Enter") { e.preventDefault(); acabar("s"); } }; }
      var feito = false;
      function acabar(v) { if (feito) return; feito = true; d.close(); d.remove(); fim(c ? (v === "s" ? c.value : false) : v === "s"); }
      d.onclick = function (e) { var b = e.target.closest("button"); if (b) acabar(b.value); };
      d.onclose = function () { acabar("n"); };   // Esc
      document.body.appendChild(d); d.showModal(); (c || d.querySelector("button")).focus(); if (c) c.select();
    });
  }

  /* ---- Mais (telemóvel) ---- */
  function abrirMais() {
    if ($("#bMais")) return fecharTudo();
    fecharTudo();
    var el = document.createElement("div"), blM = blocos(); el.id = "bMais";
    el.innerHTML = "<div>" + areasVisiveis().filter(function (a) { return AREAS_TEL.indexOf(a.id) < 0; }).map(function (a) { return blM(a) + "<button data-a='" + a.id + "'>" + ic(IC_AREA[a.id]) + nomeArea(a) + "</button>"; }).join("") +
      "<button data-x='sair'>" + ic("s") + "Sair</button></div>";
    el.onclick = function (e) {
      var b = e.target.closest("button"); fecharTudo(); if (!b) return;
      if (b.dataset.x === "sair") $("#bSair").click();
      else { var a = AREAS.find(function (x) { return x.id === b.dataset.a; }); ir(paginasDe(a)[0][0]); }
    };
    $("#vApp").appendChild(el);
  }

  /* ---- botão Novo ---- */
  function acoesNovo() {
    var L = ADMIN ? [["Registar turno", "Caixa do dia", function () { ir("reg"); }]] : [];
    if (ADMIN) L.push(
      ["Carregar documentos", "Qualquer ficheiro: turno, Repsol, TMS, vendas, banco", function () { ir("car"); }],
      ["Fotografar fatura", "M.Cunha e Vendeiro", function () { ir("dig"); $("#bDigFoto").click(); }],
      ["Pedir vendas", "O OCTAN AI lê no CBOS", function () { ir("avi"); esperar(function () { return $("#pvPasta"); }, function (e) { e.scrollIntoView({block: "center"}); e.focus(); }); }]
    ); else L.push(["Contar stock", "Contagem de domingo", function () { ir("contar"); }]);
    return L;
  }
  function esperar(teste, feito, n) { var v = teste(); if (v) return feito(v); if ((n || 0) < 60) setTimeout(function () { esperar(teste, feito, (n || 0) + 1); }, 150); }
  function alternarNovo() {
    if ($("#bNovoM")) return fecharTudo();
    fecharTudo();
    var m = document.createElement("div"), L = acoesNovo(); m.id = "bNovoM"; m.setAttribute("role", "menu");
    m.innerHTML = L.map(function (x, i) { return "<button role='menuitem' data-i='" + i + "'>" + x[0] + "<small>" + x[1] + "</small></button>"; }).join("");
    m.onclick = function (e) { var b = e.target.closest("button"); if (!b) return; fecharTudo(); L[+b.dataset.i][2](); };
    $("#vApp").appendChild(m); m.querySelector("button").focus();
  }

  /* ---- pesquisa de páginas e artigos ---- */
  var ARTIGOS = null, RES = [], SEL = 0;
  function carregarArtigos() {
    if (ARTIGOS) return Promise.resolve();
    return lerTudo(function () { return sb.from("products").select("name,category,barcode,repsol_code").order("name"); }, ["id"]).then(function (r) {
      if (!r.error) ARTIGOS = (r.data || []).map(function (p) { return {n: p.name, c: p.category || "", k: sem(p.name + " " + (p.barcode || "") + " " + (p.repsol_code || ""))}; });
    });
  }
  function abrirPesquisa() {
    fecharTudo();
    var el = document.createElement("div"); el.id = "bPesq"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Procurar");
    el.innerHTML = "<div><label>" + ic("b") + "<input id='bPesqT' placeholder='Procurar página ou artigo' autocomplete='off' aria-label='Procurar página ou artigo'></label><div id='bPesqR'></div></div>";
    el.onclick = function (e) { if (e.target === el) fecharTudo(); };
    $("#vApp").appendChild(el);
    var t = $("#bPesqT"); t.focus(); pintar();
    t.oninput = pintar;
    t.onkeydown = function (e) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (RES.length) { SEL = (SEL + (e.key === "ArrowDown" ? 1 : RES.length - 1)) % RES.length; mostrarSel(); } }
      else if (e.key === "Enter" && RES[SEL]) { e.preventDefault(); abrir(RES[SEL]); }
    };
    carregarArtigos().then(function () { if ($("#bPesq")) pintar(); });
  }
  function procurar(q) {
    var pals = sem(q).split(/\s+/).filter(Boolean), P = [], A = [];
    areasVisiveis().forEach(function (a) { paginasDe(a).forEach(function (p) {
      var k = sem(nomeArea(a) + " " + p[1] + " " + ((p[2] && p[2].g) || ""));
      if (pals.every(function (w) { return k.indexOf(w) >= 0; })) P.push({t: "p", id: p[0], n: p[1], s: nomeArea(a)});
    }); });
    if (pals.length && ARTIGOS) ARTIGOS.some(function (x) { if (pals.every(function (w) { return x.k.indexOf(w) >= 0; })) A.push({t: "a", n: x.n, s: x.c}); return A.length >= 8; });
    return {P: pals.length ? P.slice(0, 8) : P.slice(0, 7), A: A};
  }
  function pintar() {
    var q = $("#bPesqT").value, r = procurar(q), h = "";
    RES = r.P.concat(r.A); SEL = 0;
    function linha(x, i) { return "<button data-i='" + i + "'><span>" + esc(x.n) + "</span><small>" + esc(x.s) + "</small></button>"; }
    if (r.P.length) h += "<b>Páginas</b>" + r.P.map(linha).join("");
    if (r.A.length) h += "<b>Artigos</b>" + r.A.map(function (x, i) { return linha(x, i + r.P.length); }).join("");
    if (!h) h = "<p>Nada encontrado com «" + esc(q) + "». Experimente o nome do artigo ou o código de barras.</p>";
    var box = $("#bPesqR"); box.innerHTML = h; mostrarSel();
    box.onclick = function (e) { var b = e.target.closest("button"); if (b) abrir(RES[+b.dataset.i]); };
    box.onmousemove = function (e) { var b = e.target.closest("button"); if (b && +b.dataset.i !== SEL) { SEL = +b.dataset.i; mostrarSel(); } };
  }
  function mostrarSel() { $$("#bPesqR button").forEach(function (b) { var on = +b.dataset.i === SEL; b.classList.toggle("on", on); if (on) b.scrollIntoView({block: "nearest"}); }); }
  function abrir(x) {
    fecharTudo();
    if (x.t === "p") return ir(x.id);
    ir("stock");   // abre o Stock atual já filtrado pelo artigo; só preenche a pesquisa do módulo
    esperar(function () { var d = nexDoc(), c = d && d.getElementById("search"); return NEX_PRONTO && c && !d.getElementById("tab-stock").classList.contains("hidden") ? c : null; },
      function (c) { c.value = x.n; c.dispatchEvent(new Event("input", {bubbles: true})); });
  }

  window.MSB_NAV = {estInfo: estInfo, 
    montar: montar, marcar: marcar, limpar: limpar, confirma: confirma,
    fechado: function (t, h) { return h ? "<details class='card' style='padding:12px 14px'><summary><b>" + t + "</b></summary><div style='display:grid;gap:10px;margin-top:10px'>" + h + "</div></details>" : ""; },
    selo: function (n) { if (n === SELO) return; SELO = n; marcar(PAGINA, areaDe(PAGINA) || AREAS[0]); },
    nexCss: ":root{--g:#003B5C;--g2:#003B5C;--acc:#D9570F;--txt:#172430;--mut:#566878;--bd:#DCE3E9}" +
      "body{font-family:Inter,'Segoe UI',system-ui,sans-serif!important;font-size:15px}main{max-width:900px!important;margin:0!important}" +
      ".card{border-radius:10px;padding:12px 14px}h2{font-size:16px;font-weight:600}.btn,input,select{border-radius:8px}.btn{font-weight:600}.btn.acc{color:#fff}.stat{border-radius:10px}.bigscan{font-size:20px;padding:14px}.ordCat{border-radius:6px;font-weight:600}.product{border-radius:8px}" +
      "@media(prefers-color-scheme:dark){:root:not([data-theme=light]){--g:#8CC3E3;--g2:#8CC3E3;--acc:#F47A33;--bg:#0F171E;--card:#172330;--txt:#E8EEF3;--mut:#9DB0BF;--bd:#2B3C4B;--red:#FF8B7B;--amber:#EDB65B;color-scheme:dark}" +
      "input,select,.stat,.ordRes,.product,textarea{background:#121C26!important;color:#E8EEF3!important;border-color:#2B3C4B!important}.btn,.ordCat{color:#0F171E!important}.btn.alt{background:#1E2C3A!important;color:#E8EEF3!important}.btn.red{background:#3B1E1A!important;color:#FF8B7B!important;border-color:#5A2A24!important}.btn.acc{color:#fff!important}}"
  };
})();
