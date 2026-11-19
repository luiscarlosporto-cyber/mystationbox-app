/* mystationbox · caixa de Penafiel (dono, 19/11/2026): cofre da máquina de tabaco, clientes que ficam a dever e alerta da saída TABACO.
 * Sem ecrã, para se poder testar: node app/testes/caixa_pnf.js. Valores em cêntimos.
 * Cofre: o contador é o crédito para tirar tabaco; os maços por fora já saíram da máquina mas ainda não foram vendidos.
 *   total no início = contador + maços por fora do turno anterior; devia ser = total no início + saída TABACO − vendas tabaco máquina (CBOS);
 *   total no fim = contador + maços por fora deste turno. Diferença do cofre = total no fim − devia ser (nunca se apaga). */
"use strict";
var CAIXA_PNF = (function () {
  function vazio(x) { return x === null || x === undefined; }
  function addDia(d, n) { var x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
  /* Turno anterior: o T2 do dia anterior, ou o T1 do mesmo dia (o turno 3, OPT noturno, fica de fora) */
  function anterior(dia, turno) { return turno === "t2" ? {dia: dia, turno: "t1"} : {dia: addDia(dia, -1), turno: "t2"}; }

  /* Diferença do turno: recebido (com clientes a crédito) + o que ficou a dever − dívidas pagas neste turno − vendas */
  var RECEBIDO = ["mb_c", "solred_c", "pres_c", "num_c", "forn_c", "chq_c", "cred_c"];
  function recebido(r) { return RECEBIDO.reduce(function (s, k) { return s + (r && r[k] || 0); }, 0); }
  function diferenca(r) { return !r || vazio(r.vendas_c) ? null : recebido(r) + (r.dever_c || 0) - (r.pagou_c || 0) - r.vendas_c; }

  /* ant = linha do turno anterior (ou null); r = este turno; vendMaq = vendas tabaco máquina do CBOS em cêntimos (null = ainda não lido) */
  function cofre(ant, r, vendMaq) {
    r = r || {};
    if (!vazio(r.cofre_ini_c)) ant = {cofre_c: r.cofre_ini_c, macos_c: r.macos_ini_c || 0, manual: true};   // início definido à mão neste turno: manda sobre o turno anterior
    var faltaAnt = !ant || vazio(ant.cofre_c), ini = faltaAnt ? null : ant.cofre_c + (ant.macos_c || 0);
    var temFim = !vazio(r.cofre_c), fim = temFim ? r.cofre_c + (r.macos_c || 0) : null;
    var devia = faltaAnt || vazio(vendMaq) ? null : ini + (r.tab_c || 0) - vendMaq;
    var dif = devia === null || !temFim ? null : fim - devia;
    var estado = faltaAnt ? "falta_anterior" : !temFim ? "falta_contador" : vazio(vendMaq) ? "espera_cbos" : dif === 0 ? "certo" : dif < 0 ? "falta" : "sobra";
    return {manual: !!(ant && ant.manual), ini: ini, iniCont: faltaAnt ? null : ant.cofre_c, iniMacos: faltaAnt ? null : (ant.macos_c || 0), fim: fim, devia: devia, dif: dif, estado: estado};
  }

  /* Alerta (só aviso, nunca corrige): falta na caixa e sobra no cofre = saída TABACO provavelmente esquecida; o contrário = saída TABACO a mais */
  function alerta(difTurno, c) {
    if (difTurno === null || !c || c.dif === null) return null;
    var total = difTurno + c.dif;
    if (difTurno < 0 && c.dif > 0) return {tipo: "esquecida", provavel_c: Math.min(-difTurno, c.dif), total_c: total};
    if (difTurno > 0 && c.dif < 0) return {tipo: "a_mais", provavel_c: Math.min(difTurno, -c.dif), total_c: total};
    return null;
  }

  /* Dívidas por pagar que um turno pode receber: só as feitas em turnos anteriores, não pagas nem anuladas */
  function chave(d, t) { return d + (t === "t2" ? "2" : "1"); }
  function porPagar(L, dia, turno) {
    var k = chave(dia, turno);
    return (L || []).filter(function (x) { return !x.anulado_em && !x.pago_dia && chave(x.dia, x.turno) < k; })
      .sort(function (a, b) { return chave(a.dia, a.turno) < chave(b.dia, b.turno) ? -1 : 1; });
  }
  /* Pagamento: o valor pago não pode passar a dívida; se for menos, o resto fica como dívida nova ligada à primeira (nada se perde) */
  var MEIOS = ["Numerário", "MB", "Solred"];
  function pagar(d, valor_c, meio) {
    if (!d || d.anulado_em || d.pago_dia) throw new Error("Esta dívida já não está por pagar.");
    if (!(valor_c > 0)) throw new Error("Escreva o valor pago.");
    if (valor_c > d.valor_c) throw new Error("O valor pago é maior do que a dívida.");
    if (MEIOS.indexOf(meio) < 0) throw new Error("Escolha como pagou.");
    return {pago_c: valor_c, resto_c: d.valor_c - valor_c};
  }
  /* Numerário a depositar no banco, total do dia (dono, 19/11/2026): só depois de fechado o turno 2.
     O numerário de cada turno já inclui as saídas de caixa e a saída TABACO, que já não estão na caixa: tiram-se. */
  function deposito(t1, t2, saidas) {
    if (!t2 || t2.num_c === null || t2.num_c === undefined) return null;
    var num = (t1 && t1.num_c || 0) + (t2.num_c || 0), sai = (saidas || []).reduce(function (s, x) { return s + (x.valor_c || 0); }, 0);
    var tab = (t1 && t1.tab_c || 0) + (t2.tab_c || 0);
    return {num_c: num, saidas_c: sai, tab_c: tab, valor_c: num - sai - tab};
  }
  var CLIENTES = ["Penachama", "Lateral", "Obragenial", "Granitec"];
  return {deposito: deposito, anterior: anterior, recebido: recebido, diferenca: diferenca, cofre: cofre, alerta: alerta, porPagar: porPagar, pagar: pagar, CLIENTES: CLIENTES, MEIOS: MEIOS, RECEBIDO: RECEBIDO};
})();
if (typeof module !== "undefined") module.exports = CAIXA_PNF;
