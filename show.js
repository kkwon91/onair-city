// 대본 방송: 주민이 썰을 풀다가 채팅과 빛(후원)에 반응하고, 하던 이야기로 돌아온다.
// 대사 서버(api/chat)가 있으면 그 인물의 말투로 답을 받아 오고, 없으면 정해 둔 답으로 대신한다.
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SPEAK = new Set(['talk', 'talk2', 'laugh', 'giggle', 'surprise', 'serious', 'think', 'pout', 'shy', 'nod', 'shake', 'wink', 'thanks', 'sigh', 'aegyo']);
const CLIPS = ['idle', ...SPEAK];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// 대사 서버가 없을 때 쓰는 답. [정규식, 답 후보들]
const FALLBACK = [
  [/안녕|하이|ㅎㅇ|왔어|들어왔/, [[['어, 왔어요? 자리 있어요, 앉아요.', 'nod']], [['오셨어요. 오늘 하루는 좀 어땠어요?', 'talk']]]],
  [/예쁘|이쁘|귀엽|귀여|미인|존예/, [[['에이, 조명 덕이에요. 퇴근길엔 사람 아니었어요.', 'shy']], [['그런 말 하면 저 내일 출근 못 해요.', 'shy'], ['…한 번만 더 해 줘요.', 'aegyo']]]],
  [/회사|야근|퇴근|팀장|출근|월요일/, [[['하… 그 단어 금지예요, 지금은 퇴근했잖아요.', 'sigh']], [['회사 얘기는 썰로만 풀게요. 진짜로 하면 눈물 나요.', 'sigh']]]],
  [/밥|먹|치킨|야식|배고/, [[['저 오늘 편의점 도시락이요. 그것도 반값 스티커 붙은 거.', 'talk2']], [['야식 얘기 하지 마요, 방금 겨우 참았는데.', 'pout']]]],
  [/ㅋㅋ|ㅎㅎ|웃기|개웃/, [[['웃지 마요, 저는 진지했단 말이에요.', 'pout'], ['…아니 근데 좀 웃기긴 하죠?', 'giggle']], [['그쵸, 남 얘기면 저도 웃었을 거예요.', 'laugh']]]],
  [/힘내|화이팅|파이팅|응원|수고/, [[['고마워요. 그 말 듣자고 방송 켜는 것 같아요.', 'thanks']], [['덕분에 내일도 버텨 볼게요.', 'nod']]]],
  [/몇 ?살|나이|이름|본명|어디 살|주소|남친|애인/, [[['그건 전광판에도 안 올라가는 정보예요.', 'wink']], [['에이, 그런 건 비밀이죠. 다음 질문.', 'shake']]]],
  [/\?|뭐|어떻게|왜/, [[['음… 그건 내일의 제가 알아서 하겠죠.', 'think']], [['좋은 질문인데요, 일단 하던 얘기부터 끝낼게요.', 'think']]]],
];
const FALL_ANY = [[['채팅 읽었어요. 근데 진짜 들어 봐요, 아직 안 끝났어요.', 'talk']], [['오, 그 얘기 좋네요. 메모해 둘게요.', 'nod']], [['잠깐만요, 방금 뭐라고 했어요? 놓쳤다.', 'surprise']]];
const giftFallback = (who, n) => (n >= 100 ? [[`${who} 님 빛 ${n}개?! 오늘 야식은 치킨이다!`, 'surprise'], ['진짜 고마워요. 저 내일 출근해도 웃을 수 있어요.', 'thanks']]
  : n >= 50 ? [[`${who} 님 빛 ${n}개, 퇴근 축하 받았습니다.`, 'thanks'], ['이 맛에 방송 켜요.', 'giggle']]
    : [[`${who} 님, 빛 ${n}개 고마워요.`, 'thanks']]);
const BRIDGE = [['어디까지 했더라… 아 맞다.', 'think'], ['자, 다시 하던 얘기로 갈게요.', 'nod'], ['아무튼, 아까 그 얘기 이어서요.', 'talk']];
const FAKE = ['오늘도 야근?', 'ㅋㅋㅋㅋ', '팀장님 또 나왔다', '저도 방금 퇴근', '밥은 먹었어요?', '와 선명하다', '그래서 어떻게 됐어요', '공감 백배', '월요일 싫어', '다정님 힘내요', '아 그 맘 알지', '첫 방문입니다'];

export async function mountShow(view, r, opts = {}) {
  let dead = false; const timers = []; const urls = {};
  const base = r.show, nick = opts.nick || '나';
  view.innerHTML = `
    <div class="row" style="justify-content:space-between;margin-bottom:12px"><div><h1>${esc(r.name)}</h1><span class="small dim" id="seg">방송 준비 중</span></div>
      <span class="live">방송 중 <span class="num" id="vw">${(r.viewers || 300).toLocaleString('ko-KR')}</span></span></div>
    <div class="liveview"><div>
      <div class="stage show"><video id="va" muted playsinline poster="${r.img}"></video><video id="vb" muted playsinline></video>
        <div class="cap" id="cap">모습 불러오는 중</div>
        <div class="say" id="say" hidden><div class="quote" id="quote" hidden></div><p id="line"></p></div></div>
      <div class="row small dim" style="margin-top:8px;justify-content:space-between"><span id="clock">0:00 / 30:00</span><span id="brain"></span></div>
    </div>
    <div class="chat"><div class="h">채팅 · 치면 ${esc(r.name)}이 읽고 답합니다</div><div class="list" id="list"></div>
      <div class="f"><form id="form" class="row" style="flex-wrap:nowrap"><input type="text" id="msg" maxlength="80" placeholder="채팅 입력" autocomplete="off"><button class="btn go" style="flex:0 0 auto">보내기</button></form>
        <div class="row" style="margin-top:8px">${[10, 50, 100].map((n) => `<button class="btn" data-gift="${n}">빛 ${n}</button>`).join('')}</div></div></div></div>`;
  const $ = (s) => view.querySelector(s);
  const vids = [$('#va'), $('#vb')]; let cur = 0;
  const list = $('#list');
  const addChat = (who, msg, cls = '') => { const p = document.createElement('div'); if (cls) p.className = cls; p.innerHTML = `<b>${esc(who)}</b>${esc(msg)}`; list.append(p); while (list.children.length > 60) list.firstChild.remove(); list.scrollTop = list.scrollHeight; };

  // 동작 영상을 미리 다 받아 둔다(전부 합쳐 1MB 남짓)
  let script;
  try {
    const [s] = await Promise.all([fetch(`${base}/script.json`).then((x) => x.json()), ...CLIPS.map((c) => fetch(`${base}/${c}.mp4`).then((x) => x.blob()).then((b) => { urls[c] = URL.createObjectURL(b); }))]);
    script = s;
  } catch (e) { $('#cap').textContent = '방송 자료를 불러오지 못했습니다'; return () => {}; }
  if (dead) return () => {};
  $('#cap').hidden = true;

  let brain = false;
  fetch('api/health').then((x) => (x.ok ? x.json() : null)).then((j) => { brain = !!j?.ok; $('#brain').textContent = brain ? '대사 서버 연결됨' : '대사 서버 없음 · 정해 둔 답으로 반응'; }).catch(() => { $('#brain').textContent = '대사 서버 없음 · 정해 둔 답으로 반응'; });

  // 동작 바꾸기: 두 영상을 겹쳐 두고 다음 것을 틀면서 바꿔치기한다
  let clipNow = '';
  function play(name, loop) {
    if (!urls[name]) name = 'talk';
    if (clipNow === name && loop && vids[cur].loop) return;
    clipNow = name;
    const nx = vids[1 - cur], pv = vids[cur];
    nx.onended = null; nx.loop = !!loop; nx.src = urls[name];
    // 앞 영상은 밑에 그대로 두고 새 영상을 위에 겹쳐 올린다(둘 다 흐려지며 어두워지는 것을 막는다)
    nx.play().then(() => { nx.classList.remove('under'); nx.classList.add('on'); pv.classList.remove('on'); pv.classList.add('under'); cur = vids.indexOf(nx); }).catch(() => {});
    if (!loop) nx.onended = () => { if (!dead && clipNow === name) play(SPEAK.has(name) && speaking ? 'talk' : 'idle', true); };
  }
  let speaking = false;
  const say = $('#say'), lineEl = $('#line'), quote = $('#quote');
  async function speak(t, m, q) {
    speaking = true; quote.hidden = !q; if (q) quote.textContent = q;
    lineEl.textContent = t; say.hidden = false;
    play(m === 'idle' ? 'idle' : m, m === 'talk' || m === 'talk2' || m === 'idle');
    await wait(Math.min(7500, Math.max(2600, 1700 + t.length * 135)));
    speaking = false;
  }

  // 끼어들기 대기줄: 채팅 답, 후원 리액션
  const queue = []; const history = []; let segTitle = '', lastLine = '', inSeg = false;
  const session = Date.now().toString(36) + Math.random().toString(36).slice(2, 6), told = []; // 오늘 방송 기억: 이미 끝낸 썰 제목
  async function reply(kind, who, text, amount) {
    let lines = null;
    if (brain) {
      try {
        const res = await fetch('api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: r.id, kind, user: who, text, amount, context: `${segTitle} — ${lastLine}`, session, told }) });
        if (res.ok) lines = (await res.json()).lines?.map((l) => [l.t, l.m]);
      } catch (e) { /* 아래 정해 둔 답으로 */ }
    }
    if (!lines?.length) lines = kind === 'gift' ? giftFallback(who, amount) : pick((FALLBACK.find(([re]) => re.test(text)) || [0, FALL_ANY])[1]);
    history.push({ u: `${who}: ${text}`, a: lines.map((l) => l[0]).join(' ') }); if (history.length > 6) history.shift();
    queue.push({ q: kind === 'gift' ? `${who} 님이 빛 ${amount}개를 보냈습니다` : `${who}: ${text}`, lines });
  }

  // 시연용 가상 채팅. 가끔 하나를 골라 읽는다.
  const fake = () => { if (dead) return; const who = '관측자' + (100 + Math.floor(Math.random() * 900)), msg = pick(FAKE); addChat(who, msg); if (Math.random() < 0.12 && queue.length === 0) reply('chat', who, msg); timers.push(setTimeout(fake, 2600 + Math.random() * 4200)); };
  timers.push(setTimeout(fake, 3000));

  $('#form').onsubmit = (e) => { e.preventDefault(); const v = $('#msg').value.trim(); if (!v) return; $('#msg').value = ''; addChat(nick, v, 'mine'); reply('chat', nick, v); };
  view.querySelectorAll('[data-gift]').forEach((b) => b.onclick = () => { const n = +b.dataset.gift; addChat(nick, `빛 ${n}개를 보냈습니다`, 'mine'); r.score.live += n; reply('gift', nick, '', n); });

  // 시계와 관측자 수
  const t0 = Date.now(); let viewers = r.viewers || 300;
  const tick = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); $('#clock').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} / 30:00`; viewers = Math.max(50, viewers + Math.round(Math.random() * 14 - 6)); $('#vw').textContent = viewers.toLocaleString('ko-KR'); }, 1000);

  // 본 진행: 대본을 한 줄씩 말하다가, 대기줄에 뭔가 있으면 그것부터 처리하고 돌아온다
  (async () => {
    play('idle', true); await wait(900);
    for (;;) {
      for (const seg of script.segments) {
        segTitle = seg.title; inSeg = !seg.break; $('#seg').textContent = `${r.talent} · 지금 하는 얘기: ${seg.title}`;
        for (let i = 0; i < seg.lines.length; i++) {
          if (dead) return;
          if (queue.length) {
            while (queue.length) { const it = queue.shift(); for (const [t, m] of it.lines) { if (dead) return; await speak(t, m, it.q); } }
            if (inSeg && i > 0 && i < seg.lines.length - 1) { const [t, m] = pick(BRIDGE); await speak(t, m); }
          }
          const l = seg.lines[i]; lastLine = l.t;
          await speak(l.t, l.m);
          if (dead) return;
          if (i === seg.lines.length - 1 && !seg.break) told.push(seg.title);
          if (Math.random() < 0.18) { say.hidden = true; play('idle', true); await wait(700 + Math.random() * 900); }
        }
      }
    }
  })();

  return () => { dead = true; clearInterval(tick); timers.forEach(clearTimeout); vids.forEach((v) => { v.pause(); v.removeAttribute('src'); }); Object.values(urls).forEach((u) => URL.revokeObjectURL(u)); };
}
