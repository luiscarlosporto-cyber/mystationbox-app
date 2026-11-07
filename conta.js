/* mystationbox · Conta do mês (área Resultados, dono 07/11/2026): receitas (margens) − despesas por famílias = resultado.
 * Os números vêm de dadosLucro (lucro.js) e de DESPESAS.custosDoMes: é a mesma conta do Lucro, arrumada por famílias. Tudo sem IVA.
 * Usa: sb, EST, MES, $, $$, esc, fmt, addMes, ir, dadosLucro, lerCustos, DESPESAS, falhou. */
var CDM = {mes: null};
var ICONE_FAM = {Pessoal: "👥", Repsol: "⛽", "Instalações": "🏠", "Serviços": "📄", Outros: "📦"};

function cdmEur(c) { return fmt(Math.round(c)) + " €"; }
function cdmBarra(v, top, cor) { return "<div class='cdmBar'><i style='width:" + Math.max(0, Math.min(100, top ? Math.abs(v) / top * 100 : 0)).toFixed(1) + "%;background:" + cor + "'></i></div>"; }

/* O que ainda falta para o mês estar fechado: mostra-se, não se inventa */
async function cdmPorFechar(m, L) {
  var f = [], r = await sb.from("msb_despesas").select("categoria,estado").eq("estacao", EST).eq("mes", m); if (r.error) throw r.error;
  var D = r.data || [], conf = function (c) { return D.some(function (d) { return d.categoria === c && d.estado === "confirmada"; }); };
  var tratar = D.filter(function (d) { return d.estado === "por_confirmar" || d.estado === "por_preencher"; }).length;
  if (tratar) f.push(tratar + " despesa(s) por confirmar ou preencher");
  ["Renda", "Contabilidade"].forEach(function (c) { if (!conf(c) && !L.C.some(function (x) { return x.nome.toLowerCase() === c.toLowerCase(); })) f.push(c + " sem despesa confirmada neste mês"); });
  var ss = L.CM.linhas.find(function (l) { return l.nome === DESPESAS.SS; });
  if (ss && ss.origem === "estimada") f.push("Segurança Social estimada (23,75 % da retida) até chegar a guia");
  if (L.fator > 1) f.push("Mês ainda a decorrer: vendas até " + dmy(L.V.ate));
  if (L.falta.length) f.push("Margens por definir: " + L.falta.join(", "));
  return f;
}

async function carregarConta() {
  var box = $("#cdmCorpo"); if (!box) return; box.innerHTML = "<div class='mut'>A carregar…</div>";
  try {
    if (!CDM.mes) { var ul = await sb.from("msb_vendas_mes").select("mes").eq("estacao", EST).order("mes", {ascending: false}).limit(1); CDM.mes = (ul.data && ul.data[0] && ul.data[0].mes) || MES; }
    var m = CDM.mes; $("#cdmMes").value = m;
    var L = await dadosLucro(m);
    if (!L) { box.innerHTML = "<div class='vazio'>Sem relatório de vendas deste mês, por isso ainda não há receitas. Carregue-o em Resultados → Lucro.</div>"; return; }
    var rec = L.mC * 100 + L.mL, desp = L.custos * 100, extra = [];
    if (L.TMR) { extra.push({nome: "My Repsol", valor_c: L.TMR.myrepsol_c, origem: "real"}); if (L.TMR.combustiveis_c) extra.push({nome: "Taxa combustíveis", valor_c: L.TMR.combustiveis_c, origem: "real"}); }
    var parcial = Math.min(1, L.dias / L.diasMes), F = DESPESAS.porFamilia(L.CM.linhas.concat(extra)), res = L.res * 100, falta = await cdmPorFechar(m, L);
    var topD = Math.max.apply(null, F.map(function (f) { return Math.abs(f.valor_c); }).concat([1])), topR = Math.max(L.mC * 100, L.mL, 1);
    var etiqueta = function (l) { return l.origem === "fixo" ? " <span class='tag t-at'>fixo</span>" : l.origem === "estimada" ? " <span class='tag t-at'>estimada</span>" : l.valor_c < 0 ? " <span class='tag t-ok'>crédito</span>" : ""; };
    var h = "<div class='cdmKs'>" +
      "<div class='cdmK'><small>Receitas (margens, sem IVA)</small><b>" + cdmEur(rec) + "</b><p>Combustível e loja</p></div>" +
      "<div class='cdmK'><small>Despesas (sem IVA)</small><b>" + cdmEur(desp * parcial) + "</b><p>" + F.length + " famílias" + (parcial < 1 ? " · proporcional a " + L.dias + " de " + L.diasMes + " dias" : "") + "</p></div>" +
      "<div class='cdmK r'><small>" + (parcial < 1 ? "Resultado até " + dmy(L.V.ate).slice(0, 5) : "Resultado do mês") + "</small><b style='color:" + (res >= 0 ? "#7CE3A0" : "#FF9B85") + "'>" + cdmEur(res) + "</b><p>" + (falta.length ? "Provisório: " + falta.length + " coisa(s) por fechar ⚠️" : "Mês fechado ✅") + "</p></div></div>";
    h += "<div class='cdmG'><section class='card cdmB'><h2>Receitas <span>" + cdmEur(rec) + "</span></h2>" +
      "<div class='cdmF'><button class='cdmFh' data-ir='luc'><span>⛽ Combustível</span><span>" + cdmEur(L.mC * 100) + "</span></button>" + cdmBarra(L.mC * 100, topR, "var(--laranja)") +
      L.comb.map(function (x) { return "<div class='cdmL'><span>" + esc(x.p) + "</span><span>" + cdmEur(x.mg * 100) + "</span></div>"; }).join("") + "</div>" +
      "<div class='cdmF'><button class='cdmFh' data-ir='luc'><span>🛍️ Loja</span><span>" + cdmEur(L.mL) + "</span></button>" + cdmBarra(L.mL, topR, "var(--laranja)") +
      L.loja.map(function (x) { return "<div class='cdmL'><span>" + esc(x.cat) + "</span><span>" + (x.mg == null ? "por definir" : cdmEur(x.mg)) + "</span></div>"; }).join("") + "</div></section>";
    h += "<section class='card cdmB'><h2>Despesas <span>" + cdmEur(desp) + "</span></h2>" + F.map(function (f) {
      return "<div class='cdmF'><button class='cdmFh' data-ir='dsp'><span>" + (ICONE_FAM[f.nome] || "📦") + " " + esc(f.nome) + "</span><span>" + cdmEur(f.valor_c) + "</span></button>" + cdmBarra(f.valor_c, topD, "var(--azul)") +
        f.linhas.map(function (l) { return "<div class='cdmL'><span>" + esc(l.nome) + etiqueta(l) + (l.guia_c != null ? "<small>guia " + cdmEur(l.guia_c) + " − retida " + cdmEur(l.retida_c) + "</small>" : l.retida_c ? "<small>retida aos trabalhadores " + cdmEur(l.retida_c) + "</small>" : "") + "</span><span>" + cdmEur(l.valor_c) + "</span></div>"; }).join("") + "</div>";
    }).join("") + (parcial < 1 ? "<p class='mut' style='font-size:12.5px;margin:6px 0 0'>No resultado entram " + L.dias + " de " + L.diasMes + " dias destas despesas.</p>" : "") + "</section></div>";
    h += "<section class='card cdmB'><h2>Por fechar neste mês</h2>" + (falta.length ? "<ul class='cdmFalta'>" + falta.map(function (t) { return "<li>⚠️ " + esc(t) + "</li>"; }).join("") + "</ul>" : "<p>✅ Nada por fechar.</p>") +
      "<p class='mut' style='font-size:12.5px;margin:6px 0 0'>Sem IVA, como no Lucro. Tocar numa família abre o detalhe. A Segurança Social conta só a parte da empresa; o IRS das guias não é custo (já está no salário, na renda e nas faturas).</p></section>";
    box.innerHTML = h;
    $$("#cdmCorpo [data-ir]").forEach(function (b) { b.onclick = function () { if (b.dataset.ir === "luc") $("#lMes").value = m; ir(b.dataset.ir); }; });
  } catch (e) { box.innerHTML = "<div class='bad'>" + esc(typeof falhouLucro === "function" ? falhouLucro(e) : falhou(e)) + "</div>"; }
}
$("#cdmMes").onchange = function () { CDM.mes = this.value; carregarConta(); };
$("#cdmAnt").onclick = function () { CDM.mes = addMes(CDM.mes || MES, -1); carregarConta(); };
$("#cdmSeg").onclick = function () { CDM.mes = addMes(CDM.mes || MES, 1); carregarConta(); };
