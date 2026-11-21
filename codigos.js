"use strict";
/* Códigos novos dos fornecedores (dono, 18/11/2026): a fatura da Logista traz um código que o OCTAN AI ainda não liga a um artigo
   Repsol. Confirma-se aqui (Painel → OCTAN AI) em vez do painel local do PC. Para cada código mostram-se os artigos do catálogo
   mais parecidos; o dono escolhe um (ou escreve o código de 8 algarismos) e confirma. O OCTAN AI aplica no PC na volta seguinte (de 2 em 2 horas)
   e a fatura grava-se na corrida seguinte. Uma confirmação fica registada (quem e quando) e não se muda aqui. */
var COD_PRODUTOS = null;

/* Palavras de um nome, sem acentos nem sinais, para comparar a descrição da fatura com o catálogo */
function codPalavras(t) {
  return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().split(" ")
    .filter(function (p) { return p.length > 1 && !/^(DE|DA|DO|COM|THE)$/.test(p); });
}
/* Os artigos mais parecidos: conta as palavras em comum (com o mesmo começo de 4 letras) e prefere a proposta do OCTAN AI */
function codParecidos(desc, produtos, proposta, n) {
  var a = codPalavras(desc), raiz = function (p) { return p.slice(0, 4); }, ra = a.map(raiz);
  return produtos.map(function (p) {
    var b = codPalavras(p.name), comuns = b.filter(function (x) { return ra.indexOf(raiz(x)) >= 0; }).length;
    var nota = comuns / Math.max(1, Math.min(a.length, b.length)) + (p.repsol_code === proposta ? 1 : 0);
    return {p: p, nota: nota, comuns: comuns};
  }).filter(function (x) { return x.comuns >= 2 || x.p.repsol_code === proposta; })
    .sort(function (x, y) { return y.nota - x.nota || String(x.p.name).localeCompare(y.p.name); })
    .slice(0, n || 5).map(function (x) { return x.p; });
}
/* Catálogo do CBOS (19/11/2026, dono: «sempre que carrego novo catálogo a app deverá verificar estes erros»): os artigos do CBOS
   da estação entram nas propostas, com o PVP do CBOS; os que só existem no CBOS (ainda não estão no Stock) também aparecem.
   O que saiu do export («Fora do export») não conta. catalogo = linhas de msb_catalogo_cbos de uma estação. */
function codJuntar(produtos, catalogo) {
  var C = {}, fora = "Fora do export";
  (catalogo || []).forEach(function (x) { if (x.estado !== fora) C[x.poscode] = x; });
  var out = produtos.map(function (p) { var c = C[p.repsol_code]; return c ? Object.assign({}, p, {cbos: c}) : p; }), vistos = {};
  produtos.forEach(function (p) { vistos[p.repsol_code] = 1; });
  Object.keys(C).forEach(function (k) { if (!vistos[k]) out.push({repsol_code: k, name: C[k].nome, cbos: C[k], soCbos: true}); });
  return out;
}
/* Verificação de um código novo contra o catálogo do CBOS: o artigo do CBOS mais parecido (ou o da proposta), o PVP e se bate com o da fatura */
function codNoCatalogo(c, juntos) {
  var noCbos = juntos.filter(function (p) { return p.cbos; }), m = codParecidos(c.descricao, noCbos, c.proposta, 1)[0];
  if (!m) return {estado: "nao_existe"};
  var pvp = m.cbos.pvp_c || null;
  return {estado: !pvp ? "sem_preco" : c.pvp_fatura_c > 0 && pvp !== c.pvp_fatura_c ? "pvp_diferente" : "existe", artigo: m, pvp_c: pvp};
}
async function codCatalogo() {
  var r = await lerTudo(function () { return sb.from("msb_catalogo_cbos").select("estacao,poscode,nome,categoria,estado,pvp_c,importado_em").order("estacao").order("poscode"); }, ["estacao", "poscode"]);
  if (r.error) throw r.error;
  var porEst = {};
  (r.data || []).forEach(function (x) { (porEst[x.estacao] = porEst[x.estacao] || []).push(x); });
  return porEst;
}
async function codProdutos() {
  if (COD_PRODUTOS) return COD_PRODUTOS;
  var r = await lerTudo(function () { return sb.from("products").select("id,name,category,repsol_code"); }, ["id"]);
  if (r.error) throw r.error;
  return (COD_PRODUTOS = (r.data || []).filter(function (p) { return /^\d{8}$/.test(p.repsol_code || ""); }));
}
/* Preço de venda de cada artigo (cêntimos, com IVA) numa leitura do CBOS: montante ÷ quantidade. linhas = [código, nome, qtd, montante €] */
function codPrecoVenda(linhas) {
  var m = {};
  (linhas || []).forEach(function (l) { if (l && l[2] > 0 && l[3] > 0) m[String(l[0])] = Math.round(l[3] * 100 / l[2]); });
  return m;
}
/* Margem sobre o preço de venda, em %, com uma casa (compra em milésimos com o IVA que a fatura cobra, venda em cêntimos com IVA) */
function codMargem(compra_m, venda_c) {
  if (!(compra_m > 0) || !(venda_c > 0)) return null;
  return Math.round((venda_c * 10 - compra_m) / (venda_c * 10) * 1000) / 10;
}
/* A leitura do CBOS mais recente de cada estação (Painel de cada dia, ou um pedido de vendas), para o preço de venda atual */
async function codVendas() {
  var r = await sb.from("msb_pedidos").select("estacao,criado,linhas").eq("estado", "feito").order("criado", {ascending: false}).limit(12);
  if (r.error) throw r.error;
  var V = {};
  (r.data || []).forEach(function (p) {
    if (!(p.linhas || []).length) return;
    var e = V[p.estacao] || (V[p.estacao] = {criado: p.criado, precos: {}});
    var m = codPrecoVenda(p.linhas);
    Object.keys(m).forEach(function (k) { if (!(k in e.precos)) e.precos[k] = m[k]; });   // a mais recente manda
  });
  return V;
}
function codEur(c) { return fmt(c) + " €"; }
/* Devolve {html, ligar}. Só o administrador vê; sem códigos por confirmar não mostra nada. */
async function codigosNovos(recarregar) {
  if (typeof ADMIN === "undefined" || !ADMIN) return {html: "", ligar: function () {}};
  var r = await sb.from("msb_codigos_novos").select("*").eq("estado", "por").order("criado");
  if (r.error) throw r.error;
  var L = r.data || [];
  if (!L.length) return {html: "", ligar: function () {}};
  var P0 = await codProdutos(), V = {}, CAT = {};
  try { V = await codVendas(); } catch (e) { V = {}; }   // sem leituras do CBOS, confirma-se na mesma, só sem o preço de venda
  try { CAT = await codCatalogo(); } catch (e) { CAT = {}; }   // sem o catálogo do CBOS, as propostas vêm só do Stock
  var P = P0, juntosDe = function (est) { return CAT[est] ? codJuntar(P0, CAT[est]) : P0; };
  var linha = function (c) {
    P = juntosDe(c.estacao);
    var op = codParecidos(c.descricao, P, c.proposta, 5), vend = (V[c.estacao] || {}).precos || {};
    var compra = c.compra_m > 0 ? "Compra: <b>" + codEur(Math.round(c.compra_m / 10)) + "</b> por unidade" + (c.fatura ? " (fatura " + esc(String(c.fatura).split("/").pop()) + ")" : "") : "Compra: sem preço lido na fatura";
    var pvpF = c.pvp_fatura_c > 0 ? " · PVP na fatura: <b>" + codEur(c.pvp_fatura_c) + "</b>" + (codMargem(c.compra_m, c.pvp_fatura_c) != null ? " (margem " + String(codMargem(c.compra_m, c.pvp_fatura_c)).replace(".", ",") + " %)" : "") : "";
    var opcoes = op.map(function (p, i) {
      var pv = vend[p.repsol_code], mg = codMargem(c.compra_m, pv);
      var cb = !CAT[c.estacao] ? "" : !p.cbos ? "<div>❌ <b>Não está no catálogo do CBOS carregado</b></div>" : !p.cbos.pvp_c ? "<div>❌ <b>Sem preço no CBOS</b></div>"
        : "<div>PVP no CBOS: <b>" + codEur(p.cbos.pvp_c) + "</b>" + (c.pvp_fatura_c > 0 ? (p.cbos.pvp_c === c.pvp_fatura_c ? " · ✅ igual ao PVP da fatura" : " · ⚠️ <b>diferente do PVP da fatura</b>") : "") +
          (codMargem(c.compra_m, p.cbos.pvp_c) != null ? " · margem " + String(codMargem(c.compra_m, p.cbos.pvp_c)).replace(".", ",") + " %" : "") + (p.soCbos ? " <span class='mut'>· só no CBOS (ainda não está no Stock)</span>" : "") + "</div>";
      var venda = cb + (pv ? "<div class='mut'>Vende-se a <b>" + codEur(pv) + "</b>" + (mg != null ? " · margem " + String(mg).replace(".", ",") + " %" : "") +
        (c.pvp_fatura_c > 0 ? (pv === c.pvp_fatura_c ? " · ✅ igual ao PVP da fatura" : " · ⚠️ diferente do PVP da fatura") : "") + "</div>" : "<div class='mut'>ℹ️ Sem vendas na última leitura do CBOS</div>");
      return "<label style='display:flex;gap:8px;align-items:flex-start;margin:6px 0'><input type='radio' name='cod" + c.id + "' value='" + p.repsol_code + "' data-nome='" + esc(p.name) + "'" + (i === 0 && p.repsol_code === c.proposta ? " checked" : "") + ">" +
        "<span><b>" + esc(p.repsol_code) + "</b> " + esc(p.name) + (p.category ? " <span class='mut'>· " + esc(p.category) + "</span>" : "") + (p.repsol_code === c.proposta ? " <span class='mut'>· proposta do OCTAN AI</span>" : "") + venda + "</span></label>";
    }).join("");
    return "<div class='card' style='padding:12px 14px' data-codcard='" + c.id + "'>" +
      "<b>" + esc(c.codigo) + " · " + esc(c.descricao || "") + "</b><div class='mut'>" + esc(aviLoja(c.estacao)) + " · na fatura desde " + aviDataHora(c.criado) + "</div>" +
      "<div style='margin-top:4px'>🧾 " + compra + pvpF + "</div>" +
      (opcoes ? "<div style='margin-top:6px'>" + opcoes + "</div>" : CAT[c.estacao] ? "<div style='margin-top:6px'>❌ <b>Não está no catálogo do CBOS carregado</b> desta estação. Se é tabaco, tem de ser criado no CBOS; até lá a fatura espera. (O catálogo só traz as famílias exportadas.)</div>"
        : "<div class='mut' style='margin-top:6px'>ℹ️ Nenhum artigo parecido no catálogo. Se ainda não existe no CBOS, deixa ficar: a fatura espera.</div>") +
      "<label style='display:flex;gap:8px;align-items:center;margin:4px 0'><input type='radio' name='cod" + c.id + "' value='outro'><span>Outro código</span></label>" +
      "<div style='display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))'>" +
      "<input inputmode='numeric' maxlength='8' placeholder='Código Repsol (8 algarismos)' data-codnum='" + c.id + "'><input placeholder='Nome do artigo' data-codnome='" + c.id + "'></div>" +
      "<div class='bar' style='margin-top:8px'><button class='btn p' data-codok='" + c.id + "'>✔ Confirmar</button></div></div>";
  };
  var html = "<div class='card' style='padding:12px 14px'><b>🏷️ Códigos novos por confirmar (" + L.length + ")</b>" +
    "<div class='mut'>A fatura fica à espera até confirmares a que artigo Repsol corresponde cada código. Confirma só quando tiveres a certeza: a fatura é gravada no CBOS com esse artigo. O preço de venda vem da última leitura do CBOS da estação; a margem é sobre o preço de venda.</div>" +
    "<div style='display:grid;gap:10px;margin-top:10px'>" + L.map(linha).join("") + "</div></div>";
  var ligar = function (raiz) {
    Array.prototype.slice.call(raiz.querySelectorAll("[data-codnum]")).forEach(function (i) { i.oninput = function () { var o = raiz.querySelector("input[name='cod" + i.dataset.codnum + "'][value='outro']"); if (o) o.checked = true; }; });
    Array.prototype.slice.call(raiz.querySelectorAll("[data-codok]")).forEach(function (b) {
      b.onclick = async function () {
        var id = Number(b.dataset.codok), esc1 = raiz.querySelector("input[name='cod" + id + "']:checked");
        if (!esc1) return status(false, "⚠ Escolhe um artigo ou escreve o código");
        var cod = esc1.value, nome = esc1.dataset.nome || "";
        if (cod === "outro") { cod = (raiz.querySelector("[data-codnum='" + id + "']").value || "").trim(); nome = (raiz.querySelector("[data-codnome='" + id + "']").value || "").trim(); }
        if (!/^\d{8}$/.test(cod)) return status(false, "⚠ O código Repsol tem 8 algarismos");
        P = juntosDe((L.find(function (x) { return x.id === id; }) || {}).estacao);
        if (!nome) { var p = P.find(function (x) { return x.repsol_code === cod; }); nome = p ? p.name : ""; }
        if (!nome) return status(false, "⚠ Falta o nome do artigo");
        b.disabled = true;
        var x = await sb.rpc("msb_confirmar_codigo", {p_id: id, p_codigo_repsol: cod, p_nome: nome});
        if (x.error) { b.disabled = false; return status(false, "⚠ " + falhou(x.error)); }
        status(true, "✅ Confirmado: " + cod + " " + nome + ". O OCTAN AI aplica na próxima volta (de 2 em 2 horas); a fatura grava-se na corrida seguinte.");
        if (recarregar) recarregar();
      };
    });
  };
  return {html: html, ligar: ligar};
}
if (typeof module !== "undefined") module.exports = {codJuntar: codJuntar, codNoCatalogo: codNoCatalogo, codPalavras: codPalavras, codParecidos: codParecidos, codPrecoVenda: codPrecoVenda, codMargem: codMargem};
