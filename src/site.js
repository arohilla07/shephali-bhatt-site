// Shephali Bhatt: shelf, book panel, list toggle, image fallbacks, scroll reveal. No dependencies.
(function () {
  "use strict";
  var doc = document, root = doc.documentElement;
  root.classList.remove("no-js");
  root.classList.add("js");
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  function store(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; }
  }

  // Lead images: show when loaded, fall back to the typeset cover when broken.
  function watchImg(img) {
    var fig = img.closest(".cover");
    if (!fig) return;
    function ok() { if (img.naturalWidth > 1) fig.classList.add("img-ok"); else bad(); }
    function bad() { fig.classList.add("img-failed"); fig.classList.remove("img-ok"); }
    if (img.complete) { img.naturalWidth > 1 ? ok() : (img.currentSrc ? bad() : 0); }
    img.addEventListener("load", ok);
    img.addEventListener("error", bad);
  }

  doc.addEventListener("DOMContentLoaded", function () {
    doc.querySelectorAll(".cover img").forEach(watchImg);

    // View toggle + topic filters
    var tools = doc.querySelector(".shelf-tools"), groupsEl = doc.querySelector(".groups");
    if (tools && groupsEl) {
      tools.hidden = false;
      var setView = function (v) {
        groupsEl.setAttribute("data-view", v);
        tools.querySelectorAll(".vt").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.view === v)); });
      };
      setView(store("sb-view") === "list" ? "list" : "shelf");
      tools.addEventListener("click", function (ev) {
        var vt = ev.target.closest(".vt");
        if (vt) { setView(vt.dataset.view); store("sb-view", vt.dataset.view); return; }
        var chip = ev.target.closest(".chip");
        if (!chip) return;
        var f = chip.dataset.filter;
        tools.querySelectorAll(".chip").forEach(function (c) { c.setAttribute("aria-pressed", String(c === chip)); });
        doc.querySelectorAll(".group").forEach(function (g) {
          g.hidden = !(f === "all" || g.dataset.group === f);
          if (!g.hidden) g.classList.add("in");
        });
      });
    }

    // Book panel
    var dlg = doc.getElementById("book-dialog"), opener = null;
    if (dlg && typeof dlg.showModal === "function") {
      var slot = function (n) { return dlg.querySelector('[data-slot="' + n + '"]'); };
      var open = function (btn) {
        var card = doc.getElementById(btn.dataset.story);
        if (!card) return;
        var a = card.querySelector(".headline a"), sum = card.querySelector(".summary");
        var fig = card.querySelector(".cover").cloneNode(true);
        fig.classList.remove("cover-thumb");
        fig.classList.add("cover-dialog");
        var im = fig.querySelector("img");
        if (im) { im.loading = "eager"; watchImg(im); }
        slot("cover").replaceChildren(fig);
        slot("meta").replaceChildren(card.querySelector(".meta").cloneNode(true));
        slot("title").textContent = a.textContent.replace(" (opens in a new tab)", "").replace("↗", "").trim();
        slot("summary").textContent = sum ? sum.textContent : "";
        slot("summary").hidden = !sum;
        slot("link").href = a.href;
        slot("read").textContent = card.dataset.read || "Read the story";
        opener = btn;
        btn.classList.add("is-out");
        dlg.showModal();
        root.classList.add("dialog-open");
        slot("link").focus();
      };
      doc.addEventListener("click", function (ev) {
        var b = ev.target.closest(".spine");
        if (!b) return;
        var li = b.closest(".spine-item");
        fit(li);
        li.classList.add("is-turning");
        setTimeout(function () { open(b); }, reduce ? 0 : 520);
      });
      dlg.addEventListener("click", function (ev) {
        if (ev.target === dlg || ev.target.closest("[data-close]")) dlg.close();
      });
      dlg.addEventListener("close", function () {
        root.classList.remove("dialog-open");
        doc.querySelectorAll(".spine-item.is-turning").forEach(function (x) { x.classList.remove("is-turning"); });
        if (opener) { opener.classList.remove("is-out"); opener.focus({ preventScroll: true }); opener = null; }
      });
    } else {
      // No <dialog> support: spines go straight to the story.
      doc.addEventListener("click", function (ev) {
        var b = ev.target.closest(".spine"), card = b && doc.getElementById(b.dataset.story);
        if (card) window.open(card.querySelector(".headline a").href, "_blank", "noopener");
      });
    }

    // Tapping the framed photo gives it the same little zoom as hovering
    var fbtn = doc.querySelector(".frame-mat");
    if (fbtn) {
      fbtn.addEventListener("click", function () { fbtn.closest(".frame").classList.toggle("is-zoomed"); });
      doc.addEventListener("click", function (ev) { if (!ev.target.closest(".frame")) { var f = doc.querySelector(".frame.is-zoomed"); if (f) f.classList.remove("is-zoomed"); } });
    }

    // "Dark mode" easter egg: clicking it lets warm light in instead
    (function () {
      var btns = doc.querySelectorAll("[data-mode-toggle]");
      if (!btns.length) return;
      var toast = doc.querySelector(".warm-toast"), light = doc.querySelector(".warm-light"), tt;
      var lines = [
        ["Dark mode? Not here.", "There&rsquo;s enough darkness in the world. Here&rsquo;s some warm light instead."],
        ["Still no dark mode.", "Light is good. We turned the lamps up a little more."],
        ["Nice try.", "This reading room only comes in daylight and lamplight."]
      ];
      var tries = 0;
      function set(on, fromBtn) {
        if (fromBtn && light) {
          var r = fromBtn.getBoundingClientRect();
          light.style.setProperty("--lx", ((r.left + r.width / 2) / window.innerWidth * 100).toFixed(1) + "%");
          light.style.setProperty("--ly", ((r.top + r.height / 2) / window.innerHeight * 100).toFixed(1) + "%");
        }
        root.classList.toggle("warm-out", !on);
        root.classList.toggle("warm", on);
        btns.forEach(function (b) {
          b.setAttribute("aria-pressed", on ? "true" : "false");
          b.querySelector(".mode-label").textContent = on ? "Warm light" : "Dark mode";
          b.setAttribute("aria-label", on ? "Warm light is on. Switch back to cool daylight" : "Dark mode");
        });
        try { localStorage.setItem("sb-warm", on ? "1" : "0"); } catch (e) {}
      }
      function motes(b) {
        if (reduce) return;
        var r = b.getBoundingClientRect();
        for (var i = 0; i < 14; i++) {
          var m = doc.createElement("span"); m.className = "mote";
          m.style.left = (r.left + r.width / 2 - 5) + "px"; m.style.top = (r.top + r.height / 2 - 5) + "px";
          var a = Math.random() * Math.PI * 2, d = 50 + Math.random() * 110;
          m.style.setProperty("--dx", Math.cos(a) * d + "px");
          m.style.setProperty("--dy", (Math.sin(a) * d * .7 + (r.top < 200 ? 40 : -60)) + "px");
          m.style.animationDelay = (i * 35) + "ms";
          doc.body.appendChild(m);
          setTimeout(function (el) { el.remove(); }.bind(null, m), 2200);
        }
      }
      function say(html) {
        if (!toast) return;
        toast.innerHTML = '<span class="sun" aria-hidden="true">&#9728;&#65039;</span><span>' + html + "</span>";
        toast.classList.add("show");
        clearTimeout(tt); tt = setTimeout(function () { toast.classList.remove("show"); }, 4200);
      }
      btns.forEach(function (b) {
        b.addEventListener("click", function () {
          var on = !root.classList.contains("warm");
          set(on, b);
          if (on) { var l = lines[Math.min(tries++, lines.length - 1)]; say("<b>" + l[0] + "</b>" + l[1]); motes(b); }
          else say("<b>Back to cool daylight.</b>Still bright, just a little crisper.");
        });
      });
      try { if (localStorage.getItem("sb-warm") === "1") set(true); } catch (e) {}
    })();

    // Keep a tipped-over book inside the visible shelf
    function fit(li) {
      var pop = li && li.querySelector(".book-flat"), sh = li && li.closest(".shelf");
      if (!pop || !sh) return;
      var s = sh.getBoundingClientRect(), r = li.getBoundingClientRect(), w = pop.offsetWidth, pad = 8;
      var c = r.left + r.width / 2, left = c - w / 2, shift = 0;
      if (left < s.left + pad) shift = s.left + pad - left;
      else if (left + w > s.right - pad) shift = s.right - pad - (left + w);
      pop.style.setProperty("--shift", shift + "px");
    }
    window.__fitBook = fit;
    doc.addEventListener("pointerover", function (ev) { var li = ev.target.closest && ev.target.closest(".spine-item"); if (li) fit(li); });
    doc.addEventListener("focusin", function (ev) { var li = ev.target.closest && ev.target.closest(".spine-item"); if (li) fit(li); });

    // Fade hint on the right edge of a scrolling shelf, until you reach the end
    doc.querySelectorAll(".shelf").forEach(function (sh) {
      var upd = function () { sh.classList.toggle("at-end", sh.scrollLeft + sh.clientWidth >= sh.scrollWidth - 4); };
      sh.addEventListener("scroll", upd, { passive: true });
      window.addEventListener("resize", upd);
      upd();
    });

    // Arrow keys move along a shelf
    doc.addEventListener("keydown", function (ev) {
      var b = ev.target.closest && ev.target.closest(".spine");
      if (!b || (ev.key !== "ArrowRight" && ev.key !== "ArrowLeft")) return;
      var all = Array.prototype.slice.call(b.closest(".books").querySelectorAll(".spine"));
      var next = all[all.indexOf(b) + (ev.key === "ArrowRight" ? 1 : -1)];
      if (next) { ev.preventDefault(); next.focus(); next.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduce ? "auto" : "smooth" }); }
    });

    // Scroll reveal
    var items = doc.querySelectorAll(".reveal");
    if (reduce || !("IntersectionObserver" in window)) {
      items.forEach(function (el) { el.classList.add("in"); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
        });
      }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
      items.forEach(function (el) { io.observe(el); });
    }

    // Header gets a hairline once you scroll
    var header = doc.querySelector(".site-header");
    var onScroll = function () { header.classList.toggle("scrolled", window.scrollY > 8); };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  });
})();
