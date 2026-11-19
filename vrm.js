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

// ── 전신: 카메라가 잡은 몸 관절(MediaPipe 33점, 미터 단위)을 모델 뼈대에 옮긴다. 거울처럼 좌우를 뒤집는다.
// [모델 뼈, 시작 관절, 끝 관절, 뼈 방향을 재는 자식 뼈]
const LIMBS = [
  ['rightUpperArm', 11, 13, 'rightLowerArm'], ['rightLowerArm', 13, 15, 'rightHand'],
  ['leftUpperArm', 12, 14, 'leftLowerArm'], ['leftLowerArm', 14, 16, 'leftHand'],
  ['rightUpperLeg', 23, 25, 'rightLowerLeg'], ['rightLowerLeg', 25, 27, 'rightFoot'],
  ['leftUpperLeg', 24, 26, 'leftLowerLeg'], ['leftLowerLeg', 26, 28, 'leftFoot'],
];
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _t = new THREE.Quaternion();
const IDLE = new THREE.Quaternion();
const wpos = (n) => n.getWorldPosition(new THREE.Vector3());

function restOf(vrm) {
  const h = vrm.humanoid, B = (n) => h.getNormalizedBoneNode(n);
  vrm.scene.updateMatrixWorld(true);
  const rest = { R: vrm.scene.getWorldQuaternion(new THREE.Quaternion()), dir: {}, down: {} };
  for (const [bone, , , child] of LIMBS) { const b = B(bone), c = B(child); if (b && c) rest.dir[bone] = wpos(c).sub(wpos(b)).normalize(); }
  const lh = B('leftUpperLeg'), rh = B('rightUpperLeg'), hips = B('hips'), top = B('neck') || B('head');
  if (lh && rh) rest.hipLine = wpos(rh).sub(wpos(lh)).normalize();
  if (hips && top) rest.up = wpos(top).sub(wpos(hips)).normalize();
  // 몸을 못 잡았을 때의 기본 자세: 팔을 내린다
  rest.down.leftUpperArm = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 1.25));
  rest.down.rightUpperArm = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -1.25));
  return rest;
}

// 뼈의 세계 회전을 (delta × 기본 회전)으로 맞춘다. k 는 따라가는 빠르기.
function aim(node, delta, R, k) {
  node.parent.updateWorldMatrix(true, false); node.parent.getWorldQuaternion(_pq);
  _t.copy(_pq).invert().multiply(delta).multiply(R);
  node.quaternion.slerp(_t, k);
}

function applyBody(vrm, rest, lm, k) {
  if (!rest) return;
  const h = vrm.humanoid, B = (n) => h.getNormalizedBoneNode(n);
  const P = (i, out) => out.set(-lm[i].x, -lm[i].y, -lm[i].z);
  const ok = (...ids) => !!lm && ids.every((i) => (lm[i]?.v ?? 0) > 0.5);
  const hips = B('hips'), spine = B('spine');
  const hipQ = new THREE.Quaternion();
  if (hips) {
    if (ok(23, 24) && rest.hipLine) { P(23, _a).sub(P(24, _b)); _a.y *= 0.5; hipQ.setFromUnitVectors(rest.hipLine, _a.normalize()); aim(hips, hipQ, rest.R, k); }
    else hips.quaternion.slerp(IDLE, k);
  }
  if (spine) {
    if (ok(11, 12, 23, 24) && rest.up) {
      P(11, _a).add(P(12, _b)).multiplyScalar(0.5); P(23, _c).add(P(24, _b)).multiplyScalar(0.5);
      _a.sub(_c).normalize(); _b.copy(rest.up).applyQuaternion(hipQ);
      aim(spine, _q.setFromUnitVectors(_b, _a).multiply(hipQ), rest.R, k);
    } else spine.quaternion.slerp(IDLE, k);
  }
  for (const [bone, i, j] of LIMBS) {
    const n = B(bone); if (!n) continue;
    if (ok(i, j) && rest.dir[bone]) { P(j, _a).sub(P(i, _b)).normalize(); aim(n, _q.setFromUnitVectors(rest.dir[bone], _a), rest.R, k); }
    else n.quaternion.slerp(rest.down[bone] || IDLE, k);
  }
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
      this.rest = restOf(vrm);
      applyBody(vrm, this.rest, null, 1);
      vrm.update(0); vrm.scene.updateMatrixWorld(true);
      const p = new THREE.Vector3(); h.getRawBoneNode('head').getWorldPosition(p);
      this.headY = p.y; this.frame();
    }).catch(() => { if (this.url === want) { this.state = 'error'; this.tag.textContent = '모습을 불러오지 못했습니다'; } });
  }

  // 세로로 긴 화면에서는 얼굴이 잘리지 않게 카메라를 뒤로 뺀다
  frame() { if (this.headY == null) return;
    if (this.full) { const y = this.headY * 0.54; this.camera.position.set(0, y, Math.max(4.6, 3.4 / Math.max(0.4, this.camera.aspect))); this.camera.lookAt(0, y, 0); return; }
    const z = this.camera.aspect >= 1 ? 1.2 : Math.min(2.2, 1.05 / this.camera.aspect); this.camera.position.set(0, this.headY + 0.04, z); this.camera.lookAt(0, this.headY + (this.camera.aspect >= 1 ? 0.03 : -0.02), 0); }

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
      const full = !!p.full; if (full !== !!this.full) { this.full = full; this.frame(); }
      applyBody(v, this.rest, p.body || null, 0.4);
      v.scene.position.x = full ? 0 : (p.x || 0) * 0.05;
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
