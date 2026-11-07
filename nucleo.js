/* mystationbox · Desempenho → Livro de movimentos (núcleo financeiro, Fase 2, 07/11/2026). Só administrador.
 * O livro (msb_movimentos) é gerado na base de dados a partir das fontes que já existem (turnos, créditos MB, transferências,
 * extrato do banco, despesas confirmadas) pela função msb_nucleo_gerar; aqui só se lê, se manda atualizar e se fecha o mês.
 * Um movimento nunca se altera: se a fonte mudar, entra um estorno e um movimento novo. Mês fechado não aceita mudanças.
 * A conferência (msb_nucleo_conferir) compara cada total do livro com a sua fonte, ao cêntimo. Começa em setembro de 2026. */
"use strict";
var NUC = {mes: null, movs: [], cats: {}, per: null, conf: []};
var NUC_INICIO = "2026-09";
var NUC_TIPOS = {venda: "Vendas", recebimento: "Recebimentos", diferenca: "Diferenças de caixa", liquidacao: "Liquidado", deposito: "Depósitos",
  gasto: "Gastos", rendimento: "Rendimentos", pagamento: "Pagamentos"};
var NUC_MEIOS = {numerario: "numerário", multibanco: "Multibanco", solred: "Solred", solred_presente: "Solred presente", fornecedor: "fornecedor", cheque: "cheque", banco: "banco"};
function falhouNucleo(e) { var m = falhou(e); return /msb_movimentos|msb_nucleo|does not exist|schema cache|42P01|42883|PGRST20/i.test(m + " " + (e && e.code || "")) ? "O núcleo financeiro ainda não está ativo na base de dados." : m; }
function nucAviso(t, ok) { var s = $("#nucSt"); if (s) { s.className = "st " + (ok ? "ok" : "bad"); s.textContent = (ok ? "✔ " : "⚠ ") + t; } }
function nucMesPt(m) { return new Date(m + "-15").toLocaleDateString("pt-PT", {month: "long", year: "numeric"}); }

async function carregarNucleo() {
  if (!NUC.mes) NUC.mes = addMes(mesHoje(), -1);
  if (NUC.mes < NUC_INICIO) NUC.mes = NUC_INICIO;
  var box = $("#nucCorpo"); box.innerHTML = "<div class='mut'>A carregar…</div>";
  try {
    var c = await sb.from("msb_categorias").select("*"); if (c.error) throw c.error;
    NUC.cats = {}; (c.data || []).forEach(function (x) { NUC.cats[x.codigo] = x; });
    var m = await sb.from("msb_movimentos").select("*").eq("estacao", EST).eq("mes", NUC.mes).order("dia").order("id").limit(10000); if (m.error) throw m.error;
    var p = await sb.from("msb_periodos").select("*").eq("estacao", EST).eq("mes", NUC.mes).maybeSingle(); if (p.error) throw p.error;
    NUC.movs = m.data || []; NUC.per = p.data;
    NUC.conf = [];
    if (NUC.movs.length) { var k = await sb.rpc("msb_nucleo_conferir", {p_estacao: EST, p_mes: NUC.mes}); if (k.error) throw k.error; NUC.conf = k.data || []; }
    desenharNucleo();
  } catch (e) { box.innerHTML = "<div class='bad'>" + esc(falhouNucleo(e)) + "</div>"; }
}

/* soma por chave; todos os movimentos contam, estornos incluídos */
function nucSomar(filtro, chave) {
  var r = {}; NUC.movs.forEach(function (m) { if (!filtro(m)) return; var k = chave(m); r[k] = (r[k] || 0) + m.valor_c; }); return r;
}
function nucTabela(titulo, somas, nome) {
  var ks = Object.keys(somas).filter(function (k) { return somas[k]; }); if (!ks.length) return "";
  ks.sort(function (a, b) { return Math.abs(somas[b]) - Math.abs(somas[a]); });
  var tot = ks.reduce(function (s, k) { return s + somas[k]; }, 0);
  return "<div class='sc'><table><thead><tr><th class='l'>" + esc(titulo) + "</th><th>Valor</th></tr></thead><tbody>" +
    ks.map(function (k) { return "<tr><td class='l'>" + esc(nome(k)) + "</td><td>" + fmt(somas[k]) + "</td></tr>"; }).join("") +
    (ks.length > 1 ? "<tr><td class='l'><b>Total</b></td><td><b>" + fmt(tot) + "</b></td></tr>" : "") + "</tbody></table></div>";
}
function desenharNucleo() {
  var fechado = NUC.per && NUC.per.estado === "fechado", cat = function (k) { return (NUC.cats[k] || {}).nome || k; };
  var falhas = NUC.conf.filter(function (c) { return Number(c.fonte_c) !== Number(c.nucleo_c); }).length;
  var h = "<div class='bar'><button class='btn' id='nucAnt' aria-label='Mês anterior'>‹</button><input type='month' id='nucMes' min='" + NUC_INICIO + "' value='" + esc(NUC.mes) + "'><button class='btn' id='nucSeg' aria-label='Mês seguinte'>›</button>" +
    "<button class='btn p' id='nucGerar'" + (fechado ? " disabled title='Mês fechado'" : "") + ">Atualizar a partir das fontes</button>" +
    (NUC.movs.length ? "<button class='btn' id='nucFechar'>" + (fechado ? "Reabrir o mês" : "Fechar o mês") + "</button>" : "") + "<span id='nucSt' class='st'></span></div>";
  h += "<div class='card' style='padding:14px'><b>" + esc(nucMesPt(NUC.mes)) + "</b> · " + (fechado ? "🔒 fechado por " + esc(NUC.per.alterado_por || "") + " em " + dmy(NUC.per.alterado_em) : "aberto") +
    (NUC.per && NUC.per.gerado_em ? " · atualizado em " + dmy(NUC.per.gerado_em) + " " + NUC.per.gerado_em.slice(11, 16) : "") +
    "<p class='mut' style='margin:6px 0 0;font-size:13px'>O livro junta numa só lista os turnos, os créditos da Repsol, o banco e as despesas confirmadas. Atualize depois de carregar documentos novos. Um mês fechado já não muda.</p></div>";
  if (!NUC.movs.length) { h += "<div class='card' style='padding:14px'>Ainda não há movimentos deste mês. Carregue em «Atualizar a partir das fontes».</div>"; }
  else {
    h += "<div class='card' style='padding:14px;display:grid;gap:8px'><h2 style='margin:0'>" + (falhas ? "❌ Conferência: " + falhas + " diferença(s)" : "✅ Conferência: tudo igual às fontes") + "</h2>" +
      "<div class='sc'><table><thead><tr><th class='l'>Indicador</th><th>Nas fontes</th><th>No livro</th><th></th></tr></thead><tbody>" +
      NUC.conf.map(function (c) { var ok = Number(c.fonte_c) === Number(c.nucleo_c); return "<tr><td class='l'>" + esc(c.indicador) + "</td><td>" + fmt(Number(c.fonte_c)) + "</td><td>" + fmt(Number(c.nucleo_c)) + "</td><td>" + (ok ? "✅" : "❌") + "</td></tr>"; }).join("") +
      "</tbody></table></div>" + (falhas ? "<p class='bad' style='margin:0'>Uma diferença quer dizer que a fonte mudou depois da última atualização: carregue em «Atualizar a partir das fontes».</p>" : "") + "</div>";
    var bloco = function (t, conteudo) { return conteudo ? "<div class='card' style='padding:14px;display:grid;gap:8px'><h2 style='margin:0'>" + esc(t) + "</h2>" + conteudo + "</div>" : ""; };
    h += bloco("Caixa dos turnos", nucTabela("Recebido por meio", nucSomar(function (m) { return m.tipo === "recebimento" && m.meio !== "banco"; }, function (m) { return m.meio; }), function (k) { return "Recebido em " + (NUC_MEIOS[k] || k); }) +
      nucTabela("Vendas e diferenças", nucSomar(function (m) { return m.tipo === "venda" || m.tipo === "diferenca"; }, function (m) { return m.categoria; }), cat));
    h += bloco("Liquidado pela Repsol (fora do banco)", nucTabela("Meio", nucSomar(function (m) { return m.tipo === "liquidacao" && m.meio !== "banco"; }, function (m) { return m.meio; }), function (k) { return "Créditos " + (NUC_MEIOS[k] || k); }));
    h += bloco("Banco · entradas", nucTabela("Categoria", nucSomar(function (m) { return m.meio === "banco" && ["deposito", "liquidacao", "rendimento", "recebimento"].indexOf(m.tipo) >= 0; }, function (m) { return m.categoria; }), cat));
    h += bloco("Banco · saídas", nucTabela("Categoria", nucSomar(function (m) { return m.meio === "banco" && (m.tipo === "pagamento" || m.tipo === "gasto"); }, function (m) { return m.categoria; }), cat));
    h += bloco("Gastos com documento (despesas confirmadas)", nucTabela("Categoria", nucSomar(function (m) { return m.tipo === "gasto" && !m.meio; }, function (m) { return m.categoria; }), cat));
    var porCl = NUC.movs.filter(function (m) { return m.categoria === "por_classificar"; }).reduce(function (s, m) { return s + m.valor_c; }, 0);
    if (porCl) h += "<div class='aviso'><p>⚠ " + fmt(porCl) + " € do banco ainda estão por classificar. Classifique-os em Tesouraria → Banco e depois atualize aqui.</p></div>";
    h += "<details class='card' style='padding:14px'><summary><b>Todos os movimentos</b> <span class='mut'>(" + NUC.movs.length + ")</span></summary><div class='sc' style='margin-top:8px'><table><thead><tr><th class='l'>Data</th><th class='l'>Tipo</th><th class='l'>Categoria</th><th class='l'>Descrição</th><th>Valor</th><th class='l'>Origem</th></tr></thead><tbody>" +
      NUC.movs.map(function (m) { return "<tr" + (m.estorno_de || m.estado === "estornado" ? " class='mut'" : "") + "><td class='l'>" + dmy(m.dia) + "</td><td class='l'>" + esc(NUC_TIPOS[m.tipo] || m.tipo) + (m.meio ? " · " + esc(NUC_MEIOS[m.meio] || m.meio) : "") + "</td><td class='l'>" + esc(cat(m.categoria)) + "</td><td class='l'>" + esc(m.descricao || "") + (m.estorno_de ? " (estorno)" : m.estado === "estornado" ? " (estornado)" : "") + "</td><td>" + fmt(m.valor_c) + "</td><td class='l mut' style='font-size:12px'>" + esc(m.origem.replace("msb_", "")) + "</td></tr>"; }).join("") +
      "</tbody></table></div></details>";
  }
  $("#nucCorpo").innerHTML = h;
  var mudar = function (m) { if (m < NUC_INICIO) return nucAviso("O livro começa em setembro de 2026."); NUC.mes = m; carregarNucleo(); };
  $("#nucAnt").onclick = function () { mudar(addMes(NUC.mes, -1)); };
  $("#nucSeg").onclick = function () { mudar(addMes(NUC.mes, 1)); };
  $("#nucMes").onchange = function () { if (this.value) mudar(this.value); };
  $("#nucGerar").onclick = gerarNucleo;
  if ($("#nucFechar")) $("#nucFechar").onclick = function () { fecharMesNucleo(!fechado); };
}
async function gerarNucleo() {
  var b = $("#nucGerar"); b.disabled = true; b.textContent = "A atualizar…";
  try {
    var r = await sb.rpc("msb_nucleo_gerar", {p_estacao: EST, p_mes: NUC.mes}); if (r.error) throw r.error;
    await carregarNucleo();
    nucAviso(r.data.novos || r.data.estornos ? r.data.novos + " movimentos novos" + (r.data.estornos ? ", " + r.data.estornos + " estornos (a fonte mudou)" : "") + "." : "Nada mudou nas fontes.", true);
  } catch (e) { b.disabled = false; b.textContent = "Atualizar a partir das fontes"; nucAviso(falhouNucleo(e)); }
}
async function fecharMesNucleo(fechar) {
  var t = fechar ? "Fechar " + nucMesPt(NUC.mes) + "? Depois de fechado, o livro deste mês já não muda até o reabrir." : "Reabrir " + nucMesPt(NUC.mes) + "? Fica registado quem reabriu e quando.";
  if (!(await msbConfirma(t))) return;
  try {
    var r = await sb.rpc("msb_periodo_estado", {p_estacao: EST, p_mes: NUC.mes, p_estado: fechar ? "fechado" : "aberto"}); if (r.error) throw r.error;
    await carregarNucleo(); nucAviso(fechar ? "Mês fechado." : "Mês reaberto.", true);
  } catch (e) { nucAviso(falhouNucleo(e)); }
}
