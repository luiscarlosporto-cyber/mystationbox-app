/* mystationbox · Dia a dia → Avarias (dono, 25/11/2026; spec em docs/superpowers/specs/2026-11-25-avarias-design.md).
 * «Comunicar avaria»: foto → título → prioridade → Enviar (o resto é opcional; estação, data, hora e utilizador são automáticos).
 * «Gestão de avarias»: quadro por estado, filtros, ficha com fotos, comentários, histórico, responsável e solução.
 * Quem pode o quê está em avarias_regras.js (para mostrar só os botões certos); quem decide é a base de dados (msb_avaria_*).
 * Fotografias: reduzidas no telemóvel a 1600 px em JPEG (sem dados de localização), bucket privado msb-avarias. */
"use strict";
var AV = {lista: [], fotosN: {}, cats: [], equip: {}, filtro: {}, aba: "aberta", novas: [], pedido: null, ficha: null, aEnviar: false};
var AV_BUCKET = "msb-avarias";
function avAdmin() { return !!(window.PERFIL && PERFIL.role === "admin"); }   // só dois perfis: administrador e colaborador (dono, 25/11/2026)
function avUUID() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  var b = new Uint8Array(16); crypto.getRandomValues(b); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  var h = Array.prototype.map.call(b, function (x) { return x.toString(16).padStart(2, "0"); }).join("");
  return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
}
function falhouAv(e) { var m = falhou(e); return /msb_avaria|does not exist|schema cache|42P01|42883|PGRST20/i.test(m + " " + (e && e.code || "")) ? "As avarias ainda não estão ativas na base de dados." : m; }
function avEst(id) { var e = (ESTS || []).find(function (x) { return x.id === id; }); return e ? (e.short_name || e.name) : id; }
function avNum(a) { return AVARIAS.numeroTxt(a.estacao, a.numero); }
function avDataHora(t) { var d = new Date(t); return d.toLocaleDateString("pt-PT", {timeZone: "Europe/Lisbon"}) + " " + d.toLocaleTimeString("pt-PT", {timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit"}); }
function avPri(id) { var p = AVARIAS.prioridade(id) || {}; return "<span class='avPri p-" + id + "'><i class='avDot'></i>" + esc(p.txt || id) + "</span>"; }
function avEstado(id) { var e = AVARIAS.estado(id) || {}; return "<span class='avEst e-" + id + "'>" + (e.ic || "") + " " + esc(e.txt || id) + "</span>"; }
function avMeuNome() { return (window.PERFIL && PERFIL.display_name) || (window.EU && EU.email) || ""; }

async function avListas() {
  if (AV.cats.length) return;
  var c = await sb.from("msb_avarias_categorias").select("id,nome,ordem").eq("ativa", true).order("ordem");
  if (c.error) throw c.error; AV.cats = c.data || [];
  var e = await sb.from("msb_equipamentos").select("id,estacao,nome").eq("ativo", true).order("nome");
  if (e.error) throw e.error; AV.equip = {}; (e.data || []).forEach(function (x) { (AV.equip[x.estacao] = AV.equip[x.estacao] || []).push(x); });
}

/* ================= Comunicar avaria ================= */
async function carregarAvNova() {
  var box = $("#avnCorpo"); if (!box) return;
  if (!AV.pedido) AV.pedido = avUUID();
  try { await avListas(); } catch (e) { box.innerHTML = "<div class='aviso'>⚠ " + esc(falhouAv(e)) + "</div>"; return; }
  if (!(ESTS || []).length) { box.innerHTML = "<div class='aviso'>A sua conta não tem nenhuma estação. Peça ao administrador para lhe dar acesso.</div>"; return; }
  var est = AV.estNova || EST, eq = AV.equip[est] || [];
  box.innerHTML = "<div class='card avNova'>" +
    "<div class='avNova-cab'><h2>Comunicar avaria</h2>" + ((ESTS || []).length > 1 ? "<select id='avnEst' aria-label='Estação'>" + ESTS.map(function (e) { return "<option value='" + e.id + "'" + (e.id === est ? " selected" : "") + ">" + esc(e.short_name || e.name) + "</option>"; }).join("") + "</select>" : "<span class='avChip'>" + esc(avEst(est)) + "</span>") + "</div>" +
    "<div class='avFotosBtn'><label class='avBigBtn'><input type='file' id='avnCam' accept='image/*' capture='environment' hidden><svg class='avIc' viewBox='0 0 24 24' aria-hidden='true'><path d='M4 8h3l2-3h6l2 3h3v11H4z'/><circle cx='12' cy='13' r='3.5'/></svg><span>Tirar fotografia</span></label>" +
    "<label class='avBigBtn sec'><input type='file' id='avnGal' accept='image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif' multiple hidden><svg class='avIc' viewBox='0 0 24 24' aria-hidden='true'><rect x='3' y='4' width='18' height='16' rx='2'/><circle cx='9' cy='10' r='2'/><path d='M21 16l-5-5-9 9'/></svg><span>Galeria</span></label></div>" +
    "<div id='avnMini' class='avMini'></div>" +
    "<label class='avCampo'>O que aconteceu? <input id='avnTit' maxlength='120' autocomplete='off' placeholder='Ex.: Bomba 3 não dá gasóleo'></label>" +
    "<div class='avCampo'>Prioridade<div class='avPriSel' role='radiogroup' aria-label='Prioridade'>" + AVARIAS.PRIORIDADES.map(function (p) {
      return "<button type='button' role='radio' aria-checked='false' class='p-" + p.id + "' data-p='" + p.id + "'><i class='avDot'></i><span>" + p.txt + "</span></button>"; }).join("") + "</div></div>" +
    "<details class='avMais'><summary>Mais detalhes (opcional)</summary>" +
    "<label class='avCampo'>Descrição <textarea id='avnDesc' rows='3' maxlength='4000' placeholder='O que se vê, desde quando, o que já foi tentado…'></textarea></label>" +
    "<label class='avCampo'>Categoria <select id='avnCat'><option value=''>—</option>" + AV.cats.map(function (c) { return "<option value='" + c.id + "'>" + esc(c.nome) + "</option>"; }).join("") + "</select></label>" +
    "<label class='avCampo'>Equipamento <input id='avnEq' list='avnEqL' maxlength='120' placeholder='Ex.: Bomba 3, Arca de gelados…'><datalist id='avnEqL'>" + eq.map(function (x) { return "<option value='" + esc(x.nome) + "'>"; }).join("") + "</datalist></label></details>" +
    "<p class='mut avAuto'>🕒 Data e hora automáticas · 👤 " + esc(avMeuNome()) + "</p>" +
    "<button class='btn p avEnviar' id='avnEnviar'>Enviar avaria</button><p id='avnMsg' class='avMsg' role='status'></p></div>";
  var pri = AV.priNova || "";
  function marcarPri() { $$("#avnCorpo .avPriSel button").forEach(function (b) { var on = b.dataset.p === pri; b.classList.toggle("on", on); b.setAttribute("aria-checked", on ? "true" : "false"); }); }
  $$("#avnCorpo .avPriSel button").forEach(function (b) { b.onclick = function () { pri = AV.priNova = b.dataset.p; marcarPri(); }; });
  marcarPri();
  if ($("#avnEst")) $("#avnEst").onchange = function () { AV.estNova = this.value; carregarAvNova(); };
  $("#avnCam").onchange = $("#avnGal").onchange = function () { avJuntarFotos(this.files); this.value = ""; };
  avMiniaturas();
  $("#avnTit").oninput = function () { avMsg(""); };
  $("#avnEnviar").onclick = function () { avEnviar(est, pri); };
}
function avJuntarFotos(files) {
  var msg = [];
  Array.prototype.forEach.call(files || [], function (f) {
    var erro = AVARIAS.validarFoto(f);
    if (erro) msg.push(erro); else if (AV.novas.length >= AVARIAS.MAX_FOTOS) msg.push("No máximo " + AVARIAS.MAX_FOTOS + " fotografias.");
    else AV.novas.push({f: f, url: URL.createObjectURL(f)});
  });
  avMiniaturas(); avMsg(msg.length ? msg.filter(function (x, i) { return msg.indexOf(x) === i; }).join(" ") : "", !msg.length);
}
function avMiniaturas() {
  var m = $("#avnMini"); if (!m) return;
  m.innerHTML = AV.novas.map(function (x, i) { return "<div class='avMiniF'><img src='" + x.url + "' alt='Fotografia " + (i + 1) + "'><button type='button' aria-label='Tirar a fotografia " + (i + 1) + "' data-i='" + i + "'>✕</button></div>"; }).join("");
  $$("#avnMini button").forEach(function (b) { b.onclick = function () { var x = AV.novas.splice(+b.dataset.i, 1)[0]; if (x) URL.revokeObjectURL(x.url); avMiniaturas(); }; });
}
function avMsg(t, ok) { var m = $("#avnMsg"); if (m) { m.textContent = t || ""; m.className = "avMsg " + (t ? (ok ? "ok" : "bad") : ""); } }

/* reduz a fotografia: lado maior 1600 px, JPEG 0,8. Voltar a desenhar no canvas tira os dados EXIF (incluindo a localização). */
async function avReduzir(f) {
  var img;
  try { img = await createImageBitmap(f, {imageOrientation: "from-image"}); }
  catch (e) {
    img = await new Promise(function (ok, ko) { var i = new Image(), u = URL.createObjectURL(f); i.onload = function () { URL.revokeObjectURL(u); ok(i); }; i.onerror = function () { URL.revokeObjectURL(u); ko(new Error("«" + f.name + "»: este aparelho não consegue abrir a fotografia. Tire-a de novo com a câmara.")); }; i.src = u; });
  }
  var d = AVARIAS.dimensoes(img.width, img.height), c = document.createElement("canvas"); c.width = d.w; c.height = d.h;
  c.getContext("2d").drawImage(img, 0, 0, d.w, d.h); if (img.close) img.close();
  return await new Promise(function (ok, ko) { c.toBlob(function (b) { b ? ok(b) : ko(new Error("Não foi possível preparar a fotografia.")); }, "image/jpeg", 0.8); });
}
async function avSubirFoto(a, f, fase) {
  var b = await avReduzir(f), caminho = a.estacao + "/" + a.id + "/" + avUUID() + ".jpg";
  var up = await sb.storage.from(AV_BUCKET).upload(caminho, b, {contentType: "image/jpeg", upsert: false});
  if (up.error) throw up.error;
  var r = await sb.rpc("msb_avaria_foto", {p_id: a.id, p_caminho: caminho, p_fase: fase, p_bytes: b.size, p_mime: "image/jpeg"});
  if (r.error) throw r.error;
}
async function avEnviar(est, pri) {
  if (AV.aEnviar) return;
  var tit = ($("#avnTit").value || "").trim();
  if (tit.length < 3) { avMsg("Escreva o que aconteceu (pelo menos 3 letras).", false); $("#avnTit").focus(); return; }
  if (!pri) { avMsg("Escolha a prioridade.", false); return; }
  var eqTxt = ($("#avnEq").value || "").trim(), eq = (AV.equip[est] || []).find(function (x) { return x.nome.toLowerCase() === eqTxt.toLowerCase(); });
  var b = $("#avnEnviar"); AV.aEnviar = true; b.disabled = true; avMsg("A enviar…", true);
  try {
    var r = await sb.rpc("msb_avaria_criar", {p_pedido: AV.pedido, p_estacao: est, p_titulo: tit, p_descricao: ($("#avnDesc").value || "").trim(),
      p_categoria: +$("#avnCat").value || null, p_equipamento: eq ? eq.id : null, p_equipamento_txt: eq ? null : eqTxt || null, p_prioridade: pri});
    if (r.error) throw r.error;
    var a = {id: r.data.id, numero: r.data.numero, estacao: r.data.estacao}, falhas = [];
    for (var i = 0; i < AV.novas.length; i++) {
      avMsg("A enviar fotografia " + (i + 1) + " de " + AV.novas.length + "…", true);
      try { await avSubirFoto(a, AV.novas[i].f, "abertura"); } catch (e) { falhas.push((i + 1) + ": " + falhouAv(e)); }
    }
    AV.novas.forEach(function (x) { URL.revokeObjectURL(x.url); });
    AV.novas = []; AV.pedido = avUUID(); AV.priNova = ""; AV.lista = [];
    $("#avnCorpo").innerHTML = "<div class='card avFeito'><div class='avFeito-ic'>✅</div><h2>Avaria " + esc(avNum(a)) + " comunicada</h2>" +
      "<p>" + (pri === "critica" ? "Os administradores receberam um <b>alerta urgente</b>." : "Os administradores foram avisados.") + "</p>" +
      (falhas.length ? "<div class='aviso'>⚠ A avaria ficou registada, mas " + (falhas.length === 1 ? "uma fotografia não foi enviada" : falhas.length + " fotografias não foram enviadas") + " (" + esc(falhas.join("; ")) + "). Pode juntá-las na ficha da avaria.</div>" : "") +
      "<div class='bar'><button class='btn p' id='avnVer'>Ver a avaria</button><button class='btn' id='avnOutra'>Comunicar outra</button></div></div>";
    $("#avnVer").onclick = function () { avAbrirNumero(a.estacao, a.numero); };
    $("#avnOutra").onclick = function () { carregarAvNova(); };
  } catch (e) { avMsg("⚠ " + falhouAv(e), false); b.disabled = false; }
  finally { AV.aEnviar = false; }
}

/* ================= Gestão de avarias ================= */
async function avCarregarLista() {
  var r = await lerTudo(function () { return sb.from("msb_avarias").select("id,estacao,numero,titulo,prioridade,estado,criado_em,criado_por,criado_nome,responsavel,responsavel_nome,tecnico_externo,concluido_em,atualizado_em"); }, ["id"]);
  if (r.error) throw r.error;
  var f = await lerTudo(function () { return sb.from("msb_avarias_fotos").select("id,avaria_id"); }, ["id"]);
  if (f.error) throw f.error;
  AV.lista = r.data || []; AV.fotosN = {}; (f.data || []).forEach(function (x) { AV.fotosN[x.avaria_id] = (AV.fotosN[x.avaria_id] || 0) + 1; });
}
async function carregarAvGestao() {
  var box = $("#avgCorpo"); if (!box) return;
  if (!AV.lista.length) box.innerHTML = "<div class='mut'>A carregar…</div>";
  try { await avListas(); await avCarregarLista(); } catch (e) { box.innerHTML = "<div class='aviso'>⚠ " + esc(falhouAv(e)) + "</div>"; return; }
  avDesenharGestao();
}
function avDesenharGestao() {
  var box = $("#avgCorpo"); if (!box) return;
  var F = AV.filtro, varias = (ESTS || []).length > 1;
  var L = AVARIAS.ordenar(AVARIAS.filtrar(AV.lista, {estacao: F.estacao, prioridade: F.prioridade, de: F.de, ate: F.ate}));
  var porEst = {}; AVARIAS.ESTADOS.forEach(function (e) { porEst[e.id] = L.filter(function (x) { return x.estado === e.id; }); });
  /* concluídas: as mais recentes primeiro e só as últimas 30, se não houver datas no filtro */
  porEst.concluida.sort(function (a, b) { return String(b.concluido_em).localeCompare(String(a.concluido_em)); });
  var maisC = !F.de && !F.ate && porEst.concluida.length > 30 ? porEst.concluida.length - 30 : 0; if (maisC) porEst.concluida = porEst.concluida.slice(0, 30);
  var abertas = AV.lista.filter(function (x) { return x.estado !== "concluida"; }), crit = abertas.filter(function (x) { return x.prioridade === "critica"; }).length;
  box.innerHTML = "<div class='avTopo'><div><h2>Avarias</h2><p class='mut'>" + abertas.length + (abertas.length === 1 ? " por resolver" : " por resolver") + (crit ? " · <b class='bad'>🔴 " + crit + (crit === 1 ? " crítica" : " críticas") + "</b>" : "") + "</p></div><button class='btn p' id='avgNova'>＋ Comunicar avaria</button></div>" +
    "<div class='card avFiltros'>" +
    (varias ? "<label>Estação<select id='avfEst'><option value=''>Todas</option>" + ESTS.map(function (e) { return "<option value='" + e.id + "'" + (F.estacao === e.id ? " selected" : "") + ">" + esc(e.short_name || e.name) + "</option>"; }).join("") + "</select></label>" : "") +
    "<label>Prioridade<select id='avfPri'><option value=''>Todas</option>" + AVARIAS.PRIORIDADES.slice().reverse().map(function (p) { return "<option value='" + p.id + "'" + (F.prioridade === p.id ? " selected" : "") + ">" + p.ic + " " + p.txt + "</option>"; }).join("") + "</select></label>" +
    "<label>Estado<select id='avfEstado'><option value=''>Todos</option>" + AVARIAS.ESTADOS.map(function (e) { return "<option value='" + e.id + "'" + (F.estado === e.id ? " selected" : "") + ">" + e.txt + "</option>"; }).join("") + "</select></label>" +
    "<label>De<input type='date' id='avfDe' value='" + (F.de || "") + "'></label><label>Até<input type='date' id='avfAte' value='" + (F.ate || "") + "'></label>" +
    (F.estacao || F.prioridade || F.estado || F.de || F.ate ? "<button class='btn' id='avfLimpar'>Limpar</button>" : "") + "</div>" +
    "<div class='avAbas' role='tablist'>" + AVARIAS.ESTADOS.map(function (e) { return "<button role='tab' data-e='" + e.id + "' aria-selected='" + (AV.aba === e.id) + "'" + (AV.aba === e.id ? " class='on'" : "") + ">" + e.pl + " <i>" + porEst[e.id].length + "</i></button>"; }).join("") + "</div>" +
    "<div class='avQuadro'>" + AVARIAS.ESTADOS.filter(function (e) { return !F.estado || F.estado === e.id; }).map(function (e) {
      var C = porEst[e.id];
      return "<section class='avCol" + (AV.aba === e.id ? " on" : "") + "' data-e='" + e.id + "'><h3>" + e.ic + " " + e.pl + " <i>" + C.length + "</i></h3>" +
        (C.length ? C.map(function (a) { return avCartao(a, varias); }).join("") : "<p class='mut avVazio'>Sem avarias</p>") +
        (e.id === "concluida" && maisC ? "<p class='mut avVazio'>+ " + maisC + " mais antigas: use as datas para as ver.</p>" : "") + "</section>";
    }).join("") + "</div>";
  $("#avgNova").onclick = function () { ir("avn"); };
  function filtro(k, el) { if (el) el.onchange = function () { AV.filtro[k] = this.value || ""; avDesenharGestao(); }; }
  filtro("estacao", $("#avfEst")); filtro("prioridade", $("#avfPri")); filtro("estado", $("#avfEstado")); filtro("de", $("#avfDe")); filtro("ate", $("#avfAte"));
  if ($("#avfLimpar")) $("#avfLimpar").onclick = function () { AV.filtro = {}; avDesenharGestao(); };
  $$("#avgCorpo .avAbas button").forEach(function (b) { b.onclick = function () { AV.aba = b.dataset.e; avDesenharGestao(); }; });
  $$("#avgCorpo .avCartao").forEach(function (c) { c.onclick = function () { avAbrirFicha(+c.dataset.id); }; });
}
function avCartao(a, varias) {
  var n = AV.fotosN[a.id] || 0;
  return "<button class='avCartao p-" + a.prioridade + "' data-id='" + a.id + "'><span class='avCartao-l1'><b class='avNum'>" + esc(avNum(a)) + "</b>" + avPri(a.prioridade) + "</span>" +
    "<span class='avCartao-tit'>" + esc(a.titulo) + "</span>" +
    "<span class='avCartao-meta'>" + esc(AVARIAS.idade(a.criado_em)) + (n ? " · 📷 " + n : "") + (a.responsavel_nome ? " · 👤 " + esc(a.responsavel_nome) : " · <i>sem responsável</i>") + (varias ? " · " + esc(avEst(a.estacao)) : "") + "</span></button>";
}

/* ================= Ficha ================= */
async function avAbrirNumero(est, numero) {
  if (window.PAGINA !== "avg" && window.ir) ir("avg");
  try {
    var r = await sb.from("msb_avarias").select("id").eq("estacao", est).eq("numero", numero).maybeSingle();
    if (r.error) throw r.error;
    if (!r.data) { if (window.MSB_NAV) MSB_NAV.confirma("A avaria " + AVARIAS.numeroTxt(est, numero) + " não existe ou não é de uma estação a que tenha acesso.", "OK"); return; }
    avAbrirFicha(r.data.id);
  } catch (e) { alert(falhouAv(e)); }
}
async function avAbrirFicha(id) {
  var d = $("#avFicha");
  if (!d) {
    d = document.createElement("dialog"); d.id = "avFicha"; d.className = "avDlg";
    d.onclose = function () { AV.ficha = null; d.remove(); };
    d.addEventListener("click", function (e) { if (e.target === d) d.close(); });
    document.body.appendChild(d); d.showModal();
  }
  AV.ficha = id;
  d.innerHTML = "<div class='avDlg-cab'><b>A carregar…</b><button class='np-x' aria-label='Fechar'>✕</button></div>";
  d.querySelector(".np-x").onclick = function () { d.close(); };
  try {
    var q = await Promise.all([
      sb.from("msb_avarias").select("*").eq("id", id).maybeSingle(),
      sb.from("msb_avarias_fotos").select("id,caminho,fase,criado_em").eq("avaria_id", id).order("id"),
      sb.from("msb_avarias_historico").select("id,tipo,texto,antes,depois,por_nome,em").eq("avaria_id", id).order("id")
    ]);
    q.forEach(function (x) { if (x.error) throw x.error; });
    var a = q[0].data; if (!a) throw new Error("Avaria não encontrada.");
    var fotos = q[1].data || [], hist = q[2].data || [], urls = {};
    if (fotos.length) {
      var s = await sb.storage.from(AV_BUCKET).createSignedUrls(fotos.map(function (f) { return f.caminho; }), 300);
      (s.data || []).forEach(function (x) { if (x.signedUrl) urls[x.path] = x.signedUrl; });
    }
    if (AV.ficha !== id) return;
    var resp = [];
    if (avAdmin() && a.estado !== "concluida") { var rr = await sb.rpc("msb_avaria_responsaveis", {p_estacao: a.estacao}); resp = rr.data || []; }
    avDesenharFicha(d, a, fotos, urls, hist, resp);
  } catch (e) { d.querySelector(".avDlg-cab b").textContent = "⚠ " + falhouAv(e); }
}
function avDesenharFicha(d, a, fotos, urls, hist, resp) {
  var q = {admin: avAdmin(), eu: EU.id, avaria: a}, cat = AV.cats.find(function (c) { return c.id === a.categoria_id; });
  var eq = a.equipamento_id ? ((AV.equip[a.estacao] || []).find(function (x) { return x.id === a.equipamento_id; }) || {}).nome : a.equipamento_txt;
  function galeria(fase, titulo) {
    var F = fotos.filter(function (f) { return f.fase === fase; }); if (!F.length) return "";
    return "<div class='avSec'><h4>" + titulo + " <i>" + F.length + "</i></h4><div class='avGal'>" + F.map(function (f) {
      return urls[f.caminho] ? "<a href='" + esc(urls[f.caminho]) + "' target='_blank' rel='noopener'><img loading='lazy' src='" + esc(urls[f.caminho]) + "' alt='Fotografia de " + esc(avDataHora(f.criado_em)) + "'></a>" : "<span class='avGalFalta'>📷</span>";
    }).join("") + "</div></div>";
  }
  var H = {criada: "🆕", comentario: "💬", estado: "🔁", prioridade: "⚑", atribuida: "👤", foto: "📷", concluida: "✅", reaberta: "↩️"};
  function linhaHist(h) {
    var o = "";
    if (h.tipo === "criada") o = "Comunicou a avaria" + (h.depois ? " · prioridade " + (AVARIAS.prioridade(h.depois) || {}).txt : "");
    else if (h.tipo === "estado") o = (AVARIAS.estado(h.antes) || {}).txt + " → <b>" + (AVARIAS.estado(h.depois) || {}).txt + "</b>";
    else if (h.tipo === "prioridade") o = "Prioridade: " + (AVARIAS.prioridade(h.antes) || {}).txt + " → <b>" + (AVARIAS.prioridade(h.depois) || {}).txt + "</b>";
    else if (h.tipo === "atribuida") o = "Responsável: " + esc(h.antes || "—") + " → <b>" + esc(h.depois || "—") + "</b>";
    else if (h.tipo === "foto") o = esc(h.texto);
    else if (h.tipo === "concluida") o = "<b>Concluiu</b> a avaria";
    else if (h.tipo === "reaberta") o = "<b>Reabriu</b> a avaria";
    else o = "Comentou";
    var txt = h.texto && ["comentario", "concluida", "reaberta", "estado"].indexOf(h.tipo) >= 0 ? "<p>" + esc(h.texto) + "</p>" : (h.tipo === "criada" && h.texto ? "<p>" + esc(h.texto) + "</p>" : "");
    return "<li class='h-" + h.tipo + "'><i>" + (H[h.tipo] || "•") + "</i><div><span><b>" + esc(h.por_nome) + "</b> · " + o + "</span><small>" + esc(avDataHora(h.em)) + "</small>" + txt + "</div></li>";
  }
  var acoes = "";
  if (AVARIAS.pode("estado", q)) acoes += "<div class='avSec'><h4>Estado</h4><div class='avSeg'>" + AVARIAS.ESTADOS.filter(function (e) { return e.id !== "concluida"; }).map(function (e) {
    return "<button data-estado='" + e.id + "'" + (a.estado === e.id ? " class='on' aria-pressed='true' disabled" : "") + ">" + e.ic + " " + e.txt + "</button>"; }).join("") + "</div>" +
    "<label class='avCampo'>Prioridade <select id='avfPriF'>" + AVARIAS.PRIORIDADES.map(function (p) { return "<option value='" + p.id + "'" + (p.id === a.prioridade ? " selected" : "") + ">" + p.ic + " " + p.txt + "</option>"; }).join("") + "</select></label></div>";
  if (AVARIAS.pode("atribuir", q)) acoes += "<div class='avSec'><h4>Responsável</h4><div class='avLinha'><select id='avfResp' aria-label='Responsável'><option value=''>— sem responsável —</option>" + resp.map(function (p) {
    return "<option value='" + p.user_id + "'" + (p.user_id === a.responsavel ? " selected" : "") + ">" + esc(p.nome) + (p.admin ? " (administrador)" : "") + "</option>"; }).join("") + "</select>" +
    "<input id='avfTec' maxlength='200' placeholder='Técnico externo (opcional)' value='" + esc(a.tecnico_externo || "") + "'><button class='btn' id='avfAtribuir'>Guardar</button></div></div>";
  if (AVARIAS.pode("concluir", q)) acoes += "<div class='avSec avConcluir'><h4>Concluir</h4><label class='avCampo'>Solução aplicada <textarea id='avfSol' rows='3' maxlength='4000' placeholder='O que foi feito para resolver'></textarea></label><button class='btn p' id='avfConcluir'>✅ Concluir avaria</button></div>";
  if (AVARIAS.pode("reabrir", q)) acoes += "<div class='avSec'><h4>Reabrir</h4><div class='avLinha'><input id='avfMotivo' maxlength='300' placeholder='Motivo (obrigatório)'><button class='btn' id='avfReabrir'>↩️ Reabrir</button></div></div>";
  var fase = a.estado === "aberta" ? "abertura" : "resolucao";
  d.innerHTML = "<div class='avDlg-cab'><b>" + esc(avNum(a)) + " · " + esc(avEst(a.estacao)) + "</b><button class='np-x' aria-label='Fechar'>✕</button></div>" +
    "<div class='avDlg-corpo'><div class='avFichaTopo p-" + a.prioridade + "'><h2>" + esc(a.titulo) + "</h2><div class='avLinha'>" + avPri(a.prioridade) + avEstado(a.estado) + "</div></div>" +
    "<dl class='avDados'><dt>Comunicada</dt><dd>" + esc(avDataHora(a.criado_em)) + " · " + esc(a.criado_nome) + "</dd>" +
    (cat ? "<dt>Categoria</dt><dd>" + esc(cat.nome) + "</dd>" : "") + (eq ? "<dt>Equipamento</dt><dd>" + esc(eq) + "</dd>" : "") +
    "<dt>Responsável</dt><dd>" + (a.responsavel_nome ? esc(a.responsavel_nome) : "<i class='mut'>sem responsável</i>") + (a.tecnico_externo ? " · técnico: " + esc(a.tecnico_externo) : "") + "</dd>" +
    (a.concluido_em ? "<dt>Concluída</dt><dd>" + esc(avDataHora(a.concluido_em)) + "</dd><dt>Solução</dt><dd class='avSol'>" + esc(a.solucao) + "</dd>" : "") + "</dl>" +
    (a.descricao ? "<div class='avSec'><h4>Descrição</h4><p class='avTexto'>" + esc(a.descricao) + "</p></div>" : "") +
    galeria("abertura", "Fotografias") + galeria("resolucao", "Fotografias da resolução") +
    "<div class='avSec'><label class='btn avJuntar'><input type='file' id='avfFoto' accept='image/*' multiple hidden>📷 Juntar fotografia" + (fase === "resolucao" ? " da resolução" : "") + "</label><span id='avfFotoMsg' class='mut'></span></div>" +
    acoes +
    "<div class='avSec'><h4>Comentários e histórico</h4><div class='avLinha avComentar'><textarea id='avfCom' rows='2' maxlength='2000' placeholder='Escrever um comentário…'></textarea><button class='btn p' id='avfComBtn'>Enviar</button></div>" +
    "<ol class='avHist'>" + hist.slice().reverse().map(linhaHist).join("") + "</ol><p class='mut avNota'>🔒 O histórico não pode ser alterado nem apagado.</p></div>" +
    "<p id='avfMsg' class='avMsg' role='status'></p></div>";
  d.querySelector(".np-x").onclick = function () { d.close(); };
  function msg(t, ok) { var m = d.querySelector("#avfMsg"); m.textContent = t; m.className = "avMsg " + (ok ? "ok" : "bad"); m.scrollIntoView({block: "nearest"}); }
  async function fazer(rpc, args, el) {
    if (el) el.disabled = true;
    try { var r = await sb.rpc(rpc, args); if (r.error) throw r.error; AV.lista = []; avAbrirFicha(a.id); if (window.PAGINA === "avg") carregarAvGestao(); }
    catch (e) { msg("⚠ " + falhouAv(e), false); if (el) el.disabled = false; }
  }
  d.querySelectorAll("[data-estado]").forEach(function (b) { b.onclick = function () { fazer("msb_avaria_estado", {p_id: a.id, p_estado: b.dataset.estado, p_texto: null}, b); }; });
  var pf = d.querySelector("#avfPriF"); if (pf) pf.onchange = function () { fazer("msb_avaria_prioridade", {p_id: a.id, p_prioridade: pf.value}, pf); };
  var at = d.querySelector("#avfAtribuir"); if (at) at.onclick = function () { fazer("msb_avaria_atribuir", {p_id: a.id, p_user: d.querySelector("#avfResp").value || null, p_tecnico: d.querySelector("#avfTec").value.trim() || null}, at); };
  var cc = d.querySelector("#avfConcluir"); if (cc) cc.onclick = async function () {
    var s = d.querySelector("#avfSol").value.trim(); if (s.length < 3) { msg("Descreva a solução aplicada.", false); d.querySelector("#avfSol").focus(); return; }
    if (await msbConfirma("Concluir a avaria " + avNum(a) + "? Quem a comunicou é avisado.", "Concluir")) fazer("msb_avaria_concluir", {p_id: a.id, p_solucao: s}, cc);
  };
  var ra = d.querySelector("#avfReabrir"); if (ra) ra.onclick = function () { var m = d.querySelector("#avfMotivo").value.trim(); if (m.length < 3) { msg("Escreva o motivo para reabrir.", false); return; } fazer("msb_avaria_reabrir", {p_id: a.id, p_motivo: m}, ra); };
  d.querySelector("#avfComBtn").onclick = function () { var t = d.querySelector("#avfCom").value.trim(); if (!t) return; fazer("msb_avaria_comentar", {p_id: a.id, p_texto: t}, this); };
  d.querySelector("#avfFoto").onchange = async function () {
    var L = Array.prototype.slice.call(this.files || []), out = d.querySelector("#avfFotoMsg"), erros = []; this.value = "";
    for (var i = 0; i < L.length; i++) {
      var e = AVARIAS.validarFoto(L[i]); if (e) { erros.push(e); continue; }
      out.textContent = "A enviar " + (i + 1) + " de " + L.length + "…";
      try { await avSubirFoto(a, L[i], fase); } catch (x) { erros.push(falhouAv(x)); }
    }
    out.textContent = ""; if (erros.length) msg("⚠ " + erros.join(" "), false); else { AV.lista = []; avAbrirFicha(a.id); }
  };
}
/* nova notificação em tempo real: se a avaria está aberta no ecrã, volta a ler */
function avAtualizar(n) {
  if (n && AV.ficha && n.avaria_id === AV.ficha) avAbrirFicha(AV.ficha);
  if (window.PAGINA === "avg") carregarAvGestao(); else AV.lista = [];
}
window.carregarAvNova = carregarAvNova; window.carregarAvGestao = carregarAvGestao; window.avAbrirNumero = avAbrirNumero; window.avAtualizar = avAtualizar;
