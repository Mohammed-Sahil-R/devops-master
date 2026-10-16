import { TOOLS, getTool, icon } from './data-tools.js';
import { ISSUES, CATEGORIES } from './data-issues.js';
import { GENERATORS } from './generators.js';
import { esc } from './ui.js';
import { mountSpeechPanel } from './audio.js';
import { mountWizard } from './wizard.js';
import { mountOrbit } from './orbit.js';

const cmdCard = (c) => `
  <div>
    <div class="cmd ${c.danger ? 'danger' : ''}"><code>${esc(c.c)}</code><button class="btn small" type="button" data-copy="${esc(c.c)}" aria-label="Copy command: ${esc(c.c)}">Copy</button></div>
    <p class="cmd-desc">${c.danger ? '<strong>Caution:</strong> ' : ''}${esc(c.d)}</p>
  </div>`;

/* ----------------------------------------------------------- HOME */
export function homePage() {
  const orbitItems = TOOLS.map((t) => ({ key: t.id, icon: t.id, label: t.name, href: `#/learn/${t.id}` }));
  return {
    title: 'DevOps Master — learn tools, generate config files, fix production issues',
    html: `
    <section class="hero" aria-labelledby="hero-h">
      <div class="wrap">
        <h1 id="hero-h" class="sr-only">DevOps Master</h1>
        <div class="hero-grid">
          <div id="speech-slot"></div>
          <div class="hero-center">
            <div class="stage" id="stage"><div class="wizard-box" id="wizard-box"></div></div>
            <div class="tool-strip" aria-label="Choose a tool">${TOOLS.map((t) => `<a href="#/learn/${t.id}">${icon(t.id)}<span>${esc(t.name)}</span></a>`).join('')}</div>
          </div>
          <aside class="card" aria-labelledby="quick-h">
            <h2 id="quick-h" style="font-size:1.3rem">Quick launch</h2>
            <p class="muted">Jump straight to the work.</p>
            <div class="row" style="flex-direction:column;align-items:stretch">
              <a class="btn primary" href="#/manifest/dockerfile">Generate a Dockerfile</a>
              <a class="btn" href="#/manifest/kubernetes">Generate Kubernetes YAML</a>
              <a class="btn" href="#/issues/kubernetes/k8s-crashloopbackoff">Fix CrashLoopBackOff</a>
              <a class="btn" href="#/master-folder">Open Master Folder</a>
            </div>
            <h3 style="margin-top:1.2rem;font-size:1.05rem">Today's tip</h3>
            <p class="muted" style="margin:0">Before any kubectl change, run <code>kubectl config current-context</code> so you know which cluster you are about to touch.</p>
          </aside>
        </div>
      </div>
    </section>

    <section class="section" aria-labelledby="about-h"><div class="wrap">
      <h2 id="about-h">What is DevOps Master?</h2>
      <p class="lead">DevOps Master brings four things together: step-by-step guides for the tools you use, generators that draft editable configuration files, a library of production troubleshooting guides, and a personal folder to keep what you create.</p>
      <p class="muted">Everything runs in your browser. Generated files are starting points. Review and test them before you rely on them in a real environment.</p>
    </div></section>

    <section class="section" aria-labelledby="kit-h"><div class="wrap">
      <h2 id="kit-h">Explore the toolkit</h2>
      <div class="grid c4">
        <a class="card" href="#/learn/docker"><h3>Learn</h3><p class="muted">Install, concepts and copyable commands for eight tools.</p></a>
        <a class="card" href="#/manifest"><h3>Generate</h3><p class="muted">Dockerfile, Compose, Kubernetes, Jenkins, GitHub Actions and Terraform files.</p></a>
        <a class="card" href="#/issues"><h3>Troubleshoot</h3><p class="muted">Symptoms, safe diagnostics and verified fixes for common production problems.</p></a>
        <a class="card" href="#/master-folder"><h3>Master Folder</h3><p class="muted">Save files in folders, then download everything as one ZIP.</p></a>
      </div>
    </div></section>

    <section class="section" aria-labelledby="how-h"><div class="wrap">
      <h2 id="how-h">How it works</h2>
      <ol class="flow">
        <li><strong>Choose a tool</strong><br><span class="muted">Pick one from the orbit.</span></li>
        <li><strong>Learn or generate</strong><br><span class="muted">Read the guide or fill in a short form.</span></li>
        <li><strong>Review the output</strong><br><span class="muted">Edit it. Read the warnings.</span></li>
        <li><strong>Save or download</strong><br><span class="muted">Keep it in the Master Folder or export a ZIP.</span></li>
      </ol>
    </div></section>

    <section class="section" aria-labelledby="practical-h"><div class="wrap">
      <div class="card">
        <h2 id="practical-h">Built for practical learning</h2>
        <p>Generated files are editable starting points, not finished production configuration. We never ask for passwords, tokens or cloud keys. Use placeholders and your platform's secret store, and test everything in a safe environment first.</p>
      </div>
    </div></section>

    <section class="section" aria-labelledby="cta-h"><div class="wrap" style="text-align:center">
      <h2 id="cta-h">Start building with DevOps Master</h2>
      <p style="margin-inline:auto" class="muted">Pick a tool and Alyantri will walk you through it.</p>
      <div class="row" style="justify-content:center"><a class="btn primary" href="#/learn/docker">Start with Docker</a><a class="btn" href="#/manifest">Generate a file</a></div>
    </div></section>`,
    mount(root) {
      const cleanups = [];
      cleanups.push(mountSpeechPanel(root.querySelector('#speech-slot'), {
        title: 'Alyantri says', mp3: 'assets/audio/intro.mp3',
        text: 'Hello, **DevOps explorer**!\nI am Alyantri, your DevOps companion.\nChoose a tool in the orbit to **learn it**, **generate configuration files**, or **solve production issues**.'
      }));
      cleanups.push(mountWizard(root.querySelector('#wizard-box')));
      cleanups.push(mountOrbit(root.querySelector('#stage'), orbitItems));
      return () => cleanups.forEach((c) => c());
    }
  };
}

/* ----------------------------------------------------------- MANIFEST LANDING */
export function manifestLandingPage() {
  const items = [
    { icon: 'docker', label: 'Dockerfile', href: '#/manifest/dockerfile' }, { icon: 'docker', label: 'Compose', href: '#/manifest/docker-compose' },
    { icon: 'kubernetes', label: 'Kubernetes', href: '#/manifest/kubernetes' }, { icon: 'jenkins', label: 'Jenkins', href: '#/manifest/jenkins' },
    { icon: 'github-actions', label: 'GitHub Actions', href: '#/manifest/github-actions' }, { icon: 'terraform', label: 'Terraform', href: '#/manifest/terraform' }
  ];
  return {
    title: 'Manifest File Generator — DevOps Master',
    html: `
    <section class="hero"><div class="wrap">
      <h1 style="text-align:center">Manifest file generator</h1>
      <div class="hero-grid">
        <div class="hero-center" style="grid-column:auto"><div class="stage" id="stage"><div class="wizard-box" id="wizard-box"></div></div>
          <div class="tool-strip" aria-label="Choose a generator">${items.map((i) => `<a href="${i.href}">${icon(i.icon)}<span>${esc(i.label)}</span></a>`).join('')}</div></div>
        <div id="speech-slot"></div>
        <div class="card"><h2 style="font-size:1.3rem">All generators</h2><ul class="tip-list">${items.map((i) => `<li><a href="${i.href}">${esc(i.label)}</a></li>`).join('')}<li><a href="#/manifest/cheatsheet">Linux and Docker command cheatsheet</a></li></ul></div>
      </div>
    </div></section>`,
    mount(root) {
      const c = [];
      c.push(mountSpeechPanel(root.querySelector('#speech-slot'), { title: 'Alyantri says', mp3: 'assets/audio/manifest.mp3', text: 'Tell me what you are building.\nChoose a tool, answer a few practical questions, **review** the generated file, then **copy it, download it, or save it** to your Master Folder.' }));
      c.push(mountWizard(root.querySelector('#wizard-box'))); c.push(mountOrbit(root.querySelector('#stage'), items));
      return () => c.forEach((f) => f());
    }
  };
}

/* ----------------------------------------------------------- LEARNING PAGE */
export function learnPage({ id }) {
  const t = getTool(id);
  if (!t) return null;
  const catIssues = ISSUES.filter((i) => i.cat === t.issues).slice(0, 5);
  const catName = CATEGORIES.find((c) => c.id === t.issues)?.name;
  const ord = (arr) => `<ol class="steps">${arr.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`;
  const wf = t.workflow.map((s) => `<li>${esc(s)}</li>`).join('');
  return {
    title: `${t.name} — learn, install and use — DevOps Master`,
    html: `
    <div class="wrap">
      <header class="page-head">
        <div class="tool-logo">${icon(t.id)}</div>
        <h1>${esc(t.name)}</h1>
        <p class="lead">${esc(t.short)}</p>
      </header>
      <div id="speech-slot" style="margin-bottom:1.1rem"></div>
      <div class="grid">
        <section class="card" aria-labelledby="what-h"><h2 id="what-h">What is ${esc(t.name)}?</h2>${t.about.map((p) => `<p>${esc(p)}</p>`).join('')}</section>

        <section aria-labelledby="inst-h"><h2 id="inst-h">Installation</h2>
          <div class="grid c2">
            <div class="card"><h3>Windows</h3>${ord(t.windows)}</div>
            <div class="card"><h3>Linux</h3>${ord(t.linux)}</div>
          </div>
          <p class="muted" style="margin-top:.6rem">Always follow the vendor's current install guide; steps and versions change.</p>
        </section>

        <section class="card" aria-labelledby="how-h"><h2 id="how-h">How ${esc(t.name)} works</h2>
          <div class="grid c2">${t.concepts.map(([k, v]) => `<div><h3 style="font-size:1.05rem">${esc(k)}</h3><p class="muted" style="margin:0">${esc(v)}</p></div>`).join('')}</div>
        </section>

        ${t.extra ? `<section class="card" aria-labelledby="extra-h"><h2 id="extra-h">${esc(t.extra[0])}</h2><p>${esc(t.extra[1])}</p></section>` : ''}

        <section class="card" aria-labelledby="cmd-h"><h2 id="cmd-h">Essential commands</h2>
          <p class="muted">Commands marked <strong>Caution</strong> change or delete things. Read them before you run them.</p>
          <div class="grid c2">${t.commands.map(cmdCard).join('')}</div>
        </section>

        <section class="card" aria-labelledby="wf-h"><h2 id="wf-h">Practical workflow</h2><ol class="steps">${wf}</ol></section>

        <section class="card" aria-labelledby="prob-h"><h2 id="prob-h">Common problems</h2>
          ${t.id === 'aws' ? '<p class="muted">AWS-specific guides are not written yet. These Terraform and Linux guides cover common cloud tasks.</p>' : ''}
          <ul class="tip-list">${catIssues.map((i) => `<li><a href="#/issue/${i.id}">${esc(i.title)}</a></li>`).join('')}</ul>
          <p style="margin-top:.8rem"><a href="#/issues/${t.issues}">See all ${esc(catName)} issues</a></p>
        </section>

        ${t.gen ? `<section class="card" aria-labelledby="gen-h"><h2 id="gen-h">Generate a file</h2><p>Draft a starter file with guided questions, then edit it.</p><a class="btn primary" href="#/manifest/${t.gen}">${esc(t.genLabel)}</a></section>` : `<section class="card" aria-labelledby="gen-h"><h2 id="gen-h">Generate a file</h2><p class="muted">${esc(t.name)} does not have its own generator yet. ${t.id === 'linux' ? 'Try the <a href="#/manifest/cheatsheet">command cheatsheet</a>.' : 'Pair it with the <a href="#/manifest/github-actions">GitHub Actions generator</a>.'}</p></section>`}
      </div>
    </div>`,
    mount(root) {
      return mountSpeechPanel(root.querySelector('#speech-slot'), { title: 'Alyantri says', text: t.wizard, mp3: `assets/audio/tools/${t.id}.mp3`, speakText: t.wizard + ' Scroll down for installation steps, essential commands and common problems.' });
    }
  };
}

/* ----------------------------------------------------------- CHEATSHEET */
export function cheatsheetPage() {
  const docker = getTool('docker'); const linux = getTool('linux');
  return {
    title: 'Linux and Docker cheatsheet — DevOps Master',
    html: `<div class="wrap"><header class="page-head"><h1>Linux and Docker cheatsheet</h1><p class="lead">Copyable commands with a one-line reason for each.</p></header>
      <div class="grid"><section class="card"><h2>Docker</h2><div class="grid c2">${docker.commands.map(cmdCard).join('')}</div></section>
      <section class="card"><h2>Linux</h2><div class="grid c2">${linux.commands.map(cmdCard).join('')}</div></section></div></div>`
  };
}

export const hasGenerator = (id) => !!GENERATORS[id];
