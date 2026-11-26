/* mystationbox · Área do Colaborador (26/11/2026, «sim» do dono ao layout da tela «mystationbox · Área do Colaborador»).
 * Só para contas de colaborador (nem administrador nem gestor de estação). Início: saudação, turno de hoje com o estado do
 * ponto, ações rápidas «Falta isto» e «Avaria» e o estado de cada módulo. Perfil: nome, estação, notificações, aviso de
 * privacidade, versão da app e sair. Não grava nada: só lê e leva às páginas que já existem (Ponto, Horário, Stock,
 * Em falta, Avarias). A barra de baixo do telemóvel está em beta/beta.js (BARRA_COL). */
"use strict";
var COL = {pedido: 0};
var COL_IC = {hor: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>', art: '<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  fal: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M3 4h2l2.5 11h11L21 7H6.5"/>', avg: '<path d="M14.7 6.3a4 4 0 0 0 5 5l-8.4 8.4a2.1 2.1 0 0 1-3-3z"/><path d="M14.7 6.3 17 4l3 3-2.3 2.3"/>',
  pto: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'};
function colIc(k, cor, t) { return "<svg viewBox='0 0 24 24' width='" + (t || 20) + "' height='" + (t || 20) + "' aria-hidden='true' style='fill:none;stroke:" + (cor || "currentColor") + ";stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none'>" + COL_IC[k] + "</svg>"; }
function colHoje(d) { var x = new Date(Date.now() + (d || 0) * 864e5); return x.toLocaleDateString("sv-SE", {timeZone: "Europe/Lisbon"}); }
function colHora(t) { return new Date(t).toLocaleTimeString("pt-PT", {timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit"}); }
function colNomeEst(id) { var e = (ESTS || []).find(function (x) { return x.id === id; }); return e ? (e.name || e.short_name) : id; }
function colHoras(partes) { return (partes || []).map(function (p) { return String(p.inicio).slice(0, 5) + "–" + String(p.fim).slice(0, 5); }).join(" e "); }
var COL_FOLGA = {F: "Férias", FG: "Folga", FD: "Feriado", B: "Baixa", FJ: "Falta justificada", FI: "Falta injustificada", AU: "Ausente"};
function colTurnoTxt(cod, partes) { if (!cod) return "Sem turno hoje"; if (COL_FOLGA[cod]) return COL_FOLGA[cod]; var h = colHoras(partes); return cod + (h ? " · " + h : ""); }

/* lê o que cada cartão precisa; um cartão que falhe mostra só o texto genérico, sem travar o resto */
async function colDados() {
  var est = EST, hoje = colHoje(0), amanha = colHoje(1), mes = amanha.slice(0, 7);
  var meu = await sb.rpc("msb_ponto_meu_dia", {p_estacao: est}); if (meu.error) throw meu.error;
  var M = meu.data || {}, cid = M.colaborador_id;
  var q = await Promise.all([
    sb.from("msb_ponto_registos").select("tipo,hora,estado,estacao").eq("user_id", EU.id).eq("dia", hoje).order("hora"),
    cid ? sb.from("msb_horario_dias").select("dia,codigo").eq("estacao", est).eq("colaborador_id", cid).eq("dia", amanha).maybeSingle() : Promise.resolve({data: null}),
    sb.from("msb_horario_meses").select("estado").eq("estacao", est).eq("mes", mes).maybeSingle(),
    sb.from("msb_ponto_horas").select("codigo,parte,inicio,fim").eq("estacao", est).order("parte"),
    sb.rpc("msb_faltas_minhas", {p_estacao: est}),
    sb.from("msb_avarias").select("id,estado").eq("estacao", est).neq("estado", "concluida")
  ].map(function (p) { return Promise.resolve(p).catch(function (e) { return {error: e}; }); }));
  return {est: est, M: M, reg: q[0].error ? null : (q[0].data || []).filter(function (r) { return r.estado === "aceite"; }),
    amanha: q[1].error ? null : q[1].data, selado: !q[2].error && q[2].data && q[2].data.estado === "real", horas: q[3].error ? [] : (q[3].data || []),
    faltas: q[4].error ? null : q[4].data, avarias: q[5].error ? null : (q[5].data || []).length,
    avValidar: q[5].error ? 0 : (q[5].data || []).filter(function (a) { return a.estado === "em_analise" || a.estado === "em_resolucao"; }).length};
}

async function carregarColab() {
  var box = $("#colCorpo"); if (!box) return;
  var n = ++COL.pedido;
  if (!box.innerHTML) box.innerHTML = "<div class='mut'>A carregar…</div>";
  try { var D = await colDados(); if (n !== COL.pedido || D.est !== EST) return; box.innerHTML = colHtml(D); colLigar(box, D); }
  catch (e) { if (n === COL.pedido) box.innerHTML = "<div class='card msgErr' style='padding:12px'>✖ " + esc(falhou(e)) + "</div>" + colAtalhos(); colLigar(box, {}); }
}

function colHtml(D) {
  var M = D.M, h = new Date().toLocaleTimeString("pt-PT", {timeZone: "Europe/Lisbon", hour: "2-digit"}), hh = +h;
  var saud = hh < 13 ? "Bom dia" : hh < 20 ? "Boa tarde" : "Boa noite", nome = (M.nome || "").split(" ")[0];
  var data = new Date().toLocaleDateString("pt-PT", {timeZone: "Europe/Lisbon", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric"});
  /* estado do ponto de hoje: pela última picagem aceite */
  var reg = D.reg || [], ult = reg[reg.length - 1], ent = reg.filter(function (r) { return r.tipo === "entrada"; });
  /* o ponto regista-se sempre, com ou sem turno no horário (dono, 26/11/2026: o horário pode não estar certo) */
  var estado, botao = ult && ult.tipo === "entrada" ? "Registar saída" : "Registar entrada";
  if (!ult) estado = M.codigo && !COL_FOLGA[M.codigo] ? "Por iniciar" : "";
  else if (ult.tipo === "entrada") estado = "Turno em curso · entrou às " + colHora(ult.hora);
  else estado = "Saiu às " + colHora(ult.hora) + (ent.length ? " · entrou às " + colHora(ent[0].hora) : "");
  var h1 = "<section class='card' style='display:grid;gap:12px;padding:18px'>" +
    "<div><div style='font-size:24px;font-weight:700;letter-spacing:-.3px'>" + saud + (nome ? ", " + esc(nome) : "") + "</div>" +
    "<div class='mut'>" + esc(colNomeEst(D.est)) + " · " + esc(data) + "</div></div>" +
    "<div style='display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap'><div style='font-size:20px;font-weight:700'>" + esc(colTurnoTxt(M.codigo, M.partes)) + "</div>" +
    (estado ? "<span class='b'>" + esc(estado) + "</span>" : "") + "</div>" +
    (botao ? "<button class='btn p' data-ir='pto' style='min-height:56px;font-size:17px;display:flex;align-items:center;justify-content:center;gap:10px'>" + colIc("pto", "#fff", 22) + botao + "</button>" : "<button class='btn' data-ir='pto' style='min-height:48px'>Ver o Ponto</button>") +
    "</section>";
  var amanha = D.amanha && D.selado ? colTurnoTxt(D.amanha.codigo, D.horas.filter(function (p) { return p.codigo === D.amanha.codigo; })) : null;
  var f = D.faltas, fTxt = !f ? "Listas de artigos em falta" : f.rascunho && f.rascunho.itens.length ? "1 lista por enviar · " + f.rascunho.itens.length + " artigos" : (f.enviadas || []).length ? "Última enviada " + new Date(f.enviadas[0].enviada_em).toLocaleDateString("pt-PT", {day: "2-digit", month: "2-digit"}) : "Nenhuma lista por enviar";
  var aTxt = D.avarias == null ? "Comunicar e acompanhar" : D.avarias ? D.avarias + (D.avarias === 1 ? " avaria aberta" : " avarias abertas") + " na estação" +
    (D.avValidar ? " · " + D.avValidar + " com o prestador: valide quando ficar a funcionar" : "") : "Nenhuma avaria aberta";
  return h1 + colAtalhos() +
    "<div class='mut' style='font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin:4px 4px -4px'>Os meus módulos</div>" +
    "<section style='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px'>" +
    colCartao("hor", "#1A63E8", "#EAF1FF", "Horário", amanha ? "Amanhã: " + amanha : "Ver a semana") +
    colCartao("art", "#1A63E8", "#EAF1FF", "Stock", "Pesquisar artigos") +
    colCartao("fal", "#0B6B3A", "#E3F6EC", "Em falta", fTxt) +
    colCartao("avg", "#92400E", "#FEF3C7", "Avarias", aTxt) + "</section>";
}
function colAtalhos() {
  return "<section style='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px'>" +
    "<button class='btn' data-ir='fal' style='min-height:60px;font-size:16px;font-weight:600;background:#0F172A;color:#fff;border:0;display:flex;align-items:center;justify-content:center;gap:10px'>" + colIc("fal", "#fff", 22) + "Falta isto</button>" +
    "<button class='btn' data-ir='avn' style='min-height:60px;font-size:16px;font-weight:600;background:#C2410C;color:#fff;border:0;display:flex;align-items:center;justify-content:center;gap:10px'>" + colIc("avg", "#fff", 22) + "Avaria</button></section>";
}
function colCartao(pg, cor, fundo, nome, txt) {
  return "<button class='card' data-ir='" + pg + "' style='margin:0;padding:14px;text-align:left;font:inherit;color:inherit;cursor:pointer;display:grid;gap:4px;min-height:96px;align-content:start'>" +
    "<span style='width:36px;height:36px;border-radius:10px;background:" + fundo + ";display:flex;align-items:center;justify-content:center;margin-bottom:4px'>" + colIc(pg, cor) + "</span><b style='font-size:15px'>" + nome + "</b><span class='mut' style='font-size:13px'>" + esc(txt) + "</span></button>";
}
function colLigar(box) { box.querySelectorAll("[data-ir]").forEach(function (b) { b.onclick = function () { ir(b.dataset.ir); }; }); }

/* ---------- Perfil ---------- */
async function carregarPerfil() {
  var box = $("#perCorpo"); if (!box) return;
  var M = {};
  try { var r = await sb.rpc("msb_ponto_meu_dia", {p_estacao: EST}); if (!r.error) M = r.data || {}; } catch (e) { /* mostra o resto */ }
  var nome = M.nome || (window.PERFIL && PERFIL.display_name) || "", ini = nome.split(" ").filter(Boolean).slice(0, 2).map(function (p) { return p[0]; }).join("").toUpperCase();
  var ests = (ESTS || []).map(function (e) { return e.name || e.short_name; }).join(" · ");
  box.innerHTML = "<section class='card' style='display:flex;align-items:center;gap:14px;padding:18px'>" +
    "<div aria-hidden='true' style='width:56px;height:56px;border-radius:28px;background:#EAF1FF;color:#1A63E8;font-weight:700;font-size:20px;display:flex;align-items:center;justify-content:center;flex:none'>" + esc(ini || "?") + "</div>" +
    "<div><div style='font-size:18px;font-weight:700'>" + esc(nome || "—") + "</div><div class='mut'>Colaborador · " + esc(ests) + "</div>" +
    "<div class='mut' style='font-size:13px'>" + esc((window.EU && EU.email) || "") + "</div></div></section>" +
    "<section class='card' style='display:grid;gap:10px;padding:18px'><h2 style='margin:0'>Notificações</h2>" +
    "<p class='mut' style='margin:0'>Escolha que avisos recebe e ative as notificações neste telemóvel.</p>" +
    "<button class='btn p' id='perNotif' style='min-height:48px'>🔔 Preferências de notificações</button>" +
    "<button class='btn' data-ir='pto' style='min-height:44px'>🕒 Lembretes do ponto</button></section>" +
    "<section class='card' style='display:grid;gap:10px;padding:18px'><h2 style='margin:0'>Conta</h2>" +
    "<button class='btn' data-ir='pto' style='min-height:44px;text-align:left'>🔒 Aviso de privacidade do Ponto Digital</button>" +
    "<details style='border:1px solid var(--bd);border-radius:12px;padding:10px 12px'><summary style='cursor:pointer;font-weight:600;min-height:28px'>Mudar palavra-passe</summary>" +
    "<div style='display:grid;gap:8px;margin-top:10px'><label>Nova palavra-passe<input id='perPw1' type='password' autocomplete='new-password' minlength='8' style='width:100%;box-sizing:border-box;min-height:44px'></label>" +
    "<label>Repetir a nova palavra-passe<input id='perPw2' type='password' autocomplete='new-password' minlength='8' style='width:100%;box-sizing:border-box;min-height:44px'></label>" +
    "<button class='btn p' id='perPwOk' style='min-height:48px'>Guardar a nova palavra-passe</button><div id='perPwMsg' role='status'></div>" +
    "<p class='mut' style='margin:0;font-size:13px'>Pelo menos 8 letras ou números. Não a partilhe com ninguém.</p></div></details>" +
    "<div class='mut'>Versão da app: <b id='perVersao'>" + esc(window.VERSAO_APP ? "v" + VERSAO_APP : "a verificar…") + "</b></div>" +
    "<button class='btn' id='perSair' style='min-height:52px;color:#B42318;border-color:#FCA5A5'>Terminar sessão</button></section>";
  colLigar(box);
  $("#perNotif").onclick = function () { if (window.notifPreferencias) notifPreferencias(); else ir("pto"); };
  $("#perSair").onclick = function () { var s = $("#bSair"); if (s) s.click(); };
  /* mudar a palavra-passe (dono, 26/11/2026: cada colaborador pode mudar a inicial aqui) */
  $("#perPwOk").onclick = async function () {
    var a = $("#perPw1").value, b = $("#perPw2").value, m = $("#perPwMsg"), bt = this;
    var erro = a.length < 8 ? "A palavra-passe tem de ter pelo menos 8 letras ou números." : a !== b ? "As duas palavras-passe não são iguais." : "";
    if (erro) { m.innerHTML = "<span class='bad'>✖ " + esc(erro) + "</span>"; return; }
    bt.disabled = true; m.textContent = "A guardar…";
    try { var r = await sb.auth.updateUser({password: a}); if (r.error) throw r.error; $("#perPw1").value = $("#perPw2").value = ""; m.innerHTML = "<span style='color:#0B6B3A'>✔ Palavra-passe mudada. Use a nova da próxima vez que entrar.</span>"; }
    catch (e) { m.innerHTML = "<span class='bad'>✖ " + esc(/same|different/i.test(e.message || "") ? "A nova palavra-passe tem de ser diferente da atual." : falhou(e)) + "</span>"; }
    bt.disabled = false;
  };
  if (!window.VERSAO_APP && window.versaoPublicada) versaoPublicada().then(function (v) { var e = $("#perVersao"); if (e) e.textContent = v ? "v" + v : "desconhecida"; });
}
