const app = document.querySelector('#app');
const categories = [
  ['상식', '일반상식'], ['한국사', '韓国史'], ['세계사·지리', '世界史・地理'], ['과학·수학', '科学・数学'],
  ['K-POP', 'K-POP全般'], ['연예·방송', '芸能・ドラマ'], ['게임', 'ゲーム'], ['스포츠', 'スポーツ']
];
const questions = [
  { category: '상식', text: '대한민국의 수도는 어디일까요?', answers: ['서울', 'ソウル'] },
  { category: '한국사', text: '훈민정음을 창제한 조선의 왕은 누구일까요?', answers: ['세종대왕', '세종'] },
  { category: '세계사·지리', text: '지구에서 가장 큰 대륙은 어디일까요?', answers: ['아시아', 'アジア'] },
  { category: '과학·수학', text: '물의 화학식은 무엇일까요?', answers: ['h2o'] },
  { category: '스포츠', text: '축구 경기에서 한 팀의 기본 출전 선수는 몇 명일까요?', answers: ['11', '열한', '열한명'] }
];
let timer;
const state = { phase: 'home', questionIndex: 0, score: 0, lives: 3, answerSeconds: 7 };
const clearTimer = () => { if (timer) { clearInterval(timer); timer = null; } };
const normalize = value => value.toLowerCase().replace(/\s+/g, '').trim();

function home() {
  clearTimer(); state.phase = 'home';
  app.innerHTML = `<div class="page"><section class="hero"><div class="hero-copy"><div class="eyebrow">Think fast. Play fair.</div><h1>문제를 먼저 맞히는<br><span style="color:var(--cobalt)">1vs1 퀴즈 배틀</span></h1><p class="lede">지금 바로 상대를 찾아보세요.<br>짧고 강렬한 한 판이 시작됩니다.</p></div><button class="quick-match" id="match"><span class="arrow">↗</span><strong>빠른 대전</strong><span>랜덤 매칭으로 바로 시작</span></button></section>
    <section class="dashboard"><div class="card stat-card"><div class="stat-label">현재 레이팅</div><div class="rating">1,248 <small>▲ 24</small></div><div class="rank-row"><span>최고 랭크 · 골드</span><span class="rank-badge">GOLD</span></div></div><div class="card"><div class="card-title">최근 전적 <a href="#">전체보기</a></div><div class="recent-list"><div class="recent-item"><span class="result win">W</span><span>김민준</span><span class="recent-meta">+16<br>2분 전</span></div><div class="recent-item"><span class="result loss">L</span><span>별빛토끼</span><span class="recent-meta">-12<br>어제</span></div><div class="recent-item"><span class="result win">W</span><span>QuizMaster</span><span class="recent-meta">+18<br>어제</span></div></div></div></section>
    <section class="card section"><div class="card-title">카테고리 <a href="#">준비 중인 모드</a></div><div class="category-grid">${categories.map(c => `<button class="category"><b>${c[0]}</b><span>${c[1]}</span></button>`).join('')}</div></section>
  </div>`;
  document.querySelector('#match').onclick = matching;
}

function matching() {
  clearTimer(); state.phase = 'matching';
  app.innerHTML = `<div class="battle-page centered"><div class="match-orb"><span>VS</span></div><div class="eyebrow">MATCHMAKING</div><h2>상대를 찾는 중...</h2><p class="muted">현재 대기열에서 가장 가까운 레이팅의<br>플레이어를 찾고 있습니다.</p><div class="searching-dots"><i></i><i></i><i></i></div><button class="cancel" id="cancel">취소</button></div>`;
  document.querySelector('#cancel').onclick = home;
  setTimeout(() => { if (state.phase === 'matching') battleReady(); }, 1300);
}

function battleReady() {
  state.phase = 'ready';
  app.innerHTML = `<div class="battle-page centered"><div class="eyebrow">MATCH FOUND · RANKED</div><h2>대전 준비 완료</h2><div class="ready-versus"><div><span class="ready-avatar mine">민</span><b>민수</b><small>1,248 · GOLD</small></div><strong>VS</strong><div><span class="ready-avatar">별</span><b>별빛토끼</b><small>1,232 · GOLD</small></div></div><button class="primary" id="ready">준비 완료</button></div>`;
  document.querySelector('#ready').onclick = countdown;
}

function countdown() {
  state.phase = 'countdown'; let n = 3;
  app.innerHTML = `<div class="battle-page centered countdown-page"><div class="eyebrow">GET READY</div><div class="count-number" id="count">${n}</div><p class="muted">첫 문제를 준비하세요</p></div>`;
  timer = setInterval(() => { n -= 1; const el = document.querySelector('#count'); if (el) el.textContent = n > 0 ? n : 'GO'; if (n <= 0) { clearTimer(); setTimeout(battle, 450); } }, 700);
}

function battle() {
  const q = questions[state.questionIndex]; state.phase = 'reading';
  app.innerHTML = `<div class="battle-page"><div class="battle-head"><button class="back" id="back">← 홈으로</button><span class="round">RANKED MATCH · ${String(state.questionIndex + 1).padStart(2, '0')}</span></div><div class="players"><div class="player me"><div class="player-top"><span>나</span><span class="hearts">${'♥ '.repeat(state.lives).trim()}</span></div><div class="player-name">민수</div><span class="points">${state.score}</span> <small>점</small></div><span class="vs">VS</span><div class="player"><div class="player-top"><span>상대</span><span class="hearts">♥ ♥ ♥</span></div><div class="player-name">별빛토끼</div><span class="points">${Math.min(state.questionIndex, 4)}</span> <small>점</small></div></div><div class="question-card"><div class="question-label">${q.category} · QUESTION ${String(state.questionIndex + 1).padStart(2, '0')}</div><div class="question">${q.text}</div><div class="progress"><span id="progress-fill"></span></div><button class="buzz" id="buzz">빠르게 누르기</button><div class="status" id="status">문제가 보이면 아는 순간 눌러주세요</div><div class="answer-panel" id="answer"><input id="answer-input" placeholder="정답을 입력하세요" autocomplete="off"><button id="submit">정답 제출 <span id="answer-clock">7</span>초</button></div></div></div>`;
  document.querySelector('#back').onclick = home;
  document.querySelector('#buzz').onclick = claimAnswer;
  setTimeout(() => { if (state.phase === 'reading') document.querySelector('#status').textContent = '문제 전체가 공개되었습니다 · 아무도 누르지 않아 다음 문제로 이동'; }, 1800);
}

function claimAnswer() {
  if (state.phase !== 'reading') return;
  state.phase = 'answering'; clearTimer(); const buzzButton = document.querySelector('#buzz'); buzzButton.classList.add('is-pressed'); setTimeout(() => { buzzButton.style.display = 'none'; document.querySelector('#answer').classList.add('active'); }, 120);
  document.querySelector('#status').textContent = '回答権を獲得しました · 7秒以内に入力';
  const input = document.querySelector('#answer-input'); input.focus(); let left = state.answerSeconds;
  timer = setInterval(() => { left -= 1; const clock = document.querySelector('#answer-clock'); if (clock) clock.textContent = left; if (left <= 0) { clearTimer(); judge(''); } }, 1000);
  document.querySelector('#submit').onclick = () => judge(input.value);
  input.onkeydown = event => { if (event.key === 'Enter') judge(input.value); };
}

function judge(value) {
  if (state.phase !== 'answering') return; clearTimer(); const q = questions[state.questionIndex];
  const correct = q.answers.map(normalize).includes(normalize(value)); state.phase = 'result'; if (correct) state.score += 1; else state.lives -= 1;
  const resultText = correct ? '정답입니다!' : value ? '오답입니다' : '시간이 끝났습니다';
  app.innerHTML = `<div class="battle-page centered"><div class="result-card"><div class="result-icon ${correct ? '' : 'wrong'}">${correct ? '✓' : '×'}</div><h2>${resultText}</h2><p>정답: <strong>${q.answers[0]}</strong></p><p class="explanation">빠르게 판단하고 정확하게 입력하는 것이 핵심입니다.</p><div class="result-stats"><span>내 점수 <b>${state.score}</b></span><span>남은 라이프 <b>${'♥ '.repeat(Math.max(0, state.lives)).trim() || '0'}</b></span></div><button class="primary" id="next">${state.score >= 5 || state.lives <= 0 ? '결과 보기' : '다음 문제'}</button></div></div>`;
  document.querySelector('#next').onclick = () => { if (state.score >= 5 || state.lives <= 0) matchResult(); else { state.questionIndex += 1; countdown(); } };
}

function matchResult() {
  state.phase = 'match-result'; const won = state.score >= 5 || state.lives > 0;
  app.innerHTML = `<div class="battle-page centered"><div class="result-card final"><div class="result-icon">🏆</div><div class="eyebrow">MATCH COMPLETE</div><h2>${won ? '승리했습니다!' : '아쉽게 패배했습니다'}</h2><p>5문제 선취를 향한 첫 경기</p><div class="final-score"><b>${state.score}</b><span>—</span><b>${Math.min(state.questionIndex, 4)}</b></div><div class="rating-change">레이팅 <strong>${won ? '+18' : '-14'}</strong></div><button class="primary" id="rematch">다시 대전</button><button class="text-button" id="home">홈으로</button></div></div>`;
  document.querySelector('#rematch').onclick = () => { state.questionIndex = 0; state.score = 0; state.lives = 3; matching(); }; document.querySelector('#home').onclick = home;
}

home();
