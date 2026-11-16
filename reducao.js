/* mystationbox · Combustível → Redução Repsol (16/11/2026, pedido do dono).
 * Desde 16/11/2026 a «Redução Cêntimos€/litro (c/IVA)» de cada PDF de preços da Repsol é dinâmica. Este quadro mostra,
 * em cada estação, cada PDF novo comparado com o anterior e quanto a Repsol ganha (redução desce) ou perde (sobe) nos
 * litros vendidos sem Solred. Só lê: msb_precos (PDF guardados em Preços ENSE) e msb_vendas_mes (relatório CBOS).
 * Cálculo em reducao_regras.js. */
"use strict";
function redC(v) { return v == null ? "—" : (v / 1000).toFixed(3).replace(".", ",") + " c"; }
function redLitros(cl) { return FORMATOS.numero ? FORMATOS.numero(cl / 100, 0) : pt(cl / 100).replace(/,\d+$/, ""); }
function redEur(c) { return fmt(Math.abs(c)) + " €"; }
function redQuem(c) {   // nunca só pela cor: diz sempre quem ganha
  if (!c) return "<span class='mut'>0,00 € · sem efeito</span>";
  return c > 0 ? "<b style='color:var(--bad)'>▲ Repsol ganha " + redEur(c) + "</b>" : "<b style='color:var(--ok)'>▼ Repsol perde " + redEur(c) + "</b>";
}
function redDif(d) { if (d == null) return "<span class='mut'>novo</span>"; if (!d) return "<span class='mut'>igual</span>"; return d > 0 ? "▼ " + redC(d) + " a menos" : "▲ " + redC(-d) + " a mais"; }

function redPeriodo(p) {
  var cab = p.futuro ? "Entra em vigor a " + dmy(p.dia) + " · ainda não começou" : "Em vigor de " + dmy(p.dia) + " a " + dmy(p.ate) + " (" + p.dias + (p.dias === 1 ? " dia" : " dias") + ")";
  var h = "<div style='margin-top:12px'><div><b>" + esc(cab) + "</b> <span class='mut'>· comparado com o PDF de " + dmy(p.anterior) + "</span>" +
    (p.estimado ? " <span class='t-at' style='padding:1px 6px;border-radius:6px;font-size:12px'>litros estimados</span>" : "") + "</div>";
  h += "<div class='sc'><table><thead><tr><th class='l'>Produto</th><th>Redução anterior</th><th>Redução nova</th><th class='l'>Diferença</th>" +
    (p.futuro ? "<th>Por dia (estimado)</th>" : "<th>Litros sem Solred</th><th>Ganho Repsol c/IVA</th><th>s/IVA</th>") + "</tr></thead><tbody>";
  p.linhas.forEach(function (x) {
    h += "<tr><td class='l'>" + esc(x.nome) + "</td><td class='n'>" + redC(x.red_ant) + "</td><td class='n'>" + redC(x.red) + "</td><td class='l'>" + redDif(x.dif) + "</td>" +
      (p.futuro ? "<td class='l'>" + (x.por_dia_c == null ? "—" : redQuem(x.por_dia_c)) + "</td>"
        : "<td class='n'>" + redLitros(x.litros_cl) + " L</td><td class='l'>" + (x.dif == null ? "—" : redQuem(x.ganho_c)) + "</td><td class='n'>" + (x.dif == null ? "—" : (x.ganho_siva_c < 0 ? "-" : "") + redEur(x.ganho_siva_c)) + "</td>") + "</tr>";
  });
  h += "</tbody></table></div>";
  h += "<div style='margin-top:4px'>" + (p.mudou ? "" : "✔ Nenhuma redução mudou face ao PDF anterior. ") +
    (p.futuro ? (p.por_dia_c == null ? "" : "Por dia: " + redQuem(p.por_dia_c)) : "Total do período: " + redQuem(p.ganho_c) + " <span class='mut'>(s/IVA " + (p.ganho_siva_c < 0 ? "-" : "") + redEur(p.ganho_siva_c) + ")</span>") +
    (p.semVendas ? "<div class='aviso' style='margin-top:6px'>⚠ Falta o relatório «Turno por formas de cobrança» para saber os litros: o ganho deste período não está completo.</div>" : "") + "</div></div>";
  return h;
}

function redEstacao(e, C) {
  var h = "<div class='card' style='padding:14px'><h2>⛽ " + esc(e.short_name || e.name) + "</h2>";
  if (!C.partida) return h + "<p class='mut'>Ainda não há o PDF de preços de " + dmy(C.desde) + " (ponto de partida). Carregue-o em Preços ENSE.</p></div>";
  h += "<p class='mut' style='margin:2px 0 0'>Ponto de partida: PDF de " + dmy(C.partida.dia) + ". Cada PDF novo compara-se com o anterior.</p>";
  if (C.meses.length) h += "<div style='margin-top:8px'>" + C.meses.map(function (m) { return "<div>" + esc(new Date(m.mes + "-15").toLocaleDateString("pt-PT", {month: "long", year: "numeric"})) + ": " + redQuem(m.ganho_c) + " <span class='mut'>(s/IVA " + (m.ganho_siva_c < 0 ? "-" : "") + redEur(m.ganho_siva_c) + (m.estimado ? ", litros estimados" : "") + ")</span></div>"; }).join("") + "</div>";
  if (!C.periodos.length) return h + "<p style='margin-top:8px'>Ainda não chegou nenhum PDF depois do ponto de partida.</p></div>";
  return h + C.periodos.map(redPeriodo).join("") + "</div>";
}

async function carregarReducao() {
  var corpo = $("#redCorpo"); corpo.innerHTML = "<div class='mut'>A carregar…</div>";
  try {
    var desde = REDUCAO.DESDE, mesMin = addMes(desde.slice(0, 7), -2), hoje = hojeISO(0), h = "", total = 0, totalS = 0, fut = 0, temFut = false;
    for (var i = 0; i < ESTS.length; i++) {
      var e = ESTS[i];
      var rp = await sb.from("msb_precos").select("dia,produtos").eq("estacao", e.id).gte("dia", desde).order("dia"); if (rp.error) throw rp.error;
      var rv = await sb.from("msb_vendas_mes").select("mes,de,ate,dados").eq("estacao", e.id).gte("mes", mesMin); if (rv.error) throw rv.error;
      var C = REDUCAO.calcular(rp.data || [], rv.data || [], hoje);
      C.periodos.forEach(function (p) { if (p.futuro) { if (p.por_dia_c != null) { fut += p.por_dia_c; temFut = true; } } else { total += p.ganho_c; totalS += p.ganho_siva_c; } });
      h += redEstacao(e, C);
    }
    var topo = "<div class='card' style='padding:14px'><h2>📊 Redução Repsol desde " + dmy(desde) + "</h2>" +
      "<div style='font-size:18px;margin-top:4px'>" + (ESTS.length > 1 ? "As duas estações: " : "") + redQuem(total) + " <span class='mut' style='font-size:14px'>(s/IVA " + (totalS < 0 ? "-" : "") + redEur(totalS) + ")</span></div>" +
      (temFut ? "<div style='margin-top:4px'>PDF que ainda não entrou em vigor, por dia: " + redQuem(fut) + "</div>" : "") +
      "<p class='mut' style='margin:8px 0 0;font-size:13px'>Ganho da Repsol = (redução do PDF anterior − redução do PDF novo) × litros vendidos sem Solred. A redução desce: a Repsol ganha. Sobe: a Repsol perde. " +
      "Litros sem Solred = parte «consigna» do relatório «Turno por formas de cobrança» do mês, repartida por dia; sem o relatório do mês usa-se a média do último mês carregado (estimado). " +
      "Compara os mesmos litros com as duas reduções: se as vendas mudarem com o preço, isso não entra.</p></div>";
    corpo.innerHTML = topo + h;
  } catch (e) { corpo.innerHTML = "<div class='bad'>" + esc(falhou(e)) + "</div>"; }
}
