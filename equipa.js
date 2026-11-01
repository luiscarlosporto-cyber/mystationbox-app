/* mystationbox · contas de acesso da equipa (só administradores). A criação de contas corre na cloud
 * (função msb-equipa), porque precisa da chave de serviço, que nunca pode estar no navegador. */
"use strict";
var EQ = {lista: [], estacoes: [], eu: null, edita: null};
async function equipa(acao, dados) {
  var r = await sb.functions.invoke("msb-equipa", {body: Object.assign({acao: acao}, dados || {})});
  if (r.error) { var m = r.error.message; try { var j = await r.error.context.json(); m = j.erro || m; } catch (e) { /* sem corpo */ } throw new Error(m); }
  if (r.data && r.data.erro) throw new Error(r.data.erro);
  return r.data;
}
function senhaSugerida() { var c = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789", a = crypto.getRandomValues(new Uint8Array(10)); return Array.from(a).map(function (x) { return c[x % c.length]; }).join(""); }
/* As palavras-passe ficam guardadas cifradas (só se verifica, não se lê): ninguém as pode ver depois, nem o administrador.
 * Por isso mostram-se UMA vez, no momento em que se criam ou se repõem, com botões para copiar ou enviar. */
function mostrarCredenciais(titulo, nome, email, senha) {
  var txt = "mystationbox · " + (nome || "") + "\nEndereço: https://luiscarlosporto-cyber.github.io/mystationbox-app/\nEmail: " + email + "\nPalavra-passe: " + senha;
  $("#eqMsg").innerHTML = "<div class='aviso' style='display:grid;gap:6px'><b>✅ " + esc(titulo) + "</b><div>Email: <b>" + esc(email) + "</b></div><div>Palavra-passe: <b style='font:600 20px var(--f-num);letter-spacing:.04em;user-select:all'>" + esc(senha) + "</b></div>" +
    "<div class='mut' style='font-size:13px'>Aponte ou envie agora: depois de sair deste ecrã já não é possível ver esta palavra-passe (fica guardada cifrada). Se se perder, crie uma nova.</div>" +
    "<div class='bar'><button class='btn' id='crCop'>📋 Copiar</button><a class='btn' id='crWa' target='_blank' rel='noopener' href='https://wa.me/?text=" + encodeURIComponent(txt) + "'>💬 Enviar por WhatsApp</a></div></div>";
  $("#crCop").onclick = function () { var b = this; (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { b.textContent = "✔ Copiado"; }, function () { b.textContent = "Selecione e copie à mão"; }); };
}
async function carregarEquipa() {
  var box = $("#equipa"); if (!box) return;
  box.hidden = !ADMIN; if (!ADMIN) return;
  $("#eqLista").innerHTML = "<tr><td colspan='6' class='mut'>A carregar…</td></tr>";
  try { var d = await equipa("listar"); EQ.lista = d.equipa || []; EQ.estacoes = d.estacoes || []; EQ.eu = d.eu; desenharEquipa(); }
  catch (e) { $("#eqLista").innerHTML = "<tr><td colspan='6' class='bad'>" + esc(e.message) + "</td></tr>"; }
}
function nomeEst(id) { var e = EQ.estacoes.find(function (x) { return x.id === id; }); return e ? (e.short_name || e.name) : id; }
function optsEst(sel) { return EQ.estacoes.map(function (e) { return "<option value='" + e.id + "'" + (e.id === sel ? " selected" : "") + ">" + esc(e.short_name || e.name) + "</option>"; }).join(""); }
function optsPapel(sel) { return "<option value='staff'" + (sel !== "admin" ? " selected" : "") + ">Funcionário</option><option value='admin'" + (sel === "admin" ? " selected" : "") + ">Administrador</option>"; }
function desenharEquipa() {
  $("#eqLista").innerHTML = EQ.lista.map(function (p) {
    var eu = p.user_id === EQ.eu;
    if (EQ.edita === p.user_id) return "<tr><td colspan='6'><div class='ff'><label>Nome<input id='eqN' value='" + esc(p.display_name || "") + "'></label><label>Função<select id='eqP'" + (eu ? " disabled" : "") + ">" + optsPapel(p.role) + "</select></label><label>Estação<select id='eqE'>" + optsEst(p.company_id) + "</select></label><label>Nova palavra-passe (opcional)<span style='display:flex;gap:6px'><input id='eqS' placeholder='vazio = manter a atual' autocomplete='new-password' style='flex:1;min-width:0'><button type='button' class='mini' id='eqGer'>🎲 Gerar</button></span></label></div><div class='bar' style='margin-top:8px'><button class='btn p' data-ok='" + p.user_id + "'>Guardar</button><button class='btn' data-cancel='1'>Cancelar</button></div></td></tr>";
    return "<tr><td>" + esc(p.display_name || "—") + (eu ? " <span class='b ok'>você</span>" : "") + "</td><td class='l'>" + esc(p.email || "") + "</td><td class='l'>" + (p.role === "admin" ? "Administrador" : "Funcionário") + "</td><td class='l'>" + esc(nomeEst(p.company_id)) + "</td><td class='l'>" + (p.banido ? "<span class='b bad'>desativada</span>" : p.ultimo ? "entrou " + new Date(p.ultimo).toLocaleDateString("pt-PT") : "<span class='mut'>nunca entrou</span>") + "</td><td><button class='mini' data-ed='" + p.user_id + "'>Editar</button>" + (eu ? "" : " <button class='mini' data-ban='" + p.user_id + "' data-x='" + (p.banido ? "ativar" : "desativar") + "'>" + (p.banido ? "Reativar" : "Desativar") + "</button>") + "</td></tr>";
  }).join("") || "<tr><td colspan='6' class='mut'>Sem contas.</td></tr>";
  if ($("#eqGer")) $("#eqGer").onclick = function () { $("#eqS").value = senhaSugerida(); };
  $$("#eqLista [data-ed]").forEach(function (b) { b.onclick = function () { EQ.edita = b.dataset.ed; desenharEquipa(); }; });
  $$("#eqLista [data-cancel]").forEach(function (b) { b.onclick = function () { EQ.edita = null; desenharEquipa(); }; });
  $$("#eqLista [data-ok]").forEach(function (b) { b.onclick = async function () {
    b.disabled = true; var id = b.dataset.ok, s = $("#eqS").value.trim();
    try { await equipa("atualizar", {user_id: id, nome: $("#eqN").value, role: $("#eqP").disabled ? undefined : $("#eqP").value, company_id: $("#eqE").value});
      if (s) await equipa("palavra_passe", {user_id: id, password: s});
      var pp = EQ.lista.find(function (x) { return x.user_id === id; }) || {};
      EQ.edita = null; status(true, "Conta atualizada ✓"); if (s) mostrarCredenciais("Palavra-passe nova de " + (pp.display_name || ""), pp.display_name, pp.email || "", s); else $("#eqMsg").textContent = ""; carregarEquipa(); }
    catch (e) { b.disabled = false; $("#eqMsg").textContent = "⚠ " + e.message; } }; });
  $$("#eqLista [data-ban]").forEach(function (b) { b.onclick = async function () {
    if (b.dataset.conf !== "1") { b.dataset.conf = "1"; b.textContent = b.dataset.x === "desativar" ? "Confirmar: desativar" : "Confirmar: reativar"; return; }
    b.disabled = true; try { await equipa(b.dataset.x, {user_id: b.dataset.ban}); carregarEquipa(); } catch (e) { b.disabled = false; $("#eqMsg").textContent = "⚠ " + e.message; } }; });
}
function formNovo() {
  var f = $("#eqNovo"); f.hidden = !f.hidden; if (f.hidden) return;
  f.innerHTML = "<div class='ff'><label>Nome<input id='nvN' placeholder='Ex.: Carina'></label><label>Email<input id='nvM' type='email' placeholder='email@exemplo.pt' autocomplete='off'></label><label>Palavra-passe inicial<input id='nvS' value='" + senhaSugerida() + "' autocomplete='new-password'></label><label>Função<select id='nvP'>" + optsPapel("staff") + "</select></label><label>Estação<select id='nvE'>" + optsEst(EST) + "</select></label></div><div class='bar' style='margin-top:8px'><button class='btn p' id='nvOk'>Criar conta</button></div>";
  $("#nvOk").onclick = async function () { var b = this; b.disabled = true; $("#eqMsg").textContent = "";
    try { var s = $("#nvS").value.trim(), m = $("#nvM").value.trim();
      await equipa("criar", {nome: $("#nvN").value, email: m, password: s, role: $("#nvP").value, company_id: $("#nvE").value});
      $("#eqNovo").hidden = true; mostrarCredenciais("Conta criada: " + $("#nvN").value.trim(), $("#nvN").value.trim(), m, s); carregarEquipa(); }
    catch (e) { b.disabled = false; $("#eqMsg").textContent = "⚠ " + e.message; } };
}
