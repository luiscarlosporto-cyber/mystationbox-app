/* mystationbox · centro de notificações (25/11/2026; primeiro uso: Avarias). Spec em docs/superpowers/specs/2026-11-25-avarias-design.md.
 * Sino no topo com o número por ler, atualizado em tempo real (Supabase Realtime: cada pessoa só recebe as suas, pelo RLS).
 * As notificações nascem na base de dados (msb_av_notificar); aqui só se leem, se marcam como lidas e se abrem.
 * Push (app fechada): Web Push padrão, o MESMO do Ponto Digital (um telemóvel só tem uma subscrição por app): mesma chave
 * VAPID (msb_push_vapid_publica = PTO_VAPID de ponto.js) e mesma tabela msb_ponto_push. Quem envia as das avarias é a
 * Edge Function msb-avarias-push; as do Ponto, a msb-ponto-lembretes. Nada de Firebase nem de bibliotecas novas. */
"use strict";
var NOTIF = {lista: [], porLer: 0, canal: null, montado: false};
var NOTIF_TIPOS = [
  ["nova", "Nova avaria", "Quando alguém comunica uma avaria (administradores)"],
  ["critica", "Avaria crítica", "Alerta urgente, com som e vibração"],
  ["atribuida", "Avaria atribuída a mim", "Quando passa a ser o responsável"],
  ["estado", "Mudança de estado", "Avarias que comunicou ou de que é responsável"],
  ["concluida", "Avaria concluída", "Quando fica resolvida"],
  ["comentario", "Comentários", "Novos comentários nas avarias que comunicou ou trata"],
  ["ponto", "Ponto", "Picagens em falta, justificações e decisões"]
];
function notifEsc(s) { return window.esc ? esc(s) : String(s == null ? "" : s); }
function notifQuando(t) { return window.AVARIAS ? AVARIAS.idade(t) : new Date(t).toLocaleString("pt-PT"); }
function notifEuAdmin() { return !!(window.PERFIL && PERFIL.role === "admin"); }   // só dois perfis nas avarias: administrador e colaborador

/* ---------- sino ---------- */
function notifMontar() {
  if (NOTIF.montado || !window.EU) return; NOTIF.montado = true;
  var b = document.createElement("button"); b.id = "bSino"; b.type = "button"; b.setAttribute("aria-label", "Notificações");
  b.innerHTML = "<svg class='ic' viewBox='0 0 24 24' aria-hidden='true'><path d='M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9'/><path d='M10.3 21a1.94 1.94 0 0 0 3.4 0'/></svg><i id='bSinoN' hidden>0</i>";
  var topo = document.getElementById("bTopo"), sair = document.getElementById("bSair");
  if (topo && sair && sair.parentNode === topo) topo.insertBefore(b, sair); else if (topo) topo.appendChild(b);
  else { var hd = document.querySelector("header .hd-dir"); if (hd) hd.insertBefore(b, hd.firstChild); }
  b.onclick = function (e) { e.stopPropagation(); notifAlternar(); };
  document.addEventListener("click", function (e) { var p = document.getElementById("notifPainel"); if (p && !p.contains(e.target) && e.target.closest("#bSino") == null) p.remove(); });
  if (sair) sair.addEventListener("click", notifParar);
  if (navigator.serviceWorker) navigator.serviceWorker.addEventListener("message", function (e) { if (e.data && e.data.msb === "avaria") notifAbrirLink(e.data.url); });
  notifCarregar(); notifLigar(); notifPushRenovar();
  setTimeout(function () { notifAbrirLink(location.href); }, 400);   // aberta a partir de uma notificação: …/#avaria=PN-0007
}
function notifParar() {
  if (NOTIF.canal) { try { sb.removeChannel(NOTIF.canal); } catch (e) { /* já fechado */ } }
  NOTIF.canal = null; NOTIF.montado = false; NOTIF.lista = []; NOTIF.porLer = 0;
  var b = document.getElementById("bSino"); if (b) b.remove();
}
async function notifCarregar() {
  try {
    var r = await sb.from("msb_notificacoes").select("id,tipo,prioridade,titulo,corpo,link,criado_em,lida_em").order("criado_em", {ascending: false}).limit(60);
    if (r.error) throw r.error;
    var c = await sb.from("msb_notificacoes").select("id", {count: "exact", head: true}).is("lida_em", null);
    NOTIF.lista = r.data || []; NOTIF.porLer = c.count || 0; notifContador();
  } catch (e) { /* tabela ainda não ativa ou sem rede: o sino fica a zero, a app continua */ }
}
function notifContador() {
  var n = document.getElementById("bSinoN"); if (!n) return;
  n.hidden = !NOTIF.porLer; n.textContent = NOTIF.porLer > 99 ? "99+" : String(NOTIF.porLer);
  var b = document.getElementById("bSino"); if (b) b.setAttribute("aria-label", "Notificações" + (NOTIF.porLer ? ", " + NOTIF.porLer + " por ler" : ""));
  try { if (navigator.setAppBadge) NOTIF.porLer ? navigator.setAppBadge(NOTIF.porLer) : navigator.clearAppBadge(); } catch (e) { /* sem emblema no ícone */ }
}
/* tempo real: a nova notificação aparece já, sem recarregar */
function notifLigar() {
  if (!sb.channel || NOTIF.canal) return;
  NOTIF.canal = sb.channel("notif-" + EU.id).on("postgres_changes", {event: "INSERT", schema: "public", table: "msb_notificacoes", filter: "user_id=eq." + EU.id}, function (p) {
    var x = p.new; if (!x || NOTIF.lista.some(function (y) { return y.id === x.id; })) return;
    NOTIF.lista.unshift(x); if (!x.lida_em) NOTIF.porLer++; notifContador(); notifAviso(x);
    if (document.getElementById("notifPainel")) notifDesenhar();
    if (window.avAtualizar) avAtualizar(x);
  }).subscribe();
}
/* aviso dentro da app; a crítica fica até ser vista */
function notifAviso(x) {
  if (x.lida_em) return;
  var t = document.createElement("div"), crit = x.tipo === "critica"; t.className = "notifToast" + (crit ? " crit" : ""); t.setAttribute("role", crit ? "alert" : "status");
  t.innerHTML = "<b>" + notifEsc(x.titulo) + "</b><span>" + notifEsc(x.corpo) + "</span><small>Tocar para abrir</small>";
  t.onclick = function () { t.remove(); notifClicar(x); };
  document.body.appendChild(t);
  if (crit) { try { navigator.vibrate && navigator.vibrate([300, 120, 300, 120, 300]); } catch (e) { /* sem vibração */ } }
  else setTimeout(function () { t.remove(); }, 7000);
}

/* ---------- painel ---------- */
function notifAlternar() {
  var p = document.getElementById("notifPainel"); if (p) return p.remove();
  p = document.createElement("div"); p.id = "notifPainel"; p.setAttribute("role", "dialog"); p.setAttribute("aria-label", "Notificações");
  document.body.appendChild(p); notifDesenhar(); notifCarregar().then(function () { if (document.getElementById("notifPainel")) notifDesenhar(); });
}
function notifDesenhar() {
  var p = document.getElementById("notifPainel"); if (!p) return;
  var L = NOTIF.lista;
  p.innerHTML = "<div class='np-cab'><b>Notificações</b>" + (NOTIF.porLer ? "<button class='lk' id='npTodas'>Marcar todas como lidas</button>" : "") + "<button class='np-x' aria-label='Fechar'>✕</button></div>" +
    "<div class='np-lista'>" + (L.length ? L.map(function (x) {
      return "<button class='np-item" + (x.lida_em ? "" : " nova") + (x.tipo === "critica" ? " crit" : "") + "' data-id='" + x.id + "'><b>" + notifEsc(x.titulo) + "</b><span>" + notifEsc(x.corpo) + "</span><small>" + notifEsc(notifQuando(x.criado_em)) + (x.lida_em ? "" : " · por ler") + "</small></button>";
    }).join("") : "<p class='mut np-vazio'>Sem notificações.</p>") + "</div>" +
    "<div class='np-pe'><button class='btn' id='npPrefs'>⚙️ Preferências e notificações no telemóvel</button></div>";
  p.querySelector(".np-x").onclick = function () { p.remove(); };
  var t = document.getElementById("npTodas"); if (t) t.onclick = async function () { await notifLidas(null); notifDesenhar(); };
  document.getElementById("npPrefs").onclick = function () { p.remove(); notifPreferencias(); };
  p.querySelectorAll(".np-item").forEach(function (b) { b.onclick = function () { var x = NOTIF.lista.find(function (y) { return y.id === +b.dataset.id; }); p.remove(); notifClicar(x); }; });
}
async function notifLidas(ids) {
  try {
    var r = await sb.rpc("msb_notif_lidas", {p_ids: ids}); if (r.error) throw r.error;
    var agora = new Date().toISOString();
    NOTIF.lista.forEach(function (x) { if (!x.lida_em && (!ids || ids.indexOf(x.id) >= 0)) x.lida_em = agora; });
    NOTIF.porLer = ids ? Math.max(0, NOTIF.porLer - (r.data || 0)) : 0; notifContador();
  } catch (e) { /* fica por ler: tenta-se na próxima vez */ }
}
function notifClicar(x) {
  if (!x) return;
  if (!x.lida_em) notifLidas([x.id]);
  notifAbrirLink(x.link);
}
/* …#avaria=PN-0007 abre a ficha da avaria */
function notifAbrirLink(url) {
  var hs = String(url || "").replace(/^[^#]*/, "");
  if (/^#(ponto|ptg)\b/.test(hs) && window.ir) {   // avisos do Ponto: colaborador → Ponto; administrador → Gestão de Picagens
    try { if (/#(ponto|ptg)/.test(location.hash)) history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* fica o # */ }
    ir(/^#ptg/.test(hs) ? "ptg" : "pto"); return true;
  }
  if (!url || !window.AVARIAS) return false;
  var n = AVARIAS.lerNumero(String(url).replace(/^[^#]*/, ""));
  if (!n) return false;
  try { if (/avaria=/.test(location.hash)) history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* fica o # */ }
  if (window.avAbrirNumero) avAbrirNumero(n.estacao, n.numero, n.ano);
  return true;
}

/* ---------- preferências e push ---------- */
function notifPushSuportado() { return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window; }
function notifIOS() { return /iPhone|iPad|iPod/.test(navigator.userAgent); }
function notifInstalada() { return (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true; }
function notifChave(b64) {
  var p = "=".repeat((4 - b64.length % 4) % 4), s = atob((b64 + p).replace(/-/g, "+").replace(/_/g, "/")), a = new Uint8Array(s.length);
  for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
  return a;
}
async function notifSubscricaoAtual() {
  if (!notifPushSuportado()) return null;
  var reg = await navigator.serviceWorker.ready; return reg.pushManager.getSubscription();
}
async function notifGuardarSub(s) {
  var j = s.toJSON();
  var r = await sb.from("msb_ponto_push").upsert({user_id: EU.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, aparelho: navigator.userAgent.slice(0, 160)}, {onConflict: "endpoint"});
  if (r.error) throw r.error;
}
/* o navegador pode renovar a subscrição sozinho: volta a guardá-la em cada arranque (só se já tinha autorização) */
async function notifPushRenovar() {
  try { if (!notifPushSuportado() || Notification.permission !== "granted") return; var s = await notifSubscricaoAtual(); if (s) await notifGuardarSub(s); } catch (e) { /* tenta-se no próximo arranque */ }
}
async function notifAtivarPush() {
  if (!notifPushSuportado()) throw new Error(notifIOS() && !notifInstalada() ? "No iPhone, primeiro instale a app: no Safari, botão Partilhar → «Adicionar ao ecrã principal». Depois abra a app pelo ícone e ative aqui." : "Este navegador não recebe notificações push.");
  var perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("As notificações estão bloqueadas neste aparelho. Autorize-as nas definições do navegador para o mystationbox e tente de novo.");
  var k = await sb.rpc("msb_push_vapid_publica"); if (k.error) throw k.error; if (!k.data) throw new Error("O servidor de notificações ainda não está preparado.");
  var reg = await navigator.serviceWorker.ready, s = await reg.pushManager.getSubscription();
  if (!s) s = await reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: notifChave(k.data)});
  await notifGuardarSub(s);
}
async function notifDesativarPush() {
  var s = await notifSubscricaoAtual(); if (!s) return;
  await sb.from("msb_ponto_push").delete().eq("endpoint", s.endpoint); await s.unsubscribe();   // desliga também os lembretes do Ponto neste aparelho
}
async function notifPreferencias() {
  var d = document.createElement("dialog"); d.id = "notifPrefs"; d.className = "avDlg";
  d.innerHTML = "<div class='avDlg-cab'><b>Notificações</b><button class='np-x' value='x' aria-label='Fechar'>✕</button></div><div class='avDlg-corpo'><p class='mut'>A carregar…</p></div>";
  document.body.appendChild(d); d.showModal();
  d.onclose = function () { d.remove(); }; d.querySelector(".np-x").onclick = function () { d.close(); };
  var corpo = d.querySelector(".avDlg-corpo"), adm = notifEuAdmin();
  async function desenhar(msg) {
    var r = await sb.from("msb_notif_prefs").select("tipo,app,push"), P = {};
    (r.data || []).forEach(function (x) { P[x.tipo] = x; });
    var sub = null; try { sub = await notifSubscricaoAtual(); } catch (e) { /* sem service worker */ }
    var est = !notifPushSuportado() ? (notifIOS() && !notifInstalada() ? "⚠️ No iPhone, as notificações com a app fechada só funcionam com a app instalada: Safari → Partilhar → «Adicionar ao ecrã principal»." : "ℹ️ Este navegador não recebe notificações com a app fechada.")
      : Notification.permission === "denied" ? "❌ Bloqueadas neste aparelho. Autorize nas definições do navegador."
      : sub ? "✅ Ativas neste aparelho (avarias e lembretes do Ponto Digital)." : "⚪ Desligadas neste aparelho.";
    corpo.innerHTML = "<div class='card avPush'><b>📱 Neste aparelho</b><p>" + notifEsc(est) + "</p><div class='bar'>" +
      (notifPushSuportado() && Notification.permission !== "denied" ? (sub ? "<button class='btn' id='npDesl'>Desligar neste aparelho</button><button class='btn' id='npTeste'>Ver um exemplo</button>" : "<button class='btn p' id='npLig'>🔔 Ativar notificações</button>") : "") +
      "</div>" + (msg ? "<p class='" + (msg.ok ? "ok" : "bad") + "'>" + notifEsc(msg.t) + "</p>" : "") + "</div>" +
      "<div class='card'><b>O que quer receber</b><table class='npTab'><thead><tr><th class='l'></th><th>Na app</th><th>No telemóvel</th></tr></thead><tbody>" +
      NOTIF_TIPOS.map(function (t) {
        var p = P[t[0]] || {app: true, push: true}, fixa = t[0] === "critica" && adm;
        return "<tr><td class='l'><b>" + t[1] + "</b><small>" + t[2] + (fixa ? " · sempre ligada para administradores" : "") + "</small></td>" +
          "<td><input type='checkbox' aria-label='" + t[1] + " na app' data-t='" + t[0] + "' data-c='app'" + (p.app || fixa ? " checked" : "") + (fixa ? " disabled" : "") + "></td>" +
          "<td><input type='checkbox' aria-label='" + t[1] + " no telemóvel' data-t='" + t[0] + "' data-c='push'" + (p.push || fixa ? " checked" : "") + (fixa ? " disabled" : "") + "></td></tr>";
      }).join("") + "</tbody></table></div>";
    var lig = corpo.querySelector("#npLig"), desl = corpo.querySelector("#npDesl"), tst = corpo.querySelector("#npTeste");
    if (lig) lig.onclick = async function () { lig.disabled = true; try { await notifAtivarPush(); desenhar({ok: true, t: "Notificações ativas neste aparelho."}); } catch (e) { desenhar({ok: false, t: e.message || falhou(e)}); } };
    if (desl) desl.onclick = async function () { try { await notifDesativarPush(); desenhar({ok: true, t: "Desligadas neste aparelho."}); } catch (e) { desenhar({ok: false, t: falhou(e)}); } };
    if (tst) tst.onclick = async function () { var reg = await navigator.serviceWorker.ready; reg.showNotification("mystationbox · exemplo", {body: "É assim que as avarias vão aparecer.", icon: "icone-192.png", badge: "icone-64.png", tag: "msb-exemplo"}); };
    corpo.querySelectorAll("input[type=checkbox]").forEach(function (c) {
      c.onchange = async function () {
        var linha = {tipo: c.dataset.t, app: corpo.querySelector("[data-t='" + c.dataset.t + "'][data-c='app']").checked, push: corpo.querySelector("[data-t='" + c.dataset.t + "'][data-c='push']").checked};
        var r = await sb.from("msb_notif_prefs").upsert(linha, {onConflict: "user_id,tipo"});
        if (r.error) { c.checked = !c.checked; alert(falhou(r.error)); }
      };
    });
  }
  try { await desenhar(); } catch (e) { corpo.innerHTML = "<div class='aviso'>⚠ " + notifEsc(falhou(e)) + "</div>"; }
}
window.notifMontar = notifMontar; window.notifPreferencias = notifPreferencias; window.notifAbrirLink = notifAbrirLink;
