/* mystationbox · animação de abertura (15/11/2026, escolha do dono: opção «I»).
 * O ícone rola até ao lugar, o nome desliza ao lado e «box» cai no fim. A opção «F» (depósito a encher) é a de espera: roda.js.
 * Uma vez por sessão do navegador; salta-se com um toque ou uma tecla; não corre com «reduzir movimento» ligado. Não toca em dados. */
"use strict";
(function () {
  var CHAVE = "msb_abertura";
  try { if (sessionStorage.getItem(CHAVE)) return; sessionStorage.setItem(CHAVE, "1"); } catch (e) { /* sem armazenamento: mostra na mesma */ }
  if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var css =
    "#msbAb{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:#F3F6FB;transition:opacity .3s;cursor:pointer}" +
    "#msbAb.fim{opacity:0}" +
    "@media (prefers-color-scheme:dark){#msbAb{background:#0E1626}}" +
    "#msbAb .row{display:flex;align-items:center;gap:calc(var(--s)*.18);--s:min(96px,22vw)}" +
    "#msbAb .ic{position:relative;width:var(--s);height:var(--s);animation:abRola .7s cubic-bezier(.3,.8,.3,1) both}" +
    "#msbAb .ic img{width:100%;height:100%;display:block}" +
    "#msbAb .wm{position:relative;height:calc(var(--s)*.42);aspect-ratio:568/94}" +
    "#msbAb .wm img{position:absolute;inset:0;width:100%;height:100%;display:none}#msbAb .wm img.wl{display:block}" +
    "@media (prefers-color-scheme:dark){#msbAb .wm img.wl{display:none}#msbAb .wm img.wd{display:block}}" +
    "#msbAb .pa{clip-path:inset(0 100% 0 0);animation:abNome .6s .65s ease-out forwards}" +
    "#msbAb .pb{clip-path:inset(0 0 0 69%);opacity:0;animation:abBox .35s 1.2s ease-out forwards}" +
    "@keyframes abRola{0%{transform:translateX(-70vw) rotate(-360deg)}100%{transform:none}}" +
    "@keyframes abNome{to{clip-path:inset(0 31% 0 0)}}" +
    "@keyframes abBox{0%{opacity:0;transform:translateY(-60%)}70%{opacity:1;transform:translateY(6%)}100%{opacity:1;transform:none}}";

  var html =
    "<div class='row'><div class='ic'><img src='logo.svg' alt=''></div>" +
    "<div class='wm' role='img' aria-label='mystationbox'>" +
    "<img class='pa wl' src='marca_escura.png' alt=''><img class='pa wd' src='marca_clara.png' alt=''>" +
    "<img class='pb wl' src='marca_escura.png' alt=''><img class='pb wd' src='marca_clara.png' alt=''>" +
    "</div></div>";

  function mostrar() {
    var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    var ab = document.createElement("div"); ab.id = "msbAb"; ab.innerHTML = html; document.body.appendChild(ab);
    var feito = false;
    function fechar() {
      if (feito) return; feito = true;
      ab.classList.add("fim");
      setTimeout(function () { ab.remove(); st.remove(); }, 320);
      removeEventListener("keydown", fechar);
    }
    ab.addEventListener("click", fechar);
    addEventListener("keydown", fechar);
    setTimeout(fechar, 2300);
  }
  if (document.body) mostrar(); else document.addEventListener("DOMContentLoaded", mostrar);
})();
