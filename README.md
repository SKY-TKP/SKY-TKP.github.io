# SKY-TKP.github.io

Personal portfolio of **Thananop Kullapan**, a Business Analyst and Data Scientist working across analytics, machine learning, optimization and automation.

**Live site:** https://sky-tkp.github.io/

## What's inside

- **About & Tech Stack:** background, key results and tools
- **Projects:** How Many Primogems Are Enough? (probability laws and risk-optimal budgets), BOM Calculator data pipeline (prepare → transform → SQL → database, dummy data), MATCHROOM (AI Influencer Director), LINE Sales Assistant on n8n, AIA data automation, TOYOTA logistics optimization, Walmart M5 forecasting, microgrid sizing (stochastic MILP) and sentiment analysis, with charts, code snippets and math models
- **Experience, Education, Hobbies & Contact**

## How it's built

A static site in plain HTML, CSS and JavaScript, with no build step and no framework.

- Fonts (Inter, Plus Jakarta Sans, JetBrains Mono), icons (Boxicons) and scroll animations (AOS) are bundled in `assets/vendor`, so the site works without any CDN
- Equations use native MathML, so no math library is needed
- All images live in `assets/`

```
index.html        page content
style.css         styles, animations and responsive layout
404.html          "page not found" screen in the same theme
assets/           project images, thumbnails, hero sky (assets/img) and bundled vendor files
profile.png       profile photo
background.jpg    link-preview image
.nojekyll         serve files as-is on GitHub Pages
```

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

Then visit http://localhost:8000.

## Credits

Inter, Plus Jakarta Sans and JetBrains Mono are licensed under the SIL Open Font License. Boxicons and AOS are MIT licensed.
