// Travels light: flight path + paper plane, passport stamps, tear-off stub.
(function () {
  "use strict";

  function init() {
    var root = document.querySelector(".m-travel");
    if (!root) return;

    var reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    var route = root.querySelector(".m-travel-route");
    var stamps = Array.prototype.slice.call(root.querySelectorAll(".m-travel-stamp"));
    var notes = stamps.map(function (s) { return document.getElementById(s.getAttribute("aria-describedby")); });
    var stub = root.querySelector(".m-travel-stub");
    var roll = root.querySelector(".m-travel-roll");

    function replay(el, cls) {
      el.classList.remove("is-thump", "is-press");
      void el.offsetWidth; // restart the animation
      el.classList.add(cls);
      clearTimeout(el._mtT);
      el._mtT = setTimeout(function () { el.classList.remove(cls); }, 1100);
    }

    /* ---- stamps: hover, focus or tap presses the stamp again and shows its note ---- */
    function show(i, thump) {
      stamps.forEach(function (s, k) {
        s.classList.toggle("is-active", k === i);
        if (notes[k]) notes[k].classList.toggle("is-shown", k === i);
      });
      root.classList.add("has-note");
      stamps[i].classList.add("is-on");
      if (thump && !reduce) replay(stamps[i], "is-press");
    }
    stamps.forEach(function (s, i) {
      s.addEventListener("pointerenter", function (ev) { if (ev.pointerType === "mouse") show(i, true); });
      s.addEventListener("focus", function () {
        var keyboard = false;
        try { keyboard = s.matches(":focus-visible"); } catch (e) { keyboard = false; }
        show(i, keyboard);
      });
      s.addEventListener("click", function () { show(i, true); });
      s.addEventListener("animationend", function (ev) {
        if (ev.pseudoElement === "::after") s.classList.remove("is-thump", "is-press");
      });
    });

    /* ---- stub: tap to tear it along the perforation, tap again to tuck it back ---- */
    if (stub) {
      stub.setAttribute("aria-expanded", reduce ? "true" : "false");
      stub.addEventListener("click", function () {
        var torn = root.classList.toggle("is-torn");
        stub.classList.remove("is-nudge");
        stub.setAttribute("aria-expanded", reduce || torn ? "true" : "false");
        if (torn && roll && !reduce) {
          roll.classList.remove("is-rolling");
          void roll.offsetWidth;
          roll.classList.add("is-rolling");
        }
      });
      stub.addEventListener("animationend", function (ev) {
        if (ev.animationName === "m-travel-nudge") stub.classList.remove("is-nudge");
      });
    }

    /* ---- entrance: the dashed path draws itself, the plane follows, each stamp lands as it passes ---- */
    function settle() {
      stamps.forEach(function (s) { s.classList.add("is-on"); });
      root.classList.add("is-go", "is-done");
    }

    function fly() {
      var skies = root.querySelectorAll(".m-travel-sky"), flies = root.querySelectorAll(".m-travel-fly");
      var k = -1, i;
      for (i = 0; i < skies.length; i++) {
        if (window.getComputedStyle(skies[i]).display !== "none") { k = i; break; }
      }
      var sky = skies[k], trail = sky && sky.querySelector(".m-travel-trail"), wipe = sky && sky.querySelector(".m-travel-wipe");
      var plane = flies[k] && flies[k].querySelector(".m-travel-plane");
      var vb = sky && sky.viewBox && sky.viewBox.baseVal;
      if (!trail || !wipe || !plane || !vb || !vb.width || !trail.getTotalLength || !route.offsetWidth) { settle(); return; }

      var total = trail.getTotalLength();
      var scale = vb.width / route.offsetWidth;
      var rest = plane.getAttribute("transform");

      // where along the path each stamp sits (nearest sampled point to its centre)
      var marks = stamps.map(function (s) {
        var li = s.parentNode, cx = li.offsetLeft * scale, cy = li.offsetTop * scale, best = 0, bestD = Infinity;
        for (var n = 0; n <= 240; n++) {
          var pt = trail.getPointAtLength(total * n / 240), d = (pt.x - cx) * (pt.x - cx) + (pt.y - cy) * (pt.y - cy);
          if (d < bestD) { bestD = d; best = n / 240; }
        }
        return best;
      });

      var dur = vb.width > 500 ? 3600 : 3000, t0 = null;
      root.classList.add("is-go");

      function place(p) {
        var len = total * p, a = trail.getPointAtLength(Math.max(0, len - 1)), b = trail.getPointAtLength(Math.min(total, len + 1));
        var pt = trail.getPointAtLength(len), deg = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
        plane.setAttribute("transform", "translate(" + pt.x.toFixed(2) + " " + pt.y.toFixed(2) + ") rotate(" + deg.toFixed(1) + ")");
        wipe.style.strokeDashoffset = (1 - p).toFixed(4);
      }

      function frame(now) {
        if (t0 === null) t0 = now;
        var t = Math.min(1, (now - t0) / dur);
        var p = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // ease in and out
        place(p);
        stamps.forEach(function (s, n) {
          if (p >= marks[n] - .012 && !s.classList.contains("is-on")) { s.classList.add("is-on"); replay(s, "is-thump"); }
        });
        if (t < 1) { window.requestAnimationFrame(frame); return; }
        wipe.style.strokeDashoffset = "";
        if (rest) plane.setAttribute("transform", rest);
        settle();
        if (stub && !root.classList.contains("is-torn")) stub.classList.add("is-nudge");
      }
      place(0);
      window.requestAnimationFrame(frame);
    }

    if (reduce || !("IntersectionObserver" in window) || !window.requestAnimationFrame || !route) {
      settle();
      root.classList.add("is-live");
      return;
    }

    var started = false;
    var seen = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting || started) return;
        started = true;
        seen.disconnect();
        fly();
      });
    }, { threshold: .55 });
    seen.observe(route);

    // looping motion (the swinging tag) only runs while the module is on screen
    var live = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { root.classList.toggle("is-live", en.isIntersecting); });
    }, { rootMargin: "40px 0px" });
    live.observe(root);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
