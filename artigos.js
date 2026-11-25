/* mystationbox · Stock → Artigos (25/11/2026, pedido do dono: «artigos pesquisáveis com leitor de código de barras e código CBOS,
 * base de dados de todo o catálogo»). Para toda a equipa da estação, só consulta: nome, código CBOS, família e PVP.
 * Sem quantidades em stock até haver inventário fiável (decisão de 25/11/2026). A pesquisa é feita na base de dados
 * (msb_artigos_pesquisar): o telemóvel não descarrega o catálogo. Fonte: catálogo do CBOS carregado em Faturas da Adelaide.
 * Câmara: Android/Chrome usa o leitor do próprio navegador (BarcodeDetector); iPhone usa ZXing, carregado só ao tocar
 * na câmara (aprovado pelo dono, 25/11/2026). A imagem não sai do telemóvel. Um leitor USB escreve na caixa e dá Enter. */
"use strict";
var ART = {t: "", res: null, msg: "", pedido: 0, temp: null, cam: null};
var ART_ZXING = "https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js", ART_ZX = null;

function carregarArtigos() {
  var box = $("#artCorpo"); if (!box) return;
  box.innerHTML = "<section class='card'><h2 style='margin:0 0 10px'>🔎 Artigos</h2>" +
    "<div style='display:flex;gap:8px'><input id='artTxt' type='search' autocomplete='off' enterkeyhint='search' placeholder='Nome, código CBOS ou código de barras' aria-label='Pesquisar artigo' style='flex:1;min-width:0;font-size:17px;min-height:48px'>" +
    "<button id='artCam' class='btn p' style='min-width:56px;min-height:48px' aria-label='Ler código de barras com a câmara'>📷</button></div>" +
    "<div id='artCamBox'></div><div id='artRes' style='margin-top:12px'></div></section>";
  var i = $("#artTxt"); i.value = ART.t;
  i.oninput = function () { clearTimeout(ART.temp); var v = i.value; ART.temp = setTimeout(function () { artPesquisar(v); }, 300); };
  i.onkeydown = function (e) { if (e.key === "Enter") { e.preventDefault(); clearTimeout(ART.temp); artPesquisar(i.value); } };   // leitor USB: escreve e dá Enter
  $("#artCam").onclick = function () { ART.cam ? artCamParar() : artCamAbrir(); };
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
  if (ART.msg) { box.innerHTML = "<div class='mut'>" + esc(ART.msg) + "</div>"; return; }
  if (!ART.res) { box.innerHTML = "<div class='mut'>Escreva parte do nome (ex.: «agua 1,5»), o código CBOS ou leia o código de barras com 📷.</div>"; return; }
  if (!ART.res.length) { box.innerHTML = "<div>❌ Nenhum artigo encontrado para «" + esc(ART.t) + "».</div><div class='mut' style='margin-top:4px'>Se leu um código de barras, o artigo pode não ter esse código no CBOS. Procure pelo nome.</div>"; return; }
  var porBarras = ART.res[0].cod_barras;
  box.innerHTML = (porBarras ? "<div style='margin-bottom:8px'>✅ Encontrado pelo código de barras " + esc(ART.res[0].cod_barras) + "</div>" : "") +
    "<div style='display:grid;gap:8px'>" + ART.res.map(artCartao).join("") + "</div>" +
    (ART.res.length >= 40 ? "<div class='mut' style='margin-top:8px'>Mostram-se os primeiros 40. Escreva mais palavras para afinar.</div>" : "");
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

/* ---------- câmara ---------- */
function artZXing() {
  if (window.ZXing) return Promise.resolve();
  if (ART_ZX) return ART_ZX;
  ART_ZX = new Promise(function (ok, ko) { var s = document.createElement("script"); s.src = ART_ZXING; s.onload = ok; s.onerror = function () { ART_ZX = null; ko(new Error("Não consegui carregar o leitor de códigos de barras. Verifique a internet.")); }; document.head.appendChild(s); });
  return ART_ZX;
}
async function artCamAbrir() {
  var cb = $("#artCamBox"); if (!cb) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { cb.innerHTML = "<div class='bad' style='margin-top:10px'>Este navegador não deixa usar a câmara. Escreva o código à mão.</div>"; return; }
  cb.innerHTML = "<div style='margin-top:10px;position:relative;border-radius:14px;overflow:hidden;background:#000'>" +
    "<video id='artVid' playsinline muted style='width:100%;max-height:50vh;display:block;object-fit:cover'></video>" +
    "<div style='position:absolute;left:10%;right:10%;top:45%;height:2px;background:#1A63E8;box-shadow:0 0 8px #1A63E8'></div></div>" +
    "<div class='mut' id='artCamMsg' style='margin-top:6px'>Aponte para o código de barras…</div>";
  $("#artCam").textContent = "✕"; $("#artCam").setAttribute("aria-label", "Fechar a câmara");
  var vid = $("#artVid"), achou = function (txt) { artCamParar(); $("#artTxt").value = txt; artPesquisar(txt); if (navigator.vibrate) navigator.vibrate(60); };
  try {
    var nativo = false;
    if ("BarcodeDetector" in window) { try { var fm = await BarcodeDetector.getSupportedFormats(); nativo = fm.indexOf("ean_13") >= 0; } catch (e) { nativo = false; } }
    if (nativo) {
      var st = await navigator.mediaDevices.getUserMedia({video: {facingMode: "environment"}, audio: false});
      var det = new BarcodeDetector({formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"]});
      ART.cam = {parar: function () { st.getTracks().forEach(function (t) { t.stop(); }); }, vivo: true};
      vid.srcObject = st; await vid.play();
      var ciclo = async function () {
        if (!ART.cam || !ART.cam.vivo) return;
        try { var r = await det.detect(vid); if (r && r.length && ART.cam) return achou(r[0].rawValue); } catch (e) { /* imagem ainda sem dados */ }
        setTimeout(ciclo, 200);
      };
      ciclo();
    } else {
      await artZXing();
      var Z = window.ZXing, h = new Map();
      h.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E, Z.BarcodeFormat.CODE_128, Z.BarcodeFormat.CODE_39, Z.BarcodeFormat.ITF]);
      var leitor = new Z.BrowserMultiFormatReader(h, 300);
      ART.cam = {parar: function () { try { leitor.reset(); } catch (e) { /* já parado */ } }, vivo: true};
      leitor.decodeFromVideoDevice(undefined, vid, function (r) { if (r && ART.cam) achou(r.getText()); });
    }
  } catch (e) {
    artCamParar();
    var nome = e && e.name, m = nome === "NotAllowedError" ? "Sem autorização para a câmara. Autorize nas definições do navegador e tente outra vez." : nome === "NotFoundError" ? "Não encontrei câmara neste aparelho." : falhou(e);
    var cbx = $("#artCamBox"); if (cbx) cbx.innerHTML = "<div class='bad' style='margin-top:10px'>" + esc(m) + "</div>";
  }
}
function artCamParar() {
  if (ART.cam) { ART.cam.vivo = false; try { ART.cam.parar(); } catch (e) { /* já parado */ } ART.cam = null; }
  var cb = $("#artCamBox"); if (cb) cb.innerHTML = "";
  var b = $("#artCam"); if (b) { b.textContent = "📷"; b.setAttribute("aria-label", "Ler código de barras com a câmara"); }
}
/* ao sair da página a câmara desliga-se */
document.addEventListener("visibilitychange", function () { if (document.hidden) artCamParar(); });
