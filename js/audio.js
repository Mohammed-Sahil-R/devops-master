// Alyantri's voice: prerecorded intro MP3 (user-triggered) + browser speech synthesis for dynamic lines.
// Never autoplays. Only one voice at a time. Typing animation is synchronised with the MP3 duration.

import { esc, reducedMotion } from './ui.js';

export const INTRO_URL = 'assets/audio/intro.mp3'; // longer welcome (matches INTRO_TRANSCRIPT)
export const INTRO_TRANSCRIPT = `Greetings, DevOps explorer. Welcome to DevOps Master.
I am Alyantri, your DevOps companion.
Choose a tool from the glowing orbit: Docker, Kubernetes, AWS, Terraform, Git, GitHub Actions, Jenkins, or Linux.
I will guide you through learning each tool, generating configuration files, and solving real production issues.
When you are ready, choose your first tool.
Let us build something reliable, secure, and extraordinary.`;

const listeners = new Set();
const state = { mode: 'idle', muted: false, message: '' }; // mode: idle | mp3 | mp3-paused | speech | speech-paused
let audio = null; let audioSrc = null;

const set = (patch) => { Object.assign(state, patch); listeners.forEach((fn) => fn({ ...state })); };
export const onAudio = (fn) => { listeners.add(fn); fn({ ...state }); return () => listeners.delete(fn); };
export const audioState = () => ({ ...state });
export const speechSupported = () => 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

function getAudio(src = INTRO_URL) {
  if (!audio || audioSrc !== src) {
    if (audio) audio.pause();
    audio = new Audio(src); audioSrc = src; audio.preload = 'metadata'; audio.muted = state.muted;
    audio.addEventListener('ended', () => set({ mode: 'idle', message: 'Finished. Press Replay to hear it again.' }));
    audio.addEventListener('error', () => set({ mode: 'idle', message: 'The audio file could not be loaded. Read the transcript instead.' }));
  }
  return audio;
}
export const introDuration = () => (audio && isFinite(audio.duration) ? audio.duration : 0);

export function stopVoice(msg = '') {
  if (audio) { audio.pause(); audio.currentTime = 0; }
  if (speechSupported()) window.speechSynthesis.cancel();
  set({ mode: 'idle', message: msg });
}

export async function playIntro(src = INTRO_URL) {
  if (speechSupported()) window.speechSynthesis.cancel();
  const a = getAudio(src); a.currentTime = 0; a.muted = state.muted;
  try { await a.play(); set({ mode: 'mp3', message: state.muted ? 'Playing (muted). Unmute to hear Alyantri.' : 'Alyantri is speaking.' }); return true; }
  catch { set({ mode: 'idle', message: 'Your browser blocked or could not play the audio. Use the transcript below.' }); return false; }
}
export function pauseVoice() {
  if (state.mode === 'mp3' && audio) { audio.pause(); set({ mode: 'mp3-paused', message: 'Paused.' }); }
  else if (state.mode === 'speech' && speechSupported()) { window.speechSynthesis.pause(); set({ mode: 'speech-paused', message: 'Paused.' }); }
}
export async function resumeVoice() {
  if (state.mode === 'mp3-paused' && audio) { try { await audio.play(); set({ mode: 'mp3', message: 'Alyantri is speaking.' }); } catch { set({ mode: 'idle', message: 'Could not resume audio.' }); } }
  else if (state.mode === 'speech-paused' && speechSupported()) { window.speechSynthesis.resume(); set({ mode: 'speech', message: 'Reading aloud.' }); }
}
export function setMuted(muted) {
  state.muted = muted; if (audio) audio.muted = muted;
  if (muted && speechSupported() && state.mode.startsWith('speech')) { window.speechSynthesis.cancel(); set({ muted, mode: 'idle', message: 'Muted.' }); }
  else set({ muted, message: muted ? 'Sound is off.' : 'Sound is on.' });
}
export function speak(text, { rate = 0.95, pitch = 0.9, volume = 1 } = {}) {
  if (!speechSupported()) { set({ message: 'Speech is not available in this browser. Please read the text instead.' }); return false; }
  if (state.muted) { set({ message: 'Sound is off. Unmute to hear Alyantri.' }); return false; }
  stopVoice();
  const u = new SpeechSynthesisUtterance(String(text).replace(/\*\*/g, '')); u.lang = 'en-US'; u.rate = rate; u.pitch = pitch; u.volume = volume;
  const voices = window.speechSynthesis.getVoices();
  const v = voices.find((x) => /^en[-_]US/i.test(x.lang) && /male|david|daniel|alex|google us english/i.test(x.name)) || voices.find((x) => /^en/i.test(x.lang));
  if (v) u.voice = v;
  u.onend = () => set({ mode: 'idle', message: 'Finished.' });
  u.onerror = () => set({ mode: 'idle', message: 'Speech failed. Please read the text instead.' });
  window.speechSynthesis.speak(u); set({ mode: 'speech', message: 'Reading aloud. Voice depends on your device and browser.' });
  return true;
}

/* ---------------- typing animation ---------------- */
function segments(text) {
  const out = []; String(text).split(/(\*\*[^*]+\*\*)/).forEach((p) => { if (!p) return; if (p.startsWith('**')) out.push({ t: p.slice(2, -2), b: true }); else out.push({ t: p, b: false }); });
  return out;
}
function htmlUpTo(segs, n) {
  let left = n; let html = '';
  for (const s of segs) { if (left <= 0) break; const part = s.t.slice(0, left); left -= part.length; const e = esc(part).replace(/\n/g, '<br>'); html += s.b ? `<strong>${e}</strong>` : e; }
  return html;
}
export function createTyper(el) {
  let segs = []; let total = 0; let i = 0; let timer = null; let cps = 40; let paused = false; let last = 0; let carry = 0;
  const draw = () => { el.innerHTML = htmlUpTo(segs, i); el.classList.toggle('type-caret', i < total); };
  const tick = (ts) => {
    if (paused) return;
    if (!last) last = ts; carry += ((ts - last) / 1000) * cps; last = ts;
    const add = Math.floor(carry); if (add > 0) { i = Math.min(total, i + add); carry -= add; draw(); }
    if (i < total) timer = requestAnimationFrame(tick);
  };
  return {
    start(text, { duration = 0 } = {}) {
      cancelAnimationFrame(timer); segs = segments(text); total = segs.reduce((n, s) => n + s.t.length, 0); i = 0; paused = false; last = 0; carry = 0;
      cps = duration > 1 ? Math.max(12, total / (duration * 0.97)) : 40;
      if (reducedMotion()) { i = total; draw(); return; }
      draw(); timer = requestAnimationFrame(tick);
    },
    pause() { paused = true; cancelAnimationFrame(timer); },
    resume() { if (!paused) return; paused = false; last = 0; timer = requestAnimationFrame(tick); },
    skip() { cancelAnimationFrame(timer); i = total; paused = false; draw(); },
    done: () => i >= total,
    stop() { cancelAnimationFrame(timer); }
  };
}

/**
 * Speech panel: typed text + audio controls + transcript.
 * opts.text        what is typed (supports **bold**)
 * opts.mp3         true -> "Hear Alyantri" plays the prerecorded intro MP3 and syncs typing to it
 * opts.speakText   plain text for browser speech (when mp3 is false)
 */
export function mountSpeechPanel(root, { title = 'Alyantri says', text, mp3 = false, speakText, transcript, autoType = true }) {
  // mp3: true = the home intro; a string = that uploaded MP3 file for this page.
  const mp3Src = typeof mp3 === 'string' ? mp3 : (mp3 ? INTRO_URL : null);
  const hasAudio = !!mp3Src;
  const plain = String(text).replace(/\*\*/g, '');
  const tr = transcript || (mp3Src === INTRO_URL ? INTRO_TRANSCRIPT : plain);
  root.innerHTML = `
    <div class="card speech" role="region" aria-label="${esc(title)}">
      <h2 style="font-size:1.3rem">${esc(title)}</h2>
      <p class="speech-text" aria-hidden="true"></p>
      <p class="sr-only">${esc(plain)}</p>
      <div class="audio-bar" role="group" aria-label="Voice controls">
        <button class="btn primary small" data-a="play">${hasAudio ? 'Hear Alyantri' : 'Read aloud'}</button>
        <button class="btn small" data-a="pause" aria-label="Pause voice">Pause</button>
        <button class="btn small" data-a="stop" aria-label="Stop voice">Stop</button>
        <button class="btn small" data-a="replay" aria-label="Replay voice and text">Replay</button>
        <button class="btn small" data-a="mute" aria-pressed="false">Sound on</button>
        <button class="btn small" data-a="skip">Skip typing</button>
      </div>
      <div class="audio-status muted" role="status" aria-live="polite" data-a="status"></div>
      <details class="transcript"><summary>Transcript</summary><p>${esc(tr)}</p></details>
    </div>`;
  const textEl = root.querySelector('.speech-text'); const statusEl = root.querySelector('[data-a="status"]');
  const typer = createTyper(textEl); const q = (a) => root.querySelector(`[data-a="${a}"]`);
  if (autoType) typer.start(text); else typer.skip();
  if (!autoType) { textEl.innerHTML = htmlUpTo(segments(text), 99999); }
  const off = onAudio((s) => {
    statusEl.textContent = s.message || (speechSupported() || hasAudio ? '' : 'Voice is not supported here; the transcript has everything.');
    q('mute').textContent = s.muted ? 'Sound off' : 'Sound on'; q('mute').setAttribute('aria-pressed', String(s.muted));
    const playing = s.mode === 'mp3' || s.mode === 'speech'; const paused = s.mode.endsWith('paused');
    q('pause').textContent = paused ? 'Resume' : 'Pause'; q('pause').disabled = !(playing || paused);
    q('stop').disabled = s.mode === 'idle';
    if (!hasAudio && !speechSupported()) q('play').disabled = true;
  });
  const startVoice = async () => {
    if (hasAudio) {
      const ok = await playIntro(mp3Src);
      if (ok) { await new Promise((r) => setTimeout(r, 60)); typer.start(text, { duration: introDuration() }); }
      else typer.skip();
    } else { typer.start(text, { duration: Math.max(2, plain.length / 15) }); speak(speakText || plain); }
  };
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a;
    if (a === 'play' || a === 'replay') { stopVoice(); startVoice(); }
    else if (a === 'pause') { if (state.mode.endsWith('paused')) { resumeVoice(); typer.resume(); } else { pauseVoice(); typer.pause(); } }
    else if (a === 'stop') { stopVoice('Stopped.'); typer.skip(); }
    else if (a === 'mute') setMuted(!state.muted);
    else if (a === 'skip') typer.skip();
  });
  return () => { off(); typer.stop(); stopVoice(); };
}
