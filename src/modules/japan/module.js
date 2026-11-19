// Japan corner: a koto you can pluck or strum, and a sheet of washi that lifts. No dependencies.
(function () {
  "use strict";

  var doc = document;
  var slice = function (list) { return Array.prototype.slice.call(list); };
  var clamp = function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; };
  var nowMs = function () { return window.performance && performance.now ? performance.now() : Date.now(); };

  function init() {
    var root = doc.querySelector(".m-japan");
    if (!root) return;
    var mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    var reduced = function () { return !!(mq && mq.matches); };
    try { koto(root, reduced); } catch (e) { /* the drawing stays as it is */ }
    try { washi(root, reduced); } catch (e) { /* the sheet stays lifted */ }
  }

  /* ------------------------------------------------------------------ koto */
  function koto(root, reduced) {
    var stage = root.querySelector(".m-japan-koto-stage");
    if (!stage) return;
    var svg = stage.querySelector("svg");
    var pad = stage.querySelector(".m-japan-keys");
    var keys = slice(stage.querySelectorAll(".m-japan-key"));
    var groups = slice(stage.querySelectorAll(".m-japan-string"));
    var soundBtn = stage.querySelector(".m-japan-sound");
    if (!svg || !pad || !keys.length || keys.length !== groups.length) return;

    var vb = svg.viewBox.baseVal;
    var VW = vb && vb.width ? vb.width : 420, VH = vb && vb.height ? vb.height : 340;
    var COUNT = groups.length;
    var xy = function (g, name) { var p = g.getAttribute("data-" + name).split(" "); return [parseFloat(p[0]), parseFloat(p[1])]; };

    var strings = groups.map(function (g, i) {
      var n = xy(g, "n"), b = xy(g, "b"), f = xy(g, "f"), h = xy(g, "h");
      var dx = b[0] - n[0], dy = b[1] - n[1], len = Math.sqrt(dx * dx + dy * dy) || 1;
      var line = g.querySelector(".m-japan-line");
      var k = i / (COUNT - 1);
      return {
        g: g, line: line, blur: g.querySelector(".m-japan-blur"), rest: line.getAttribute("d"),
        n: n, b: b, f: f, h: h, nx: -dy / len, ny: dx / len,
        mx: (n[0] + b[0]) / 2, my: (n[1] + b[1]) / 2,
        dur: 900 - 280 * k, wobble: 9 + 6 * k, size: 6.4 - 2.6 * k,
        live: false, t0: 0, amp: 0, dir: 1, last: -1e9, flash: 0
      };
    });

    /* ---- drawing a vibrating string ---- */
    var raf = 0;
    var fx = function (v) { return v.toFixed(1); };

    function settle(s) {
      s.live = false;
      s.line.setAttribute("d", s.rest);
      s.blur.setAttribute("d", "M0 0");
      s.blur.style.opacity = "";
      s.g.classList.remove("is-live");
    }

    function frame(t) {
      var busy = false;
      for (var i = 0; i < COUNT; i++) {
        var s = strings[i];
        if (!s.live) continue;
        var age = t - s.t0;
        if (age < 0) age = 0;
        if (age >= s.dur) { settle(s); continue; }
        busy = true;
        var p = age / s.dur;
        var env = s.amp * Math.exp(-3.2 * p) * (1 - p);
        var a = env * Math.cos(2 * Math.PI * s.wobble * age / 1000) * s.dir;
        var cx = s.mx + s.nx * 2 * a, cy = s.my + s.ny * 2 * a;
        s.line.setAttribute("d", "M" + fx(s.h[0]) + " " + fx(s.h[1]) + "L" + fx(s.n[0]) + " " + fx(s.n[1]) +
          "Q" + fx(cx) + " " + fx(cy) + " " + fx(s.b[0]) + " " + fx(s.b[1]) + "L" + fx(s.f[0]) + " " + fx(s.f[1]));
        var ex = s.nx * 2 * env, ey = s.ny * 2 * env;
        s.blur.setAttribute("d", "M" + fx(s.n[0]) + " " + fx(s.n[1]) +
          "Q" + fx(s.mx + ex) + " " + fx(s.my + ey) + " " + fx(s.b[0]) + " " + fx(s.b[1]) +
          "Q" + fx(s.mx - ex) + " " + fx(s.my - ey) + " " + fx(s.n[0]) + " " + fx(s.n[1]) + "Z");
        s.blur.style.opacity = (0.2 * (1 - p)).toFixed(3);
      }
      raf = busy ? window.requestAnimationFrame(frame) : 0;
    }

    function vibrate(i, vel, dir) {
      var s = strings[i];
      if (reduced() || !window.requestAnimationFrame) {
        // brief flash instead of movement
        s.g.classList.add("is-flash");
        window.clearTimeout(s.flash);
        s.flash = window.setTimeout(function () { s.g.classList.remove("is-flash"); }, 90);
        return;
      }
      s.live = true;
      s.t0 = nowMs();
      s.amp = s.size * (0.45 + 0.55 * vel);
      s.dir = dir || (i % 2 ? -1 : 1);
      s.g.classList.add("is-live");
      if (!raf) raf = window.requestAnimationFrame(frame);
    }

    /* ---- sound: Karplus-Strong plucks, made on the spot ---- */
    var AC = window.AudioContext || window.webkitAudioContext;
    var ctx = null, master = null, soundOn = true;
    var VOLUME = 0.2;
    // D G A B-flat D E-flat G A B-flat D E-flat G A, low to high (hirajoshi)
    var MIDI = [50, 55, 57, 58, 62, 63, 67, 69, 70, 74, 75, 79, 81];
    var buffers = [], voices = [], queue = [];

    function makeContext() {
      if (ctx || !AC) return;
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = soundOn ? VOLUME : 0;
        var soften = ctx.createBiquadFilter();
        soften.type = "lowpass"; soften.frequency.value = 5200; soften.Q.value = 0.4;
        master.connect(soften);
        if (ctx.createDynamicsCompressor) {
          var limit = ctx.createDynamicsCompressor();
          soften.connect(limit); limit.connect(ctx.destination);
        } else {
          soften.connect(ctx.destination);
        }
        ctx.onstatechange = flush;
      } catch (e) { ctx = null; master = null; AC = null; }
    }

    function buildPluck(i) {
      var freq = 440 * Math.pow(2, (MIDI[i] - 69) / 12);
      var k = i / (COUNT - 1);
      var sr = ctx.sampleRate;
      var t60 = 2.3 - 0.9 * k;
      var len = Math.floor(sr * (t60 + 0.1));
      var buf = ctx.createBuffer(1, len, sr);
      var out = buf.getChannelData(0);
      // loop delay = N samples + half a sample (averaging) + d samples (all-pass, for fine tuning)
      var D = sr / freq;
      var N = Math.floor(D - 0.55);
      var d = D - 0.5 - N;
      var C = (1 - d) / (1 + d);
      var rho = Math.pow(0.001, 1 / (freq * t60));
      var line = new Float32Array(N);
      var soft = 0.3 + 0.3 * k, prev = 0, mean = 0, j;
      for (j = 0; j < N; j++) { prev += soft * ((Math.random() * 2 - 1) - prev); line[j] = prev; mean += prev; }
      mean /= N;
      var peak = 1e-6;
      for (j = 0; j < N; j++) { line[j] -= mean; if (Math.abs(line[j]) > peak) peak = Math.abs(line[j]); }
      for (j = 0; j < N; j++) line[j] /= peak;
      var idx = 0, lpPrev = 0, apIn = 0, apOut = 0;
      var attack = Math.floor(sr * 0.003), tail = Math.floor(sr * 0.08);
      for (j = 0; j < len; j++) {
        var x = line[idx];
        var lp = 0.5 * (x + lpPrev); lpPrev = x;
        var y = C * lp + apIn - C * apOut; apIn = lp; apOut = y;
        line[idx] = y * rho;
        idx++; if (idx === N) idx = 0;
        var gain = j < attack ? j / attack : (j > len - tail ? (len - j) / tail : 1);
        out[j] = x * gain * 0.9;
      }
      return buf;
    }

    function play(i, vel, when) {
      try {
        var buf = buffers[i] || (buffers[i] = buildPluck(i));
        var src = ctx.createBufferSource();
        var g = ctx.createGain();
        src.buffer = buf;
        g.gain.value = 0.3 + 0.5 * vel;
        src.connect(g); g.connect(master);
        var old = voices[i];
        if (old) {
          // the same string, plucked again: the old ring stops
          try { old.g.gain.setTargetAtTime(0, when, 0.02); old.src.stop(when + 0.2); } catch (e) { /* already ended */ }
        }
        voices[i] = { src: src, g: g };
        src.onended = function () {
          if (voices[i] && voices[i].src === src) voices[i] = null;
          try { g.disconnect(); } catch (e) { /* nothing to do */ }
        };
        src.start(when);
      } catch (e) { /* stay silent, the string still moves */ }
    }

    function flush() {
      if (!ctx || ctx.state !== "running" || !queue.length) return;
      var items = queue; queue = [];
      var t = nowMs(), first = -1, base = ctx.currentTime + 0.01;
      for (var q = 0; q < items.length; q++) {
        if (t - items[q].t > 450) continue; // too old to still feel like the same pluck
        if (first < 0) first = items[q].t;
        if (soundOn) play(items[q].i, items[q].vel, base + (items[q].t - first) / 1000);
      }
    }

    function unlock() {
      if (!ctx || ctx.state === "running" || !ctx.resume) return;
      try {
        var p = ctx.resume();
        if (p && p.then) p.then(flush, function () { /* still locked */ });
      } catch (e) { /* still locked */ }
    }

    function sound(i, vel, gesture) {
      if (!soundOn || !AC) return;
      if (!ctx) {
        if (!gesture) return; // never start audio from a hover
        makeContext();
        if (!ctx) return;
      }
      if (ctx.state === "running") { play(i, vel, ctx.currentTime); return; }
      if (!gesture) return;
      queue.push({ i: i, vel: vel, t: nowMs() });
      if (queue.length > 16) queue.shift();
      unlock();
    }

    function pluck(i, vel, dir, gesture) {
      var s = strings[i], t = nowMs();
      if (t - s.last < 70) return;
      s.last = t;
      vibrate(i, vel, dir);
      sound(i, vel, gesture);
    }

    /* ---- pointer: click, tap, or slide across to strum ---- */
    var yTop = strings[0].f[1] - 8, yBottom = strings[0].h[1] + 16;
    var first = strings[0], lastS = strings[COUNT - 1];
    var xAt = function (s, y) { var t = (y - s.h[1]) / (s.f[1] - s.h[1]); return s.h[0] + (s.f[0] - s.h[0]) * t; };

    // where the pointer is, measured in strings: 0 is string 1, 12 is string 13
    function locate(ev) {
      var r = svg.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      var x = (ev.clientX - r.left) / r.width * VW, y = (ev.clientY - r.top) / r.height * VH;
      if (y < yTop || y > yBottom) return null;
      var a = xAt(first, y), b = xAt(lastS, y);
      var pos = (x - a) / (b - a) * (COUNT - 1);
      if (pos < -0.7 || pos > COUNT - 1 + 0.7) return null;
      return pos;
    }

    var current = 0, track = null, held = false, lastPointer = -1e9;

    function setCurrent(i, focus) {
      current = i;
      for (var k = 0; k < COUNT; k++) keys[k].tabIndex = k === i ? 0 : -1;
      if (focus) { try { keys[i].focus({ preventScroll: true }); } catch (e) { keys[i].focus(); } }
    }

    pad.addEventListener("pointerdown", function (ev) {
      if (ev.pointerType === "mouse" && ev.button !== 0) return;
      lastPointer = nowMs();
      var pos = locate(ev);
      if (pos === null) { track = null; return; }
      ev.preventDefault();
      held = true;
      var i = clamp(Math.round(pos), 0, COUNT - 1);
      setCurrent(i, true);
      pluck(i, 1, 0, true);
      track = { pos: pos, x: ev.clientX, y: ev.clientY, t: ev.timeStamp };
      if (ev.pointerType === "mouse" && pad.setPointerCapture) { try { pad.setPointerCapture(ev.pointerId); } catch (e) { /* fine */ } }
    });

    pad.addEventListener("pointermove", function (ev) {
      var mouse = ev.pointerType === "mouse";
      if (!mouse && !held) return;
      var pos = locate(ev);
      if (pos === null) { track = null; return; }
      // only a real, continuous movement counts; a page scrolling under a still cursor does not
      if (track && ev.timeStamp - track.t < 180 && (ev.clientX !== track.x || ev.clientY !== track.y) && pos !== track.pos) {
        var from = track.pos, dir = pos > from ? 1 : -1;
        var speed = Math.abs(pos - from) / Math.max(1, ev.timeStamp - track.t);
        var vel = clamp(0.4 + speed * 45, 0.4, 1);
        var i = dir > 0 ? Math.floor(from) + 1 : Math.ceil(from) - 1;
        var hit = -1;
        while (dir > 0 ? i <= pos : i >= pos) {
          if (i >= 0 && i < COUNT) { pluck(i, vel, dir, held); hit = i; }
          i += dir;
        }
        if (hit >= 0 && held) setCurrent(hit, false);
      }
      track = { pos: pos, x: ev.clientX, y: ev.clientY, t: ev.timeStamp };
    });

    var release = function (ev) {
      lastPointer = nowMs();
      if (held && keys[current] !== doc.activeElement && pad.contains(doc.activeElement)) setCurrent(current, true);
      held = false;
      if (ev.pointerType !== "mouse") track = null;
      unlock(); // touch only counts as a gesture once the finger lifts
    };
    pad.addEventListener("pointerup", release);
    pad.addEventListener("pointercancel", function (ev) { held = false; if (ev.pointerType !== "mouse") track = null; });
    pad.addEventListener("pointerleave", function (ev) { if (ev.pointerType === "mouse" && !held) track = null; });
    pad.addEventListener("dragstart", function (ev) { ev.preventDefault(); });

    // keyboard and assistive technology arrive as plain clicks
    pad.addEventListener("click", function (ev) {
      var key = ev.target.closest ? ev.target.closest(".m-japan-key") : null;
      if (!key) return;
      if (ev.detail !== 0 && nowMs() - lastPointer < 700) return; // the pointer handlers already plucked
      var i = keys.indexOf(key);
      if (i < 0) return;
      setCurrent(i, false);
      pluck(i, 1, 0, true);
      unlock();
    });

    pad.addEventListener("keydown", function (ev) {
      if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
      var i = keys.indexOf(doc.activeElement);
      if (i < 0) return;
      var next = -1;
      if (ev.key === "ArrowRight") next = Math.min(COUNT - 1, i + 1);
      else if (ev.key === "ArrowLeft") next = Math.max(0, i - 1);
      else if (ev.key === "Home") next = 0;
      else if (ev.key === "End") next = COUNT - 1;
      if (next >= 0) { ev.preventDefault(); setCurrent(next, true); return; }
      if (ev.key.length === 1 && ev.key >= "1" && ev.key <= "9" && !ev.repeat) {
        var n = parseInt(ev.key, 10) - 1;
        if (n < COUNT) { ev.preventDefault(); setCurrent(n, true); pluck(n, 1, 0, true); unlock(); }
      }
    });

    // show which string has keyboard focus on the drawing itself
    var marked = -1;
    var mark = function (i) {
      if (marked >= 0) strings[marked].g.classList.remove("is-focus");
      marked = i;
      if (i >= 0) strings[i].g.classList.add("is-focus");
    };
    pad.addEventListener("focusin", function (ev) {
      var i = keys.indexOf(ev.target), visible = true;
      try { visible = ev.target.matches(":focus-visible"); } catch (e) { visible = true; }
      mark(i >= 0 && visible ? i : -1);
      if (i >= 0 && i !== current) setCurrent(i, false);
    });
    pad.addEventListener("focusout", function () { mark(-1); });

    /* ---- sound on / off ---- */
    if (soundBtn) {
      if (!AC) {
        soundBtn.parentNode.removeChild(soundBtn);
      } else {
        var stateText = soundBtn.querySelector(".m-japan-sound-state");
        soundBtn.addEventListener("click", function () {
          soundOn = !soundOn;
          soundBtn.setAttribute("aria-pressed", soundOn ? "true" : "false");
          if (stateText) stateText.textContent = soundOn ? "on" : "off";
          if (!soundOn) queue = [];
          if (ctx && master) {
            try { master.gain.setTargetAtTime(soundOn ? VOLUME : 0, ctx.currentTime, 0.02); } catch (e) { master.gain.value = soundOn ? VOLUME : 0; }
          }
        });
      }
    }

    /* ---- a silent shimmer across the strings the first time the koto is seen ---- */
    if ("IntersectionObserver" in window && !reduced()) {
      var seen = new IntersectionObserver(function (entries) {
        if (!entries.some(function (en) { return en.isIntersecting; })) return;
        seen.disconnect();
        strings.forEach(function (s, i) {
          window.setTimeout(function () { if (!s.live) vibrate(i, 0.35, 1); }, 500 + i * 55);
        });
      }, { threshold: 0.6 });
      seen.observe(stage);
    }
  }

  /* ------------------------------------------------------------------ washi */
  function washi(root, reduced) {
    var panel = root.querySelector(".m-japan-washi");
    var stage = root.querySelector(".m-japan-washi-stage");
    if (!panel || !stage) return;
    var btn = stage.querySelector(".m-japan-sheet-btn");
    var hovering = false, pinned = false, timer = 0;

    function ripple() {
      if (reduced()) return;
      stage.classList.remove("is-rippling");
      void stage.getBoundingClientRect(); // restart the animations
      stage.classList.add("is-rippling");
      window.clearTimeout(timer);
      timer = window.setTimeout(function () { stage.classList.remove("is-rippling"); }, 2100);
    }

    function update() {
      var up = hovering || pinned;
      var was = panel.classList.contains("is-up");
      panel.classList.toggle("is-up", up);
      if (up && !was) ripple();
    }

    // the sheet rises out of the frame the first time it is seen
    var arrive = function () {
      stage.classList.add("is-in");
      if (!reduced()) window.setTimeout(ripple, 1100);
    };
    if (reduced() || !("IntersectionObserver" in window)) {
      stage.classList.add("is-in");
    } else {
      var io = new IntersectionObserver(function (entries) {
        if (!entries.some(function (en) { return en.isIntersecting; })) return;
        io.disconnect();
        arrive();
      }, { threshold: 0.45 });
      io.observe(stage);
    }

    stage.addEventListener("pointerenter", function (ev) { if (ev.pointerType === "mouse") { hovering = true; update(); } });
    stage.addEventListener("pointerleave", function (ev) { if (ev.pointerType === "mouse") { hovering = false; update(); } });

    if (btn) {
      btn.addEventListener("click", function () {
        pinned = !pinned;
        btn.setAttribute("aria-pressed", pinned ? "true" : "false");
        var was = panel.classList.contains("is-up");
        update();
        if (was && panel.classList.contains("is-up")) ripple(); // already lifted by hover: answer the click anyway
      });
    }
  }

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init);
  else init();
})();
