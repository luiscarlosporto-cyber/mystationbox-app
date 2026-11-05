/* Horários · Fase 1: consultar a escala por mês, na loja aberta. Só lê.
 * Os dados vêm de msb_horario_dias; o funcionário vê os da sua loja (RLS). Exportar para o Picaponto é a Fase 2. */
"use strict";
(function () {
  var MES = null, SEM = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  function hoje() { return hojeISO(0); }
  function feriados(ano) {   // nacionais e Carnaval, como nas regras da escala
    var f = {}, n = feriadosPT(ano), p = pascoa(ano);
    (Array.isArray(n) ? n : Object.keys(n)).forEach(function (d) { f[d] = 1; });
    f[new Date(p.getTime() - 47 * 864e5).toISOString().slice(0, 10)] = 1;
    return f;
  }
  function nomeMes(m) { return new Date(m + "-15").toLocaleDateString("pt-PT", {month: "long", year: "numeric"}); }
  async function abrir(M) {
    var box = $("#v-hor"); M = M || MES || hoje().slice(0, 7); MES = M;
    var est = EST, bar = "<div class='bar'><button class='btn' id='horAnt' aria-label='Mês anterior'>‹</button><input type='month' id='horMes' value='" + M + "'><button class='btn' id='horSeg' aria-label='Mês seguinte'>›</button><span id='horEst'></span></div>";
    var ligar = function () {
      $("#horAnt").onclick = function () { abrir(addMes(M, -1)); };
      $("#horSeg").onclick = function () { abrir(addMes(M, 1)); };
      $("#horMes").onchange = function () { if (this.value) abrir(this.value); };
    };
    box.innerHTML = bar + "<div class='bl ske' style='height:260px'></div>"; ligar();
    try {
      var fim = addMes(M, 1) + "-01";
      var R = await Promise.all([
        sb.from("msb_horario_dias").select("dia,colaborador_id,codigo").eq("estacao", est).gte("dia", M + "-01").lt("dia", fim),
        sb.from("msb_colab_lojas").select("colaborador_id,codigo,ordem").eq("estacao", est).order("ordem"),
        sb.from("msb_colaboradores").select("id,curto,nome"),
        sb.from("msb_horario_meses").select("estado").eq("estacao", est).eq("mes", M).maybeSingle()
      ]);
      R.forEach(function (r) { if (r.error) throw r.error; });
      if (est !== EST || M !== MES) return;
      if (!R[0].data.length) { box.innerHTML = bar + "<div class='vazio'>Ainda não há horário de " + nomeMes(M) + " nesta loja.</div>"; ligar(); return; }
      var ano = +M.slice(0, 4), mm = +M.slice(5), n = new Date(ano, mm, 0).getDate(), fer = feriados(ano), hj = hoje();
      var G = {}; R[0].data.forEach(function (x) { (G[x.colaborador_id] = G[x.colaborador_id] || {})[+x.dia.slice(8)] = x.codigo; });
      var C = {}; R[2].data.forEach(function (c) { C[c.id] = c; });
      var P = R[1].data.filter(function (l) { return G[l.colaborador_id]; });
      var eu = ((PERFIL && PERFIL.display_name) || "").trim().split(/\s+/)[0];
      var dias = []; for (var d = 1; d <= n; d++) dias.push(d);
      var tipo = function (d) { var iso = M + "-" + String(d).padStart(2, "0"), w = new Date(iso + "T12:00:00").getDay(); return {iso: iso, w: w, cl: (fer[iso] ? "fer " : (w === 0 || w === 6) ? "fds " : "") + (iso === hj ? "hj" : "")}; };
      var h = "<div class='sc' id='horSc'><table class='hor'><thead><tr><th class='l'>Colaborador</th>" + dias.map(function (d) { var t = tipo(d); return "<th class='" + t.cl + "'>" + d + "<small>" + SEM[t.w] + "</small></th>"; }).join("") + "<th>Turnos</th></tr></thead><tbody>";
      P.forEach(function (l) {
        var c = C[l.colaborador_id] || {}, g = G[l.colaborador_id], tur = 0;
        h += "<tr" + (c.curto === eu ? " class='eu'" : "") + "><td class='l' title='" + esc(c.nome || "") + "'>" + esc(c.curto || "") + "</td>" + dias.map(function (d) {
          var v = g[d] || ""; if (v === "M" || v === "T" || v === "MT") tur++;
          return "<td class='" + tipo(d).cl + "'>" + v + "</td>";
        }).join("") + "<td class='n'>" + tur + "</td></tr>";
      });
      var falta = [];
      h += "</tbody><tfoot><tr><td class='l'>Cobertura</td>" + dias.map(function (d) {
        var m = 0, t = 0; P.forEach(function (l) { var v = G[l.colaborador_id][d]; if (v === "M" || v === "MT") m++; if (v === "T" || v === "MT") t++; });
        var f = !m ? "manhã" : !t ? "tarde" : ""; if (f) falta.push(d + " (" + f + ")");
        return "<td class='" + tipo(d).cl + "' title='" + (f ? "Sem " + f : "") + "'>" + (f ? "⚠" : "") + "</td>";
      }).join("") + "<td></td></tr></tfoot></table></div>";
      var estado = R[3].data && R[3].data.estado;
      box.innerHTML = bar + (falta.length ? "<div class='aviso'><p>⚠ Dias sem cobertura no horário: " + esc(falta.join(", ")) + ".</p></div>" : "") + h +
        "<p class='rod'>M manhã · T tarde · MT turno M/T · FG folga · F férias · FD feriado. Fundo azul: fim de semana; creme: feriado.</p>";
      $("#horEst").innerHTML = estado === "simulacao" ? "<span class='tag t-at'>Simulação</span>" : "<span class='tag t-ok'>Horário real</span>"; ligar();
      var sc = $("#horSc"), alvo = sc.querySelector("th.hj"); if (alvo) sc.scrollLeft = Math.max(0, alvo.offsetLeft - 140);
    } catch (e) { box.innerHTML = bar + "<div class='aviso'><p>" + esc(falhou(e)) + "</p></div>"; ligar(); }
  }
  MSB_NAV.horario = function () { abrir(); };
})();
