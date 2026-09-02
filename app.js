const app = document.querySelector('#app');
const categories = [
  ['상식', '일반상식'], ['한국사', '韓国史'], ['세계사·지리', '世界史・地理'], ['과학·수학', '科学・数学'],
  ['K-POP', 'K-POP全般'], ['연예·방송', '芸能・ドラマ'], ['게임', 'ゲーム'], ['스포츠', 'スポーツ']
];
let questions = [];
let seasonInfo = { seasonId: 'loading', eligibleCount: 0 };
let timer;
const state = { phase: 'home', questionIndex: 0, score: 0, lives: 3, answerSeconds: 7, selectedChars: [], charIndex: 0, rating: 1248 };
const clearTimer = () => { if (timer) { clearInterval(timer); timer = null; } };
const normalize = value => value.toLowerCase().replace(/\s+/g, '').trim();
const answerCharacters = question => Array.from(question.answers[0].normalize('NFKC').toUpperCase().replace(/[\s·.,!?！？'"“”‘’()（）\-_:：/]/g, ''));

async function loadActiveSeason() {
  const manifest = await fetch('data/seasons/manifest.json').then(response => {
    if (!response.ok) throw new Error('season manifest unavailable');
    return response.json();
  });
  const active = manifest.seasons.find(season => season.seasonId === manifest.activeSeasonId);
  if (!active) throw new Error('active season not found');
  const payload = await fetch(`data/seasons/${active.questionFile}`).then(response => {
    if (!response.ok) throw new Error('season question package unavailable');
    return response.json();
  });
  const seenFactGroups = new Set();
  const eligible = payload.questions.filter(question => question.enabledInSeason).filter(question => {
    if (!question.factGroupId || !seenFactGroups.has(question.factGroupId)) { seenFactGroups.add(question.factGroupId); return true; }
    return false;
  });
  questions = eligible.sort(() => Math.random() - 0.5).map(question => ({
    id: question.questionId,
    category: question.categoryKo,
    text: question.questionText,
    answers: [question.canonicalAnswer, ...(question.acceptedAliases || [])],
    explanation: question.explanation,
    difficulty: question.difficulty,
    factGroupId: question.factGroupId,
  }));
  seasonInfo = { seasonId: payload.seasonId, eligibleCount: payload.eligibleCount };
}

function home() {
  clearTimer(); state.phase = 'home';
  app.innerHTML = `<div class="page"><section class="hero"><div class="hero-copy"><div class="eyebrow">Think fast. Play fair.</div><h1>문제를 먼저 맞히는<br><span style="color:var(--cobalt)">1vs1 퀴즈 배틀</span></h1><p class="lede">지금 바로 상대를 찾아보세요.<br>짧고 강렬한 한 판이 시작됩니다.</p><span class="season-badge">${seasonInfo.seasonId} · ${seasonInfo.eligibleCount.toLocaleString()}문제</span></div><button class="quick-match" id="match"><span class="arrow">↗</span><strong>빠른 대전</strong><span>랜덤 매칭으로 바로 시작</span></button></section>
    <section class="dashboard"><div class="card stat-card"><div class="stat-label">현재 레이팅</div><div class="rating">1,248 <small>▲ 24</small></div><div class="rank-row"><span>최고 랭크 · 골드</span><span class="rank-badge">GOLD</span></div></div><div class="card"><div class="card-title">최근 전적 <a href="#">전체보기</a></div><div class="recent-list"><div class="recent-item"><span class="result win">W</span><span>김민준</span><span class="recent-meta">+16<br>2분 전</span></div><div class="recent-item"><span class="result loss">L</span><span>별빛토끼</span><span class="recent-meta">-12<br>어제</span></div><div class="recent-item"><span class="result win">W</span><span>QuizMaster</span><span class="recent-meta">+18<br>어제</span></div></div></div></section>
    <section class="card section"><div class="card-title">카테고리 <a href="#">준비 중인 모드</a></div><div class="category-grid">${categories.map(c => `<button class="category"><b>${c[0]}</b><span>${c[1]}</span></button>`).join('')}</div></section>
  </div>`;
  document.querySelector('#match').onclick = questions.length ? matching : () => { document.querySelector('#match span:last-child').textContent = '시즌 문제를 불러오지 못했습니다'; };
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
  const q = questions[state.questionIndex % questions.length]; state.phase = 'reading';
  app.innerHTML = `<div class="battle-page"><div class="battle-head"><button class="back" id="back">← 홈으로</button><span class="round">${seasonInfo.seasonId} · MATCH ${String(state.questionIndex + 1).padStart(2, '0')}</span></div><div class="players"><div class="player me"><div class="player-top"><span>나</span><span class="hearts">${'♥ '.repeat(state.lives).trim()}</span></div><div class="player-name">민수</div><span class="points">${state.score}</span> <small>점</small></div><span class="vs">VS</span><div class="player"><div class="player-top"><span>상대</span><span class="hearts">♥ ♥ ♥</span></div><div class="player-name">별빛토끼</div><span class="points">${Math.min(state.questionIndex, 4)}</span> <small>점</small></div></div><div class="question-card"><div class="question-label">${q.category} · ${q.difficulty.toUpperCase()} · QUESTION ${String(state.questionIndex + 1).padStart(2, '0')}</div><div class="question">${q.text}</div><div class="progress"><span id="progress-fill"></span></div><button class="buzz" id="buzz">빠르게 누르기</button><div class="status" id="status">문제가 보이면 아는 순간 눌러주세요</div><div class="answer-panel" id="answer"><div class="answer-guide">정답 문자를 순서대로 선택하세요 · <span id="answer-clock">7</span>초</div><div class="selected-chars" id="selected-chars">—</div><div class="candidate-options" id="candidate-options"></div></div></div></div>`;
  document.querySelector('#back').onclick = home;
  document.querySelector('#buzz').onclick = claimAnswer;
  setTimeout(() => { if (state.phase === 'reading') document.querySelector('#status').textContent = '문제 전체가 공개되었습니다 · 아무도 누르지 않아 다음 문제로 이동'; }, 1800);
}

function claimAnswer() {
  if (state.phase !== 'reading') return;
  state.phase = 'answering'; state.selectedChars = []; state.charIndex = 0; clearTimer(); const buzzButton = document.querySelector('#buzz'); buzzButton.classList.add('is-pressed'); setTimeout(() => { buzzButton.style.display = 'none'; document.querySelector('#answer').classList.add('active'); renderCandidates(); }, 120);
  document.querySelector('#status').textContent = '답변권을 얻었습니다 · 문자를 순서대로 선택하세요';
  let left = state.answerSeconds; timer = setInterval(() => { left -= 1; const clock = document.querySelector('#answer-clock'); if (clock) clock.textContent = left; if (left <= 0) { clearTimer(); judge(false); } }, 1000);
}

function renderCandidates() {
  const q = questions[state.questionIndex % questions.length]; const answer = answerCharacters(q);
  const candidateCount = state.rating >= 1600 ? 6 : state.rating >= 1400 ? 4 : 3;
  const koreanPool = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '하', '국', '도', '리', '수', '빛'];
  const latinPool = Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  const numberPool = Array.from('0123456789');
  const correct = answer[state.charIndex];
  const distractors = /[0-9]/.test(correct) ? numberPool : /[A-Z]/.test(correct) ? latinPool : koreanPool;
  const choices = [correct, ...distractors.filter(char => char !== correct && !answer.includes(char))].slice(0, candidateCount);
  choices.sort((a, b) => a.localeCompare(b, 'ko'));
  document.querySelector('#selected-chars').textContent = state.selectedChars.join(' ') || '—';
  document.querySelector('#candidate-options').innerHTML = choices.map(char => `<button class="candidate" data-char="${char}">${char}</button>`).join('');
  document.querySelectorAll('.candidate').forEach(button => { button.onclick = () => selectCharacter(button.dataset.char); });
}

function selectCharacter(char) {
  if (state.phase !== 'answering') return; const answer = answerCharacters(questions[state.questionIndex % questions.length]);
  if (char !== answer[state.charIndex]) { document.querySelector('#candidate-options').classList.add('wrong-pick'); setTimeout(() => judge(false), 260); return; }
  state.selectedChars.push(char); state.charIndex += 1;
  if (state.charIndex >= answer.length) judge(true); else renderCandidates();
}

function judge(correct) {
  if (state.phase !== 'answering') return; clearTimer(); const q = questions[state.questionIndex % questions.length]; state.phase = 'result'; if (correct) state.score += 1; else state.lives -= 1;
  const resultText = correct ? '정답입니다!' : state.selectedChars.length ? '오답입니다' : '시간이 끝났습니다';
  app.innerHTML = `<div class="battle-page centered"><div class="result-card"><div class="result-icon ${correct ? '' : 'wrong'}">${correct ? '✓' : '×'}</div><h2>${resultText}</h2><p>정답: <strong>${q.answers[0]}</strong></p><p class="explanation">${q.explanation}</p><div class="result-stats"><span>내 점수 <b>${state.score}</b></span><span>남은 라이프 <b>${'♥ '.repeat(Math.max(0, state.lives)).trim() || '0'}</b></span></div><button class="primary" id="next">${state.score >= 5 || state.lives <= 0 ? '결과 보기' : '다음 문제'}</button></div></div>`;
  document.querySelector('#next').onclick = () => { if (state.score >= 5 || state.lives <= 0) matchResult(); else { state.questionIndex += 1; countdown(); } };
}

function matchResult() {
  state.phase = 'match-result'; const won = state.score >= 5 || state.lives > 0;
  app.innerHTML = `<div class="battle-page centered"><div class="result-card final"><div class="result-icon">🏆</div><div class="eyebrow">MATCH COMPLETE</div><h2>${won ? '승리했습니다!' : '아쉽게 패배했습니다'}</h2><p>5문제 선취를 향한 첫 경기</p><div class="final-score"><b>${state.score}</b><span>—</span><b>${Math.min(state.questionIndex, 4)}</b></div><div class="rating-change">레이팅 <strong>${won ? '+18' : '-14'}</strong></div><button class="primary" id="rematch">다시 대전</button><button class="text-button" id="home">홈으로</button></div></div>`;
  document.querySelector('#rematch').onclick = () => { state.questionIndex = 0; state.score = 0; state.lives = 3; matching(); }; document.querySelector('#home').onclick = home;
}

async function bootstrap() {
  app.innerHTML = '<div class="battle-page centered"><div class="match-orb"><span>QB</span></div><p class="muted">시즌 문제를 불러오는 중...</p></div>';
  try { await loadActiveSeason(); } catch (error) { console.error(error); seasonInfo = { seasonId: '시즌 데이터 오류', eligibleCount: 0 }; }
  home();
}

bootstrap();
