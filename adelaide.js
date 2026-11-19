/* mystationbox · Compras → Faturas da Adelaide (19/11/2026, pedido do dono: «faz sempre uma confirmação da encomenda Adelaide feita e da fatura enviada»).
 * Cada fatura (PDF) chega pelo email (o OCTAN AI guarda-a em msb_faturas_fornecedor, estado «por_ler») ou pelo 📥 Carregar.
 * A app lê-a (adelaide_ler.js), confere-a com a encomenda enviada (adelaide_conf.js) e mostra, por artigo, o preço no CBOS
 * (catálogo carregado do «exportCatalog»: sem preço, margem 0, PVP diferente). Só se lê a tabela orders; nada se corrige sozinho:
 * a ligação «código da Adelaide → código Repsol» só fica guardada quando o dono a confirma. */
"use strict";
var FAD = {faturas: [], sel: null, enc: [], lig: {}, cat: {}, catInfo: null};
function falhouFad(e) { var m = falhou(e); return /msb_faturas_fornecedor|msb_correspondencias|msb_catalogo_cbos|does not exist|schema cache|42P01|PGRST205/i.test(m + " " + (e && e.code || "")) ? "As faturas da Adelaide ainda não estão ativas na base de dados." : m; }
function fadEu() { return sb.auth.getUser().then(function (u) { return (u.data && u.data.user && u.data.user.email) || ""; }); }
function fadMsg(t, ok) { var s = $("#fadSt"); if (s) { s.className = "st " + (ok ? "ok" : "bad"); s.textContent = (ok ? "✔ " : "⚠ ") + t; } else status(ok, (ok ? "✔ " : "⚠ ") + t); }
var FAD_ESTADO = {por_ler: "⏳ Por ler", conferida: "✅ Conferida", com_diferencas: "⚠️ Com diferenças", por_confirmar: "ℹ️ Por confirmar", recusada: "❌ Não se leu"};

/* ---------- 📥 Carregar: PDF da Adelaide e exportCatalog do CBOS ---------- */
async function ehFaturaAdelaide(f) {
  try { var L = await linhasPdf(new Uint8Array(await f.arrayBuffer())); return ADELAIDE.ler(L) ? L : null; } catch (e) { return null; }
}
async function importarFaturaAdelaide(f) {
  ir("fad");
  try {
    var bytes = new Uint8Array(await f.arrayBuffer()), d = ADELAIDE.ler(await linhasPdf(bytes.slice()));
    if (!d) throw new Error(f.name + " não é uma fatura da Adelaide Sousa Ferreira.");
    var est = d.estacao; if (!est) throw new Error("A fatura " + (d.numero || "") + " não é para nenhuma das suas estações (NIF do cliente desconhecido).");
    if (est !== EST) throw new Error("A fatura " + d.numero + " é de " + nomeEstFad(est) + ", mas está a trabalhar em " + $("#hEst").textContent + ". Mude de estação no topo e carregue de novo.");
    var h = await sha(bytes), caminho = est + "/adelaide/" + h + ".pdf";
    var ja = await sb.from("msb_faturas_fornecedor").select("id").eq("estacao", est).eq("hash", h).maybeSingle(); if (ja.error) throw ja.error;
    if (ja.data) { FAD.sel = ja.data.id; fadMsg("Esta fatura já estava na app: " + d.numero + ".", true); return carregarFad(); }
    try { await guardarOriginal(caminho, new Blob([bytes], {type: "application/pdf"}), "application/pdf"); } catch (e) { if (!/exist|duplicate/i.test(falhou(e))) throw e; }
    var r = await sb.from("msb_faturas_fornecedor").insert({estacao: est, fornecedor: "adelaide", hash: h, original: caminho, ficheiro: f.name, recebida: hojeISO(0)}).select("id").single();
    if (r.error) throw r.error;
    FAD.sel = r.data.id; fadMsg("Fatura " + d.numero + " guardada. A conferir…", true);
    carregarFad();
  } catch (e) { fadMsg(falhouFad(e)); }
}
function nomeEstFad(id) { var e = ESTS.find(function (x) { return x.id === id; }); return e ? (e.short_name || e.name) : id; }

async function folhasXlsx(f, linhas) {
  await carregarXlsxMSB();
  var wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), linhas ? {type: "array", sheetRows: linhas} : {type: "array"}), o = {};
  wb.SheetNames.forEach(function (n) { o[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], {header: 1, defval: null}); });
  return o;
}
async function ehCatalogo(f) {
  try { var F = await folhasXlsx(f, 5); return !!(F["PRODUTOS"] && F["TARIFAS POR PRODUTO"]); } catch (e) { return false; }
}
/* O catálogo muda com frequência (dono, 19/11/2026): artigos novos, que saem, PVP que mudam. O que sai não se apaga: fica «Fora do export». */
async function importarCatalogo(f) {
  ir("fad");
  fadMsg("A ler o catálogo " + f.name + "…", true);
  try {
    var d = CATALOGO_CBOS.ler(await folhasXlsx(f));
    if (!d) throw new Error(f.name + ": não reconheço este Excel. Use o «Exportar catálogo» do CBOS, tal como vem (folhas PRODUTOS e TARIFAS POR PRODUTO).");
    if (d.erros.length) throw new Error("O catálogo tem erros e não foi gravado: " + d.erros.slice(0, 5).join("; ") + (d.erros.length > 5 ? "…" : ""));
    var eu = await fadEu(), quando = new Date().toISOString(), rel = [];
    var tarifas = Object.keys(CATALOGO_CBOS.TARIFA).map(function (t) { return CATALOGO_CBOS.TARIFA[t]; }), ests = ESTS.filter(function (e) { return tarifas.indexOf(e.id) >= 0; });   // as duas tarifas vêm no mesmo export
    for (var i = 0; i < ests.length; i++) {
      var est = ests[i].id;
      var a = await lerTudo(function () { return sb.from("msb_catalogo_cbos").select("poscode,nome,categoria,estado,pvp_c").eq("estacao", est).order("poscode"); }, ["poscode"]); if (a.error) throw a.error;
      var c = CATALOGO_CBOS.comparar(a.data || [], d, est);
      var L = c.linhas.map(function (l) { return Object.assign({}, l, {importado_em: quando, importado_por: eu}); });
      for (var k = 0; k < L.length; k += 400) { var g = await sb.from("msb_catalogo_cbos").upsert(L.slice(k, k + 400), {onConflict: "estacao,poscode"}); if (g.error) throw g.error; }
      rel.push({est: est, m: c.mudou, primeiro: !(a.data || []).length});
    }
    FAD.relCat = rel;
    try { FAD.relCods = await fadVerificarCodigos(); } catch (e) { FAD.relCods = {erro: falhou(e)}; }
    fadMsg("Catálogo do CBOS atualizado (" + d.artigos.length + " artigos).", true);
    carregarFad();
  } catch (e) { fadMsg(falhouFad(e)); }
}

/* Depois de cada catálogo novo (dono, 19/11/2026): os códigos novos dos fornecedores por confirmar (Painel → OCTAN AI)
   verificam-se contra o CBOS de cada estação: já existe, PVP diferente do da fatura, sem preço ou não existe. */
async function fadVerificarCodigos() {
  var r = await sb.from("msb_codigos_novos").select("*").eq("estado", "por").order("criado"); if (r.error) throw r.error;
  var L = r.data || []; if (!L.length) return {linhas: []};
  var P = await codProdutos(), CAT = await codCatalogo();
  return {linhas: L.map(function (c) { return Object.assign({c: c}, CAT[c.estacao] ? codNoCatalogo(c, codJuntar(P, CAT[c.estacao])) : {estado: "sem_catalogo"}); })};
}
function fadCodigos(v) {
  if (!v) return "";
  if (v.erro) return "<p>⚠️ Não consegui verificar os códigos novos: " + esc(v.erro) + "</p>";
  if (!v.linhas.length) return "<p>✅ Não há códigos novos de fornecedores por confirmar.</p>";
  var EST = {existe: "✅ já existe no CBOS", pvp_diferente: "⚠️ PVP no CBOS diferente do da fatura", sem_preco: "❌ sem preço no CBOS", nao_existe: "❌ não está no catálogo do CBOS carregado", sem_catalogo: "ℹ️ sem catálogo desta estação"};
  var ordem = {nao_existe: 0, sem_preco: 1, pvp_diferente: 2, existe: 3, sem_catalogo: 4};
  var L = v.linhas.slice().sort(function (a, b) { return ordem[a.estado] - ordem[b.estado]; });
  return "<h3 style='margin:12px 0 4px'>🏷️ Códigos novos por confirmar (" + L.length + ")</h3><div class='sc'><table><thead><tr><th class='l'>Estação</th><th class='l'>Na fatura</th><th>PVP fatura</th><th class='l'>No CBOS</th><th class='l'>Verificação</th></tr></thead><tbody>" +
    L.map(function (x) { var c = x.c;
      return "<tr><td class='l'>" + esc(nomeEstFad(c.estacao)) + "</td><td class='l'>" + esc(c.codigo + " · " + (c.descricao || "")) + "</td><td class='n'>" + (c.pvp_fatura_c > 0 ? fmt(c.pvp_fatura_c) : "—") + "</td><td class='l'>" +
        (x.artigo ? esc(x.artigo.repsol_code + " · " + x.artigo.name) + (x.pvp_c ? " · " + fmt(x.pvp_c) + " €" : "") : "—") + "</td><td class='l'>" + EST[x.estado] + "</td></tr>"; }).join("") +
    "</tbody></table></div><p class='mut' style='margin:4px 0'>Confirme cada código em 🏠 Painel → OCTAN AI. Os que não estão no catálogo: crie-os no CBOS e carregue um catálogo novo. Atenção: o catálogo só traz as famílias que exportou no CBOS (este traz só tabaco); um artigo de outra família (ex.: bolachas) aparece sempre como «não está no catálogo».</p>";
}

/* ---------- ler e conferir ---------- */
async function lerFaturaFad(fat) {
  var f = await sb.storage.from("msb-originais").download(fat.original); if (f.error) throw f.error;
  var d = ADELAIDE.ler(await linhasPdf(new Uint8Array(await f.data.arrayBuffer())));
  if (!d) return {estado: "recusada", erro: "Não é uma fatura da Adelaide que eu saiba ler."};
  var erros = ADELAIDE.verificar(d);
  if (d.estacao && d.estacao !== fat.estacao) erros.push("A fatura é de " + nomeEstFad(d.estacao) + ".");
  if (erros.length) return {estado: "recusada", erro: erros.join(" "), dados: d, numero: d.numero, data: d.data, total_c: d.total_c};
  return {dados: d, numero: d.numero, data: d.data, total_c: d.total_c};
}
/* a encomenda da fatura: a última enviada antes da data da fatura que tenha tabaco da Adelaide */
function encomendaDe(fat) {
  var dia = (fat.dados && fat.dados.data) || fat.recebida;
  return FAD.enc.find(function (o) { return o.sent_at && o.sent_at.slice(0, 10) <= dia && ADELAIDE_CONF.daAdelaide(o.lines).length; }) || null;
}
function conferirFad(fat) {
  var o = FAD.enc.find(function (x) { return x.id === fat.encomenda; }) || encomendaDe(fat);
  if (!o) return null;
  var c = ADELAIDE_CONF.conferir(fat.dados, o.lines || [], FAD.lig), s = c.resumo;
  c.encomenda = o; c.estado = s.confirmar ? "por_confirmar" : (s.diferentes || s.a_mais || s.em_falta) ? "com_diferencas" : "conferida";
  return c;
}
function resumoGuardar(c) {
  return {resumo: c.resumo, linhas: c.linhas.map(function (l) { return {codigo: l.fat.codigo, qtd: l.fat.qtd, estado: l.estado, repsol: l.enc ? l.enc.repsol_code : l.ligado || null, encomenda_qtd: l.enc ? Number(l.enc.qty) : null}; }),
    em_falta: c.em_falta.map(function (e) { return {repsol: e.repsol_code, nome: e.name, qtd: Number(e.qty)}; })};
}
async function gravarConferencia(fat, c, eu) {
  var u = {estado: c.estado, encomenda: c.encomenda.id, conferencia: resumoGuardar(c), lida_em: new Date().toISOString(), lida_por: eu};
  if (fat.estado === u.estado && fat.encomenda === u.encomenda && JSON.stringify(fat.conferencia) === JSON.stringify(u.conferencia)) return;
  var r = await sb.from("msb_faturas_fornecedor").update(u).eq("id", fat.id); if (r.error) throw r.error;
  Object.assign(fat, u);
}

async function carregarFad() {
  var box = $("#fadCorpo"); if (!box.innerHTML) box.innerHTML = "<div class='mut'>A carregar…</div>";
  try {
    var q = await Promise.all([
      sb.from("msb_faturas_fornecedor").select("*").eq("estacao", EST).eq("fornecedor", "adelaide").order("criado", {ascending: false}).limit(30),
      sb.from("msb_correspondencias").select("codigo,repsol_code").eq("estacao", EST).eq("fornecedor", "adelaide"),
      sb.from("orders").select("id,sent_at,status,lines").eq("company_id", EST).not("sent_at", "is", null).order("sent_at", {ascending: false}).limit(12),
      lerTudo(function () { return sb.from("msb_catalogo_cbos").select("poscode,nome,categoria,estado,pvp_c,importado_em").eq("estacao", EST).order("poscode"); }, ["poscode"])
    ]);
    q.forEach(function (r) { if (r.error) throw r.error; });
    FAD.faturas = q[0].data || []; FAD.lig = {}; (q[1].data || []).forEach(function (x) { FAD.lig[x.codigo] = x.repsol_code; });
    FAD.enc = q[2].data || []; FAD.cat = {}; FAD.catInfo = null;
    (q[3].data || []).forEach(function (x) { FAD.cat[x.poscode] = x; if (!FAD.catInfo || x.importado_em > FAD.catInfo) FAD.catInfo = x.importado_em; });
    desenharFad();
    /* faturas por ler: lê-se e confere-se já */
    var eu = await fadEu(), mudou = false;
    for (var i = 0; i < FAD.faturas.length; i++) {
      var fat = FAD.faturas[i];
      if (fat.estado === "por_ler") {
        var l = await lerFaturaFad(fat), u = Object.assign({lida_em: new Date().toISOString(), lida_por: eu}, l);
        var r = await sb.from("msb_faturas_fornecedor").update(u).eq("id", fat.id); if (r.error) throw r.error;
        Object.assign(fat, u); mudou = true;
      }
      if (fat.estado !== "recusada" && fat.dados) { var c = conferirFad(fat); if (c) { var antes = fat.estado; await gravarConferencia(fat, c, eu); mudou = mudou || antes !== fat.estado; } }
    }
    if (mudou) desenharFad();
  } catch (e) { box.innerHTML = "<div class='bad'>" + esc(falhouFad(e)) + "</div>"; }
}

/* ---------- ecrã ---------- */
function fadPreco(l) {
  var p = ADELAIDE_CONF.precoCBOS(l, FAD.cat), eur = function (c) { return fmt(c) + " €"; };
  if (!FAD.catInfo) return "<span class='mut'>—</span>";
  switch (p.estado) {
    case "sem_artigo": return "<span class='mut'>—</span>";
    case "fora_catalogo": return "❌ <b>não existe no CBOS</b>";
    case "sem_preco": return "❌ <b>sem preço no CBOS</b>";
    case "sem_volume": return "ℹ️ " + eur(p.pvp_c) + " <span class='mut'>(maços por volume desconhecidos)</span>";
  }
  var t = eur(p.pvp_c) + " <span class='mut'>· custo " + eur(p.custo_c) + " · margem " + String(p.margem).replace(".", ",") + " %</span>";
  if (p.estado === "margem_zero") t = "❌ <b>margem " + String(p.margem).replace(".", ",") + " %</b> · PVP " + eur(p.pvp_c) + " · custo " + eur(p.custo_c);
  else if (p.estado === "pvp_diferente") t = "⚠️ PVP no CBOS " + eur(p.pvp_c) + " ≠ fatura " + eur(p.pvp_fatura_c) + " <span class='mut'>· margem " + String(p.margem).replace(".", ",") + " %</span>";
  else t = "✅ " + t;
  return t + (p.inativo ? " <span class='t-at' style='padding:1px 6px;border-radius:6px;font-size:12px'>" + esc(p.inativo) + "</span>" : "");
}
function fadLinha(l, i) {
  var f = l.fat, est = {igual: "✅ igual", diferente: "⚠️ quantidade diferente", confirmar: "ℹ️ por confirmar", a_mais: "❌ não estava na encomenda"}[l.estado];
  var enc = l.enc ? esc(l.enc.name) + " <span class='mut'>(" + esc(l.enc.repsol_code) + ")</span> · " + l.enc.qty + " " + esc(l.enc.unit || "vol.")
    : l.proposta ? "<span class='mut'>Proposta:</span> " + esc(l.proposta.name) + " <span class='mut'>(" + esc(l.proposta.repsol_code) + ")</span> · " + l.proposta.qty + " " + esc(l.proposta.unit || "vol.") +
      " <button class='btn mini p' data-lig='" + i + "'>✔ É este</button>"
    : l.estado === "a_mais" ? "<span class='mut'>ligado a " + esc(l.ligado) + "</span>" : "<span class='mut'>sem proposta</span>";
  if (l.estado === "confirmar") enc += " <button class='btn mini' data-esc='" + i + "'>Escolher…</button>";
  return "<tr><td class='l'>" + esc(f.codigo) + " · " + esc(f.nome) + "</td><td class='n'>" + f.qtd + "</td><td class='n'>" + fmt(f.total_c) + "</td><td class='l'>" + enc + "</td><td class='l'>" + est + "</td><td class='l'>" + fadPreco(l) + "</td></tr>";
}
function fadDetalhe(fat) {
  if (fat.estado === "recusada") return "<div class='card' style='padding:14px'><b>❌ Não consegui ler esta fatura</b><p>" + esc(fat.erro || "") + "</p><p class='mut'>Nada foi conferido. Abra o PDF e confira à mão, ou envie-me o PDF.</p></div>";
  if (!fat.dados) return "<div class='card mut' style='padding:14px'>⏳ A ler a fatura…</div>";
  var d = fat.dados, c = conferirFad(fat);
  var h = "<div class='card' style='padding:14px'><h2>🧾 " + esc(d.numero) + " · " + dmy(d.data) + "</h2>" +
    "<p style='margin:4px 0'>Total a pagar: <b>" + fmt(d.total_c) + " €</b> <span class='mut'>(já com o desconto comercial de " + fmt(d.desconto_c) + " €; valor bruto " + fmt(d.bruto_c) + " €) · vence a " + dmy(d.vencimento) + " · " + d.volumes + " volumes</span></p>";
  if (!c) return h + "<p>⚠️ Não encontrei a encomenda desta fatura (nenhuma encomenda de tabaco enviada antes de " + dmy(d.data) + ").</p>" + fadEscolherEnc(fat) + "</div>";
  var s = c.resumo;
  h += "<p style='margin:4px 0'>Encomenda enviada a " + dmy(c.encomenda.sent_at.slice(0, 10)) + " " + fadEscolherEnc(fat, c.encomenda.id) + "</p>";
  h += "<div class='bar' style='margin:8px 0'><span>✅ " + s.iguais + " iguais</span><span>⚠️ " + s.diferentes + " quantidade diferente</span><span>ℹ️ " + s.confirmar + " por confirmar</span><span>❌ " + s.a_mais + " a mais</span><span>❌ " + s.em_falta + " em falta</span>" +
    "<span class='mut'>Volumes: fatura " + s.volumes_fatura + " · encomenda " + s.volumes_encomenda + "</span></div>";
  if (!FAD.catInfo) h += "<div class='aviso'>ℹ️ Para ver o preço no CBOS e a margem, carregue o catálogo (botão acima).</div>";
  var ordem = {a_mais: 0, diferente: 1, confirmar: 2, igual: 3}, L = c.linhas.map(function (l, i) { return [l, i]; }).sort(function (a, b) { return ordem[a[0].estado] - ordem[b[0].estado]; });
  FAD.conf = c;
  h += "<div class='sc'><table><thead><tr><th class='l'>Fatura (código · artigo)</th><th>Vol.</th><th>Total €</th><th class='l'>Encomenda</th><th class='l'>Conferência</th><th class='l'>No CBOS (PVP do maço)</th></tr></thead><tbody>" +
    L.map(function (x) { return fadLinha(x[0], x[1]); }).join("") + "</tbody></table></div>";
  if (c.em_falta.length) h += "<h3 style='margin-top:12px'>❌ Encomendados e não faturados</h3><ul>" + c.em_falta.map(function (e) { return "<li>" + esc(e.name) + " <span class='mut'>(" + esc(e.repsol_code) + ")</span> · " + e.qty + " " + esc(e.unit || "vol.") + "</li>"; }).join("") + "</ul>";
  return h + "<div id='fadPainel'></div></div>";
}
function fadEscolherEnc(fat, atual) {
  return "<select id='fadEnc'><option value=''>" + (atual ? "Outra encomenda…" : "Escolher a encomenda…") + "</option>" + FAD.enc.filter(function (o) { return ADELAIDE_CONF.daAdelaide(o.lines).length; }).map(function (o) {
    return "<option value='" + o.id + "'" + (o.id === atual ? " selected" : "") + ">" + dmy(o.sent_at.slice(0, 10)) + " · " + ADELAIDE_CONF.daAdelaide(o.lines).length + " artigos</option>"; }).join("") + "</select>";
}
function fadCatalogo() {
  var h = "<div class='card' style='padding:14px'><h2>📒 Catálogo do CBOS</h2>";
  if (FAD.relCat) h += FAD.relCat.map(function (r) { var m = r.m;
    if (r.primeiro) return "<p>✔ " + esc(nomeEstFad(r.est)) + ": primeiro carregamento, " + m.novos.length + " artigos.</p>";
    var lista = function (t, xs, f) { return xs.length ? "<details><summary>" + t + " (" + xs.length + ")</summary><ul>" + xs.map(f).join("") + "</ul></details>" : ""; };
    return "<p style='margin:6px 0 2px'><b>" + esc(nomeEstFad(r.est)) + "</b>: " + m.novos.length + " novos · " + m.sairam.length + " saíram · " + m.pvp.length + " PVP mudaram" + (m.descatalogados.length ? " · " + m.descatalogados.length + " descatalogados" : "") + "</p>" +
      lista("🆕 Novos", m.novos, function (x) { return "<li>" + esc(x.nome) + " <span class='mut'>(" + x.poscode + ")</span> · " + (x.pvp_c ? fmt(x.pvp_c) + " €" : "❌ sem preço") + "</li>"; }) +
      lista("📤 Saíram do export (ficam guardados como «Fora do export»)", m.sairam, function (x) { return "<li>" + esc(x.nome) + " <span class='mut'>(" + x.poscode + ")</span></li>"; }) +
      lista("💶 PVP mudou", m.pvp, function (x) { return "<li>" + esc(x.nome) + ": " + (x.antes_c == null ? "sem preço" : fmt(x.antes_c) + " €") + " → " + (x.depois_c == null ? "❌ sem preço" : fmt(x.depois_c) + " €") + "</li>"; }) +
      lista("🚫 Passaram a descatalogados", m.descatalogados, function (x) { return "<li>" + esc(x.nome) + " <span class='mut'>(" + x.poscode + ")</span></li>"; });
  }).join("");
  h += fadCodigos(FAD.relCods);
  var cods = Object.keys(FAD.cat);
  if (!cods.length) return h + "<p>Ainda não há catálogo. No CBOS: Catálogo → Exportar; depois carregue aqui o Excel, tal como vem (ou no 📥 Carregar).</p></div>";
  var semPreco = cods.map(function (c) { return FAD.cat[c]; }).filter(function (x) { return x.estado === "Ativo" && !x.pvp_c; });
  h += "<p class='mut' style='margin:4px 0'>" + cods.length + " artigos nesta estação · atualizado a " + dmy(FAD.catInfo.slice(0, 10)) + ". Carregue um export novo sempre que o catálogo mudar.</p>";
  h += semPreco.length ? "<details" + (semPreco.length <= 15 ? " open" : "") + "><summary>❌ <b>" + semPreco.length + " artigos ativos sem preço</b> no CBOS desta estação</summary><ul>" +
    semPreco.map(function (x) { return "<li>" + esc(x.nome) + " <span class='mut'>(" + x.poscode + ")</span></li>"; }).join("") + "</ul></details>" : "<p>✅ Todos os artigos ativos têm preço.</p>";
  return h + "</div>";
}
function desenharFad() {
  var h = "<div class='bar'><button class='btn p' id='fadPdf'>🧾 Carregar fatura da Adelaide (PDF)</button><input type='file' id='fadFPdf' accept='application/pdf' hidden>" +
    "<button class='btn' id='fadCat'>📒 Carregar catálogo do CBOS (Excel)</button><input type='file' id='fadFCat' accept='.xlsx' hidden><span id='fadSt' class='st'></span></div>";
  if (!FAD.faturas.length) h += "<div class='card' style='padding:14px'><b>Ainda não há faturas da Adelaide nesta estação.</b><p class='mut' style='margin:6px 0 0'>As faturas que chegam por email entram sozinhas. Também pode carregar aqui o PDF.</p></div>";
  else {
    if (!FAD.faturas.some(function (f) { return f.id === FAD.sel; })) FAD.sel = FAD.faturas[0].id;
    h += "<div class='sc'><table><thead><tr><th class='l'>Fatura</th><th>Data</th><th>Total €</th><th class='l'>Estado</th></tr></thead><tbody>" + FAD.faturas.map(function (f) {
      return "<tr data-fat='" + f.id + "' style='cursor:pointer" + (f.id === FAD.sel ? ";background:var(--sel,#eaf1fd)" : "") + "'><td class='l'>" + esc(f.numero || f.ficheiro || "—") + "</td><td>" + (f.data ? dmy(f.data) : dmy(f.recebida)) + "</td><td class='n'>" + (f.total_c == null ? "—" : fmt(f.total_c)) + "</td><td class='l'>" + FAD_ESTADO[f.estado] + "</td></tr>"; }).join("") + "</tbody></table></div>";
    h += fadDetalhe(FAD.faturas.find(function (f) { return f.id === FAD.sel; }));
  }
  h += fadCatalogo();
  $("#fadCorpo").innerHTML = h;
  $("#fadPdf").onclick = function () { $("#fadFPdf").click(); };
  $("#fadFPdf").onchange = function () { var f = this.files && this.files[0]; this.value = ""; if (f) importarFaturaAdelaide(f); };
  $("#fadCat").onclick = function () { $("#fadFCat").click(); };
  $("#fadFCat").onchange = function () { var f = this.files && this.files[0]; this.value = ""; if (f) importarCatalogo(f); };
  $$("#fadCorpo [data-fat]").forEach(function (t) { t.onclick = function () { FAD.sel = +t.dataset.fat; desenharFad(); }; });
  var se = $("#fadEnc"); if (se) se.onchange = function () { if (se.value) fadMudarEnc(se.value); };
  $$("#fadCorpo [data-lig]").forEach(function (b) { b.onclick = function () { var l = FAD.conf.linhas[+b.dataset.lig]; fadLigar(l.fat, l.proposta); }; });
  $$("#fadCorpo [data-esc]").forEach(function (b) { b.onclick = function () { fadEscolher(FAD.conf.linhas[+b.dataset.esc]); }; });
}
async function fadMudarEnc(id) {
  var fat = FAD.faturas.find(function (f) { return f.id === FAD.sel; });
  try { fat.encomenda = id; var c = conferirFad(fat); if (c) await gravarConferencia(fat, c, await fadEu()); desenharFad(); } catch (e) { fadMsg(falhouFad(e)); }
}
/* o dono escolhe o artigo da encomenda a que corresponde uma linha da fatura */
function fadEscolher(l) {
  var livres = ADELAIDE_CONF.daAdelaide(FAD.conf.encomenda.lines).filter(function (e) { return !FAD.conf.linhas.some(function (x) { return x.enc && x.enc.repsol_code === e.repsol_code; }); })
    .sort(function (a, b) { return ADELAIDE_CONF.parecido(l.fat.nome, b.name) - ADELAIDE_CONF.parecido(l.fat.nome, a.name); });
  $("#fadPainel").innerHTML = "<div class='card' style='padding:12px;margin-top:10px'><b>" + esc(l.fat.codigo + " · " + l.fat.nome) + "</b> (" + l.fat.qtd + " vol.) corresponde a:<div class='bar'><select id='fadEscSel'>" +
    livres.map(function (e) { return "<option value='" + esc(e.repsol_code) + "'>" + esc(e.name) + " (" + esc(e.repsol_code) + ") · " + e.qty + "</option>"; }).join("") +
    "</select><button class='btn p' id='fadEscOk'>✔ Confirmar</button><button class='btn' id='fadEscNao'>Cancelar</button></div></div>";
  $("#fadEscNao").onclick = function () { $("#fadPainel").innerHTML = ""; };
  $("#fadEscOk").onclick = function () { var c = $("#fadEscSel").value; if (c) fadLigar(l.fat, livres.find(function (e) { return e.repsol_code === c; })); };
}
/* guarda a ligação «código da Adelaide → código Repsol» (decisão do dono; fica no msb_eventos) e confere de novo */
async function fadLigar(f, e) {
  try {
    var r = await sb.from("msb_correspondencias").upsert({estacao: EST, fornecedor: "adelaide", codigo: f.codigo, nome: f.nome, repsol_code: e.repsol_code, confirmado_por: await fadEu(), confirmado_em: new Date().toISOString()}, {onConflict: "estacao,fornecedor,codigo"});
    if (r.error) throw r.error;
    FAD.lig[f.codigo] = e.repsol_code;
    var fat = FAD.faturas.find(function (x) { return x.id === FAD.sel; }), c = conferirFad(fat); if (c) await gravarConferencia(fat, c, await fadEu());
    desenharFad(); fadMsg(f.nome + " → " + e.name + ": fica guardado para as próximas faturas.", true);
  } catch (x) { fadMsg(falhouFad(x)); }
}
