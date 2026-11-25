/* mystationbox · Artigos em falta (Stock → Em falta, toda a equipa; não confundir com app/faltas.js, que são as saídas de caixa por entregar) e Compras → Sugeridas pelos funcionários (administrador). 25/11/2026.
 * Decisões do dono: o colaborador faz a lista de uma vez (leitor de códigos ou nome/código), sem quantidades, e no fim
 * valida e envia; pode fazer mais listas; as listas ficam num espaço próprio das Compras (não entram na proposta de domingo).
 * O colaborador só escreve pelas funções msb_faltas_* (base de dados); o administrador marca decisões e «vista».
 * «Encomendar» marca o artigo para encomendar: ainda não o junta sozinho à encomenda do fornecedor. */
"use strict";
var FAL = {d: null, msg: "", sug: null, pedido: 0, temp: null, ocupado: false};

async function carregarArtigosFalta() {
  var box = $("#falCorpo"); if (!box) return;
  if (!FAL.d) box.innerHTML = "<section class='card'><div class='mut'>A carregar…</div></section>";
  try { var r = await sb.rpc("msb_faltas_minhas", {p_estacao: EST}); if (r.error) throw r.error; FAL.d = r.data; FAL.msg = ""; }
  catch (e) { FAL.d = null; FAL.msg = falFalhou(e); }
  falDesenhar();
}
function falFalhou(e) { var m = falhou(e); return /msb_faltas|does not exist|schema cache|PGRST202/i.test(m + " " + (e && e.code || "")) ? "As Faltas ainda não estão ativas na base de dados." : m; }

function falDesenhar() {
  var box = $("#falCorpo"); if (!box) return;
  if (!FAL.d) { box.innerHTML = "<section class='card'><div class='bad'>" + esc(FAL.msg || "Sem dados.") + "</div></section>"; return; }
  var r = FAL.d.rascunho, it = r ? r.itens : [], n = it.length;
  var h = "<section class='card'><div style='display:flex;justify-content:space-between;align-items:center;gap:8px'><h2 style='margin:0'>🛒 " + (n ? "Lista por enviar" : "Nova lista") + "</h2>" +
    "<span class='mut'>" + n + (n === 1 ? " artigo" : " artigos") + "</span></div>" +
    "<p class='mut' style='margin:6px 0 10px'>Leia os códigos com 📷 ou escreva o nome ou o código. No fim, valide e envie. A lista fica guardada até a enviar.</p>" +
    "<div style='display:flex;gap:8px'><input id='falTxt' type='search' autocomplete='off' enterkeyhint='done' placeholder='Nome ou código do artigo' aria-label='Adicionar artigo à lista' style='flex:1;min-width:0;font-size:17px;min-height:48px'>" +
    "<button id='falCam' class='btn p' style='min-width:56px;min-height:48px' aria-label='Ler código de barras com a câmara'>📷</button></div>" +
    "<div id='falCamBox'></div><div id='falSug'></div>" +
    (FAL.msg ? "<div class='bad' style='margin-top:8px'>" + esc(FAL.msg) + "</div>" : "") +
    (n ? "<div style='margin-top:12px;border:1px solid var(--bd);border-radius:12px;overflow:hidden'>" + it.map(falLinha).join("") + "</div>" +
      "<input id='falNota' maxlength='500' placeholder='Nota para a gerência (opcional)' aria-label='Nota para a gerência' style='margin-top:10px;width:100%;box-sizing:border-box;min-height:44px'>" +
      "<button id='falEnviar' class='btn p' style='margin-top:10px;width:100%;min-height:52px;font-size:17px'>✅ Validar e enviar · " + n + (n === 1 ? " artigo" : " artigos") + "</button>"
      : "<div class='mut' style='margin-top:12px'>Ainda sem artigos.</div>") +
    "</section>";
  var env = FAL.d.enviadas || [];
  h += "<section class='card'><h2 style='margin:0 0 8px'>Listas enviadas</h2>" + (env.length ? env.map(function (l) {
    var vista = l.estado === "vista";
    return "<div style='display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 0;border-top:1px solid var(--bd)'>" +
      "<div><b>" + falData(l.enviada_em) + "</b> · " + l.n + (l.n === 1 ? " artigo" : " artigos") + "</div>" +
      "<span class='b' style='white-space:nowrap'>" + (vista ? "✅ Vista pela gerência" : "📨 Enviada") + "</span></div>";
  }).join("") : "<div class='mut'>Ainda não enviou nenhuma lista.</div>") + "</section>";
  box.innerHTML = h;
  var i = $("#falTxt");
  i.oninput = function () { clearTimeout(FAL.temp); var v = i.value; FAL.temp = setTimeout(function () { falSugerir(v); }, 300); };
  i.onkeydown = function (e) {   // leitor USB: escreve e dá Enter
    if (e.key !== "Enter") return; e.preventDefault(); clearTimeout(FAL.temp);
    var v = i.value.trim(); if (!v) return;
    if (/^[0-9A-Za-z]{4,20}$/.test(v.replace(/\s/g, "")) && /\d/.test(v)) falAdicionar({codigo: v}); else falSugerir(v);
  };
  $("#falCam").onclick = function () { CAM ? camParar() : camAbrir("#falCamBox", "#falCam", function (c) { falAdicionar({codigo: c}); }); };
  box.querySelectorAll("[data-tirar]").forEach(function (b) { b.onclick = function () { falTirar(+b.dataset.tirar); }; });
  if ($("#falEnviar")) $("#falEnviar").onclick = falEnviar;
}
function falLinha(x) {
  var sub = x.poscode ? "CBOS " + esc(x.poscode) + " · " + esc(CATALOGO_CBOS.familia(x.poscode)) : "escrito à mão";
  return "<div style='display:flex;align-items:center;gap:8px;padding:6px 6px 6px 12px;border-top:1px solid var(--bd)'>" +
    "<div style='flex:1;min-width:0'><div style='font-weight:600'>" + esc(x.nome) + "</div><div class='mut' style='font-size:13px'>" + sub + "</div>" +
    (x.ja_hoje ? "<div style='font-size:13px;color:#92400E;font-weight:600'>⚠️ Também está numa lista enviada hoje</div>" : "") + "</div>" +
    "<button class='btn' data-tirar='" + x.id + "' aria-label='Tirar " + esc(x.nome) + " da lista' style='min-width:44px;min-height:44px'>✕</button></div>";
}
function falData(iso) { var d = new Date(iso); return d.toLocaleDateString("pt-PT", {day: "2-digit", month: "2-digit"}) + " " + d.toLocaleTimeString("pt-PT", {hour: "2-digit", minute: "2-digit"}); }

async function falSugerir(t) {
  t = String(t || "").trim(); var n = ++FAL.pedido, box = $("#falSug"); if (!box) return;
  if (t.length < 2) { box.innerHTML = ""; return; }
  try {
    var r = await sb.rpc("msb_artigos_pesquisar", {p_estacao: EST, p_texto: t}); if (r.error) throw r.error;
    if (n !== FAL.pedido) return;
    var L = (r.data || []).slice(0, 8);
    box.innerHTML = "<div style='margin-top:8px;border:1px solid var(--bd);border-radius:12px;overflow:hidden'>" +
      L.map(function (a, k) { return "<button class='falOp' data-k='" + k + "' style='display:block;width:100%;text-align:left;padding:10px 12px;border:0;border-top:" + (k ? "1px solid var(--bd)" : "0") + ";background:var(--card);color:inherit;font:inherit;min-height:44px'><b>" + esc(a.nome) + "</b> <span class='mut'>· " + esc(a.poscode) + "</span></button>"; }).join("") +
      "<button id='falLivre' style='display:block;width:100%;text-align:left;padding:10px 12px;border:0;border-top:" + (L.length ? "1px solid var(--bd)" : "0") + ";background:var(--card);color:inherit;font:inherit;min-height:44px'>✏️ Juntar como texto: «" + esc(t) + "»</button></div>";
    box.querySelectorAll(".falOp").forEach(function (b) { b.onclick = function () { falAdicionar({codigo: L[+b.dataset.k].poscode}); }; });
    $("#falLivre").onclick = function () { falAdicionar({texto: t}); };
  } catch (e) { if (n === FAL.pedido) box.innerHTML = "<div class='bad' style='margin-top:8px'>" + esc(falhou(e)) + "</div>"; }
}
async function falChamar(fn, args) {
  if (FAL.ocupado) return; FAL.ocupado = true;
  try { var r = await sb.rpc(fn, args); if (r.error) throw r.error; FAL.d = r.data; FAL.msg = ""; return true; }
  catch (e) { FAL.msg = /não encontrado/i.test(e.message || "") ? "❌ " + e.message + ". Procure pelo nome ou junte como texto." : falFalhou(e); return false; }
  finally { FAL.ocupado = false; FAL.pedido++; falDesenhar(); }
}
function falAdicionar(o) { return falChamar("msb_faltas_adicionar", {p_estacao: EST, p_codigo: o.codigo || null, p_texto: o.texto || null}); }
function falTirar(id) { return falChamar("msb_faltas_tirar", {p_item: id}); }
async function falEnviar() {
  var r = FAL.d && FAL.d.rascunho; if (!r || !r.itens.length) return;
  var nota = ($("#falNota") || {}).value || "";
  if (!confirm("Enviar a lista com " + r.itens.length + (r.itens.length === 1 ? " artigo" : " artigos") + " à gerência? Depois de enviada já não se altera.")) return;
  if (await falChamar("msb_faltas_enviar", {p_lista: r.id, p_nota: nota})) { var b = $("#falCorpo"); if (b) b.insertAdjacentHTML("afterbegin", "<div class='card' style='color:#0B6B3A'>✅ Lista enviada. Pode começar outra.</div>"); }
}

/* ---------- Compras → Sugeridas pelos funcionários (administrador) ---------- */
var SUG = {est: "", estado: "enviada", L: null, sel: null, msg: ""};
async function carregarSugeridas() {
  var box = $("#sugCorpo"); if (!box) return;
  if (!SUG.L) box.innerHTML = "<section class='card'><div class='mut'>A carregar…</div></section>";
  var ests = SUG.est ? [SUG.est] : ESTS.map(function (x) { return x.id; });
  try {
    var q = sb.from("msb_faltas_listas").select("id,estacao,quem,estado,nota,enviada_em,vista_em,vista_por,msb_faltas_itens(id,poscode,texto,nome,decisao,decidido_por)")
      .in("estacao", ests).order("enviada_em", {ascending: false}).limit(60);
    q = SUG.estado === "enviada" ? q.eq("estado", "enviada") : q.eq("estado", "vista");
    var r = await q; if (r.error) throw r.error;
    SUG.L = r.data || []; SUG.msg = "";
    if (!SUG.L.some(function (l) { return l.id === SUG.sel; })) SUG.sel = SUG.L.length ? SUG.L[0].id : null;
  } catch (e) { SUG.L = []; SUG.msg = falFalhou(e); }
  sugDesenhar();
}
function sugDesenhar() {
  var box = $("#sugCorpo"); if (!box) return;
  var nomeEst = function (id) { var e = ESTS.find(function (x) { return x.id === id; }); return e ? (e.short_name || e.name) : id; };
  var bt = function (v, t, on, k) { return "<button class='btn" + (on ? " p" : "") + "' data-" + k + "='" + v + "' style='min-height:40px'>" + t + "</button>"; };
  var h = "<section class='card'><div style='display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between'><h2 style='margin:0'>🛒 Compras sugeridas pelos funcionários</h2>" +
    "<div style='display:flex;flex-wrap:wrap;gap:6px'>" + bt("", "Todas", !SUG.est, "est") + ESTS.map(function (e) { return bt(e.id, esc(e.short_name || e.name), SUG.est === e.id, "est"); }).join("") +
    "<span style='width:8px'></span>" + bt("enviada", "Por ver", SUG.estado === "enviada", "estado") + bt("vista", "Vistas", SUG.estado === "vista", "estado") + "</div></div>" +
    "<p class='mut' style='margin:6px 0 0'>Listas de artigos em falta enviadas pelos colaboradores. «Encomendar» marca o artigo; a quantidade e a encomenda fazem-se em Compras como sempre.</p>" +
    (SUG.msg ? "<div class='bad' style='margin-top:8px'>" + esc(SUG.msg) + "</div>" : "") + "</section>";
  if (!SUG.msg && !SUG.L.length) h += "<section class='card'><div class='mut'>" + (SUG.estado === "enviada" ? "Não há listas por ver." : "Ainda não há listas vistas.") + "</div></section>";
  if (SUG.L.length) {
    var hoje = {}; SUG.L.forEach(function (l) { var d = (l.enviada_em || "").slice(0, 10); l.msb_faltas_itens.forEach(function (i) { if (i.poscode) { var k = l.estacao + d + i.poscode; hoje[k] = (hoje[k] || 0) + 1; } }); });
    var s = SUG.L.find(function (l) { return l.id === SUG.sel; });
    h += "<div style='display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start'>" +
      "<section style='flex:1 1 260px;max-width:360px;display:grid;gap:8px'>" + SUG.L.map(function (l) {
        return "<button data-lista='" + l.id + "' class='card' style='text-align:left;cursor:pointer;font:inherit;color:inherit;margin:0;" + (l.id === SUG.sel ? "outline:2px solid #1A63E8" : "") + "'>" +
          "<div style='display:flex;justify-content:space-between;gap:8px'><b>" + esc(nomeEst(l.estacao)) + "</b><span class='b'>" + (l.estado === "vista" ? "✅ Vista" : "📨 Por ver") + "</span></div>" +
          "<div style='font-weight:600;margin-top:4px'>" + esc(l.quem || "—") + " · " + l.msb_faltas_itens.length + " artigos</div>" +
          "<div class='mut' style='font-size:13px'>" + falData(l.enviada_em) + (l.nota ? " · «" + esc(l.nota.slice(0, 60)) + "»" : "") + "</div></button>";
      }).join("") + "</section>";
    if (s) {
      var d = (s.enviada_em || "").slice(0, 10);
      h += "<section class='card' style='flex:999 1 420px;min-width:0;margin:0'>" +
        "<div style='display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;align-items:flex-start'><div><h2 style='margin:0'>" + esc(nomeEst(s.estacao)) + " · " + esc(s.quem || "—") + "</h2><div class='mut'>Enviada " + falData(s.enviada_em) + " · " + s.msb_faltas_itens.length + " artigos" + (s.vista_em ? " · vista " + falData(s.vista_em) + " por " + esc(s.vista_por || "") : "") + "</div></div>" +
        (s.estado === "enviada" ? "<button class='btn p' id='sugVista' style='min-height:44px'>✅ Marcar lista como vista</button>" : "") + "</div>" +
        (s.nota ? "<div style='margin-top:10px;padding:10px 12px;border-radius:12px;background:var(--bg2, #F1F5FA)'><span class='mut'>Nota:</span> «" + esc(s.nota) + "»</div>" : "") +
        "<div style='overflow-x:auto;margin-top:10px'><table class='t' style='width:100%'><thead><tr><th>Artigo</th><th>CBOS</th><th>Família</th><th style='text-align:right'>Decisão</th></tr></thead><tbody>" +
        s.msb_faltas_itens.slice().sort(function (a, b) { return a.id - b.id; }).map(function (i) {
          var dup = i.poscode && hoje[s.estacao + d + i.poscode] > 1;
          var dec = i.decisao === "encomendar" ? "<span class='b'>🛒 Encomendar</span> " : i.decisao === "nao" ? "<span class='b'>✋ Não encomendar</span> " : "";
          return "<tr><td><b>" + esc(i.nome) + "</b>" + (i.poscode ? "" : " <span class='mut'>(escrito à mão)</span>") + (dup ? "<div style='font-size:13px;color:#92400E;font-weight:600'>⚠️ Também noutra lista desse dia</div>" : "") + "</td>" +
            "<td>" + esc(i.poscode || "—") + "</td><td>" + esc(i.poscode ? CATALOGO_CBOS.familia(i.poscode) : "—") + "</td>" +
            "<td style='text-align:right;white-space:nowrap'>" + dec + (i.decisao !== "encomendar" ? "<button class='btn' data-dec='encomendar' data-item='" + i.id + "' style='min-height:36px'>Encomendar</button> " : "") +
            (i.decisao !== "nao" ? "<button class='btn' data-dec='nao' data-item='" + i.id + "' style='min-height:36px'>Não</button>" : "") + "</td></tr>";
        }).join("") + "</tbody></table></div></section>";
    }
    h += "</div>";
  }
  box.innerHTML = h;
  box.querySelectorAll("[data-est]").forEach(function (b) { b.onclick = function () { SUG.est = b.dataset.est; carregarSugeridas(); }; });
  box.querySelectorAll("[data-estado]").forEach(function (b) { b.onclick = function () { SUG.estado = b.dataset.estado; SUG.sel = null; carregarSugeridas(); }; });
  box.querySelectorAll("[data-lista]").forEach(function (b) { b.onclick = function () { SUG.sel = +b.dataset.lista; sugDesenhar(); }; });
  box.querySelectorAll("[data-dec]").forEach(function (b) { b.onclick = function () { sugDecidir(+b.dataset.item, b.dataset.dec); }; });
  if ($("#sugVista")) $("#sugVista").onclick = sugVista;
}
function sugQuem() { return (window.EU && (EU.email || (EU.user && EU.user.email))) || "administrador"; }
async function sugDecidir(item, dec) {
  try { var r = await sb.from("msb_faltas_itens").update({decisao: dec, decidido_em: new Date().toISOString(), decidido_por: sugQuem()}).eq("id", item); if (r.error) throw r.error; }
  catch (e) { SUG.msg = falhou(e); }
  carregarSugeridas();
}
async function sugVista() {
  try { var r = await sb.from("msb_faltas_listas").update({estado: "vista", vista_em: new Date().toISOString(), vista_por: sugQuem()}).eq("id", SUG.sel).eq("estado", "enviada"); if (r.error) throw r.error; }
  catch (e) { SUG.msg = falhou(e); }
  carregarSugeridas();
}
