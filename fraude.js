/* mystationbox · Controlo → Fraude (12/11/2026, aprovado pelo dono na versão de ver). Só administrador.
 * Compara as vendas de cada colaborador com as dos colegas, por categoria, em quinzenas e meses.
 * Dados: msb_vendas_colaborador (+ _dias), lidos do CBOS «Consulta de Vendas por Período» com «Discriminar por colaborador».
 * Sinais do CBOS (descontos ao talão, devoluções) e decisões do dono em msb_fraude_registos, que só acrescenta.
 * Regras em app/fraude_regras.js (FRAUDE). Um desvio é um indício, nunca uma conclusão: decide o dono. */
"use strict";
var FRA = {est: null, dados: null, jan: "q", i: null, catEv: "TABACO", catDif: "TABACO", nota: null};
var FRA_NOMES = {CARLOSMAGALHAES: "Carlos Magalhães", CARLOSMIGUEL: "Carlos Miguel", JOSESOUSA: "José Sousa", RICARDOMARTINS: "Ricardo Martins",
  CARINASANTOS: "Carina Santos", SILVIABAPTISTA: "Sílvia Baptista", INESAZEVEDO: "Inês Azevedo"};
var FRA_FAM = {LOJA_TOTAL: "Loja (sem combustível)", TABACO: "Tabaco", LOJA: "Família LOJA", CAFETARIA: "Cafetaria", COMBUSTIVEIS: "Combustíveis", GAS: "Gás",
  LUBRIFICANTES: "Lubrificantes", "PROMOCOES REPSOL": "Promoções Repsol", "ADBLUE EMBALADO": "AdBlue", LAVAGEM: "Lavagem", IMPRENSA: "Imprensa", JOGO: "Jogo"};
var FRA_MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
var FRA_NIV = {critico: "❌", aviso: "⚠️", ok: "✅", acima: "ℹ️", info: "ℹ️", curta: "ℹ️"};
var FRA_NIVT = {critico: "Crítico", aviso: "Atenção", ok: "Normal", acima: "Acima dos colegas", info: "Valor baixo, só informa", curta: "Amostra curta"};
var FRA_PESO = {critico: 3, aviso: 2, ok: 1, acima: 1, info: 0, curta: 0};
var FRA_CORES = ["#2F6FDE", "#D9570F", "#157F52", "#8E44AD", "#B8860B", "#C0392B"];
var FRA_HOR_DESDE = "2026-07-01";   // horário selado usado nas contas a partir de julho (dono, 12/11/2026)
var FRA_DEC = {explicado: "Explicado", observacao: "Em observação", acao: "Ação do dono"};

function fraNome(c) { return FRA_NOMES[c] || c.charAt(0) + c.slice(1).toLowerCase(); }
function fraEur(c) { return (c < 0 ? "−" : "") + String(Math.round(Math.abs(c) / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " €"; }
function fraEurs(c) { var r = Math.round(c / 100); return (r > 0 ? "+" : r < 0 ? "−" : "") + fraEur(Math.abs(c)); }
function fraU(x) { return x && x.por_turno ? "/turno" : "/dia"; }
function fraChip(x) { return "<span class='fra-chip " + x.nivel + "' title='" + FRA_NIVT[x.nivel] + "'>" + FRA_NIV[x.nivel] + (x.indice !== null ? " " + x.indice : "") + "</span>"; }

function fraCss() {
  if ($("#fraCss")) return;
  var s = document.createElement("style"); s.id = "fraCss";
  s.textContent = ".fra-barra{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.fra-seg{display:inline-flex;border:1px solid var(--bd);border-radius:8px;overflow:hidden}" +
    ".fra-seg button{border:0;background:var(--card);color:var(--fg);padding:8px 14px;font:inherit;cursor:pointer;min-height:38px}.fra-seg button[aria-pressed=true]{background:var(--azul);color:var(--card);font-weight:600}" +
    ".fra-nav{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--bd);border-radius:8px;padding:2px;background:var(--card)}.fra-nav button{border:0;background:none;font-size:18px;width:36px;height:34px;cursor:pointer;color:var(--fg)}.fra-nav button:disabled{opacity:.3}.fra-nav span{min-width:170px;text-align:center;font-weight:600}" +
    ".fra-res{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}.fra-tile{background:var(--card);border:1px solid var(--bd);border-radius:10px;padding:12px 14px}.fra-tile .n{font-size:24px;font-weight:700;font-variant-numeric:tabular-nums}.fra-tile .l{color:var(--mut);font-size:12px}" +
    ".fra-tile.bad{border-left:4px solid var(--bad)}.fra-tile.wn{border-left:4px solid var(--wn)}.fra-tile.ok{border-left:4px solid var(--ok)}" +
    ".fra-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}.fra-col{background:var(--card);border:1px solid var(--bd);border-radius:10px;padding:14px;border-top:4px solid var(--bd)}" +
    ".fra-col.critico{border-top-color:var(--bad)}.fra-col.aviso{border-top-color:var(--wn)}.fra-col.ok,.fra-col.acima{border-top-color:var(--ok)}.fra-col h3{margin:0;font-size:15px}.fra-col .m{color:var(--mut);font-size:12px;margin-bottom:8px}" +
    ".fra-col .lin{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:4px 0;border-top:1px solid var(--soft)}" +
    ".fra-chip{display:inline-flex;gap:4px;font-size:12px;font-weight:600;padding:2px 8px;border-radius:99px;font-variant-numeric:tabular-nums;white-space:nowrap}" +
    ".fra-chip.critico{background:var(--badb);color:var(--bad)}.fra-chip.aviso{background:var(--wnb);color:var(--wn)}.fra-chip.ok{background:var(--okb);color:var(--ok)}.fra-chip.acima,.fra-chip.info,.fra-chip.curta{background:var(--soft);color:var(--mut)}" +
    ".fra-tab table{min-width:640px;font-variant-numeric:tabular-nums}.fra-tab td,.fra-tab th{text-align:right;vertical-align:top}.fra-tab td:first-child,.fra-tab th:first-child{text-align:left}.fra-tab tr.crit td:first-child{font-weight:700}" +
    ".fra-tag{font-size:10.5px;font-weight:600;color:var(--laranja);background:var(--lar2);border-radius:4px;padding:1px 5px;margin-left:6px}.fra-tab .d{font-size:11.5px;color:var(--mut)}.fra-tab .d.neg{color:var(--bad)}" +
    ".fra-graf{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px}.fra-cat{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}" +
    ".fra-cat button{border:1px solid var(--bd);background:var(--card);color:var(--fg);border-radius:99px;padding:5px 12px;font:inherit;font-size:12.5px;cursor:pointer}.fra-cat button[aria-pressed=true]{border-color:var(--azul);color:var(--azul);font-weight:600;background:var(--soft)}" +
    ".fra-graf svg text{fill:var(--mut)}.fra-leg{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--mut);margin-top:6px}.fra-leg i{display:inline-block;width:14px;height:3px;border-radius:2px;vertical-align:middle;margin-right:5px}" +
    ".fra-al{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding:10px 12px;border:1px solid var(--bd);border-radius:8px;border-left:4px solid var(--wn);margin-bottom:8px}.fra-al.critico{border-left-color:var(--bad)}.fra-al.feito{opacity:.75;border-left-color:var(--ok)}" +
    ".fra-al .t{font-weight:600}.fra-al .x{color:var(--mut);font-size:12.5px}.fra-al .bt{display:flex;gap:6px;flex-wrap:wrap}" +
    "@media (max-width:560px){.fra-al{grid-template-columns:1fr}.fra-nav span{min-width:120px}}";
  document.head.appendChild(s);
}

async function carregarFraude() {
  fraCss();
  var box = $("#fraCorpo");
  if (FRA.est !== EST) { FRA.est = EST; FRA.dados = null; FRA.i = null; }
  if (!FRA.dados) {
    box.innerHTML = "<div class='mut'>A carregar…</div>";
    try {
      var r = await Promise.all([
        sb.from("msb_vendas_colaborador").select("periodo,colaborador,familia,qtd_c,valor_c").eq("estacao", EST).limit(20000),
        sb.from("msb_vendas_colaborador_dias").select("estacao,periodo,colaborador,dias").limit(10000),
        sb.from("msb_fraude_registos").select("*").eq("estacao", EST).order("em").limit(5000),
        sb.from("msb_horario_dias").select("estacao,dia,colaborador_id,codigo").gte("dia", FRA_HOR_DESDE).in("codigo", ["M", "T", "MT"]).limit(20000),
        sb.from("msb_horario_meses").select("estacao,mes,estado").eq("estado", "real"),
        sb.from("msb_colaboradores").select("id,nome,nome_cbos")]);
      r.forEach(function (x) { if (x.error) throw x.error; });
      var p = {};
      r[0].data.forEach(function (x) { (p[x.periodo] = p[x.periodo] || {dias: {}, l: []}).l.push([x.colaborador, x.familia, x.qtd_c, x.valor_c]); });
      var vd = {};
      r[1].data.forEach(function (x) {
        var m = x.periodo.slice(0, 7), s = ((vd[x.estacao] = vd[x.estacao] || {})[x.colaborador] = vd[x.estacao][x.colaborador] || new Set());
        x.dias.forEach(function (d) { s.add(m + "-" + String(d).padStart(2, "0")); });
        if (x.estacao === EST) (p[x.periodo] = p[x.periodo] || {dias: {}, l: []}).dias[x.colaborador] = x.dias; });
      var cb = {}, partilha = {};
      r[5].data.forEach(function (c) { if (c.nome_cbos) { cb[c.id] = c.nome_cbos; (partilha[c.nome_cbos] = partilha[c.nome_cbos] || []).push(c.nome); } });
      var hor = r[3].data.filter(function (h) { return cb[h.colaborador_id]; }).map(function (h) { return {col: cb[h.colaborador_id], est: h.estacao, dia: h.dia, codigo: h.codigo}; });
      var reais = {}; r[4].data.forEach(function (m) { reais[m.estacao + "|" + m.mes] = 1; });
      FRA.dados = {p: p, reg: r[2].data, vd: vd, hor: hor, reais: reais, partilha: partilha};
    } catch (e) {
      var m = falhou(e); box.innerHTML = "<div class='bad'>" + esc(/msb_vendas_colaborador|PGRST205|42P01/.test(m) ? "A Fraude ainda não está ativa na base de dados." : m) + "</div>"; return;
    }
  }
  if (!Object.keys(FRA.dados.p).length) { box.innerHTML = "<div class='card'><p class='mut'>Ainda não há vendas por colaborador desta estação. O OCTAN AI recolhe-as do CBOS no dia 1 e no dia 16 de cada mês.</p></div>"; return; }
  fraDesenhar();
}

function fraPeriodos() {
  var q = Object.keys(FRA.dados.p).sort();
  if (FRA.jan === "q") return q.map(function (k) { return {id: k, partes: [k]}; });
  var m = q.map(function (k) { return k.slice(0, 7); }).filter(function (k, i, a) { return a.indexOf(k) === i; });
  return m.map(function (k) { return {id: k, partes: q.filter(function (x) { return x.indexOf(k) === 0; })}; });
}
/* última quinzena ainda aberta: o último dia com vendas diz até onde vai */
function fraUltimoDia(id) {
  var d = FRA.dados.p[id], mx = 0; if (!d) return 0;
  Object.keys(d.dias).forEach(function (c) { d.dias[c].forEach(function (x) { if (x > mx) mx = x; }); }); return mx;
}
function fraRotulo(id) {
  var a = id.split("-"), mes = FRA_MESES[+a[1] - 1], hoje = new Date(), fimMes = new Date(+a[0], +a[1], 0).getDate();
  var aberto = function (q) { var ini = q === "1" ? 1 : 16, fim = q === "1" ? 15 : fimMes; var dFim = new Date(+a[0], +a[1] - 1, fim); return dFim >= new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()) ? ini : 0; };
  if (!a[2]) { var ult = Object.keys(FRA.dados.p).filter(function (k) { return k.indexOf(id) === 0; }).sort().pop(); var u = ult && aberto(ult.slice(-1)) ? fraUltimoDia(ult) : 0;
    return mes.charAt(0).toUpperCase() + mes.slice(1) + " " + a[0] + (u ? " (até " + u + "/" + a[1] + ")" : ""); }
  if (aberto(a[2])) return (a[2] === "1" ? "1" : "16") + " a " + fraUltimoDia(id) + " " + mes + " (em curso)";
  return (a[2] === "1" ? "1 a 15 " : "16 a fim de ") + mes;
}
/* dias (ISO) de um período e se o horário selado o cobre todo */
function fraDiasDe(per) {
  var R = []; per.partes.forEach(function (k) { var a = k.split("-"), fim = new Date(+a[0], +a[1], 0).getDate(), ini = a[2] === "1" ? 1 : 16, ate = a[2] === "1" ? 15 : fim;
    for (var d = ini; d <= ate; d++) R.push(a[0] + "-" + a[1] + "-" + String(d).padStart(2, "0")); });
  return R;
}
function fraHorario(per) {
  var dias = fraDiasDe(per), D = FRA.dados;
  if (dias[0] < FRA_HOR_DESDE || !per.partes.every(function (k) { return D.reais[EST + "|" + k.slice(0, 7)]; })) return null;
  var hoje = new Date().toISOString().slice(0, 10);
  return FRAUDE.turnosHorario(EST, dias.filter(function (d) { return d < hoje; }), D.hor, D.vd);
}
function fraCalcular(per) {
  var linhas = [], dias = {}, H = fraHorario(per);
  per.partes.forEach(function (k) {
    var D = FRA.dados.p[k];
    Object.keys(D.dias).forEach(function (c) { var s = dias[c] || (dias[c] = new Set()); D.dias[c].forEach(function (d) { s.add(k + "-" + d); }); });
    D.l.forEach(function (x) { linhas.push({colaborador: x[0], periodo: k, familia: x[1], qtd: x[2], valor_c: x[3]}); });
  });
  var r = FRAUDE.comparar(linhas, dias, H ? H.turnos : null); r.horario = H; return r;
}
function fraSerie() {
  var ant = null;
  return fraPeriodos().map(function (p) { var r = FRAUDE.comPersistencia(ant, fraCalcular(p)); ant = r; return {p: p, r: r}; });
}
function fraDecisao(per, c, f) {
  var d = FRA.dados.reg.filter(function (x) { return x.tipo === "decisao" && x.periodo === per && x.colaborador === c && (x.familia || "") === (f || ""); });
  return d[d.length - 1];
}

function fraDesenhar() {
  var S = fraSerie();
  if (FRA.i === null || FRA.i >= S.length) FRA.i = S.length - 1;
  var p = S[FRA.i].p, r = S[FRA.i].r, CR = FRAUDE.CRITICAS;
  var cols = r.colaboradores.filter(function (c) { return Object.keys(r.res).some(function (f) { return r.res[f][c] && r.res[f][c].valor_c; }); });
  var crit = [], av = [], total = 0;
  CR.forEach(function (f) { cols.forEach(function (c) { var x = r.res[f] && r.res[f][c]; if (!x) return; if (x.nivel === "critico") crit.push([f, c, x]); else if (x.nivel === "aviso") av.push([f, c, x]); }); });
  Object.keys(r.res).forEach(function (f) { if (f === "LOJA_TOTAL") return; Object.keys(r.res[f]).forEach(function (c) { total += r.res[f][c].valor_c; }); });
  var perda = crit.concat(av).reduce(function (s, a) { return s + Math.min(0, a[2].dif_dia_c) * a[2].dias; }, 0);
  var h = "<div class='fra-barra'><div class='fra-seg' role='group' aria-label='Janela'><button id='fraQ' aria-pressed='" + (FRA.jan === "q") + "'>15 dias</button><button id='fraM' aria-pressed='" + (FRA.jan === "m") + "'>30 dias (mês)</button></div>" +
    "<div class='fra-nav'><button id='fraAnt' aria-label='Período anterior'" + (FRA.i === 0 ? " disabled" : "") + ">‹</button><span>" + esc(fraRotulo(p.id)) + "</span><button id='fraSeg' aria-label='Período seguinte'" + (FRA.i === S.length - 1 ? " disabled" : "") + ">›</button></div></div>";
  h += "<div class='fra-res'><div class='fra-tile " + (crit.length ? "bad" : "ok") + "'><div class='n'>" + crit.length + "</div><div class='l'>❌ alertas críticos (Loja, Tabaco, Cafetaria)</div></div>" +
    "<div class='fra-tile " + (av.length ? "wn" : "ok") + "'><div class='n'>" + av.length + "</div><div class='l'>⚠️ em atenção</div></div>" +
    "<div class='fra-tile'><div class='n'>" + fraEur(-perda) + "</div><div class='l'>Diferença nos alertas face aos colegas, no período</div></div>" +
    "<div class='fra-tile'><div class='n'>" + fraEur(total) + "</div><div class='l'>Vendas com colaborador, " + cols.length + " colaboradores · conferido com o CBOS</div></div></div>";
  h += "<section><h2 style='margin:0 0 4px'>Colaboradores</h2><p class='mut' style='margin:0 0 10px;font-size:13px'>Venda por dia com vendas e índice face aos colegas nas categorias críticas. A cor de cima é o pior nível.</p><div class='fra-cols'>" +
    cols.map(function (c) {
      var xs = CR.map(function (f) { return r.res[f] && r.res[f][c]; }).filter(Boolean), pior = xs.slice().sort(function (a, b) { return FRA_PESO[b.nivel] - FRA_PESO[a.nivel]; })[0], tot = 0, dias = 0;
      Object.keys(r.res).forEach(function (f) { if (f !== "LOJA_TOTAL" && r.res[f][c]) { tot += r.res[f][c].valor_c; dias = r.res[f][c].dias; } });
      var ptur = Object.keys(r.res).some(function (f) { return r.res[f][c] && r.res[f][c].por_turno; });
      return "<div class='fra-col " + (pior ? pior.nivel : "") + "'><h3>" + esc(fraNome(c)) + "</h3><div class='m'>" + dias + (ptur ? " turnos (horário)" : " dias com vendas") + " · " + fraEur(tot) + "</div>" +
        CR.map(function (f) { var x = r.res[f] && r.res[f][c]; return x ? "<div class='lin'><span>" + FRA_FAM[f] + "</span><span>" + fraEur(x.dia_c) + fraU(x) + " " + fraChip(x) + "</span></div>" : ""; }).join("") + "</div>";
    }).join("") + "</div></section>";
  h += "<section class='card'><h2 style='margin:0 0 4px'>Comparação por categoria</h2><p class='mut' style='margin:0 0 10px;font-size:13px'>Venda média por turno do horário (antes de julho, por dia com vendas), índice (100 = igual à mediana dos colegas) e diferença em euros por turno. Loja (tudo o que não é combustível), Tabaco, Cafetaria e a família LOJA são críticas: ✅ 90–110, ⚠️ 80–90, ❌ abaixo de 80. Restantes: ✅ 80–120, ⚠️ 65–80, ❌ abaixo de 65. Duas quinzenas seguidas em ⚠️ passam a ❌.</p>" +
    "<div class='sc fra-tab'><table><thead><tr><th>Categoria</th>" + cols.map(function (c) { return "<th>" + esc(fraNome(c)) + "</th>"; }).join("") + "<th>Diferença máx.</th></tr></thead><tbody>";
  r.familias.forEach(function (f) {
    var xs = cols.map(function (c) { return r.res[f][c]; }); if (!xs.some(function (x) { return x && x.valor_c; })) return;
    var vals = xs.filter(function (x) { return x && x.dias >= FRAUDE.MIN_DIAS; }).map(function (x) { return x.dia_c; }), ehc = CR.indexOf(f) >= 0;
    h += "<tr class='" + (ehc ? "crit" : "") + "'><td>" + esc(FRA_FAM[f] || f) + (ehc ? "<span class='fra-tag'>crítica</span>" : "") + "</td>" +
      xs.map(function (x) { return !x ? "<td>—</td>" : "<td><div><b>" + fraEur(x.dia_c) + "</b></div><div>" + fraChip(x) + "</div>" + (x.dif_dia_c === null ? "" : "<div class='d" + (x.dif_dia_c < 0 ? " neg" : "") + "'>" + fraEurs(x.dif_dia_c) + fraU(x) + "</div>") + "</td>"; }).join("") +
      "<td>" + (vals.length > 1 ? fraEur(Math.max.apply(null, vals) - Math.min.apply(null, vals)) : "—") + "</td></tr>";
  });
  h += "</tbody></table></div></section>";
  h += "<section class='fra-graf'><div class='card'><h2 style='margin:0 0 4px'>Evolução do índice</h2><p class='mut' style='margin:0 0 8px;font-size:13px'>Por período, na categoria escolhida. Faixa = zona normal; tracejado = limite do ❌.</p><div class='fra-cat' id='fraCatEv'></div><div id='fraEv'></div><div class='fra-leg' id='fraLeg'></div></div>" +
    "<div class='card'><h2 style='margin:0 0 4px'>Diferença face aos colegas</h2><p class='mut' style='margin:0 0 8px;font-size:13px'>Euros por turno (antes de julho, por dia), no período escolhido. À esquerda vende menos do que os colegas.</p><div class='fra-cat' id='fraCatDif'></div><div id='fraDif'></div></div></section>";
  h += fraSeccaoHorario(r);
  h += "<section class='card'><h2 style='margin:0 0 4px'>Alertas por decidir</h2><p class='mut' style='margin:0 0 10px;font-size:13px'>Um alerta é um indício, não uma prova. A decisão fica registada com data e quem decidiu, e nunca se apaga.</p><div id='fraAlertas'></div><div id='fraNota'></div></section>";
  h += "<p class='mut' style='font-size:12.5px'>Fonte: CBOS, Consulta de Vendas por Período com «Discriminar por colaborador», lida mês a mês e conferida com o «Total aplicado» de cada colaborador. A partir de julho de 2026 conta por turno do horário selado; antes, por dia com vendas. Ficam fora da comparação o terminal automático (Empregado OPT) e o administrador.</p>";
  $("#fraCorpo").innerHTML = h;

  fraBotoes("fraCatEv", "catEv"); fraBotoes("fraCatDif", "catDif");
  fraEvolucao(S); fraDiferenca(r, cols); fraAlertas(p, crit.concat(av), r.horario);
  $("#fraQ").onclick = function () { var id = fraPeriodos()[FRA.i].id; FRA.jan = "q"; var ps = fraPeriodos(); FRA.i = Math.max(0, ps.map(function (x) { return x.id.slice(0, 7); }).lastIndexOf(id.slice(0, 7))); fraDesenhar(); };
  $("#fraM").onclick = function () { var id = fraPeriodos()[FRA.i].id; FRA.jan = "m"; FRA.i = fraPeriodos().map(function (x) { return x.id; }).indexOf(id.slice(0, 7)); fraDesenhar(); };
  $("#fraAnt").onclick = function () { FRA.i--; fraDesenhar(); };
  $("#fraSeg").onclick = function () { FRA.i++; fraDesenhar(); };
}
function fraBotoes(id, chave) {
  var b = $("#" + id); b.innerHTML = FRAUDE.CRITICAS.concat(["COMBUSTIVEIS", "GAS"]).map(function (f) { return "<button data-f='" + f + "' aria-pressed='" + (FRA[chave] === f) + "'>" + FRA_FAM[f] + "</button>"; }).join("");
  b.onclick = function (e) { var f = e.target.dataset.f; if (f) { FRA[chave] = f; fraDesenhar(); } };
}
function fraEvolucao(S) {
  var f = FRA.catEv, W = 560, H = 250, L = 44, R = 14, T = 12, B = 34;
  var cols = []; S.forEach(function (s) { s.r.colaboradores.forEach(function (c) { if (cols.indexOf(c) < 0) cols.push(c); }); });
  var pts = cols.map(function (c) { return S.map(function (s, i) { var x = s.r.res[f] && s.r.res[f][c]; return x && x.indice !== null ? [i, x.indice] : null; }); });
  var all = []; pts.forEach(function (p) { p.forEach(function (q) { if (q) all.push(q[1]); }); });
  var lo = Math.max(0, Math.min.apply(null, [50].concat(all)) - 10), hi = Math.max.apply(null, [150].concat(all)) + 10;
  var X = function (i) { return L + (S.length < 2 ? 0 : i * (W - L - R) / (S.length - 1)); }, Y = function (v) { return T + (hi - v) * (H - T - B) / (hi - lo); };
  var Lm = FRAUDE.CRITICAS.indexOf(f) >= 0 ? FRAUDE.LIMITES.critica : FRAUDE.LIMITES.outra;
  var g = "<svg viewBox='0 0 " + W + " " + H + "' width='100%' role='img' aria-label='Evolução do índice de " + FRA_FAM[f] + "'>";
  g += "<rect x='" + L + "' y='" + Y(Lm.alto) + "' width='" + (W - L - R) + "' height='" + (Y(Lm.ok) - Y(Lm.alto)) + "' fill='var(--okb)'/>";
  for (var v = Math.ceil(lo / 25) * 25; v <= hi; v += 25) g += "<line x1='" + L + "' x2='" + (W - R) + "' y1='" + Y(v) + "' y2='" + Y(v) + "' stroke='var(--soft)'/><text x='" + (L - 6) + "' y='" + (Y(v) + 4) + "' text-anchor='end' font-size='11'>" + v + "</text>";
  g += "<line x1='" + L + "' x2='" + (W - R) + "' y1='" + Y(Lm.aviso) + "' y2='" + Y(Lm.aviso) + "' stroke='var(--bad)' stroke-dasharray='4 4'/>";
  S.forEach(function (s, i) { if (FRA.jan === "m" || /-1$/.test(s.p.id)) g += "<text x='" + X(i) + "' y='" + (H - 12) + "' text-anchor='middle' font-size='11'>" + FRA_MESES[+s.p.id.slice(5, 7) - 1].slice(0, 3) + "</text>"; });
  g += "<line x1='" + X(FRA.i) + "' x2='" + X(FRA.i) + "' y1='" + T + "' y2='" + (H - B) + "' stroke='var(--laranja)' opacity='.6'/>";
  cols.forEach(function (c, k) {
    var d = "", on = false, cor = FRA_CORES[k % FRA_CORES.length];
    pts[k].forEach(function (q) { if (!q) { on = false; return; } d += (on ? "L" : "M") + X(q[0]) + " " + Y(q[1]); on = true; });
    g += "<path d='" + d + "' fill='none' stroke='" + cor + "' stroke-width='2' stroke-linejoin='round'/>";
    pts[k].forEach(function (q) { if (q) g += "<circle cx='" + X(q[0]) + "' cy='" + Y(q[1]) + "' r='" + (q[0] === FRA.i ? 4.5 : 2.5) + "' fill='" + cor + "'><title>" + esc(fraNome(c)) + " · " + esc(fraRotulo(S[q[0]].p.id)) + ": " + q[1] + "</title></circle>"; });
  });
  $("#fraEv").innerHTML = g + "</svg>";
  $("#fraLeg").innerHTML = cols.map(function (c, k) { return "<span><i style='background:" + FRA_CORES[k % FRA_CORES.length] + "'></i>" + esc(fraNome(c)) + "</span>"; }).join("");
}
function fraDiferenca(r, cols) {
  var f = FRA.catDif, xs = cols.map(function (c) { return [c, r.res[f] && r.res[f][c]]; }).filter(function (a) { return a[1] && a[1].dif_dia_c !== null; });
  if (!xs.length) { $("#fraDif").innerHTML = "<p class='mut'>Amostra curta neste período.</p>"; return; }
  var W = 560, rowH = 40, T = 8, H = T + xs.length * rowH + 24, L = 130, R = 80, m = Math.max.apply(null, [1].concat(xs.map(function (a) { return Math.abs(a[1].dif_dia_c); })));
  var Z = L + (W - L - R) / 2, S = function (v) { return v * (W - L - R) / 2 / m; };
  var g = "<svg viewBox='0 0 " + W + " " + H + "' width='100%' role='img' aria-label='Diferença face aos colegas em " + FRA_FAM[f] + "'><line x1='" + Z + "' x2='" + Z + "' y1='" + T + "' y2='" + (H - 20) + "' stroke='var(--mut)'/>";
  xs.forEach(function (a, i) {
    var x = a[1], y = T + i * rowH + 8, w = S(x.dif_dia_c), cor = x.nivel === "critico" ? "var(--bad)" : x.nivel === "aviso" ? "var(--wn)" : x.dif_dia_c < 0 ? "var(--mut)" : "var(--ok)";
    g += "<text x='" + (L - 10) + "' y='" + (y + 16) + "' text-anchor='end' font-size='12.5' style='fill:var(--fg)'>" + esc(fraNome(a[0])) + "</text>";
    g += "<rect x='" + (w < 0 ? Z + w : Z) + "' y='" + y + "' width='" + Math.abs(w) + "' height='22' rx='3' fill='" + cor + "' opacity='.85'/>";
    g += "<text x='" + (W - 4) + "' y='" + (y + 15) + "' text-anchor='end' font-size='12' font-weight='600' style='fill:var(--fg)'>" + fraEurs(x.dif_dia_c) + fraU(x) + "</text>";
  });
  $("#fraDif").innerHTML = g + "<text x='" + Z + "' y='" + (H - 4) + "' text-anchor='middle' font-size='11'>0 = mediana dos colegas</text></svg>";
}
/* Horário × vendas: o horário selado contra os dias em que cada um vendeu no CBOS */
function fraDatas(L) { return L.map(function (d) { return d.slice(8, 10) + "/" + d.slice(5, 7); }).join(", "); }
function fraSeccaoHorario(r) {
  var H = r.horario, part = FRA.dados.partilha;
  if (!H) return "<section class='card'><h2 style='margin:0 0 4px'>Horário × vendas</h2><p class='mut' style='margin:0;font-size:13px'>Sem horário selado para este período (as contas usam o horário a partir de julho de 2026).</p></section>";
  var cols = Object.keys(H.det).filter(function (c) { return FRAUDE.SEM_COLABORADOR.indexOf(c) < 0; }).sort(function (a, b) { return fraNome(a).localeCompare(fraNome(b), "pt"); });
  var notas = Object.keys(part).filter(function (k) { return part[k].length > 1; }).map(function (k) { return fraNome(k) + " inclui os turnos de " + part[k].filter(function (n) { return n !== fraNome(k); }).join(", ") + " (vende com o mesmo utilizador no CBOS)"; });
  return "<section class='card'><h2 style='margin:0 0 4px'>Horário × vendas</h2><p class='mut' style='margin:0 0 10px;font-size:13px'>Turnos do horário selado contra os dias com vendas no CBOS. M ou T = 1 turno; MT = 2 em Santo Tirso e não conta em Penafiel. Dia escalado em que só vendeu na outra estação conta lá." + (notas.length ? " " + esc(notas.join(". ")) + "." : "") + "</p>" +
    "<div class='sc fra-tab'><table><thead><tr><th>Colaborador</th><th>Turnos</th><th>Dias certos</th><th style='text-align:left'>Escalado sem vendas</th><th style='text-align:left'>Vendas fora da escala</th><th style='text-align:left'>Escalado aqui, vendeu na outra estação</th></tr></thead><tbody>" +
    cols.map(function (c) { var x = H.det[c];
      return "<tr><td>" + esc(fraNome(c)) + "</td><td>" + x.turnos + "</td><td>" + x.certos + "</td><td style='text-align:left'>" + (x.semVendas.length ? "<span class='fra-chip " + (x.semVendas.length >= 2 ? "critico" : "aviso") + "'>" + x.semVendas.length + "</span> " + fraDatas(x.semVendas) : "—") +
        "</td><td style='text-align:left'>" + (x.foraEscala.length ? "<span class='fra-chip " + (x.foraEscala.length >= 3 ? "aviso" : "info") + "'>" + x.foraEscala.length + "</span> " + fraDatas(x.foraEscala) : "—") +
        "</td><td style='text-align:left'>" + (x.naOutra.length ? "<span class='fra-chip info'>" + x.naOutra.length + "</span> " + fraDatas(x.naOutra) : "—") + "</td></tr>"; }).join("") +
    "</tbody></table></div></section>";
}
function fraAlertas(p, al, H) {
  al.sort(function (a, b) { return FRA_PESO[b[2].nivel] - FRA_PESO[a[2].nivel] || a[2].indice - b[2].indice; });
  var itens = al.map(function (a) { var x = a[2];
    return {per: p.id, c: a[1], f: a[0], nivel: x.nivel, chip: fraChip(x), t: fraNome(a[1]) + " · " + FRA_FAM[a[0]],
      x: fraEur(x.dia_c) + (x.por_turno ? " por turno" : " por dia") + " contra " + fraEur(x.ref_dia_c) + " dos colegas (" + fraEurs(x.dif_dia_c) + fraU(x) + ", " + fraEurs(x.dif_dia_c * x.dias) + " em " + x.dias + (x.por_turno ? " turnos)" : " dias)") + (x.repetido ? (FRA.jan === "q" ? " · segunda quinzena seguida" : " · segundo mês seguido") : "")}; });
  if (H) Object.keys(H.det).forEach(function (c) { var x = H.det[c]; if (FRAUDE.SEM_COLABORADOR.indexOf(c) >= 0) return;
    if (x.semVendas.length >= 2) itens.push({per: p.id, c: c, f: "horario", nivel: "critico", chip: "<span class='fra-chip critico'>❌ " + x.semVendas.length + " dias</span>",
      t: fraNome(c) + " · Escalado sem vendas", x: "Escalado no horário sem nenhuma venda com o seu utilizador no CBOS: " + fraDatas(x.semVendas)});
    else if (x.foraEscala.length >= 3) itens.push({per: p.id, c: c, f: "horario", nivel: "aviso", chip: "<span class='fra-chip aviso'>⚠️ " + x.foraEscala.length + " dias</span>",
      t: fraNome(c) + " · Vendas fora da escala", x: "Vendeu em dias em que não estava no horário: " + fraDatas(x.foraEscala)}); });
  FRA.dados.reg.filter(function (n) { return n.tipo !== "decisao" && (p.id.indexOf(n.periodo) === 0 || n.periodo.indexOf(p.id) === 0); }).forEach(function (n) {
    itens.push({per: n.periodo, c: n.colaborador, f: n.tipo, nivel: "critico", chip: "<span class='fra-chip critico'>❌ " + (n.tipo === "desconto" ? "Desconto" : "Acerto") + "</span>",
      t: fraNome(n.colaborador) + " · " + (n.tipo === "desconto" ? "Desconto ao talão" : "Devolução ou anulação"), x: n.texto + " · " + fraRotulo(n.periodo)});
  });
  $("#fraAlertas").innerHTML = itens.length ? itens.map(function (a, i) {
    var d = fraDecisao(a.per, a.c, a.f);
    return "<div class='fra-al " + (d ? "feito" : a.nivel) + "'>" + a.chip + "<div><div class='t'>" + esc(a.t) + "</div><div class='x'>" + esc(a.x) + "</div>" +
      (d ? "<div class='x'>✔ " + FRA_DEC[d.decisao] + " em " + dmy(d.em.slice(0, 10)) + (d.texto ? ": " + esc(d.texto) : "") + "</div>" : "") + "</div>" +
      "<div class='bt'>" + Object.keys(FRA_DEC).map(function (k) { return "<button class='btn' data-i='" + i + "' data-d='" + k + "'>" + FRA_DEC[k] + "</button>"; }).join("") + "</div></div>";
  }).join("") : "<p class='mut'>✅ Sem alertas nas categorias críticas neste período.</p>";
  $$("#fraAlertas button").forEach(function (b) { b.onclick = function () { fraPedirNota(itens[+b.dataset.i], b.dataset.d); }; });
}
/* decisão com nota, escrita na própria página (sem janelas do navegador) */
function fraPedirNota(a, dec) {
  $("#fraNota").innerHTML = "<div class='card' style='border:2px solid var(--laranja);padding:12px;display:grid;gap:8px'><b>" + FRA_DEC[dec] + " · " + esc(a.t) + "</b>" +
    "<label for='fraTxt' class='mut' style='font-size:13px'>Nota (o que viu ou falou com o colaborador)</label><textarea id='fraTxt' rows='3' style='width:100%'></textarea>" +
    "<div style='display:flex;gap:8px'><button class='btn p' id='fraGravar'>Gravar decisão</button><button class='btn' id='fraCanc'>Cancelar</button><span id='fraSt' class='mut'></span></div></div>";
  $("#fraTxt").focus();
  $("#fraCanc").onclick = function () { $("#fraNota").innerHTML = ""; };
  $("#fraGravar").onclick = async function () {
    var reg = {estacao: EST, periodo: a.per, colaborador: a.c, familia: a.f, tipo: "decisao", decisao: dec, texto: $("#fraTxt").value.trim() || null};
    $("#fraSt").textContent = "A gravar…";
    var r = await sb.from("msb_fraude_registos").insert(reg).select().single();
    if (r.error) { $("#fraSt").className = "bad"; $("#fraSt").textContent = falhou(r.error); return; }
    FRA.dados.reg.push(r.data); $("#fraNota").innerHTML = ""; fraDesenhar();
  };
}
