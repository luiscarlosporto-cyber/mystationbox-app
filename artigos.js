/* mystationbox · Stock → Artigos (25/11/2026, pedido do dono: «artigos pesquisáveis com leitor de código de barras e código CBOS,
 * base de dados de todo o catálogo»). Para toda a equipa da estação, só consulta: nome, código CBOS, família e PVP.
 * Sem quantidades em stock até haver inventário fiável (decisão de 25/11/2026). A pesquisa é feita na base de dados
 * (msb_artigos_pesquisar): o telemóvel não descarrega o catálogo. Fonte: catálogo do CBOS carregado em Faturas da Adelaide.
 * Câmara: Android/Chrome usa o leitor do próprio navegador (BarcodeDetector); iPhone usa ZXing, carregado só ao tocar
 * na câmara (aprovado pelo dono, 25/11/2026). A imagem não sai do telemóvel. Um leitor USB escreve na caixa e dá Enter. */
"use strict";
var ART = {t: "", res: null, msg: "", pedido: 0, temp: null};
var ART_ZXING = "https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js", ART_ZX = null;

function carregarArtigos() {
  var box = $("#artCorpo"); if (!box) return;
  box.innerHTML = "<section class='card' style='padding:14px 16px'><h2 style='margin:0 0 10px'>🔎 Artigos</h2>" +
    "<div style='display:flex;gap:8px'><input id='artTxt' type='search' autocomplete='off' enterkeyhint='search' placeholder='Nome, código CBOS ou código de barras' aria-label='Pesquisar artigo' style='flex:1;min-width:0;font-size:17px;min-height:48px'>" +
    "<button id='artCam' class='btn p' style='min-width:56px;min-height:48px' aria-label='Ler código de barras com a câmara'>📷</button></div>" +
    "<div id='artCamBox'></div><div id='artRes' style='margin-top:12px'></div></section>";
  if (ADMIN) artCatalogoInfo();
  var i = $("#artTxt"); i.value = ART.t;
  i.oninput = function () { clearTimeout(ART.temp); var v = i.value; ART.temp = setTimeout(function () { artPesquisar(v); }, 300); };
  i.onkeydown = function (e) { if (e.key === "Enter") { e.preventDefault(); clearTimeout(ART.temp); artPesquisar(i.value); } };   // leitor USB: escreve e dá Enter
  $("#artCam").onclick = function () { CAM ? camParar() : artCamAbrir(); };
  artDesenhar();
  if (matchMedia("(pointer:fine)").matches) i.focus();
}

async function artPesquisar(t) {
  ART.t = t = String(t || "").trim(); var n = ++ART.pedido;
  if (t.length < 2) { ART.res = null; ART.msg = ""; return artDesenhar(); }
  ART.msg = "A procurar…"; artDesenhar();
  try {
    var r = await sb.rpc("msb_artigos_pesquisar", {p_estacao: EST, p_texto: t}); if (r.error) throw r.error;
    if (n !== ART.pedido) return;   // já se escreveu outra coisa
    ART.res = r.data || []; ART.msg = "";
  } catch (e) {
    if (n !== ART.pedido) return;
    var m = falhou(e); ART.res = null;
    ART.msg = /msb_artigos_pesquisar|does not exist|schema cache|42883|PGRST202/i.test(m + " " + (e && e.code || "")) ? "A pesquisa de artigos ainda não está ativa na base de dados." : m;
  }
  artDesenhar();
}

function artDesenhar() {
  var box = $("#artRes"); if (!box) return;
  ART.cnt = null;
  if (ART.msg) { box.innerHTML = "<div class='mut'>" + esc(ART.msg) + "</div>"; return; }
  if (!ART.res) { box.innerHTML = "<div class='mut'>Escreva parte do nome (ex.: «agua 1,5»), o código CBOS, ou leia o código de barras com o botão da câmara.</div>"; return; }
  if (!ART.res.length) { box.innerHTML = "<div>❌ Nenhum artigo encontrado para «" + esc(ART.t) + "».</div><div class='mut' style='margin-top:4px'>Se leu um código de barras, o artigo pode não ter esse código no CBOS. Procure pelo nome.</div>"; return; }
  var porBarras = ART.res[0].cod_barras;
  box.innerHTML = (porBarras ? "<div style='margin-bottom:8px'>✅ Encontrado pelo código de barras " + esc(ART.res[0].cod_barras) + "</div>" : "") +
    "<div style='display:grid;gap:8px'>" + ART.res.map(artCartao).join("") + "</div>" + (porBarras ? artContarHtml(ART.res[0]) : "") +
    (ART.res.length >= 40 ? "<div class='mut' style='margin-top:8px'>Mostram-se os primeiros 40. Escreva mais palavras para afinar.</div>" : "");
  artContarLigar();
}
/* Juntar à contagem do stock (26/11/2026): ex. código de 10 unidades × 5 = 50 unidades.
   Só para artigos do stock de tabaco; a contagem é a do separador Contar (mesma lista, mesma estação). */
function artProdTabaco(cod) {
  try { var L = JSON.parse(localStorage.getItem("stc_products") || "[]"); } catch (e) { return null; }
  return (L || []).find(function (p) { return p.barcode === cod || p.volume_barcode === cod; }) || null;
}
function artContarHtml(a) {
  var cod = a.cod_barras, p = artProdTabaco(cod); if (!p || p.maquina) return "";
  var vol = p.volume_barcode === cod, uni = vol ? (p.volume_size || a.quantidade || 10) : 1;
  ART.cnt = {cod: cod, uni: uni, nome: p.name, vol: vol};
  return "<div class='card' style='margin-top:10px;padding:12px 14px'><b>Contar este artigo</b>" +
    "<div style='display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap'>" +
    "<button class='btn' id='artQm' aria-label='Menos' style='min-width:48px'>−</button>" +
    "<input id='artQ' type='number' min='1' max='999' value='1' inputmode='numeric' aria-label='Quantidade' style='width:80px;text-align:center;font-size:20px;font-weight:700'>" +
    "<button class='btn' id='artQp' aria-label='Mais' style='min-width:48px'>+</button>" +
    "<span>" + (vol ? "volume(s) de " + uni : "maço(s) / unidade(s)") + "</span></div>" +
    "<div id='artQtot' class='mut' style='margin-top:6px'></div>" +
    "<button class='btn p' id='artJuntar' style='width:100%;margin-top:10px;min-height:48px'>＋ Juntar à contagem</button>" +
    "<div id='artQmsg' style='margin-top:6px'></div></div>";
}
function artContarLigar() {
  var q = $("#artQ"); if (!q || !ART.cnt) return;
  var n = function () { var v = Math.floor(Number(q.value)); return v >= 1 && v <= 999 ? v : 1; };
  var tot = function () { var c = ART.cnt; $("#artQtot").textContent = c.vol ? n() + " × " + c.uni + " = " + (n() * c.uni) + " unidades" : n() + (n() === 1 ? " unidade" : " unidades"); };
  q.oninput = tot; tot();
  $("#artQm").onclick = function () { q.value = Math.max(1, n() - 1); tot(); };
  $("#artQp").onclick = function () { q.value = Math.min(999, n() + 1); tot(); };
  $("#artJuntar").onclick = function () {
    var c = ART.cnt, k = n(), feito = false;
    /* módulo de stock já aberto nesta estação: junta lá (atualiza a lista que está à vista) */
    try {
      var f = $("#nexFrame"), w = f && NEX_EST === EST && f.contentWindow;
      if (w && typeof w.cntAdd === "function") { var qi = w.document.getElementById("cntQty"); if (qi) { qi.value = k; w.cntAdd(c.cod); feito = true; } }
    } catch (e) { feito = false; }
    if (!feito) {   // ainda não aberto: grava na mesma lista que o Contar lê ao abrir
      var key = EST === "sto" ? "stc_count" : "stc_count_" + EST;
      try { var o = JSON.parse(localStorage.getItem(key) || "{}") || {}; o[c.cod] = (o[c.cod] || 0) + k; localStorage.setItem(key, JSON.stringify(o)); feito = true; } catch (e) { feito = false; }
    }
    $("#artQmsg").innerHTML = feito ? "✅ Juntado à contagem: " + esc(c.nome) + " · " + k + (c.vol ? " vol. (" + k * c.uni + " un.)" : " un.") + " <a href='#' id='artVerCnt'>Ver a contagem</a>" : "❌ Não foi possível juntar. Use o separador Contar.";
    if (feito) { q.value = 1; tot(); var v = $("#artVerCnt"); if (v) v.onclick = function (e) { e.preventDefault(); ir("contar"); }; }
  };
}
function artCartao(a) {
  var fam = CATALOGO_CBOS.familia(a.poscode), vol = a.quantidade > 1 ? " <span class='b'>código de " + a.quantidade + " unidades</span>" : "";
  return "<div style='border:1px solid var(--bd);border-radius:14px;padding:12px 14px;background:var(--card)'>" +
    "<div style='font-weight:600;font-size:16px'>" + esc(a.nome) + vol + "</div>" +
    "<div style='display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:6px;font-size:14px'>" +
    "<span><span class='mut'>Código CBOS</span> <b>" + esc(a.poscode) + "</b></span>" +
    "<span><span class='mut'>Família</span> " + esc(fam) + "</span>" +
    "<span><span class='mut'>Preço</span> " + (a.pvp_c != null ? "<b>" + fmt(a.pvp_c) + " €</b>" : "<span class='mut'>sem preço nesta estação</span>") + "</span>" +
    "</div></div>";
}

/* catálogo do CBOS bem à vista para o administrador (dono, 26/11/2026): data, nº de artigos e códigos, e o botão para atualizar */
async function artCatalogoInfo() {
  var box = $("#artCorpo"); if (!box || !ADMIN) return;
  var est = EST, c = await sb.from("msb_catalogo_cbos").select("importado_em", {count: "exact"}).eq("estacao", est).neq("estado", "Fora do export").order("importado_em", {ascending: false}).limit(1);
  var b = await sb.from("msb_catalogo_barras").select("cod_barras", {count: "exact", head: true}).eq("estacao", est).eq("ativo", true);
  if (est !== EST || !$("#artCorpo")) return;
  var quando = c.data && c.data[0] ? new Date(c.data[0].importado_em) : null, dias = quando ? Math.floor((Date.now() - quando) / 864e5) : null;
  var el = document.createElement("section"); el.className = "card"; el.id = "artCatCard"; el.style.padding = "14px 16px";
  el.innerHTML = "<div style='display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between'><div><b>Catálogo do CBOS</b><div class='mut'>" +
    (quando ? (c.count || 0) + " artigos · " + (b.count || 0) + " códigos de barras · atualizado a " + quando.toLocaleDateString("pt-PT") + (dias > 30 ? " · <span class='bad'>⚠ há " + dias + " dias</span>" : "") : "Ainda não carregado") + "</div></div>" +
    "<button class='btn p' id='artCat' style='min-height:44px'>📒 Atualizar catálogo do CBOS</button><input type='file' id='artFCat' hidden></div>" +
    "<p class='mut' style='margin:6px 0 0;font-size:13px'>No CBOS: exportar o catálogo com todas as famílias (exportCatalog) e escolher aqui o ficheiro Excel.</p>";
  var old = $("#artCatCard"); if (old) old.remove();
  box.insertBefore(el, box.firstChild);
  $("#artCat").onclick = function () { $("#artFCat").click(); };
  $("#artFCat").onchange = function () { var f = this.files && this.files[0]; this.value = ""; if (f && window.importarCatalogo) importarCatalogo(f); };
}

/* ---------- câmara (também usada nas Faltas: camAbrir(caixa, botão, achou)) ---------- */
var CAM = null;
function artZXing() {
  if (window.ZXing) return Promise.resolve();
  if (ART_ZX) return ART_ZX;
  ART_ZX = new Promise(function (ok, ko) { var s = document.createElement("script"); s.src = ART_ZXING; s.onload = ok; s.onerror = function () { ART_ZX = null; ko(new Error("Não consegui carregar o leitor de códigos de barras. Verifique a internet.")); }; document.head.appendChild(s); });
  return ART_ZX;
}
function artCamAbrir() { camAbrir("#artCamBox", "#artCam", function (txt) { $("#artTxt").value = txt; artPesquisar(txt); }); }
function artCamParar() { camParar(); }
/* continuo: a câmara fica aberta e cada código novo chama achou() (o mesmo código só volta a contar passados 3 s).
 * iPhone (ZXing): pede vídeo em alta resolução, foco contínuo e TRY_HARDER, que ajudam com o brilho do plástico. */
async function camAbrir(caixa, botao, achou, continuo) {
  camParar();
  var cb = $(caixa); if (!cb) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { cb.innerHTML = "<div class='bad' style='margin-top:10px'>Este navegador não deixa usar a câmara. Escreva o código à mão.</div>"; return; }
  cb.innerHTML = "<div style='margin-top:10px;position:relative;border-radius:14px;overflow:hidden;background:#000'>" +
    "<video playsinline muted style='width:100%;max-height:50vh;display:block;object-fit:cover'></video>" +
    "<div style='position:absolute;left:10%;right:10%;top:45%;height:2px;background:#1A63E8;box-shadow:0 0 8px #1A63E8'></div></div>" +
    "<div class='mut' style='margin-top:6px'>Aponte para o código de barras a 10–15 cm. Se houver brilho no plástico, incline um pouco o telemóvel.</div>" +
    "<div id='camLuz'></div>";
  var b = $(botao); if (b) { b.dataset.ic = b.textContent; b.textContent = "✕"; b.setAttribute("aria-label", "Fechar a câmara"); }
  CAM = {caixa: caixa, botao: botao, vivo: true, parar: function () {}};
  var eu = CAM, vid = cb.querySelector("video"), ult = {c: "", t: 0}, fim = function (txt) {
    if (CAM !== eu) return;
    var c = String(txt).trim(), agora = Date.now();
    if (continuo && c === ult.c && agora - ult.t < 3000) return;
    ult = {c: c, t: agora};
    if (!continuo) camParar();
    if (navigator.vibrate) navigator.vibrate(60);
    achou(c);
  };
  var VIDEO = {facingMode: "environment", width: {ideal: 1920}, height: {ideal: 1080}, advanced: [{focusMode: "continuous"}]};
  try {
    var nativo = false;
    if ("BarcodeDetector" in window) { try { var fm = await BarcodeDetector.getSupportedFormats(); nativo = fm.indexOf("ean_13") >= 0; } catch (e) { nativo = false; } }
    if (nativo) {
      var st = await navigator.mediaDevices.getUserMedia({video: VIDEO, audio: false});
      if (CAM !== eu) { st.getTracks().forEach(function (t) { t.stop(); }); return; }
      var det = new BarcodeDetector({formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"]});
      eu.parar = function () { st.getTracks().forEach(function (t) { t.stop(); }); };
      vid.srcObject = st; await vid.play(); camLuz(st);
      var ciclo = async function () {
        if (CAM !== eu || !eu.vivo) return;
        try { var r = await det.detect(vid); if (r && r.length) { fim(r[0].rawValue); if (!continuo) return; return setTimeout(ciclo, 900); } } catch (e) { /* imagem ainda sem dados */ }
        setTimeout(ciclo, 200);
      };
      ciclo();
    } else {
      await artZXing();
      if (CAM !== eu) return;
      var Z = window.ZXing, h = new Map();
      h.set(Z.DecodeHintType.TRY_HARDER, true);
      h.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E, Z.BarcodeFormat.CODE_128, Z.BarcodeFormat.CODE_39, Z.BarcodeFormat.ITF]);
      var leitor = new Z.BrowserMultiFormatReader(h, 300);
      eu.parar = function () { try { leitor.reset(); } catch (e) { /* já parado */ } };
      var cb2 = function (r) { if (r) fim(r.getText()); };
      try { await leitor.decodeFromConstraints({video: VIDEO, audio: false}, vid, cb2); }
      catch (e2) { if (CAM !== eu || (e2 && e2.name === "NotAllowedError")) throw e2; leitor.decodeFromVideoDevice(undefined, vid, cb2); }
      if (CAM === eu && vid.srcObject) camLuz(vid.srcObject);
    }
  } catch (e) {
    if (CAM !== eu) return;
    camParar();
    var nome = e && e.name, m = nome === "NotAllowedError" ? "Sem autorização para a câmara. Autorize nas definições do navegador e tente outra vez." : nome === "NotFoundError" ? "Não encontrei câmara neste aparelho." : falhou(e);
    var cbx = $(caixa); if (cbx) cbx.innerHTML = "<div class='bad' style='margin-top:10px'>" + esc(m) + "</div>";
  }
}
/* Lanterna e zoom só onde o navegador deixa (Android). No iPhone o Safari não dá lanterna à página. */
function camLuz(st) {
  var t = st && st.getVideoTracks && st.getVideoTracks()[0], box = $("#camLuz"); if (!t || !box || !t.getCapabilities) return;
  var cap = {}; try { cap = t.getCapabilities() || {}; } catch (e) { return; }
  var h = "";
  if (cap.torch) h += "<button class='btn' id='camTorch' style='min-height:44px;margin-top:6px'>🔦 Lanterna</button> ";
  if (cap.zoom && cap.zoom.max > 1) h += "<button class='btn' id='camZoom' style='min-height:44px;margin-top:6px'>🔍 Aproximar</button>";
  box.innerHTML = h;
  var luz = false, zoom = false;
  if ($("#camTorch")) $("#camTorch").onclick = function () { luz = !luz; t.applyConstraints({advanced: [{torch: luz}]}).catch(function () {}); };
  if ($("#camZoom")) $("#camZoom").onclick = function () { zoom = !zoom; t.applyConstraints({advanced: [{zoom: zoom ? Math.min(2, cap.zoom.max) : (cap.zoom.min || 1)}]}).catch(function () {}); };
}
function camParar() {
  if (!CAM) return;
  var c = CAM; CAM = null; c.vivo = false;
  try { c.parar(); } catch (e) { /* já parado */ }
  var cb = $(c.caixa); if (cb) cb.innerHTML = "";
  var b = $(c.botao); if (b) { b.textContent = b.dataset.ic || "📷"; b.setAttribute("aria-label", "Ler código de barras com a câmara"); }
}
/* ao sair da página a câmara desliga-se */
document.addEventListener("visibilitychange", function () { if (document.hidden) camParar(); });
