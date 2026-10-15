// Master Folder storage (IndexedDB, device-local) + ZIP export (JSZip loaded on demand).
// Data never leaves the browser. Falls back to in-memory storage if IndexedDB is blocked.

const DB_NAME = 'devops-master';
const DB_VERSION = 1;
export const DEFAULT_FOLDERS = ['Docker', 'Kubernetes', 'Jenkins', 'GitHub Actions', 'Terraform', 'Linux', 'Other'];
const JSZIP_URL = 'js/vendor/jszip.min.js'; // vendored copy (MIT/GPLv3 dual licence, see js/vendor/LICENSE-jszip.txt)

let dbPromise = null;
let memory = { files: new Map(), folders: new Set(DEFAULT_FOLDERS) };
export let usingMemory = false;

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2));
const emit = () => window.dispatchEvent(new CustomEvent('mf-change'));

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('folders')) db.createObjectStore('folders', { keyPath: 'name' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB blocked'));
  }).then(async (db) => {
    const existing = await run(db, 'folders', 'readonly', (s) => s.getAll());
    if (!existing.length) await Promise.all(DEFAULT_FOLDERS.map((name) => run(db, 'folders', 'readwrite', (s) => s.put({ name, createdAt: Date.now() }))));
    return db;
  }).catch(() => { usingMemory = true; return null; });
  return dbPromise;
}
function run(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode); const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}

export async function init() { await openDb(); return { usingMemory }; }

export async function listFolders() {
  const db = await openDb();
  if (!db) return [...memory.folders].sort();
  const all = await run(db, 'folders', 'readonly', (s) => s.getAll());
  const names = all.map((f) => f.name);
  return [...DEFAULT_FOLDERS.filter((n) => names.includes(n)), ...names.filter((n) => !DEFAULT_FOLDERS.includes(n)).sort()];
}
export async function listFiles() {
  const db = await openDb();
  if (!db) return [...memory.files.values()];
  return run(db, 'files', 'readonly', (s) => s.getAll());
}
export async function countFiles() { return (await listFiles()).length; }

export function validName(name) {
  const n = String(name || '').trim();
  if (!n) return 'Enter a name.';
  if (n.length > 80) return 'Use 80 characters or fewer.';
  if (/[\\/:*?"<>|]/.test(n) || n === '.' || n === '..' || /^\.\.?$/.test(n)) return 'Names cannot contain \\ / : * ? " < > | and cannot be . or ..';
  return '';
}

export async function addFolder(name) {
  const n = String(name).trim(); const err = validName(n); if (err) throw new Error(err);
  const folders = await listFolders();
  if (folders.some((f) => f.toLowerCase() === n.toLowerCase())) throw new Error('A folder with that name already exists.');
  const db = await openDb();
  if (!db) memory.folders.add(n); else await run(db, 'folders', 'readwrite', (s) => s.put({ name: n, createdAt: Date.now() }));
  emit(); return n;
}
export async function renameFolder(oldName, newName) {
  const n = String(newName).trim(); const err = validName(n); if (err) throw new Error(err);
  const folders = await listFolders();
  if (folders.some((f) => f.toLowerCase() === n.toLowerCase() && f !== oldName)) throw new Error('A folder with that name already exists.');
  const files = (await listFiles()).filter((f) => f.folder === oldName);
  const db = await openDb();
  if (!db) { memory.folders.delete(oldName); memory.folders.add(n); files.forEach((f) => { f.folder = n; }); }
  else {
    await run(db, 'folders', 'readwrite', (s) => { s.delete(oldName); return s.put({ name: n, createdAt: Date.now() }); });
    await Promise.all(files.map((f) => run(db, 'files', 'readwrite', (s) => s.put({ ...f, folder: n, updatedAt: Date.now() }))));
  }
  emit();
}
export async function deleteFolder(name) {
  const files = (await listFiles()).filter((f) => f.folder === name);
  const db = await openDb();
  if (!db) { memory.folders.delete(name); files.forEach((f) => memory.files.delete(f.id)); }
  else {
    await Promise.all(files.map((f) => run(db, 'files', 'readwrite', (s) => s.delete(f.id))));
    await run(db, 'folders', 'readwrite', (s) => s.delete(name));
  }
  emit(); return files.length;
}

/** Save a new file. Returns the saved record. Same-name files in a folder are kept: the name gets (2), (3)… */
export async function saveFile({ name, folder, tool, content, language }) {
  const err = validName(name); if (err) throw new Error(err);
  const folders = await listFolders();
  if (!folders.includes(folder)) await addFolder(folder);
  const existing = (await listFiles()).filter((f) => f.folder === folder).map((f) => f.name);
  let finalName = name.trim();
  if (existing.includes(finalName)) {
    const dot = finalName.lastIndexOf('.'); const stem = dot > 0 ? finalName.slice(0, dot) : finalName; const ext = dot > 0 ? finalName.slice(dot) : '';
    let i = 2; while (existing.includes(`${stem} (${i})${ext}`)) i++; finalName = `${stem} (${i})${ext}`;
  }
  const now = Date.now();
  const rec = { id: uid(), name: finalName, folder, tool: tool || folder, content: String(content ?? ''), language: language || 'text', createdAt: now, updatedAt: now };
  const db = await openDb();
  if (!db) memory.files.set(rec.id, rec); else await run(db, 'files', 'readwrite', (s) => s.put(rec));
  emit(); return rec;
}
export async function updateFile(id, patch) {
  const db = await openDb();
  const cur = db ? await run(db, 'files', 'readonly', (s) => s.get(id)) : memory.files.get(id);
  if (!cur) throw new Error('File not found.');
  if (patch.name !== undefined) { const err = validName(patch.name); if (err) throw new Error(err); }
  const next = { ...cur, ...patch, updatedAt: Date.now() };
  if (!db) memory.files.set(id, next); else await run(db, 'files', 'readwrite', (s) => s.put(next));
  emit(); return next;
}
export async function deleteFile(id) {
  const db = await openDb();
  if (!db) memory.files.delete(id); else await run(db, 'files', 'readwrite', (s) => s.delete(id));
  emit();
}
export async function duplicateFile(id) {
  const f = (await listFiles()).find((x) => x.id === id); if (!f) throw new Error('File not found.');
  return saveFile({ name: f.name, folder: f.folder, tool: f.tool, content: f.content, language: f.language });
}

/* ---------- backup / restore (JSON) ---------- */
export async function exportBackup() {
  const data = { app: 'devops-master', version: 1, exportedAt: new Date().toISOString(), folders: await listFolders(), files: await listFiles() };
  triggerDownload(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `DevOps-Master-Backup-${today()}.json`);
  return data.files.length;
}
export async function importBackup(text) {
  let data; try { data = JSON.parse(text); } catch { throw new Error('That file is not valid JSON.'); }
  if (data?.app !== 'devops-master' || !Array.isArray(data.files)) throw new Error('This is not a DevOps Master backup file.');
  for (const f of data.folders || []) { try { await addFolder(f); } catch { /* already exists */ } }
  let n = 0;
  for (const f of data.files) { if (f && typeof f.name === 'string' && typeof f.folder === 'string') { await saveFile({ name: f.name, folder: f.folder, tool: f.tool, content: f.content, language: f.language }); n++; } }
  return n;
}

/* ---------- ZIP export ---------- */
const today = () => new Date().toISOString().slice(0, 10);
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.style.display = 'none';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export const download = (name, content) => triggerDownload(new Blob([content], { type: 'text/plain;charset=utf-8' }), name);

let jszipPromise = null;
function loadJsZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  if (!jszipPromise) jszipPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script'); s.src = JSZIP_URL; s.async = true;
    s.onload = () => (window.JSZip ? resolve(window.JSZip) : reject(new Error('ZIP library failed to initialise.')));
    s.onerror = () => { jszipPromise = null; reject(new Error('Could not load the ZIP library (js/vendor/jszip.min.js). Reload the page and try again.')); };
    document.head.appendChild(s);
  });
  return jszipPromise;
}
function cleanPath(value) {
  const parts = String(value ?? '').replace(/\\/g, '/').split('/').map((p) => p.trim()).filter(Boolean);
  if (!parts.length || parts.some((p) => p === '.' || p === '..')) throw new Error('Unsafe or empty path: ' + value);
  return parts.join('/');
}
function uniquePath(path, used) {
  const low = (p) => p.toLowerCase();
  if (!used.has(low(path))) { used.add(low(path)); return path; }
  const slash = path.lastIndexOf('/'); const folder = slash >= 0 ? path.slice(0, slash + 1) : ''; const file = slash >= 0 ? path.slice(slash + 1) : path;
  const dot = file.lastIndexOf('.'); const stem = dot > 0 ? file.slice(0, dot) : file; const ext = dot > 0 ? file.slice(dot) : '';
  let i = 2, c = `${folder}${stem} (${i})${ext}`;
  while (used.has(low(c))) c = `${folder}${stem} (${++i})${ext}`;
  used.add(low(c)); return c;
}

/** Build and download a ZIP. files: records from listFiles(). onProgress(percent) optional. */
export async function downloadZip(files, { onProgress, archiveName } = {}) {
  if (!Array.isArray(files) || !files.length) throw new Error('Your Master Folder is empty. Save at least one file before exporting.');
  const JSZip = await loadJsZip();
  const zip = new JSZip(); const root = zip.folder('Master Folder'); const used = new Set(); const rows = [];
  for (const f of files) {
    if (!f || f.content == null) continue;
    const name = String(f.name || '').trim(); if (!name) continue;
    const out = uniquePath(cleanPath(`${f.folder || 'Other'}/${name}`), used);
    root.file(out, f.content);
    rows.push({ path: out, tool: f.tool || f.folder || 'Other', updated: f.updatedAt ? new Date(f.updatedAt).toISOString() : 'Not supplied' });
  }
  if (!rows.length) throw new Error('No valid saved files were found to export.');
  root.file('EXPORT_INDEX.txt', ['DEVOPS MASTER — MASTER FOLDER EXPORT', '', `Files exported: ${rows.length}`, 'This ZIP contains files saved in the DevOps Master Master Folder on this device.', 'Review generated configuration before using it in a real environment.', 'Do not add passwords, access keys, tokens or production secrets to these files.', '', 'FILES', ...rows.map((r) => `- ${r.path} | Tool: ${r.tool} | Updated: ${r.updated}`), ''].join('\n'));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }, (m) => onProgress && onProgress(Math.round(m.percent)));
  const name = archiveName || `DevOps-Master-Folder-${today()}.zip`;
  triggerDownload(blob, name);
  return { count: rows.length, archiveName: name, bytes: blob.size };
}

export const fmtBytes = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);
