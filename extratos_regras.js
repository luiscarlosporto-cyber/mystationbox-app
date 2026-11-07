/* mystationbox · extratos bancários (Caixa de Crédito Agrícola), sem ecrã, para se poderem testar: node app/testes/extratos.js
 * Ficheiro «Movimentos de Conta» do homebanking: cabeçalho (Operação, Conta, De, A), uma linha de títulos e um movimento por linha,
 * do mais recente para o mais antigo. Depois de algumas transferências vêm linhas de detalhe (Nome Ordenante, NIB/IBAN, Nome do
 * Beneficiário, Referência) que pertencem ao movimento de cima.
 * Regras: o saldo de cada linha tem de bater com o anterior ± montante; um ficheiro que não bata é recusado e nada se grava.
 * A conta decide a estação (o nome da empresa vem escrito de muitas maneiras). Valores em cêntimos: crédito positivo, débito negativo.
 * A classificação é só uma proposta: o que não se reconhece fica «por classificar» e nunca é adivinhado. */
"use strict";
var EXTRATOS = (function () {
  var TITULOS = ["Data de Movimento", "Data Valor", "Descrição", "Descritivo", "Montante", "D/C", "Saldo Contabilístico"];
  var DETALHE = {"Nome Ordenante": "ordenante", "NIB/IBAN/Conta Ordenante": "iban", "Nome do Beneficiário": "beneficiario", "Referência": "referencia"};
  var TIPOS = {
    deposito: "Depósito de numerário", credito_repsol: "Crédito da Repsol", liquidacao_repsol: "Pagamento de liquidação Repsol",
    debito_repsol: "Débito direto Repsol", salario: "Salários", seguranca_social: "Segurança Social", estado: "Impostos (Estado)",
    despesa: "Despesa", fornecedor: "Fornecedor", recebimento: "Recebimento", cliente_credito: "Clientes a crédito", cartao: "Compra com cartão", comissao: "Comissões bancárias",
    juros: "Juros", emprestimo: "Empréstimo", transferencia_interna: "Transferência entre contas", outro: "Outro", por_classificar: "Por classificar"
  };
  /* Por ordem: a primeira regra que serve decide. sinal: "C" só créditos, "D" só débitos. cat = categoria das despesas, quando a há. */
  var REGRAS = [
    [/^DEP\.?\s*NUM/, null, "deposito"],
    [/^TRANSF SEPA\s*-\s*REPSOL/, "C", "credito_repsol"],
    [/^REPSOL PORTUGU\s+\d+\//, "D", "liquidacao_repsol"],
    [/^DD-.*REPSOL/, "D", "debito_repsol"],
    [/^ORDENADO\b/, "D", "salario"],
    [/^INSTITUTO GEST/, "D", "seguranca_social"],
    [/^PAG\.?\s*DUC/, "D", "estado"],
    [/^(MANUT CONTA|COMISS|IMPOSTO D?O? ?SELO)/, "D", "comissao"],
    [/^JUROS/, "C", "juros"],
    [/^PREST\./, "D", "emprestimo"],
    [/^DD-.*MEO/, "D", "despesa", "Comunicações"],
    [/^DD-.*PROSEGUR/, "D", "despesa", "Alarmes"],
    [/^DD-.*(MAPFRE|ALLIANZ|COMPANHIA)/, "D", "despesa", "Seguros"],
    [/^DD-/, "D", "fornecedor"],
    [/^COMPRA /, "D", "cartao"],
    [/^(IPS\/|FORNECEDOR\s*-|TRANSF SEPA\s*-)/, "C", "recebimento"]
  ];

  function txt(v) { return String(v == null ? "" : v).trim(); }
  /* "30/10/2026" → "2026-10-30"; também aceita data do Excel (número) ou Date. */
  function iso(v) {
    if (v instanceof Date) return v.getFullYear() + "-" + String(v.getMonth() + 1).padStart(2, "0") + "-" + String(v.getDate()).padStart(2, "0");
    if (typeof v === "number" && v > 30000 && v < 80000) return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10);
    var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(txt(v)); return m ? m[3] + "-" + m[2] + "-" + m[1] : null;
  }
  /* 1184.61 ou "1.184,61" → 118461 cêntimos. Vazio ou inválido → NaN. */
  function cent(v) {
    if (typeof v === "number") return isFinite(v) ? Math.round(v * 100) : NaN;
    var s = txt(v).replace(/[\s€]/g, ""); if (!s) return NaN;
    if (s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", ".");
    return /^-?\d+(\.\d{1,2})?$/.test(s) ? Math.round(Number(s) * 100) : NaN;
  }

  /* Nome de quem recebe ou paga, tirado da descrição: "Trf imediata ADELAIDE SOUSA FE" → "ADELAIDE SOUSA FE".
     O banco corta os nomes, por isso compara-se pelo começo. Sem nome reconhecível devolve "". */
  function contraparte(descricao) {
    var d = txt(descricao).toUpperCase().replace(/\s+/g, " ");
    var m = /^(?:TRF IMEDIATA|TRF A CR[ÉE]DITO SEPA\+|TRF CR[ÉE]DITO (?:INTRAB )?BENEF DIFER\w*|ORDENADO|COMPRA)\s+(.+)$/.exec(d) || /^([A-Z][A-Z0-9 .&'-]{2,}?)\s+\d{3,}\/\d+$/.exec(d);
    return m ? m[1].replace(/\s*-\s*$/, "").trim() : "";
  }

  /* aprendidas = [{padrao, sinal, tipo, categoria}] confirmadas pelo dono (msb_extratos_regras). Valem depois das regras fixas
     mais seguras (depósitos, Repsol, Estado…) e antes de «por classificar». */
  function classificar(descricao, valor_c, detalhe, aprendidas) {
    var d = txt(descricao).toUpperCase().replace(/\s+/g, " "), s = valor_c >= 0 ? "C" : "D", ref = txt(detalhe && detalhe.referencia).toLowerCase();
    if (s === "D" && /ordenad|vencimento|salári/.test(ref)) return {tipo: "salario", categoria: "Salários", regra: "referência"};
    for (var i = 0; i < REGRAS.length; i++) {
      var r = REGRAS[i];
      if ((!r[1] || r[1] === s) && r[0].test(d)) return {tipo: r[2], categoria: r[3] || TIPOS[r[2]], regra: "fixa"};
    }
    var nome = contraparte(descricao);
    if (nome) for (var j = 0; j < (aprendidas || []).length; j++) {
      var a = aprendidas[j], p = txt(a.padrao).toUpperCase();
      if (p && (!a.sinal || a.sinal === s) && (nome.indexOf(p) === 0 || p.indexOf(nome) === 0)) return {tipo: a.tipo, categoria: a.categoria || TIPOS[a.tipo], regra: "aprendida"};
    }
    return {tipo: "por_classificar", categoria: null, regra: null};
  }

  /* L = linhas da folha (lista de listas, como o sheet_to_json com header:1). contas = {"40325212668": "sto", …}.
     Devolve {conta, estacao, de, ate, saldo_inicial_c, saldo_final_c, creditos_c, debitos_c, movimentos:[…]} ou lança erro. */
  function ler(L, contas, aprendidas) {
    L = (L || []).map(function (r) { return (r || []).map(function (x) { return x == null ? null : x; }); });
    var cab = function (re) { for (var i = 0; i < Math.min(L.length, 12); i++) { var m = re.exec(txt(L[i][0])); if (m) return m[1].trim(); } return null; };
    if (!cab(/^Operação:\s*(Consulta de Movimentos de Contas.*)$/i)) throw new Error("Não é um extrato «Movimentos de Conta» do Crédito Agrícola.");
    var conta = (cab(/^Conta:\s*(\d[\d\s]*)$/i) || "").replace(/\s/g, ""), de = iso(cab(/^De:\s*(.+)$/i)), ate = iso(cab(/^A:\s*(.+)$/i));
    if (!conta) throw new Error("O extrato não diz o número da conta.");
    if (!de || !ate) throw new Error("O extrato não diz o período (De / A).");
    var h = L.findIndex(function (r) { return TITULOS.every(function (t, k) { return txt(r[k]) === t; }); });
    if (h < 0) throw new Error("Os títulos das colunas não são os esperados. O banco pode ter mudado o ficheiro: nada foi gravado.");
    var mov = [], erros = [];
    L.slice(h + 1).forEach(function (r, k) {
      var n = h + k + 2, a = txt(r[0]);
      if (!r.some(function (x) { return txt(x); })) return;
      if (DETALHE[a]) {
        if (!mov.length) return erros.push("linha " + n + ": detalhe sem movimento antes");
        mov[mov.length - 1].detalhe[DETALHE[a]] = txt(r[1]); return;
      }
      var dia = iso(r[0]), dv = iso(r[1]), dc = txt(r[5]), v = cent(r[4]), sal = cent(r[6]);
      if (!dia) return erros.push("linha " + n + ": data inválida (" + a + ")");
      if (dc !== "C" && dc !== "D") return erros.push("linha " + n + ": coluna D/C inválida");
      if (isNaN(v) || v <= 0) return erros.push("linha " + n + ": montante inválido");
      if (isNaN(sal)) return erros.push("linha " + n + ": saldo inválido");
      if (dia < de || dia > ate) return erros.push("linha " + n + ": data " + dia + " fora do período do extrato");
      var d = txt(r[3]);
      mov.push({linha: n, dia: dia, dia_valor: dv, descricao: txt(r[2]).replace(/\s+/g, " "), descritivo: d === "-" ? null : d.replace(/\s+/g, " "), valor_c: dc === "C" ? v : -v, saldo_c: sal, detalhe: {}});
    });
    if (erros.length) throw new Error("Extrato recusado, nada foi gravado: " + erros.slice(0, 5).join("; ") + (erros.length > 5 ? " (e mais " + (erros.length - 5) + ")" : "") + ".");
    if (!mov.length) throw new Error("O extrato não tem movimentos.");
    mov.reverse();   // do mais antigo para o mais recente
    for (var i = 1; i < mov.length; i++) {
      if (mov[i].dia < mov[i - 1].dia) throw new Error("Extrato recusado: os movimentos não estão por ordem de data (linha " + mov[i].linha + ").");
      if (mov[i - 1].saldo_c + mov[i].valor_c !== mov[i].saldo_c) throw new Error("Extrato recusado: o saldo da linha " + mov[i].linha + " não bate com o movimento anterior. O ficheiro pode estar incompleto ou alterado.");
    }
    var cred = 0, deb = 0;
    mov.forEach(function (m, k) {
      var c = classificar(m.descricao, m.valor_c, m.detalhe, aprendidas);
      m.tipo = c.tipo; m.categoria = c.categoria; m.regra = c.regra; m.contraparte = contraparte(m.descricao) || null; m.ordem = k;
      m.chave = conta + "|" + m.dia + "|" + m.valor_c + "|" + m.saldo_c;   // o mesmo movimento noutra exportação dá a mesma chave
      if (m.valor_c > 0) cred += m.valor_c; else deb -= m.valor_c;
    });
    var vistas = {};
    mov.forEach(function (m) { if (vistas[m.chave]) throw new Error("Extrato recusado: dois movimentos iguais na linha " + m.linha + "."); vistas[m.chave] = 1; });
    return {conta: conta, estacao: (contas || {})[conta] || null, de: de, ate: ate, saldo_inicial_c: mov[0].saldo_c - mov[0].valor_c,
      saldo_final_c: mov[mov.length - 1].saldo_c, creditos_c: cred, debitos_c: deb, movimentos: mov};
  }

  /* Resumo por tipo: [{tipo, nome, n, creditos_c, debitos_c}], do maior para o menor. */
  function resumo(movimentos) {
    var r = {};
    (movimentos || []).forEach(function (m) {
      var x = r[m.tipo] || (r[m.tipo] = {tipo: m.tipo, nome: TIPOS[m.tipo] || m.tipo, n: 0, creditos_c: 0, debitos_c: 0});
      x.n++; if (m.valor_c > 0) x.creditos_c += m.valor_c; else x.debitos_c -= m.valor_c;
    });
    return Object.keys(r).map(function (k) { return r[k]; }).sort(function (a, b) { return (b.creditos_c + b.debitos_c) - (a.creditos_c + a.debitos_c); });
  }

  /* Numerário dos turnos × depósitos, por mês e acumulado. turnos = [{dia, num_c}], movimentos com tipo «deposito».
     «Por depositar» = numerário acumulado − depositado acumulado, desde o primeiro dia dado. É um indicador:
     o numerário inclui saídas de caixa que nunca chegam ao banco. */
  function numerarioDepositos(turnos, movimentos, desde) {
    var m = {}, mes = function (d) { return d.slice(0, 7); }, linha = function (k) { return m[k] || (m[k] = {mes: k, numerario_c: 0, depositado_c: 0, depositos: 0}); };
    (turnos || []).forEach(function (t) { if (t.dia >= desde && t.num_c) linha(mes(t.dia)).numerario_c += t.num_c; });
    (movimentos || []).forEach(function (x) { if (x.tipo === "deposito" && x.dia >= desde) { var l = linha(mes(x.dia)); l.depositado_c += x.valor_c; l.depositos++; } });
    var acc = 0;
    return Object.keys(m).sort().map(function (k) { var l = m[k]; acc += l.numerario_c - l.depositado_c; l.por_depositar_c = acc; return l; });
  }

  return {TIPOS: TIPOS, iso: iso, cent: cent, contraparte: contraparte, classificar: classificar, ler: ler, resumo: resumo, numerarioDepositos: numerarioDepositos};
})();
if (typeof module !== "undefined") module.exports = EXTRATOS;
