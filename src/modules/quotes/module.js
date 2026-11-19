/* Quotes pegboard: cards drop onto their pegs, straighten on tap or focus, and re-deal on shuffle. */
(function () {
  "use strict";

  function init() {
    var root = document.querySelector(".m-quotes");
    if (!root) return;
    var board = root.querySelector(".m-quotes-board");
    if (!board) return;
    var slots = Array.prototype.slice.call(board.querySelectorAll(".m-quotes-slot"));
    if (!slots.length) return;
    var shuffleBtn = root.querySelector(".m-quotes-shuffle");
    var status = root.querySelector(".m-quotes-status");

    var mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    function calm() { return !!(mq && mq.matches); }
    var canAnimate = typeof Element !== "undefined" && typeof Element.prototype.animate === "function";
    var EASE = "cubic-bezier(.2,.7,.2,1)";
    var running = [];

    root.classList.add("m-quotes--live");

    /* ---------- layout helpers ---------- */
    function cols() {
      var v = parseInt(window.getComputedStyle(board).getPropertyValue("--mq-cols"), 10);
      return v > 0 ? v : 0;
    }
    function span(li) { return li.classList.contains("m-quotes-slot--s") ? 2 : 3; }
    function current() { return Array.prototype.slice.call(board.children).filter(function (el) { return slots.indexOf(el) > -1; }); }
    /* an order "fits" when every row of the grid is exactly full, so the board never grows a row */
    function fits(order, n) {
      if (!n) return true;
      var used = 0;
      for (var i = 0; i < order.length; i++) {
        var s = span(order[i]);
        if (used + s > n) {
          if (used !== n) return false;
          used = 0;
        }
        used += s;
      }
      return used === n;
    }
    /* the first fitting order that stays as close as possible to the given one */
    function settle(order, n) {
      var out = [];
      function step(rest, used) {
        if (!rest.length) return used === n;
        for (var i = 0; i < rest.length; i++) {
          var s = span(rest[i]);
          var next = used + s;
          if (next > n) {
            if (used !== n) continue;
            next = s;
          }
          out.push(rest[i]);
          if (step(rest.slice(0, i).concat(rest.slice(i + 1)), next)) return true;
          out.pop();
        }
        return false;
      }
      return step(order, 0) ? out : order;
    }
    function place(order) { order.forEach(function (li) { board.appendChild(li); }); }
    function ensureFit() {
      var n = cols();
      var now = current();
      if (n && !fits(now, n)) place(settle(now, n));
    }
    function randomOrder(n) {
      var now = current();
      var best = null;
      for (var t = 0; t < 400; t++) {
        var o = now.slice();
        for (var i = o.length - 1; i > 0; i--) {
          var j = Math.floor(Math.random() * (i + 1));
          var tmp = o[i]; o[i] = o[j]; o[j] = tmp;
        }
        if (!fits(o, n)) continue;
        var moved = 0;
        for (var k = 0; k < o.length; k++) if (o[k] !== now[k]) moved++;
        if (moved >= o.length - 2) return o;
        if (!best && moved > 1) best = o;
      }
      return best || settle(now.slice().reverse(), n);
    }
    function tilt(li) {
      var max = li.classList.contains("m-quotes-slot--s") ? 4.2 : li.classList.contains("m-quotes-slot--tape") ? 2.4 : 3;
      var deg = 0.9 + Math.random() * (max - 0.9);
      return (Math.random() < 0.5 ? -deg : deg).toFixed(2) + "deg";
    }

    ensureFit();
    var resizeTimer = 0;
    window.addEventListener("resize", function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(ensureFit, 160);
    });

    /* ---------- one real button per card: tap, click or focus straightens it ---------- */
    function release(except) {
      slots.forEach(function (li) {
        if (li === except || !li.classList.contains("is-up")) return;
        li.classList.remove("is-up");
        var b = li.querySelector(".m-quotes-hit");
        if (b) b.setAttribute("aria-pressed", "false");
      });
    }
    slots.forEach(function (li, i) {
      var card = li.querySelector(".m-quotes-card");
      if (!card) return;
      var hit = document.createElement("button");
      hit.type = "button";
      hit.className = "m-quotes-hit";
      hit.setAttribute("aria-pressed", "false");
      hit.setAttribute("aria-label", "Straighten card " + (i + 1) + " of " + slots.length);
      card.appendChild(hit);
      hit.addEventListener("click", function () {
        var up = !li.classList.contains("is-up");
        release(li);
        li.classList.toggle("is-up", up);
        hit.setAttribute("aria-pressed", up ? "true" : "false");
      });
      hit.addEventListener("focus", function () {
        var visible = true;
        try { visible = hit.matches(":focus-visible"); } catch (e) { visible = true; }
        if (visible) li.classList.add("is-focus");
      });
      hit.addEventListener("blur", function () { li.classList.remove("is-focus"); });
    });
    document.addEventListener("click", function (ev) {
      var t = ev.target;
      if (t && t.closest && t.closest(".m-quotes-hit")) return;
      release(null);
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") release(null);
    });

    /* ---------- entrance: each card drops onto its peg as it comes into view ---------- */
    var hasIO = "IntersectionObserver" in window;
    if (hasIO && !calm()) {
      root.classList.add("m-quotes--armed");
      var hangIO = new IntersectionObserver(function (entries) {
        var arriving = entries.filter(function (en) { return en.isIntersecting; }).map(function (en) { return en.target; });
        var order = current();
        arriving.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
        arriving.forEach(function (li, k) {
          li.style.setProperty("--mq-d", (120 + k * 115) + "ms");
          li.classList.add("is-hung");
          hangIO.unobserve(li);
        });
      }, { threshold: 0.3 });
      slots.forEach(function (li) { hangIO.observe(li); });
      /* once a card has settled, drop the entrance animation so re-dealing never replays it */
      board.addEventListener("animationend", function (ev) {
        if (ev.animationName !== "m-quotes-drop") return;
        var li = ev.target && ev.target.closest ? ev.target.closest(".m-quotes-slot") : null;
        if (li) li.classList.add("is-set");
      });
    }
    if (hasIO) { /* rest the idle sway while the board is off screen */
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { root.classList.toggle("m-quotes--away", !en.isIntersecting); });
      }, { rootMargin: "80px 0px" }).observe(board);
    }

    /* ---------- shuffle: re-deal places and angles, FLIP each slot to its new peg ---------- */
    function shuffle() {
      var n = cols();
      var moving = !calm() && canAnimate;
      var first = slots.map(function (li) { return li.getBoundingClientRect(); });
      running.forEach(function (a) { try { a.cancel(); } catch (e) { /* already finished */ } });
      running = [];
      release(null);

      place(randomOrder(n));
      if (!n) board.scrollLeft = 0;
      slots.forEach(function (li) {
        var card = li.querySelector(".m-quotes-card");
        if (card) card.style.setProperty("--mq-r", tilt(li));
        li.classList.add("is-hung", "is-set");
      });

      if (moving) {
        var order = current();
        slots.forEach(function (li, i) {
          var last = li.getBoundingClientRect();
          var dx = first[i].left - last.left;
          var dy = first[i].top - last.top;
          if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
          var dist = Math.sqrt(dx * dx + dy * dy);
          var dur = 620 + Math.min(280, dist * 0.3);
          var delay = order.indexOf(li) * 34;
          running.push(li.animate([
            { transform: "translate(" + dx + "px," + dy + "px)", zIndex: 6 },
            { transform: "translate(" + (dx * 0.5) + "px," + (dy * 0.5 - 18) + "px) scale(1.04)", zIndex: 6, offset: 0.5 },
            { transform: "translate(0,0)", zIndex: 6 }
          ], { duration: dur, delay: delay, easing: "cubic-bezier(.45,.05,.2,1)", fill: "backwards" }));
          /* a small swing as it lands on the new peg */
          var hang = li.querySelector(".m-quotes-hang");
          if (hang && !li.classList.contains("m-quotes-slot--tape")) {
            var dir = dx < 0 ? 1 : -1;
            running.push(hang.animate([
              { transform: "rotate(0deg)" },
              { transform: "rotate(" + (dir * 3.2) + "deg)", offset: 0.25 },
              { transform: "rotate(" + (dir * -2) + "deg)", offset: 0.5 },
              { transform: "rotate(" + (dir * 0.9) + "deg)", offset: 0.75 },
              { transform: "rotate(0deg)" }
            ], { duration: 760, delay: delay + dur - 140, easing: "ease-in-out", composite: "add" }));
          }
        });
      }
      if (status) {
        status.textContent = "";
        window.setTimeout(function () { status.textContent = "Board shuffled. The cards are in a new order."; }, 60);
      }
    }
    if (shuffleBtn) {
      shuffleBtn.hidden = false;
      shuffleBtn.addEventListener("click", shuffle);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
