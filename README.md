# Shephali Bhatt — personal website

A static portfolio site for journalist Shephali Bhatt: a bright Scandinavian reading room, with her stories as books on birch shelves.

## Build

```sh
python3 build.py   # writes the site to dist/
```

Standard library only. Content lives in `content/copy.json` and `content/stories.json`; templates and styles in `src/`; images and illustrations in `assets/`.

## Deploy

- **Preview:** every push to `main` builds and deploys to GitHub Pages (`.github/workflows/pages.yml`).
- **Production:** Cloudflare Pages, build command `python3 build.py`, output directory `dist`, custom domain `shephalibhatt.com`.

## Page modules

Extra sections live in `src/modules/<name>/` as `module.html`, `module.css` and `module.js`. `build.py` drops them into the slots listed in `SLOTS` and appends their CSS and JS to `styles.css` and `site.js`. Remove a name from `SLOTS` to switch a module off. To preview a single module: `SITE_MODULES=<name> SITE_OUT=/tmp/preview python3 build.py`.

Current modules: `motion` (topic ticker and site-wide motion), `venn`, `years`, `quotes`, and the "Off the page" step (`offclock`, `japan`, `travel`, `words`). Their personal details come from Shephali's public posts; see the notes file kept with the project research.
