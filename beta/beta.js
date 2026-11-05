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
    s: '<path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9"/>'
  };
  var IC_AREA = {ini: "p", des: "d", tes: "t", cst: "c", con: "f", adm: "a"};
  function ic(n) { return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + ICONES[n] + "</svg>"; }
  function nomeArea(a) { return a.n.slice(a.n.indexOf(" ") + 1); }
  function sem(t) { return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
  function ler(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function gravar(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sem armazenamento: vale só nesta sessão */ } }

  var SELO = 0;
  function seloH(x) { return x.id === "ini" && SELO ? "<i class='selo'>" + SELO + "</i>" : ""; }
  var recolhido = ler("msb_lat") === "1";
  function acertarLargura() { document.body.classList.toggle("b-rec", recolhido || innerWidth <= 1024); }

  function montar() {
    if ($("#bLat")) return;
    var app = $("#vApp"), lat = document.createElement("aside"), topo = document.createElement("div");
    lat.id = "bLat"; lat.setAttribute("aria-label", "Menu");
    lat.innerHTML = "<div class='marca'><img src='logo.svg' alt=''><img class='wm' src='marca_clara.png' alt='mystationbox'><em>beta</em></div><div id='bAreas'></div>" +
      "<div class='fim'><span id='bQuem'></span><button id='bVolta' title='Voltar à versão atual'>" + ic("s") + "<span class='tx'>Versão atual</span></button><button id='bRec' title='Recolher o menu'>" + ic("r") + "<span class='tx'>Recolher menu</span></button></div>";
    topo.id = "bTopo";
    topo.innerHTML = "<div id='bCam'></div><button id='bBusca' aria-label='Procurar'>" + ic("b") + "<span>Procurar</span><kbd>Ctrl K</kbd></button><button id='bNovo' aria-haspopup='menu'>" + ic("m") + "<span>Novo</span></button>";
    var main = app.querySelector("main"), chips = document.createElement("div"), barra = document.createElement("nav");
    chips.id = "bChips"; barra.id = "bBarra"; barra.setAttribute("aria-label", "Áreas");
    app.insertBefore(lat, app.firstChild); app.insertBefore(topo, main); app.insertBefore(chips, main); app.appendChild(barra);
    topo.insertBefore($("#selEst"), $("#bNovo"));   // o mesmo seletor de loja, com a mesma função
    var sair = $("#bSair"); sair.textContent = "Sair"; topo.appendChild(sair);
    $("#bQuem").textContent = $("#hQuem").textContent;

    $("#bAreas").onclick = function (e) {
      var b = e.target.closest("button"); if (!b) return;
      if (b.dataset.p) return ir(b.dataset.p);
      var a = AREAS.find(function (x) { return x.id === b.dataset.a; }); ir(paginasDe(a)[0][0]);
    };
    chips.onclick = function (e) { var b = e.target.closest("button"); if (b) ir(b.dataset.p); };
    barra.onclick = function (e) {
      var b = e.target.closest("button"); if (!b) return;
      if (b.dataset.a === "mais") return abrirMais();
      fecharTudo(); var a = AREAS.find(function (x) { return x.id === b.dataset.a; }); ir(paginasDe(a)[0][0]);
    };
    $("#bRec").onclick = function () { recolhido = !recolhido; gravar("msb_lat", recolhido ? "1" : "0"); acertarLargura(); };
    $("#bVolta").onclick = function () { location.href = "../"; };
    $("#bBusca").onclick = abrirPesquisa;
    $("#bNovo").onclick = function (e) { e.stopPropagation(); alternarNovo(); };
    addEventListener("resize", acertarLargura); acertarLargura();
    document.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); abrirPesquisa(); }
      else if (e.key === "Escape") fecharTudo();
    });
    document.addEventListener("click", function (e) { var m = $("#bNovoM"); if (m && !m.contains(e.target)) m.remove(); });
  }

  function marcar(pg, a) {
    var ps = paginasDe(a), gr = "", atual = a.p.find(function (x) { return x[0] === pg; });
    $("#bAreas").innerHTML = areasVisiveis().map(function (x) {
      var on = x.id === a.id, h = "<button data-a='" + x.id + "' title='" + nomeArea(x) + "'" + (on ? " class='on' aria-current='true'" : "") + ">" + ic(IC_AREA[x.id]) + "<span class='tx'>" + nomeArea(x) + "</span>" + seloH(x) + "</button>";
      if (on && ps.length > 1) h += "<div class='sub'>" + ps.map(function (p) {
        var g = (p[2] && p[2].g) || "", t = g && g !== gr ? "<b>" + g + "</b>" : ""; gr = g || gr;
        return t + "<button data-p='" + p[0] + "'" + (p[0] === pg ? " class='on' aria-current='page'" : "") + ">" + p[1] + "</button>";
      }).join("") + "</div>";
      return h;
    }).join("");
    $("#bCam").innerHTML = "<span class='ar'>" + nomeArea(a) + "</span><span class='sep ar'> › </span><b>" + (atual ? atual[1] : "") + "</b>";
    var chips = $("#bChips");
    chips.innerHTML = ps.length > 1 ? ps.map(function (p) { return "<button data-p='" + p[0] + "'" + (p[0] === pg ? " class='on'" : "") + ">" + p[1] + "</button>"; }).join("") : "";
    var on = chips.querySelector(".on"); if (on) chips.scrollLeft = Math.max(0, on.offsetLeft - 40);
    var vis = areasVisiveis(), noTel = vis.filter(function (x) { return AREAS_TEL.indexOf(x.id) >= 0; });
    var fora = AREAS_TEL.indexOf(a.id) < 0;
    $("#bBarra").innerHTML = noTel.map(function (x) { return "<button data-a='" + x.id + "'" + (x.id === a.id ? " class='on'" : "") + ">" + ic(IC_AREA[x.id]) + (x.c || nomeArea(x)) + seloH(x) + "</button>"; }).join("") +
      "<button data-a='mais'" + (fora ? " class='on'" : "") + ">" + ic("x") + "Mais</button>";
    document.title = (atual ? atual[1] + " · " : "") + "mystationbox beta";
  }

  function fecharTudo() { ["#bNovoM", "#bPesq", "#bMais"].forEach(function (s) { var e = $(s); if (e) e.remove(); }); }

  /* ---- Mais (telemóvel) ---- */
  function abrirMais() {
    if ($("#bMais")) return fecharTudo();
    fecharTudo();
    var el = document.createElement("div"); el.id = "bMais";
    el.innerHTML = "<div>" + areasVisiveis().filter(function (a) { return AREAS_TEL.indexOf(a.id) < 0; }).map(function (a) { return "<button data-a='" + a.id + "'>" + ic(IC_AREA[a.id]) + nomeArea(a) + "</button>"; }).join("") +
      "<button data-x='volta'>" + ic("s") + "Voltar à versão atual</button><button data-x='sair'>" + ic("s") + "Sair</button></div>";
    el.onclick = function (e) {
      var b = e.target.closest("button"); fecharTudo(); if (!b) return;
      if (b.dataset.x === "volta") location.href = "../";
      else if (b.dataset.x === "sair") $("#bSair").click();
      else { var a = AREAS.find(function (x) { return x.id === b.dataset.a; }); ir(paginasDe(a)[0][0]); }
    };
    $("#vApp").appendChild(el);
  }

  /* ---- botão Novo ---- */
  function acoesNovo() {
    var L = [["Registar turno", "Caixa do dia", function () { ir("reg"); }]];
    if (ADMIN) L.push(
      ["Carregar ficheiro", "Turno, Repsol, TMS, vendas ou encomenda", function () { $("#bCarregar").click(); }],
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
    return sb.from("products").select("name,category,barcode,repsol_code").order("name").limit(2000).then(function (r) {
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

  window.MSB_NAV = {
    montar: montar, marcar: marcar,
    selo: function (n) { if (n === SELO) return; SELO = n; marcar(PAGINA, areaDe(PAGINA) || AREAS[0]); },
    nexCss: ":root{--g:#003B5C;--g2:#003B5C;--acc:#D9570F;--txt:#172430;--mut:#566878;--bd:#DCE3E9}" +
      "body{font-family:Inter,'Segoe UI',system-ui,sans-serif!important;font-size:15px}.card{border-radius:10px}.btn,input,select{border-radius:8px}.btn.acc{color:#fff}" +
      "@media(prefers-color-scheme:dark){body{background:#F5F7F9!important;border-radius:10px}}"
  };
})();
