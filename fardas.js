/* mystationbox · Fardamento (27/11/2026, pedido do dono).
 * Colaborador (Perfil → Fardamento, página «far»): tamanhos obrigatórios por peça, com sugestão pelas medidas
 * (as medidas não se guardam), pedido de fardamento novo e os seus pedidos.
 * Administrador (Equipa → Fardamento, página «fdm»): pedidos (aprovar, recusar, encomendado, entregue), lista e PDF para
 * encomendar no portal da Repsol e quadro de tamanhos da equipa. Regras puras em fardas_regras.js. */
"use strict";
var FAR = {d: null, modelo: "", tam: {}, med: {}, qtd: {}, motivo: "desgaste", aviso: null, adm: null, portal: "https://gestion-logistica.icp.es/#/pages/dashboard"};

/* desenhos genéricos das peças: cores da farda, sem logótipo nem marcas da Repsol (regra da marca) */
var FAR_SVG = "<svg width='0' height='0' style='position:absolute' aria-hidden='true'><defs>" +
  "<symbol id='fz_polo_curta' viewBox='0 0 100 100'><path d='M30 14 L42 10 Q50 16 58 10 L70 14 L92 30 L84 44 L74 38 L74 90 L26 90 L26 38 L16 44 L8 30 Z' fill='#fff' stroke='#9aa3af' stroke-width='1.5'/><path d='M30 14 L42 10 Q50 16 58 10 L70 14 L80 21 L74 34 L26 34 L20 21 Z' fill='#F28C28'/><path d='M42 10 L50 22 L58 10' fill='#fff' stroke='#9aa3af' stroke-width='1.2'/><path d='M8 30 L16 44 L19 42 L11 28Z M92 30 L84 44 L81 42 L89 28Z M26 40 L30 40 L30 90 L26 90Z M70 40 L74 40 L74 90 L70 90Z' fill='#14213D'/></symbol>" +
  "<symbol id='fz_polo_comprida' viewBox='0 0 100 100'><path d='M32 14 L42 10 Q50 16 58 10 L68 14 L86 26 L96 80 L86 82 L76 42 L74 90 L26 90 L24 42 L14 82 L4 80 L14 26 Z' fill='#fff' stroke='#9aa3af' stroke-width='1.5'/><path d='M32 14 L42 10 Q50 16 58 10 L68 14 L82 24 L76 34 L24 34 L18 24 Z' fill='#F28C28'/><path d='M42 10 L50 22 L58 10' fill='#fff' stroke='#9aa3af' stroke-width='1.2'/><path d='M4 80 L14 82 L15 76 L5 74Z M96 80 L86 82 L85 76 L95 74Z M26 40 L29 40 L29 90 L26 90Z M71 40 L74 40 L74 90 L71 90Z' fill='#14213D'/></symbol>" +
  "<symbol id='fz_calcas' viewBox='0 0 100 100'><path d='M26 8 L74 8 L80 94 L58 94 L50 34 L42 94 L20 94 Z' fill='#14213D'/><path d='M28 28 L38 26 M72 28 L62 26' stroke='#F28C28' stroke-width='2'/><rect x='66' y='36' width='12' height='7' fill='#F28C28'/><path d='M23 62 L45 62 M55 62 L77 62' stroke='#F28C28' stroke-width='1.5'/><path d='M22 74 L44 74 M56 74 L78 74 M22 80 L44 80 M56 80 L78 80' stroke='#e5e7eb' stroke-width='3'/></symbol>" +
  "<symbol id='fz_casaco' viewBox='0 0 100 100'><path d='M30 12 L50 18 L70 12 L88 26 L96 82 L84 84 L76 44 L76 92 L24 92 L24 44 L16 84 L4 82 L12 26 Z' fill='#14213D'/><path d='M50 18 L50 92 M24 60 L76 60' stroke='#F28C28' stroke-width='2'/></symbol>" +
  "</defs></svg>";
function farIc(id, t) { return "<svg aria-hidden='true' style='width:" + (t || 48) + "px;height:" + (t || 48) + "px;flex:none;background:#fff;border-radius:10px;border:1px solid var(--bd)'><use href='#fz_" + id + "'/></svg>"; }
function farData(t) { return t ? new Date(t).toLocaleDateString("pt-PT", {timeZone: "Europe/Lisbon"}) : ""; }
function farEstado(e) {
  var c = {pedido: ["#FEF3C7", "#92400E", "⏳"], aprovado: ["#DBEAFE", "#1E40AF", "✅"], recusado: ["#FEE2E2", "#991B1B", "❌"], encomendado: ["#E0E7FF", "#3730A3", "📦"], entregue: ["#DCFCE7", "#166534", "✔"]}[e] || ["#eee", "#333", ""];
  return "<span style='background:" + c[0] + ";color:" + c[1] + ";border-radius:8px;padding:3px 8px;font-size:13px;font-weight:600;white-space:nowrap'>" + c[2] + " " + esc(FARDAS.ESTADOS[e] || e) + "</span>";
}
function farMsg(sel, txt, mau) { var m = $(sel); if (m) { m.textContent = txt; m.style.color = mau ? "#B42318" : "#166534"; } }
async function farRpc(nome, args) { var r = await sb.rpc(nome, args || {}); if (r.error) throw new Error(r.error.message || "Erro"); return r.data; }

/* ---------- Colaborador ---------- */
async function carregarFarda() {
  var box = $("#farCorpo"); if (!box) return;
  box.innerHTML = "<section class='card'>A carregar…</section>";
  try { FAR.d = await farRpc("msb_fardas_meu"); } catch (e) { box.innerHTML = "<section class='card'>❌ " + esc(e.message) + "</section>"; return; }
  var t = FAR.d.tamanhos || {};
  FAR.modelo = t.modelo || FAR.modelo || ""; FAR.tam = {};
  FARDAS.PECAS.forEach(function (p) { FAR.tam[p.id] = t[p.id] || ""; });
  FAR.qtd = {}; FAR.aviso = null;
  farDesenhar();
}
function farDesenhar() {
  var box = $("#farCorpo"), D = FAR.d; if (!box) return;
  if (!D.colaborador) { box.innerHTML = "<section class='card'><h2 style='margin:0 0 6px'>👕 Fardamento</h2><p class='mut' style='margin:0'>A sua conta não está ligada a um colaborador. Fale com a gerência.</p></section>"; return; }
  var ok = FARDAS.completo(D.tamanhos);
  box.innerHTML = FAR_SVG + farTamanhosHtml(ok) + (ok ? farPedirHtml() : "") + farPedidosHtml();
  farLigar();
}
function farTamanhosHtml(ok) {
  var M = FAR.modelo, med = FARDAS.medidas(M || "M"), nomes = {altura: "Altura", peito: "Peito", cintura: "Cintura", anca: "Anca"};
  return "<section class='card' style='display:grid;gap:12px;padding:18px'>" +
    "<div><h2 style='margin:0'>👕 Os meus tamanhos</h2>" + (ok ? "<p class='mut' style='margin:4px 0 0'>Atualizado a " + esc(farData(FAR.d.tamanhos.atualizado_em)) + ". Pode mudar quando quiser.</p>"
      : "<p style='margin:6px 0 0;background:#FEF3C7;color:#92400E;border-radius:10px;padding:8px 10px'>⚠️ Obrigatório: indique o modelo e o tamanho de cada peça.</p>") + "</div>" +
    "<div><div class='mut' style='margin-bottom:6px'>Modelo</div><div style='display:flex;gap:8px'>" +
      ["F", "M"].map(function (m) { return "<button class='btn" + (M === m ? " p" : "") + "' data-mod='" + m + "' style='flex:1;min-height:46px'>" + (m === "F" ? "Feminino" : "Masculino") + "</button>"; }).join("") + "</div></div>" +
    (M ? "<details style='border:1px solid var(--bd);border-radius:12px;padding:10px 12px'" + (ok ? "" : " open") + "><summary style='cursor:pointer;font-weight:600;min-height:28px'>📏 Ajuda a escolher o tamanho</summary>" +
      "<p class='mut' style='margin:6px 0'>Escreva as medidas em centímetros. A app sugere o tamanho pelas tabelas do fardamento. <b>As medidas não ficam guardadas.</b></p>" +
      "<div style='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px'>" + med.map(function (k) {
        return "<label>" + nomes[k] + " (cm)<input type='number' inputmode='numeric' min='40' max='230' data-med='" + k + "' value='" + esc(FAR.med[k] || "") + "' style='width:100%;box-sizing:border-box;min-height:44px'></label>"; }).join("") + "</div>" +
      "<div id='farSug' style='margin-top:8px'></div></details>" : "") +
    (M ? "<div style='display:grid;gap:8px'>" + FARDAS.PECAS.map(function (p) {
      return "<div style='display:flex;align-items:center;gap:10px'>" + farIc(p.id) + "<span style='flex:1;font-weight:600'>" + esc(p.nome) + "</span>" +
        "<select data-tam='" + p.id + "' aria-label='Tamanho: " + esc(p.nome) + "' style='min-height:44px;min-width:110px'><option value=''>Escolher</option>" +
        FARDAS.TAMANHOS.map(function (t) { return "<option value='" + t + "'" + (FAR.tam[p.id] === t ? " selected" : "") + ">" + FARDAS.TAM_PT[t] + "</option>"; }).join("") + "</select></div>"; }).join("") + "</div>" +
      "<button class='btn p' id='farGravar' style='min-height:50px'>Guardar tamanhos</button><div id='farMsgT' role='status'></div>" : "") +
    "</section>";
}
function farPedirHtml() {
  var ano = new Date().getFullYear(), u = FARDAS.usadosNoAno(FAR.d.pedidos, ano), T = FAR.d.tamanhos, n = 0;
  FARDAS.PECAS.forEach(function (p) { n += FAR.qtd[p.id] || 0; });
  return "<section class='card' style='display:grid;gap:12px;padding:18px'><div><h2 style='margin:0'>📦 Pedir fardamento</h2>" +
    "<p class='mut' style='margin:4px 0 0'>Por ano: até " + FARDAS.LIMITE_ANO + " peças de cada tipo e 1 casaco / polar. O tamanho vem do seu perfil.</p></div>" +
    "<div style='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px'>" + FARDAS.PECAS.map(function (p) {
      var q = FAR.qtd[p.id] || 0, usado = u[p.id] || 0;
      return "<div style='border:" + (q ? "2px solid #1A63E8" : "1px solid var(--bd)") + ";border-radius:14px;padding:10px;text-align:center;display:grid;gap:6px;justify-items:center'>" + farIc(p.id, 64) +
        "<div style='font-weight:600;font-size:14px'>" + esc(p.nome) + " · " + esc(T[p.id]) + "</div>" +
        "<div style='display:flex;align-items:center;gap:8px'><button class='btn' data-q='" + p.id + "' data-d='-1' aria-label='Menos' style='min-width:44px;min-height:44px'>−</button>" +
        "<b style='min-width:20px;font-size:18px'>" + q + "</b><button class='btn' data-q='" + p.id + "' data-d='1' aria-label='Mais' style='min-width:44px;min-height:44px'>+</button></div>" +
        "<div class='mut' style='font-size:12px" + (usado + q > FARDAS.limite(p.id) ? ";color:#B42318" : "") + "'>Este ano: " + usado + " de " + FARDAS.limite(p.id) + "</div></div>"; }).join("") + "</div>" +
    "<div><div class='mut' style='margin-bottom:6px'>Motivo</div><div style='display:flex;flex-wrap:wrap;gap:6px'>" + Object.keys(FARDAS.MOTIVOS).map(function (k) {
      return "<button class='btn" + (FAR.motivo === k ? " p" : "") + "' data-mot='" + k + "' style='min-height:42px'>" + esc(FARDAS.MOTIVOS[k]) + "</button>"; }).join("") + "</div></div>" +
    "<label>Nota (opcional)<textarea id='farNota' rows='2' maxlength='300' style='width:100%;box-sizing:border-box'>" + esc(FAR.nota || "") + "</textarea></label>" +
    (FAR.aviso ? "<p style='margin:0;background:#FEF3C7;color:#92400E;border-radius:10px;padding:8px 10px'>" + FAR.aviso + "</p>" : "") +
    "<button class='btn p' id='farPedir' style='min-height:50px'" + (n ? "" : " disabled") + ">" + (FAR.aviso ? "Enviar mesmo assim" : "Enviar pedido") + (n ? " · " + n + (n === 1 ? " peça" : " peças") : "") + "</button><div id='farMsgP' role='status'></div></section>";
}
function farPedidosHtml() {
  var L = FAR.d.pedidos || [];
  return "<section class='card' style='display:grid;gap:8px;padding:18px'><h2 style='margin:0'>Os meus pedidos</h2>" + (L.length ? L.map(function (p) {
    return "<div style='border-top:1px solid var(--bd);padding-top:8px;display:grid;gap:4px'><div style='display:flex;justify-content:space-between;gap:8px;align-items:center'><b>" + esc(farData(p.criado_em)) + "</b>" + farEstado(p.estado) + "</div>" +
      "<div>" + esc(FARDAS.itensTxt(p.itens)) + "</div>" + (p.estado === "recusado" && p.motivo_recusa ? "<div class='mut'>Motivo: " + esc(p.motivo_recusa) + "</div>" : "") +
      (p.estado === "aprovado" || p.estado === "encomendado" ? "<button class='btn' data-recebi='" + p.id + "' style='min-height:44px'>✔ Já recebi</button>" : "") + "</div>"; }).join("")
    : "<p class='mut' style='margin:0'>Ainda não fez pedidos.</p>") + "</section>";
}
function farSugestao() {
  var s = FARDAS.sugerir(FAR.modelo, FAR.med), box = $("#farSug"); if (!box) return;
  var k = Object.keys(s); if (!k.length) { box.innerHTML = ""; return; }
  box.innerHTML = "<div style='color:#166534'>✔ Sugerido: " + FARDAS.PECAS.map(function (p) { return esc(p.nome) + " <b>" + s[p.id] + "</b>"; }).join(" · ") + "</div>" +
    "<button class='btn' id='farUsar' style='margin-top:6px;min-height:42px'>Usar a sugestão</button>";
  $("#farUsar").onclick = function () { FARDAS.PECAS.forEach(function (p) { if (s[p.id]) FAR.tam[p.id] = s[p.id]; }); farDesenhar(); };
}
function farLigar() {
  var box = $("#farCorpo");
  box.querySelectorAll("[data-mod]").forEach(function (b) { b.onclick = function () { FAR.modelo = b.dataset.mod; farDesenhar(); }; });
  box.querySelectorAll("[data-med]").forEach(function (i) { i.oninput = function () { FAR.med[i.dataset.med] = i.value; farSugestao(); }; });
  box.querySelectorAll("[data-tam]").forEach(function (s) { s.onchange = function () { FAR.tam[s.dataset.tam] = s.value; }; });
  box.querySelectorAll("[data-q]").forEach(function (b) { b.onclick = function () { var id = b.dataset.q; FAR.qtd[id] = Math.max(0, Math.min(5, (FAR.qtd[id] || 0) + Number(b.dataset.d))); FAR.aviso = null; farGuardaNota(); farDesenhar(); }; });
  box.querySelectorAll("[data-mot]").forEach(function (b) { b.onclick = function () { FAR.motivo = b.dataset.mot; farGuardaNota(); farDesenhar(); }; });
  box.querySelectorAll("[data-recebi]").forEach(function (b) { b.onclick = async function () {
    b.disabled = true; try { FAR.d = await farRpc("msb_fardas_recebi", {p_id: +b.dataset.recebi}); farDesenhar(); } catch (e) { b.disabled = false; alert(e.message); } }; });
  farSugestao();
  var g = $("#farGravar"); if (g) g.onclick = async function () {
    var t = {modelo: FAR.modelo}; FARDAS.PECAS.forEach(function (p) { t[p.id] = FAR.tam[p.id]; });
    if (!FARDAS.completo(t)) { farMsg("#farMsgT", "Escolha o tamanho de todas as peças.", true); return; }
    g.disabled = true; g.textContent = "A guardar…";
    try { FAR.d = await farRpc("msb_fardas_gravar", {p_estacao: EST, p_t: t}); FAR.med = {}; farDesenhar(); farMsg("#farMsgT", "✔ Tamanhos guardados."); fardaObrigatoria.ok = true; }
    catch (e) { g.disabled = false; g.textContent = "Guardar tamanhos"; farMsg("#farMsgT", "❌ " + e.message, true); }
  };
  var p = $("#farPedir"); if (p) p.onclick = async function () {
    farGuardaNota();
    var itens = FARDAS.PECAS.filter(function (x) { return FAR.qtd[x.id]; }).map(function (x) { return {peca: x.id, qtd: FAR.qtd[x.id]}; });
    if (!itens.length) return;
    var acima = FARDAS.acimaLimite(itens, FARDAS.usadosNoAno(FAR.d.pedidos, new Date().getFullYear()));
    if (acima.length && !FAR.aviso) { FAR.aviso = "⚠️ Passa o limite do ano em: " + esc(acima.map(function (x) { return FARDAS.nomePeca(x) + " (máx. " + FARDAS.limite(x) + ")"; }).join(", ")) + ". O pedido segue, mas a gerência pode recusar."; farDesenhar(); return; }
    p.disabled = true; p.textContent = "A enviar…";
    try { FAR.d = await farRpc("msb_fardas_pedir", {p_estacao: EST, p_itens: itens, p_motivo: FAR.motivo, p_nota: FAR.nota || null}); FAR.qtd = {}; FAR.nota = ""; FAR.aviso = null; farDesenhar(); farMsg("#farMsgP", "✔ Pedido enviado à gerência."); }
    catch (e) { p.disabled = false; p.textContent = "Enviar pedido"; farMsg("#farMsgP", "❌ " + e.message, true); }
  };
}
function farGuardaNota() { var n = $("#farNota"); if (n) FAR.nota = n.value; }

/* Tamanhos obrigatórios: a conta de colaborador ligada vê esta janela em todas as páginas, menos no Ponto e no próprio Fardamento. */
async function fardaObrigatoria(v) {
  if (fardaObrigatoria.ok || !window.soColab || !soColab() || v === "pto" || v === "far") { var j0 = $("#farObrig"); if (j0) j0.remove(); return; }
  if (fardaObrigatoria.ok === undefined) {
    try { var d = await farRpc("msb_fardas_meu"); fardaObrigatoria.ok = !d.colaborador || FARDAS.completo(d.tamanhos); } catch (e) { return; }
    if (fardaObrigatoria.ok) return;
  }
  if ($("#farObrig") || window.PAGINA === "pto" || window.PAGINA === "far") return;
  var dl = document.createElement("dialog"); dl.id = "farObrig"; dl.className = "avDlg";
  dl.innerHTML = "<div class='avDlg-corpo' style='display:grid;gap:12px;text-align:center'>" + FAR_SVG + "<div style='display:flex;justify-content:center;gap:6px'>" + farIc("polo_curta", 56) + farIc("calcas", 56) + "</div>" +
    "<h2 style='margin:0'>Fardamento</h2><p style='margin:0'>Falta indicar os seus tamanhos de fardamento. É obrigatório e demora um minuto.</p>" +
    "<button class='btn p' id='farObrigIr' style='min-height:50px'>👕 Preencher tamanhos</button><button class='btn' id='farObrigPto' style='min-height:46px'>🕒 Ir ao Ponto</button></div>";
  dl.addEventListener("cancel", function (e) { e.preventDefault(); });   // não fecha com a tecla Esc
  document.body.appendChild(dl);
  $("#farObrigIr").onclick = function () { dl.remove(); ir("far"); };
  $("#farObrigPto").onclick = function () { dl.remove(); ir("pto"); };
  dl.showModal();
}

/* ---------- Administrador ---------- */
async function carregarFdm() {
  var box = $("#fdmCorpo"); if (!box) return;
  box.innerHTML = "<section class='card'>A carregar…</section>";
  try { FAR.adm = await farRpc("msb_fardas_admin", {p_estacao: EST}); } catch (e) { box.innerHTML = "<section class='card'>❌ " + esc(e.message) + "</section>"; return; }
  fdmDesenhar();
}
function fdmDesenhar() {
  var box = $("#fdmCorpo"), A = FAR.adm, P = A.pedidos || [], est = (window.AVARIAS && AVARIAS.ESTACAO_NOME[EST]) || EST;
  var por = P.filter(function (p) { return p.estado === "pedido"; }), apr = P.filter(function (p) { return p.estado === "aprovado"; }),
    enc = P.filter(function (p) { return p.estado === "encomendado"; }), fech = P.filter(function (p) { return p.estado === "recusado" || p.estado === "entregue"; });
  var R = FARDAS.resumoEncomenda(P), falta = (A.equipa || []).filter(function (c) { return !FARDAS.completo(c.tamanhos); });
  var cart = function (p, botoes) {
    return "<div style='border:1px solid var(--bd);border-radius:14px;padding:12px;display:grid;gap:6px'><div style='display:flex;justify-content:space-between;gap:8px;align-items:center'><b>" + esc(p.quem) + "</b>" + farEstado(p.estado) + "</div>" +
      "<div>" + esc(FARDAS.itensTxt(p.itens)) + "</div><div class='mut' style='font-size:13px'>" + esc(FARDAS.MOTIVOS[p.motivo] || p.motivo) + " · " + esc(farData(p.criado_em)) + (p.nota ? " · «" + esc(p.nota) + "»" : "") + "</div>" +
      ((p.acima_limite || []).length && p.estado === "pedido" ? "<div style='color:#B42318;font-size:13px'>⚠️ Acima do limite do ano em: " + esc(p.acima_limite.map(FARDAS.nomePeca).join(", ")) + "</div>" : "") +
      (p.estado === "recusado" && p.motivo_recusa ? "<div class='mut' style='font-size:13px'>Recusado: " + esc(p.motivo_recusa) + "</div>" : "") +
      (botoes ? "<div style='display:flex;gap:8px;flex-wrap:wrap'>" + botoes + "</div>" : "") + "</div>";
  };
  var bt = function (id, est2, txt, p) { return "<button class='btn" + (p ? " p" : "") + "' data-fd='" + id + "' data-fe='" + est2 + "' style='flex:1;min-height:44px'>" + txt + "</button>"; };
  box.innerHTML = FAR_SVG + "<div id='fdmMsg' role='status'></div>" +
    "<section class='card' style='display:grid;gap:10px;padding:18px'><h2 style='margin:0'>Pedidos por aprovar · " + por.length + "</h2>" +
      (por.length ? por.map(function (p) { return cart(p, bt(p.id, "recusado", "Recusar") + bt(p.id, "aprovado", "Aprovar", 1)); }).join("") : "<p class='mut' style='margin:0'>Nenhum pedido por aprovar.</p>") + "</section>" +
    "<section class='card' style='display:grid;gap:10px;padding:18px'><h2 style='margin:0'>Para encomendar à Repsol</h2>" +
      (R.length ? "<div style='display:grid;gap:6px'>" + R.map(function (r) { return "<div style='display:flex;align-items:center;gap:10px'>" + farIc(r.peca, 40) + "<span style='flex:1'>" + esc(r.nome) + " · <b>" + esc(FARDAS.TAM_PT[r.tamanho]) + "</b></span><b style='font-size:18px'>" + r.qtd + "</b></div>"; }).join("") + "</div>" +
        "<div style='display:flex;gap:8px;flex-wrap:wrap'><button class='btn' id='fdmPdf' style='flex:1;min-height:46px'>📄 PDF da encomenda</button><a class='btn' href='" + FAR.portal + "' target='_blank' rel='noopener' style='flex:1;min-height:46px;display:flex;align-items:center;justify-content:center;text-decoration:none'>🔗 Portal Repsol</a></div>" +
        "<p class='mut' style='margin:0;font-size:13px'>Encomende no portal da Repsol e depois marque cada pedido como «Encomendado».</p>" +
        apr.map(function (p) { return cart(p, bt(p.id, "encomendado", "📦 Encomendado", 1) + bt(p.id, "entregue", "✔ Entregue")); }).join("")
      : "<p class='mut' style='margin:0'>Nada aprovado por encomendar.</p>") + "</section>" +
    (enc.length ? "<section class='card' style='display:grid;gap:10px;padding:18px'><h2 style='margin:0'>Encomendados · " + enc.length + "</h2>" + enc.map(function (p) { return cart(p, bt(p.id, "entregue", "✔ Entregue", 1)); }).join("") + "</section>" : "") +
    "<section class='card' style='display:grid;gap:8px;padding:18px'><h2 style='margin:0'>Tamanhos da equipa · " + esc(est) + "</h2>" +
      (falta.length ? "<p style='margin:0;background:#FEF3C7;color:#92400E;border-radius:10px;padding:8px 10px'>⚠️ Faltam " + falta.length + ": " + esc(falta.map(function (c) { return c.curto || c.nome; }).join(", ")) + "</p>" : "<p style='margin:0;color:#166534'>✔ Todos preenchidos.</p>") +
      "<div style='overflow-x:auto'><table style='width:100%;border-collapse:collapse;font-size:14px'><thead><tr><th style='text-align:left;padding:6px'>Colaborador</th><th>Mod.</th>" +
      FARDAS.PECAS.map(function (p) { return "<th title='" + esc(p.nome) + "' style='padding:6px'>" + farIc(p.id, 28) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      (A.equipa || []).map(function (c) { var t = c.tamanhos;
        return "<tr style='border-top:1px solid var(--bd)'><td style='padding:6px'>" + esc(c.nome) + (c.conta ? "" : " <span class='mut' style='font-size:12px'>(sem conta)</span>") + "</td>" +
          (t ? "<td style='text-align:center'>" + esc(t.modelo) + "</td>" + FARDAS.PECAS.map(function (p) { return "<td style='text-align:center'><b>" + esc(t[p.id]) + "</b></td>"; }).join("")
            : "<td colspan='" + (FARDAS.PECAS.length + 1) + "' style='text-align:center;color:#B42318'>Falta preencher</td>") + "</tr>"; }).join("") + "</tbody></table></div></section>" +
    (fech.length ? "<details class='card' style='padding:14px 18px'><summary style='cursor:pointer;font-weight:600'>Histórico · " + fech.length + "</summary><div style='display:grid;gap:8px;margin-top:10px'>" + fech.map(function (p) { return cart(p); }).join("") + "</div></details>" : "");
  box.querySelectorAll("[data-fd]").forEach(function (b) { b.onclick = async function () {
    var motivo = null;
    if (b.dataset.fe === "recusado") { motivo = prompt("Motivo da recusa (o colaborador vai ver):"); if (motivo === null) return; if (!motivo.trim()) { alert("Escreva o motivo."); return; } }
    b.disabled = true;
    try { FAR.adm = await farRpc("msb_fardas_decidir", {p_id: +b.dataset.fd, p_estado: b.dataset.fe, p_motivo: motivo}); fdmDesenhar(); }
    catch (e) { b.disabled = false; farMsg("#fdmMsg", "❌ " + e.message, true); }
  }; });
  var pdf = $("#fdmPdf"); if (pdf) pdf.onclick = function () { fdmPdf(R, apr, est); };
}
async function fdmPdf(R, apr, est) {
  await carregarPdfLib();
  var P = window.PDFLib, doc = await P.PDFDocument.create(), F = await doc.embedFont(P.StandardFonts.Helvetica), B = await doc.embedFont(P.StandardFonts.HelveticaBold);
  var pg = doc.addPage([595.28, 841.89]), x0 = 46, x1 = 549, y = 790, az = P.rgb(0.043, 0.239, 0.569), cinz = P.rgb(0.39, 0.45, 0.55), preto = P.rgb(0.08, 0.13, 0.24), fundo = P.rgb(0.957, 0.969, 0.984);
  var safe = function (t) { return String(t).replace(/[^\x20-\x7E\xA0-\xFF–—‘’“”•…€×]/g, "?").replace(/×/g, "x"); };
  var txt = function (t, x, s, f, c) { pg.drawText(safe(t), {x: x, y: y, size: s, font: f || F, color: c || preto}); };
  var dir = function (t, xr, s, f, c) { t = safe(t); pg.drawText(t, {x: xr - (f || F).widthOfTextAtSize(t, s), y: y, size: s, font: f || F, color: c || preto}); };
  txt("Encomenda de fardamento", x0, 19, B, az); dir("mystationbox", x1, 13, B, az); y -= 18;
  txt(est, x0, 11, B); dir("Emitido em " + new Date().toLocaleDateString("pt-PT", {timeZone: "Europe/Lisbon"}), x1, 9, F, cinz); y -= 10;
  pg.drawRectangle({x: x0, y: y, width: x1 - x0, height: 2.5, color: az}); y -= 26;
  pg.drawRectangle({x: x0, y: y - 7, width: x1 - x0, height: 22, color: az});
  txt("Peça", x0 + 8, 10.5, B, P.rgb(1, 1, 1)); txt("Tamanho", 330, 10.5, B, P.rgb(1, 1, 1)); dir("Quantidade", x1 - 8, 10.5, B, P.rgb(1, 1, 1)); y -= 22;
  var tot = 0;
  R.forEach(function (r, i) { if (i % 2) pg.drawRectangle({x: x0, y: y - 7, width: x1 - x0, height: 21, color: fundo}); txt(r.nome, x0 + 8, 10.5); txt(FARDAS.TAM_PT[r.tamanho], 330, 10.5); dir(String(r.qtd), x1 - 8, 10.5); tot += r.qtd; y -= 21; });
  pg.drawRectangle({x: x0, y: y + 12, width: x1 - x0, height: 1.5, color: az}); y -= 4; txt("Total de peças", x0 + 8, 10.5, B); dir(String(tot), x1 - 8, 10.5, B); y -= 34;
  txt("Por colaborador", x0, 12, B, az); y -= 18;
  apr.forEach(function (p) { if (y < 70) return; txt(p.quem + ": " + FARDAS.itensTxt(p.itens), x0, 10); y -= 15; });
  pg.drawLine({start: {x: x0, y: 42}, end: {x: x1, y: 42}, thickness: 0.5, color: P.rgb(0.85, 0.88, 0.93)}); y = 30;
  txt("mystationbox · Fardamento · encomenda no portal de gestão logística da Repsol", x0, 8, F, cinz);
  ptfDescarregar(new Blob([await doc.save()], {type: "application/pdf"}), "fardamento-" + EST + "-" + new Date().toISOString().slice(0, 10) + ".pdf");
}
window.carregarFarda = carregarFarda; window.carregarFdm = carregarFdm; window.fardaObrigatoria = fardaObrigatoria;
