#!/usr/bin/env python3
"""Build the static site into dist/.  Usage: python3 build.py

Reads content/copy.json and content/stories.json (falls back to
content/sample-*.json if the real files are missing), renders
src/template.html, and copies styles + assets. Python stdlib only.
"""
import datetime
import hashlib
import json
import os
import re
import shutil
import sys
import xml.etree.ElementTree as ET
from html import escape
from html.parser import HTMLParser
from pathlib import Path
from string import Template
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
SRC, CONTENT, ASSETS, DIST = ROOT / "src", ROOT / "content", ROOT / "assets", ROOT / "dist"
if os.environ.get("SITE_OUT"):  # build somewhere else, e.g. while testing one module
    DIST = Path(os.environ["SITE_OUT"]).resolve()

# Optional page modules live in src/modules/<name>/ as module.html, module.css and module.js.
# Each slot below is a $placeholder in src/template.html; modules render in the order listed.
MODULES = SRC / "modules"
SLOTS = {
    "slot_after_hero": ["motion"],
    "slot_about_end": ["venn"],
    "slot_after_about": ["years"],
    "slot_after_stories": ["quotes"],
    "slot_offpage": ["offclock", "japan", "travel", "words"],
    "slot_body_end": [],
}
_ONLY = [m for m in os.environ.get("SITE_MODULES", "").split(",") if m]


def module_names():
    names = [m for mods in SLOTS.values() for m in mods]
    return [m for m in names if (MODULES / m).is_dir() and (not _ONLY or m in _ONLY)]


def module_text(name, part):
    f = MODULES / name / f"module.{part}"
    return f.read_text(encoding="utf-8") if f.is_file() else ""


def bundle(part, base):
    """Base stylesheet or script followed by every active module's own."""
    out = [(SRC / base).read_text(encoding="utf-8")]
    for m in module_names():
        t = module_text(m, part)
        if t.strip():
            out.append(f"\n/* ---- module: {m} ---- */\n{t}")
    return "\n".join(out)
SITE_URL = "https://shephalibhatt.com/"
MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()


def e(s):
    return escape(str(s or ""), quote=True)


def load(name):
    real, sample = CONTENT / f"{name}.json", CONTENT / f"sample-{name}.json"
    path = real if real.exists() else sample
    if path is sample:
        print(f"  ! {real.name} not found, using {sample.name}", file=sys.stderr)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def safe_url(url):
    url = str(url or "").strip()
    scheme = urlparse(url).scheme.lower()
    if scheme in ("http", "https", "mailto") or url.startswith(("#", "/")):
        return url
    return "#"


def is_external(url):
    return urlparse(url).scheme in ("http", "https")


def ext_attrs(url):
    return ' target="_blank" rel="noopener"' if is_external(url) else ""


class InlineSanitizer(HTMLParser):
    """Allow a small set of inline tags; escape everything else."""
    ALLOWED = {"em", "i", "strong", "b", "a", "br"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out, self.stack = [], []

    def handle_starttag(self, tag, attrs):
        if tag not in self.ALLOWED:
            return
        if tag == "br":
            self.out.append("<br>")
            return
        if tag == "a":
            href = safe_url(dict(attrs).get("href"))
            self.out.append(f'<a href="{e(href)}"{ext_attrs(href)}>')
        else:
            self.out.append(f"<{tag}>")
        self.stack.append(tag)

    def handle_endtag(self, tag):
        if tag in self.stack:
            while self.stack:
                t = self.stack.pop()
                self.out.append(f"</{t}>")
                if t == tag:
                    break

    def handle_data(self, data):
        self.out.append(escape(data, quote=False))

    def result(self):
        while self.stack:
            self.out.append(f"</{self.stack.pop()}>")
        return "".join(self.out)


def inline_html(s):
    p = InlineSanitizer()
    p.feed(str(s or ""))
    p.close()
    return p.result()


def fmt_date(d):
    d = str(d or "").strip()
    m = re.fullmatch(r"(\d{4})-(\d{2})(?:-\d{2})?", d)
    if m and 1 <= int(m.group(2)) <= 12:
        return f"{MONTHS[int(m.group(2)) - 1]} {m.group(1)}"
    return d


def date_attr(d):
    d = str(d or "").strip()
    return d if re.fullmatch(r"\d{4}(-\d{2}){0,2}", d) else ""


# ---------------------------------------------------------------- SVG inlining

SVG_NS = "http://www.w3.org/2000/svg"
XLINK_NS = "http://www.w3.org/1999/xlink"
ET.register_namespace("", SVG_NS)
ET.register_namespace("xlink", XLINK_NS)
ILLU = ASSETS / "illustrations"
FALLBACK = SRC / "fallback"


def _clean_svg(root, prefix):
    """Drop scripts/foreign namespaces/event handlers and prefix ids so several SVGs can share a page."""
    parents = {c: p for p in root.iter() for c in p}
    for el in list(root.iter()):
        tag = el.tag if isinstance(el.tag, str) else ""
        local = tag.split("}")[-1]
        if not tag.startswith("{" + SVG_NS) or local in ("script", "foreignObject", "metadata", "title", "desc"):
            if el in parents:
                parents[el].remove(el)
            continue
        for k in list(el.attrib):
            ns_ok = not k.startswith("{") or k.startswith("{" + XLINK_NS)
            if not ns_ok or k.lower().startswith("on"):
                del el.attrib[k]
    ids = {el.get("id") for el in root.iter() if el.get("id")}
    for el in root.iter():
        if el.get("id"):
            el.set("id", f"{prefix}-{el.get('id')}")
        for k, v in list(el.attrib.items()):
            if k == "id":
                continue
            nv = re.sub(r"url\(#([^)]+)\)", lambda m: f"url(#{prefix}-{m.group(1)})" if m.group(1) in ids else m.group(0), v)
            if k in ("href", "{%s}href" % XLINK_NS) and v.startswith("#") and v[1:] in ids:
                nv = f"#{prefix}-{v[1:]}"
            if nv != v:
                el.set(k, nv)


def inline_svg(name, cls, prefix=None, stagger=(), required=False):
    """Read assets/illustrations/<name>.svg (or src/fallback/<name>.svg) and return inline markup."""
    path = ILLU / f"{name}.svg"
    if not path.exists():
        path = FALLBACK / f"{name}.svg"
        if path.exists():
            print(f"  ! illustrations/{name}.svg missing, using fallback", file=sys.stderr)
    if not path.exists():
        if required:
            print(f"  ! illustrations/{name}.svg missing, no fallback", file=sys.stderr)
        return "", None
    try:
        root = ET.fromstring(path.read_text(encoding="utf-8"))
    except ET.ParseError as err:
        print(f"  ! could not parse {path}: {err}", file=sys.stderr)
        return "", None
    prefix = prefix or name
    _clean_svg(root, prefix)
    for gid in stagger:  # wrap each piece in <g class="drop" style="--i:n"> so CSS can animate it
        g = root.find(f".//*[@id='{prefix}-{gid}']")
        if g is None:
            continue
        books = [b for b in g.iter() if "book" in (b.get("class") or "").split()]
        targets = books or [k for k in g if isinstance(k.tag, str)]
        parent_of = {c: p for p in g.iter() for c in p}
        for i, k in enumerate(targets):
            par = parent_of.get(k)
            if par is None:
                continue
            idx = list(par).index(k)
            wrap = ET.Element(f"{{{SVG_NS}}}g", {"class": "drop", "style": f"--i:{i}"})
            par.remove(k)
            wrap.append(k)
            par.insert(idx, wrap)
    for a in ("width", "height"):
        root.attrib.pop(a, None)
    for a in ("role", "aria-labelledby", "aria-label"):
        root.attrib.pop(a, None)
    root.set("class", cls)
    root.set("aria-hidden", "true")
    root.set("focusable", "false")
    out = ET.tostring(root, encoding="unicode", short_empty_elements=True)
    return out, root


def slot_box(root, prefix, slot="frame-slot"):
    """Percent box (left, top, width, height) of a rect in the SVG's viewBox, honouring translate()s."""
    if root is None:
        return None
    vb = [float(x) for x in re.split(r"[\s,]+", (root.get("viewBox") or "").strip()) if x]
    el = root.find(f".//*[@id='{prefix}-{slot}']")
    if len(vb) != 4 or el is None:
        return None
    parents = {c: p for p in root.iter() for c in p}
    if el.tag.split("}")[-1] != "rect":
        rect = el.find(f"{{{SVG_NS}}}rect")
        if rect is None:
            return None
        chain_from = rect
    else:
        chain_from = el
    try:
        x, y = float(chain_from.get("x", 0)), float(chain_from.get("y", 0))
        w, h = float(chain_from.get("width")), float(chain_from.get("height"))
    except (TypeError, ValueError):
        return None
    node = chain_from
    while node is not None and node is not root:
        t = node.get("transform", "").strip()
        if t:
            m = re.fullmatch(r"translate\(\s*(-?[\d.]+)(?:[\s,]+(-?[\d.]+))?\s*\)", t)
            if not m:
                return None
            x += float(m.group(1))
            y += float(m.group(2) or 0)
        node = parents.get(node)
    return ((x - vb[0]) / vb[2] * 100, (y - vb[1]) / vb[3] * 100, w / vb[2] * 100, h / vb[3] * 100)


# ---------------------------------------------------------------- stories

TONES = ["blue", "yellow", "green", "rose", "white", "grey", "ink"]
COVER_TONES = ["blue", "yellow", "green", "rose", "ink", "grey"]
SMALL = {"a", "an", "the", "of", "to", "and", "in", "on", "for", "with", "is", "as", "at", "by", "from", "when", "are", "be", "its"}
PRODUCT_NAMES = {  # catalogue labels for featured stories, matched against the headline
    "tastefluencer": "Tastefluencer",
    "youtube election": "The YouTube Election",
    "imdb": "IMDb Stars",
    "influencer diaries": "Influencer Diaries",
}


def h32(s):
    return int(hashlib.md5(str(s).encode("utf-8")).hexdigest()[:8], 16)


def tone_for(s, i=None):
    return TONES[(h32(s.get("headline")) if i is None else i) % len(TONES)]


def outlet_mark(outlet):
    o = str(outlet or "").lower()
    if "lounge" in o:
        return "ML"
    if "economic times" in o or o.startswith("et"):
        return "ET"
    if "mint" in o:
        return "M"
    return "".join(w[0] for w in str(outlet).split()[:2]).upper()


def short_title(headline, limit=34):
    t = str(headline or "").strip()
    if ":" in t and len(t.split(":")[0]) <= 40:
        return t.split(":")[0].strip()
    if len(t) <= limit:
        return t
    words, out = t.split(), []
    for w in words:
        if len(" ".join(out + [w])) > limit:
            break
        out.append(w)
    while out and out[-1].lower().strip(",") in SMALL:
        out.pop()
    return " ".join(out).rstrip(",") + "…"


def product_name(s):
    hl = str(s.get("headline", "")).lower()
    for k, v in PRODUCT_NAMES.items():
        if k in hl:
            return v
    return short_title(s.get("headline"), 22)


def art_no(url):
    digits = "".join(re.findall(r"\d", str(url or "")))[-9:]
    if len(digits) < 6:
        return ""
    return f"{digits[:3]}.{digits[3:6]}.{digits[6:]}".rstrip(".")


def read_label(s):
    host = urlparse(str(s.get("url") or "")).netloc.lower()
    if "magzter" in host:
        return "Read on Magzter"
    if "livemint" in host:
        return "Read on Mint Lounge" if "lounge" in str(s.get("outlet", "")).lower() or "lifestyle." in host else "Read on Mint"
    if "economictimes" in host:
        return "Read on ET"
    return f"Read on {s.get('outlet') or 'the source'}"


def year_of(s):
    m = re.match(r"(\d{4})", str(s.get("date") or ""))
    return m.group(1) if m else ""


def story_meta(s):
    bits = [f'<span class="outlet">{e(s.get("outlet"))}</span>']
    if s.get("section"):
        bits.append(f'<span>{e(s["section"])}</span>')
    if s.get("date"):
        dt = date_attr(s["date"])
        dt_attr = f' datetime="{dt}"' if dt else ""
        bits.append(f'<time{dt_attr}>{e(fmt_date(s["date"]))}</time>')
    return '<p class="meta">' + '<span class="dot" aria-hidden="true"></span>'.join(bits) + "</p>"


def linked_title(text):
    """Escape a title and glue its last word to the arrow so the arrow never wraps alone."""
    words = str(text or "").split()
    head, last = " ".join(words[:-1]), (words[-1] if words else "")
    return (
        (e(head) + " " if head else "")
        + f'<span class="nowrap">{e(last)}<span class="arrow" aria-hidden="true">&#8599;</span></span>'
        + '<span class="sr-only"> (opens in a new tab)</span>'
    )


def image_url(s):
    url = str(s.get("image") or "").strip()
    if url.startswith("assets/") and (ROOT / url).is_file():  # bundled local copy
        return url
    return url if urlparse(url).scheme == "https" else ""


def cover(s, cls="", eager=False, tone=None):
    """A lead image laid over a typeset 'book cover'. If the image is missing or fails, the cover shows."""
    hl = str(s.get("headline") or "")
    title = hl if len(hl) <= 90 else short_title(hl, 80)
    size = "short" if len(title) <= 34 else ("mid" if len(title) <= 64 else "long")
    orn = h32(hl + "o") % 4
    img = ""
    src = image_url(s)
    if src:
        alt = s.get("image_alt") or f"Lead image from the {s.get('outlet') or ''} story “{hl}”".replace("  ", " ")
        loading = "eager" if eager else "lazy"
        img = (
            f'<img src="{e(src)}" alt="{e(alt)}" loading="{loading}" decoding="async" '
            f'referrerpolicy="no-referrer">'
        )
    foot = " · ".join(x for x in (s.get("section"), year_of(s)) if x)
    return (
        f'<figure class="cover t-{tone or COVER_TONES[h32(hl + "c") % len(COVER_TONES)]} cover-{size} orn-{orn} {cls}"{" data-img" if img else ""}>'
        f'<div class="cover-art" aria-hidden="true">'
        f'<span class="cover-top"><span class="cover-outlet">{e(s.get("outlet"))}</span><span class="cover-mark">{e(outlet_mark(s.get("outlet")))}</span></span>'
        f'<span class="cover-orn"></span>'
        f'<span class="cover-title">{e(title)}</span>'
        f'<span class="cover-foot">{e(foot)}</span>'
        f"</div>{img}</figure>"
    )


def story_card(s, sid):
    url = safe_url(s.get("url"))
    summary = f'<p class="summary">{e(s["summary"])}</p>' if s.get("summary") else ""
    return (
        f'<article class="story" id="{sid}" data-read="{e(read_label(s))}">'
        f"{cover(s, 'cover-thumb')}"
        f'<div class="story-body">{story_meta(s)}'
        f'<h4 class="headline"><a href="{e(url)}"{ext_attrs(url)}>{linked_title(s.get("headline"))}</a></h4>'
        f"{summary}</div></article>"
    )


def spine(s, sid, i):
    h = h32(s.get("headline"))
    height = 172 + (h % 6) * 11
    title = short_title(s.get("headline"))
    width = 48 if len(title) <= 22 else (56 if len(title) <= 30 else 62)
    width += (h >> 4) % 3 * 3
    tone = tone_for(s, h // 7)
    variant = (h >> 8) % 4
    feat = " is-featured" if s.get("featured") else ""
    label = f'{s.get("headline")} ({s.get("outlet")}, {fmt_date(s.get("date"))}). Opens the story in a new tab'
    return (
        f'<li class="spine-item" style="--h:{height}px;--w:{width}px;--d:{i}">'
        f'<button type="button" class="spine t-{tone} v-{variant}{feat}" data-story="{sid}" '
        f'aria-label="{e(label)}">'
        f'<span class="spine-cap" aria-hidden="true"></span>'
        f'<span class="spine-title" aria-hidden="true">{e(title)}</span>'
        f'<span class="spine-mark" aria-hidden="true">{e(outlet_mark(s.get("outlet")))}</span>'
        f"</button>"
        f'<span class="book-flat t-{tone}" aria-hidden="true">'
        f'<span class="book-flat-meta">{e(s.get("outlet"))} · {e(fmt_date(s.get("date")))}</span>'
        f'<span class="book-flat-title">{e(s.get("headline"))}</span>'
        f'<span class="book-flat-cta">Read the story ↗</span>'
        f"</span></li>"
    )


def product_card(s, i=0):
    url = safe_url(s.get("url"))
    specs = " · ".join(x for x in (s.get("outlet"), s.get("section"), year_of(s)) if x)
    art = art_no(s.get("url"))
    art_html = f'<p class="product-art">Art. no. <span>{e(art)}</span></p>' if art else ""
    summary = f'<p class="product-summary">{e(s["summary"])}</p>' if s.get("summary") else ""
    return (
        f'<article class="product reveal">'
        f'<div class="product-media">{cover(s, "cover-lg", tone=["yellow", "blue", "rose"][i % 3])}'
        f'<span class="price-tag" aria-hidden="true"><span class="price-hole"></span>Read <span class="arrow">&#8599;</span></span></div>'
        f'<div class="product-tag">'
        f'<p class="product-name">{e(product_name(s))}</p>'
        f'<p class="product-specs">{e(specs)}</p>'
        f'<h3 class="product-headline"><a class="stretch" href="{e(url)}"{ext_attrs(url)}>{linked_title(s.get("headline"))}</a></h3>'
        f"{summary}{art_html}</div></article>"
    )


def step_head(n, total, hid, title, icon):
    return (
        f'<header class="step-head reveal">'
        f'<span class="step-num" aria-hidden="true">{n}</span>'
        f'<span class="step-icon" aria-hidden="true">{icon}</span>'
        f'<div class="step-text"><p class="step-kicker" aria-hidden="true">Step {n} of {total}</p>'
        f'<h2 id="{hid}" class="section-title">{title}</h2></div>'
        f'<span class="step-rule" aria-hidden="true"></span></header>'
    )


def render(copy, stories):
    groups = stories.get("groups", [])
    ind = " " * 10

    about = "\n".join(f"{ind}<p>{inline_html(p)}</p>" for p in copy.get("about_paragraphs", []))

    themes = "\n".join(
        f'{ind}  <li class="theme"><span class="theme-num">{i:02d}</span>'
        f'<h3 class="theme-title">{e(t.get("title"))}</h3><p>{e(t.get("text"))}</p></li>'
        for i, t in enumerate(copy.get("themes", []), 1)
    )

    featured_list = [s for g in groups for s in g.get("stories", []) if s.get("featured")][:3]
    featured = ""
    if featured_list:
        cards = "\n".join(f"{ind}  {product_card(s, i)}" for i, s in enumerate(featured_list))
        featured = (
            f'{ind}<div class="featured" aria-labelledby="featured-label">\n'
            f'{ind}  <div class="featured-head"><p class="label" id="featured-label">Featured</p>'
            f'<p class="featured-note">Three stories to start with</p></div>\n'
            f'{ind}  <div class="featured-grid">\n{cards}\n{ind}  </div>\n{ind}</div>'
        )

    filters = ""
    chips = []
    if len(groups) > 1:
        chips = [f'<button type="button" class="chip" data-filter="all" aria-pressed="true">All</button>']
        chips += [
            f'<button type="button" class="chip" data-filter="{e(g.get("id"))}" aria-pressed="false">{e(g.get("title"))}</button>'
            for g in groups
        ]
    filters = (
        f'{ind}<div class="shelf-tools" hidden>\n'
        + (f'{ind}  <div class="filters" role="group" aria-label="Filter stories by topic">' + "".join(chips) + "</div>\n" if chips else "")
        + f'{ind}  <div class="view-toggle" role="group" aria-label="Choose how to browse stories">'
        f'<button type="button" class="vt" data-view="shelf" aria-pressed="true"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 3v12M6.5 5v10M10 3v12M13 6.5l3 8.5M2 17h16"/></svg>Shelf</button>'
        f'<button type="button" class="vt" data-view="list" aria-pressed="false"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14"/></svg>List</button>'
        f"</div>\n{ind}</div>"
    )

    shelf_deco = [
        lambda gi, k=k: inline_svg(k, f"deco-svg deco-{k}", prefix=f"sd{gi}-{k}")[0]
        for k in ("plant", "mug", "lamp", "plant") if (ILLU / f"{k}.svg").exists()
    ]
    group_html, n = [], 0
    for gi, g in enumerate(groups, 1):
        gid = re.sub(r"[^a-z0-9_-]", "-", str(g.get("id") or f"g{gi}").lower())
        spines, cards = [], []
        for i, s in enumerate(g.get("stories", [])):
            n += 1
            sid = f"s-{n}"
            spines.append(f"{ind}      {spine(s, sid, i)}")
            cards.append(f"{ind}      <li>{story_card(s, sid)}</li>")
        blurb = f'<p class="group-blurb">{e(g.get("blurb"))}</p>' if g.get("blurb") else ""
        group_html.append(
            f'{ind}<section class="group reveal" id="group-{gid}" data-group="{e(g.get("id"))}" aria-labelledby="gt-{gid}">\n'
            f'{ind}  <div class="group-head"><span class="group-count">{len(g.get("stories", [])):02d} stories</span>'
            f'<h3 class="group-title" id="gt-{gid}">{e(g.get("title"))}</h3>{blurb}</div>\n'
            f'{ind}  <div class="shelf"><div class="shelf-inner">\n'
            f'{ind}    <ul class="books" aria-label="{e(g.get("title"))}: {len(spines)} books on the shelf">\n'
            + "\n".join(spines)
            + f'\n{ind}      <li class="bookend" aria-hidden="true"></li>'
            + (f'<li class="shelf-deco" aria-hidden="true">{shelf_deco[(gi - 1) % len(shelf_deco)](gi)}</li>' if shelf_deco else "")
            + "\n"
            f"{ind}    </ul>\n"
            f'{ind}    <div class="board" aria-hidden="true"></div>\n'
            f"{ind}  </div></div>\n"
            f'{ind}  <ul class="story-list">\n' + "\n".join(cards) + f"\n{ind}  </ul>\n{ind}</section>"
        )

    pods = []
    for p in copy.get("podcasts", []):
        url = safe_url(p.get("url"))
        note = f'<p class="pod-note">{e(p["note"])}</p>' if p.get("note") else ""
        pods.append(
            f'{ind}<li class="pod reveal"><span class="pod-dot" aria-hidden="true"></span><div class="pod-side"><p class="pod-show">{e(p.get("show"))}</p>'
            + (f'<p class="pod-year">{e(p["year"])}</p>' if p.get("year") else "")
            + f'</div><div class="pod-body"><h3 class="pod-title"><a href="{e(url)}"{ext_attrs(url)}>{linked_title(p.get("title"))}</a></h3>'
            f"{note}</div></li>"
        )

    links = []
    for i, l in enumerate(copy.get("links", []), 1):
        url = safe_url(l.get("url"))
        host = urlparse(url).netloc.replace("www.", "") or url.replace("mailto:", "")
        links.append(
            f'{ind}<li><a class="link-row" href="{e(url)}"{ext_attrs(url)}>'
            f'<span class="link-num">{chr(64 + i)}</span><span class="link-qty" aria-hidden="true">1&times;</span>'
            f'<span class="link-label">{e(l.get("label"))}</span><span class="link-leader" aria-hidden="true"></span>'
            f'<span class="link-host">{e(host)}</span><span class="arrow" aria-hidden="true">&#8599;</span></a></li>'
        )

    name = copy.get("name", "Shephali Bhatt")
    sameas = [safe_url(l.get("url")) for l in copy.get("links", []) if is_external(safe_url(l.get("url")))]
    jsonld = json.dumps({
        "@context": "https://schema.org", "@type": "Person", "name": name,
        "url": SITE_URL, "image": SITE_URL + "assets/shephali-portrait.jpg",
        "jobTitle": "Journalist", "description": copy.get("meta_description", ""), "sameAs": sameas,
    }, ensure_ascii=False).replace("</", "<\\/")

    # Hero scene: inline the shelf illustration so its groups animate; place the portrait in its frame slot.
    hero_svg, hero_root = inline_svg("shelf-hero", "scene-art", prefix="hero", stagger=("books", "shelf-boards"), required=True)
    box = slot_box(hero_root, "hero")
    frame_style = ""
    if box:  # fill the little frame on the shelf with a tiny pastel print (sunset over water)
        vb = [float(x) for x in re.split(r"[\s,]+", hero_root.get("viewBox").strip())]
        bx, by = vb[0] + box[0] * vb[2] / 100, vb[1] + box[1] * vb[3] / 100
        bw, bh = box[2] * vb[2] / 100, box[3] * vb[3] / 100
        cx, cy = bx + bw / 2, by + bh * .48
        art = (f'<g class="slot-print" stroke="none"><circle cx="{cx:.1f}" cy="{cy:.1f}" r="{bw * .2:.1f}" fill="#f3d6cf"/>'
               f'<rect x="{bx:.1f}" y="{cy:.1f}" width="{bw:.1f}" height="{bh * .52:.1f}" fill="#cfe0f5"/>'
               f'<path d="M{bx + bw * .15:.1f} {cy + bh * .14:.1f}h{bw * .7:.1f}M{bx + bw * .28:.1f} {cy + bh * .26:.1f}h{bw * .44:.1f}" stroke="#fff" stroke-width="2" stroke-linecap="round"/></g>')
        hero_svg = re.sub(r'(<rect[^>]*id="hero-frame-slot"[^>]*/>)', lambda m: m.group(1) + art, hero_svg, count=1)
    photo_alt = f"{name} smiling over her shoulder in a maroon top, with a field and water lit by sunset behind her"
    hero_scene = (
        f'<div class="scene{" has-slot" if box else ""}">'
        f'<div class="scene-wall" aria-hidden="true"></div>'
        f'<div class="stage">{hero_svg}'
        f'<figure class="frame"{frame_style}><button type="button" class="frame-mat" aria-label="Photo of {e(name)}">'
        f'<img src="assets/shephali-portrait.jpg" width="900" height="1124" alt="{e(photo_alt)}" fetchpriority="high" decoding="async">'
        f"</button></figure></div></div>"
    )

    active = module_names()
    slots = {slot: "\n".join(module_text(m, "html") for m in mods if m in active) for slot, mods in SLOTS.items()}
    has_off = bool(slots["slot_offpage"].strip())
    steps = [("head1", "about-title", "About", 1), ("head2", "stories-title", "Selected stories", 2),
             ("head3", "onair-title", "On air &amp; conversations", 3)]
    if has_off:
        steps.append(("head_offpage", "offpage-title", "Off the page", 5))
    steps.append(("head4", "contact-title", "Elsewhere &amp; contact", 4))
    heads = {}
    for n, (key, hid, t, icon) in enumerate(steps, 1):
        svg = inline_svg(f"step-{icon}", "step-svg")[0] or STEP_FALLBACK[min(icon, 4) - 1]
        heads[key] = step_head(n, len(steps), hid, t, svg)
    if has_off:
        slots["slot_offpage"] = (
            '  <section class="section section-offpage" id="off-the-page" aria-labelledby="offpage-title">\n'
            f'    <div class="wrap">\n      {heads.pop("head_offpage")}\n'
            '      <p class="offpage-lede reveal">The reporting is only part of it. A few things from her own posts about life away from the desk.</p>\n'
            f'    </div>\n{slots["slot_offpage"]}\n  </section>'
        )
    nav = [("about", "About"), ("stories", "Stories"), ("on-air", "On air")]
    if has_off:
        nav.append(("off-the-page", "Off the page"))
    nav.append(("contact", "Contact"))
    nav_html = "\n".join(
        f'        <li{" class=\'nav-extra\'" if hid == "off-the-page" else ""}><a href="#{hid}"><span class="nav-num">{i:02d}</span>{label}</a></li>'
        for i, (hid, label) in enumerate(nav, 1)
    )

    deco = {k: inline_svg(k, f"deco-svg deco-{k}")[0] for k in ("lamp", "plant", "mug", "flatpack-pieces")}

    css = (bundle("css", "styles.css") + bundle("js", "site.js")).encode("utf-8")
    tpl = Template((SRC / "template.html").read_text(encoding="utf-8"))
    return tpl.substitute(
        name=e(name), tagline=e(copy.get("tagline")), intro=e(copy.get("intro")),
        meta_description=e(copy.get("meta_description")), site_url=SITE_URL,
        about_paragraphs=about, themes=themes, featured=featured, filters=filters,
        groups="\n".join(group_html), podcasts="\n".join(pods), links="\n".join(links),
        year=datetime.date.today().year, jsonld=jsonld, hero_scene=hero_scene,
        deco_lamp=deco["lamp"], deco_plant=deco["plant"], deco_mug=deco["mug"],
        deco_flatpack=deco["flatpack-pieces"],
        version=hashlib.sha1(css).hexdigest()[:8], nav=nav_html, **heads, **slots,
    )


# Tiny line icons used only if assets/illustrations/step-N.svg are missing.
_S = '<svg class="step-svg" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'
STEP_FALLBACK = [
    _S + '<circle cx="24" cy="17" r="7"/><path d="M11 40c1.5-8 6.5-12 13-12s11.5 4 13 12"/></svg>',
    _S + '<path d="M8 40h32M11 40V12h6v28M19 40V16h6v24M28 39l4-26 6 1-4 26"/></svg>',
    _S + '<path d="M14 24a10 10 0 0 1 20 0v6M14 30v-6"/><rect x="10" y="28" width="6" height="10" rx="2"/><rect x="32" y="28" width="6" height="10" rx="2"/></svg>',
    _S + '<path d="M8 14h32v20H8z"/><path d="m8 14 16 12 16-12"/></svg>',
]


FAVICON = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="14" fill="#ffffff"/>
<rect x="1.5" y="1.5" width="61" height="61" rx="12.5" fill="none" stroke="#e3e7ee" stroke-width="3"/>
<text x="32" y="42" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="27" font-weight="600" letter-spacing="-1" fill="#141821">SB</text>
<rect x="18" y="48" width="28" height="3" rx="1.5" fill="#2557d6"/>
</svg>
"""

HEADERS = """/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  Content-Security-Policy: default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'

/
  Cache-Control: public, max-age=0, must-revalidate

/index.html
  Cache-Control: public, max-age=0, must-revalidate

/styles.css
  Cache-Control: public, max-age=86400, must-revalidate

/site.js
  Cache-Control: public, max-age=86400, must-revalidate

/assets/*
  Cache-Control: public, max-age=2592000

/favicon.svg
  Cache-Control: public, max-age=604800
"""

ROBOTS = f"User-agent: *\nAllow: /\n\nSitemap: {SITE_URL}sitemap.xml\n"


def page_404(name):
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page not found · {e(name)}</title>
<meta name="robots" content="noindex">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500&family=Instrument+Serif&display=swap">
<link rel="stylesheet" href="/styles.css">
</head>
<body class="page-404">
<main class="wrap notfound">
  <p class="label">Error 404</p>
  <h1 class="hero-name">This page wandered off.</h1>
  <p class="hero-tagline">The link may be old, or the page may have moved.</p>
  <p class="hero-actions"><a class="btn btn-primary" href="/">Go to the homepage</a></p>
</main>
</body>
</html>
"""


def sitemap():
    today = datetime.date.today().isoformat()
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"  <url><loc>{SITE_URL}</loc><lastmod>{today}</lastmod></url>\n</urlset>\n"
    )


def main():
    copy, stories = load("copy"), load("stories")
    if DIST.exists():
        shutil.rmtree(DIST)
    (DIST / "assets").mkdir(parents=True)
    w = lambda name, text: (DIST / name).write_text(text, encoding="utf-8")
    w("index.html", render(copy, stories))
    w("styles.css", bundle("css", "styles.css"))
    w("site.js", bundle("js", "site.js"))
    for f in ASSETS.iterdir():
        if f.is_file():
            shutil.copy2(f, DIST / "assets" / f.name)
    if ILLU.is_dir():  # keep the source SVGs available too (e.g. for og or reuse)
        shutil.copytree(ILLU, DIST / "assets" / "illustrations")
    if (ASSETS / "stories").is_dir():  # bundled story lead images
        shutil.copytree(ASSETS / "stories", DIST / "assets" / "stories")
    w("404.html", page_404(copy.get("name", "Shephali Bhatt")))
    w("favicon.svg", FAVICON)
    w("_headers", HEADERS)
    w("robots.txt", ROBOTS)
    w("sitemap.xml", sitemap())
    print(f"Built {DIST}/ ({sum(1 for _ in DIST.rglob('*') if _.is_file())} files)")


if __name__ == "__main__":
    main()
