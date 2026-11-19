// words: a card-catalogue drawer. Rotating language in the title, a deck you can pull from and turn over.
(function () {
  "use strict";

  var SVG_TURN = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M13 8a5 5 0 1 1-1.6-3.7M13 2.6v2.6h-2.6"/></svg>';

  function init() {
    var root = document.querySelector(".m-words");
    if (!root) return;
    var cabinet = root.querySelector(".m-words-cabinet");
    var deck = root.querySelector(".m-words-deck");
    var cards = deck ? Array.prototype.slice.call(deck.querySelectorAll(".m-words-card")) : [];
    if (!cabinet || !cards.length) return;

    var mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    function reduced() { return !!(mq && mq.matches); }
    function pad(n) { return (n < 10 ? "0" : "") + n; }
    function text(el) { return el ? el.textContent.replace(/\s+/g, " ").trim() : ""; }

    /* ------------------------------------------------------------ the deck */
    var n = cards.length, cur = 0;
    var tabsEl = root.querySelector(".m-words-tabs");
    var controls = root.querySelector(".m-words-controls");
    var live = root.querySelector(".m-words-live");
    var nowEl = root.querySelector(".m-words-now");
    var drawer = root.querySelector(".m-words-drawer");
    var tabs = [];

    var info = cards.map(function (card, i) {
      var wordEl = card.querySelector(".m-words-word");
      var word = "Card " + (i + 1);
      if (wordEl) { // the romanised word, without the native-script line
        var copy = wordEl.cloneNode(true), script = copy.querySelector(".m-words-script");
        if (script) copy.removeChild(script);
        word = text(copy) || word;
      }
      var lift = card.querySelector(".m-words-lift");

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "m-words-turn";
      btn.setAttribute("aria-pressed", "false");
      btn.setAttribute("aria-label", "Turn the card over: " + word);
      lift.appendChild(btn);

      [[".m-words-front", "Turn over"], [".m-words-back", "Turn back"]].forEach(function (pair) {
        var face = card.querySelector(pair[0]);
        if (!face) return;
        var hint = document.createElement("span");
        hint.className = "m-words-hint";
        hint.setAttribute("aria-hidden", "true");
        hint.innerHTML = pair[1] + SVG_TURN;
        face.appendChild(hint);
      });

      if (tabsEl) {
        var tab = document.createElement("button");
        tab.type = "button";
        tab.className = "m-words-tab";
        tab.setAttribute("data-group", card.getAttribute("data-group") || "");
        tab.setAttribute("aria-label", "Card " + (i + 1) + ": " + word);
        tab.textContent = pad(i + 1);
        tab.addEventListener("click", function () { go(i); });
        tabsEl.appendChild(tab);
        tabs.push(tab);
      }

      btn.addEventListener("click", function () {
        if (swiped) { swiped = false; return; }
        if (i === cur) flip();
      });

      return {
        card: card, lift: lift, btn: btn, word: word,
        lang: text(card.querySelector(".m-words-lang")),
        mean: text(card.querySelector(".m-words-mean")),
        stamp: text(card.querySelector(".m-words-stamp"))
      };
    });

    function replay(el, cls) {
      if (reduced()) return;
      el.classList.remove("is-arriving", "is-hopping", "is-bumped");
      void el.offsetWidth; // restart the keyframes
      el.classList.add(cls);
    }
    cards.forEach(function (card) {
      card.querySelector(".m-words-lift").addEventListener("animationend", function (ev) {
        if (ev.target === ev.currentTarget) ev.currentTarget.classList.remove("is-arriving", "is-hopping");
      });
    });

    function setFlipped(i, on) {
      info[i].card.classList.toggle("is-flipped", on);
      info[i].btn.setAttribute("aria-pressed", on ? "true" : "false");
    }

    function layout() {
      info.forEach(function (it, i) {
        var rel = (i - cur + n) % n;
        var pos = rel === 0 ? "0" : rel === 1 ? "1" : rel === n - 1 ? "-1" : rel === 2 ? "2" : rel === n - 2 ? "-2" : "x";
        if (n < 3 && rel !== 0) pos = "x";
        it.card.setAttribute("data-pos", pos);
        var active = rel === 0;
        if (active) { it.card.removeAttribute("inert"); it.card.removeAttribute("aria-hidden"); }
        else { it.card.setAttribute("inert", ""); it.card.setAttribute("aria-hidden", "true"); }
        it.btn.tabIndex = active ? 0 : -1;
        if (tabs[i]) { // one tab stop for the row; arrow keys move along it
          if (active) tabs[i].setAttribute("aria-current", "true"); else tabs[i].removeAttribute("aria-current");
          tabs[i].tabIndex = active ? 0 : -1;
        }
      });
      if (nowEl) nowEl.textContent = pad(cur + 1);
    }

    function say(msg) { if (live) live.textContent = msg; }

    function go(to) {
      to = ((to % n) + n) % n;
      if (to === cur) { replay(info[cur].lift, "is-hopping"); return; }
      var focused = document.activeElement;
      var follow = info[cur].card.contains(focused) ? "card" : tabs.indexOf(focused) > -1 ? "tab" : "";
      setFlipped(cur, false);
      cur = to;
      layout();
      replay(info[cur].lift, "is-arriving");
      if (drawer) replay(drawer, "is-bumped");
      var target = follow === "card" ? info[cur].btn : follow === "tab" ? tabs[cur] : null;
      if (target) { try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); } }
      var it = info[cur];
      say("Card " + (cur + 1) + " of " + n + ". " + it.word + ". " + it.lang + ". " + it.stamp + ".");
    }

    function flip() {
      var it = info[cur];
      var on = !it.card.classList.contains("is-flipped");
      setFlipped(cur, on);
      replay(it.lift, "is-hopping");
      say(on ? it.word + ": " + it.mean : it.word + ", front of the card.");
    }

    // swipe sideways on the card to move through the deck
    var swiped = false, startX = 0, startY = 0, tracking = false;
    deck.addEventListener("pointerdown", function (ev) {
      if (ev.pointerType === "mouse" && ev.button !== 0) return;
      tracking = true; swiped = false; startX = ev.clientX; startY = ev.clientY;
    });
    deck.addEventListener("pointerup", function (ev) {
      if (!tracking) return;
      tracking = false;
      var dx = ev.clientX - startX, dy = ev.clientY - startY;
      if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        swiped = true;
        go(cur + (dx < 0 ? 1 : -1));
        setTimeout(function () { swiped = false; }, 350);
      }
    });
    deck.addEventListener("pointercancel", function () { tracking = false; });

    var prev = root.querySelector(".m-words-prev"), next = root.querySelector(".m-words-next");
    if (prev) prev.addEventListener("click", function () { go(cur - 1); });
    if (next) next.addEventListener("click", function () { go(cur + 1); });

    cabinet.addEventListener("keydown", function (ev) {
      if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
      var k = ev.key;
      if (k === "ArrowRight" || k === "ArrowDown") { ev.preventDefault(); go(cur + 1); }
      else if (k === "ArrowLeft" || k === "ArrowUp") { ev.preventDefault(); go(cur - 1); }
      else if (k === "Home") { ev.preventDefault(); go(0); }
      else if (k === "End") { ev.preventDefault(); go(n - 1); }
    });

    if (drawer) drawer.addEventListener("animationend", function () { drawer.classList.remove("is-bumped"); });
    layout();
    if (tabsEl) tabsEl.hidden = false;
    if (controls) controls.hidden = false;
    root.classList.add("is-live");

    // the cards rise out of the drawer the first time it scrolls into view
    function riseIn() {
      if (cabinet.classList.contains("is-in")) return;
      cabinet.classList.add("is-in", "is-intro");
      setTimeout(function () { cabinet.classList.remove("is-intro"); }, 1200);
    }
    if (reduced() || !("IntersectionObserver" in window)) {
      cabinet.classList.add("is-in");
    } else {
      void cabinet.offsetWidth; // make sure the waiting state is painted first
      var seen = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { riseIn(); seen.disconnect(); }
        });
      }, { threshold: 0.3 });
      seen.observe(cabinet);
    }

    /* ------------------------------------------------------------ the rotating language */
    var slot = root.querySelector(".m-words-slot");
    var langs = slot ? (slot.getAttribute("data-langs") || "").split("|").filter(Boolean) : [];
    if (!slot || langs.length < 2) return;

    var fixed = slot.querySelector(".m-words-slot-static");
    var roll = null, words = [], at = 0, timer = 0, onScreen = !("IntersectionObserver" in window);

    function buildRoll() {
      roll = document.createElement("span");
      roll.className = "m-words-roll";
      roll.setAttribute("aria-hidden", "true");
      words = langs.map(function (lang, i) {
        var w = document.createElement("span");
        w.className = "m-words-roll-word" + (i === 0 ? " is-on" : "");
        lang.split("").forEach(function (ch, j) {
          var s = document.createElement("span");
          s.style.setProperty("--i", j);
          s.textContent = ch;
          w.appendChild(s);
        });
        roll.appendChild(w);
        return w;
      });
    }

    function tick() {
      var from = words[at];
      at = (at + 1) % words.length;
      words.forEach(function (w) { w.classList.remove("is-out"); });
      from.classList.remove("is-on");
      from.classList.add("is-out");
      words[at].classList.add("is-on");
    }

    function sync() {
      var rolling = !reduced();
      if (rolling && !roll) buildRoll();
      if (roll) {
        if (rolling && !roll.parentNode) { slot.appendChild(roll); if (fixed) fixed.classList.add("sr-only"); }
        if (!rolling && roll.parentNode) { slot.removeChild(roll); if (fixed) fixed.classList.remove("sr-only"); }
      }
      var run = rolling && onScreen && !document.hidden;
      if (run && !timer) timer = setInterval(tick, 2600);
      if (!run && timer) { clearInterval(timer); timer = 0; }
    }

    document.addEventListener("visibilitychange", sync);
    if (mq) {
      if (mq.addEventListener) mq.addEventListener("change", sync);
      else if (mq.addListener) mq.addListener(sync);
    }
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { onScreen = en.isIntersecting; });
        sync();
      }, { threshold: 0 }).observe(slot);
    }
    sync();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
