/* mystationbox · Dia a dia → Avarias (dono, 25/11/2026; spec em docs/superpowers/specs/2026-11-25-avarias-design.md).
 * «Comunicar avaria»: foto → título → prioridade → Enviar (o resto é opcional; estação, data, hora e utilizador são automáticos).
 * «Gestão de avarias»: quadro por estado, filtros, ficha com fotos, comentários, histórico, responsável e solução.
 * Quem pode o quê está em avarias_regras.js (para mostrar só os botões certos); quem decide é a base de dados (msb_avaria_*).
 * Fotografias: reduzidas no telemóvel a 1600 px em JPEG (sem dados de localização), bucket privado msb-avarias. */
"use strict";
var AV = {lista: [], fotosN: {}, cats: [], equip: {}, prest: {}, filtro: {}, aba: "aberta", novas: [], pedido: null, ficha: null, aEnviar: false};
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
function avNum(a) { return AVARIAS.numeroTxt(a.estacao, a.numero, a.ano); }
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
  await avPrestadores();
}
/* prestadores de serviço por estação (26/11/2026); se a tabela ainda não existir, as avarias continuam a funcionar sem eles */
async function avPrestadores() {
  // contactos e envio automático só o administrador lê (função); o colaborador lê só o nome
  var p = avAdmin() ? await sb.rpc("msb_av_prestadores_contactos") : await sb.from("msb_av_prestadores").select("id,estacao,nome,ordem,ativo").order("ordem").order("nome");
  if (p.error && avAdmin()) p = await sb.from("msb_av_prestadores").select("id,estacao,nome,ordem,ativo").order("ordem").order("nome");
  AV.prest = {}; if (p.error) return;
  if (avAdmin()) { var m = await sb.from("msb_av_email_modelos").select("estacao,prestador_id,assunto,corpo"); AV.modelos = m.error ? [] : (m.data || []); }
  (p.data || []).forEach(function (x) { (AV.prest[x.estacao] = AV.prest[x.estacao] || []).push(x); });
}
function avPrest(a) { var id = a && a.prestador_id; if (!id) return null; var L = AV.prest[a.estacao] || []; return L.find(function (x) { return x.id === id; }) || null; }
function avDia(d) { return d ? d.split("-").reverse().join("/") : ""; }
function avPassos(a) {
  return "<ol class='avPassos'>" + AVARIAS.passos(a).map(function (p) { return "<li class='" + (p.atual ? "atual" : p.feito ? "feito" : "") + "'><i></i><span>" + esc(p.txt) + "</span></li>"; }).join("") + "</ol>";
}

/* ================= Comunicar avaria ================= */
async function carregarAvNova() {
  var box = $("#avnCorpo"); if (!box) return;
  if (!AV.pedido) AV.pedido = avUUID();
  try { await avListas(); } catch (e) { box.innerHTML = "<div class='aviso'>⚠ " + esc(falhouAv(e)) + "</div>"; return; }
  if (!(ESTS || []).length) { box.innerHTML = "<div class='aviso'>A sua conta não tem nenhuma estação. Peça ao administrador para lhe dar acesso.</div>"; return; }
  var est = EST, eq = AV.equip[est] || [];
  box.innerHTML = "<div class='card avNova'>" +
    "<div class='avNova-cab'><h2>Comunicar avaria</h2>" + ("<span class='avChip'>" + esc(avEst(est)) + "</span>") + "</div>" +
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
    var a = {id: r.data.id, numero: r.data.numero, estacao: r.data.estacao, ano: r.data.ano}, falhas = [];
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
    $("#avnVer").onclick = function () { avAbrirNumero(a.estacao, a.numero, a.ano); };
    $("#avnOutra").onclick = function () { carregarAvNova(); };
  } catch (e) { avMsg("⚠ " + falhouAv(e), false); b.disabled = false; }
  finally { AV.aEnviar = false; }
}

/* ================= Gestão de avarias ================= */
async function avCarregarLista() {
  var r = await lerTudo(function () { return sb.from("msb_avarias").select("id,estacao,numero,ano,titulo,prioridade,estado,criado_em,criado_por,criado_nome,responsavel,responsavel_nome,tecnico_externo,concluido_em,atualizado_em,prestador_id,visita_prevista,aguarda_peca,encaminhada_em"); }, ["id"]);
  if (r.error && /ano|prestador_id|visita_prevista|aguarda_peca|encaminhada_em/.test(r.error.message || "")) r = await lerTudo(function () { return sb.from("msb_avarias").select("id,estacao,numero,titulo,prioridade,estado,criado_em,criado_por,criado_nome,responsavel,responsavel_nome,tecnico_externo,concluido_em,atualizado_em"); }, ["id"]);
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
  /* cada estação no seu ambiente: só se vê a estação escolhida no topo (pedido do dono, 26/11/2026) */
  var F = AV.filtro, varias = false, LE = AV.lista.filter(function (x) { return x.estacao === EST; });
  var L = AVARIAS.ordenar(AVARIAS.filtrar(LE, {estacao: EST, prioridade: F.prioridade, de: F.de, ate: F.ate}));
  if (F.prest) L = L.filter(function (x) { var p = avPrest(x); return F.prest === "-" ? !p : p && p.nome === F.prest; });
  var nomesP = []; (AV.prest[EST] ? [EST] : []).forEach(function (k) { AV.prest[k].forEach(function (p) { if (p.ativo && nomesP.indexOf(p.nome) < 0) nomesP.push(p.nome); }); });
  var porEst = {}; AVARIAS.ESTADOS.forEach(function (e) { porEst[e.id] = L.filter(function (x) { return x.estado === e.id; }); });
  /* concluídas: as mais recentes primeiro e só as últimas 30, se não houver datas no filtro */
  porEst.concluida.sort(function (a, b) { return String(b.concluido_em).localeCompare(String(a.concluido_em)); });
  var maisC = !F.de && !F.ate && porEst.concluida.length > 30 ? porEst.concluida.length - 30 : 0; if (maisC) porEst.concluida = porEst.concluida.slice(0, 30);
  var abertas = LE.filter(function (x) { return x.estado !== "concluida"; }), crit = abertas.filter(function (x) { return x.prioridade === "critica"; }).length;
  box.innerHTML = "<div class='avTopo'><div><h2>Avarias · " + esc(avEst(EST)) + "</h2><p class='mut'>" + abertas.length + (abertas.length === 1 ? " por resolver" : " por resolver") + (crit ? " · <b class='bad'>🔴 " + crit + (crit === 1 ? " crítica" : " críticas") + "</b>" : "") + "</p></div><div class='avLinha'>" + (avAdmin() && Object.keys(AV.prest).length ? "<button class='btn' id='avgPrest'>Prestadores</button>" : "") + "<button class='btn p' id='avgNova'>＋ Comunicar avaria</button></div></div>" +
    "<div class='card avFiltros'>" +
    "<label>Prioridade<select id='avfPri'><option value=''>Todas</option>" + AVARIAS.PRIORIDADES.slice().reverse().map(function (p) { return "<option value='" + p.id + "'" + (F.prioridade === p.id ? " selected" : "") + ">" + p.ic + " " + p.txt + "</option>"; }).join("") + "</select></label>" +
    "<label>Estado<select id='avfEstado'><option value=''>Todos</option>" + AVARIAS.ESTADOS.map(function (e) { return "<option value='" + e.id + "'" + (F.estado === e.id ? " selected" : "") + ">" + e.txt + "</option>"; }).join("") + "</select></label>" +
    (nomesP.length ? "<label>Prestador<select id='avfPrest'><option value=''>Todos</option><option value='-'" + (F.prest === "-" ? " selected" : "") + ">Por encaminhar</option>" + nomesP.map(function (n) { return "<option" + (F.prest === n ? " selected" : "") + ">" + esc(n) + "</option>"; }).join("") + "</select></label>" : "") +
    "<label>De<input type='date' id='avfDe' value='" + (F.de || "") + "'></label><label>Até<input type='date' id='avfAte' value='" + (F.ate || "") + "'></label>" +
    (F.prioridade || F.estado || F.de || F.ate || F.prest ? "<button class='btn' id='avfLimpar'>Limpar</button>" : "") + "</div>" +
    avResumoPrest(LE) + "<div class='avAbas' role='tablist'>" + AVARIAS.ESTADOS.map(function (e) { return "<button role='tab' data-e='" + e.id + "' aria-selected='" + (AV.aba === e.id) + "'" + (AV.aba === e.id ? " class='on'" : "") + ">" + e.pl + " <i>" + porEst[e.id].length + "</i></button>"; }).join("") + "</div>" +
    "<div class='avQuadro'>" + AVARIAS.ESTADOS.filter(function (e) { return !F.estado || F.estado === e.id; }).map(function (e) {
      var C = porEst[e.id];
      return "<section class='avCol" + (AV.aba === e.id ? " on" : "") + "' data-e='" + e.id + "'><h3>" + e.ic + " " + e.pl + " <i>" + C.length + "</i></h3>" +
        (C.length ? C.map(function (a) { return avCartao(a, varias); }).join("") : "<p class='mut avVazio'>Sem avarias</p>") +
        (e.id === "concluida" && maisC ? "<p class='mut avVazio'>+ " + maisC + " mais antigas: use as datas para as ver.</p>" : "") + "</section>";
    }).join("") + "</div>";
  $("#avgNova").onclick = function () { ir("avn"); };
  function filtro(k, el) { if (el) el.onchange = function () { AV.filtro[k] = this.value || ""; avDesenharGestao(); }; }
  filtro("prest", $("#avfPrest"));
  if ($("#avgPrest")) $("#avgPrest").onclick = avEditarPrestadores;
  filtro("prioridade", $("#avfPri")); filtro("estado", $("#avfEstado")); filtro("de", $("#avfDe")); filtro("ate", $("#avfAte"));
  if ($("#avfLimpar")) $("#avfLimpar").onclick = function () { AV.filtro = {}; avDesenharGestao(); };
  $$("#avgCorpo .avAbas button").forEach(function (b) { b.onclick = function () { AV.aba = b.dataset.e; avDesenharGestao(); }; });
  $$("#avgCorpo .avCartao").forEach(function (c) { c.onclick = function () { avAbrirFicha(+c.dataset.id); }; });
}
function avCartao(a, varias) {
  var n = AV.fotosN[a.id] || 0;
  return "<button class='avCartao p-" + a.prioridade + "' data-id='" + a.id + "'><span class='avCartao-l1'><b class='avNum'>" + esc(avNum(a)) + "</b>" + avPri(a.prioridade) + "</span>" +
    "<span class='avCartao-tit'>" + esc(a.titulo) + "</span>" +
    "<span class='avCartao-meta'>" + esc(AVARIAS.idade(a.criado_em)) + (n ? " · 📷 " + n : "") + (avPrest(a) ? " · 🔧 " + esc(avPrest(a).nome) + (a.aguarda_peca ? " · à espera de peça" : a.visita_prevista ? " · visita " + esc(avDia(a.visita_prevista).slice(0, 5)) : "") : a.responsavel_nome ? " · 👤 " + esc(a.responsavel_nome) : " · <i>por encaminhar</i>") + (varias ? " · " + esc(avEst(a.estacao)) : "") + "</span></button>";
}

/* por prestador (administrador): abertas e dias médios até ficar resolvida */
function avResumoPrest(LE) {
  if (!avAdmin() || !Object.keys(AV.prest).length) return "";
  var L = (LE || AV.lista).map(function (x) { var p = avPrest(x); return {prestador_id: p ? p.nome : null, estado: x.estado, encaminhada_em: x.encaminhada_em, concluido_em: x.concluido_em}; });
  var R = AVARIAS.resumoPrestadores(L), K = Object.keys(R); if (!K.length) return "";
  var porEnc = AV.lista.filter(function (x) { return x.estado === "aberta"; }).length;
  return "<div class='card avResumo'><b>Por prestador</b>" + (porEnc ? " <span class='mut'>· " + porEnc + " por encaminhar</span>" : "") + "<div class='avResumoL'>" + K.map(function (k) {
    var r = R[k]; return "<button data-rp='" + esc(k) + "'><b>" + esc(k) + "</b><span>" + r.abertas + (r.abertas === 1 ? " aberta" : " abertas") + (r.dias != null ? " · resolve em " + String(r.dias).replace(".", ",") + " dias" : "") + "</span></button>";
  }).join("") + "</div></div>";
}
document.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("[data-rp]"); if (!b) return; AV.filtro.prest = b.dataset.rp; avDesenharGestao(); });

/* modelo do email (estação ou um prestador): {quadro} e os campos da avaria preenchem-se sozinhos */
function avModeloHtml(est, L) {
  var sel = AV.modeloSel || "", pid = sel ? +sel : null, M = (AV.modelos || []).find(function (m) { return m.estacao === est && (m.prestador_id || null) === pid; });
  var base = M || (pid ? AVARIAS.escolherModelo(AV.modelos, est, null) : AVARIAS.MODELO_PADRAO);
  return "<div class='avSec'><h4>Modelo do email ao prestador</h4>" +
    "<label class='avCampo'>Modelo para <select id='amPara'><option value=''>Todos os prestadores desta estação</option>" + L.map(function (p) { return "<option value='" + p.id + "'" + (String(p.id) === sel ? " selected" : "") + ">Só " + esc(p.nome) + "</option>"; }).join("") + "</select></label>" +
    (pid && !M ? "<p class='mut' style='margin:0'>Este prestador ainda usa o modelo da estação. Ao guardar, passa a ter o seu.</p>" : "") +
    "<label class='avCampo'>Assunto <input id='amAss' maxlength='200' value='" + esc(base.assunto) + "'></label>" +
    "<label class='avCampo'>Texto <textarea id='amCorpo' rows='8' maxlength='6000'>" + esc(base.corpo) + "</textarea></label>" +
    "<p class='mut' style='margin:0'>Campos: " + AVARIAS.CAMPOS.map(function (c) { return "{" + c + "}"; }).join(" ") + " {quadro}. O {estacao} já leva o número do posto (ex.: «" + esc(AVARIAS.ESTACAO_NOME[est] || est) + "»).</p>" +
    "<button class='btn p' id='amGravar'>Guardar modelo</button></div>";
}
/* lista de prestadores (administrador): acrescentar, telefone, email, desativar */
function avEditarPrestadores() {
  var d = document.createElement("dialog"); d.className = "avDlg"; document.body.appendChild(d);
  var ests = (ESTS || []).map(function (e) { return e.id; }), est = window.EST || ests[0];
  function desenhar() {
    var L = AV.prest[est] || [];
    d.innerHTML = "<div class='avDlg-cab'><b>Prestadores de serviço · " + esc(avEst(est)) + "</b><button class='np-x' aria-label='Fechar'>✕</button></div><div class='avDlg-corpo'>" +
      L.map(function (p) { return "<div class='avSec avPrestL' data-id='" + p.id + "'><div class='avLinha'><input data-k='nome' value='" + esc(p.nome) + "' maxlength='60' aria-label='Nome'>" +
        "<input data-k='telefone' value='" + esc(p.telefone || "") + "' placeholder='Telefone' inputmode='tel' maxlength='40' aria-label='Telefone'><input data-k='email' value='" + esc(p.email || "") + "' placeholder='Email' type='email' maxlength='120' aria-label='Email'>" +
        "<label style='display:flex;gap:6px;align-items:center'><input type='checkbox' data-k='ativo'" + (p.ativo ? " checked" : "") + ">Ativo</label>" +
        "<label class='avCampo' style='flex:1 1 220px'>Email ao encaminhar <select data-k='modo'>" + [["nao", "Não abrir (escrevo quando quiser)"], ["abrir", "Abrir o email para eu rever"], ["auto", "Enviar logo, sem rever"]].map(function (o) {
          var m = p.auto_email ? "auto" : p.abrir_email ? "abrir" : "nao"; return "<option value='" + o[0] + "'" + (o[0] === m ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>" +
        "<button class='btn' data-gravar>Guardar</button></div></div>"; }).join("") +
      avModeloHtml(est, L) +
      "<div class='avSec'><h4>Novo prestador</h4><div class='avLinha'><input id='apNome' placeholder='Nome' maxlength='60'><input id='apTel' placeholder='Telefone' inputmode='tel' maxlength='40'><input id='apEmail' placeholder='Email' type='email' maxlength='120'><button class='btn p' id='apNovo'>Acrescentar</button></div></div>" +
      "<p class='avMsg' id='apMsg' role='status'></p></div>";
    d.querySelector(".np-x").onclick = function () { d.close(); d.remove(); };
    d.querySelectorAll("[data-pe]").forEach(function (b) { b.onclick = function () { est = b.dataset.pe; desenhar(); }; });
    function L0() { return AV.prest[est] || []; }
    async function gravar(args, b, auto) {
      b.disabled = true;
      try { var r = await sb.rpc("msb_av_prestador_gravar", args); if (r.error) throw r.error;
        if (auto) { var r2 = await sb.rpc("msb_av_prestador_modo", auto); if (r2.error) throw r2.error; }
        await avPrestadores(); desenhar(); d.querySelector("#apMsg").textContent = "Guardado."; d.querySelector("#apMsg").className = "avMsg ok"; if (window.PAGINA === "avg") avDesenharGestao(); }
      catch (e) { b.disabled = false; var m = d.querySelector("#apMsg"); m.textContent = "⚠ " + falhouAv(e); m.className = "avMsg bad"; }
    }
    d.querySelectorAll("[data-gravar]").forEach(function (b) { b.onclick = function () {
      var c = b.closest(".avPrestL"), v = function (k) { return c.querySelector("[data-k='" + k + "']"); };
      var modo = v("modo").value, x0 = L0().find(function (x) { return x.id === +c.dataset.id; }) || {}, ant = x0.auto_email ? "auto" : x0.abrir_email ? "abrir" : "nao";
      if (modo !== "nao" && !v("email").value.trim()) { var m0 = d.querySelector("#apMsg"); m0.textContent = "Para abrir ou enviar o email ao encaminhar, escreva o email do prestador."; m0.className = "avMsg bad"; return; }
      gravar({p_id: +c.dataset.id, p_estacao: est, p_nome: v("nome").value, p_telefone: v("telefone").value, p_email: v("email").value, p_ativo: v("ativo").checked}, b,
        modo !== ant ? {p_id: +c.dataset.id, p_modo: modo} : null);
    }; });
    var ms = d.querySelector("#amPara"); if (ms) ms.onchange = function () { AV.modeloSel = ms.value; desenhar(); };
    var mg = d.querySelector("#amGravar"); if (mg) mg.onclick = async function () {
      var b = this, m = d.querySelector("#apMsg"); b.disabled = true;
      try { var r = await sb.rpc("msb_av_modelo_gravar", {p_estacao: est, p_prestador: ms.value ? +ms.value : null, p_assunto: d.querySelector("#amAss").value, p_corpo: d.querySelector("#amCorpo").value}); if (r.error) throw r.error;
        await avPrestadores(); desenhar(); m = d.querySelector("#apMsg"); m.textContent = "Modelo guardado."; m.className = "avMsg ok"; }
      catch (e) { b.disabled = false; m.textContent = "⚠ " + falhouAv(e); m.className = "avMsg bad"; }
    };
    d.querySelector("#apNovo").onclick = function () { gravar({p_id: null, p_estacao: est, p_nome: d.querySelector("#apNome").value, p_telefone: d.querySelector("#apTel").value, p_email: d.querySelector("#apEmail").value, p_ativo: true}, this); };
  }
  desenhar(); d.showModal();
}

/* ================= Ficha ================= */
async function avAbrirNumero(est, numero, ano) {
  if (window.PAGINA !== "avg" && window.ir) ir("avg");
  try {
    var q = sb.from("msb_avarias").select("id").eq("estacao", est).eq("numero", numero);
    if (ano) q = q.eq("ano", ano);   // ligações antigas sem ano: a mais recente com esse número
    var r = await q.order("criado_em", {ascending: false}).limit(1).maybeSingle();
    if (r.error) throw r.error;
    if (!r.data) { if (window.MSB_NAV) MSB_NAV.confirma("A avaria " + AVARIAS.numeroTxt(est, numero, ano) + " não existe ou não é de uma estação a que tenha acesso.", "OK"); return; }
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
      sb.from("msb_avarias_historico").select("id,tipo,texto,antes,depois,por_nome,em").eq("avaria_id", id).order("id"),
      avAdmin() ? sb.from("msb_avarias_admin").select("ref_pedido,nota").eq("avaria_id", id).maybeSingle() : Promise.resolve({data: null}),
      avAdmin() ? sb.from("msb_av_emails").select("id,para,cc,assunto,estado,erro,anexos,enviado_em,enviado_nome").eq("avaria_id", id).order("id") : Promise.resolve({data: []})
    ]);
    q.slice(0, 3).forEach(function (x) { if (x.error) throw x.error; });
    var adm = q[3].error ? null : (q[3].data || {}); if (adm) adm.emails = q[4].error ? null : (q[4].data || []);
    var a = q[0].data; if (!a) throw new Error("Avaria não encontrada.");
    var fotos = q[1].data || [], hist = q[2].data || [], urls = {};
    if (fotos.length) {
      var s = await sb.storage.from(AV_BUCKET).createSignedUrls(fotos.map(function (f) { return f.caminho; }), 300);
      (s.data || []).forEach(function (x) { if (x.signedUrl) urls[x.path] = x.signedUrl; });
    }
    if (AV.ficha !== id) return;
    var resp = [];
    if (avAdmin() && a.estado !== "concluida") { var rr = await sb.rpc("msb_avaria_responsaveis", {p_estacao: a.estacao}); resp = rr.data || []; }
    avDesenharFicha(d, a, fotos, urls, hist, resp, adm);
  } catch (e) { d.querySelector(".avDlg-cab b").textContent = "⚠ " + falhouAv(e); }
}
function avDesenharFicha(d, a, fotos, urls, hist, resp, adm) {
  var P = (AV.prest[a.estacao] || []).filter(function (x) { return x.ativo || x.id === a.prestador_id; }), pr = avPrest(a);
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
  if (AVARIAS.pode("validar", q)) acoes += "<div class='avSec avValidar'><h4>O técnico já resolveu?</h4><p class='mut'>Depois de o prestador passar na estação, confirme se ficou a funcionar.</p>" +
    "<div class='avLinha'><button class='btn p' id='avfOk'>✅ Está a funcionar</button><button class='btn' id='avfNao'>❌ Ainda não funciona</button></div>" +
    "<div id='avfNaoBox' hidden><label class='avCampo'>O que ainda não funciona? <textarea id='avfNaoTxt' rows='2' maxlength='2000'></textarea></label><button class='btn' id='avfNaoEnviar'>Enviar</button></div></div>";
  if (AVARIAS.pode("encaminhar", q) && P.length) {
    var sug = a.prestador_id || AVARIAS.sugerirPrestador(P.filter(function (x) { return x.ativo; }), cat ? cat.nome : "", (eq || "") + " " + a.titulo);
    acoes += "<div class='avSec avEnc'><h4>" + (a.prestador_id ? "Encaminhamento" : "Encaminhar ao prestador") + "</h4>" +
      "<label class='avCampo'>Prestador <select id='avfPrestS'><option value=''>— escolher —</option>" + P.map(function (x) { return "<option value='" + x.id + "'" + (x.id === sug ? " selected" : "") + ">" + esc(x.nome) + (!a.prestador_id && x.id === sug ? " (sugerido)" : "") + "</option>"; }).join("") + "</select></label>" +
      "<div id='avfContacto' class='avLinha'></div>" +
      "<label class='avCampo'>N.º do pedido no prestador (só o administrador vê) <input id='avfRef' maxlength='80' value='" + esc((adm && adm.ref_pedido) || "") + "'></label>" +
      "<div class='avLinha'><label class='avCampo'>Visita prevista <input type='date' id='avfVisita' value='" + esc(a.visita_prevista || "") + "'></label>" +
      "<label class='avCampo' style='flex-direction:row;align-items:center;gap:8px'><input type='checkbox' id='avfPeca'" + (a.aguarda_peca ? " checked" : "") + "> À espera de peça</label></div>" +
      "<label class='avCampo'>Nota interna (só o administrador vê) <textarea id='avfNotaAdm' rows='2' maxlength='1000'>" + esc((adm && adm.nota) || "") + "</textarea></label>" +
      "<button class='btn p' id='avfEncaminhar'>" + (a.prestador_id ? "Guardar encaminhamento" : "📨 Encaminhar") + "</button><p class='mut' id='avfAutoTxt' style='margin:6px 0 0'></p></div>";
  }
  if (q.admin && adm && adm.emails) acoes += "<div class='avSec'><h4>Emails ao prestador <i>" + adm.emails.length + "</i></h4>" +
    (adm.emails.length ? "<ul class='avEmails'>" + adm.emails.slice().reverse().map(function (m) {
      return "<li><b>" + (m.estado === "enviado" ? "✅ Enviado" : "❌ Falhou") + "</b> · " + esc(avDataHora(m.enviado_em)) + " · " + esc(m.enviado_nome || "") + "<br><span class='mut'>para " + esc(m.para) + (m.cc ? " · cc " + esc(m.cc) : "") + (m.anexos ? " · " + m.anexos + " fotografias" : "") + "</span><br>" + esc(m.assunto) + (m.erro ? "<br><span class='bad'>" + esc(m.erro) + "</span>" : "") + "</li>";
    }).join("") + "</ul>" : "") + (a.estado !== "concluida" || adm.emails.length ? "<button class='btn' id='avfEmail'>✉️ Escrever email ao prestador</button>" : "") + "</div>";
  if (AVARIAS.pode("estado", q) && !q.admin) acoes += "<div class='avSec'><h4>Estado</h4><div class='avSeg'>" + AVARIAS.ESTADOS.filter(function (e) { return e.id !== "concluida"; }).map(function (e) {
    return "<button data-estado='" + e.id + "'" + (a.estado === e.id ? " class='on' aria-pressed='true' disabled" : "") + ">" + e.ic + " " + e.txt + "</button>"; }).join("") + "</div>" +
    "<label class='avCampo'>Prioridade <select id='avfPriF'>" + AVARIAS.PRIORIDADES.map(function (p) { return "<option value='" + p.id + "'" + (p.id === a.prioridade ? " selected" : "") + ">" + p.ic + " " + p.txt + "</option>"; }).join("") + "</select></label></div>";
  if (AVARIAS.pode("estado", q) && q.admin) acoes += "<div class='avSec'><label class='avCampo'>Prioridade <select id='avfPriF'>" + AVARIAS.PRIORIDADES.map(function (p) { return "<option value='" + p.id + "'" + (p.id === a.prioridade ? " selected" : "") + ">" + p.ic + " " + p.txt + "</option>"; }).join("") + "</select></label></div>";
  if (AVARIAS.pode("atribuir", q)) acoes += "<div class='avSec'><h4>Responsável</h4><div class='avLinha'><select id='avfResp' aria-label='Responsável'><option value=''>— sem responsável —</option>" + resp.map(function (p) {
    return "<option value='" + p.user_id + "'" + (p.user_id === a.responsavel ? " selected" : "") + ">" + esc(p.nome) + (p.admin ? " (administrador)" : "") + "</option>"; }).join("") + "</select>" +
    "<input id='avfTec' maxlength='200' placeholder='Técnico externo (opcional)' value='" + esc(a.tecnico_externo || "") + "'><button class='btn' id='avfAtribuir'>Guardar</button></div></div>";
  if (AVARIAS.pode("concluir", q)) acoes += "<div class='avSec avConcluir'><h4>" + (q.admin ? "Fechar sem validação do colaborador" : "Concluir") + "</h4><label class='avCampo'>Solução aplicada <textarea id='avfSol' rows='3' maxlength='4000' placeholder='O que foi feito para resolver'></textarea></label><button class='btn p' id='avfConcluir'>✅ Concluir avaria</button></div>";
  if (AVARIAS.pode("reabrir", q)) acoes += "<div class='avSec'><h4>Reabrir</h4><div class='avLinha'><input id='avfMotivo' maxlength='300' placeholder='Motivo (obrigatório)'><button class='btn' id='avfReabrir'>↩️ Reabrir</button></div></div>";
  var fase = a.estado === "aberta" ? "abertura" : "resolucao";
  d.innerHTML = "<div class='avDlg-cab'><b>" + esc(avNum(a)) + " · " + esc(avEst(a.estacao)) + "</b><button class='np-x' aria-label='Fechar'>✕</button></div>" +
    "<div class='avDlg-corpo'><div class='avFichaTopo p-" + a.prioridade + "'><h2>" + esc(a.titulo) + "</h2><div class='avLinha'>" + avPri(a.prioridade) + avEstado(a.estado) + "</div></div>" + avPassos(a) +
    "<dl class='avDados'><dt>Comunicada</dt><dd>" + esc(avDataHora(a.criado_em)) + " · " + esc(a.criado_nome) + "</dd>" +
    (cat ? "<dt>Categoria</dt><dd>" + esc(cat.nome) + "</dd>" : "") + (eq ? "<dt>Equipamento</dt><dd>" + esc(eq) + "</dd>" : "") +
    (pr ? "<dt>Prestador</dt><dd>" + esc(pr.nome) + (a.aguarda_peca ? " · à espera de peça" : "") + "</dd>" : "") +
    (a.visita_prevista ? "<dt>Visita prevista</dt><dd>" + esc(avDia(a.visita_prevista)) + "</dd>" : "") +
    (q.admin && adm && adm.ref_pedido ? "<dt>N.º do pedido</dt><dd>" + esc(adm.ref_pedido) + "</dd>" : "") +
    (a.validada_nome ? "<dt>Validada</dt><dd>" + esc(a.validada_nome) + " · " + esc(avDataHora(a.validada_em)) + "</dd>" : "") +
    (a.responsavel_nome || a.tecnico_externo ? "<dt>Responsável</dt><dd>" + (a.responsavel_nome ? esc(a.responsavel_nome) : "—") + (a.tecnico_externo ? " · técnico: " + esc(a.tecnico_externo) : "") + "</dd>" : "") +
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
  var ok = d.querySelector("#avfOk"); if (ok) ok.onclick = async function () {
    if (await msbConfirma("Confirma que a avaria " + avNum(a) + " está resolvida e a funcionar?", "Está a funcionar")) fazer("msb_avaria_validar", {p_id: a.id, p_ok: true, p_texto: null}, ok);
  };
  var nao = d.querySelector("#avfNao"); if (nao) nao.onclick = function () { d.querySelector("#avfNaoBox").hidden = false; d.querySelector("#avfNaoTxt").focus(); };
  var naoE = d.querySelector("#avfNaoEnviar"); if (naoE) naoE.onclick = function () {
    var t = d.querySelector("#avfNaoTxt").value.trim(); if (t.length < 3) { msg("Diga o que ainda não funciona.", false); return; }
    fazer("msb_avaria_validar", {p_id: a.id, p_ok: false, p_texto: t}, naoE);
  };
  var ps = d.querySelector("#avfPrestS");
  function contacto() {
    var box = d.querySelector("#avfContacto"); if (!box) return;
    var p = P.find(function (x) { return String(x.id) === ps.value; }); if (!p) { box.innerHTML = ""; return; }
    var txt = "Avaria " + avNum(a) + " · " + avEst(a.estacao) + ": " + a.titulo + (a.descricao ? "\n" + a.descricao : "");
    var tel = (p.telefone || "").replace(/[^0-9+]/g, ""), wa = tel.replace(/^\+/, ""); if (wa.length === 9) wa = "351" + wa;
    box.innerHTML = (tel ? "<a class='btn' href='tel:" + esc(tel) + "'>📞 Ligar</a><a class='btn' target='_blank' rel='noopener' href='https://wa.me/" + esc(wa) + "?text=" + encodeURIComponent(txt) + "'>WhatsApp</a>" : "") +
      (p.email ? "<a class='btn' href='mailto:" + esc(p.email) + "?subject=" + encodeURIComponent("Avaria " + avNum(a) + " · " + avEst(a.estacao)) + "&body=" + encodeURIComponent(txt) + "'>✉️ Email</a>" : "") +
      (!tel && !p.email ? "<span class='mut'>Sem telefone nem email: acrescente em «Prestadores».</span>" : "");
  }
  if (ps) { ps.onchange = contacto; contacto(); }
  function autoTxt() {
    var t = d.querySelector("#avfAutoTxt"), p = ps && P.find(function (x) { return String(x.id) === ps.value; }); if (!t) return;
    t.textContent = !p || !p.email || a.prestador_id === p.id ? "" : p.auto_email ? "Ao encaminhar, o email segue logo para " + p.email + " (envio automático deste prestador)." :
      p.abrir_email ? "Ao encaminhar, abre o email para " + p.email + " para rever antes de enviar." : "";
  }
  if (ps) { ps.addEventListener("change", autoTxt); autoTxt(); }
  var en = d.querySelector("#avfEncaminhar"); if (en) en.onclick = async function () {
    if (!ps.value) { msg("Escolha o prestador.", false); return; }
    var p = P.find(function (x) { return String(x.id) === ps.value; }), novo = !a.prestador_id || a.prestador_id !== p.id;
    en.disabled = true;
    try {
      var r = await sb.rpc("msb_avaria_encaminhar", {p_id: a.id, p_prestador: +ps.value, p_ref: d.querySelector("#avfRef").value.trim() || null,
        p_visita: d.querySelector("#avfVisita").value || null, p_peca: d.querySelector("#avfPeca").checked, p_nota: d.querySelector("#avfNotaAdm").value.trim() || null});
      if (r.error) throw r.error;
      if (novo && p.auto_email && p.email) {   // envio automático deste prestador: modelo tal como está, com as fotografias
        var M = AVARIAS.escolherModelo(AV.modelos, a.estacao, p.id), ex = {equipamento: eq || ""};
        var e = await avEnviarEmail({avaria_id: a.id, para: p.email, cc: "", assunto: AVARIAS.preencherModelo(M.assunto, a, ex), corpo: AVARIAS.preencherModelo(M.corpo, a, ex), fotos: fotos.map(function (f) { return f.id; })});
        if (e) { msg("Encaminhada, mas o email não saiu: " + e, false); AV.lista = []; setTimeout(function () { avAbrirFicha(a.id); }, 2500); return; }
      }
      AV.lista = []; await avAbrirFicha(a.id); if (window.PAGINA === "avg") carregarAvGestao();
      if (novo && p.abrir_email && !p.auto_email && p.email) avEscreverEmail(Object.assign({}, a, {prestador_id: p.id}), P, fotos, urls, eq);   // opção 2: rever antes de enviar
    } catch (x) { msg("⚠ " + falhouAv(x), false); en.disabled = false; }
  };
  var em = d.querySelector("#avfEmail"); if (em) em.onclick = function () { avEscreverEmail(a, P, fotos, urls, eq); };
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
/* email ao prestador (só administrador): envia pela Edge Function, a partir do Gmail da estação. Devolve null ou a mensagem de erro. */
async function avEnviarEmail(corpo) {
  try {
    var r = await sb.functions.invoke("msb-avarias-email", {body: corpo});
    if (r.error) { var t = ""; try { t = (await r.error.context.json()).erro; } catch (e) { /* sem corpo */ } return t || falhouAv(r.error); }
    return r.data && r.data.ok ? null : ((r.data && r.data.erro) || "Resposta inesperada do servidor.");
  } catch (e) { return falhouAv(e); }
}
function avEscreverEmail(a, P, fotos, urls, eq) {
  var p = avPrest(a) || {}, M = AVARIAS.escolherModelo(AV.modelos, a.estacao, p.id || null), ex = {equipamento: eq || ""};
  var dl = document.createElement("dialog"); dl.className = "avDlg"; document.body.appendChild(dl);
  var de = a.estacao === "sto" ? "portojoaonuneslda@gmail.com" : a.estacao === "pnf" ? "portonuneslda@gmail.com" : "Gmail da estação";
  dl.innerHTML = "<div class='avDlg-cab'><b>Email ao prestador · " + esc(avNum(a)) + "</b><button class='np-x' aria-label='Fechar'>✕</button></div><div class='avDlg-corpo'>" +
    "<p class='mut' style='margin:0'>Sai de <b>" + esc(de) + "</b> (" + esc(AVARIAS.ESTACAO_NOME[a.estacao] || a.estacao) + ") e fica nos «Enviados» desse Gmail.</p>" +
    "<label class='avCampo'>Para <input id='emPara' type='email' multiple value='" + esc(p.email || "") + "' placeholder='email do prestador'></label>" +
    "<label class='avCampo'>Cc <input id='emCc' type='email' multiple placeholder='opcional'></label>" +
    "<label class='avCampo'>Assunto <input id='emAss' maxlength='200' value='" + esc(AVARIAS.preencherModelo(M.assunto, a, ex)) + "'></label>" +
    "<label class='avCampo'>Texto <textarea id='emCorpo' rows='9' maxlength='6000'>" + esc(AVARIAS.preencherModelo(M.corpo, a, ex)) + "</textarea></label>" +
    "<p class='mut' style='margin:0'>{quadro} é trocado pelo quadro com o registo da avaria (estação e n.º do posto, n.º da avaria, data, equipamento, prioridade, descrição).</p>" +
    (fotos.length ? "<div class='avSec'><h4>Fotografias em anexo</h4><div class='avGal'>" + fotos.map(function (f) {
      return "<label class='emFoto'><input type='checkbox' value='" + f.id + "' checked>" + (urls[f.caminho] ? "<img src='" + esc(urls[f.caminho]) + "' alt=''>" : "📷") + "</label>"; }).join("") + "</div></div>" : "") +
    "<div class='avLinha'><button class='btn' id='emVoltar'>Cancelar</button><button class='btn p' id='emRever'>Rever o email →</button></div></div>" +
    /* 2.º passo (pedido do dono, 26/11/2026): ver o email como vai sair e só então enviar */
    "<div class='avDlg-corpo' id='emPasso2' hidden><p class='mut' style='margin:0'>É assim que o email vai sair. Confira e carregue em «Enviar agora».</p><div id='emPrevia'></div>" +
    "<div class='avLinha'><button class='btn' id='emEditar'>✏️ Voltar a editar</button><button class='btn p' id='emEnviar'>✉️ Enviar agora</button></div><p class='avMsg' id='emMsg' role='status'></p></div>";
  var fechar = function () { try { dl.close(); } catch (e) { /* já fechada */ } dl.remove(); };
  dl.querySelector(".np-x").onclick = fechar; dl.querySelector("#emVoltar").onclick = fechar;
  var p1 = dl.querySelectorAll(".avDlg-corpo")[0], p2 = dl.querySelector("#emPasso2");
  dl.querySelector("#emRever").onclick = function () {
    var para = dl.querySelector("#emPara").value.trim();
    if (!para) { alert("Escreva o email do prestador."); return; }
    var nF = dl.querySelectorAll(".emFoto input:checked").length;
    dl.querySelector("#emPrevia").innerHTML = avEmailPrevia(a, eq, nF, de, para, dl.querySelector("#emCc").value.trim(), dl.querySelector("#emAss").value.trim(), dl.querySelector("#emCorpo").value);
    p1.hidden = true; p2.hidden = false; dl.querySelector(".avDlg-cab b").textContent = "Rever email · " + avNum(a); p2.scrollIntoView ? p2.scrollIntoView() : 0;
  };
  dl.querySelector("#emEditar").onclick = function () { p2.hidden = true; p1.hidden = false; dl.querySelector(".avDlg-cab b").textContent = "Email ao prestador · " + avNum(a); };
  dl.querySelector("#emEnviar").onclick = async function () {
    var b = this, m = dl.querySelector("#emMsg"), para = dl.querySelector("#emPara").value.trim();
    if (!para) { m.textContent = "Escreva o email do prestador."; m.className = "avMsg bad"; return; }
    b.disabled = true; b.textContent = "A enviar…";
    var e = await avEnviarEmail({avaria_id: a.id, para: para, cc: dl.querySelector("#emCc").value.trim(), assunto: dl.querySelector("#emAss").value.trim(), corpo: dl.querySelector("#emCorpo").value,
      fotos: Array.prototype.map.call(dl.querySelectorAll(".emFoto input:checked"), function (x) { return +x.value; })});
    if (e) { m.textContent = "⚠ " + e; m.className = "avMsg bad"; b.disabled = false; b.textContent = "✉️ Enviar email"; return; }
    fechar(); avAbrirFicha(a.id);
  };
  dl.showModal();
}

/* Pré-visualização do email: o mesmo desenho que a função msb-avarias-email monta no servidor (o quadro vem sempre da base de dados) */
function avEmailPrevia(a, eq, nF, de, para, cc, ass, texto) {
  var PRI = {baixa: ["Baixa", "#6b7280"], media: ["Média", "#A16207"], alta: ["Alta", "#C2410C"], critica: ["Crítica", "#B91C1C"]}, pr = PRI[a.prioridade] || [a.prioridade || "", "#374151"];
  var nome = AVARIAS.ESTACAO_NOME[a.estacao] || a.estacao, emp = {sto: "Porto João & Nunes, Lda.", pnf: "Porto & Nunes, Lda."}[a.estacao] || "";
  var dt = a.criado_em ? new Date(a.criado_em).toLocaleString("pt-PT", {day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"}).replace(",", "") : "";
  var L = [["Estação", esc(nome)], ["Empresa", esc(emp)], ["N.º da avaria", "<b>" + esc(avNum(a)) + "</b>"], ["Comunicada em", esc(dt)]];
  if (eq) L.push(["Equipamento", esc(eq)]);
  L.push(["Prioridade", "<span style='color:" + pr[1] + ";font-weight:bold'>● " + esc(pr[0]) + "</span>"], ["Avaria", "<b>" + esc(a.titulo || "") + "</b>" + (a.descricao ? "<br>" + esc(a.descricao).replace(/\n/g, "<br>") : "")]);
  if (nF) L.push(["Fotografias", nF + " em anexo"]);
  var quadro = "<table style='width:100%;table-layout:fixed;border-collapse:collapse;font-size:14px;margin:6px 0'>" + L.map(function (l) { return "<tr><td style='padding:8px 10px;background:#F3F6FB;width:38%;font-weight:bold;vertical-align:top;text-align:left;white-space:normal'>" + l[0] + "</td><td style='padding:8px 10px;border-bottom:1px solid #eef2f7;text-align:left;white-space:normal;overflow-wrap:anywhere'>" + l[1] + "</td></tr>"; }).join("") + "</table>";
  var partes = texto.indexOf("{quadro}") >= 0 ? texto.split("{quadro}") : [texto, ""];
  var par = function (t) { t = String(t || "").trim(); return t ? "<p style='margin:0 0 12px;font-size:15px;line-height:1.5'>" + esc(t).replace(/\n/g, "<br>") + "</p>" : ""; };
  return "<div style='font-size:14px;margin:8px 0;display:grid;gap:2px;overflow-wrap:anywhere'><div><span class='mut'>De:</span> " + esc(de) + "</div><div><span class='mut'>Para:</span> <b>" + esc(para) + "</b></div>" + (cc ? "<div><span class='mut'>Cc:</span> " + esc(cc) + "</div>" : "") +
    "<div><span class='mut'>Assunto:</span> <b>" + esc(ass) + "</b></div>" + (nF ? "<div><span class='mut'>Anexos:</span> " + nF + " fotografia(s)</div>" : "") + "</div>" +
    "<div style='max-width:100%;overflow-wrap:anywhere;font-family:Arial,Helvetica,sans-serif;color:#1f2937;border-radius:12px;overflow:hidden;border:1px solid #dbe3ef;background:#fff'>" +
    "<div style='background:#0B3D91;color:#fff;padding:14px 16px'><div style='font-size:12px;opacity:.85'>Pedido de assistência técnica</div><div style='font-size:18px;font-weight:bold;margin-top:4px'>Avaria " + esc(avNum(a)) + " · " + esc(nome) + "</div></div>" +
    "<div style='padding:14px 16px'>" + par(partes[0]) + quadro + par(partes.slice(1).join("")) + "<p style='margin:12px 0 0;font-size:12px;color:#9ca3af'>Na resposta, mantenha o n.º " + esc(avNum(a)) + " no assunto.</p></div></div>";
}

/* nova notificação em tempo real: se a avaria está aberta no ecrã, volta a ler */
function avAtualizar(n) {
  if (n && AV.ficha && n.avaria_id === AV.ficha) avAbrirFicha(AV.ficha);
  if (window.PAGINA === "avg") carregarAvGestao(); else AV.lista = [];
}
window.carregarAvNova = carregarAvNova; window.carregarAvGestao = carregarAvGestao; window.avAbrirNumero = avAbrirNumero; window.avAtualizar = avAtualizar;
