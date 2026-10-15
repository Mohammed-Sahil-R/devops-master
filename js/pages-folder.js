import * as store from './storage.js';
import { esc, $, toast, openDialog, confirmDialog, promptDialog, fmtDate, copyText } from './ui.js';
import { looksLikeSecrets } from './generators.js';

export function masterFolderPage() {
  return {
    title: 'Master Folder — DevOps Master',
    html: `<div class="wrap section" style="padding-top:2rem">
      <h1>Master Folder</h1>
      <div class="warnbox ok" role="note"><strong>Stored on this device only.</strong> Files live in this browser's IndexedDB. They are not synced to a cloud account, and clearing site data deletes them. Use <em>Backup</em> or <em>Download All as ZIP</em> to keep a copy.</div>
      <div class="toolbar" role="toolbar" aria-label="Master Folder actions">
        <button class="btn gold" id="zip-all">Download All as ZIP</button>
        <button class="btn" id="zip-sel">Download Selected as ZIP</button>
        <button class="btn" id="new-folder">New folder</button>
        <button class="btn" id="backup">Backup (JSON)</button>
        <button class="btn" id="restore">Restore backup</button>
        <input type="file" id="restore-file" accept="application/json,.json" hidden>
      </div>
      <div id="zip-status" class="status" role="status" aria-live="polite"></div>
      <div class="mf-layout" style="margin-top:1rem">
        <nav class="card" aria-label="Folders"><h2 style="font-size:1.1rem">Folders</h2><ul class="tree" id="tree"></ul><div class="row" style="margin-top:.8rem"><button class="btn small" id="ren" disabled>Rename</button><button class="btn small danger" id="del" disabled>Delete</button></div></nav>
        <section class="card" aria-label="Files">
          <div class="row" style="justify-content:space-between;margin-bottom:.6rem">
            <label class="check"><input type="checkbox" id="all"> <span>Select all shown</span></label>
            <div class="row"><label for="mf-q" class="sr-only">Search files</label><input id="mf-q" type="text" placeholder="Search files" style="width:200px"><label for="mf-sort" class="sr-only">Sort</label><select id="mf-sort" style="width:170px"><option value="new">Newest first</option><option value="name">Name A–Z</option></select></div>
          </div>
          <div id="files"></div>
        </section>
      </div>
    </div>`,
    mount(root) {
      const S = { folder: 'all', sel: new Set(), files: [], folders: [], q: '', sort: 'new' };
      const status = $('#zip-status', root);
      const say = (html) => { status.innerHTML = html; };

      const shown = () => {
        let list = S.files.filter((f) => S.folder === 'all' || f.folder === S.folder);
        const q = S.q.toLowerCase(); if (q) list = list.filter((f) => `${f.name} ${f.tool} ${f.content}`.toLowerCase().includes(q));
        return list.sort((a, b) => (S.sort === 'name' ? a.name.localeCompare(b.name) : b.updatedAt - a.updatedAt));
      };
      const refresh = async () => {
        S.files = await store.listFiles(); S.folders = await store.listFolders();
        if (S.folder !== 'all' && !S.folders.includes(S.folder)) S.folder = 'all';
        const ids = new Set(S.files.map((f) => f.id)); S.sel = new Set([...S.sel].filter((x) => ids.has(x)));
        draw();
      };
      const draw = () => {
        const count = (f) => S.files.filter((x) => x.folder === f).length;
        $('#tree', root).innerHTML = `<li><button data-folder="all" ${S.folder === 'all' ? 'aria-current="true"' : ''}><span>All files</span><span class="tag">${S.files.length}</span></button></li>${S.folders.map((f) => `<li><button data-folder="${esc(f)}" ${S.folder === f ? 'aria-current="true"' : ''}><span>${esc(f)}</span><span class="tag">${count(f)}</span></button></li>`).join('')}`;
        $('#ren', root).disabled = $('#del', root).disabled = S.folder === 'all';
        const list = shown(); const el = $('#files', root);
        if (!S.files.length) el.innerHTML = `<div style="padding:1.5rem 0"><h2 style="font-size:1.2rem">Your Master Folder is empty</h2><p class="muted">Generate a file, review it, then choose <strong>Save to Master Folder</strong>. Saved files appear here and can be exported as a ZIP.</p><a class="btn primary" href="#/manifest">Open the generators</a></div>`;
        else if (!list.length) el.innerHTML = `<p class="muted" style="padding:1rem 0">No files match here. ${S.q ? 'Clear the search or ' : ''}choose another folder.</p>`;
        else el.innerHTML = list.map((f) => `<div class="file-row"><input type="checkbox" data-sel="${f.id}" aria-label="Select ${esc(f.name)}" ${S.sel.has(f.id) ? 'checked' : ''}><div><strong class="fname">${esc(f.name)}</strong><div class="meta">${esc(f.folder)} · ${store.fmtBytes(new Blob([f.content]).size)} · updated ${esc(fmtDate(f.updatedAt))}</div></div><div class="row"><button class="btn small" data-a="open" data-id="${f.id}">View / edit</button><button class="btn small" data-a="copy" data-id="${f.id}">Copy</button><button class="btn small" data-a="dl" data-id="${f.id}">Download</button><button class="btn small" data-a="dup" data-id="${f.id}">Duplicate</button><button class="btn small" data-a="ren" data-id="${f.id}">Rename</button><button class="btn small danger" data-a="rm" data-id="${f.id}">Delete</button></div></div>`).join('');
        const empty = S.files.length === 0;
        $('#zip-all', root).disabled = empty; $('#zip-sel', root).disabled = S.sel.size === 0;
        $('#zip-sel', root).textContent = `Download Selected as ZIP${S.sel.size ? ` (${S.sel.size})` : ''}`;
        $('#all', root).checked = list.length > 0 && list.every((f) => S.sel.has(f.id));
        if (empty && !status.textContent.trim()) say('<span class="muted">ZIP buttons are disabled until you save at least one file.</span>');
        else if (!empty && S.sel.size === 0 && status.textContent.includes('disabled until')) say('');
      };

      const exportZip = async (files, label) => {
        const flagged = files.map((f) => ({ f, hits: looksLikeSecrets(f.content) })).filter((x) => x.hits.length);
        if (flagged.length) {
          const ok = await confirmDialog({ title: 'Possible secrets found', danger: true, confirmLabel: 'Export anyway', body: `<p>These files may contain secrets. Check them before sharing the archive:</p><ul>${flagged.map((x) => `<li><code>${esc(x.f.folder)}/${esc(x.f.name)}</code>: ${esc(x.hits.join(', '))}</li>`).join('')}</ul><p class="muted">This is a simple pattern check, not a guarantee. The archive is not verified safe.</p>` });
          if (!ok) { say('<span class="muted">Export cancelled.</span>'); return; }
        }
        const buttons = [$('#zip-all', root), $('#zip-sel', root)]; buttons.forEach((b) => { b.disabled = true; });
        say(`<span>Preparing ZIP of ${label}…</span>`);
        try {
          const r = await store.downloadZip(files, { onProgress: (p) => say(`<span>Preparing ZIP… ${p}%</span>`) });
          say(`<span style="color:var(--ok)">Download started: ${esc(r.archiveName)}</span> — ${r.count} file${r.count > 1 ? 's' : ''}, ${store.fmtBytes(r.bytes)}. Check your Downloads folder.`);
          toast(`ZIP download started (${r.count} files).`);
        } catch (err) { say(`<span style="color:var(--danger)">ZIP export failed: ${esc(err.message)}</span>`); toast('ZIP export failed.', { error: true }); }
        finally { draw(); }
      };

      const viewFile = (f) => {
        const dlg = openDialog(`<h2>${esc(f.name)}</h2><p class="muted">${esc(f.folder)} · edits are saved only when you press Save changes.</p><div class="editor" style="min-height:300px"><pre class="gutter" id="vg" aria-hidden="true"></pre><textarea id="vt" aria-label="File contents" spellcheck="false" wrap="off" style="min-height:300px"></textarea></div><div class="err-msg" id="verr" role="alert"></div><div class="row" style="justify-content:flex-end;margin-top:.8rem"><span class="muted" id="dirty"></span><button class="btn" data-x="close">Close</button><button class="btn primary" data-x="save">Save changes</button></div>`, { wide: true, label: `Edit ${f.name}` });
        const t = $('#vt', dlg); t.value = f.content; const g = $('#vg', dlg);
        const gut = () => { g.textContent = Array.from({ length: t.value.split('\n').length }, (_, i) => i + 1).join('\n'); };
        gut(); t.addEventListener('input', () => { gut(); $('#dirty', dlg).textContent = 'Unsaved changes'; }); t.addEventListener('scroll', () => { g.scrollTop = t.scrollTop; });
        dlg.addEventListener('click', async (e) => {
          const x = e.target.closest('[data-x]'); if (!x) return;
          if (x.dataset.x === 'close') { if ($('#dirty', dlg).textContent && !(await confirmDialog({ title: 'Discard changes?', body: '<p>You have unsaved edits.</p>', confirmLabel: 'Discard', danger: true }))) return; dlg.close(); }
          else { try { await store.updateFile(f.id, { content: t.value }); toast('Changes saved.'); dlg.close(); } catch (err) { $('#verr', dlg).textContent = err.message; } }
        });
      };

      root.addEventListener('click', async (e) => {
        const fb = e.target.closest('[data-folder]'); if (fb) { S.folder = fb.dataset.folder; draw(); return; }
        const b = e.target.closest('[data-a]'); if (!b) return;
        const f = S.files.find((x) => x.id === b.dataset.id); if (!f) return; const a = b.dataset.a;
        try {
          if (a === 'open') viewFile(f);
          else if (a === 'copy') { const ok = await copyText(f.content); toast(ok ? 'Copied to clipboard.' : 'Copy failed.', { error: !ok }); }
          else if (a === 'dl') { store.download(f.name, f.content); toast(`Download started: ${f.name}`); }
          else if (a === 'dup') { const r = await store.duplicateFile(f.id); toast(`Duplicated as ${r.name}.`); }
          else if (a === 'ren') { const n = await promptDialog({ title: 'Rename file', label: 'New file name', value: f.name, validate: store.validName }); if (n) { await store.updateFile(f.id, { name: n }); toast('Renamed.'); } }
          else if (a === 'rm') { if (await confirmDialog({ title: 'Delete this file?', body: `<p><strong>${esc(f.name)}</strong> will be removed from this device. This cannot be undone.</p>`, confirmLabel: 'Delete file', danger: true })) { await store.deleteFile(f.id); toast('File deleted.'); } }
        } catch (err) { toast(err.message, { error: true }); }
      });
      root.addEventListener('change', (e) => {
        if (e.target.dataset.sel) { e.target.checked ? S.sel.add(e.target.dataset.sel) : S.sel.delete(e.target.dataset.sel); draw(); }
        if (e.target.id === 'all') { shown().forEach((f) => (e.target.checked ? S.sel.add(f.id) : S.sel.delete(f.id))); draw(); }
        if (e.target.id === 'mf-sort') { S.sort = e.target.value; draw(); }
      });
      $('#mf-q', root).addEventListener('input', (e) => { S.q = e.target.value; draw(); });
      $('#zip-all', root).addEventListener('click', () => exportZip(S.files, 'all files'));
      $('#zip-sel', root).addEventListener('click', () => exportZip(S.files.filter((f) => S.sel.has(f.id)), 'selected files'));
      $('#new-folder', root).addEventListener('click', async () => {
        const n = await promptDialog({ title: 'New folder', label: 'Folder name', confirmLabel: 'Create folder', validate: store.validName });
        if (n) { try { await store.addFolder(n); S.folder = n; toast(`Folder "${n}" created.`); } catch (err) { toast(err.message, { error: true }); } }
      });
      $('#ren', root).addEventListener('click', async () => {
        const n = await promptDialog({ title: 'Rename folder', label: 'New folder name', value: S.folder, validate: store.validName });
        if (n) { try { const old = S.folder; await store.renameFolder(old, n); S.folder = n; toast('Folder renamed.'); } catch (err) { toast(err.message, { error: true }); } }
      });
      $('#del', root).addEventListener('click', async () => {
        const n = S.files.filter((f) => f.folder === S.folder).length;
        if (await confirmDialog({ title: `Delete folder "${S.folder}"?`, body: `<p>This also deletes <strong>${n}</strong> file${n === 1 ? '' : 's'} inside it from this device. This cannot be undone.</p>`, confirmLabel: 'Delete folder', danger: true })) { await store.deleteFolder(S.folder); S.folder = 'all'; toast('Folder deleted.'); }
      });
      $('#backup', root).addEventListener('click', async () => { try { const n = await store.exportBackup(); say(`<span style="color:var(--ok)">Backup download started (${n} files).</span>`); } catch (err) { say(`<span style="color:var(--danger)">Backup failed: ${esc(err.message)}</span>`); } });
      $('#restore', root).addEventListener('click', () => $('#restore-file', root).click());
      $('#restore-file', root).addEventListener('change', async (e) => {
        const file = e.target.files[0]; if (!file) return;
        try { const n = await store.importBackup(await file.text()); say(`<span style="color:var(--ok)">Restored ${n} file${n === 1 ? '' : 's'}.</span> Duplicates were kept with a (2) suffix.`); } catch (err) { say(`<span style="color:var(--danger)">Restore failed: ${esc(err.message)}</span>`); }
        e.target.value = '';
      });

      const onChange = () => refresh(); window.addEventListener('mf-change', onChange);
      store.init().then(() => { if (store.usingMemory) say('<span style="color:var(--warn)">Browser storage is blocked (private mode?). Files will be lost when you close this tab. Export a ZIP before leaving.</span>'); return refresh(); });
      return () => window.removeEventListener('mf-change', onChange);
    }
  };
}
