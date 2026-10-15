// Wizard hero. Shows the original wizard picture (cut-out, transparent background).
// If a real 3D model is added at assets/models/wizard.glb and WebGL works, it replaces the picture.
// Any failure keeps the picture.

import { reducedMotion } from './ui.js';

export const MODEL_URL = 'assets/models/wizard.glb';
export const POSTER = 'assets/images/wizard.webp';

const webglOk = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } };

export function mountWizard(box, { poster = POSTER, alt = 'Alyantri, a hooded wizard in a purple robe with gold trim, holding a crescent-moon staff' } = {}) {
  box.innerHTML = `<img src="${poster}" alt="${alt}" decoding="async" fetchpriority="high">`;
  let disposed = false; let cleanup = () => {};
  (async () => {
    try {
      if (!webglOk()) return;
      const head = await fetch(MODEL_URL, { method: 'HEAD', cache: 'no-cache' }).catch(() => null);
      const type = head?.headers.get('content-type') || '';
      if (!head?.ok || type.includes('text/html')) return; // no GLB: keep the picture
      const THREE = await import('three');
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      if (disposed) return;
      const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
      if (disposed) return;
      const model = gltf.scene;
      const canvas = document.createElement('canvas'); canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', alt);
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace;
      const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
      scene.add(new THREE.HemisphereLight(0xcbb8ff, 0x1a1030, 1.0));
      const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(3, 4, 5); scene.add(key);
      const rim = new THREE.DirectionalLight(0x8b6cff, 2.2); rim.position.set(-3, 2, -4); scene.add(rim);
      scene.add(model);
      const bbox = new THREE.Box3().setFromObject(model);
      const size = bbox.getSize(new THREE.Vector3()); const centre = bbox.getCenter(new THREE.Vector3());
      model.position.sub(centre);
      const dist = (size.y / 2) / Math.tan((camera.fov * Math.PI) / 360) * 1.12;
      camera.position.set(0, 0, dist); camera.lookAt(0, 0, 0);
      const mixer = new THREE.AnimationMixer(model); const clips = Object.fromEntries(gltf.animations.map((c) => [c.name, c]));
      const calm = reducedMotion();
      ['Idle_Breathing', 'Staff_Glow'].forEach((n) => { if (clips[n] && !calm) mixer.clipAction(clips[n]).play(); });
      const resize = () => { const w = box.clientWidth || 300; const h = box.clientHeight || 500; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
      resize(); const ro = new ResizeObserver(resize); ro.observe(box);
      box.innerHTML = ''; box.appendChild(canvas);
      const clock = new THREE.Clock(); let raf = 0;
      const frame = () => { mixer.update(clock.getDelta()); renderer.render(scene, camera); };
      const loop = () => { raf = requestAnimationFrame(loop); frame(); };
      if (calm) frame(); else loop();
      cleanup = () => { cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); };
    } catch (err) {
      console.warn('3D wizard model unavailable, keeping the picture.', err);
      if (!disposed && !box.querySelector('img')) box.innerHTML = `<img src="${poster}" alt="${alt}">`;
    }
  })();
  return () => { disposed = true; cleanup(); };
}
