/* mystationbox · Gestão → Equipa → Ponto Digital (dono, 25/11/2026; plano em docs/ponto_digital.md).
 * Validação só pela localização do telemóvel, pedida UMA vez no toque do botão (sem recolha contínua nem em segundo plano).
 * O servidor (msb_ponto_picar) mede a distância, decide e grava a hora oficial; o telemóvel só envia a leitura.
 * Fase 1: só o administrador (modo de teste enquanto a estação não estiver ativa). Ecrã do colaborador segundo a
 * sugestão do dono (25/11/2026): nome, turno previsto, hora atual em grande e um só botão. Regras em ponto_regras.js. */
"use strict";
var PTO = {res: null, a_picar: false, pedido: null, relogio: null};
var PTO_AVISO_VERSAO = 1;
var PTO_SEM_TURNO = {B: "Baixa", F: "Férias", FG: "Folga", FD: "Feriado"};   // códigos do horário que não são turno (B = baixa, dono 25/11/2026)
function falhouPto(e) { var m = falhou(e); return /msb_ponto|msb_colab_contas|does not exist|schema cache|42P01|42883|PGRST20/i.test(m + " " + (e && e.code || "")) ? "O Ponto Digital ainda não está ativo na base de dados." : m; }
function ptoUUID() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  var b = new Uint8Array(16); crypto.getRandomValues(b); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  var h = Array.prototype.map.call(b, function (x) { return x.toString(16).padStart(2, "0"); }).join("");
  return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
}
/* hora de Portugal: "HH:MM" e minutos desde a meia-noite */
function ptoHora(t) { return new Date(t).toLocaleTimeString("pt-PT", {timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit"}); }
function ptoMin(t) { var p = ptoHora(t).split(":"); return +p[0] * 60 + +p[1]; }
function ptoMinTxt(s) { var p = String(s).split(":"); return +p[0] * 60 + +p[1]; }
function ptoHoje() { return new Date().toLocaleDateString("sv-SE", {timeZone: "Europe/Lisbon"}); }
function ptoNomeEst(id) { var e = (ESTS || []).find(function (x) { return x.id === id; }); return e ? (e.short_name || e.name) : id; }

async function carregarPonto() {
  var box = $("#ptoCorpo"); if (!box) return;
  box.innerHTML = "<div class='mut'>A carregar…</div>";
  try {
    var est = EST, hoje = ptoHoje();
    var q = await Promise.all([
      sb.from("msb_ponto_locais").select("*").eq("estacao", est).maybeSingle(),
      sb.from("msb_ponto_horas").select("*").eq("estacao", est).order("codigo").order("parte"),
      sb.from("msb_colab_contas").select("colaborador_id").eq("user_id", EU.id).maybeSingle(),
      sb.from("msb_ponto_registos").select("*").eq("estacao", est).eq("dia", hoje).order("hora"),
      sb.from("msb_ponto_avisos").select("versao").eq("user_id", EU.id).eq("versao", PTO_AVISO_VERSAO).maybeSingle()
    ]);
    q.forEach(function (r) { if (r.error) throw r.error; });
    var X = {est: est, hoje: hoje, local: q[0].data, horas: q[1].data || [], colab: q[2].data && q[2].data.colaborador_id, reg: q[3].data || [], aviso: !!q[4].data, nomes: {}, turno: null, legenda: []};
    if (ADMIN) {
      var c = await sb.from("msb_colaboradores").select("id,nome,curto"); if (!c.error) (c.data || []).forEach(function (x) { X.nomes[x.id] = x.curto || x.nome; });
      var cf = await sb.from("msb_config").select("horario").eq("estacao", est).maybeSingle();
      X.legenda = ((cf.data && cf.data.horario && cf.data.horario.legenda) || []).filter(function (l) { return ["FD", "FG", "F", "MDF", "B"].indexOf(l[0]) < 0; });
    }
    if (X.colab) {
      var h = await sb.from("msb_horario_dias").select("codigo").eq("estacao", est).eq("dia", hoje).eq("colaborador_id", X.colab).maybeSingle();
      if (h.data && h.data.codigo) X.turno = {codigo: h.data.codigo, partes: X.horas.filter(function (p) { return p.codigo === h.data.codigo; })};
    }
    if (est !== EST) return;   // mudou de estação entretanto
    PTO.X = X; desenharPonto();
  } catch (e) { box.innerHTML = "<div class='card msgErr' style='padding:12px'>✖ " + esc(falhouPto(e)) + "</div>"; }
}

function ptoMeus() { return PTO.X.reg.filter(function (r) { return r.user_id === EU.id; }); }

function desenharPonto() {
  var X = PTO.X, box = $("#ptoCorpo");
  if (!X.aviso) { box.innerHTML = ptoAvisoHtml(); $("#ptoAvisoOk").onclick = ptoAvisoAceitar; return; }
  var meus = ptoMeus(), teste = !X.local || !X.local.ativo;
  var prox = PONTO.proxima(meus.map(function (r) { return {tipo: r.tipo, estado: r.estado, anulado_por: r.anulado_por, min: ptoMin(r.hora), teste: r.teste}; }).filter(function (r, i) { return meus[i].teste === teste; }));
  var nome = (X.colab && X.nomes[X.colab]) || (PERFIL && PERFIL.display_name) || "";
  var semT = X.turno && PTO_SEM_TURNO[X.turno.codigo];
  var turno = X.turno ? (X.turno.partes.length ? X.turno.partes.map(function (p) { return p.inicio.slice(0, 5) + " – " + p.fim.slice(0, 5); }).join(" e ") : "sem horas definidas") : "";
  var data = new Date().toLocaleDateString("pt-PT", {timeZone: "Europe/Lisbon", day: "numeric", month: "long", year: "numeric"});
  var r = PTO.res, faixa;
  if (PTO.a_picar) faixa = "<div class='pto-faixa'>📍 A obter a localização…</div>";
  else if (r && r.estado === "aceite") faixa = "<div class='pto-faixa ok'>✅ " + (r.tipo === "entrada" ? "Entrada" : "Saída") + " registada às <b>" + ptoHora(r.hora) + "</b> · localização validada (a " + r.distancia_m + " m)</div>";
  else if (r && r.estado === "rejeitada") faixa = "<div class='pto-faixa bad' role='alert'>❌ " + esc(PONTO.motivo(r)) + "</div>";
  else if (r && r.erro) faixa = "<div class='pto-faixa bad' role='alert'>❌ " + esc(r.erro) + "</div>";
  else faixa = "<div class='pto-faixa'>📍 A localização é pedida só no momento de registar.</div>";

  var h = "<div class='card pto'>" + (teste ? "<div class='pto-teste'>🧪 MODO DE TESTE · só o administrador pica" + (X.local ? "" : " · falta a localização da estação") + "</div>" : "") +
    "<div class='pto-rot'>COLABORADOR</div><div class='pto-nome'>" + esc(nome) + "</div>" +
    "<div class='pto-turno'>" + esc(ptoNomeEst(X.est)) + (semT ? " · Hoje: " + esc(semT) : X.turno ? " · Turno previsto " + esc(X.turno.codigo) + " · " + esc(turno) : X.colab ? " · Sem turno previsto hoje" : "") + "</div>" +
    "<div class='pto-relogio'><div class='pto-rot'>HORA ATUAL</div><div id='ptoRelogio' class='pto-hora'>" + new Date().toLocaleTimeString("pt-PT", {timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit"}) + "</div><div class='pto-data'>" + esc(data) + "</div></div>" +
    faixa +
    "<button id='ptoBtn' class='pto-btn" + (prox === "saida" ? " sai" : "") + "'" + (PTO.a_picar ? " disabled" : "") + "><span class='pto-ic'>" + (prox === "entrada" ? "➜]" : "[➜") + "</span><b>" + (prox === "entrada" ? "REGISTAR ENTRADA" : "REGISTAR SAÍDA") + "</b><small>Validar localização e registar ponto</small></button>" +
    "<div class='pto-nota'>O registo utiliza a hora do servidor.</div></div>";

  var lista = meus.filter(function (x) { return x.teste === teste; });
  h += "<div class='card' style='padding:14px'><h3 style='margin:0 0 8px'>Os meus registos de hoje</h3>" + (lista.length ? "<ul class='pto-lista'>" + lista.map(function (x) {
    return "<li class='" + (x.estado === "aceite" && !x.anulado_por ? "ok" : "bad") + "'><b>" + ptoHora(x.hora) + "</b> " + (x.tipo === "entrada" ? "Entrada" : "Saída") +
      (x.estado === "aceite" ? (x.anulado_por ? " · anulada" : " · ✅ a " + (x.distancia_m == null ? "—" : x.distancia_m + " m")) : " · ❌ " + esc(PONTO.MOTIVOS[x.motivo] || x.motivo)) + "</li>"; }).join("") + "</ul>" : "<p class='mut' style='margin:0'>Ainda não há registos hoje.</p>") + "</div>";

  if (ADMIN) h += ptoAdminHtml();
  box.innerHTML = h;
  $("#ptoBtn").onclick = function () { ptoPicar(prox); };
  if (ADMIN) ptoAdminLigar();
  if (!PTO.relogio) PTO.relogio = setInterval(function () { var el = $("#ptoRelogio"); if (!el) { clearInterval(PTO.relogio); PTO.relogio = null; return; } el.textContent = new Date().toLocaleTimeString("pt-PT", {timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit"}); }, 5000);
}

function ptoAvisoHtml() {
  return "<div class='card' style='padding:16px;max-width:560px'><h3 style='margin-top:0'>📍 Ponto Digital · utilização da localização</h3>" +
    "<p>Para registar a entrada e a saída, a app confirma que está na estação através da localização do telemóvel.</p><ul>" +
    "<li>A localização é pedida <b>só no momento em que toca no botão</b>. Nunca é recolhida de forma contínua nem em segundo plano.</li>" +
    "<li>Guarda-se: a hora (do servidor), a estação, a distância à estação, a precisão do sinal e o resultado.</li>" +
    "<li>As coordenadas são apagadas ao fim de <b>90 dias</b>; os registos de tempo de trabalho ficam guardados pelo prazo legal.</li>" +
    "<li>Os seus registos são vistos por si e pelo administrador. Não são usados para outros fins.</li>" +
    "<li>Se não autorizar a localização, não é possível picar por GPS; o administrador pode registar a picagem, com motivo.</li></ul>" +
    "<button id='ptoAvisoOk' class='btn p'>Compreendi</button></div>";
}
async function ptoAvisoAceitar() {
  var b = $("#ptoAvisoOk"); b.disabled = true;
  var r = await sb.from("msb_ponto_avisos").insert({user_id: EU.id, versao: PTO_AVISO_VERSAO});
  if (r.error && r.error.code !== "23505") { b.disabled = false; b.insertAdjacentHTML("afterend", "<p class='msgErr'>✖ " + esc(falhouPto(r.error)) + "</p>"); return; }
  PTO.X.aviso = true; desenharPonto();
}

function ptoLocalizar() {
  return new Promise(function (ok) {
    if (!navigator.geolocation) return ok({erro: "Este telemóvel não permite obter a localização."});
    navigator.geolocation.getCurrentPosition(function (p) { ok({lat: p.coords.latitude, lon: p.coords.longitude, precisao: Math.round(p.coords.accuracy)}); },
      function (e) { ok({erro: e.code === 1 ? "A localização não foi autorizada. Autorize a localização para este site nas definições do navegador." : e.code === 3 ? "A localização demorou demasiado. Tente de novo." : "Não foi possível obter a localização."}); },
      {enableHighAccuracy: true, timeout: 20000, maximumAge: 0});
  });
}
async function ptoPicar(tipo) {
  if (PTO.a_picar) return;
  PTO.a_picar = true; PTO.res = null; desenharPonto();
  var pos = await ptoLocalizar();
  if (!PTO.pedido || PTO.pedido.tipo !== tipo) PTO.pedido = {tipo: tipo, id: ptoUUID()};   // repetir depois de falha de rede usa o mesmo pedido
  var r = await sb.rpc("msb_ponto_picar", {p_estacao: PTO.X.est, p_tipo: tipo, p_lat: pos.erro ? null : pos.lat, p_lon: pos.erro ? null : pos.lon,
    p_precisao: pos.erro ? null : pos.precisao, p_hora_telemovel: new Date().toISOString(), p_pedido: PTO.pedido.id});
  PTO.a_picar = false;
  if (r.error) { PTO.res = {erro: falhouPto(r.error)}; desenharPonto(); return; }   // falha de rede: o mesmo pedido fica para a próxima tentativa
  PTO.pedido = null;
  PTO.res = pos.erro && r.data.motivo === "sem_localizacao" ? {erro: pos.erro} : r.data;   // a tentativa fica gravada como recusada
  await carregarPonto();
}

/* ---------- administrador: hoje na estação e definições ---------- */
function ptoAdminHtml() {
  var X = PTO.X, L = X.local || {}, tl = function (x) { return x.teste ? "🧪 Teste (administrador)" : esc(X.nomes[x.colaborador_id] || "—"); };
  var h = "<div class='card' style='padding:14px'><h3 style='margin:0 0 8px'>Hoje na estação · " + esc(ptoNomeEst(X.est)) + "</h3>" +
    (X.reg.length ? "<div class='sc'><table class='t'><thead><tr><th>Hora</th><th class='l'>Quem</th><th>Tipo</th><th>Resultado</th><th>Distância</th><th>Precisão</th><th>Turno</th></tr></thead><tbody>" +
      X.reg.map(function (x) { return "<tr><td>" + ptoHora(x.hora) + "</td><td class='l'>" + tl(x) + "</td><td>" + (x.tipo === "entrada" ? "Entrada" : "Saída") + "</td><td>" +
        (x.estado === "aceite" ? (x.anulado_por ? "anulada" : "✅ aceite") + (x.origem === "correcao" ? " (correção)" : "") : "❌ " + esc(PONTO.MOTIVOS[x.motivo] || x.motivo)) + "</td><td>" + (x.distancia_m == null ? "—" : x.distancia_m + " m") + "</td><td>" + (x.precisao_m == null ? "—" : "±" + x.precisao_m + " m") + "</td><td>" + esc(x.turno_codigo || "—") + "</td></tr>"; }).join("") + "</tbody></table></div>"
      : "<p class='mut' style='margin:0'>Sem picagens hoje.</p>") + "</div>";
  var campo = function (id, rot, v, ex) { return "<label class='pto-cp'><span>" + rot + "</span><input id='" + id + "' inputmode='decimal' value='" + esc(v == null ? "" : v) + "'>" + (ex ? "<small>" + ex + "</small>" : "") + "</label>"; };
  h += "<div class='card' style='padding:14px'><h3 style='margin:0 0 4px'>⚙️ Definições do Ponto Digital · " + esc(ptoNomeEst(X.est)) + "</h3><p class='mut' style='margin:0 0 10px'>Só o administrador altera. Cada alteração fica no histórico.</p>" +
    "<h4 style='margin:6px 0'>Local da estação</h4><div class='pto-grelha'>" + campo("ptoLat", "Latitude", L.lat) + campo("ptoLon", "Longitude", L.lon) + "</div>" +
    "<div class='bar' style='margin:8px 0'><button class='btn' id='ptoAqui'>📍 Usar a minha localização atual</button><button class='btn' id='ptoTestar'" + (X.local ? "" : " disabled") + ">🎯 Testar aqui</button></div><div id='ptoTesteRes' class='mut'></div>" +
    "<h4 style='margin:12px 0 6px'>Regras</h4><div class='pto-grelha'>" +
    campo("ptoRaio", "Raio aceite (m)", L.raio_m || 100) + campo("ptoPrec", "Precisão máxima do sinal (m)", L.precisao_max_m || 75) +
    campo("ptoTolE", "Tolerância de atraso (min)", L.tol_entrada_min == null ? 5 : L.tol_entrada_min) + campo("ptoTolS", "Tolerância de saída antecipada (min)", L.tol_saida_min == null ? 5 : L.tol_saida_min) +
    campo("ptoAnt", "Pode entrar até (min antes do turno)", L.antecedencia_max_min == null ? 60 : L.antecedencia_max_min) + campo("ptoExtra", "Tempo a mais conta a partir de (min)", L.extra_min == null ? 15 : L.extra_min) +
    campo("ptoEsq", "Aviso de saída esquecida (horas após o fim)", L.saida_esquecida_h || 2) + "</div>" +
    "<label style='display:flex;gap:8px;align-items:center;margin:10px 0'><input type='checkbox' id='ptoAtivo'" + (L.ativo ? " checked" : "") + "> <span><b>Ponto Digital ativo para os colaboradores</b> (desligado = modo de teste, só o administrador)</span></label>" +
    "<button class='btn p' id='ptoGuardar'>Guardar definições</button> <span id='ptoGuardarRes'></span>" +
    "<h4 style='margin:16px 0 6px'>Horas dos turnos</h4><p class='mut' style='margin:0 0 6px'>Turno partido: uma linha por parte (ex.: MT 1 e MT 2). Nenhum turno passa da meia-noite.</p>" +
    "<div class='sc'><table class='t' id='ptoHoras'><thead><tr><th>Código</th><th>Parte</th><th>Início</th><th>Fim</th><th></th></tr></thead><tbody>" +
    X.horas.map(ptoLinhaHora).join("") + "</tbody></table></div>" +
    "<div class='bar' style='margin-top:8px'><button class='btn' id='ptoMaisHora'>➕ Acrescentar linha</button><button class='btn p' id='ptoGuardarHoras'>Guardar horas</button> <span id='ptoHorasRes'></span></div>" +
    (X.legenda.length ? "<p class='mut' style='margin:6px 0 0'>Códigos do horário desta estação: " + X.legenda.map(function (l) { return "<b>" + esc(l[0]) + "</b> " + esc(l[1]); }).join(" · ") + "</p>" : "") + "</div>";
  return h;
}
function ptoLinhaHora(p) {
  p = p || {codigo: "", parte: 1, inicio: "", fim: ""};
  return "<tr><td><input class='pto-cod' value='" + esc(p.codigo) + "' size='4' maxlength='6'></td><td><input class='pto-parte' type='number' min='1' max='3' value='" + (p.parte || 1) + "' style='width:4em'></td>" +
    "<td><input class='pto-ini' type='time' value='" + esc((p.inicio || "").slice(0, 5)) + "'></td><td><input class='pto-fim' type='time' value='" + esc((p.fim || "").slice(0, 5)) + "'></td><td><button class='mini pto-tira' title='Tirar linha'>✕</button></td></tr>";
}
function ptoAdminLigar() {
  var ligarTira = function () { $$(".pto-tira").forEach(function (b) { b.onclick = function () { b.closest("tr").remove(); }; }); };
  ligarTira();
  $("#ptoMaisHora").onclick = function () { $("#ptoHoras tbody").insertAdjacentHTML("beforeend", ptoLinhaHora()); ligarTira(); };
  $("#ptoAqui").onclick = async function () {
    var o = $("#ptoTesteRes"); o.textContent = "📍 A obter a localização…";
    var p = await ptoLocalizar(); if (p.erro) { o.textContent = "❌ " + p.erro; return; }
    $("#ptoLat").value = p.lat.toFixed(6); $("#ptoLon").value = p.lon.toFixed(6);
    o.innerHTML = "Localização lida com precisão de ±" + p.precisao + " m. " + (p.precisao > 30 ? "⚠️ Sinal fraco: se puder, leia junto às bombas, no exterior. " : "") + "Carregue em <b>Guardar definições</b>.";
  };
  $("#ptoTestar").onclick = async function () {
    var o = $("#ptoTesteRes"); o.textContent = "📍 A obter a localização…";
    var p = await ptoLocalizar(); if (p.erro) { o.textContent = "❌ " + p.erro; return; }
    var r = await sb.rpc("msb_ponto_testar", {p_estacao: PTO.X.est, p_lat: p.lat, p_lon: p.lon, p_precisao: p.precisao});
    if (r.error) { o.textContent = "❌ " + falhouPto(r.error); return; }
    var d = r.data; o.innerHTML = (d.ok ? "✅ Seria aceite" : "❌ Seria recusada") + ": está a <b>" + d.distancia_m + " m</b> da estação (raio " + d.raio_m + " m), sinal ±" + d.precisao_m + " m (máximo " + d.precisao_max_m + " m). Nada foi gravado.";
  };
  $("#ptoGuardar").onclick = async function () {
    var o = $("#ptoGuardarRes"), n = function (id) { return num($("#" + id).value); }, i = function (id) { return Math.round(n(id)); };
    var lat = n("ptoLat"), lon = n("ptoLon");
    if (!lat || !lon || Math.abs(lat) > 90 || Math.abs(lon) > 180) { o.innerHTML = "<span class='msgErr'>✖ Indique a latitude e a longitude da estação.</span>"; return; }
    var reg = {estacao: PTO.X.est, lat: +lat.toFixed(6), lon: +lon.toFixed(6), raio_m: i("ptoRaio"), precisao_max_m: i("ptoPrec"), tol_entrada_min: i("ptoTolE"), tol_saida_min: i("ptoTolS"),
      antecedencia_max_min: i("ptoAnt"), extra_min: i("ptoExtra"), saida_esquecida_h: i("ptoEsq"), ativo: $("#ptoAtivo").checked, atualizado_em: new Date().toISOString(), atualizado_por: EU.id};
    if (reg.ativo && !(PTO.X.local && PTO.X.local.ativo) && !await msbConfirma("Ativar o Ponto Digital para os colaboradores de " + ptoNomeEst(PTO.X.est) + "? A partir daí só picam colaboradores com conta ligada.")) return;
    var r = await sb.from("msb_ponto_locais").upsert(reg, {onConflict: "estacao"});
    if (r.error) { o.innerHTML = "<span class='msgErr'>✖ " + esc(r.error.code === "23514" ? "Há um valor fora dos limites (raio 20 a 500 m, precisão 10 a 500 m, tolerâncias até 120 min)." : falhouPto(r.error)) + "</span>"; return; }
    o.textContent = "✅ Guardado"; await carregarPonto();
  };
  $("#ptoGuardarHoras").onclick = async function () {
    var o = $("#ptoHorasRes"), est = PTO.X.est, L = [], erro = "";
    $$("#ptoHoras tbody tr").forEach(function (tr) {
      var c = tr.querySelector(".pto-cod").value.trim().toUpperCase(), p = +tr.querySelector(".pto-parte").value || 1, a = tr.querySelector(".pto-ini").value, b = tr.querySelector(".pto-fim").value;
      if (!c && !a && !b) return;
      if (!c || !a || !b) erro = erro || "Falta o código ou uma hora numa linha.";
      else if (ptoMinTxt(b) <= ptoMinTxt(a)) erro = erro || c + " " + p + ": o fim tem de ser depois do início (nenhum turno passa da meia-noite).";
      else if (L.some(function (x) { return x.codigo === c && x.parte === p; })) erro = erro || c + " parte " + p + " está repetido.";
      L.push({estacao: est, codigo: c, parte: p, inicio: a, fim: b});
    });
    if (erro) { o.innerHTML = "<span class='msgErr'>✖ " + esc(erro) + "</span>"; return; }
    var tirar = PTO.X.horas.filter(function (h) { return !L.some(function (x) { return x.codigo === h.codigo && x.parte === h.parte; }); });
    for (var k = 0; k < tirar.length; k++) { var d = await sb.from("msb_ponto_horas").delete().eq("estacao", est).eq("codigo", tirar[k].codigo).eq("parte", tirar[k].parte); if (d.error) { o.innerHTML = "<span class='msgErr'>✖ " + esc(falhouPto(d.error)) + "</span>"; return; } }
    var mud = L.filter(function (x) { return !PTO.X.horas.some(function (h) { return h.codigo === x.codigo && h.parte === x.parte && h.inicio.slice(0, 5) === x.inicio && h.fim.slice(0, 5) === x.fim; }); });
    if (mud.length) { var r = await sb.from("msb_ponto_horas").upsert(mud, {onConflict: "estacao,codigo,parte"}); if (r.error) { o.innerHTML = "<span class='msgErr'>✖ " + esc(falhouPto(r.error)) + "</span>"; return; } }
    o.textContent = "✅ Guardado"; await carregarPonto();
  };
}
