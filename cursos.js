/* mystationbox · Formação & Segurança — ecrã do colaborador (fase 2, 28/11/2026; proposta aprovada pelo dono a 27/11/2026).
 * Página «fsc» (Início → Formação): cursos para fazer (com percursos de módulos), lições, teste e certificado; formações feitas.
 * O tempo de formação conta só com o curso aberto e visível (sinal a cada minuto; o servidor nunca conta mais do que o tempo real).
 * O teste é sorteado e corrigido no servidor: as respostas certas só chegam depois de passar.
 * Regras puras em fs_regras.js; base de dados em supabase/migrations/20261128_msb_formacao_sst.sql. */
"use strict";
var FSC = {d: null, at: null, licao: 0, teste: null, resp: {}, res: null, timer: null, ping: 0, pdfs: {}};
var FS_EMPRESA = {pnf: "Porto & Nunes, Lda. · Repsol Penafiel Circular", sto: "Porto João & Nunes, Lda. · Repsol Santo Tirso"};

function fsData(t) { return t ? new Date(String(t).length <= 10 ? t + "T12:00:00" : t).toLocaleDateString("pt-PT", {timeZone: "Europe/Lisbon"}) : ""; }
async function fsRpc(nome, args) { var r = await sb.rpc(nome, args || {}); if (r.error) throw new Error(r.error.message || "Erro"); return r.data; }
function fsMsg(sel, txt, mau) { var m = $(sel); if (m) { m.textContent = txt; m.style.color = mau ? "#B42318" : "#166534"; } }
function fsEstado(e, fora) {
  var c = {por_comecar: ["#DBEAFE", "#1E40AF", "▶"], em_curso: ["#E0E7FF", "#3730A3", "⏳"], teste: ["#FEF3C7", "#92400E", "📝"], concluido: ["#DCFCE7", "#166534", "✅"],
    bloqueado: ["#FEE2E2", "#991B1B", "⛔"], aguarda: ["#F1F5F9", "#475569", "🔒"], anulado: ["#F1F5F9", "#475569", ""]}[e] || ["#eee", "#333", ""];
  if (fora) c = ["#FEE2E2", "#991B1B", "⚠️"];
  return "<span style='background:" + c[0] + ";color:" + c[1] + ";border-radius:8px;padding:3px 8px;font-size:13px;font-weight:600;white-space:nowrap'>" + c[2] + " " +
    esc(fora ? "Fora de prazo" : FS_REGRAS.ESTADOS_ATRIB[e] || e) + "</span>";
}

/* ---------- blocos das lições (também usados na pré-visualização do administrador) ---------- */
function fsBlocosHtml(blocos) {
  return (blocos || []).map(function (b, i) {
    if (b.tipo === "texto") {
      var out = "", lista = [];
      var fecha = function () { if (lista.length) { out += "<ul style='margin:0 0 10px;padding-left:20px;display:grid;gap:6px'>" + lista.join("") + "</ul>"; lista = []; } };
      (b.linhas || String(b.texto || "").split("\n")).forEach(function (l) {
        if (/^•\s*/.test(l)) lista.push("<li>" + esc(l.replace(/^•\s*/, "")) + "</li>"); else { fecha(); if (l.trim()) out += "<p style='margin:0 0 10px'>" + esc(l) + "</p>"; }
      });
      fecha();
      return "<div style='font-size:16px;line-height:1.5'>" + out + "</div>";
    }
    if (b.tipo === "pdf") return "<div class='fsPdf' data-pdf='" + esc(b.caminho) + "' style='border:1px solid var(--bd);border-radius:14px;padding:12px;display:grid;gap:10px'>" +
      "<div style='display:flex;align-items:center;gap:10px'><span style='font-size:26px' aria-hidden='true'>📄</span><b style='flex:1'>" + esc(b.titulo || "Documento") + "</b></div>" +
      "<button class='btn p fsPdfVer' style='min-height:48px'>Ver o documento</button><div class='fsPdfPags' style='display:grid;gap:8px'></div></div>";
    if (b.tipo === "imagem") return "<img data-img='" + esc(b.caminho) + "' alt='" + esc(b.titulo || "") + "' style='width:100%;border-radius:12px'>";
    if (b.tipo === "video") return "<a class='btn' href='" + esc(b.url) + "' target='_blank' rel='noopener' style='min-height:48px;display:flex;align-items:center;justify-content:center;text-decoration:none'>▶ " + esc(b.titulo || "Ver o vídeo") + "</a>";
    if (b.tipo === "aviso") return "<p style='margin:0;background:#FEF3C7;color:#92400E;border-radius:10px;padding:10px 12px'>⚠️ " + esc(b.texto) + "</p>";
    return "";
  }).join("");
}
/* PDF da lição: páginas desenhadas aqui (o telemóvel não abre PDF dentro da app com fiabilidade) */
function fsLigarBlocos(box) {
  box.querySelectorAll(".fsPdf").forEach(function (d) {
    var bt = d.querySelector(".fsPdfVer");
    bt.onclick = async function () {
      bt.disabled = true; bt.textContent = "A abrir…";
      try {
        var u = await sb.storage.from("msb-formacao").createSignedUrl(d.dataset.pdf, 900);
        if (u.error || !u.data) throw new Error("Documento ainda não disponível.");
        await carregarPdfJsCBOS();
        var doc = await pdfjsLib.getDocument({url: u.data.signedUrl, isEvalSupported: false}).promise, alvo = d.querySelector(".fsPdfPags"), larg = Math.min(alvo.clientWidth || 360, 900);
        for (var p = 1; p <= doc.numPages; p++) {
          var pg = await doc.getPage(p), v1 = pg.getViewport({scale: 1}), esc2 = (larg / v1.width) * (window.devicePixelRatio || 1), vp = pg.getViewport({scale: esc2});
          var cv = document.createElement("canvas"); cv.width = vp.width; cv.height = vp.height; cv.style.cssText = "width:100%;border-radius:10px;border:1px solid var(--bd)";
          cv.setAttribute("aria-label", "Página " + p + " de " + doc.numPages);
          await pg.render({canvasContext: cv.getContext("2d"), viewport: vp}).promise; alvo.appendChild(cv);
        }
        bt.remove();
      } catch (e) { bt.disabled = false; bt.textContent = "Ver o documento"; alert(e.message || "Não foi possível abrir o documento."); }
    };
  });
  box.querySelectorAll("[data-img]").forEach(async function (im) {
    var u = await sb.storage.from("msb-formacao").createSignedUrl(im.dataset.img, 900); if (!u.error && u.data) im.src = u.data.signedUrl;
  });
}

/* ---------- lista ---------- */
async function carregarFsc() {
  var box = $("#fscCorpo"); if (!box) return;
  fscParar();
  FSC.at = null; FSC.teste = null; FSC.res = null;
  box.innerHTML = "<section class='card'>A carregar…</section>";
  try { FSC.d = await fsRpc("msb_fs_meu"); } catch (e) { box.innerHTML = "<section class='card'>❌ " + esc(e.message) + "</section>"; return; }
  fscLista();
}
function fscLista() {
  var box = $("#fscCorpo"), D = FSC.d; if (!box) return;
  if (!D.colaborador) { box.innerHTML = "<section class='card'><h2 style='margin:0 0 6px'>🎓 Formação</h2><p class='mut' style='margin:0'>A sua conta não está ligada a um colaborador. Fale com a gerência.</p></section>"; return; }
  var H = D.horas || {}, feitas = Number(H.feitas) || 0, dev = Number(H.devidas) || 40, pct = Math.min(100, Math.round(feitas * 100 / dev));
  var C = (D.cursos || []), abertos = C.filter(function (c) { return c.estado !== "concluido"; });
  /* percursos juntos; cursos soltos à parte */
  var grupos = [], porPerc = {};
  abertos.forEach(function (c) { if (c.percurso) { if (!porPerc[c.percurso]) { porPerc[c.percurso] = {perc: c.percurso, itens: []}; grupos.push(porPerc[c.percurso]); } } else grupos.push({itens: [c]}); });
  C.forEach(function (c) { if (c.percurso && porPerc[c.percurso]) porPerc[c.percurso].itens.push(c); });
  var linha = function (c) {
    var pode = c.estado !== "aguarda", txt = c.estado === "por_comecar" ? "Começar" : c.estado === "teste" ? "Fazer o teste" : c.estado === "bloqueado" ? "Ver" : "Continuar";
    return "<div style='border:1px solid var(--bd);border-radius:14px;padding:12px;display:grid;gap:8px" + (c.estado === "aguarda" ? ";opacity:.65" : "") + "'>" +
      "<div style='display:flex;justify-content:space-between;gap:8px;align-items:flex-start'><b style='font-size:15px'>" + esc(c.titulo) + "</b>" + fsEstado(c.estado, c.fora_prazo) + "</div>" +
      "<div class='mut' style='font-size:13px'>" + esc(FS_REGRAS.horasTxt(c.horas)) + (c.prazo ? " · até " + esc(fsData(c.prazo)) : "") + (c.nota != null ? " · nota " + c.nota + " %" : "") + "</div>" +
      (c.estado === "concluido" ? "" : pode ? "<button class='btn p' data-abrir='" + c.id + "' style='min-height:48px'>" + txt + "</button>" : "<div class='mut' style='font-size:13px'>Abre quando terminar o módulo anterior.</div>") + "</div>";
  };
  var gruposHtml = grupos.map(function (g) {
    if (!g.perc) return linha(g.itens[0]);
    var feitos = g.itens.filter(function (c) { return c.estado === "concluido"; }).length;
    return "<div style='border:2px solid #1A63E8;border-radius:16px;padding:12px;display:grid;gap:10px'><div><b style='font-size:16px'>" + esc(g.perc) + "</b>" +
      "<div class='mut' style='font-size:13px'>Percurso de " + g.itens.length + " módulos · " + feitos + " de " + g.itens.length + " feitos</div>" +
      "<div style='height:8px;background:#E2E8F0;border-radius:4px;margin-top:6px'><div style='height:8px;width:" + Math.round(feitos * 100 / g.itens.length) + "%;background:#1A63E8;border-radius:4px'></div></div></div>" +
      g.itens.map(linha).join("") + "</div>";
  }).join("");
  var regs = (D.registos || []).filter(function (r) { return r.estado === "concluida" || r.estado === "por_validar"; });
  box.innerHTML =
    "<section class='card' style='display:grid;gap:10px;padding:18px'><h2 style='margin:0'>🎓 Formação</h2>" +
      "<div style='display:flex;justify-content:space-between;align-items:baseline'><span class='mut'>Horas de formação em " + esc(H.ano || "") + "</span><b style='font-size:18px'>" + esc(String(feitas).replace(".", ",")) + " de " + esc(String(dev).replace(".", ",")) + " h</b></div>" +
      "<div style='height:10px;background:#E2E8F0;border-radius:5px' role='progressbar' aria-valuenow='" + pct + "' aria-valuemin='0' aria-valuemax='100'><div style='height:10px;width:" + pct + "%;background:#0B6B3A;border-radius:5px'></div></div></section>" +
    "<section class='card' style='display:grid;gap:10px;padding:18px'><h2 style='margin:0'>Para fazer" + (abertos.length ? " · " + abertos.length : "") + "</h2>" +
      (gruposHtml || "<p class='mut' style='margin:0'>✔ Não tem formações por fazer.</p>") + "</section>" +
    "<section class='card' style='display:grid;gap:8px;padding:18px'><h2 style='margin:0'>As minhas formações</h2>" + (regs.length ? regs.map(function (r) {
      var cor = FS_REGRAS.estadoMatriz(r, null, colHoje(0));
      return "<div style='border-top:1px solid var(--bd);padding-top:8px;display:grid;gap:4px'><div style='display:flex;justify-content:space-between;gap:8px'><b>" + esc(r.titulo) + "</b>" +
        (r.estado === "por_validar" ? "<span class='mut' style='font-size:13px;white-space:nowrap'>⏳ Por validar</span>" : "<span style='white-space:nowrap'>" + FS_REGRAS.CORES_MATRIZ[cor] + "</span>") + "</div>" +
        "<div class='mut' style='font-size:13px'>" + esc(fsData(r.data)) + " · " + esc(FS_REGRAS.horasTxt(r.horas)) + (r.validade ? " · válida até " + esc(fsData(r.validade)) : "") + "</div>" +
        (r.modo === "app" && r.codigo ? "<button class='btn' data-cert='" + r.id + "' style='min-height:44px'>📄 Certificado</button>" : "") + "</div>"; }).join("")
      : "<p class='mut' style='margin:0'>Ainda não tem formações registadas.</p>") + "</section>";
  box.querySelectorAll("[data-abrir]").forEach(function (b) { b.onclick = function () { fscAbrir(+b.dataset.abrir); }; });
  box.querySelectorAll("[data-cert]").forEach(function (b) { b.onclick = function () { var r = D.registos.find(function (x) { return x.id === +b.dataset.cert; }); fsCertificado(r, D.nome); }; });
}

/* ---------- curso aberto ---------- */
async function fscAbrir(id) {
  var box = $("#fscCorpo"); box.innerHTML = "<section class='card'>A abrir…</section>";
  try { FSC.at = await fsRpc("msb_curso_abrir", {p_atrib: id}); } catch (e) { box.innerHTML = "<section class='card'>❌ " + esc(e.message) + "</section>"; return; }
  FSC.ping = Date.now(); FSC.teste = null; FSC.res = null;
  var L = FSC.at.licoes || [], i = L.findIndex(function (l) { return !l.concluida; });
  FSC.licao = i < 0 ? L.length : i;   // todas vistas: vai para o teste
  fscTempo(); fscDesenhar();
}
/* sinal de tempo, só com a página aberta e visível */
function fscTempo() {
  fscParar();
  FSC.timer = setInterval(async function () {
    if (!FSC.at || PAGINA !== "fsc" || document.visibilityState !== "visible" || FSC.res) return;
    var s = Math.round((Date.now() - FSC.ping) / 1000); FSC.ping = Date.now();
    try { var r = await fsRpc("msb_curso_progresso_marcar", {p_atrib: FSC.at.atribuicao, p_licao: null, p_concluida: false, p_segundos: s}); FSC.at.segundos = r.segundos; fscRelogio(); } catch (e) { /* tenta no próximo minuto */ }
  }, 60000);
}
function fscParar() { if (FSC.timer) clearInterval(FSC.timer); FSC.timer = null; }
function fscRelogio() {
  var e = $("#fscRel"); if (!e || !FSC.at) return;
  var min = Math.floor((FSC.at.segundos || 0) / 60), falta = Math.max(0, (FSC.at.tempo_minimo || 0) - (FSC.at.segundos || 0));
  e.textContent = "⏱ " + min + " min de formação" + (falta > 0 ? " · o teste abre daqui a " + Math.ceil(falta / 60) + " min" : " · teste disponível");
}
function fscCabecalho() {
  var A = FSC.at, L = A.licoes || [], feitas = L.filter(function (l) { return l.concluida; }).length;
  return "<section class='card' style='display:grid;gap:8px;padding:14px 18px'><button class='btn' id='fscVoltar' style='justify-self:start;min-height:40px'>← Voltar</button>" +
    "<h2 style='margin:0'>" + esc(A.titulo) + "</h2><div class='mut' style='font-size:13px'>" + esc(FS_REGRAS.horasTxt(A.horas)) + " · " + feitas + " de " + L.length + " lições · " +
    "nota mínima " + A.nota_minima + " % · tentativas " + A.tentativas_usadas + " de " + A.tentativas + "</div>" +
    "<div style='display:flex;gap:4px'>" + L.map(function (l, i) { return "<span style='flex:1;height:6px;border-radius:3px;background:" + (l.concluida ? "#0B6B3A" : i === FSC.licao ? "#1A63E8" : "#E2E8F0") + "'></span>"; }).join("") +
    "<span style='flex:1;height:6px;border-radius:3px;background:" + (FSC.licao >= L.length ? "#1A63E8" : "#E2E8F0") + "'></span></div>" +
    "<div id='fscRel' class='mut' style='font-size:13px'></div></section>";
}
function fscDesenhar() {
  var box = $("#fscCorpo"), A = FSC.at, L = A.licoes || [];
  if (FSC.res) { box.innerHTML = fscResultadoHtml(); fscLigarRes(); return; }
  if (FSC.teste) { box.innerHTML = fscCabecalho() + fscTesteHtml(); fscLigarTeste(); fscRelogio(); return; }
  if (FSC.licao < L.length) {
    var l = L[FSC.licao];
    box.innerHTML = fscCabecalho() + "<section class='card' style='display:grid;gap:12px;padding:18px'><div class='mut' style='font-size:13px'>Lição " + (FSC.licao + 1) + " de " + L.length + "</div>" +
      "<h2 style='margin:0'>" + esc(l.titulo) + "</h2>" + fsBlocosHtml(l.blocos) +
      "<div style='display:flex;gap:8px'>" + (FSC.licao > 0 ? "<button class='btn' id='fscAnt' style='flex:1;min-height:50px'>← Anterior</button>" : "") +
      "<button class='btn p' id='fscSeg' style='flex:2;min-height:50px'>" + (FSC.licao + 1 < L.length ? "Concluir e seguir →" : "Concluir e ir ao teste →") + "</button></div><div id='fscMsg' role='status'></div></section>";
    fsLigarBlocos(box);
  } else {
    var falta = Math.max(0, (A.tempo_minimo || 0) - (A.segundos || 0)), sem = A.tentativas_usadas >= A.tentativas;
    box.innerHTML = fscCabecalho() + "<section class='card' style='display:grid;gap:12px;padding:18px;text-align:center'><div style='font-size:40px' aria-hidden='true'>📝</div><h2 style='margin:0'>Teste final</h2>" +
      "<p style='margin:0'>" + A.n_perguntas + " perguntas · precisa de " + A.nota_minima + " % para passar" + (A.tempo_limite_min ? " · " + A.tempo_limite_min + " min" : "") + ".</p>" +
      (sem ? "<p style='margin:0;color:#B42318'>⛔ Sem tentativas. A gerência foi avisada e pode dar-lhe mais uma.</p>"
        : falta > 0 ? "<p style='margin:0;background:#FEF3C7;color:#92400E;border-radius:10px;padding:8px 10px'>O teste abre depois de " + Math.ceil(falta / 60) + " min de formação. Reveja as lições enquanto espera.</p>" : "") +
      "<button class='btn p' id='fscIniciar' style='min-height:54px'" + (sem || falta > 0 ? " disabled" : "") + ">Começar o teste</button>" +
      (L.length ? "<button class='btn' id='fscRever' style='min-height:46px'>Rever as lições</button>" : "") + "<div id='fscMsg' role='status'></div></section>";
  }
  fscRelogio();
  $("#fscVoltar").onclick = function () { fscParar(); carregarFsc(); };
  var ant = $("#fscAnt"); if (ant) ant.onclick = function () { FSC.licao--; fscDesenhar(); window.scrollTo(0, 0); };
  var rev = $("#fscRever"); if (rev) rev.onclick = function () { FSC.licao = 0; fscDesenhar(); window.scrollTo(0, 0); };
  var seg = $("#fscSeg"); if (seg) seg.onclick = async function () {
    seg.disabled = true;
    var s = Math.round((Date.now() - FSC.ping) / 1000); FSC.ping = Date.now();
    try { var r = await fsRpc("msb_curso_progresso_marcar", {p_atrib: A.atribuicao, p_licao: L[FSC.licao].id, p_concluida: true, p_segundos: s}); A.segundos = r.segundos; L[FSC.licao].concluida = true; FSC.licao++; fscDesenhar(); window.scrollTo(0, 0); }
    catch (e) { seg.disabled = false; fsMsg("#fscMsg", "❌ " + e.message, true); }
  };
  var ini = $("#fscIniciar"); if (ini) ini.onclick = async function () {
    ini.disabled = true; ini.textContent = "A preparar…";
    try { FSC.teste = await fsRpc("msb_curso_teste_iniciar", {p_atrib: A.atribuicao}); FSC.resp = {}; fscDesenhar(); window.scrollTo(0, 0); }
    catch (e) { ini.disabled = false; ini.textContent = "Começar o teste"; fsMsg("#fscMsg", "❌ " + e.message, true); }
  };
}

/* ---------- teste ---------- */
function fscTesteHtml() {
  var T = FSC.teste, P = T.perguntas || [];
  return P.map(function (q, n) {
    var esc1 = FSC.resp[q.id] || [], mult = q.tipo === "multipla";
    return "<section class='card' style='display:grid;gap:10px;padding:18px'><div class='mut' style='font-size:13px'>Pergunta " + (n + 1) + " de " + P.length + (mult ? " · escolha todas as certas" : "") + "</div>" +
      "<b style='font-size:17px;line-height:1.35'>" + esc(q.enunciado) + "</b>" +
      "<div role='" + (mult ? "group" : "radiogroup") + "' style='display:grid;gap:8px'>" + (q.opcoes || []).map(function (o, i) {
        var on = esc1.indexOf(i) >= 0;
        return "<button class='btn' role='" + (mult ? "checkbox" : "radio") + "' aria-checked='" + on + "' data-q='" + q.id + "' data-o='" + i + "' style='min-height:52px;text-align:left;justify-content:flex-start;display:flex;gap:10px;align-items:center;" +
          (on ? "border:2px solid #1A63E8;background:#EAF1FF" : "") + "'><span aria-hidden='true' style='font-size:18px'>" + (mult ? (on ? "☑" : "☐") : (on ? "◉" : "○")) + "</span><span>" + esc(o) + "</span></button>"; }).join("") + "</div></section>";
  }).join("") + "<section class='card' style='display:grid;gap:8px;padding:18px'><button class='btn p' id='fscEntregar' style='min-height:54px'>Entregar o teste</button><div id='fscMsg' role='status'></div></section>";
}
function fscLigarTeste() {
  var box = $("#fscCorpo");
  $("#fscVoltar").onclick = function () { if (confirm("Sair do teste? As respostas não ficam guardadas, mas o teste continua aberto com as mesmas perguntas.")) { fscParar(); carregarFsc(); } };
  box.querySelectorAll("[data-q]").forEach(function (b) { b.onclick = function () {
    var id = b.dataset.q, o = +b.dataset.o, q = FSC.teste.perguntas.find(function (x) { return String(x.id) === id; }), r = FSC.resp[id] || [];
    if (q.tipo === "multipla") r = r.indexOf(o) >= 0 ? r.filter(function (x) { return x !== o; }) : r.concat([o]); else r = [o];
    FSC.resp[id] = r;
    var y = window.scrollY; box.innerHTML = fscCabecalho() + fscTesteHtml(); fscLigarTeste(); fscRelogio(); window.scrollTo(0, y);
  }; });
  $("#fscEntregar").onclick = async function () {
    var P = FSC.teste.perguntas, falta = P.filter(function (q) { return !(FSC.resp[q.id] || []).length; }).length, bt = this;
    if (falta && !confirm("Faltam " + falta + " pergunta(s) por responder. Entregar mesmo assim?")) return;
    bt.disabled = true; bt.textContent = "A corrigir…";
    try { FSC.res = await fsRpc("msb_curso_teste_submeter", {p_tentativa: FSC.teste.tentativa, p_respostas: FSC.resp}); fscDesenhar(); window.scrollTo(0, 0); }
    catch (e) { bt.disabled = false; bt.textContent = "Entregar o teste"; fsMsg("#fscMsg", "❌ " + e.message, true); }
  };
}
function fscResultadoHtml() {
  var R = FSC.res, P = (FSC.teste && FSC.teste.perguntas) || [], err = R.erradas || [];
  var porId = {}; P.forEach(function (q) { porId[q.id] = q; });
  var cor = R.correcao ? {} : null; (R.correcao || []).forEach(function (c) { cor[c.id] = c; });
  return "<section class='card' style='display:grid;gap:10px;padding:22px;text-align:center'>" +
    "<div style='font-size:46px' aria-hidden='true'>" + (R.aprovado ? "🎉" : "📘") + "</div>" +
    "<h2 style='margin:0'>" + (R.aprovado ? "Passou!" : "Ainda não foi desta") + "</h2>" +
    "<div style='font-size:36px;font-weight:800;color:" + (R.aprovado ? "#0B6B3A" : "#B42318") + "'>" + R.nota + " %</div>" +
    "<div class='mut'>" + R.certas + " de " + R.total + " certas · mínimo " + R.nota_minima + " %</div>" +
    (R.aprovado ? (R.percurso_concluido ? "<p style='margin:0;color:#0B6B3A;font-weight:600'>✔ Concluiu o percurso completo.</p>" : "") +
        "<button class='btn p' id='fscCert' style='min-height:52px'>📄 Certificado</button>"
      : (R.tentativas_restantes > 0 ? "<p style='margin:0'>Tem mais " + R.tentativas_restantes + (R.tentativas_restantes === 1 ? " tentativa" : " tentativas") + ". Reveja as lições e tente de novo.</p>"
        : "<p style='margin:0;color:#B42318'>⛔ Sem tentativas. A gerência foi avisada.</p>")) +
    "<button class='btn' id='fscFim' style='min-height:48px'>Voltar à Formação</button></section>" +
    (err.length || R.aprovado ? "<section class='card' style='display:grid;gap:10px;padding:18px'><h2 style='margin:0'>" + (R.aprovado ? "Correção" : "A rever") + "</h2>" +
      P.map(function (q) {
        var mal = err.indexOf(q.id) >= 0; if (!R.aprovado && !mal) return "";
        return "<div style='border-top:1px solid var(--bd);padding-top:8px;display:grid;gap:4px'><div>" + (mal ? "❌ " : "✅ ") + esc(q.enunciado) + "</div>" +
          (cor && cor[q.id] ? "<div style='color:#0B6B3A'>Certa: " + esc((cor[q.id].certas_txt || []).join(" · ")) + "</div>" + (cor[q.id].explicacao ? "<div class='mut'>" + esc(cor[q.id].explicacao) + "</div>" : "") : "") + "</div>";
      }).join("") + "</section>" : "");
}
function fscLigarRes() {
  fscParar();
  $("#fscFim").onclick = function () { carregarFsc(); };
  var c = $("#fscCert"); if (c) c.onclick = async function () {
    c.disabled = true;
    try { var D = await fsRpc("msb_fs_meu"); FSC.d = D; var r = (D.registos || []).find(function (x) { return x.id === FSC.res.registo_id; }); if (r) await fsCertificado(r, D.nome); }
    catch (e) { alert(e.message); }
    c.disabled = false;
  };
}

/* ---------- certificado de frequência (PDF, pdf-lib) ---------- */
async function fsCertificado(r, nome) {
  await carregarPdfLib();
  var P = window.PDFLib, doc = await P.PDFDocument.create(), F = await doc.embedFont(P.StandardFonts.Helvetica), B = await doc.embedFont(P.StandardFonts.HelveticaBold);
  var W = 841.89, H = 595.28, pg = doc.addPage([W, H]), az = P.rgb(0.102, 0.388, 0.91), esc3 = P.rgb(0.043, 0.239, 0.569), cinz = P.rgb(0.39, 0.45, 0.55), preto = P.rgb(0.08, 0.13, 0.24);
  var safe = function (t) { return String(t == null ? "" : t).replace(/[^\x20-\x7E\xA0-\xFF–—‘’“”•…€]/g, "?"); };
  var centro = function (t, y, s, f, c) { t = safe(t); pg.drawText(t, {x: (W - (f || F).widthOfTextAtSize(t, s)) / 2, y: y, size: s, font: f || F, color: c || preto}); };
  pg.drawRectangle({x: 24, y: 24, width: W - 48, height: H - 48, borderColor: az, borderWidth: 2});
  pg.drawRectangle({x: 32, y: 32, width: W - 64, height: H - 64, borderColor: P.rgb(0.85, 0.89, 0.96), borderWidth: 0.8});
  centro("CERTIFICADO DE FREQUÊNCIA", H - 110, 26, B, esc3);
  centro("Certifica-se que", H - 165, 13, F, cinz);
  centro(nome || "—", H - 205, 28, B);
  centro("concluiu com aproveitamento a formação", H - 245, 13, F, cinz);
  var t = safe(r.titulo), s = 20; while (B.widthOfTextAtSize(t, s) > W - 140 && s > 12) s -= 1;
  centro(t, H - 285, s, B, az);
  centro("Duração: " + FS_REGRAS.horasTxt(r.horas) + "   ·   Concluída a " + fsData(r.data) + (r.nota != null ? "   ·   Classificação: " + r.nota + " %" : ""), H - 325, 12.5);
  if (r.validade) centro("Válida até " + fsData(r.validade), H - 347, 11, F, cinz);
  centro("Formação interna, ministrada na app mystationbox", H - 395, 11, F, cinz);
  centro(FS_EMPRESA[r.estacao] || "", H - 413, 11, B);
  pg.drawLine({start: {x: 60, y: 92}, end: {x: W - 60, y: 92}, thickness: 0.5, color: P.rgb(0.85, 0.88, 0.93)});
  pg.drawText(safe("Código de verificação: " + (r.codigo || "—") + "  ·  Registo n.º " + r.id), {x: 60, y: 72, size: 9, font: F, color: cinz});
  try { await marcaPdf(doc, pg, F, B, W - 160, 70, 8); } catch (e) { /* sem marca: segue */ }
  ptfDescarregar(new Blob([await doc.save()], {type: "application/pdf"}), "certificado-" + String(r.titulo).toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) + ".pdf");
}

window.carregarFsc = carregarFsc; window.fsBlocosHtml = fsBlocosHtml; window.fsLigarBlocos = fsLigarBlocos; window.fsCertificado = fsCertificado;
