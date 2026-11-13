/* mystationbox · Tesouraria → Banco (07/11/2026). Só administrador.
 * Carrega o extrato «Movimentos de Conta» do Crédito Agrícola (Excel), confere os saldos linha a linha e guarda os movimentos
 * em msb_extratos (nunca repete: a chave é conta|dia|valor|saldo). A conta decide a estação; uma conta nova associa-se uma vez.
 * O que não se reconhece fica «por classificar»: o dono classifica um nome uma vez e fica a regra (msb_extratos_regras).
 * Depósitos × numerário dos turnos a partir de 01/09/2026 (âmbito decidido pelo dono). Regras em app/extratos_regras.js. */
"use strict";
var BAN = {mes: null, movs: [], regras: [], turnos: [], lido: null, novos: 0};
var BAN_DESDE = "2026-09-01";
function falhouBanco(e) { var m = falhou(e); return /msb_extratos|msb_contas_banco|does not exist|schema cache|42P01|PGRST205/i.test(m + " " + (e && e.code || "")) ? "O banco ainda não está ativo na base de dados." : m; }
function banAviso(t, ok) { var s = $("#banSt"); if (s) { s.className = "st " + (ok ? "ok" : "bad"); s.textContent = (ok ? "✔ " : "⚠ ") + t; } }
function banMesPt(m) { return new Date(m + "-15").toLocaleDateString("pt-PT", {month: "long", year: "numeric"}); }
function banTipos(sel) { return Object.keys(EXTRATOS.TIPOS).map(function (k) { return "<option value='" + k + "'" + (k === sel ? " selected" : "") + ">" + esc(EXTRATOS.TIPOS[k]) + "</option>"; }).join(""); }
/* categorias já usadas nesta estação: o dono pode escrever uma nova (ex.: o nome de um cliente a crédito), que fica na lista */
function banCategorias() {
  var c = {}; Object.keys(EXTRATOS.TIPOS).forEach(function (k) { if (k !== "por_classificar") c[EXTRATOS.TIPOS[k]] = 1; });
  BAN.movs.concat(BAN.regras).forEach(function (m) { if (m.categoria) c[m.categoria] = 1; });
  return "<datalist id='banCats'>" + Object.keys(c).sort(function (a, b) { return a.localeCompare(b, "pt"); }).map(function (x) { return "<option value='" + esc(x) + "'>"; }).join("") + "</datalist>";
}
function banSinal(c) { return "<span class='" + (c < 0 ? "bad" : "ok") + "'>" + (c > 0 ? "+" : "") + fmt(c) + "</span>"; }

/* Só lê o princípio do ficheiro para saber se é um extrato (usado pelo 📥 Carregar). */
async function ehExtrato(f) {
  try { await carregarXlsxMSB(); var wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), {type: "array", sheetRows: 4}), L = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header: 1, defval: null});
    return L.some(function (r) { return /^Operação:\s*Consulta de Movimentos de Contas/i.test(String(r[0] || "").trim()); }); }
  catch (e) { return false; }
}

async function carregarBanco() {
  if (!BAN.mes) BAN.mes = addMes(mesHoje(), -1);
  var box = $("#banCorpo"); if (!BAN.lido) box.innerHTML = "<div class='mut'>A carregar…</div>";
  try {
    var r = await lerTudo(function () { return sb.from("msb_extratos").select("*").eq("estacao", EST).gte("dia", BAN_DESDE).order("dia").order("ordem"); }, ["id"]); if (r.error) throw r.error;
    var g = await sb.from("msb_extratos_regras").select("*").eq("estacao", EST).order("padrao"); if (g.error) throw g.error;
    var t = await lerTudo(function () { return sb.from("msb_turnos").select("dia,num_c").eq("estacao", EST).gte("dia", BAN_DESDE); }, ["dia", "turno"]); if (t.error) throw t.error;
    BAN.movs = r.data || []; BAN.regras = g.data || []; BAN.turnos = t.data || [];
    desenharBanco();
  } catch (e) { box.innerHTML = "<div class='bad'>" + esc(falhouBanco(e)) + "</div>"; }
}

function desenharBanco() {
  var M = BAN.movs, doMes = M.filter(function (m) { return m.dia.slice(0, 7) === BAN.mes; }), fim = M.filter(function (m) { return m.dia.slice(0, 7) <= BAN.mes; }).pop();
  var ent = doMes.reduce(function (s, m) { return s + (m.valor_c > 0 ? m.valor_c : 0); }, 0), sai = doMes.reduce(function (s, m) { return s + (m.valor_c < 0 ? -m.valor_c : 0); }, 0);
  var porCl = M.filter(function (m) { return m.tipo === "por_classificar"; });
  var h = "<div class='bar'><button class='btn' id='banAnt' aria-label='Mês anterior'>‹</button><input type='month' id='banMes' value='" + esc(BAN.mes) + "'><button class='btn' id='banSeg' aria-label='Mês seguinte'>›</button>" +
    "<button class='btn p' id='banBtn'>🏦 Carregar extrato (Excel)</button><input type='file' id='banFich' accept='.xlsx,.xls' hidden><span id='banSt' class='st'></span></div><div id='banPrev'></div>";
  if (!M.length) h += "<div class='card' style='padding:14px'><b>Ainda não há movimentos do banco nesta estação.</b><p class='mut' style='margin:6px 0 0'>No homebanking do Crédito Agrícola: Consultas → Movimentos de conta, escolha o período e exporte em Excel. Depois carregue aqui o ficheiro, tal como vem.</p></div>";
  else {
    h += "<section class='totem'><div class='t'>Banco · " + esc(banMesPt(BAN.mes)) + "</div><div><div class='k'>Saldo no fim do mês</div><div class='v'>" + (fim ? fmt(fim.saldo_c) : "—") + "<small>€</small></div></div>" +
      "<div><div class='k'>Entradas</div><div class='v'>" + fmt(ent) + "<small>€</small></div></div><div><div class='k'>Saídas</div><div class='v'>" + fmt(sai) + "<small>€</small></div></div>" +
      "<div><div class='k'>Por classificar</div><div class='v'>" + porCl.length + "</div></div></section>";
    h += banNumerario() + banPorClassificar(porCl) + banResumo(doMes) + banLista(doMes);
  }
  $("#banCorpo").innerHTML = h;
  $("#banAnt").onclick = function () { BAN.mes = addMes(BAN.mes, -1); desenharBanco(); };
  $("#banSeg").onclick = function () { BAN.mes = addMes(BAN.mes, 1); desenharBanco(); };
  $("#banMes").onchange = function () { if (this.value) { BAN.mes = this.value; desenharBanco(); } };
  $("#banBtn").onclick = function () { $("#banFich").click(); };
  $("#banFich").onchange = function () { var f = this.files && this.files[0]; this.value = ""; if (f) importarExtrato(f); };
  $$("#banCorpo [data-grupo]").forEach(function (b) { b.onclick = function () { classificarGrupo(b.dataset.grupo); }; });
  $$("#banCorpo select[data-mov]").forEach(function (s) { s.onchange = function () { classificarUm(+s.dataset.mov, s.value); }; });
  if (BAN.lido) mostrarPrevia();
}

function banNumerario() {
  var L = EXTRATOS.numerarioDepositos(BAN.turnos, BAN.movs, BAN_DESDE);
  if (!L.length) return "";
  return "<div class='card' style='padding:14px;display:grid;gap:8px'><h2 style='margin:0'>Numerário dos turnos × depósitos</h2>" +
    "<div class='sc'><table><thead><tr><th class='l'>Mês</th><th>Numerário dos turnos</th><th>Depositado</th><th>Depósitos</th><th>Por depositar (acumulado)</th></tr></thead><tbody>" +
    L.map(function (l) { return "<tr><td class='l'>" + esc(banMesPt(l.mes)) + "</td><td>" + fmt(l.numerario_c) + "</td><td>" + fmt(l.depositado_c) + "</td><td>" + l.depositos + "</td><td><b>" + fmt(l.por_depositar_c) + "</b></td></tr>"; }).join("") +
    "</tbody></table></div><p class='mut' style='margin:0;font-size:13px'>Desde 01/09/2026. É um indicador: o numerário dos turnos inclui saídas de caixa que não chegam ao banco, e o dinheiro do fim do mês é depositado no mês seguinte. Um valor que cresça todos os meses pede explicação.</p></div>";
}

/* agrupa por nome (contraparte) e sentido; sem nome, cada movimento fica sozinho */
function banGrupos(porCl) {
  var g = {};
  porCl.forEach(function (m) { var s = m.valor_c > 0 ? "C" : "D", k = m.contraparte ? s + "|" + m.contraparte : "id|" + m.id;
    (g[k] = g[k] || {k: k, nome: m.contraparte, sinal: s, movs: [], total: 0}).movs.push(m); g[k].total += m.valor_c; });
  return Object.keys(g).map(function (k) { return g[k]; }).sort(function (a, b) { return Math.abs(b.total) - Math.abs(a.total); });
}
function banPorClassificar(porCl) {
  if (!porCl.length) return "<div class='card' style='padding:14px'>✔ Todos os movimentos estão classificados.</div>";
  BAN.grupos = banGrupos(porCl);
  return "<div class='card' style='padding:14px;display:grid;gap:10px'><h2 style='margin:0'>Por classificar · " + porCl.length + " movimentos</h2>" +
    "<p class='mut' style='margin:0;font-size:13px'>Classifique cada nome uma vez: os movimentos seguintes com o mesmo nome passam a vir já classificados. Na categoria pode escrever um nome novo (por exemplo, o nome do cliente a crédito): fica guardado para as próximas vezes.</p>" + banCategorias() +
    BAN.grupos.map(function (g, i) {
      var um = g.movs.length === 1 ? g.movs[0] : null;
      return "<div class='bar' style='flex-wrap:wrap;gap:8px;border-top:1px solid var(--line, #e5e9ed);padding-top:8px'><div style='flex:1;min-width:200px'><b>" + esc(g.nome || um.descricao) + "</b><br><span class='mut' style='font-size:13px'>" +
        g.movs.length + (g.movs.length === 1 ? " movimento · " + dmy(um.dia) : " movimentos") + " · " + (g.sinal === "C" ? "entrada" : "saída") + "</span></div><div>" + banSinal(g.total) + " €</div>" +
        "<select id='banT" + i + "'>" + banTipos(g.sinal === "C" ? "recebimento" : "fornecedor") + "</select><input id='banC" + i + "' list='banCats' placeholder='Categoria' title='Escolha da lista ou escreva uma nova' style='width:200px'>" +
        "<button class='btn p' data-grupo='" + i + "'>" + (g.nome ? "Classificar e lembrar" : "Classificar") + "</button></div>";
    }).join("") + "</div>";
}
function banResumo(doMes) {
  var R = EXTRATOS.resumo(doMes); if (!R.length) return "";
  return "<div class='card' style='padding:14px;display:grid;gap:8px'><h2 style='margin:0'>Resumo de " + esc(banMesPt(BAN.mes)) + "</h2><div class='sc'><table><thead><tr><th class='l'>Tipo</th><th>Movimentos</th><th>Entradas</th><th>Saídas</th></tr></thead><tbody>" +
    R.map(function (x) { return "<tr><td class='l'>" + esc(x.nome) + "</td><td>" + x.n + "</td><td>" + (x.creditos_c ? fmt(x.creditos_c) : "") + "</td><td>" + (x.debitos_c ? fmt(x.debitos_c) : "") + "</td></tr>"; }).join("") + "</tbody></table></div></div>";
}
function banLista(doMes) {
  if (!doMes.length) return "<div class='card' style='padding:14px' class='mut'>Sem movimentos neste mês.</div>";
  return "<details class='card' style='padding:14px'><summary><b>Movimentos de " + esc(banMesPt(BAN.mes)) + "</b> <span class='mut'>(" + doMes.length + ")</span></summary><div class='sc' style='margin-top:8px'><table><thead><tr><th class='l'>Data</th><th class='l'>Descrição</th><th class='l'>Tipo</th><th>Valor</th><th>Saldo</th></tr></thead><tbody>" +
    doMes.slice().reverse().map(function (m) { var d = m.detalhe || {}, ref = d.referencia ? " · " + d.referencia : "";
      return "<tr><td class='l'>" + dmy(m.dia) + "</td><td class='l'>" + esc(m.descricao) + (ref || m.descritivo ? "<br><span class='mut' style='font-size:12px'>" + esc((m.descritivo || "") + ref) + "</span>" : "") + "</td>" +
        "<td class='l'><select data-mov='" + m.id + "' style='max-width:190px'>" + banTipos(m.tipo) + "</select>" + (m.categoria && m.categoria !== EXTRATOS.TIPOS[m.tipo] ? "<br><span class='mut' style='font-size:12px'>" + esc(m.categoria) + "</span>" : "") + "</td>" +
        "<td>" + banSinal(m.valor_c) + "</td><td>" + fmt(m.saldo_c) + "</td></tr>"; }).join("") + "</tbody></table></div></details>";
}

async function classificarGrupo(i) {
  var g = BAN.grupos[+i], tipo = $("#banT" + i).value, cat = $("#banC" + i).value.trim() || EXTRATOS.TIPOS[tipo], quem = quemSou(), agora = new Date().toISOString();
  if (tipo === "por_classificar") return banAviso("Escolha um tipo.");
  try {
    if (g.nome) {
      var p = g.nome.toUpperCase(), ins = await sb.from("msb_extratos_regras").upsert({estacao: EST, padrao: p, sinal: g.sinal, tipo: tipo, categoria: cat, criado_por: quem}, {onConflict: "estacao,padrao,sinal"});
      if (ins.error) throw ins.error;
    }
    var u = await sb.from("msb_extratos").update({tipo: tipo, categoria: cat, regra: g.nome ? "aprendida" : "manual", classificado_em: agora, classificado_por: quem}).in("id", g.movs.map(function (m) { return m.id; }));
    if (u.error) throw u.error;
    await carregarBanco(); banAviso((g.nome ? "«" + g.nome + "» classificado e lembrado" : "Classificado") + ": " + g.movs.length + " movimento(s).", true);
  } catch (e) { banAviso(falhouBanco(e)); }
}
async function classificarUm(id, tipo) {
  try {
    var u = await sb.from("msb_extratos").update({tipo: tipo, categoria: EXTRATOS.TIPOS[tipo], regra: "manual", classificado_em: new Date().toISOString(), classificado_por: quemSou()}).eq("id", id);
    if (u.error) throw u.error;
    var m = BAN.movs.find(function (x) { return x.id === id; }); if (m) { m.tipo = tipo; m.categoria = EXTRATOS.TIPOS[tipo]; }
    banAviso("Classificação mudada (fica no histórico).", true);
  } catch (e) { banAviso(falhouBanco(e)); }
}

/* ---------------- carregar um extrato ---------------- */
async function lerFolhaExtrato(f) {
  await carregarXlsxMSB();
  var wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), {type: "array"});
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header: 1, raw: true, defval: null});
}
async function importarExtrato(f) {
  if (PAGINA !== "ban") ir("ban");
  BAN.lido = null; banAviso("A ler " + f.name + "…", true);
  try {
    var L = await lerFolhaExtrato(f);
    var c = await sb.from("msb_contas_banco").select("conta,estacao"); if (c.error) throw c.error;
    var contas = {}; (c.data || []).forEach(function (x) { contas[x.conta] = x.estacao; });
    var r = EXTRATOS.ler(L, contas);
    if (r.estacao && r.estacao !== EST) throw new Error("Este extrato é da conta " + r.conta + ", que pertence a " + nomeEstacao(r.estacao) + ". Mude de estação para o carregar. Nada foi gravado.");
    var g = await sb.from("msb_extratos_regras").select("padrao,sinal,tipo,categoria").eq("estacao", EST); if (g.error) throw g.error;
    r = EXTRATOS.ler(L, contas, g.data || []);
    var ja = {}, ch = r.movimentos.map(function (m) { return m.chave; });
    for (var k = 0; k < ch.length; k += 150) { var e = await sb.from("msb_extratos").select("chave").in("chave", ch.slice(k, k + 150)); if (e.error) throw e.error; (e.data || []).forEach(function (x) { ja[x.chave] = 1; }); }
    var antes = await sb.from("msb_extratos").select("dia,saldo_c").eq("conta", r.conta).lt("dia", r.de).order("dia", {ascending: false}).order("ordem", {ascending: false}).limit(1); if (antes.error) throw antes.error;
    BAN.lido = {f: f, r: r, ja: ja, antes: (antes.data || [])[0] || null};
    $("#banSt").textContent = ""; mostrarPrevia();
  } catch (e) { BAN.lido = null; mostrarPrevia(); banAviso(falhouBanco(e)); }
}
function mostrarPrevia() {
  var box = $("#banPrev"); if (!box) return;
  var x = BAN.lido; if (!x) { box.innerHTML = ""; return; }
  var r = x.r, novos = r.movimentos.filter(function (m) { return !x.ja[m.chave]; }), R = EXTRATOS.resumo(novos), porCl = novos.filter(function (m) { return m.tipo === "por_classificar"; }).length;
  var buraco = x.antes && x.antes.saldo_c !== r.saldo_inicial_c;
  var h = "<div class='card' style='padding:14px;display:grid;gap:10px;border:2px solid var(--lar, #F36C21)'><h2 style='margin:0'>Extrato lido: confira antes de gravar</h2>" +
    "<div>Conta <b>" + esc(r.conta) + "</b> · " + dmy(r.de) + " a " + dmy(r.ate) + " · " + r.movimentos.length + " movimentos</div>" +
    "<div>Saldo inicial <b>" + fmt(r.saldo_inicial_c) + " €</b> · entradas " + fmt(r.creditos_c) + " € · saídas " + fmt(r.debitos_c) + " € · saldo final <b>" + fmt(r.saldo_final_c) + " €</b></div>" +
    "<div class='msgOk'>✔ Os saldos batem certo em todas as linhas.</div>" +
    (buraco ? "<div class='msgErr'>⚠ O saldo inicial deste extrato não é o saldo do último movimento já gravado (" + fmt(x.antes.saldo_c) + " € em " + dmy(x.antes.dia) + "). Pode faltar um período entre os dois extratos.</div>" : "") +
    (r.ate >= BAN_DESDE ? "" : "<div class='msgErr'>⚠ Este extrato é todo anterior a 01/09/2026, fora do âmbito decidido.</div>");
  if (!r.estacao) h += "<div class='aviso'><p>Esta conta ainda não está associada a nenhuma estação. É a conta de <b>" + esc(nomeEstacao(EST)) + "</b>?</p><div class='bar'><button class='btn p' id='banAssociar'>Sim, é de " + esc(nomeEstacao(EST)) + "</button><button class='btn' id='banCancelar'>Cancelar</button></div></div>";
  else {
    h += "<div class='sc'><table><thead><tr><th class='l'>Tipo (proposta)</th><th>Movimentos</th><th>Entradas</th><th>Saídas</th></tr></thead><tbody>" +
      R.map(function (t) { return "<tr><td class='l'>" + esc(t.nome) + "</td><td>" + t.n + "</td><td>" + (t.creditos_c ? fmt(t.creditos_c) : "") + "</td><td>" + (t.debitos_c ? fmt(t.debitos_c) : "") + "</td></tr>"; }).join("") + "</tbody></table></div>" +
      "<div>" + novos.length + " movimentos novos" + (r.movimentos.length - novos.length ? " · " + (r.movimentos.length - novos.length) + " já estavam gravados e ficam como estão" : "") + (porCl ? " · " + porCl + " ficam por classificar" : "") + ".</div>" +
      "<div class='bar'>" + (novos.length ? "<button class='btn p' id='banGravar'>Gravar " + novos.length + " movimentos</button>" : "<span class='mut'>Nada de novo para gravar.</span>") + "<button class='btn' id='banCancelar'>Cancelar</button></div>";
  }
  box.innerHTML = h + "</div>";
  $("#banCancelar").onclick = function () { BAN.lido = null; mostrarPrevia(); };
  if ($("#banAssociar")) $("#banAssociar").onclick = associarConta;
  if ($("#banGravar")) $("#banGravar").onclick = gravarExtrato;
}
async function associarConta() {
  var x = BAN.lido; if (!x) return;
  if (!(await msbConfirma("A conta " + x.r.conta + " fica associada a " + nomeEstacao(EST) + ". Os extratos desta conta passam a ser sempre desta estação. Continuar?"))) return;
  try {
    var i = await sb.from("msb_contas_banco").insert({conta: x.r.conta, estacao: EST, criado_por: quemSou()}); if (i.error) throw i.error;
    await importarExtrato(x.f);
  } catch (e) { banAviso(falhouBanco(e)); }
}
async function hashFicheiro(f) {
  var b = await crypto.subtle.digest("SHA-256", await f.arrayBuffer());
  return Array.from(new Uint8Array(b)).map(function (x) { return x.toString(16).padStart(2, "0"); }).join("");
}
async function gravarExtrato() {
  var x = BAN.lido; if (!x) return;
  var bt = $("#banGravar"); bt.disabled = true; bt.textContent = "A gravar…";
  try {
    var r = x.r, quem = quemSou(), caminho = EST + "/banco/" + r.conta + "_" + r.de + "_" + r.ate + "_" + (await hashFicheiro(x.f)).slice(0, 16) + ".xlsx";
    var up = await sb.storage.from("msb-despesas").upload(caminho, x.f, {upsert: false, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
    if (up.error && !/exist|duplicate|409/i.test(up.error.message + " " + (up.error.statusCode || ""))) throw up.error;
    var linhas = r.movimentos.filter(function (m) { return !x.ja[m.chave]; }).map(function (m) {
      return {estacao: EST, conta: r.conta, chave: m.chave, dia: m.dia, dia_valor: m.dia_valor, ordem: m.ordem, descricao: m.descricao, descritivo: m.descritivo, contraparte: m.contraparte,
        valor_c: m.valor_c, saldo_c: m.saldo_c, detalhe: m.detalhe, tipo: m.tipo, categoria: m.categoria, regra: m.regra, original: caminho, criado_por: quem};
    });
    for (var k = 0; k < linhas.length; k += 200) { var i = await sb.from("msb_extratos").upsert(linhas.slice(k, k + 200), {onConflict: "chave", ignoreDuplicates: true}); if (i.error) throw i.error; }
    BAN.lido = null; BAN.mes = r.ate.slice(0, 7);
    await carregarBanco(); banAviso(linhas.length + " movimentos gravados.", true);
  } catch (e) { bt.disabled = false; bt.textContent = "Gravar"; banAviso(falhouBanco(e)); }
}
