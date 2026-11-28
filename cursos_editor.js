/* mystationbox · Formação & Segurança — administração dos cursos (fase 2, 28/11/2026).
 * Página «fsa» (Equipa → Formação & Segurança): cursos e percursos, editor de lições e perguntas (sempre num rascunho:
 * um curso publicado só se muda abrindo uma versão nova), pré-visualização com as respostas certas, publicar,
 * atribuir à equipa e resultados (com desbloqueio de tentativas). Escrita só pelas funções msb_curso_* / msb_percurso_*. */
"use strict";
var FSA = {cursos: [], percursos: [], nLic: {}, nPerg: {}, vista: "lista", c: null, prev: null, equipa: null, pdfs: [], noArmazem: {}};

async function carregarFsa() {
  var box = $("#fsaCorpo"); if (!box) return;
  FSA.vista = "lista";
  box.innerHTML = "<section class='card'>A carregar…</section>";
  try {
    var q = await Promise.all([sb.from("msb_cursos").select("*").order("id"), sb.from("msb_percursos").select("*").order("id"),
      sb.from("msb_percurso_cursos").select("*").order("ordem"), sb.from("msb_curso_licoes").select("curso_id,versao,blocos"), sb.from("msb_curso_perguntas").select("curso_id,versao,ativa")]);
    q.forEach(function (r) { if (r.error) throw r.error; });
    FSA.cursos = q[0].data; FSA.percursos = q[1].data.map(function (p) { p.cursos = q[2].data.filter(function (x) { return x.percurso_id === p.id; }).map(function (x) { return x.curso_id; }); return p; });
    FSA.nLic = {}; FSA.nPerg = {};
    var vr = {}; FSA.cursos.forEach(function (c) { vr[c.id] = c.versao_rascunho; });
    var pdfs = {};
    q[3].data.forEach(function (l) {
      if (l.versao === vr[l.curso_id]) FSA.nLic[l.curso_id] = (FSA.nLic[l.curso_id] || 0) + 1;
      (l.blocos || []).forEach(function (b) { if (b.tipo === "pdf" && b.caminho) pdfs[b.caminho] = 1; });
    });
    FSA.pdfs = Object.keys(pdfs).sort();
    var ls = await sb.storage.from("msb-formacao").list("cursos", {limit: 1000});
    FSA.noArmazem = {}; ((ls && ls.data) || []).forEach(function (f) { FSA.noArmazem["cursos/" + f.name] = 1; });
    q[4].data.forEach(function (p) { if (p.versao === vr[p.curso_id] && p.ativa) FSA.nPerg[p.curso_id] = (FSA.nPerg[p.curso_id] || 0) + 1; });
  } catch (e) { box.innerHTML = "<section class='card'>❌ " + esc(e.message || falhou(e)) + "</section>"; return; }
  fsaLista();
}
function fsaCurso(id) { return FSA.cursos.find(function (c) { return c.id === id; }); }
function fsaEstadoCurso(c) {
  if (c.estado === "arquivado") return "<span class='b' style='background:#F1F5F9;color:#475569'>Arquivado</span>";
  if (!c.versao_publicada) return "<span class='b' style='background:#FEF3C7;color:#92400E'>Rascunho · por publicar</span>";
  return "<span class='b' style='background:#DCFCE7;color:#166534'>Publicado · v" + c.versao_publicada + "</span>" +
    (c.versao_rascunho > c.versao_publicada ? " <span class='b' style='background:#FEF3C7;color:#92400E'>Alterações por publicar</span>" : "");
}
function fsaCartao(c, ordem) {
  var porPub = c.versao_rascunho > c.versao_publicada;
  return "<div style='border:1px solid var(--bd);border-radius:14px;padding:12px;display:grid;gap:8px'>" +
    "<div style='display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:flex-start'><b style='font-size:15px'>" + (ordem ? ordem + ". " : "") + esc(c.titulo) + "</b><span>" + fsaEstadoCurso(c) + "</span></div>" +
    "<div class='mut' style='font-size:13px'>" + esc(FS_REGRAS.horasTxt(c.horas)) + (c.estacao ? " · só " + esc((window.AVARIAS && AVARIAS.ESTACAO_NOME[c.estacao]) || c.estacao) : "") + " · " + (FSA.nLic[c.id] || 0) + " lições · " + (FSA.nPerg[c.id] || 0) + " perguntas (o teste usa " + c.n_perguntas + ")" +
      (c.nota_minima ? " · mínimo " + c.nota_minima + " %" : "") + "</div>" +
    "<div style='display:flex;gap:6px;flex-wrap:wrap'>" +
      "<button class='btn' data-prev='" + c.id + "' style='min-height:42px'>👁 Ver como o colaborador</button>" +
      "<button class='btn' data-ed='" + c.id + "' style='min-height:42px'>✏️ Editar</button>" +
      (porPub ? "<button class='btn p' data-pub='" + c.id + "' style='min-height:42px'>🚀 Publicar</button>" : "") +
      (!ordem && c.versao_publicada ? "<button class='btn' data-atr='" + c.id + "' style='min-height:42px'>👥 Atribuir</button>" : "") +
      (c.versao_publicada ? "<button class='btn' data-res='" + c.id + "' style='min-height:42px'>📊 Resultados</button>" : "") + "</div></div>";
}
function fsaLista() {
  var box = $("#fsaCorpo"), noPerc = {};
  FSA.percursos.forEach(function (p) { p.cursos.forEach(function (id) { noPerc[id] = 1; }); });
  var soltos = FSA.cursos.filter(function (c) { return !noPerc[c.id]; });
  var porPublicar = FSA.cursos.filter(function (c) { return c.versao_rascunho > c.versao_publicada && c.estado !== "arquivado"; }).length;
  box.innerHTML = "<div id='fsaMsg' role='status'></div>" +
    "<section class='card' style='display:grid;gap:6px;padding:18px'><h2 style='margin:0'>🎓 Cursos na app</h2>" +
      "<p class='mut' style='margin:0'>Os colaboradores fazem a formação no telemóvel e um teste no fim. Só passam com a nota mínima; o certificado fica registado.</p>" +
      (porPublicar ? "<p style='margin:0;background:#FEF3C7;color:#92400E;border-radius:10px;padding:8px 10px'>⚠️ " + porPublicar + " curso(s) em rascunho. Veja cada um «como o colaborador» e publique quando estiver bem.</p>" : "") + "</section>" +
    fsaDocsHtml() +
    FSA.percursos.map(function (p) {
      var mods = p.cursos.map(fsaCurso).filter(Boolean), pub = mods.every(function (c) { return c.versao_publicada > 0; }), horas = mods.reduce(function (s, c) { return s + Number(c.horas); }, 0);
      return "<section class='card' style='display:grid;gap:10px;padding:18px;border:2px solid #1A63E8'><div><h2 style='margin:0'>" + esc(p.titulo) + "</h2>" +
        "<div class='mut' style='font-size:13px'>Percurso · " + mods.length + " módulos · " + esc(FS_REGRAS.horasTxt(horas)) + " · um módulo de " + (p.intervalo_dias || 14) + " em " + (p.intervalo_dias || 14) + " dias, por ordem</div></div>" +
        "<button class='btn p' data-atrp='" + p.id + "' style='min-height:46px'" + (pub ? "" : " disabled title='Publique primeiro todos os módulos'") + ">👥 Atribuir o percurso</button>" +
        (pub ? "" : "<div class='mut' style='font-size:13px'>Para atribuir, publique primeiro os " + mods.length + " módulos.</div>") +
        mods.map(function (c, i) { return fsaCartao(c, i + 1); }).join("") + "</section>";
    }).join("") +
    "<section class='card' style='display:grid;gap:10px;padding:18px'><h2 style='margin:0'>Cursos curtos</h2>" + (soltos.length ? soltos.map(function (c) { return fsaCartao(c); }).join("") : "<p class='mut' style='margin:0'>Nenhum.</p>") +
      "<button class='btn' id='fsaNovo' style='min-height:46px'>＋ Novo curso</button></section>";
  box.querySelectorAll("[data-prev]").forEach(function (b) { b.onclick = function () { fsaPrevia(+b.dataset.prev); }; });
  box.querySelectorAll("[data-ed]").forEach(function (b) { b.onclick = function () { fsaEditor(+b.dataset.ed); }; });
  box.querySelectorAll("[data-pub]").forEach(function (b) { b.onclick = function () { fsaPublicar(+b.dataset.pub, b); }; });
  box.querySelectorAll("[data-atr]").forEach(function (b) { b.onclick = function () { fsaAtribuir(+b.dataset.atr, null); }; });
  box.querySelectorAll("[data-atrp]").forEach(function (b) { b.onclick = function () { fsaAtribuir(null, +b.dataset.atrp); }; });
  box.querySelectorAll("[data-res]").forEach(function (b) { b.onclick = function () { fsaResultados(+b.dataset.res); }; });
  fsaDocsLigar();
  $("#fsaNovo").onclick = async function () {
    var t = prompt("Título do novo curso:"); if (!t || t.trim().length < 3) return;
    try { var c = await fsRpc("msb_curso_guardar", {p: {titulo: t.trim(), horas: 0.5, n_perguntas: 5}}); await carregarFsa(); fsaEditor(c.id); } catch (e) { alert(e.message); }
  };
}
/* documentos PDF das lições: lista dos que faltam no armazenamento e carregamento de vários de uma vez (pelo nome do ficheiro) */
function fsaDocsHtml() {
  if (!FSA.pdfs.length) return "";
  var falta = FSA.pdfs.filter(function (c) { return !FSA.noArmazem[c]; });
  return "<section class='card' style='display:grid;gap:10px;padding:18px'><h2 style='margin:0'>📄 Documentos dos cursos</h2>" +
    (falta.length ? "<p style='margin:0;background:#FEF3C7;color:#92400E;border-radius:10px;padding:8px 10px'>⚠️ Faltam " + falta.length + " de " + FSA.pdfs.length +
        " documentos. Sem eles, a lição «Diapositivos» não abre. Escolha os ficheiros (pode escolher todos de uma vez): cada um vai para o curso com o mesmo nome.</p>"
      : "<p class='mut' style='margin:0'>✔ Os " + FSA.pdfs.length + " documentos estão carregados. Para trocar um, carregue outro com o mesmo nome.</p>") +
    "<details" + (falta.length ? " open" : "") + "><summary class='mut' style='cursor:pointer'>Ver a lista</summary><div style='display:grid;gap:4px;margin-top:6px;font-size:14px'>" +
      FSA.pdfs.map(function (c) { return "<div>" + (FSA.noArmazem[c] ? "✅ " : "⬜ ") + esc(c.replace(/^cursos\//, "")) + "</div>"; }).join("") + "</div></details>" +
    "<label class='btn" + (falta.length ? " p" : "") + "' style='min-height:48px;display:flex;align-items:center;justify-content:center;cursor:pointer'>📎 Escolher ficheiros PDF" +
      "<input id='fsaDocs' type='file' accept='application/pdf,.pdf' multiple hidden></label><div id='fsaMsgD' role='status'></div></section>";
}
function fsaDocsLigar() {
  var inp = $("#fsaDocs"); if (!inp) return;
  inp.onchange = async function () {
    var fs = Array.prototype.slice.call(inp.files || []), ok = 0, fora = [], erros = [];
    for (var i = 0; i < fs.length; i++) {
      var f = fs[i], cam = "cursos/" + f.name;
      if (FSA.pdfs.indexOf(cam) < 0) { fora.push(f.name); continue; }
      fsMsg("#fsaMsgD", "A carregar " + (i + 1) + " de " + fs.length + "…");
      var r = await sb.storage.from("msb-formacao").upload(cam, f, {upsert: true, contentType: "application/pdf"});
      if (r.error) erros.push(f.name + ": " + r.error.message); else ok++;
    }
    await carregarFsa();
    fsMsg("#fsaMsg", (ok ? "✔ " + ok + " documento(s) carregado(s). " : "") + (fora.length ? "⚠️ Sem curso com este nome: " + fora.join(", ") + ". " : "") +
      (erros.length ? "❌ " + erros.join(" · ") : ""), !!erros.length);
  };
}
async function fsaPublicar(id, b) {
  var c = fsaCurso(id), refazer = false;
  if (c.versao_publicada > 0) refazer = confirm("Publicar a versão nova de «" + c.titulo + "».\n\nQuem já fez a versão anterior deve fazer outra vez? (OK = sim, Cancelar = não)");
  else if (!confirm("Publicar «" + c.titulo + "»? Depois de publicado, mudanças pedem uma versão nova.")) return;
  b.disabled = true;
  try { var r = await fsRpc("msb_curso_publicar", {p_curso: id, p_refazer: refazer}); await carregarFsa(); fsMsg("#fsaMsg", "✔ Publicado (versão " + r.versao + ")" + (r.reatribuidos ? " · reatribuído a " + r.reatribuidos : "") + "."); }
  catch (e) { b.disabled = false; fsMsg("#fsaMsg", "❌ " + e.message, true); }
}

/* ---------- pré-visualização (com as respostas certas) ---------- */
async function fsaPrevia(id) {
  var box = $("#fsaCorpo"); box.innerHTML = "<section class='card'>A carregar…</section>";
  try { FSA.prev = await fsRpc("msb_curso_previa", {p_curso: id}); } catch (e) { box.innerHTML = "<section class='card'>❌ " + esc(e.message) + "</section>"; return; }
  var P = FSA.prev;
  box.innerHTML = "<section class='card' style='display:grid;gap:8px;padding:14px 18px'><button class='btn' id='fsaVoltar' style='justify-self:start;min-height:40px'>← Cursos</button>" +
    "<h2 style='margin:0'>" + esc(P.titulo) + "</h2><div class='mut' style='font-size:13px'>Pré-visualização da versão " + P.versao + (P.versao > P.versao_publicada ? " (rascunho)" : "") +
    " · " + esc(FS_REGRAS.horasTxt(P.horas)) + " · o teste sorteia " + P.n_perguntas + " de " + P.perguntas.filter(function (q) { return q.ativa; }).length + " perguntas</div>" +
    "<button class='btn' id='fsaPrevEd' style='justify-self:start;min-height:42px'>✏️ Editar</button></section>" +
    P.licoes.map(function (l, i) { return "<section class='card' style='display:grid;gap:12px;padding:18px'><div class='mut' style='font-size:13px'>Lição " + (i + 1) + " de " + P.licoes.length + "</div><h2 style='margin:0'>" + esc(l.titulo) + "</h2>" + fsBlocosHtml(l.blocos) + "</section>"; }).join("") +
    "<section class='card' style='display:grid;gap:12px;padding:18px'><h2 style='margin:0'>📝 Perguntas do teste</h2><p class='mut' style='margin:0;font-size:13px'>O colaborador vê as opções baralhadas e só sabe as certas depois de passar.</p>" +
    P.perguntas.map(function (q, n) {
      return "<div style='border-top:1px solid var(--bd);padding-top:10px;display:grid;gap:6px" + (q.ativa ? "" : ";opacity:.5") + "'><b>" + (n + 1) + ". " + esc(q.enunciado) + (q.ativa ? "" : " <span class='mut'>(desligada)</span>") + "</b>" +
        q.opcoes.map(function (o, i) { var ok = q.certas.indexOf(i) >= 0; return "<div style='padding:6px 10px;border-radius:10px;" + (ok ? "background:#DCFCE7;color:#166534;font-weight:600" : "background:#F8FAFC") + "'>" + (ok ? "✔ " : "· ") + esc(o) + "</div>"; }).join("") + "</div>";
    }).join("") + "</section>";
  fsLigarBlocos(box);
  $("#fsaVoltar").onclick = carregarFsa; $("#fsaPrevEd").onclick = function () { fsaEditor(id); };
  window.scrollTo(0, 0);
}

/* ---------- editor (só no rascunho) ---------- */
async function fsaEditor(id) {
  var box = $("#fsaCorpo"), c = fsaCurso(id);
  if (c && c.versao_publicada > 0 && c.versao_rascunho <= c.versao_publicada) {
    if (!confirm("«" + c.titulo + "» está publicado. Para mudar, abre-se uma versão nova (rascunho); os colaboradores continuam com a atual até a publicar. Continuar?")) return;
    try { await fsRpc("msb_curso_nova_versao", {p_curso: id}); } catch (e) { alert(e.message); return; }
  }
  box.innerHTML = "<section class='card'>A carregar…</section>";
  try { FSA.c = await fsRpc("msb_curso_previa", {p_curso: id}); } catch (e) { box.innerHTML = "<section class='card'>❌ " + esc(e.message) + "</section>"; return; }
  fsaEditorDesenhar();
}
function fsaLinhas(blocos) { var t = (blocos || []).find(function (b) { return b.tipo === "texto"; }); return t ? (t.linhas || String(t.texto || "").split("\n")).join("\n") : ""; }
function fsaEditorDesenhar() {
  var box = $("#fsaCorpo"), C = FSA.c, inp = "width:100%;box-sizing:border-box;min-height:44px";
  box.innerHTML = "<section class='card' style='display:grid;gap:10px;padding:18px'><button class='btn' id='fsaVoltar' style='justify-self:start;min-height:40px'>← Cursos</button>" +
    "<h2 style='margin:0'>✏️ " + esc(C.titulo) + " <span class='mut' style='font-size:14px;font-weight:400'>· versão " + C.versao + " (rascunho)</span></h2>" +
    "<label>Título<input id='fsaTit' value='" + esc(C.titulo) + "' style='" + inp + "'></label>" +
    "<div style='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px'>" +
      "<label>Duração (horas)<input id='fsaHoras' type='number' step='0.05' min='0.05' max='40' value='" + C.horas + "' style='" + inp + "'></label>" +
      "<label>Perguntas no teste<input id='fsaN' type='number' min='1' max='100' value='" + C.n_perguntas + "' style='" + inp + "'></label>" +
      "<label>Nota mínima % <span class='mut'>(vazio = 80)</span><input id='fsaNota' type='number' min='1' max='100' value='" + (C.nota_minima || "") + "' style='" + inp + "'></label>" +
      "<label>Tentativas <span class='mut'>(vazio = 3)</span><input id='fsaTent' type='number' min='1' max='10' value='" + (C.tentativas || "") + "' style='" + inp + "'></label></div>" +
    "<button class='btn p' id='fsaGravarC' style='min-height:48px'>Guardar dados do curso</button><div id='fsaMsgC' role='status'></div></section>" +
    "<section class='card' style='display:grid;gap:12px;padding:18px'><h2 style='margin:0'>Lições · " + C.licoes.length + "</h2>" +
    C.licoes.map(function (l) {
      var pdfs = (l.blocos || []).filter(function (b) { return b.tipo === "pdf"; });
      return "<div data-lic='" + l.id + "' style='border:1px solid var(--bd);border-radius:14px;padding:12px;display:grid;gap:8px'>" +
        "<label>Título<input class='fsaLTit' value='" + esc(l.titulo) + "' style='" + inp + "'></label>" +
        "<label>Texto <span class='mut'>(um parágrafo por linha; «• » no início faz um ponto de lista)</span><textarea class='fsaLTxt' rows='7' style='width:100%;box-sizing:border-box'>" + esc(fsaLinhas(l.blocos)) + "</textarea></label>" +
        pdfs.map(function (b) { return "<label>Documento PDF (no armazenamento)<input class='fsaLPdf' value='" + esc(b.caminho) + "' style='" + inp + "'></label>"; }).join("") +
        "<div style='display:flex;gap:8px'><button class='btn p fsaLGrav' style='flex:2;min-height:44px'>Guardar lição</button><button class='btn fsaLApag' style='flex:1;min-height:44px;color:#B42318'>Apagar</button></div></div>";
    }).join("") + "<button class='btn' id='fsaNovaL' style='min-height:44px'>＋ Lição</button></section>" +
    "<section class='card' style='display:grid;gap:12px;padding:18px'><h2 style='margin:0'>Perguntas · " + C.perguntas.length + "</h2>" +
    C.perguntas.map(function (q, n) { return fsaPerguntaHtml(q, n); }).join("") + "<button class='btn' id='fsaNovaP' style='min-height:44px'>＋ Pergunta</button><div id='fsaMsgP' role='status'></div></section>";
  fsaEditorLigar();
}
function fsaPerguntaHtml(q, n) {
  var inp = "width:100%;box-sizing:border-box;min-height:44px", op = q.opcoes || ["", ""];
  return "<div data-perg='" + (q.id || "") + "' style='border:1px solid var(--bd);border-radius:14px;padding:12px;display:grid;gap:8px'>" +
    "<div style='display:flex;gap:8px;align-items:center'><b>" + (n + 1) + ".</b><select class='fsaPTipo' style='min-height:44px'>" +
      [["unica", "Escolha única"], ["multipla", "Escolha múltipla"], ["vf", "Verdadeiro / falso"]].map(function (t) { return "<option value='" + t[0] + "'" + (q.tipo === t[0] ? " selected" : "") + ">" + t[1] + "</option>"; }).join("") + "</select>" +
      "<label style='margin-left:auto;display:flex;gap:6px;align-items:center'><input type='checkbox' class='fsaPAtiva'" + (q.ativa === false ? "" : " checked") + "> ativa</label></div>" +
    "<label>Pergunta<textarea class='fsaPEnun' rows='2' style='width:100%;box-sizing:border-box'>" + esc(q.enunciado || "") + "</textarea></label>" +
    "<div class='mut' style='font-size:13px'>Opções (marque a certa):</div>" +
    op.map(function (o, i) { return "<div style='display:flex;gap:8px;align-items:center'><input type='checkbox' class='fsaPCerta' aria-label='Certa' " + ((q.certas || []).indexOf(i) >= 0 ? "checked" : "") + " style='width:24px;height:24px'><input class='fsaPOp' value='" + esc(o) + "' style='" + inp + "'></div>"; }).join("") +
    "<div style='display:flex;gap:8px'><button class='btn fsaPMais' style='flex:1;min-height:42px'>＋ Opção</button><button class='btn p fsaPGrav' style='flex:2;min-height:42px'>Guardar pergunta</button></div></div>";
}
function fsaEditorLigar() {
  var box = $("#fsaCorpo"), C = FSA.c;
  $("#fsaVoltar").onclick = carregarFsa;
  $("#fsaGravarC").onclick = async function () {
    try {
      await fsRpc("msb_curso_guardar", {p: {id: C.id, titulo: $("#fsaTit").value, horas: $("#fsaHoras").value, n_perguntas: $("#fsaN").value, nota_minima: $("#fsaNota").value, tentativas: $("#fsaTent").value}});
      C.titulo = $("#fsaTit").value; fsMsg("#fsaMsgC", "✔ Guardado.");
    } catch (e) { fsMsg("#fsaMsgC", "❌ " + e.message, true); }
  };
  box.querySelectorAll("[data-lic]").forEach(function (d) {
    var l = C.licoes.find(function (x) { return String(x.id) === d.dataset.lic; });
    d.querySelector(".fsaLGrav").onclick = async function () {
      var bl = [{tipo: "texto", linhas: d.querySelector(".fsaLTxt").value.split("\n").map(function (x) { return x.trimEnd(); }).filter(function (x) { return x.trim(); })}];
      d.querySelectorAll(".fsaLPdf").forEach(function (i) { if (i.value.trim()) bl.push({tipo: "pdf", caminho: i.value.trim(), titulo: "Documento original (SMA Repsol)"}); });
      (l.blocos || []).forEach(function (b) { if (b.tipo !== "texto" && b.tipo !== "pdf") bl.push(b); });
      if (!bl[0].linhas.length) bl.shift();
      try { await fsRpc("msb_curso_licao_guardar", {p: {id: l.id, curso_id: C.id, titulo: d.querySelector(".fsaLTit").value, blocos: bl}}); this.textContent = "✔ Guardada"; }
      catch (e) { alert(e.message); }
    };
    d.querySelector(".fsaLApag").onclick = async function () {
      if (!confirm("Apagar a lição «" + l.titulo + "» deste rascunho?")) return;
      try { await fsRpc("msb_curso_licao_apagar", {p_id: l.id}); fsaEditor(C.id); } catch (e) { alert(e.message); }
    };
  });
  $("#fsaNovaL").onclick = async function () {
    try { await fsRpc("msb_curso_licao_guardar", {p: {curso_id: C.id, titulo: "Nova lição", blocos: []}}); fsaEditor(C.id); } catch (e) { alert(e.message); }
  };
  box.querySelectorAll("[data-perg]").forEach(function (d, n) {
    d.querySelector(".fsaPMais").onclick = function () {
      var q = fsaLerPergunta(d); q.opcoes.push(""); if (!q.id) q.id = null;
      d.outerHTML = fsaPerguntaHtml(q, n); fsaEditorLigar();
    };
    d.querySelector(".fsaPTipo").onchange = function () {
      if (this.value !== "vf") return;
      var q = fsaLerPergunta(d); q.opcoes = ["Verdadeiro", "Falso"]; q.certas = q.certas.filter(function (i) { return i < 2; }).slice(0, 1);
      d.outerHTML = fsaPerguntaHtml(q, n); fsaEditorLigar();
    };
    d.querySelector(".fsaPGrav").onclick = async function () {
      var q = fsaLerPergunta(d), bt = this;
      var p = {curso_id: C.id, tipo: q.tipo, enunciado: q.enunciado, opcoes: q.opcoes.filter(function (o) { return o.trim(); }), certas: q.certas, ativa: q.ativa};
      if (q.id) p.id = q.id;
      try { var r = await fsRpc("msb_curso_pergunta_guardar", {p: p}); d.dataset.perg = r.id; bt.textContent = "✔ Guardada"; fsMsg("#fsaMsgP", ""); }
      catch (e) { fsMsg("#fsaMsgP", "❌ Pergunta " + (n + 1) + ": " + e.message, true); }
    };
  });
  $("#fsaNovaP").onclick = function () {
    C.perguntas.push({tipo: "unica", enunciado: "", opcoes: ["", "", "", ""], certas: []});
    var y = window.scrollY; fsaEditorDesenhar(); window.scrollTo(0, y + 200);
  };
}
function fsaLerPergunta(d) {
  var ops = [], certas = [];
  d.querySelectorAll(".fsaPOp").forEach(function (i, k) { ops.push(i.value); if (d.querySelectorAll(".fsaPCerta")[k].checked) certas.push(k); });
  return {id: d.dataset.perg ? +d.dataset.perg : null, tipo: d.querySelector(".fsaPTipo").value, enunciado: d.querySelector(".fsaPEnun").value.trim(), opcoes: ops, certas: certas, ativa: d.querySelector(".fsaPAtiva").checked};
}

/* ---------- atribuir ---------- */
async function fsaEquipa() {
  var l = await sb.from("msb_colab_lojas").select("colaborador_id,estacao,escala,ordem,ate").eq("estacao", EST);
  if (l.error) throw l.error;
  var hoje = colHoje(0), ids = l.data.filter(function (x) { return !x.ate || x.ate >= hoje; }).map(function (x) { return x.colaborador_id; });
  var c = ids.length ? await sb.from("msb_colaboradores").select("id,nome,curto,ativo").in("id", ids) : {data: []};
  if (c.error) throw c.error;
  return c.data.filter(function (x) { return x.ativo; }).map(function (x) { var y = l.data.find(function (z) { return z.colaborador_id === x.id; }); return {id: x.id, nome: x.nome || x.curto, escala: y.escala, ordem: y.ordem}; })
    .sort(function (a, b) { return a.ordem - b.ordem; });
}
async function fsaAtribuir(curso, perc) {
  var box = $("#fsaCorpo"), alvo = curso ? fsaCurso(curso) : FSA.percursos.find(function (p) { return p.id === perc; });
  box.innerHTML = "<section class='card'>A carregar…</section>";
  if (curso && alvo.estacao && alvo.estacao !== EST) {
    var so = (window.AVARIAS && AVARIAS.ESTACAO_NOME[alvo.estacao]) || alvo.estacao;
    box.innerHTML = "<section class='card' style='display:grid;gap:12px;padding:18px'><button class='btn' id='fsaVoltar' style='justify-self:start;min-height:40px'>← Cursos</button>" +
      "<p style='margin:0'>ℹ️ Este curso é só para " + esc(so) + ". Mude para essa estação para o atribuir.</p></section>";
    $("#fsaVoltar").onclick = carregarFsa;
    return;
  }
  try { FSA.equipa = await fsaEquipa(); } catch (e) { box.innerHTML = "<section class='card'>❌ " + esc(e.message || falhou(e)) + "</section>"; return; }
  var est = (window.AVARIAS && AVARIAS.ESTACAO_NOME[EST]) || EST, int = perc ? (alvo.intervalo_dias || 14) : 0, n = perc ? alvo.cursos.length : 1;
  box.innerHTML = "<section class='card' style='display:grid;gap:12px;padding:18px'><button class='btn' id='fsaVoltar' style='justify-self:start;min-height:40px'>← Cursos</button>" +
    "<h2 style='margin:0'>👥 Atribuir · " + esc(alvo.titulo) + "</h2><div class='mut'>" + esc(est) + "</div>" +
    "<div style='display:grid;gap:6px'>" + FSA.equipa.map(function (c) {
      return "<label style='display:flex;gap:10px;align-items:center;min-height:44px;border:1px solid var(--bd);border-radius:12px;padding:6px 12px'><input type='checkbox' data-col='" + c.id + "'" + (c.escala ? " checked" : "") + " style='width:22px;height:22px'>" + esc(c.nome) + "</label>"; }).join("") + "</div>" +
    (perc ? "<p style='margin:0;background:#EAF1FF;color:#1E3A8A;border-radius:10px;padding:8px 10px'>Os " + n + " módulos abrem por ordem. Prazos em escada: módulo 1 até " + esc(fsData(FS_REGRAS.prazosPercurso(colHoje(0), 1, int)[0])) +
        ", último até " + esc(fsData(FS_REGRAS.prazosPercurso(colHoje(0), n, int)[n - 1])) + ".</p>"
      : "<label>Prazo<input id='fsaPrazo' type='date' value='" + FS_REGRAS.prazosPercurso(colHoje(0), 1, 14)[0] + "' style='width:100%;box-sizing:border-box;min-height:44px'></label>") +
    "<button class='btn p' id='fsaAtrOk' style='min-height:50px'>Atribuir e avisar</button><div id='fsaMsgA' role='status'></div></section>";
  $("#fsaVoltar").onclick = carregarFsa;
  $("#fsaAtrOk").onclick = async function () {
    var ids = []; box.querySelectorAll("[data-col]").forEach(function (i) { if (i.checked) ids.push(+i.dataset.col); });
    if (!ids.length) { fsMsg("#fsaMsgA", "Escolha pelo menos um colaborador.", true); return; }
    this.disabled = true;
    try {
      var r = await fsRpc("msb_curso_atribuir", {p_curso: curso, p_percurso: perc, p_colabs: ids, p_prazo: curso ? $("#fsaPrazo").value : null});
      fsMsg("#fsaMsgA", "✔ Atribuído a " + r.atribuidos + (r.ja_tinham ? " · " + r.ja_tinham + " já tinham em curso" : "") + ". Os colaboradores foram avisados.");
    } catch (e) { this.disabled = false; fsMsg("#fsaMsgA", "❌ " + e.message, true); }
  };
}

/* ---------- resultados ---------- */
async function fsaResultados(id) {
  var box = $("#fsaCorpo"), c = fsaCurso(id), R;
  box.innerHTML = "<section class='card'>A carregar…</section>";
  try { R = await fsRpc("msb_curso_resultados", {p_curso: id}); } catch (e) { box.innerHTML = "<section class='card'>❌ " + esc(e.message) + "</section>"; return; }
  var A = R.atribuicoes.filter(function (a) { return a.estacao === EST; });
  box.innerHTML = "<section class='card' style='display:grid;gap:10px;padding:18px'><button class='btn' id='fsaVoltar' style='justify-self:start;min-height:40px'>← Cursos</button>" +
    "<h2 style='margin:0'>📊 " + esc(c.titulo) + "</h2>" + (A.length ? "<div style='overflow-x:auto'><table style='width:100%;border-collapse:collapse;font-size:14px'><thead><tr>" +
      ["Colaborador", "Estado", "Nota", "Tentativas", "Tempo", "Prazo", ""].map(function (h) { return "<th style='text-align:left;padding:6px'>" + h + "</th>"; }).join("") + "</tr></thead><tbody>" +
      A.map(function (a) { return "<tr style='border-top:1px solid var(--bd)'><td style='padding:6px'>" + esc(a.colaborador) + "</td><td style='padding:6px'>" + fsEstado(a.estado, a.estado !== "concluido" && a.estado !== "anulado" && a.estado !== "aguarda" && a.prazo && a.prazo < colHoje(0)) + "</td>" +
        "<td style='padding:6px'>" + (a.nota != null ? a.nota + " %" : "—") + "</td><td style='padding:6px'>" + a.tentativas + "</td><td style='padding:6px'>" + Math.round(a.segundos / 60) + " min</td>" +
        "<td style='padding:6px'>" + esc(fsData(a.prazo)) + "</td><td style='padding:6px'>" + (a.estado === "bloqueado" ? "<button class='btn p' data-desb='" + a.id + "' style='min-height:40px'>Dar mais 1 tentativa</button>" : "") + "</td></tr>"; }).join("") +
      "</tbody></table></div>" : "<p class='mut' style='margin:0'>Ainda não foi atribuído nesta estação.</p>") + "<div id='fsaMsgR' role='status'></div></section>" +
    (R.perguntas.length ? "<section class='card' style='display:grid;gap:8px;padding:18px'><h2 style='margin:0'>Perguntas que mais falham</h2>" + R.perguntas.slice(0, 8).map(function (q) {
      var p = Math.round(q.erradas * 100 / q.respondidas);
      return "<div style='display:grid;gap:4px'><div style='display:flex;justify-content:space-between;gap:8px'><span>" + esc(q.enunciado) + "</span><b>" + p + " %</b></div>" +
        "<div style='height:6px;background:#E2E8F0;border-radius:3px'><div style='height:6px;width:" + p + "%;background:" + (p > 40 ? "#B42318" : "#F59E0B") + ";border-radius:3px'></div></div></div>"; }).join("") + "</section>" : "");
  $("#fsaVoltar").onclick = carregarFsa;
  box.querySelectorAll("[data-desb]").forEach(function (b) { b.onclick = async function () {
    b.disabled = true; try { await fsRpc("msb_curso_desbloquear", {p_atrib: +b.dataset.desb}); fsaResultados(id); } catch (e) { b.disabled = false; fsMsg("#fsaMsgR", "❌ " + e.message, true); } }; });
  window.scrollTo(0, 0);
}
window.carregarFsa = carregarFsa;
