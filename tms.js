/* mystationbox · fecho contabilístico mensal do TMS (INF447 "CierreContableMensual", .csv).
 * O TMS faz as operações Multibanco, Solred e desconto imediato My Repsol; no fim do mês envia os totais.
 * Aqui: importar (só admin, com o original guardado), conferir a aritmética do próprio ficheiro e
 * comparar com a soma dos registos diários do mês (separador 🗓️ Mês). Nada é corrigido automaticamente. */
"use strict";
var TMS_CFG = null;
async function tmsComercios() {
  if (TMS_CFG) return TMS_CFG;
  var r = await sb.from("msb_config").select("estacao,tms_comercio"); if (r.error) throw r.error;
  TMS_CFG = {}; (r.data || []).forEach(function (x) { if (x.tms_comercio) TMS_CFG[x.tms_comercio.replace(/^0+/, "")] = x.estacao; });
  return TMS_CFG;
}
function nomeEstacao(id) { var e = ESTS.find(function (x) { return x.id === id; }); return e ? (e.short_name || e.name) : id; }
function dataHora(s) { return s ? dmy(s.slice(0, 10)) + " " + s.slice(11, 16) : "—"; }
function litros(cl) { return cl == null ? "—" : fmt(cl) + " L"; }

async function importarTMS(f) {
  var box = $("#tmsBox");
  try {
    var bytes = new Uint8Array(await f.arrayBuffer()), r;
    try { r = MOTOR.lerTMSBytes(bytes); } catch (e) { throw new Error((e.naoReconhecido ? "" : "Não consegui ler o ficheiro: ") + e.message); }
    var cfg = await tmsComercios(), est = cfg[r.comercio];
    if (!est) throw new Error("O comércio " + r.comercio + " do ficheiro não corresponde a nenhuma estação configurada.");
    if (est !== EST) throw new Error("Este ficheiro é de " + nomeEstacao(est) + " (comércio " + r.comercio + "). Mude a estação no cabeçalho para " + nomeEstacao(est) + " e importe de novo.");
    var erros = r.verificacoes.filter(function (v) { return v.nivel === "erro"; });
    if (erros.length) {
      box.innerHTML = "<div class='card' style='padding:12px;border:2px solid var(--bad)'><b>❌ O ficheiro tem contas que não batem certo. Não foi gravado.</b>" + erros.map(linhaVerif).join("") + "</div>";
      return;
    }
    var h = await sha(bytes), caminho = EST + "/tms/tms_" + r.comercio + "_" + r.mes + "_" + h + ".csv";
    await guardarOriginal(caminho, new Blob([bytes], {type: "text/csv"}), "text/csv");
    var chave = r.comercio + "|" + r.desde + "|" + r.ate;
    var g = await sb.from("msb_tms").upsert({estacao: EST, chave: chave, mes: r.mes, comercio: r.comercio, desde: r.desde, ate: r.ate, dados: r, original: caminho}, {onConflict: "estacao,chave"});
    if (g.error) throw g.error;
    status(true, "Fecho TMS de " + r.mes + " importado ✓");
    $("#tMes").value = r.mes; carregarTMS();
  } catch (e) { box.innerHTML = "<div class='card bad' style='padding:12px'>⚠ " + esc(falhou(e)) + "</div>"; }
}

/* Fechos que chegaram por email (10/11/2026): o OCTAN AI entrega o .csv em msb_tms_email e aqui lê-se com o mesmo leitor e as
 * mesmas verificações do carregamento à mão. Contas que não batem → «recusado» com o motivo; nunca grava números aproximados.
 * Corre quando um administrador abre a app; uma falha de rede deixa o ficheiro por ler, para a abertura seguinte. */
async function tmsEmail() {
  if (!ADMIN) return;
  try {
    var q = await sb.from("msb_tms_email").select("id,estacao,original").eq("estado", "por_ler").order("id").limit(6);
    if (q.error || !q.data || !q.data.length) return;
    var cfg = await tmsComercios(), feitos = [], maus = 0;
    for (var i = 0; i < q.data.length; i++) {
      var x = q.data[i];
      var fim = function (alt) { return sb.from("msb_tms_email").update(Object.assign({tratado_em: new Date().toISOString(), tratado_por: EU && EU.id}, alt)).eq("id", x.id).eq("estado", "por_ler"); };
      try {
        var d = await sb.storage.from("msb-originais").download(x.original); if (d.error) throw d.error;
        var r; try { r = MOTOR.lerTMSBytes(new Uint8Array(await d.data.arrayBuffer())); } catch (e) { maus++; await fim({estado: "recusado", motivo: String(e.message || e).slice(0, 500)}); continue; }
        if (cfg[r.comercio] !== x.estacao) { maus++; await fim({estado: "recusado", mes: r.mes, motivo: "O comércio " + r.comercio + " não é o desta estação."}); continue; }
        var erros = r.verificacoes.filter(function (v) { return v.nivel === "erro"; });
        if (erros.length) { maus++; await fim({estado: "recusado", mes: r.mes, motivo: erros.map(function (v) { return v.msg; }).join(" · ").slice(0, 500)}); continue; }
        var chave = r.comercio + "|" + r.desde + "|" + r.ate;
        var ex = await sb.from("msb_tms").select("chave").eq("estacao", x.estacao).eq("chave", chave).maybeSingle(); if (ex.error) throw ex.error;
        if (ex.data) { await fim({estado: "repetido", mes: r.mes}); continue; }   // já carregado à mão: não se mexe
        var g = await sb.from("msb_tms").insert({estacao: x.estacao, chave: chave, mes: r.mes, comercio: r.comercio, desde: r.desde, ate: r.ate, dados: r, original: x.original}); if (g.error) throw g.error;
        await fim({estado: "carregado", mes: r.mes}); feitos.push(nomeEstacao(x.estacao) + " " + r.mes);
      } catch (e) { /* fica por ler */ }
    }
    if (feitos.length) status(true, "Fecho TMS recebido por email e carregado: " + feitos.join(", ") + " ✓");
    else if (maus) status(false, "Chegou por email um fecho TMS que não bate certo. Veja em Conferências → Fecho mensal TMS.");
  } catch (e) { /* sem ligação: tenta na próxima abertura */ }
}
async function tmsRecusados() {   // fechos do email recusados nesta estação, à vista na página do TMS
  try {
    var q = await sb.from("msb_tms_email").select("recebido,nome,mes,motivo").eq("estacao", EST).eq("estado", "recusado").order("id", {ascending: false}).limit(3);
    if (q.error || !q.data.length) return "";
    return q.data.map(function (x) { return "<div class='card' style='padding:12px;border:2px solid var(--bad);margin-bottom:10px'><b>❌ Fecho TMS recebido por email" + (x.recebido ? " a " + dmy(x.recebido) : "") + (x.mes ? " (" + esc(x.mes) + ")" : "") + ": não foi gravado.</b><div style='font-size:14px'>" + esc(x.motivo || "") + "</div></div>"; }).join("");
  } catch (e) { return ""; }
}

async function carregarTMS() {
  var box = $("#tmsBox"), m = $("#tMes").value || MES; $("#tMes").value = m; box.innerHTML = "";
  try {
    var q = await sb.from("msb_tms").select("chave,mes,comercio,desde,ate,dados,original,criado").eq("estacao", EST).eq("mes", m).order("ate", {ascending: false});
    if (q.error) throw q.error;
    var rec = await tmsRecusados();
    if (!q.data.length) { box.innerHTML = rec + "<div class='mut' style='font-size:14px'>Sem fecho mensal do TMS importado para este mês. Chega sozinho por email no dia a seguir ao fim do mês." + (ADMIN ? " Também pode carregá-lo em <b>🧾 Fecho mensal TMS</b>." : "") + "</div>"; return; }
    var t = q.data[0], r = t.dados;
    if (!r.turnos) r.turnos = {de: r.desde ? MOTOR.turnoSeguinte(MOTOR.turnoDoFecho(r.desde)) : {dia: m + "-01", turno: "t1"}, ate: MOTOR.turnoDoFecho(r.ate)};   // importados antes de 01/11
    var L = await turnosDoPeriodo(r.turnos);
    box.innerHTML = rec + desenharTMS(t, L, m);
    var b = $("#tmsOrig"); if (b) b.onclick = function () { abrirOriginal(t.original); };
  } catch (e) { box.innerHTML = "<div class='bad'>" + esc(falhou(e)) + "</div>"; }
}

/* O período do TMS começa e acaba num fecho de operador: entram os turnos depois do fecho inicial até ao fecho final
 * (ex.: fecho a 29/09 às 23:05 → começa no T1 de 30/09). */
function chaveTurno(t) { return t.dia + (t.turno === "t1" ? "1" : "2"); }
async function turnosDoPeriodo(P) {
  var q = await sb.from("msb_turnos").select("dia,turno,func,vendas_c,mb_c,solred_c,pres_c,num_c,forn_c,chq_c,lit_cl").eq("estacao", EST).gte("dia", P.de.dia).lte("dia", P.ate.dia).order("dia");
  if (q.error) throw q.error;
  var a = chaveTurno(P.de), b = chaveTurno(P.ate);
  return (q.data || []).filter(function (x) { var k = chaveTurno(x); return k >= a && k <= b; });
}
function listaTurnos(P) { var out = [], t = P.de, fim = chaveTurno(P.ate); while (chaveTurno(t) <= fim && out.length < 200) { out.push(t); t = MOTOR.turnoSeguinte(t); } return out; }
/* Turnos do período sem registo: explicam diferenças que não são erros do TMS. */
function turnosEmFalta(P, L) {
  var tem = {}; L.forEach(function (r) { tem[chaveTurno(r)] = 1; });
  return listaTurnos(P).filter(function (t) { return !tem[chaveTurno(t)]; }).map(function (t) { return dmy(t.dia).slice(0, 5) + " " + t.turno.toUpperCase(); });
}

function desenharTMS(t, L, m) {
  var r = t.dados, s = r.resumo, soma = function (k) { return L.reduce(function (a, x) { return a + (x[k] || 0); }, 0); };
  var P = r.turnos, falta = turnosEmFalta(P, L), nT = listaTurnos(P).length;
  function estado(d, info) {
    if (info) return "<span class='b'>ℹ️ só informação</span>";
    if (falta.length) return Math.abs(d) <= 100 ? "<span class='b ok'>✅ confere</span>" : "<span class='b wn'>⚠ registo incompleto</span>";
    return d === 0 ? "<span class='b ok'>✅ confere</span>" : Math.abs(d) <= 100 ? "<span class='b wn'>⚠ " + sinal(d) + " €</span>" : "<span class='b bad'>❌ diferença</span>";
  }
  var linhas = [
    ["💳 Multibanco", "BANCARIAS − devoluções", s.mb_c, soma("mb_c"), fmt, false],
    ["⛽ Solred €", "SOLRED − devoluções", s.solred_c, soma("solred_c"), fmt, false],
    ["🛢️ Solred litros", "litros SOLRED", s.solred_cl, soma("lit_cl"), fmt, false],
    ["🎁 Solred presente", "SOLRED PRESENTE", s.pres_c, soma("pres_c"), fmt, false],
    ["💶 Numerário", "EFECTIVO − devoluções", s.num_c, soma("num_c"), fmt, true]
  ];
  var h = "<div class='card' style='padding:12px;display:grid;gap:10px;border-top:4px solid var(--laranja)'>" +
    "<div class='bar' style='justify-content:space-between'><h2 style='margin:0'>🧾 Fecho mensal do TMS · comércio " + esc(r.comercio) + "</h2>" + (t.original ? "<button class='mini' id='tmsOrig'>Ver ficheiro original</button>" : "") + "</div>" +
    "<div class='mut' style='font-size:13px'>Fechos de operador de " + dataHora(r.desde) + " a " + dataHora(r.ate) + " → turnos de <b>" + dmy(P.de.dia).slice(0, 5) + " " + P.de.turno.toUpperCase() + "</b> a <b>" + dmy(P.ate.dia).slice(0, 5) + " " + P.ate.turno.toUpperCase() + "</b> (" + nT + " turnos; " + L.length + " registados) · remessas " + (r.remessa[0] || "?") + "–" + (r.remessa[1] || "?") + "</div>";
  if (falta.length) h += "<div class='aviso'><p>⚠ Faltam <b>" + falta.length + " turnos</b> no registo deste período, por isso as somas ainda não podem bater certo: " + esc(falta.slice(0, 12).join(", ")) + (falta.length > 12 ? "…" : "") + "</p></div>";
  h += "<div class='sc'><table><thead><tr><th class='l'>O quê</th><th>TMS</th><th>Registos diários</th><th>Diferença</th><th class='l'>Estado</th></tr></thead><tbody>" +
    linhas.map(function (x) { var d = x[3] - x[2]; return "<tr><td class='l'><b>" + x[0] + "</b><div class='mut' style='font-size:12px'>" + x[1] + "</div></td><td class='n'>" + x[4](x[2]) + "</td><td class='n'>" + x[4](x[3]) + "</td><td class='n'>" + sinal(d) + "</td><td class='l'>" + estado(d, x[5]) + "</td></tr>"; }).join("") +
    "<tr><td class='l'><b>🏷️ Desconto imediato</b><div class='mut' style='font-size:12px'>descontos − reembolsos · " + litros(s.desconto_cl) + "</div></td><td class='n'>" + fmt(s.desconto_c) + "</td><td class='n mut'>não se regista por turno</td><td></td><td class='l'><span class='b'>ℹ️ só informação</span></td></tr>" +
    "<tr><td class='l'><b>📱 My Repsol</b><div class='mut' style='font-size:12px'>pagamentos com saldo My Repsol − devoluções</div></td><td class='n'>" + fmt(s.myrepsol_c) + "</td><td class='n mut'>—</td><td></td><td class='l'><span class='b'>ℹ️ só informação</span></td></tr>" +
    "</tbody></table></div>" +
    "<p class='mut' style='font-size:12px;margin:0'>O período do TMS acompanha os fechos do operador no fim do turno, por isso compara-se com esses turnos exatos (pode incluir o último dia do mês anterior). Diferenças só se resolvem com decisão humana: a app mostra, não corrige. O numerário fica só como informação até se confirmar que o TMS regista todo o dinheiro do posto.</p>";
  h += "<details class='grp'><summary>✅ Contas do próprio ficheiro (" + r.verificacoes.length + ")</summary>" + r.verificacoes.map(linhaVerif).join("") + "</details>";
  r.seccoes.forEach(function (sec) {
    sec.grupos.forEach(function (g) {
      if (!g.linhas.length) return;
      var temDto = g.linhas.some(function (l) { return l.dto != null; }), tot = g.total;
      h += "<details class='grp'><summary>" + esc(sec.titulo.charAt(0) + sec.titulo.slice(1).toLowerCase()) + (g.nome ? " · " + esc(g.nome) : "") + (tot ? " · " + fmt(tot.v) + " €" : "") + "</summary><div class='sc'><table><thead><tr><th class='l'>Produto</th><th>Op.</th><th>Litros</th><th>Valor €</th>" + (temDto ? "<th>Desconto €</th>" : "") + "</tr></thead><tbody>" +
        g.linhas.concat(tot ? [tot] : []).map(function (l) { var b = l === tot ? "<b>" : "", e = l === tot ? "</b>" : ""; return "<tr><td class='l'>" + b + esc(l.nome) + e + "</td><td class='n'>" + b + l.n + e + "</td><td class='n'>" + b + (l.l ? fmt(l.l) : "—") + e + "</td><td class='n'>" + b + fmt(l.v) + e + "</td>" + (temDto ? "<td class='n'>" + b + (l.dto == null ? "—" : fmt(l.dto)) + e + "</td>" : "") + "</tr>"; }).join("") + "</tbody></table></div></details>";
    });
  });
  return h + "</div>";
}

$("#tMes").onchange = carregarTMS;
$("#tAnt").onclick = function () { $("#tMes").value = addMes($("#tMes").value || MES, -1); carregarTMS(); };
$("#tSeg").onclick = function () { $("#tMes").value = addMes($("#tMes").value || MES, 1); carregarTMS(); };
$("#bTms").onclick = function () { $("#fTms").click(); };
$("#fTms").onchange = function () { var f = this.files[0]; this.value = ""; if (f) importarTMS(f); };
