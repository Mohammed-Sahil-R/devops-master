import { CONFIG } from './config.js';
import { esc, $, toast } from './ui.js';
import { mountSpeechPanel } from './audio.js';

export function contactPage() {
  return {
    title: 'Contact — DevOps Master',
    html: `<div class="wrap section" style="padding-top:2rem">
      <div class="contact-grid">
        <div class="contact-stage">
          <img src="assets/images/wizard-contact.webp" alt="Alyantri, the hooded wizard in a purple robe with gold trim, holding a glowing crescent-moon staff" width="304" height="620">
          <button class="orbit-btn staff-btn" id="staff" aria-expanded="false" aria-controls="contact-form" aria-label="Open the contact form" style="width:52px;height:52px"><svg viewBox="0 0 48 48" fill="none" stroke="#e0b96b" stroke-width="3" stroke-linecap="round" aria-hidden="true"><rect x="8" y="12" width="32" height="24" rx="4"/><path d="M10 15l14 11 14-11"/></svg></button>
        </div>
        <div>
          <h1>Contact the wizard</h1>
          <div id="speech-slot" style="margin-bottom:1rem"></div>
          <p class="muted">Questions, feedback or ideas? Write to <strong id="mail"></strong>.</p>
          <button class="btn primary" id="open" aria-expanded="false" aria-controls="contact-form">Contact the Wizard</button>
          <form id="contact-form" novalidate hidden style="margin-top:1rem" class="card">
            <div class="field"><label for="c-name">Name</label><input id="c-name" type="text" autocomplete="name" required></div>
            <div class="field"><label for="c-email">Email</label><input id="c-email" type="email" autocomplete="email" required></div>
            <div class="field"><label for="c-country">Country</label><select id="c-country" required><option>India</option></select></div>
            <div class="field"><label for="c-msg">Message</label><textarea id="c-msg" rows="6" style="font-family:var(--font-body)" required></textarea></div>
            <div style="position:absolute;left:-9999px" aria-hidden="true"><label>Leave empty <input id="c-hp" tabindex="-1" autocomplete="off"></label></div>
            <div class="row"><button class="btn primary" type="submit" id="send">Send message</button><span id="c-status" role="status" aria-live="polite"></span></div>
          </form>
        </div>
      </div>
    </div>`,
    mount(root) {
      const [u, d] = CONFIG.contactEmail.split('@'); $('#mail', root).textContent = `${u}@${d}`;
      const speech = mountSpeechPanel($('#speech-slot', root), { title: 'Alyantri says', mp3: 'assets/audio/contact.mp3', text: 'Every great pipeline starts with a **good question**.\nSend yours and the wizard will reply.' });
      const form = $('#contact-form', root); let lastSent = 0;
      const toggle = () => { const open = form.hidden; form.hidden = !open; ['staff', 'open'].forEach((i) => $(`#${i}`, root).setAttribute('aria-expanded', String(open))); if (open) $('#c-name', root).focus(); };
      $('#staff', root).addEventListener('click', toggle); $('#open', root).addEventListener('click', toggle);
      const status = $('#c-status', root);
      const bad = (id, msg) => { const el = $(`#${id}`, root); el.classList.add('bad'); el.focus(); status.style.color = 'var(--danger)'; status.textContent = msg; };
      form.addEventListener('input', (e) => e.target.classList?.remove('bad'));
      form.addEventListener('submit', async (e) => {
        e.preventDefault(); status.style.color = ''; status.textContent = '';
        const v = (id) => $(`#${id}`, root).value.trim();
        if ($('#c-hp', root).value) return;
        if (!v('c-name')) return bad('c-name', 'Enter your name.');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v('c-email'))) return bad('c-email', 'Enter a valid email address.');
        if (v('c-msg').length < 10) return bad('c-msg', 'Write at least 10 characters.');
        if (v('c-msg').length > 4000) return bad('c-msg', 'Keep the message under 4000 characters.');
        if (Date.now() - lastSent < 30000) { status.style.color = 'var(--warn)'; status.textContent = 'Please wait a few seconds before sending another message.'; return; }
        const payload = { name: v('c-name'), email: v('c-email'), country: v('c-country'), message: v('c-msg'), _subject: 'DevOps Master message from ' + v('c-name'), _captcha: 'false', _template: 'table' };
        const send = $('#send', root); send.disabled = true;
        try {
          if (CONFIG.contactEndpoint) {
            status.textContent = 'Sending…';
            const res = await fetch(CONFIG.contactEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload) });
            if (!res.ok) throw new Error(`The server answered ${res.status}.`);
            lastSent = Date.now(); form.reset(); status.style.color = 'var(--ok)'; status.textContent = 'Message sent. Thank you!'; toast('Message sent.');
          } else {
            const body = `${payload.message}\n\n— ${payload.name} (${payload.country})\n${payload.email}`;
            location.href = `mailto:${CONFIG.contactEmail}?subject=${encodeURIComponent('DevOps Master message from ' + payload.name)}&body=${encodeURIComponent(body)}`;
            lastSent = Date.now(); status.style.color = 'var(--warn)';
            status.textContent = 'Your email app should open with the message ready. Nothing is sent until you press Send there.';
          }
        } catch (err) { status.style.color = 'var(--danger)'; status.textContent = `Could not send: ${err.message} You can email ${CONFIG.contactEmail} directly.`; }
        finally { send.disabled = false; }
      });
      return speech;
    }
  };
}
