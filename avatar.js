// 아바타 그리기와 얼굴 추적. 영상은 이 기기 안에서만 쓰고 어디에도 보내지 않는다.

export const neutralPose = () => ({ x: 0, y: 0, yaw: 0, pitch: 0, roll: 0, jaw: 0, blinkL: 0, blinkR: 0, smile: 0, brow: 0 });

const shadeOf = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

export function drawAvatar(ctx, av, p, w, h) {
  ctx.save();
  ctx.fillStyle = av.bg; ctx.fillRect(0, 0, w, h);
  const s = Math.min(w, h) / 400;
  ctx.translate(w / 2 + p.x * 40 * s, h * 0.5 + p.y * 30 * s);
  ctx.scale(s, s);
  const shade = av.kind === 'shade';
  const line = shade ? null : shadeOf(av.hair, 0.5);
  const dx = p.yaw * 70, dy = -p.pitch * 55;
  const stroke = (lw = 4) => { if (line) { ctx.lineWidth = lw; ctx.strokeStyle = line; ctx.stroke(); } };
  const fill = (c, x = 0, y = 0, r = 120) => {
    if (!shade) { ctx.fillStyle = c; ctx.fill(); return; }
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.1, x, y, r * 1.15);
    g.addColorStop(0, shadeOf(c, 1.18)); g.addColorStop(0.6, c); g.addColorStop(1, shadeOf(c, 0.62));
    ctx.fillStyle = g; ctx.fill();
  };

  // 어깨와 목
  ctx.beginPath(); ctx.ellipse(0, 250, 170, 110, 0, Math.PI, 0); ctx.lineTo(170, 320); ctx.lineTo(-170, 320); ctx.closePath();
  fill(av.cloth, 0, 250, 170); stroke();
  ctx.beginPath(); ctx.roundRect(-32 + dx * 0.2, 95, 64, 70, 20); fill(shadeOf(av.skin, 0.9), 0, 130, 50); stroke();

  ctx.rotate(p.roll);
  // 뒷머리
  ctx.beginPath(); ctx.ellipse(-dx * 0.15, -10, 128, 138, 0, 0, Math.PI * 2); fill(av.hair, 0, -10, 135); stroke();

  // 귀·뿔·더듬이
  const side = (sx) => {
    ctx.save(); ctx.translate(sx * 92 - dx * 0.3, -112); ctx.scale(sx, 1);
    ctx.beginPath();
    if (av.ear === 'cat') { ctx.moveTo(-34, 20); ctx.lineTo(6, -62); ctx.lineTo(40, 26); ctx.closePath(); fill(av.hair, 0, -10, 50); stroke(); }
    if (av.ear === 'horn') { ctx.moveTo(-16, 18); ctx.quadraticCurveTo(0, -40, 24, -58); ctx.quadraticCurveTo(26, -10, 18, 20); ctx.closePath(); fill('#e9e4ea', 0, -20, 40); stroke(); }
    if (av.ear === 'feather') { ctx.ellipse(18, -4, 16, 52, 0.7, 0, Math.PI * 2); fill(shadeOf(av.hair, 1.25), 18, -4, 50); stroke(); }
    if (av.ear === 'antenna') { ctx.moveTo(-6, 10); ctx.lineTo(-18, -66); ctx.lineWidth = 6; ctx.strokeStyle = shadeOf(av.hair, 1.4); ctx.stroke(); ctx.beginPath(); ctx.arc(-18, -72, 11, 0, Math.PI * 2); fill(av.eye, -18, -72, 12); }
    ctx.restore();
  };
  if (av.ear) { side(-1); side(1); }

  // 얼굴
  ctx.beginPath(); ctx.ellipse(dx * 0.25, 8, 104, 116, 0, 0, Math.PI * 2); fill(av.skin, dx * 0.25, 8, 112); stroke();

  const fx = dx, fy = dy + 6;
  // 눈
  const eye = (sx, blink) => {
    const ex = fx + sx * 44, ey = fy - 4, open = Math.max(0.08, 1 - blink);
    const rx = av.bigEye ? 30 : av.kind === 'flat' ? 21 : 17, ry = (av.bigEye ? 36 : av.kind === 'flat' ? 25 : 17) * open;
    if (av.visor) return;
    ctx.beginPath(); ctx.ellipse(ex, ey, rx, ry, 0, 0, Math.PI * 2);
    if (av.bigEye) { ctx.fillStyle = av.eye; ctx.fill(); }
    else { ctx.fillStyle = '#fbfcff'; ctx.fill(); stroke(3);
      ctx.save(); ctx.clip(); ctx.beginPath(); ctx.arc(ex + p.yaw * 10, ey + 2, rx * 0.72, 0, Math.PI * 2); ctx.fillStyle = av.eye; ctx.fill();
      ctx.beginPath(); ctx.arc(ex + p.yaw * 10, ey + 2, rx * 0.34, 0, Math.PI * 2); ctx.fillStyle = '#0c0d12'; ctx.fill(); ctx.restore(); }
    ctx.beginPath(); ctx.arc(ex - rx * 0.3, ey - ry * 0.35, rx * 0.2, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.9)'; if (open > 0.4) ctx.fill();
    // 눈썹
    ctx.beginPath(); ctx.moveTo(ex - 24, ey - 38 - p.brow * 14); ctx.quadraticCurveTo(ex, ey - 48 - p.brow * 18, ex + 24, ey - 38 - p.brow * 10);
    ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.strokeStyle = shadeOf(av.hair, 0.8); ctx.stroke();
  };
  eye(-1, p.blinkR); eye(1, p.blinkL);
  if (av.visor) {
    ctx.beginPath(); ctx.roundRect(fx - 78, fy - 30, 156, 46, 23); ctx.fillStyle = '#0e1418'; ctx.fill();
    const o = Math.max(0.15, 1 - (p.blinkL + p.blinkR) / 2);
    ctx.fillStyle = av.eye; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.roundRect(fx + sx * 38 - 20 + p.yaw * 8, fy - 7 - 9 * o, 40, 18 * o, 9); ctx.fill(); }
  }
  if (av.glasses) { ctx.lineWidth = 4; ctx.strokeStyle = '#2b2f38'; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.roundRect(fx + sx * 44 - 30, fy - 34, 60, 56, 14); ctx.stroke(); } ctx.beginPath(); ctx.moveTo(fx - 14, fy - 8); ctx.lineTo(fx + 14, fy - 8); ctx.stroke(); }

  // 볼
  if (!av.visor) { ctx.fillStyle = 'rgba(255,90,120,.22)'; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(fx + sx * 62, fy + 36, 18, 10, 0, 0, Math.PI * 2); ctx.fill(); } }

  // 입
  const mw = 26 + p.smile * 18, mo = p.jaw * 34, my = fy + 60;
  ctx.beginPath();
  ctx.moveTo(fx - mw, my - p.smile * 8);
  ctx.quadraticCurveTo(fx, my + 6 + p.smile * 12 - mo * 0.1, fx + mw, my - p.smile * 8);
  ctx.quadraticCurveTo(fx, my + 10 + mo + p.smile * 10, fx - mw, my - p.smile * 8);
  ctx.fillStyle = mo > 4 ? '#5a1626' : shadeOf(av.skin, 0.55); ctx.fill();
  ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.strokeStyle = shadeOf(av.skin, 0.45); ctx.stroke();

  // 앞머리
  ctx.beginPath();
  ctx.moveTo(-122, -24); ctx.quadraticCurveTo(-110, -150, 0, -150); ctx.quadraticCurveTo(112, -150, 122, -24);
  ctx.quadraticCurveTo(84 + dx * 0.4, -70, 44 + dx * 0.5, -58); ctx.quadraticCurveTo(10 + dx * 0.5, -92, -30 + dx * 0.5, -56); ctx.quadraticCurveTo(-70 + dx * 0.4, -78, -122, -24);
  fill(av.hair, 0, -110, 140); stroke();
  ctx.restore();
}

// 얼굴 추적기. 카메라와 모델을 못 쓰면 가만히 숨 쉬는 동작으로 대신한다.
export class FaceRig {
  constructor() { this.pose = neutralPose(); this.mode = 'idle'; this.body = false; this.pl = null; this._n = 0; this.video = null; this.stream = null; this._t = 0; this.error = ''; }

  async start(video) {
    this.video = video;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      video.srcObject = this.stream; video.muted = true; video.playsInline = true; await video.play();
    } catch (e) { this.error = '카메라를 열지 못했습니다'; this.mode = 'idle'; return this.mode; }
    try {
      const v = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
      const { FaceLandmarker, FilesetResolver } = await import(/* @vite-ignore */ `${v}/vision_bundle.mjs`);
      const files = await FilesetResolver.forVisionTasks(`${v}/wasm`);
      this.fl = await FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', delegate: 'GPU' },
        runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true,
      });
      this.mode = 'track';
    } catch (e) { this.error = '얼굴 인식 모델을 불러오지 못했습니다'; this.mode = 'idle'; }
    return this.mode;
  }

  // 전신 추적을 켜고 끈다. 몸 관절 모델은 처음 켤 때 한 번만 받는다.
  async setBody(on) {
    this.body = !!on; this.pose.full = this.body; if (!this.body) this.pose.body = null;
    if (!this.body || this.pl || this.mode !== 'track' || this._plLoading) return this.body;
    this._plLoading = true;
    try {
      const v = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
      const { PoseLandmarker, FilesetResolver } = await import(/* @vite-ignore */ `${v}/vision_bundle.mjs`);
      const files = await FilesetResolver.forVisionTasks(`${v}/wasm`);
      this.pl = await PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task', delegate: 'GPU' },
        runningMode: 'VIDEO', numPoses: 1,
      });
    } catch (e) { this.error = '몸 인식 모델을 불러오지 못했습니다'; this.body = false; this.pose.full = false; }
    this._plLoading = false; return this.body;
  }

  stop() { this.stream?.getTracks().forEach((t) => t.stop()); this.stream = null; this.fl?.close?.(); this.fl = null; this.pl?.close?.(); this.pl = null; this.body = false; this.pose.body = null; this.pose.full = false; if (this.video) this.video.srcObject = null; this.mode = 'idle'; }

  // 매 프레임 호출. 현재 자세를 돌려준다.
  update(now) {
    const p = this.pose, k = 0.45, mix = (a, b) => a + (b - a) * k;
    if (this.mode === 'track' && this.fl && this.video.readyState >= 2 && now !== this._t) {
      this._t = now; this._n++;
      // 전신일 때는 몸과 얼굴을 한 프레임씩 번갈아 읽어 폰 부담을 줄인다
      if (this.body && this.pl && this._n % 2 === 0) {
        let pr; try { pr = this.pl.detectForVideo(this.video, now); } catch { pr = null; }
        const w = pr?.worldLandmarks?.[0];
        if (w) { const old = p.body; p.body = w.map((q, i) => { const o = old?.[i]; return o ? { x: mix(o.x, q.x), y: mix(o.y, q.y), z: mix(o.z, q.z), v: q.visibility ?? 1 } : { x: q.x, y: q.y, z: q.z, v: q.visibility ?? 1 }; }); }
        else p.body = null;
        return p;
      }
      let r; try { r = this.fl.detectForVideo(this.video, now); } catch { r = null; }
      const b = r?.faceBlendshapes?.[0]?.categories, m = r?.facialTransformationMatrixes?.[0]?.data, lm = r?.faceLandmarks?.[0];
      this.seen = !!b;
      if (b && m) {
        const g = (n) => b.find((c) => c.categoryName === n)?.score ?? 0;
        p.yaw = mix(p.yaw, -Math.atan2(m[8], m[10]));
        p.pitch = mix(p.pitch, Math.asin(Math.max(-1, Math.min(1, -m[9]))));
        p.roll = mix(p.roll, -Math.atan2(m[1], m[0]));
        p.jaw = mix(p.jaw, Math.min(1, g('jawOpen') * 1.6));
        p.blinkL = mix(p.blinkL, g('eyeBlinkLeft')); p.blinkR = mix(p.blinkR, g('eyeBlinkRight'));
        p.smile = mix(p.smile, Math.min(1, (g('mouthSmileLeft') + g('mouthSmileRight')) * 0.8));
        p.brow = mix(p.brow, g('browInnerUp'));
        if (lm?.[1]) { p.x = mix(p.x, -(lm[1].x - 0.5) * 2); p.y = mix(p.y, (lm[1].y - 0.5) * 2); }
      }
    } else if (this.mode !== 'track') {
      const t = now / 1000;
      p.yaw = Math.sin(t * 0.7) * 0.18; p.pitch = Math.sin(t * 0.5) * 0.06; p.roll = Math.sin(t * 0.4) * 0.04;
      p.blinkL = p.blinkR = (t % 3.4) < 0.14 ? 1 : 0; p.smile = 0.35 + Math.sin(t * 0.9) * 0.2; p.jaw = Math.max(0, Math.sin(t * 2.2)) * 0.25; p.brow = 0.1;
    }
    return p;
  }
}
