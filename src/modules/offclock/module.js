// Off the clock: tiles play on hover, keyboard focus, tap, and once when they scroll into view.
(function () {
  "use strict";

  function init() {
    var root = document.querySelector(".m-offclock");
    if (!root) return;
    var grid = root.querySelector(".oc-grid");
    var els = Array.prototype.slice.call(root.querySelectorAll(".oc-tile"));
    if (!grid || !els.length) return;

    var reduce = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
    var hasIO = "IntersectionObserver" in window;
    var PLAY_MS = 3200;   // longest one-shot, with room to spare
    var DEMO_MS = 2700;   // how long a tile stays "on" when it demos itself on scroll
    var lastPointer = "mouse";

    var tiles = els.map(function (el) {
      return { el: el, btn: el.querySelector(".oc-play"), hover: false, focus: false, pin: false, demo: false, on: false, seen: false, playT: 0, demoT: 0 };
    });

    function play(t) {
      t.el.classList.add("is-play");
      clearTimeout(t.playT);
      t.playT = setTimeout(function () { t.el.classList.remove("is-play"); }, PLAY_MS);
    }

    function sync(t) {
      var held = t.hover || t.focus || t.pin;
      var on = held || t.demo;
      t.el.classList.toggle("is-held", held);
      t.el.classList.toggle("is-kbd", t.focus);
      if (on === t.on) return;
      t.on = on;
      t.el.classList.toggle("is-on", on);
      if (on) play(t);
    }

    // Snap back to rest with transitions off, then run it again from the top.
    function replay(t) {
      var c = t.el.classList;
      c.add("is-reset");
      c.remove("is-on", "is-play");
      clearTimeout(t.playT);
      void t.el.getBoundingClientRect();
      c.remove("is-reset");
      t.on = false;
      if (!(t.hover || t.focus || t.pin)) startDemo(t, 0);
      else sync(t);
    }

    function startDemo(t, delay) {
      clearTimeout(t.demoT);
      t.demoT = setTimeout(function () {
        t.demo = true; sync(t);
        t.demoT = setTimeout(function () { t.demo = false; sync(t); }, DEMO_MS);
      }, delay);
    }

    function unpinAll(except) {
      tiles.forEach(function (t) { if (t !== except && t.pin) { t.pin = false; sync(t); } });
    }

    root.addEventListener("pointerdown", function (ev) { lastPointer = ev.pointerType || "mouse"; }, true);

    tiles.forEach(function (t) {
      t.el.addEventListener("pointerenter", function (ev) {
        if (ev.pointerType && ev.pointerType !== "mouse") return;
        t.hover = true; sync(t);
      });
      t.el.addEventListener("pointerleave", function () {
        if (!t.hover) return;
        t.hover = false; sync(t);
      });

      if (t.btn) {
        t.btn.addEventListener("focus", function () {
          var vis = true;
          try { vis = t.btn.matches(":focus-visible"); } catch (e) { vis = true; }
          t.focus = vis; sync(t);
        });
        t.btn.addEventListener("blur", function () { t.focus = false; sync(t); });
      }

      t.el.addEventListener("click", function (ev) {
        var fromKeys = ev.detail === 0;
        if (fromKeys || lastPointer === "mouse") {
          // Keyboard and mouse already have it running through focus or hover: play it again.
          if (reduce) { t.pin = !t.pin; unpinAll(t); sync(t); }
          else replay(t);
          return;
        }
        // Touch and pen: tap to set it going, tap again to put it back.
        clearTimeout(t.demoT); t.demo = false;
        t.pin = !t.pin;
        unpinAll(t);
        sync(t);
      });
    });

    // A tap anywhere else puts a pinned tile back.
    document.addEventListener("click", function (ev) {
      if (ev.target.closest && ev.target.closest(".m-offclock .oc-tile")) return;
      unpinAll(null);
    });

    // Entrance, and one self-demo per tile as it comes into view.
    if (!hasIO) {
      root.classList.add("is-in");
    } else {
      var enter = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { root.classList.add("is-in"); enter.disconnect(); }
        });
      }, { rootMargin: "0px 0px -6% 0px", threshold: 0.12 });
      enter.observe(grid);

      var wave = 0, waveT = 0;
      var watch = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          var t = tiles[els.indexOf(en.target)];
          if (!t) return;
          if (!en.isIntersecting) {
            // Off screen: stop anything pinned so nothing runs unseen.
            if (t.pin) { t.pin = false; sync(t); }
            return;
          }
          if (t.seen || en.intersectionRatio < 0.6) return;
          t.seen = true;
          if (reduce) return;
          startDemo(t, 520 + wave * 190);
          wave += 1;
          clearTimeout(waveT);
          waveT = setTimeout(function () { wave = 0; }, 500);
        });
      }, { threshold: [0, 0.6] });
      els.forEach(function (el) { watch.observe(el); });
    }

    // Phone row: light up the dot for the tile nearest the left edge.
    var dots = Array.prototype.slice.call(root.querySelectorAll(".oc-pager i"));
    if (dots.length === els.length) {
      var items = els.map(function (el) { return el.parentNode; });
      var ticking = false;
      var mark = function () {
        ticking = false;
        var max = grid.scrollWidth - grid.clientWidth, x = grid.scrollLeft, best = 0, bestD = Infinity;
        if (max > 2 && x >= max - 2) best = items.length - 1;
        else {
          var first = items[0].offsetLeft;
          items.forEach(function (it, i) {
            var d = Math.abs(it.offsetLeft - first - x);
            if (d < bestD) { bestD = d; best = i; }
          });
        }
        dots.forEach(function (d, i) { d.classList.toggle("is-now", i === best); });
      };
      grid.addEventListener("scroll", function () {
        if (ticking) return;
        ticking = true;
        (window.requestAnimationFrame || setTimeout)(mark);
      }, { passive: true });
      window.addEventListener("resize", mark);
      mark();
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
