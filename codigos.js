"use strict";
/* Códigos novos dos fornecedores (dono, 18/11/2026): a fatura da Logista traz um código que o OCTAN AI ainda não liga a um artigo
   Repsol. Confirma-se aqui (Painel → OCTAN AI) em vez do painel local do PC. Para cada código mostram-se os artigos do catálogo
   mais parecidos; o dono escolhe um (ou escreve o código de 8 algarismos) e confirma. O OCTAN AI aplica no PC dentro de minutos
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
async function codProdutos() {
  if (COD_PRODUTOS) return COD_PRODUTOS;
  var r = await lerTudo(function () { return sb.from("products").select("id,name,category,repsol_code"); }, ["id"]);
  if (r.error) throw r.error;
  return (COD_PRODUTOS = (r.data || []).filter(function (p) { return /^\d{8}$/.test(p.repsol_code || ""); }));
}
/* Devolve {html, ligar}. Só o administrador vê; sem códigos por confirmar não mostra nada. */
async function codigosNovos(recarregar) {
  if (typeof ADMIN === "undefined" || !ADMIN) return {html: "", ligar: function () {}};
  var r = await sb.from("msb_codigos_novos").select("*").eq("estado", "por").order("criado");
  if (r.error) throw r.error;
  var L = r.data || [];
  if (!L.length) return {html: "", ligar: function () {}};
  var P = await codProdutos();
  var linha = function (c) {
    var op = codParecidos(c.descricao, P, c.proposta, 5);
    var opcoes = op.map(function (p, i) {
      return "<label style='display:flex;gap:8px;align-items:flex-start;margin:4px 0'><input type='radio' name='cod" + c.id + "' value='" + p.repsol_code + "' data-nome='" + esc(p.name) + "'" + (i === 0 && p.repsol_code === c.proposta ? " checked" : "") + ">" +
        "<span><b>" + esc(p.repsol_code) + "</b> " + esc(p.name) + (p.category ? " <span class='mut'>· " + esc(p.category) + "</span>" : "") + (p.repsol_code === c.proposta ? " <span class='mut'>· proposta do OCTAN AI</span>" : "") + "</span></label>";
    }).join("");
    return "<div class='card' style='padding:12px 14px' data-codcard='" + c.id + "'>" +
      "<b>" + esc(c.codigo) + " · " + esc(c.descricao || "") + "</b><div class='mut'>" + esc(aviLoja(c.estacao)) + " · na fatura desde " + aviDataHora(c.criado) + "</div>" +
      (opcoes ? "<div style='margin-top:6px'>" + opcoes + "</div>" : "<div class='mut' style='margin-top:6px'>ℹ️ Nenhum artigo parecido no catálogo. Se ainda não existe no CBOS, deixa ficar: a fatura espera.</div>") +
      "<label style='display:flex;gap:8px;align-items:center;margin:4px 0'><input type='radio' name='cod" + c.id + "' value='outro'><span>Outro código</span></label>" +
      "<div style='display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))'>" +
      "<input inputmode='numeric' maxlength='8' placeholder='Código Repsol (8 algarismos)' data-codnum='" + c.id + "'><input placeholder='Nome do artigo' data-codnome='" + c.id + "'></div>" +
      "<div class='bar' style='margin-top:8px'><button class='btn p' data-codok='" + c.id + "'>✔ Confirmar</button></div></div>";
  };
  var html = "<div class='card' style='padding:12px 14px'><b>🏷️ Códigos novos por confirmar (" + L.length + ")</b>" +
    "<div class='mut'>A fatura fica à espera até confirmares a que artigo Repsol corresponde cada código. Confirma só quando tiveres a certeza: a fatura é gravada no CBOS com esse artigo.</div>" +
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
        if (!nome) { var p = P.find(function (x) { return x.repsol_code === cod; }); nome = p ? p.name : ""; }
        if (!nome) return status(false, "⚠ Falta o nome do artigo");
        b.disabled = true;
        var x = await sb.rpc("msb_confirmar_codigo", {p_id: id, p_codigo_repsol: cod, p_nome: nome});
        if (x.error) { b.disabled = false; return status(false, "⚠ " + falhou(x.error)); }
        status(true, "✅ Confirmado: " + cod + " " + nome + ". O OCTAN AI aplica dentro de minutos; a fatura grava-se na corrida seguinte.");
        if (recarregar) recarregar();
      };
    });
  };
  return {html: html, ligar: ligar};
}
if (typeof module !== "undefined") module.exports = {codPalavras: codPalavras, codParecidos: codParecidos};
