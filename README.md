# DevOps Master — static website

A static site for learning DevOps tools, generating starter config files and fixing common production issues.
Plain HTML, CSS and JavaScript (ES modules). **No build step, no server, no database.**
Hash-based routing (`#/learn/docker`), so no rewrite rules are needed on Vercel.

## Project structure

```
devops-master/
├── index.html              Page shell, header, footer, import map (Three.js for the optional 3D model)
├── vercel.json             Caching and security headers
├── README.md
├── css/
│   └── styles.css          All styling
├── js/
│   ├── app.js              Router, navigation, footer year
│   ├── config.js           EDIT THIS: contact email and form endpoint
│   ├── ui.js               Shared helpers (escaping, dialogs, toasts)
│   ├── data-tools.js       The 8 tools: logos, concepts, commands, workflow
│   ├── data-issues.js      Production issues by category
│   ├── generators.js       Dockerfile, Compose, Kubernetes, Jenkins, GitHub Actions, Terraform generators
│   ├── storage.js          Master Folder (IndexedDB), backup/restore, ZIP export
│   ├── audio.js            Alyantri voice: MP3 playback, typing animation, browser speech
│   ├── wizard.js           Hero wizard picture (optional 3D model upgrade)
│   ├── orbit.js            Rotating tool orbit
│   ├── pages-main.js       Home, tool learning pages, manifest landing
│   ├── pages-generator.js  Generator pages
│   ├── pages-issues.js     Production issue pages
│   ├── pages-folder.js     Master Folder page
│   ├── pages-contact.js    Contact page
│   └── vendor/             Bundled third-party code (JSZip, MIT / GPLv3 dual licence)
└── assets/
    ├── images/
    │   ├── wizard.webp           Main wizard picture (home and generator pages)
    │   ├── wizard-contact.webp   Wizard picture on the contact page
    │   └── logos/                Tool logos used as icons (captions removed)
    ├── audio/
    │   ├── home.mp3              Home page voice
    │   ├── intro.mp3             Longer welcome voice (not yet attached to a page)
    │   ├── contact.mp3           Contact page voice
    │   ├── issues.mp3            Production issues page voice
    │   ├── manifest.mp3          Manifest generator landing voice
    │   ├── tools/                One voice per tool page: aws, docker, git, github-actions, jenkins, kubernetes, linux, terraform
    │   └── generators/           One voice per generator: dockerfile, docker-compose, kubernetes, jenkins, github-actions, terraform
    └── models/                   (optional) wizard.glb: a 3D model that replaces the wizard picture when present
```

## Deploy to Vercel
1. Put this folder in a Git repository and import it in Vercel, **or** run `npx vercel` inside this folder.
2. Framework preset: **Other**. Build command: *(empty)*. Output directory: *(empty / root)*.
3. Deploy. `vercel.json` only adds caching and security headers.

Run locally: `python3 -m http.server 8000` and open http://localhost:8000.
Opening index.html straight from disk will not work (ES modules need http).

## Changing content

| To change | Edit or replace |
|---|---|
| Contact email, form endpoint | `js/config.js` |
| Tool text, commands, logos | `js/data-tools.js`, `assets/images/logos/` |
| Add a tool or issue | `js/data-tools.js` or `js/data-issues.js` (copy an existing entry) |
| Add a generator | `js/generators.js` (register it in `GENERATORS` and `GENERATOR_LIST`) |
| Wizard picture | replace `assets/images/wizard.webp` (keep the name) |
| Contact-page wizard | replace `assets/images/wizard-contact.webp` |
| Voice for a page | replace the matching MP3 in `assets/audio/` (same file name) |
| 3D wizard | add `assets/models/wizard.glb`; the site detects it automatically |
| Footer text | `index.html` |

## Things you should know
- **3D wizard:** `wizard.glb` is not included. The site shows the wizard picture. When a GLB model is added and WebGL works, the site shows the model instead, with a fallback to the picture if loading fails.
- **Contact form:** messages are emailed to `contactEmail` through FormSubmit (`contactEndpoint` in `js/config.js`). The first message needs one-time activation: FormSubmit emails the address a confirmation link, and you must click it once.
- **Voices:** the uploaded MP3s still speak the old name "Merlin"; re-record them if the name must match.
- **Master Folder** is device/browser-local (IndexedDB). It says so on the page. Backup JSON and ZIP export are provided.
- **Production issues:** 38 written. Content should be reviewed by someone who runs these tools before you rely on it.
- **Version numbers** in generated files (Node, Postgres, Terraform providers, `actions/*@v4`, etc.) reflect recent releases; verify them when you deploy.
- Generated files are starting points. The generators never ask for secrets, and the app warns if saved content looks like one (simple pattern check, not a guarantee).
- Tested in headless Chromium (main routes and the orbit). Not yet tested on real Safari, Firefox, phones or with a screen reader.
- Google Fonts (Fraunces, Figtree, JetBrains Mono) load from Google; system fonts are the fallback.
