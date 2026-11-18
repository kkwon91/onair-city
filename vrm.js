// VRM 3D 아바타 그리기. 모델은 한 번에 두 개까지만 메모리에 둔다(폰 메모리 보호).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

const cache = new Map(); // url → Promise<vrm>
const KEEP = 2;

function loadVrm(url, onProgress) {
  if (cache.has(url)) { const p = cache.get(url); cache.delete(url); cache.set(url, p); return p; }
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const p = new Promise((resolve, reject) => loader.load(url, (gltf) => {
    const vrm = gltf.userData.vrm;
    VRMUtils.removeUnnecessaryVertices?.(gltf.scene);
    VRMUtils.rotateVRM0(vrm); // 옛 규격 모델은 뒤를 보고 있어 돌려 준다
    vrm.scene.traverse((o) => { o.frustumCulled = false; });
    resolve(vrm);
  }, (e) => onProgress?.(e.total ? e.loaded / e.total : 0), reject));
  cache.set(url, p);
  p.catch(() => cache.delete(url));
  while (cache.size > KEEP) {
    const [oldUrl, oldP] = cache.entries().next().value; cache.delete(oldUrl);
    oldP.then((v) => { v.scene.removeFromParent(); VRMUtils.deepDispose(v.scene); }).catch(() => {});
  }
  return p;
}

export class VrmView {
  constructor(canvas) {
    this.canvas = canvas; this.url = null; this.vrm = null; this.clock = new THREE.Clock(); this.state = 'idle';
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(24, 1, 0.1, 20);
    const key = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(0.6, 1.2, 1.4);
    this.scene.add(key, new THREE.AmbientLight(0xffffff, 1.1));
    const host = canvas.parentElement; if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    this.tag = document.createElement('div'); this.tag.className = 'vload'; this.tag.hidden = true; host.append(this.tag);
  }

  show(av) {
    if (this.url === av.url) return;
    this.url = av.url; this.scene.background = new THREE.Color(av.bg);
    if (this.vrm) { this.vrm.scene.removeFromParent(); this.vrm = null; }
    this.state = 'loading'; this.tag.hidden = false; this.tag.textContent = '모습 불러오는 중'; this.tag.style.backgroundImage = av.id ? 'url(thumbs/' + av.id + '.jpg)' : '';
    const want = av.url;
    loadVrm(av.url, (r) => { if (this.url === want) this.tag.textContent = `모습 불러오는 중 ${Math.min(100, Math.round(r * 100))}%`; }).then((vrm) => {
      if (this.url !== want || this.dead) return;
      this.vrm = vrm; this.scene.add(vrm.scene); this.state = 'ready'; this.tag.hidden = true;
      const h = vrm.humanoid; this.head = h.getNormalizedBoneNode('head'); this.neck = h.getNormalizedBoneNode('neck');
      // 기본 자세는 팔을 벌린 T자라 팔을 내린다
      const la = h.getNormalizedBoneNode('leftUpperArm'), ra = h.getNormalizedBoneNode('rightUpperArm');
      if (la) la.rotation.z = 1.25; if (ra) ra.rotation.z = -1.25;
      vrm.update(0); vrm.scene.updateMatrixWorld(true);
      const p = new THREE.Vector3(); h.getRawBoneNode('head').getWorldPosition(p);
      this.headY = p.y; this.frame();
    }).catch(() => { if (this.url === want) { this.state = 'error'; this.tag.textContent = '모습을 불러오지 못했습니다'; } });
  }

  // 세로로 긴 화면에서는 얼굴이 잘리지 않게 카메라를 뒤로 뺀다
  frame() { if (this.headY == null) return; const z = this.camera.aspect >= 1 ? 1.2 : Math.min(2.2, 1.05 / this.camera.aspect); this.camera.position.set(0, this.headY + 0.04, z); this.camera.lookAt(0, this.headY + (this.camera.aspect >= 1 ? 0.03 : -0.02), 0); }

  blank(color = '#1a1d25') { this.url = null; if (this.vrm) { this.vrm.scene.removeFromParent(); this.vrm = null; } this.tag.hidden = true; this.scene.background = new THREE.Color(color); this.draw(); }

  render(pose) {
    const v = this.vrm;
    if (v) {
      const p = pose;
      if (this.head) this.head.rotation.set(-p.pitch * 0.7, p.yaw * 0.7, p.roll * 0.7);
      if (this.neck) this.neck.rotation.set(-p.pitch * 0.3, p.yaw * 0.3, p.roll * 0.3);
      const em = v.expressionManager;
      if (em) {
        em.setValue('aa', Math.min(1, p.jaw)); em.setValue('blinkLeft', p.blinkL > 0.5 ? 1 : p.blinkL * 1.2); em.setValue('blinkRight', p.blinkR > 0.5 ? 1 : p.blinkR * 1.2);
        em.setValue('happy', Math.min(0.55, p.smile * 0.55) * (1 - Math.min(1, p.jaw) * 0.5));
      }
      v.scene.position.x = (p.x || 0) * 0.05;
      v.update(Math.min(0.05, this.clock.getDelta()));
    }
    this.draw();
  }

  draw() {
    const c = this.canvas, dpr = Math.min(2, window.devicePixelRatio || 1), w = c.clientWidth || 300, h = c.clientHeight || 300;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { this.renderer.setPixelRatio(dpr); this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.frame(); }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() { this.dead = true; this.tag.remove(); if (this.vrm) this.vrm.scene.removeFromParent(); this.renderer.dispose(); this.renderer.forceContextLoss?.(); }
}
