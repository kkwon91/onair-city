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
// 관절 번호: 0 코, 7·8 귀, 11·12 어깨, 13·14 팔꿈치, 15·16 손목, 17·18 새끼, 19·20 검지, 23·24 골반, 25·26 무릎, 27·28 발목, 29·30 뒤꿈치, 31·32 발끝 (홀수가 내 왼쪽)
// [모델 뼈, 시작 관절, 끝 관절(둘이면 그 가운데), 뼈 방향을 재는 자식 뼈]
const LIMBS = [
  ['rightUpperArm', 11, [13], 'rightLowerArm'], ['rightLowerArm', 13, [15], 'rightHand'], ['rightHand', 15, [17, 19], 'rightMiddleProximal'],
  ['leftUpperArm', 12, [14], 'leftLowerArm'], ['leftLowerArm', 14, [16], 'leftHand'], ['leftHand', 16, [18, 20], 'leftMiddleProximal'],
  ['rightUpperLeg', 23, [25], 'rightLowerLeg'], ['rightLowerLeg', 25, [27], 'rightFoot'], ['rightFoot', 29, [31], 'rightToes'],
  ['leftUpperLeg', 24, [26], 'leftLowerLeg'], ['leftLowerLeg', 26, [28], 'leftFoot'], ['leftFoot', 30, [32], 'leftToes'],
];
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _t = new THREE.Quaternion(), _m = new THREE.Matrix4();
const IDLE = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
const wpos = (n) => n.getWorldPosition(new THREE.Vector3());
const V = () => new THREE.Vector3();

// 가로축(x)과 위쪽(up)으로 직교 좌표계를 만들어 회전으로 바꾼다
function basis(x, up, out) {
  const X = _a.copy(x).normalize(), Y = _b.copy(up).addScaledVector(X, -up.dot(X)).normalize(), Z = _c.crossVectors(X, Y);
  return out.setFromRotationMatrix(_m.makeBasis(X, Y, Z));
}

function restOf(vrm) {
  const h = vrm.humanoid, B = (n) => h.getNormalizedBoneNode(n);
  vrm.scene.updateMatrixWorld(true);
  const rest = { R: vrm.scene.getWorldQuaternion(new THREE.Quaternion()), dir: {}, down: {} };
  for (const [bone, , , child] of LIMBS) { const b = B(bone), c = B(child); if (b && c) rest.dir[bone] = wpos(c).sub(wpos(b)).normalize(); }
  const lh = B('leftUpperLeg'), rh = B('rightUpperLeg'), la = B('leftUpperArm'), ra = B('rightUpperArm');
  // 기본 자세의 골반·가슴·머리 좌표계(뒤집어 저장해 두면 목표 좌표계에 곱하기만 하면 된다)
  if (lh && rh) rest.hipInv = basis(wpos(rh).sub(wpos(lh)), UP, new THREE.Quaternion()).invert();
  if (la && ra) { rest.chestInv = basis(wpos(ra).sub(wpos(la)), UP, new THREE.Quaternion()).invert(); rest.headInv = rest.chestInv.clone(); }
  rest.feet = ['leftFoot', 'rightFoot', 'leftToes', 'rightToes'].map(B).filter(Boolean);
  rest.footY = rest.feet.length ? Math.min(...rest.feet.map((f) => wpos(f).y)) : 0;
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

// 반환: 몸 관절로 고개까지 맞췄으면 true
function applyBody(vrm, rest, lm, k) {
  if (!rest) return false;
  const h = vrm.humanoid, B = (n) => h.getNormalizedBoneNode(n);
  const P = (i, out) => out.set(-lm[i].x, -lm[i].y, -lm[i].z);
  const mid = (ids, out) => { out.set(0, 0, 0); for (const i of ids) out.add(P(i, V())); return out.multiplyScalar(1 / ids.length); };
  const ok = (...ids) => !!lm && ids.every((i) => (lm[i]?.v ?? 0) > 0.5);
  const hips = B('hips'), spine = B('spine'), chest = B('upperChest') || B('chest'), head = B('head'), neck = B('neck');
  const torso = ok(11, 12, 23, 24) ? mid([11, 12], V()).sub(mid([23, 24], V())).normalize() : null;
  // 골반: 좌우 선과 (몸통 방향을 절반만 섞은) 위쪽으로
  if (hips) {
    if (ok(23, 24) && rest.hipInv) { const up = torso ? V().copy(torso).add(UP).normalize() : UP; aim(hips, basis(P(23, V()).sub(P(24, V())), up, new THREE.Quaternion()).multiply(rest.hipInv), rest.R, k); }
    else hips.quaternion.slerp(IDLE, k);
  }
  // 가슴: 어깨 선으로 비틀기와 기울기를 함께 잡는다
  if (spine) spine.quaternion.slerp(IDLE, k);
  if (chest) {
    if (torso && rest.chestInv) aim(chest, basis(P(11, V()).sub(P(12, V())), torso, new THREE.Quaternion()).multiply(rest.chestInv), rest.R, k);
    else chest.quaternion.slerp(IDLE, k);
  }
  for (const [bone, i, js] of LIMBS) {
    const n = B(bone); if (!n) continue;
    if (ok(i, ...js) && rest.dir[bone]) { const d = mid(js, V()).sub(P(i, V())).normalize(); aim(n, _q.setFromUnitVectors(rest.dir[bone], d), rest.R, k); }
    else n.quaternion.slerp(rest.down[bone] || IDLE, k);
  }
  // 고개: 두 귀의 선과 코 방향으로
  if (head && ok(0, 7, 8) && rest.headInv) {
    const x = P(7, V()).sub(P(8, V())), fwd = P(0, V()).sub(mid([7, 8], V())), up = V().crossVectors(x, fwd);
    if (neck) neck.quaternion.slerp(IDLE, k);
    aim(head, basis(x, up, new THREE.Quaternion()).multiply(rest.headInv), rest.R, k); return true;
  }
  return false;
}

export class VrmView {
  constructor(canvas) {
    this.canvas = canvas; this.url = null; this.vrm = null; this.clock = new THREE.Clock(); this.state = 'idle';
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(24, 1, 0.1, 30);
    const key = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(0.6, 1.2, 1.4);
    this.scene.add(key, new THREE.AmbientLight(0xffffff, 1.1));
    // 전신 무대: 바닥과 발밑 그림자(전신일 때만 보인다)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 9), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 }));
    floor.rotation.x = -Math.PI / 2; floor.position.z = 3.2;
    const sc = document.createElement('canvas'); sc.width = sc.height = 128; const sx = sc.getContext('2d');
    const sg = sx.createRadialGradient(64, 64, 4, 64, 64, 62); sg.addColorStop(0, 'rgba(0,0,0,.6)'); sg.addColorStop(1, 'rgba(0,0,0,0)'); sx.fillStyle = sg; sx.fillRect(0, 0, 128, 128);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = 0.004;
    this.stage = new THREE.Group(); this.stage.add(floor, this.shadow); this.stage.visible = false; this.scene.add(this.stage);
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
      vrm.scene.position.set(0, 0, 0);
      const h = vrm.humanoid; this.head = h.getNormalizedBoneNode('head'); this.neck = h.getNormalizedBoneNode('neck');
      // 다른 화면에서 쓰던 모델을 다시 받을 수 있어 뼈대를 기본 자세로 돌려놓고 잰다
      for (const b of Object.values(h.normalizedHumanBones || {})) b?.node?.quaternion.identity();
      this.rest = restOf(vrm);
      applyBody(vrm, this.rest, null, 1); // 기본 자세는 팔을 벌린 T자라 팔을 내린다
      vrm.update(0); vrm.scene.updateMatrixWorld(true);
      const p = new THREE.Vector3(); h.getRawBoneNode('head').getWorldPosition(p);
      this.headY = p.y; this.frame();
    }).catch(() => { if (this.url === want) { this.state = 'error'; this.tag.textContent = '모습을 불러오지 못했습니다'; } });
  }

  // 세로로 긴 화면에서는 얼굴이 잘리지 않게 카메라를 뒤로 뺀다. 전신일 때는 몸 전체가 들어오게 잡는다.
  frame() {
    if (this.headY == null) return;
    if (this.full) { const y = this.headY * 0.56; this.camZ = Math.max(4.8, 3.6 / Math.max(0.4, this.camera.aspect)); this.camera.position.set(0, y + 0.25, this.camZ); this.camera.lookAt(0, y, 0); return; }
    const z = this.camera.aspect >= 1 ? 1.2 : Math.min(2.2, 1.05 / this.camera.aspect); this.camera.position.set(0, this.headY + 0.04, z); this.camera.lookAt(0, this.headY + (this.camera.aspect >= 1 ? 0.03 : -0.02), 0);
  }

  blank(color = '#1a1d25') { this.url = null; if (this.vrm) { this.vrm.scene.removeFromParent(); this.vrm = null; } this.tag.hidden = true; this.stage.visible = false; this.scene.background = new THREE.Color(color); this.draw(); }

  render(pose) {
    const v = this.vrm;
    if (v) {
      const p = pose;
      const full = !!p.full; if (full !== !!this.full) { this.full = full; this.frame(); }
      this.stage.visible = full;
      const headDone = applyBody(v, this.rest, full ? (p.body || null) : null, 0.45);
      if (!headDone) {
        if (this.head) this.head.rotation.set(-p.pitch * 0.7, p.yaw * 0.7, p.roll * 0.7);
        if (this.neck) this.neck.rotation.set(-p.pitch * 0.3, p.yaw * 0.3, p.roll * 0.3);
      }
      const em = v.expressionManager;
      if (em) {
        em.setValue('aa', Math.min(1, p.jaw)); em.setValue('blinkLeft', p.blinkL > 0.5 ? 1 : p.blinkL * 1.2); em.setValue('blinkRight', p.blinkR > 0.5 ? 1 : p.blinkR * 1.2);
        em.setValue('happy', Math.min(0.55, p.smile * 0.55) * (1 - Math.min(1, p.jaw) * 0.5));
      }
      const s = v.scene.position;
      if (full) {
        // 내가 좌우로 움직이면 아바타도 화면에서 같이 움직인다
        const half = Math.tan(THREE.MathUtils.degToRad(12)) * (this.camZ || 4.8) * this.camera.aspect;
        s.x += (THREE.MathUtils.clamp(p.bodyX || 0, -1, 1) * half * 0.75 - s.x) * 0.25;
        // 발 딛기: 가장 낮은 발이 바닥에 닿도록 몸 전체를 올리고 내린다(앉으면 내려간다)
        v.scene.updateMatrixWorld(true);
        if (this.rest?.feet.length) { let low = Infinity; for (const f of this.rest.feet) low = Math.min(low, f.getWorldPosition(_a).y); s.y += (this.rest.footY - low) * 0.5; }
        this.shadow.position.x = s.x;
      } else { s.x = (p.x || 0) * 0.05; s.y = 0; }
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
