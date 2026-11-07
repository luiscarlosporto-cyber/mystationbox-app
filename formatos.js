/* Números no formato PT, uma só fonte para ecrãs e PDF: «1 234,56», com espaço a partir dos milhares
   (por omissão o pt-PT só o põe a partir de 10 000, daí o useGrouping). */
var FORMATOS = (function () {
  function numero(v, min, max) {
    return v.toLocaleString("pt-PT", {minimumFractionDigits: min, maximumFractionDigits: max == null ? min : max, useGrouping: "always"});
  }
  function euros(c) { return c == null ? "" : numero(c / 100, 2); }   // recebe cêntimos
  return {numero: numero, euros: euros};
})();
if (typeof module !== "undefined") module.exports = FORMATOS;
