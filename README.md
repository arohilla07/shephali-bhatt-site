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
