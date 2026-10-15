// Orbit: N items placed on ONE circle at equal angles (360 / N), rotating clockwise.
// Items are real links, so keyboard, touch and screen readers work. Orbit pauses on hover, focus,
// selection, via the Pause button, and is static for reduced-motion users.

import { icon } from './data-tools.js';
import { reducedMotion, esc } from './ui.js';

const DEG_PER_SEC = 9; // one full turn in 40s: calm, medium-slow

export function mountOrbit(stage, items, { onSelect } = {}) {
  const n = items.length; const step = 360 / n;
  stage.insertAdjacentHTML('afterbegin', `<div class="orbit-ring" aria-hidden="true"></div><ul class="orbit-items" aria-label="DevOps tools">${items.map((it, i) => `<li data-i="${i}"><a class="orbit-btn" href="${esc(it.href)}" aria-label="${esc(it.label)}" title="${esc(it.label)}">${icon(it.icon)}</a><span class="orbit-lbl">${esc(it.label)}</span></li>`).join('')}</ul>`);
  const lis = [...stage.querySelectorAll('.orbit-items li')];
  let angle = -90; let raf = 0; let last = 0; let userPaused = reducedMotion(); let hoverPaused = false; let selected = false; let radius = 0;

  const place = () => {
    lis.forEach((li, i) => {
      const a = ((angle + i * step) * Math.PI) / 180; const x = Math.cos(a) * radius; const y = Math.sin(a) * radius;
      const btn = li.firstElementChild; const lbl = li.lastElementChild;
      btn.style.transform = `translate(calc(-50% + ${x.toFixed(2)}px), calc(-50% + ${y.toFixed(2)}px))`;
      lbl.style.transform = `translate(calc(-50% + ${x.toFixed(2)}px), ${(y + 34).toFixed(2)}px)`;
    });
  };
  const measure = () => { const r = stage.getBoundingClientRect(); radius = Math.min(r.width, r.height) * 0.455; place(); };
  const running = () => !userPaused && !hoverPaused && !selected;
  const loop = (ts) => {
    raf = requestAnimationFrame(loop);
    if (!last) last = ts; const dt = (ts - last) / 1000; last = ts;
    if (running()) { angle = (angle + DEG_PER_SEC * dt) % 360; place(); }
  };
  const ro = new ResizeObserver(measure); ro.observe(stage); measure();
  if (!reducedMotion()) raf = requestAnimationFrame(loop);

  const list = stage.querySelector('.orbit-items');
  list.addEventListener('pointerenter', () => { hoverPaused = true; });
  list.addEventListener('pointerleave', () => { hoverPaused = false; });
  list.addEventListener('focusin', () => { hoverPaused = true; });
  list.addEventListener('focusout', () => { hoverPaused = false; });
  list.addEventListener('click', (e) => {
    const a = e.target.closest('.orbit-btn'); if (!a) return;
    selected = true; a.classList.add('selected'); // stops the orbit immediately; navigation follows via the link href
    if (onSelect) onSelect(items[lis.indexOf(a.parentElement)]);
  });

  const ctl = document.createElement('div'); ctl.className = 'orbit-ctl';
  ctl.innerHTML = `<button class="btn small" type="button" aria-pressed="${userPaused}">${userPaused ? 'Resume orbit' : 'Pause orbit'}</button>`;
  stage.after(ctl);
  const btn = ctl.firstElementChild;
  btn.addEventListener('click', () => {
    userPaused = !userPaused; btn.setAttribute('aria-pressed', String(userPaused)); btn.textContent = userPaused ? 'Resume orbit' : 'Pause orbit';
    if (!userPaused && !raf) raf = requestAnimationFrame(loop);
  });
  return () => { cancelAnimationFrame(raf); ro.disconnect(); ctl.remove(); };
}
