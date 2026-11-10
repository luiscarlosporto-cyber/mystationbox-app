/* mystationbox beta · Etapa 5: páginas novas (só leem) e ajudas às páginas longas.
 * Comparar estações lê a Folha de fecho do CBOS; Documentos reúne os originais já guardados, por mês. */
"use strict";
(function () {
  function eur(c) { return fmt(c) + " €"; }
  function nomeLoja(e) { return e.short_name || e.name; }
  function nomeMes(m) { return new Date(m + "-15").toLocaleDateString("pt-PT", {month: "long", year: "numeric"}); }
  function barraMes(pre, M, feito) {
    var h = "<div class='bar'><button class='btn' id='" + pre + "Ant' aria-label='Mês anterior'>‹</button><input type='month' id='" + pre + "Mes' value='" + M + "'><button class='btn' id='" + pre + "Seg' aria-label='Mês seguinte'>›</button></div>";
    return {h: h, ligar: function () {
      $("#" + pre + "Ant").onclick = function () { feito(addMes(M, -1)); };
      $("#" + pre + "Seg").onclick = function () { feito(addMes(M, 1)); };
      $("#" + pre + "Mes").onchange = function () { if (this.value) feito(this.value); };
    }};
  }

  /* ---- Comparar estações ---- */
  var CMP_M = null;
  async function comparar(M) {
    var box = $("#v-cmp");
    if (!M) {
      var u = await sb.from("msb_folha_fecho").select("mes").order("mes", {ascending: false}).limit(1);
      M = CMP_M || (u.data && u.data[0] && u.data[0].mes) || addMes(hojeISO(0).slice(0, 7), -1);
    }
    CMP_M = M;
    var b = barraMes("cmp", M, comparar);
    box.innerHTML = b.h + "<div class='bl ske' style='height:240px'></div>"; b.ligar();
    try {
      var r = await sb.from("msb_folha_fecho").select("estacao,dados").eq("mes", M); if (r.error) throw r.error;
      var F = {}; (r.data || []).forEach(function (x) { F[x.estacao] = x.dados; });
      var falta = ESTS.filter(function (e) { return !F[e.id]; }).map(nomeLoja), L = ESTS.filter(function (e) { return F[e.id]; });
      if (!L.length) { box.innerHTML = b.h + "<div class='vazio'>Ainda não há Folha de fecho de " + nomeMes(M) + ". Carrega-a em Novo, Carregar ficheiro.</div>"; b.ligar(); return; }
      var soma = function (d, ks) { return ks.reduce(function (s, k) { return s + ((d.formas || {})[k] || 0); }, 0); };
      var dif = L.length === 2, cab = "<tr><th class='l'></th>" + L.map(function (e) { return "<th>" + esc(nomeLoja(e)) + "</th>"; }).join("") + (dif ? "<th>Diferença</th>" : "") + "</tr>";
      var linha = function (nome, val, fm) {
        var v = L.map(function (e) { return val(F[e.id]); });
        return "<tr><td class='l'>" + esc(nome) + "</td>" + v.map(function (x) { return "<td class='n'>" + fm(x) + "</td>"; }).join("") + (dif ? "<td class='n'>" + (v[1] - v[0] > 0 ? "+" : "") + fm(v[1] - v[0]) + "</td>" : "") + "</tr>";
      };
      var lit = function (c) { return FORMATOS.numero(Math.round(c / 100), 0) + " L"; };
      var h = "<div class='sc'><table><thead>" + cab + "</thead><tbody>" +
        linha("Vendas totais", function (d) { return d.totais.formas || 0; }, eur) +
        linha("Combustível", function (d) { return (d.totais.comb || [])[5] || 0; }, eur) +
        linha("Litros", function (d) { return (d.totais.comb || [])[1] || 0; }, lit) +
        linha("Loja", function (d) { return (d.totais.loja || [])[5] || 0; }, eur) +
        linha("Multibanco", function (d) { return soma(d, ["CARTAO BANCARIO", "BANCARIO OFFLINE"]); }, eur) +
        linha("Solred", function (d) { return soma(d, ["SOLRED", "SOLRED OFFLINE"]); }, eur) +
        linha("Numerário", function (d) { return soma(d, ["NUMERARIO"]); }, eur) + "</tbody></table></div>";
      var nomes = function (k) { var o = {}; L.forEach(function (e) { (F[e.id][k] || []).forEach(function (x) { o[x[0]] = 1; }); }); return Object.keys(o).sort(); };
      var val = function (d, k, n, i) { return (d[k] || []).reduce(function (s, x) { return s + (x[0] === n ? x[i] || 0 : 0); }, 0); };
      h += "<h2>Combustível por produto</h2><div class='sc'><table><thead>" + cab + "</thead><tbody>" + nomes("comb").map(function (n) { return linha(n, function (d) { return val(d, "comb", n, 2); }, lit); }).join("") + "</tbody></table></div>";
      h += "<h2>Loja por família</h2><div class='sc'><table><thead>" + cab + "</thead><tbody>" + nomes("loja").map(function (n) { return linha(n, function (d) { return val(d, "loja", n, 6); }, eur); }).join("") + "</tbody></table></div>";
      box.innerHTML = b.h + (falta.length ? "<div class='aviso'><p>Falta a Folha de fecho de " + esc(falta.join(", ")) + " neste mês.</p></div>" : "") + "<p class='rod'>" + nomeMes(M) + " · valores com IVA, da Folha de fecho do CBOS.</p>" + h;
      b.ligar();
    } catch (e) { box.innerHTML = b.h + "<div class='aviso'><p>" + esc(falhou(e)) + "</p></div>"; b.ligar(); }
  }

  /* ---- Documentos para a contabilidade ---- */
  var DOC_M = null;
  async function documentos(M) {
    /* no topo, a pesquisa em todos os meses (pesquisa_docs.js); por baixo, a lista do mês, que se esconde enquanto se procura */
    if (!$("#docMes")) $("#v-doc").innerHTML = "<div id='docPesq'></div><div id='docMes'></div>";
    if (window.pdocMontar) pdocMontar($("#docPesq"));
    var box = $("#docMes"); M = M || DOC_M || addMes(hojeISO(0).slice(0, 7), -1); DOC_M = M;
    var b = barraMes("doc", M, documentos), ini = M + "-01", fim = addMes(M, 1) + "-01";
    box.innerHTML = b.h + "<div class='bl ske' style='height:240px'></div>"; b.ligar();
    try {
      var q = function (p) { return p.then(function (r) { if (r.error) throw r.error; return r.data || []; }); };
      var R = await Promise.all([
        q(sb.from("msb_docs").select("estacao,tipo,numero,emissao,pdf").gte("emissao", ini).lt("emissao", fim).order("emissao")),
        q(sb.from("msb_tms").select("estacao,mes,original").eq("mes", M)),
        q(sb.from("msb_vendas_mes").select("estacao,mes,fonte").eq("mes", M)),
        q(sb.from("msb_folha_fecho").select("estacao,mes,fonte").eq("mes", M)),
        q(sb.from("msb_precos").select("estacao,dia,original").gte("dia", ini).lt("dia", fim).order("dia")),
        q(sb.from("msb_faturas_dig").select("estacao,fornecedor,numero,dia,original").gte("dia", ini).lt("dia", fim).order("dia"))
      ]);
      var cam = function (f) { var i = String(f || "").lastIndexOf(" · "); return i >= 0 ? f.slice(i + 3) : ""; };
      var L = [];
      R[0].forEach(function (x) { L.push({e: x.estacao, t: "Repsol", n: x.tipo + " " + x.numero, d: x.emissao, o: x.pdf}); });
      R[1].forEach(function (x) { L.push({e: x.estacao, t: "Fecho", n: "Fecho mensal TMS", d: "", o: x.original}); });
      R[2].forEach(function (x) { L.push({e: x.estacao, t: "CBOS", n: "Turno por formas de cobrança mensal", d: "", o: cam(x.fonte)}); });
      R[3].forEach(function (x) { L.push({e: x.estacao, t: "CBOS", n: "Folha de fecho turno mensal", d: "", o: cam(x.fonte)}); });
      R[4].forEach(function (x) { L.push({e: x.estacao, t: "Preços", n: "Tabela de preços Repsol", d: x.dia, o: x.original}); });
      R[5].forEach(function (x) { L.push({e: x.estacao, t: "Fatura", n: x.fornecedor + " " + x.numero, d: x.dia, o: x.original}); });
      var G = ESTS.map(function (e) {
        var D = L.filter(function (x) { return x.e === e.id; });
        return "<h2>" + esc(nomeLoja(e)) + "</h2>" + (D.length ? "<div class='sc'><table><thead><tr><th class='l'>Documento</th><th class='l'>Tipo</th><th class='l'>Data</th><th></th></tr></thead><tbody>" + D.map(function (x) {
          return "<tr><td class='l'>" + esc(x.n) + "</td><td class='l'>" + esc(x.t) + "</td><td class='l'>" + (x.d ? dmy(x.d) : "") + "</td><td>" + (x.o ? "<button class='mini' data-o='" + esc(x.o) + "'>Abrir</button>" : "<span class='mut'>Sem original</span>") + "</td></tr>";
        }).join("") + "</tbody></table></div>" : "<div class='vazio'>Sem documentos guardados neste mês.</div>");
      }).join("");
      var feitos = "<div class='bar'><span class='mut' style='font-size:13px'>Gerados na app:</span><button class='btn' data-p='kms'>Mapa de kms</button><button class='btn' data-p='ense'>Reporte ENSE</button><button class='btn' data-p='rep'>Créditos MB</button></div>";
      box.innerHTML = b.h + feitos + G; b.ligar();
      box.querySelectorAll("[data-o]").forEach(function (x) { x.onclick = function () { abrirOriginal(x.dataset.o); }; });
      box.querySelectorAll("[data-p]").forEach(function (x) { x.onclick = function () { ir(x.dataset.p); }; });
    } catch (e) { box.innerHTML = b.h + "<div class='aviso'><p>" + esc(falhou(e)) + "</p></div>"; b.ligar(); }
  }

  /* ---- formulários longos: cada cartão fica uma secção; os campos continuam todos na página, para o Gravar os encontrar ---- */
  function seccoes(box) {
    var C = [].filter.call(box.children, function (c) { return c.matches(".card") && c.querySelector("h2"); });
    if (C.length < 2) return;
    var t = document.createElement("div"); t.className = "secs"; t.setAttribute("role", "tablist");
    function ver(i) { C.forEach(function (c, j) { c.hidden = j !== i; t.children[j].classList.toggle("on", j === i); t.children[j].setAttribute("aria-selected", j === i); }); }
    C.forEach(function (c, i) { var b = document.createElement("button"); b.type = "button"; b.setAttribute("role", "tab"); b.textContent = c.querySelector("h2").textContent.split("·")[0].trim(); b.onclick = function () { ver(i); }; t.appendChild(b); });
    box.insertBefore(t, C[0]); ver(0);
  }

  /* ---- tabelas compridas: procurar por cima e ver 30 de cada vez; as linhas ficam todas na página ---- */
  var PASSO = 30;
  function ajustarTabela(tb) {
    var L = [].slice.call(tb.tBodies[0] ? tb.tBodies[0].rows : []), caixa = tb.__f; if (!caixa) return;
    var q = caixa.q.value.trim().toLowerCase(), n = 0, vis = 0;
    L.forEach(function (r) {
      var ok = !q || r.textContent.toLowerCase().indexOf(q) >= 0; if (ok) n++;
      var mostra = ok && n <= caixa.lim; r.hidden = !mostra; if (mostra) vis++;
    });
    caixa.c.textContent = n === L.length ? L.length + " linhas" : n + " de " + L.length + " linhas";
    caixa.m.hidden = n <= caixa.lim; caixa.m.textContent = "Ver mais " + Math.min(PASSO, n - caixa.lim);
  }
  function rever() {
    $$("main table").forEach(function (tb) {
      if (tb.__f) return ajustarTabela(tb);
      var n = tb.tBodies[0] ? tb.tBodies[0].rows.length : 0; if (n <= 40 || tb.closest("#v-doc")) return;   // Documentos tem a sua pesquisa (todos os meses)
      var alvo = tb.closest(".sc") || tb, topo = document.createElement("div"), fim = document.createElement("div");
      topo.className = "tbTopo"; topo.innerHTML = "<input type='search' placeholder='Procurar nesta lista' aria-label='Procurar nesta lista'><span class='mut'></span>";
      fim.className = "tbFim"; fim.innerHTML = "<button class='btn' type='button'></button>";
      alvo.parentNode.insertBefore(topo, alvo); alvo.parentNode.insertBefore(fim, alvo.nextSibling);
      tb.__f = {q: topo.firstChild, c: topo.lastChild, m: fim.firstChild, lim: PASSO};
      tb.__f.q.oninput = function () { tb.__f.lim = PASSO; ajustarTabela(tb); };
      tb.__f.m.onclick = function () { tb.__f.lim += PASSO; ajustarTabela(tb); };
      ajustarTabela(tb);
    });
  }
  var espera = null;
  function agendar() { clearTimeout(espera); espera = setTimeout(rever, 120); }

  var ABRIR = {cmp: function () { comparar(); }, doc: function () { documentos(); }, hor: function () { MSB_NAV.horario(); }};
  MSB_NAV.seccoes = seccoes;
  MSB_NAV.paginas = function () {
    var D = AREAS.find(function (a) { return a.id === "des"; }), C = AREAS.find(function (a) { return a.id === "con"; });
    var i = D.p.findIndex(function (p) { return p[0] === "fun"; });
    D.p.splice(i, 0, ["cmp", "Comparar estações", {g: "Análise"}]); C.p.push(["doc", "Documentos", {g: "Contabilidade"}]);
    AREAS[0].p.splice(1, 0, ["hor", "Horário"]);
    VISTA_DA.cmp = "cmp"; VISTA_DA.doc = "doc"; VISTA_DA.hor = "hor";
    var w = $("main .wrap");
    ["cmp", "doc", "hor"].forEach(function (k) { var v = document.createElement("div"); v.id = "v-" + k; v.className = "v"; v.hidden = true; w.appendChild(v); });
    new MutationObserver(agendar).observe($("main"), {childList: true, subtree: true});
  };
  MSB_NAV.abrirPagina = function (pg) { if (ABRIR[pg]) ABRIR[pg](); };
})();
