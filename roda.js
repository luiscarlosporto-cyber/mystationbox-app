/* mystationbox · «rodinha» de espera (15/11/2026, escolha do dono: opção «F», depósito a encher).
 * Põe um pequeno logótipo a encher-se de combustível antes de cada texto «A carregar…» ou «A ler…» da app,
 * sem mexer nos ecrãs: observa as mudanças da página e acrescenta o ícone onde esse texto aparece.
 * Com «reduzir movimento» ligado, o ícone fica parado. Não toca em dados. */
"use strict";
(function () {
  var ESPERA = /^\s*A (carregar|ler)\b/;
  var css =
    ".msbRoda{display:inline-block;width:1.25em;height:1.25em;vertical-align:-.28em;margin-right:.45em}" +
    ".msbRoda .lq{animation:rdSobe 1.6s ease-in-out infinite}" +
    ".msbRoda .wv{animation:rdOnda .8s linear infinite}" +
    "@keyframes rdSobe{0%{transform:translateY(96px)}70%,100%{transform:translateY(6px)}}" +
    "@keyframes rdOnda{to{transform:translateX(100px)}}" +
    "@media (prefers-reduced-motion:reduce){.msbRoda .lq,.msbRoda .wv{animation:none;transform:translateY(40px)}}";
  var SVG =
    "<svg class='msbRoda' viewBox='0 0 100 100' aria-hidden='true'><defs><clipPath id='rdC'><rect x='6' y='6' width='88' height='88' rx='22'/></clipPath></defs>" +
    "<rect x='6' y='6' width='88' height='88' rx='22' fill='#0B3D91'/>" +
    "<g clip-path='url(#rdC)'><g class='lq'><path class='wv' d='M-100 4q25-9 50 0t50 0 50 0 50 0 50 0V140H-100z' fill='#1A63E8'/></g></g>" +
    "<path d='M30 72V42q0-10 9-8l11 14 11-14q9-2 9 8v30' fill='none' stroke='#fff' stroke-width='12' stroke-linecap='round' stroke-linejoin='round'/>" +
    "<path d='M43 52l13 7-13 7z' fill='#0B3D91'/></svg>";

  /* só elementos com texto simples (sem filhos), para não mexer em tabelas ou cartões já desenhados */
  function marcar(el) {
    if (!el || el.nodeType !== 1 || el.childElementCount || !ESPERA.test(el.textContent)) return;
    el.insertAdjacentHTML("afterbegin", SVG);
  }
  function procurar(raiz) {
    if (raiz.nodeType !== 1) return;
    marcar(raiz);
    var l = raiz.querySelectorAll("div,td,span,p,button");
    for (var i = 0; i < l.length; i++) marcar(l[i]);
  }
  function ligar() {
    var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    procurar(document.body);
    new MutationObserver(function (ms) {
      ms.forEach(function (m) {
        if (m.target.nodeType === 1) marcar(m.target);
        m.addedNodes.forEach(procurar);
      });
    }).observe(document.body, {childList: true, subtree: true});
  }
  if (document.body) ligar(); else document.addEventListener("DOMContentLoaded", ligar);
})();
