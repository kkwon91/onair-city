import { LAYERS, HOUSES, RESIDENTS, AVATARS, TRAITS, RIVAL, CHAT_POOL, total } from './data.js';
import { FaceRig, neutralPose } from './avatar.js';
import { VrmView } from './vrm.js';

const $ = (s, el = document) => el.querySelector(s);
const view = $('#view');
const fmt = (n) => Math.round(n).toLocaleString('ko-KR');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const avOf = (id) => AVATARS.find((a) => a.id === id);
const resOf = (id) => RESIDENTS.find((r) => r.id === id);

const store = {
  get() { try { return JSON.parse(localStorage.getItem('onair.me') || 'null'); } catch { return null; } },
  set(v) { try { localStorage.setItem('onair.me', JSON.stringify(v)); } catch { /* 저장 못 해도 화면은 계속 */ } },
  clear() { try { localStorage.removeItem('onair.me'); } catch { /* 무시 */ } },
};
let me = store.get();
let cleanup = () => {};

// 주민 + 나를 한 목록으로
const everyone = () => {
  const list = RESIDENTS.map((r) => ({ ...r, sum: total(r.score) }));
  if (me) list.push({ ...me, id: 'me', isMe: true, sum: total(me.score) });
  return list.sort((a, b) => b.sum - a.sum);
};

// 초상 그리기. 3D 모델은 VrmView 가, 실사층은 아직 그릴 수 없어 윤곽만 둔다.
const views = new Map(); // canvas → VrmView
function silhouette(canvas) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), w = canvas.clientWidth || 300, h = canvas.clientHeight || 300;
  if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
  const ctx = canvas.getContext('2d'); if (!ctx) return; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#1a1d25'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#2a2f3b'; const s = Math.min(w, h);
  ctx.beginPath(); ctx.arc(w / 2, h * 0.42, s * 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(w / 2, h * 1.02, s * 0.36, s * 0.34, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8a91a3'; ctx.font = '13px Pretendard, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('실사층 초상은 변환 서버 연결 후 표시', w / 2, h - 14);
}
function portrait(canvas, avatarId, pose) {
  const av = avOf(avatarId);
  if (!av || av.kind === 'locked') { const v = views.get(canvas); if (v) v.blank(); else silhouette(canvas); return; }
  let v = views.get(canvas); if (!v) { v = new VrmView(canvas); views.set(canvas, v); }
  v.show(av); v.render(window.__pose || pose || { ...neutralPose(), smile: 0.5, yaw: 0.12 });
}
const dropViews = () => { for (const v of views.values()) v.dispose(); views.clear(); };
// 목록에 쓰는 작은 초상: 3D 모델은 미리 찍어 둔 그림, 실사층은 윤곽
// 주민의 작은 초상: 그림 초상이 있으면 그것을 쓴다
const face = (r) => (r.img ? `<img class="pt ag" src="${r.img}" alt="" loading="lazy">` : thumb(r.avatar));
const thumb = (id) => (avOf(id)?.kind === 'vrm' ? `<img class="pt" src="thumbs/${id}.jpg" alt="" loading="lazy">` : `<canvas data-av="${id}"></canvas>`);
const paintPortraits = () => document.querySelectorAll('canvas[data-av]').forEach((c) => silhouette(c));

const layerTag = (k) => `<span class="tag"><i style="background:${LAYERS[k].color}"></i>${LAYERS[k].name}</span>`;

/* ───────── 도시 ───────── */
function cityView() {
  const live = RESIDENTS.filter((r) => r.live).sort((a, b) => b.viewers - a.viewers);
  const D = [
    ['none', 400, 40, 200, 110, '문', '관측자가 들어오는 곳'],
    ['ink', 70, 180, 360, 270, '잉크 골목', '그림층'],
    ['cast', 570, 150, 360, 290, '주물 공단', '조형층'],
    ['glass', 300, 480, 400, 150, '유리 거리', '실사층'],
  ];
  const pins = RESIDENTS.map((r) => `
    <g class="pin" data-go="#/r/${r.id}" transform="translate(${r.x},${r.y})">
      <circle r="13" fill="${LAYERS[r.layer].color}" stroke="#0d0e12" stroke-width="3"/>
      ${r.live ? '<circle cx="11" cy="-11" r="5" fill="#ff3b4e" stroke="#0d0e12" stroke-width="2"/>' : ''}
      <text x="20" y="1">${r.name}</text>
      <text class="v" x="20" y="16">${r.live ? `방송 중 ${fmt(r.viewers)}` : '쉬는 중'}</text>
    </g>`).join('');
  const mePin = me ? `<g class="pin" data-go="#/me" transform="translate(${me.x},${me.y})"><rect x="-13" y="-13" width="26" height="26" rx="5" fill="#ff3b4e" stroke="#0d0e12" stroke-width="3"/><text x="20" y="5">${esc(me.name)} (나)</text></g>` : '';
  view.innerHTML = `
    <div class="lead">
      <h1>누가 봐 줄 때만 선명해지는 도시</h1>
      <p class="dim">이 도시의 주민은 관심을 받으면 또렷해지고, 잊히면 신호가 끊깁니다. 그래서 모두가 방송을 합니다.</p>
      <div class="row">
        ${me ? `<a class="btn go" href="#/onair">방송 시작</a><a class="btn" href="#/me">내 주민증</a>` : `<a class="btn go" href="#/join">주민으로 들어가기</a>`}
        <a class="btn" href="#/rank">전광판 보기</a>
      </div>
    </div>
    <div class="mapwrap"><svg viewBox="0 0 1000 680" role="img" aria-label="온에어 시티 지도">
      <line class="road" x1="500" y1="150" x2="500" y2="480"/><line class="road" x1="430" y1="330" x2="570" y2="330"/>
      ${D.map(([k, x, y, w, h, n, s]) => `<rect class="dist" data-d="${k}" x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/><text class="dlabel" x="${x + 16}" y="${y + 28}">${n}</text><text class="dsub" x="${x + 16}" y="${y + 46}">${s}</text>`).join('')}
      <circle cx="500" cy="330" r="62" fill="#1d1418" stroke="#ff3b4e" stroke-width="1.5" data-go="#/rank" style="cursor:pointer"/>
      <text class="dlabel" x="500" y="318" text-anchor="middle" style="fill:#eceef3">전광판 광장</text><text class="dsub" x="500" y="336" text-anchor="middle">순위 보기</text>
      ${Object.entries(HOUSES).filter(([, h]) => h.head).map(([, h]) => `<rect class="house" x="${h.x}" y="${h.y}" width="78" height="40" rx="4"/><text class="houset" x="${h.x + 39}" y="${h.y + 25}" text-anchor="middle">하우스 ${h.name}</text>`).join('')}
      ${pins}${mePin}
    </svg></div>
    <p class="small dim" style="margin-top:8px">${me ? '구역을 누르면 내 자리가 그 구역으로 옮겨집니다. ' : ''}주민을 누르면 인물 시트가 열립니다.</p>
    <section><h2>지금 방송 중</h2><div class="grid">
      ${live.map((r) => `<a class="card" href="#/live/${r.id}">${face(r)}<div class="b">
        <div class="row" style="justify-content:space-between"><b>${r.name}</b><span class="live">방송 중 <span class="num">${fmt(r.viewers)}</span></span></div>
        <span class="small dim">${r.talent} · ${r.trait}</span>${layerTag(r.layer)}</div></a>`).join('')}
    </div></section>`;
  paintPortraits();
  view.onclick = (e) => {
    const go = e.target.closest('[data-go]'); if (go) { location.hash = go.dataset.go; return; }
    const d = e.target.closest('[data-d]');
    if (d && me) {
      const b = d.getBBox(); me.x = Math.round(b.x + b.width * (0.3 + Math.random() * 0.4)); me.y = Math.round(b.y + b.height * (0.45 + Math.random() * 0.35));
      store.set(me); cityView();
    }
  };
}

/* ───────── 전광판 ───────── */
const PLAT = [['youtube', '유튜브', '#e5484d'], ['tiktok', '틱톡', '#27c2a0'], ['insta', '인스타', '#b07cff'], ['live', '생방송', '#5b8cff']];
function rankView() {
  const list = everyone(), top = list[0].sum;
  const sumBy = (key) => { const o = {}; for (const r of list) o[r[key]] = (o[r[key]] || 0) + r.sum; return Object.entries(o).sort((a, b) => b[1] - a[1]); };
  const meters = (rows, nameOf, colorOf) => { const mx = rows[0][1]; return rows.map(([k, v]) => `<div class="meter"><span>${nameOf(k)}</span><div class="bar"><span style="width:${(v / mx) * 100}%;background:${colorOf(k)}"></span></div><span class="num r" style="text-align:right">${fmt(v)}</span></div>`).join(''); };
  view.innerHTML = `
    <div class="lead"><h1>전광판</h1><p class="dim">광도는 도시 밖 플랫폼에서 받은 시선의 합입니다. 최근 4주 기록만 반영합니다.</p></div>
    <div class="legend small">${PLAT.map(([, n, c]) => `<span class="tag"><i style="background:${c}"></i>${n}</span>`).join('')}</div>
    <div class="tablewrap"><table>
      <thead><tr><th>순위</th><th>주민</th><th class="hide">층</th><th class="hide">하우스</th><th>어디서 받았나</th><th class="r">광도</th></tr></thead>
      <tbody>${list.map((r, i) => `<tr class="${r.isMe ? 'me' : ''}" data-go="${r.isMe ? '#/me' : '#/r/' + r.id}" style="cursor:pointer">
        <td class="num">${i + 1}</td><td><b>${esc(r.name)}</b>${r.isMe ? ' <span class="small dim">나</span>' : ''}${r.live ? ' <span class="live">방송 중</span>' : ''}</td>
        <td class="hide">${layerTag(r.layer)}</td><td class="hide">${HOUSES[r.house].name}</td>
        <td><div class="bar" style="width:${Math.max(8, (r.sum / top) * 100)}%">${PLAT.map(([k, , c]) => `<span style="width:${(r.score[k] / r.sum) * 100}%;background:${c}"></span>`).join('')}</div></td>
        <td class="r num"><b>${fmt(r.sum)}</b></td></tr>`).join('')}</tbody>
    </table></div>
    <section class="cols">
      <div class="box"><h2>하우스 점수</h2><p class="small dim" style="margin:4px 0 8px">소속 주민의 광도를 더한 값</p>${meters(sumBy('house'), (k) => HOUSES[k].name, () => '#eceef3')}</div>
      <div class="box"><h2>층별 점수</h2><p class="small dim" style="margin:4px 0 8px">어느 층이 지금 가장 선명한가</p>${meters(sumBy('layer'), (k) => LAYERS[k].name, (k) => LAYERS[k].color)}</div>
    </section>`;
  view.onclick = (e) => { const go = e.target.closest('[data-go]'); if (go) location.hash = go.dataset.go; };
}

/* ───────── 인물 시트 ───────── */
function sheetView(id) {
  const r = resOf(id); if (!r) return cityView();
  const rank = everyone().findIndex((x) => x.id === id) + 1;
  view.innerHTML = `
    <div class="sheet">
      <div>${r.img ? `<img class="still" src="${r.img}" alt="${r.name} 초상">` : '<canvas id="cv"></canvas>'}
        <div class="row" style="margin-top:12px">${r.live ? `<a class="btn go" href="#/live/${r.id}">방송 보기</a>` : '<span class="dim">지금은 쉬는 중입니다</span>'}</div></div>
      <div>
        <div class="row" style="justify-content:space-between"><h1>${r.name}</h1><span class="num dim">전광판 ${rank}위 · 광도 ${fmt(total(r.score))}</span></div>
        <div class="row" style="margin:6px 0 16px">${layerTag(r.layer)}<span class="tag">하우스 ${HOUSES[r.house].name}</span><span class="tag">${r.talent}</span></div>
        <dl>
          <div><dt>한 줄</dt><dd>${r.line}</dd></div>
          <div><dt>지금까지</dt><dd>${r.story}</dd></div>
          <div><dt>성격</dt><dd>${r.trait}</dd></div>
          <div><dt>말투</dt><dd>${r.speech}</dd></div>
          <div><dt>인사</dt><dd>주민이 "${r.greet[0]}" 하면 채팅이 "${r.greet[1]}"로 받습니다.</dd></div>
          <div><dt>관계</dt><dd>${r.relation}</dd></div>
          <div><dt>공개 미션</dt><dd>${r.mission}</dd></div>
        </dl>
      </div>
    </div>`;
  if (r.img) { cleanup = () => {}; view.onclick = null; return; }
  const cv = $('#cv'); const rig = new FaceRig(); let raf;
  const loop = (now) => { portrait(cv, r.avatar, rig.update(now)); raf = requestAnimationFrame(loop); }; raf = requestAnimationFrame(loop);
  cleanup = () => cancelAnimationFrame(raf); view.onclick = null;
}

/* ───────── 방송 화면 공통 ───────── */
function chatBox(el, onLight) {
  const list = $('.list', el); let n = 0;
  const add = (who, msg) => { const p = document.createElement('div'); p.innerHTML = `<b>${esc(who)}</b>${esc(msg)}`; list.append(p); while (list.children.length > 40) list.firstChild.remove(); list.scrollTop = list.scrollHeight; };
  const t = setInterval(() => add('관측자' + (100 + Math.floor(Math.random() * 900)), CHAT_POOL[(n++ * 7 + Math.floor(Math.random() * 3)) % CHAT_POOL.length]), 1700);
  $('[data-light]', el)?.addEventListener('click', () => { add('나', '빛을 보냈습니다'); onLight?.(); });
  return () => clearInterval(t);
}
const chatHtml = (btn) => `<div class="chat"><div class="h">시연용 가상 채팅</div><div class="list"></div><div class="f">${btn}</div></div>`;

function liveView(id) {
  const r = resOf(id); if (!r || !r.live) return sheetView(id);
  view.innerHTML = `
    <div class="row" style="justify-content:space-between;margin-bottom:12px"><div><h1>${r.name}</h1><span class="small dim">${r.talent} · ${LAYERS[r.layer].name} · 하우스 ${HOUSES[r.house].name}</span></div>
      <span class="live">방송 중 <span class="num" id="vw">${fmt(r.viewers)}</span></span></div>
    <div class="liveview"><div class="stage">${r.img ? `<img class="still breathe" src="${r.img}" alt="${r.name}">` : '<canvas id="cv"></canvas>'}<div class="name"><span>"${r.greet[0]}"</span><a class="btn" href="#/r/${r.id}">인물 시트</a></div></div>
      ${chatHtml('<button class="btn go wide" data-light>빛 보내기 (광도 +10)</button>')}</div>`;
  const cv = $('#cv'); const rig = new FaceRig(); let raf;
  const loop = (now) => { portrait(cv, r.avatar, rig.update(now)); raf = requestAnimationFrame(loop); }; if (cv) raf = requestAnimationFrame(loop);
  const stopChat = chatBox(view, () => { r.score.live += 10; });
  cleanup = () => { cancelAnimationFrame(raf); stopChat(); }; view.onclick = null;
}

/* ───────── 가입 → 변신 → 배정 ───────── */
function joinView() {
  const st = { step: 1, name: me?.name || '', idx: 0, rig: new FaceRig(), raf: 0, scan: null, key: null, talent: 0, greet: null };
  const usable = () => AVATARS[st.idx].kind !== 'locked';
  const stopCam = () => { cancelAnimationFrame(st.raf); st.rig.stop(); };
  cleanup = stopCam;
  const head = (t, d) => `<div class="steps">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= st.step ? 'on' : ''}"></i>`).join('')}</div><div><h1>${t}</h1><p class="dim" style="margin-top:6px">${d}</p></div>`;

  const render = () => {
    if (st.step === 1) {
      view.innerHTML = `<div class="flow">${head('도시에서 쓸 이름', '본명 말고, 이 도시에서 불릴 이름을 정합니다. 이 시연판은 이름을 이 기기에만 저장합니다.')}
        <input type="text" id="nm" maxlength="10" placeholder="예: 새벽" value="${esc(st.name)}" autocomplete="off">
        <button class="btn go wide" id="next">다음</button></div>`;
      $('#next').onclick = () => { const v = $('#nm').value.trim(); if (!v) { $('#nm').focus(); return; } st.name = v; st.step = 2; render(); };
    } else if (st.step === 2) {
      view.innerHTML = `<div class="flow">${head('카메라를 켭니다', '얼굴 움직임을 읽어 화면 속 다른 모습을 움직이는 데 씁니다.')}
        <div class="box small"><p>영상은 이 기기 안에서만 처리합니다. 저장하지 않고 어디에도 보내지 않습니다. 얼굴 인식 프로그램 파일만 인터넷에서 내려받습니다.</p></div>
        <label class="check"><input type="checkbox" id="ok"><span>카메라로 내 얼굴 움직임을 읽는 데 동의합니다.</span></label>
        <button class="btn go wide" id="next" disabled>카메라 켜기</button>
        <button class="btn wide" id="skip">카메라 없이 둘러보기</button></div>`;
      $('#ok').onchange = (e) => { $('#next').disabled = !e.target.checked; };
      $('#next').onclick = () => { st.cam = true; st.step = 3; render(); };
      $('#skip').onclick = () => { st.cam = false; st.step = 3; render(); };
    } else if (st.step === 3) {
      view.innerHTML = `<div class="flow">${head('어떤 모습으로 살까요', '화면을 옆으로 밀면 모습이 바뀝니다. 마음에 드는 모습에서 멈추세요.')}
        <div class="stage" id="stage"><canvas id="cv"></canvas><video id="vd" playsinline muted ${st.cam ? '' : 'hidden'}></video>
          <div class="cap" id="cap">준비 중</div><div class="lock" id="lock" hidden></div>
          <button class="arrow l" id="pl" aria-label="이전 모습">‹</button><button class="arrow r" id="pr" aria-label="다음 모습">›</button>
          <div class="name"><span><b id="an"></b> <span class="small dim" id="al"></span></span><span class="small dim num" id="ai"></span></div></div>
        <div class="strip" id="strip">${AVATARS.map((a, i) => `<button data-i="${i}">${a.name}</button>`).join('')}</div>
        <button class="btn go wide" id="pick">이 모습으로 정하기</button></div>`;
      const cv = $('#cv');
      const sync = () => { const a = AVATARS[st.idx]; $('#an').textContent = a.name; $('#al').textContent = LAYERS[a.layer].name; $('#ai').textContent = `${st.idx + 1} / ${AVATARS.length}`;
        $('#lock').hidden = usable(); if (!usable()) $('#lock').innerHTML = '<b>실사층은 아직 잠겨 있습니다</b><span class="small dim">다른 사람의 실제 모습으로 바꾸려면 변환 서버가 필요합니다. 지금은 그림층과 조형층만 고를 수 있습니다.</span>';
        $('#pick').disabled = !usable(); document.querySelectorAll('#strip button').forEach((b, i) => b.classList.toggle('on', i === st.idx)); };
      const move = (d) => { st.idx = (st.idx + d + AVATARS.length) % AVATARS.length; sync(); };
      $('#pl').onclick = () => move(-1); $('#pr').onclick = () => move(1);
      $('#strip').onclick = (e) => { const b = e.target.closest('button'); if (b) { st.idx = +b.dataset.i; sync(); } };
      let sx = null; const stage = $('#stage');
      stage.onpointerdown = (e) => { if (!e.target.closest('button')) sx = e.clientX; };
      stage.onpointerup = (e) => { if (sx != null && Math.abs(e.clientX - sx) > 36) move(e.clientX < sx ? 1 : -1); sx = null; };
      sync();
      const loop = (now) => { portrait(cv, usable() ? AVATARS[st.idx].id : 'human', st.rig.update(now)); st.raf = requestAnimationFrame(loop); };
      st.raf = requestAnimationFrame(loop);
      const cap = $('#cap');
      if (st.cam && st.rig.mode !== 'track') { cap.textContent = '카메라 여는 중'; st.rig.start($('#vd')).then((m) => { if ($('#cap')) $('#cap').textContent = m === 'track' ? '내 얼굴을 따라 움직입니다' : `${st.rig.error}. 미리보기로 보여 드립니다`; }); }
      else cap.textContent = st.rig.mode === 'track' ? '내 얼굴을 따라 움직입니다' : '카메라 없이 미리보기';
      $('#pick').onclick = () => { cancelAnimationFrame(st.raf); st.step = 4; render(); };
    } else if (st.step === 4) {
      const tracking = st.rig.mode === 'track';
      view.innerHTML = `<div class="flow">${head('분위기를 읽습니다', tracking ? '6초 동안 웃어 보고, 입을 크게 벌려 보고, 고개를 좌우로 돌려 보세요. 생김새가 아니라 표정이 얼마나 크게 움직이는지만 봅니다.' : '카메라를 쓰지 않아 두 가지만 여쭙니다.')}
        ${tracking ? `<div class="stage"><canvas id="cv"></canvas><div class="cap" id="cap">읽는 중 6</div></div>` : `
          <div><h3 style="margin-bottom:8px">방송을 켜면 나는</h3><div class="choices" data-q="energy"><button data-v="0.8">목소리가 커진다</button><button data-v="0.45">평소와 같다</button><button data-v="0.15">더 차분해진다</button></div></div>
          <div><h3 style="margin-bottom:8px">웃음은</h3><div class="choices" data-q="warmth"><button data-v="0.8">헤픈 편이다</button><button data-v="0.4">그때그때 다르다</button><button data-v="0.15">아끼는 편이다</button></div></div>
          <button class="btn go wide" id="next" disabled>결과 보기</button>`}</div>`;
      const finish = (energy, warmth) => { st.scan = { energy, warmth };
        st.key = energy > 0.55 && warmth > 0.5 ? 'loud' : energy > 0.55 ? 'sharp' : warmth > 0.5 ? 'warm' : energy < 0.3 && warmth < 0.3 ? 'craft' : 'sly';
        st.step = 5; render(); };
      if (tracking) {
        const cv = $('#cv'), t0 = performance.now(); const m = { smile: 0, jaw: 0, yawMin: 0, yawMax: 0 };
        const loop = (now) => { const p = st.rig.update(now); portrait(cv, AVATARS[st.idx].id, p);
          m.smile = Math.max(m.smile, p.smile); m.jaw = Math.max(m.jaw, p.jaw); m.yawMin = Math.min(m.yawMin, p.yaw); m.yawMax = Math.max(m.yawMax, p.yaw);
          const left = 6 - (now - t0) / 1000; if ($('#cap')) $('#cap').textContent = `읽는 중 ${Math.max(0, Math.ceil(left))}`;
          if (left <= 0) return finish(Math.min(1, m.jaw * 0.6 + Math.min(1, (m.yawMax - m.yawMin) / 0.9) * 0.4), Math.min(1, m.smile));
          st.raf = requestAnimationFrame(loop); };
        st.raf = requestAnimationFrame(loop);
      } else {
        const ans = {};
        view.querySelectorAll('.choices').forEach((box) => { box.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; ans[box.dataset.q] = +b.dataset.v; box.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); $('#next').disabled = !(ans.energy != null && ans.warmth != null); }; });
        $('#next').onclick = () => finish(ans.energy, ans.warmth);
      }
    } else {
      const av = AVATARS[st.idx], L = LAYERS[av.layer], T = TRAITS[st.key], rival = resOf(RIVAL[st.key]);
      const house = st.scan.energy > 0.55 ? 'prism' : 'oktop';
      st.greet = st.greet || [st.name, '켜졌다'];
      view.innerHTML = `<div class="flow">${head(`${esc(st.name)}, ${L.name} 주민이 되었습니다`, '이제 이 성격과 재능으로 도시에서 활동하면 됩니다. 마음에 안 들면 재능과 인사는 바꿀 수 있습니다.')}
        <div class="stage"><canvas id="cv"></canvas><div class="name"><span><b>${esc(st.name)}</b> <span class="small dim">${av.name} · ${L.district}</span></span></div></div>
        <div class="box"><dl>
          <div><dt>사는 곳</dt><dd>${L.district} (${L.name} — ${L.sub})</dd></div>
          <div><dt>성격</dt><dd>${T.trait}<br><span class="small dim">읽은 값: 표정 폭 ${Math.round(st.scan.energy * 100)}, 미소 ${Math.round(st.scan.warmth * 100)} — ${T.why}</span></dd></div>
          <div><dt>말투</dt><dd>${T.speech}</dd></div>
          <div><dt>재능</dt><dd><div class="strip" id="tal">${T.talent.map((t, i) => `<button data-i="${i}" class="${i === st.talent ? 'on' : ''}">${t}</button>`).join('')}</div></dd></div>
          <div><dt>인사 — 내가 앞 구절을 던지면 채팅이 뒤 구절을 받습니다</dt><dd class="row" style="flex-wrap:nowrap"><input type="text" id="g0" maxlength="12" value="${esc(st.greet[0])}"><input type="text" id="g1" maxlength="12" value="${esc(st.greet[1])}"></dd></div>
          <div><dt>먼저 제안해 온 하우스</dt><dd>${HOUSES[house].name} — ${HOUSES[house].line}</dd></div>
          <div><dt>부딪힐 주민</dt><dd>${rival.name} (${rival.trait}). ${rival.line}</dd></div>
          <div><dt>첫 미션</dt><dd>첫 방송 10분 켜기 · 숏폼 한 편 올리기 · ${rival.name}의 방송에 찾아가 인사하기</dd></div>
        </dl></div>
        <button class="btn go wide" id="done">주민증 받기</button><button class="btn wide" id="back">모습 다시 고르기</button></div>`;
      const cv = $('#cv'); const loop = (now) => { portrait(cv, av.id, st.rig.update(now)); st.raf = requestAnimationFrame(loop); }; st.raf = requestAnimationFrame(loop);
      $('#tal').onclick = (e) => { const b = e.target.closest('button'); if (b) { st.talent = +b.dataset.i; st.greet = [$('#g0').value, $('#g1').value]; cancelAnimationFrame(st.raf); render(); } };
      $('#back').onclick = () => { cancelAnimationFrame(st.raf); st.step = 3; render(); };
      $('#done').onclick = () => {
        me = { name: st.name, avatar: av.id, layer: av.layer, house: 'solo', offer: house, key: st.key, trait: T.trait, speech: T.speech, talent: T.talent[st.talent],
          greet: [$('#g0').value.trim() || st.name, $('#g1').value.trim() || '켜졌다'], rival: rival.id, scan: st.scan, live: false, viewers: 0,
          score: { youtube: 0, tiktok: 0, insta: 0, live: 100 }, x: av.layer === 'ink' ? 180 : 800, y: av.layer === 'ink' ? 300 : 260 };
        store.set(me); stopCam(); location.hash = '#/me';
      };
    }
  };
  render(); view.onclick = null;
}

/* ───────── 내 주민증 ───────── */
function meView() {
  if (!me) { view.innerHTML = `<div class="flow"><h1>아직 주민이 아닙니다</h1><p class="dim">카메라로 다른 모습을 고르고, 성격과 재능을 받아 도시에 들어갑니다.</p><a class="btn go wide" href="#/join">주민으로 들어가기</a></div>`; return; }
  const rank = everyone().findIndex((x) => x.isMe) + 1, L = LAYERS[me.layer], rival = resOf(me.rival);
  view.innerHTML = `<div class="sheet">
    <div><canvas id="cv"></canvas><div class="row" style="margin-top:12px"><a class="btn go" href="#/onair">방송 시작</a><a class="btn" href="#/join">다시 변신</a></div></div>
    <div><div class="row" style="justify-content:space-between"><h1>${esc(me.name)}</h1><span class="num dim">전광판 ${rank}위 · 광도 ${fmt(total(me.score))}</span></div>
      <div class="row" style="margin:6px 0 16px">${layerTag(me.layer)}<span class="tag">${L.district}</span><span class="tag">${esc(me.talent)}</span></div>
      <dl>
        <div><dt>성격</dt><dd>${me.trait}</dd></div><div><dt>말투</dt><dd>${me.speech}</dd></div>
        <div><dt>인사</dt><dd>내가 "${esc(me.greet[0])}" 하면 채팅이 "${esc(me.greet[1])}"로 받습니다.</dd></div>
        <div><dt>하우스</dt><dd>무소속. ${HOUSES[me.offer].name}에서 제안이 와 있습니다.</dd></div>
        <div><dt>부딪힐 주민</dt><dd><a href="#/r/${rival.id}" style="text-decoration:underline">${rival.name}</a> — ${rival.trait}</dd></div>
        <div><dt>첫 미션</dt><dd>첫 방송 10분 켜기 · 숏폼 한 편 올리기 · ${rival.name}의 방송에 찾아가 인사하기</dd></div>
      </dl>
      <p style="margin-top:16px"><button class="btn" id="out">주민증 지우기</button></p></div></div>`;
  const cv = $('#cv'); cv.style.aspectRatio = '1'; const rig = new FaceRig(); let raf;
  const loop = (now) => { portrait(cv, me.avatar, rig.update(now)); raf = requestAnimationFrame(loop); }; raf = requestAnimationFrame(loop);
  cleanup = () => cancelAnimationFrame(raf);
  $('#out').onclick = () => { store.clear(); me = null; meView(); }; view.onclick = null;
}

/* ───────── 내 방송 ───────── */
function onairView() {
  if (!me) return meView();
  let on = false, viewers = 0, gained = 0, t0 = 0, raf, tick, stopChat = () => {};
  const rig = new FaceRig();
  view.innerHTML = `
    <div class="row" style="justify-content:space-between;margin-bottom:12px"><div><h1>${esc(me.name)}의 방송</h1><span class="small dim">${esc(me.talent)} · ${LAYERS[me.layer].name}</span></div><span class="live" id="lv" hidden>방송 중</span></div>
    <div class="liveview"><div>
      <div class="stage"><canvas id="cv"></canvas><video id="vd" playsinline muted hidden></video><div class="cap" id="cap">아직 켜지 않았습니다</div>
        <div class="name"><span>"${esc(me.greet[0])}" → 채팅 "${esc(me.greet[1])}"</span></div></div>
      <div class="stats" style="margin-top:10px"><div><span class="small dim">보는 관측자</span><b class="num" id="s1">0</b></div><div><span class="small dim">이번 방송 광도</span><b class="num" id="s2">+0</b></div><div><span class="small dim">켠 시간</span><b class="num" id="s3">0:00</b></div></div>
      <div class="row" style="margin-top:10px"><button class="btn go" id="go">카메라 켜고 방송 시작</button><button class="btn" id="noc">카메라 없이 시작</button><button class="btn" id="bd" hidden>전신으로 보기</button></div>
      <p class="small dim" style="margin-top:8px">시연판이라 실제로 송출되지는 않습니다. 영상은 이 기기 밖으로 나가지 않습니다.</p></div>
      ${chatHtml('<span class="small dim">방송을 켜면 관측자가 들어옵니다</span>')}</div>`;
  const cv = $('#cv');
  const loop = (now) => { portrait(cv, me.avatar, rig.update(now)); raf = requestAnimationFrame(loop); }; raf = requestAnimationFrame(loop);
  const end = () => { if (!on) return; on = false; clearInterval(tick); stopChat(); rig.stop(); me.score.live += gained; store.set(me);
    $('#lv').hidden = true; $('#cap').textContent = `방송 종료. 이번 방송 광도 +${fmt(gained)}`; $('#bd').hidden = true; $('#bd').textContent = '전신으로 보기'; $('#go').textContent = '다시 켜기'; $('#go').onclick = () => start(true); $('#noc').hidden = false; };
  const start = async (cam) => {
    $('#go').disabled = true; $('#noc').hidden = true; gained = 0; viewers = 0;
    if (cam) { $('#cap').textContent = '카메라 여는 중'; $('#vd').hidden = false; const m = await rig.start($('#vd')); if (m !== 'track') $('#vd').hidden = true; $('#cap').textContent = m === 'track' ? '내 얼굴을 따라 움직입니다' : `${rig.error}. 미리보기 동작으로 진행합니다`; }
    else $('#cap').textContent = '카메라 없이 미리보기 동작';
    $('#bd').hidden = rig.mode !== 'track';
    on = true; t0 = Date.now(); $('#lv').hidden = false; $('#go').disabled = false; $('#go').textContent = '방송 끝내기'; $('#go').onclick = end;
    stopChat = chatBox(view);
    tick = setInterval(() => { viewers = Math.max(1, Math.round(viewers + 1 + Math.random() * 6 - (viewers > 60 ? 3 : 0))); gained += Math.round(viewers * 0.15);
      const s = Math.floor((Date.now() - t0) / 1000); $('#s1').textContent = fmt(viewers); $('#s2').textContent = '+' + fmt(gained); $('#s3').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 1000);
  };
  $('#bd').onclick = async () => { const b = $('#bd'); b.disabled = true; if (!rig.body) $('#cap').textContent = '몸 인식 준비 중';
    const full = await rig.setBody(!rig.body); b.disabled = false; b.textContent = full ? '얼굴만 보기' : '전신으로 보기';
    $('#cap').textContent = full ? '몸 전체가 보이게 두세 걸음 물러나세요' : (rig.error && !rig.pl ? rig.error : '내 얼굴을 따라 움직입니다'); };
  $('#go').onclick = () => start(true); $('#noc').onclick = () => start(false);
  cleanup = () => { cancelAnimationFrame(raf); clearInterval(tick); stopChat(); rig.stop(); if (on) { me.score.live += gained; store.set(me); } }; view.onclick = null;
}

/* ───────── 작은 초상 찍기(개발용, 로컬 서버에서만) ───────── */
async function thumbsView() {
  view.innerHTML = '<div class="flow"><h1>작은 초상 찍기</h1><div style="width:384px;max-width:100%"><canvas id="cv" style="width:384px;height:240px;display:block"></canvas></div><pre id="log" class="small dim"></pre></div>';
  const cv = $('#cv'), log = $('#log'); const pose = { ...neutralPose(), smile: 0.6, yaw: 0.14, pitch: 0.02 };
  for (const av of AVATARS.filter((x) => x.kind === 'vrm')) {
    portrait(cv, av.id, pose); const v = views.get(cv);
    for (let i = 0; i < 600 && v.state === 'loading'; i++) await new Promise((r) => setTimeout(r, 100));
    if (v.state !== 'ready') { log.textContent += av.id + ' 실패\n'; continue; }
    for (let i = 0; i < 20; i++) { v.render(pose); await new Promise((r) => setTimeout(r, 30)); }
    const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.86));
    const res = await fetch('/__thumb?name=' + av.id, { method: 'POST', body: blob });
    log.textContent += av.id + ' ' + res.status + ' ' + blob.size + '\n';
  }
  log.textContent += '끝';
}

/* ───────── 길 찾기 ───────── */
function route() {
  cleanup(); cleanup = () => {}; dropViews();
  const [, a = '', b] = location.hash.split('/');
  document.querySelectorAll('[data-nav]').forEach((n) => n.classList.toggle('on', n.dataset.nav === ({ '': 'city', rank: 'rank', me: 'me', join: 'me', onair: 'me' }[a] || 'city')));
  ({ '': cityView, rank: rankView, r: () => sheetView(b), live: () => liveView(b), join: joinView, me: meView, onair: onairView, thumbs: thumbsView }[a] || cityView)();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

// 방송 중인 주민의 수치가 조금씩 움직인다(시연용)
setInterval(() => {
  for (const r of RESIDENTS) if (r.live) { r.viewers = Math.max(200, Math.round(r.viewers * (0.985 + Math.random() * 0.03))); r.score.live += Math.round(r.viewers / 400); }
  const a = location.hash.split('/')[1] || '';
  if (a === 'rank') rankView();
}, 4000);

route();
