// motion: site-wide polish (ticker, tape-measure progress, hero life, drawn headings, micro-interactions).
// Layers on top of the base page; touches nothing when its ticker root is missing.
(function () {
  "use strict";
  var win = window, doc = document, root = doc.documentElement;
  var mm = function (q) { return !!(win.matchMedia && win.matchMedia(q).matches); };
  var reduce = mm("(prefers-reduced-motion: reduce)");
  var fine = mm("(hover: hover) and (pointer: fine)");
  var now = function () { return win.performance && performance.now ? performance.now() : 0; };

  // Set straight away (this script sits in <head>) so entrance states apply before first paint.
  root.classList.add("m-motion-on");

  function safe(fn) { try { fn(); } catch (e) { /* one effect failing must not stop the rest */ } }
  function make(tag, cls) { var n = doc.createElement(tag); if (cls) n.className = cls; return n; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function init() {
    var ticker = doc.querySelector(".m-motion-ticker");
    if (!ticker) { root.classList.remove("m-motion-on"); return; }

    // ---------------------------------------------------------------- shared state for the one rAF loop
    var raf = 0, scrollDirty = true, sizeDirty = true, moved = false;
    var vw = 1, vh = 1, maxScroll = 0, sy = 0;
    var px = 0, py = 0, ptarget = null;
    var heroVisible = true, heroH = 1;
    var tape = null, layers = [], touchLayers = [];
    var par = { x: 0, y: 0, tx: 0, ty: 0 };
    var springs = [];
    function request() { if (!raf) raf = win.requestAnimationFrame(frame); }

    // ---------------------------------------------------------------- 1. ticker
    safe(function () {
      if (reduce) return; // stays static and wrapped
      var track = ticker.querySelector(".m-motion-ticker-track");
      var first = ticker.querySelector(".m-motion-ticker-list");
      var btn = ticker.querySelector(".m-motion-ticker-toggle");
      if (!track || !first) return;
      ticker.classList.add("m-motion-run");
      var userPaused = false;
      function fill() { // each half of the track must be at least as wide as the band
        var w = first.getBoundingClientRect().width, view = ticker.getBoundingClientRect().width;
        if (!w) return;
        var perHalf = Math.max(1, Math.ceil(view / w)), have = track.children.length;
        for (var i = have; i < perHalf * 2; i++) {
          var c = first.cloneNode(true);
          c.setAttribute("aria-hidden", "true");
          track.appendChild(c);
        }
        var half = (track.children.length / 2) * w;
        track.style.setProperty("--m-motion-dur", Math.round(half / 36) + "s"); // about 36px a second
      }
      fill();
      var rt = 0;
      win.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(fill, 200); }, { passive: true });
      if (doc.fonts && doc.fonts.ready && doc.fonts.ready.then) doc.fonts.ready.then(fill, function () {});
      if (btn) {
        btn.hidden = false;
        var sync = function () {
          btn.setAttribute("aria-pressed", String(userPaused));
          btn.setAttribute("aria-label", userPaused ? "Play the scrolling list of topics" : "Pause the scrolling list of topics");
          ticker.classList.toggle("m-motion-paused", userPaused);
        };
        btn.addEventListener("click", function () {
          userPaused = !userPaused;
          if (!userPaused) ticker.classList.remove("m-motion-focus");
          sync();
        });
        // keyboard focus holds the band still so it can be read
        btn.addEventListener("focus", function () {
          var kb = true;
          try { kb = btn.matches(":focus-visible"); } catch (e) {}
          if (kb) ticker.classList.add("m-motion-focus");
        });
        btn.addEventListener("blur", function () { ticker.classList.remove("m-motion-focus"); });
      }
    });

    // ---------------------------------------------------------------- 2. tape measure under the header
    safe(function () {
      var header = doc.querySelector(".site-header");
      if (!header) return;
      tape = make("div", "m-motion-tape");
      tape.setAttribute("aria-hidden", "true");
      tape.innerHTML = '<span class="m-motion-tape-track"></span><span class="m-motion-tape-fill"><span class="m-motion-tape-ticks"></span></span><span class="m-motion-tape-end"></span>';
      header.appendChild(tape);
    });

    // ---------------------------------------------------------------- 3 + 4. hero
    var hero = doc.querySelector(".hero");
    safe(function () { // name: letters rise in, then the plain text is put back
      var h = doc.querySelector("h1.hero-name");
      if (!h) return;
      try {
        var text = (h.textContent || "").replace(/\s+/g, " ").trim();
        if (reduce || h.children.length || !text || now() > 2000) return;
        // Where each letter sits in the plain heading, so the split copy can keep the font's kerning.
        var tn = h.firstChild, plain = null, k;
        if (h.childNodes.length === 1 && tn.nodeType === 3 && tn.data === text && doc.createRange && Array.from(text).length === text.length) {
          var rg = doc.createRange();
          plain = [];
          for (k = 0; k < text.length; k++) { rg.setStart(tn, k); rg.setEnd(tn, k + 1); plain.push(rg.getBoundingClientRect().left); }
        }
        var wrap = make("span"), chars = [], at = 0;
        wrap.setAttribute("aria-hidden", "true");
        text.split(" ").forEach(function (word, wi) {
          if (wi) { wrap.appendChild(doc.createTextNode(" ")); at++; }
          var w = make("span", "m-motion-word");
          Array.from(word).forEach(function (ch) {
            var c = make("span", "m-motion-ch");
            c.textContent = ch;
            c.style.setProperty("--m-motion-i", chars.length);
            chars.push({ el: c, at: at++, word: wi });
            w.appendChild(c);
          });
          wrap.appendChild(w);
        });
        h.setAttribute("aria-label", text);
        h.textContent = "";
        h.appendChild(wrap);
        if (plain) { // measured before .m-motion-split starts the letters moving
          var fs = parseFloat(win.getComputedStyle(h).fontSize) || 16;
          var lefts = chars.map(function (c) { return c.el.getBoundingClientRect().left; });
          for (k = 1; k < chars.length; k++) {
            if (chars[k].word !== chars[k - 1].word) continue;
            var d = (plain[chars[k].at] - plain[chars[k - 1].at]) - (lefts[k] - lefts[k - 1]);
            if (Math.abs(d) > .05 && Math.abs(d) < fs * .2) chars[k].el.style.marginLeft = (d / fs).toFixed(4) + "em";
          }
        }
        setTimeout(function () {
          h.textContent = text;
          h.removeAttribute("aria-label");
        }, 100 + chars.length * 38 + 850 + 250);
      } finally {
        h.classList.add("m-motion-split");
      }
    });
    safe(function () { // tagline: its last two words get a hand-drawn underline
      var tag = doc.querySelector(".hero .hero-tagline");
      if (!tag || tag.children.length) return;
      var words = (tag.textContent || "").trim().split(/\s+/);
      if (words.length < 4) return;
      var tail = words.splice(-2).join(" ");
      var s = make("span", "m-motion-ul");
      s.textContent = tail;
      s.insertAdjacentHTML("beforeend",
        '<svg class="m-motion-ul-svg" viewBox="0 0 120 8" preserveAspectRatio="none" aria-hidden="true" focusable="false">' +
        '<path pathLength="1" d="M2 5.2C14 2.6 25 6.6 39 4.6S66 2.4 80 4.4s26 1.6 38-.8"/></svg>');
      tag.textContent = words.join(" ") + " ";
      tag.appendChild(s);
    });
    safe(function () { // dust in the lamp light
      var stage = hero && hero.querySelector(".stage");
      if (!stage || reduce) return;
      var box = make("div", "m-motion-motes");
      box.setAttribute("aria-hidden", "true");
      //            x    y   size  secs delay  dx   dy
      var motes = [[22, 62, 5, 13, 3.6, 26, -58], [58, 70, 4, 16, 5.2, -22, -64], [74, 48, 6, 18, 4.4, 18, -40],
                   [38, 40, 3, 12, 7.5, -14, -34], [86, 74, 4, 15, 9.0, -30, -52], [10, 44, 4, 17, 11.5, 22, -30]];
      motes.forEach(function (m) {
        var d = make("i");
        d.style.cssText = "--x:" + m[0] + "%;--y:" + m[1] + "%;--s:" + m[2] + "px;--t:" + m[3] + "s;--d:" + m[4] + "s;--dx:" + m[5] + "px;--dy:" + m[6] + "px";
        box.appendChild(d);
      });
      stage.appendChild(box);
      if (fine) layers.push({ el: box, dx: 12, dy: 6 });
    });
    safe(function () { // depth layers for the shelf scene (the birch boards and the photo frame stay put)
      if (!hero || reduce) return;
      var pick = function (sel) { return hero.querySelector(sel); };
      var add = function (list, sel, dx, dy) { var n = pick(sel); if (n) list.push({ el: n, dx: dx, dy: dy }); };
      if (fine) {
        add(layers, ".scene-wall", -5, 0);
        add(layers, "#hero-books", 3, 0);
        add(layers, "#hero-objects", 4, 0);
        add(layers, "#hero-frame", 4, 0);
        add(layers, "#hero-lamp", 6, 0);
        add(layers, "#hero-plant", 7, 0);
        add(layers, "#hero-lamp-glow", 10, 4);
      } else {
        add(touchLayers, ".scene-wall", 0, 12);
        add(touchLayers, "#hero-lamp-glow", 0, 7);
      }
    });

    // ---------------------------------------------------------------- 5. step headings: prepare the strokes
    safe(function () {
      if (reduce) return;
      doc.querySelectorAll(".step-head .step-icon svg").forEach(function (svg) {
        var i = 0;
        svg.querySelectorAll("path, rect, circle, ellipse, line, polyline, polygon").forEach(function (s) {
          var len = 0;
          if (!s.hasAttribute("stroke-dasharray") && typeof s.getTotalLength === "function") {
            try { len = s.getTotalLength(); } catch (e) { len = 0; }
          }
          if (!len || !isFinite(len)) { s.classList.add("m-motion-fade"); return; }
          len = Math.ceil(len) + 1;
          s.style.setProperty("--m-motion-l", len);
          s.style.setProperty("--m-motion-g", len + 6);
          s.style.setProperty("--m-motion-i", i++);
          s.classList.add("m-motion-draw");
        });
      });
    });

    // ---------------------------------------------------------------- 6. podcast rows: equaliser
    safe(function () {
      var bars = [[.45, .62, 0], [.9, .5, -.2], [.6, .7, -.45], [.3, .56, -.1]]; // rest height, seconds, delay
      doc.querySelectorAll(".pod-list .pod").forEach(function (p) {
        var host = p.querySelector(".pod-show");
        if (!host || host.querySelector(".m-motion-eq")) return;
        var eq = make("span", "m-motion-eq");
        eq.setAttribute("aria-hidden", "true");
        bars.forEach(function (b) {
          var bar = make("i");
          bar.style.cssText = "--h:" + b[0] + ";--t:" + b[1] + "s;--d:" + b[2] + "s";
          eq.appendChild(bar);
        });
        host.appendChild(eq);
      });
    });

    // ---------------------------------------------------------------- 7. footer: paper plane
    var plane = null;
    safe(function () {
      var footer = doc.querySelector(".site-footer");
      if (!footer) return;
      var trail = "M3 36C20 41 36 36 47 28C59 19 58 7 50 7C42 7 41 20 52 26C66 33 86 30 102 21";
      footer.insertAdjacentHTML("beforeend",
        '<svg class="m-motion-plane" viewBox="0 0 150 48" aria-hidden="true" focusable="false">' +
        '<defs><mask id="m-motion-plane-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="150" height="48">' +
        '<path class="m-motion-plane-reveal" pathLength="1" d="' + trail + '" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/></mask></defs>' +
        '<path d="' + trail + '" mask="url(#m-motion-plane-mask)" fill="none" stroke="#18203a" stroke-opacity=".45" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="2 5.5"/>' +
        '<g class="m-motion-plane-body" fill="none" stroke="#18203a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<path class="m-motion-plane-fill" d="M108 17L146 5L130 38L123 25Z" fill="#f6e7a8" stroke="none"/>' +
        '<path class="m-motion-plane-line" pathLength="1" d="M108 17L146 5L130 38L123 25Z"/>' +
        '<path class="m-motion-plane-line" pathLength="1" d="M123 25L146 5M123 25L122 35L127 30"/>' +
        "</g></svg>");
      plane = footer.querySelector(".m-motion-plane");
    });

    // ---------------------------------------------------------------- visibility: pause what is off screen, draw the plane once
    safe(function () {
      var footer = doc.querySelector(".site-footer");
      if (!("IntersectionObserver" in win)) { if (plane) plane.classList.add("m-motion-seen"); return; }
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.target === hero) {
            heroVisible = en.isIntersecting;
            hero.classList.toggle("m-motion-hero-off", !heroVisible);
            if (!heroVisible) { par.tx = 0; par.ty = 0; }
            request();
          } else if (en.target === ticker) {
            ticker.classList.toggle("m-motion-off", !en.isIntersecting);
          } else if (en.isIntersecting && plane) {
            plane.classList.add("m-motion-seen");
            io.unobserve(en.target);
          }
        });
      }, { threshold: 0.01 });
      if (hero) io.observe(hero);
      io.observe(ticker);
      if (footer && plane) io.observe(footer);
    });

    // ---------------------------------------------------------------- the one rAF loop: scroll progress, parallax, magnets, tilt
    function springFor(el, kind) {
      for (var i = 0; i < springs.length; i++) if (springs[i].el === el && springs[i].kind === kind) return springs[i];
      var s = { el: el, kind: kind, x: 0, y: 0, tx: 0, ty: 0 };
      springs.push(s);
      return s;
    }
    function frame() {
      raf = 0;
      var again = false, i, s;

      // ---- read
      if (sizeDirty) {
        vw = win.innerWidth || 1; vh = win.innerHeight || 1;
        maxScroll = Math.max(0, root.scrollHeight - vh);
        if (hero) heroH = hero.offsetHeight || 1;
        sizeDirty = false; scrollDirty = true;
      }
      if (scrollDirty) sy = win.pageYOffset || 0;
      var btn = null, card = null, br = null, cr = null;
      if (moved) {
        var t = ptarget && ptarget.closest ? ptarget : null;
        btn = t && t.closest(".btn");
        card = t && t.closest(".product");
        if (btn) br = btn.getBoundingClientRect();
        if (card) cr = card.getBoundingClientRect();
      }

      // ---- write
      if (scrollDirty) {
        scrollDirty = false;
        if (tape) tape.style.setProperty("--m-motion-p", (maxScroll ? clamp(sy / maxScroll, 0, 1) : 0).toFixed(4));
        if (touchLayers.length && sy < heroH) {
          var p = clamp(sy / heroH, 0, 1);
          for (i = 0; i < touchLayers.length; i++) touchLayers[i].el.style.translate = "0px " + (p * touchLayers[i].dy).toFixed(1) + "px";
        }
      }
      if (moved) {
        moved = false;
        for (i = 0; i < springs.length; i++) { springs[i].tx = 0; springs[i].ty = 0; }
        if (btn && br) {
          s = springFor(btn, "pull");
          s.tx = clamp((px - (br.left - s.x + br.width / 2)) * .22, -6, 6);
          s.ty = clamp((py - (br.top - s.y + br.height / 2)) * .3, -4, 4);
        }
        if (card && cr && cr.width && cr.height) {
          s = springFor(card, "tilt");
          s.tx = clamp((py - cr.top) / cr.height - .5, -.5, .5) * -4.4; // degrees about the x axis
          s.ty = clamp((px - cr.left) / cr.width - .5, -.5, .5) * 4.4;  // degrees about the y axis
        }
        if (layers.length && heroVisible) { par.tx = clamp(px / vw * 2 - 1, -1, 1); par.ty = clamp(py / vh * 2 - 1, -1, 1); }
      }
      for (i = springs.length - 1; i >= 0; i--) {
        s = springs[i];
        s.x += (s.tx - s.x) * .16; s.y += (s.ty - s.y) * .16;
        var rest = Math.abs(s.tx - s.x) < .02 && Math.abs(s.ty - s.y) < .02;
        if (rest && !s.tx && !s.ty) {
          if (s.kind === "pull") s.el.style.translate = ""; else s.el.style.rotate = "";
          springs.splice(i, 1);
          continue;
        }
        if (s.kind === "pull") s.el.style.translate = s.x.toFixed(2) + "px " + s.y.toFixed(2) + "px";
        else {
          var ang = Math.sqrt(s.x * s.x + s.y * s.y) || .0001;
          s.el.style.rotate = (s.x / ang).toFixed(3) + " " + (s.y / ang).toFixed(3) + " 0 " + ang.toFixed(3) + "deg";
        }
        if (!rest) again = true;
      }
      if (layers.length) {
        var ddx = par.tx - par.x, ddy = par.ty - par.y;
        if (Math.abs(ddx) > .002 || Math.abs(ddy) > .002) {
          par.x += ddx * .07; par.y += ddy * .07;
          for (i = 0; i < layers.length; i++) {
            layers[i].el.style.translate = (par.x * layers[i].dx).toFixed(2) + "px " + (par.y * layers[i].dy).toFixed(2) + "px";
          }
          again = true;
        }
      }
      if (again) request();
    }

    win.addEventListener("scroll", function () { scrollDirty = true; request(); }, { passive: true });
    win.addEventListener("resize", function () { sizeDirty = true; request(); }, { passive: true });
    win.addEventListener("load", function () { sizeDirty = true; request(); });
    if ("ResizeObserver" in win && doc.body) { // the page grows as images and fonts arrive
      safe(function () { new ResizeObserver(function () { sizeDirty = true; request(); }).observe(doc.body); });
    }
    if (fine && !reduce) {
      win.addEventListener("pointermove", function (ev) {
        if (ev.pointerType && ev.pointerType !== "mouse") return;
        px = ev.clientX; py = ev.clientY; ptarget = ev.target; moved = true;
        request();
      }, { passive: true });
      root.addEventListener("pointerleave", function () { // pointer left the window: let everything settle
        ptarget = null; moved = true; par.tx = 0; par.ty = 0;
        px = vw / 2; py = vh / 2;
        request();
      }, { passive: true });
    }
    request();
  }

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init);
  else init();
})();
