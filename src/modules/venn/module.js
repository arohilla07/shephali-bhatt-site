// Venn: hover, tap or tab to a region; the diagram lights it and the card explains it.
(function () {
  "use strict";

  function init() {
    var doc = document;
    var root = doc.querySelector(".m-venn");
    if (!root) return;
    var svg = root.querySelector(".m-venn-svg");
    var fig = root.querySelector(".m-venn-fig");
    var chipBox = root.querySelector(".m-venn-chips");
    var rest = root.querySelector(".m-venn-rest");
    if (!svg || !fig || !chipBox || !rest) return;

    var all = function (sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); };
    var chips = all(".m-venn-chip");
    var notes = all(".m-venn-note");
    var hots = all(".m-venn-hot");
    var loops = all(".m-venn-loop");
    var lits = all("[data-lit]").map(function (el) {
      return { el: el, set: (el.getAttribute("data-lit") || "").split(" ") };
    });
    var regionOf = function (el) { return el && el.getAttribute ? el.getAttribute("data-region") : null; };
    var isHit = function (el) { return !!(el && el.classList && el.classList.contains("m-venn-hit")); };

    var state = { hover: null, focus: null, pin: null };
    var shown;

    function render() {
      var r = state.hover || state.focus || state.pin || null;
      chips.forEach(function (c) { c.setAttribute("aria-pressed", regionOf(c) === state.pin ? "true" : "false"); });
      if (r === shown) return;
      shown = r;
      root.classList.toggle("has-active", !!r);
      if (r) root.setAttribute("data-active", r); else root.removeAttribute("data-active");
      var on = function (el) { el.classList.toggle("is-on", regionOf(el) === (r || "rest")); };
      notes.forEach(on); hots.forEach(on); loops.forEach(on); chips.forEach(on);
      lits.forEach(function (o) { o.el.classList.toggle("is-dim", !!r && o.set.indexOf(r) === -1); });
    }

    // Switch from the plain list to the interactive card
    rest.hidden = false;
    chipBox.hidden = false;
    root.classList.add("is-ready");
    render();

    // Pointer on the drawing itself (mouse previews, any pointer can pin with a click or tap)
    svg.addEventListener("pointerover", function (ev) {
      if (ev.pointerType && ev.pointerType !== "mouse") return;
      state.hover = isHit(ev.target) ? regionOf(ev.target) : null;
      render();
    });
    svg.addEventListener("pointerleave", function () { state.hover = null; render(); });
    svg.addEventListener("click", function (ev) {
      var r = isHit(ev.target) ? regionOf(ev.target) : null;
      state.pin = r && r !== state.pin ? r : null;
      if (!state.pin) state.hover = null;
      render();
    });

    // Chips mirror the regions for keyboard and touch
    chips.forEach(function (chip) {
      var r = regionOf(chip);
      chip.addEventListener("pointerenter", function (ev) {
        if (ev.pointerType && ev.pointerType !== "mouse") return;
        state.hover = r; render();
      });
      chip.addEventListener("pointerleave", function () { state.hover = null; render(); });
      chip.addEventListener("focus", function () {
        var visible = true;
        try { visible = chip.matches(":focus-visible"); } catch (e) {}
        if (visible) { state.focus = r; render(); }
      });
      chip.addEventListener("blur", function () { state.focus = null; render(); });
      chip.addEventListener("click", function () {
        state.pin = state.pin === r ? null : r;
        render();
      });
    });
    root.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape" || !(state.pin || state.hover)) return;
      state.pin = null; state.hover = null; render();
    });

    // Draw once when the diagram is properly in view; let the middle breathe only while visible
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) {
      root.classList.add("is-drawn");
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        root.classList.toggle("is-live", en.isIntersecting);
        if (en.isIntersecting && en.intersectionRatio >= 0.35) root.classList.add("is-drawn");
      });
    }, { threshold: [0, 0.35, 0.6] });
    io.observe(fig);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
