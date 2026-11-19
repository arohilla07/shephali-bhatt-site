// years: counts the figures up when they scroll into view, unfolds the ruler, and pulls a blue measure to the chosen pin.
(function () {
  "use strict";

  function init() {
    var root = document.querySelector(".m-years");
    if (!root) return;

    var reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    var canWatch = "IntersectionObserver" in window;
    var figList = root.querySelector(".m-years-figs");
    var figs = Array.prototype.slice.call(root.querySelectorAll(".m-years-fig"));
    var rail = root.querySelector(".m-years-rail");
    var track = root.querySelector(".m-years-track");
    var measure = root.querySelector(".m-years-measure");
    var stops = Array.prototype.slice.call(root.querySelectorAll(".m-years-stop"));

    /* ---------- the fourth figure is counted from the real shelf ---------- */
    var shelfFig = root.querySelector("[data-m-years-shelf]");
    if (shelfFig) {
      var count = document.querySelectorAll(".spine-item").length;
      if (count > 0) {
        var sn = shelfFig.querySelector(".m-years-n"), ss = shelfFig.querySelector(".sr-only");
        if (sn) { sn.setAttribute("data-to", String(count)); sn.textContent = String(count); }
        if (ss) ss.textContent = String(count);
      } else {
        shelfFig.hidden = true;
        figs = figs.filter(function (f) { return f !== shelfFig; });
        if (figList) figList.classList.add("m-years-three");
      }
    }

    /* ---------- figures ---------- */
    function paint(el, value, slots) {
      var s = String(value);
      if (el.__shown === s && el.__slots === slots) return;
      el.__shown = s; el.__slots = slots;
      if (!slots) { el.textContent = s; return; }
      var html = "";
      for (var i = 0; i < s.length; i++) html += '<span class="m-years-d">' + s.charAt(i) + "</span>";
      el.innerHTML = html;
    }
    function ease(t) { return t >= 1 ? 1 : 1 - Math.pow(1 - t, 4); }

    // The count runs in equal-width slots so nothing jitters; at the end the digits slide
    // together into their natural, kerned positions and the slots are swapped for plain text.
    function settle(el, to, fig) {
      var s = String(to), slots = el.children, probe = document.createElement("span");
      probe.className = "m-years-n";
      probe.style.cssText = "position:absolute;left:0;top:0;visibility:hidden;white-space:nowrap";
      el.parentNode.appendChild(probe);
      var edges = [0];
      for (var k = 1; k <= s.length; k++) { probe.textContent = s.slice(0, k); edges.push(probe.getBoundingClientRect().width); }
      el.parentNode.removeChild(probe);
      var base = el.getBoundingClientRect().left;
      for (var j = 0; j < slots.length && j < s.length; j++) {
        var r = slots[j].getBoundingClientRect(), nat = edges[j + 1] - edges[j];
        var dx = edges[j] - (r.left - base) - Math.max(0, (r.width - nat) / 2);
        slots[j].style.transform = "translateX(" + dx.toFixed(2) + "px)";
      }
      window.setTimeout(function () { paint(el, to, false); fig.classList.add("m-years-done"); }, 520);
    }

    function countUp(fig, delay) {
      var el = fig.querySelector(".m-years-n");
      var to = el ? parseInt(el.getAttribute("data-to"), 10) : NaN;
      if (!el || !(to > 0)) { fig.classList.add("m-years-done"); return; }
      var dur = 900 + Math.min(1300, to * 9), t0 = null;
      function frame(now) {
        if (t0 === null) t0 = now + delay;
        var t = (now - t0) / dur;
        if (t < 0) { requestAnimationFrame(frame); return; }
        if (t >= 1) { paint(el, to, true); settle(el, to, fig); return; }
        paint(el, Math.round(to * ease(t)), true);
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }

    function showFigures(animate) {
      figs.forEach(function (fig, i) {
        if (animate) {
          fig.style.setProperty("--d", (i * 110) + "ms");
          countUp(fig, i * 110 + 150);
        } else {
          fig.classList.add("m-years-done");
        }
        fig.classList.add("m-years-in");
      });
    }

    /* ---------- the measure ---------- */
    var nowIndex = 0, pressed = -1, preview = -1, revealed = -1;
    stops.forEach(function (s, i) { if (s.hasAttribute("data-m-years-now")) nowIndex = i; });

    function drawMeasure() {
      if (!measure || !track) return;
      var want = preview >= 0 ? preview : (pressed >= 0 ? pressed : nowIndex);
      var idx = Math.min(want, revealed);
      stops.forEach(function (s, i) {
        s.classList.toggle("m-years-tip", i === idx && idx >= 0);
        s.classList.toggle("m-years-at", i === idx && idx >= 0 && idx === want);
      });
      if (idx < 0) { measure.style.transform = "scaleX(0)"; track.classList.remove("m-years-measuring"); return; }
      var pin = stops[idx].querySelector(".m-years-pin");
      var tr = track.getBoundingClientRect(), pr = (pin || stops[idx]).getBoundingClientRect();
      var p = tr.width > 0 ? (pr.left + pr.width / 2 - tr.left) / tr.width : 0;
      measure.style.transform = "scaleX(" + Math.max(0, Math.min(1, p)).toFixed(4) + ")";
      track.classList.add("m-years-measuring");
    }

    function reveal(batch, animate) {
      batch.sort(function (a, b) { return stops.indexOf(a) - stops.indexOf(b); });
      var last = 0;
      batch.forEach(function (s, i) {
        var d = animate ? i * 150 : 0;
        last = d;
        if (animate) s.style.setProperty("--d", d + "ms");
        s.classList.add("m-years-in");
      });
      var settle = function () {
        batch.forEach(function (s) {
          s.style.removeProperty("--d");
          revealed = Math.max(revealed, stops.indexOf(s));
        });
        root.classList.add("m-years-ready");
        drawMeasure();
      };
      if (animate) window.setTimeout(settle, last + 900); else settle();
    }

    stops.forEach(function (s, i) {
      var btn = s.querySelector(".m-years-pinbtn");
      if (!btn) return;
      btn.addEventListener("click", function () {
        pressed = pressed === i ? -1 : i;
        stops.forEach(function (o, j) {
          var b = o.querySelector(".m-years-pinbtn");
          o.classList.toggle("m-years-on", j === pressed);
          if (b) b.setAttribute("aria-pressed", j === pressed ? "true" : "false");
        });
        drawMeasure();
      });
      btn.addEventListener("pointerenter", function (ev) {
        if (ev.pointerType && ev.pointerType !== "mouse") return;
        preview = i; drawMeasure();
      });
      btn.addEventListener("pointerleave", function () { if (preview === i) { preview = -1; drawMeasure(); } });
      btn.addEventListener("focus", function () {
        var kb = true;
        try { kb = btn.matches(":focus-visible"); } catch (e) {}
        if (kb) { preview = i; drawMeasure(); }
      });
      btn.addEventListener("blur", function () { if (preview === i) { preview = -1; drawMeasure(); } });
    });

    if (rail) {
      var edge = function () { rail.classList.toggle("m-years-end", rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 6); };
      rail.addEventListener("scroll", edge, { passive: true });
      edge();
    }
    var resizeQueued = false;
    window.addEventListener("resize", function () {
      if (resizeQueued) return;
      resizeQueued = true;
      requestAnimationFrame(function () {
        resizeQueued = false;
        if (rail) rail.classList.toggle("m-years-end", rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 6);
        drawMeasure();
      });
    });

    /* ---------- entrances ---------- */
    if (reduce || !canWatch) {
      showFigures(false);
      reveal(stops.slice(), false);
      return;
    }

    figs.forEach(function (fig) {
      var el = fig.querySelector(".m-years-n");
      if (el) paint(el, 0, true);
    });
    if (figList) {
      var figIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          figIO.disconnect();
          showFigures(true);
        });
      }, { rootMargin: "0px 0px -10% 0px", threshold: 0.2 });
      figIO.observe(figList);
    } else {
      showFigures(false);
    }

    var stopIO = new IntersectionObserver(function (entries) {
      var batch = [];
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        stopIO.unobserve(en.target);
        batch.push(en.target);
      });
      if (batch.length) reveal(batch, true);
    }, { rootMargin: "0px 0px -14% 0px", threshold: 0.01 });
    stops.forEach(function (s) { stopIO.observe(s); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
