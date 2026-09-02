const app = document.querySelector('#app');
const categories = [
  ['상식', '일반상식'], ['한국사', '韓国史'], ['세계사·지리', '世界史・地理'], ['과학·수학', '科学・数学'],
  ['K-POP', 'K-POP全般'], ['연예·방송', '芸能・ドラマ'], ['게임', 'ゲーム'], ['스포츠', 'スポーツ']
];
let questions = [];
let seasonInfo = { seasonId: 'loading', eligibleCount: 0 };
let timer;
let reconnectTimer;
const SESSION_KEY = 'quiz-battle.active-session.v1';
const TEST_LOCALE_KEY = 'quiz-battle.test-locale.v1';
const RECONNECT_GRACE_MS = 45000;
const QUESTION_CHAR_MS = 130;
const POST_REVEAL_WAIT_MS = 5000;
const RESULT_DISPLAY_MS = 3000;
const MAX_ROUNDS = 20;
const WIN_SCORE = 5;
// TEMP: 日本語UI確認用。テスト終了後にこの配列と切替ボタンを削除する。
const JAPANESE_TEST_QUESTIONS = [
  { id: 'ja-test-001', category: '一般常識', text: '日本の首都はどこですか？', answers: ['東京'], explanation: '日本の首都は東京です。', difficulty: 'easy' },
  { id: 'ja-test-002', category: '地理', text: '日本で最も高い山は何ですか？', answers: ['富士山'], explanation: '富士山の標高は3,776メートルです。', difficulty: 'easy' },
  { id: 'ja-test-003', category: '生活', text: '1年は通常、何か月ですか？', answers: ['12'], explanation: '通常の1年は12か月です。', difficulty: 'easy' },
];
const UI = {
  ko: {
    titleCopy: '문제를 먼저 알아채고 누르는<br>1vs1 실시간 퀴즈', online: '온라인 매칭', onlineSub: '랜덤 상대와 바로 대전', friend: '친구 매칭', friendSub: '초대 코드로 친구와 대전', ranking: '랭킹', rankingSub: '현재 레이팅 순위 확인',
    backTitle: '타이틀로', searching: '상대를 찾는 중...', searchingSub: '현재 대기열에서 가장 가까운 레이팅의<br>플레이어를 찾고 있습니다.', cancel: '취소', readyTitle: '대전 준비 완료', ready: '준비 완료', nextHint: '다음 문제를 준비하세요',
    leave: '← 나가기', me: '민수', opponent: '별빛토끼', answerGuide: '정답 문자를 순서대로 선택하세요', buzz: '버저 누르기', buzzSub: '먼저 누르면 답할 수 있어요!', revealStart: '문제가 한 글자씩 공개됩니다',
    answerRight: '답변권을 얻었습니다 · 문자를 순서대로 선택하세요', correct: '정답입니다!', wrong: '오답입니다', answerTimeout: '시간이 끝났습니다', bothTimeout: '양쪽 모두 시간 초과', answer: '정답',
    myScore: '내 점수', lives: '남은 라이프', showResult: '결과 보기', next: '다음 문제', matchResult: '경기 결과', settings: '설정', sound: '효과음', vibration: '진동', language: '언어',
    tied: '무효 경기입니다', won: '승리했습니다!', lost: '아쉽게 패배했습니다', ratingNoChange: '변동 없음', rematch: '다시 대전', home: '홈으로', rating: '레이팅',
  },
  ja: {
    titleCopy: '問題を先に見抜いて押す<br>1対1リアルタイムクイズ', online: 'オンラインマッチング', onlineSub: 'ランダムな相手とすぐ対戦', friend: 'フレンドマッチング', friendSub: '招待コードで友達と対戦', ranking: 'ランキング', rankingSub: '現在のレート順位を確認',
    backTitle: 'タイトルへ', searching: '対戦相手を探しています…', searchingSub: '近いレートのプレイヤーを<br>検索しています。', cancel: 'キャンセル', readyTitle: '対戦準備完了', ready: '準備OK', nextHint: '次の問題を準備してください',
    leave: '← 終了', me: 'あなた', opponent: 'テスト相手', answerGuide: '正解の文字を順番に選んでください', buzz: '早押し', buzzSub: '先に押すと回答できます！', revealStart: '問題が1文字ずつ表示されます',
    answerRight: '回答権を獲得しました · 文字を順番に選んでください', correct: '正解です！', wrong: '不正解です', answerTimeout: '回答時間終了', bothTimeout: '両者とも時間切れ', answer: '答え',
    myScore: '自分の得点', lives: '残りライフ', showResult: '結果を見る', next: '次の問題', matchResult: '試合結果', settings: '設定', sound: '効果音', vibration: '振動', language: '言語',
    tied: '無効試合です', won: '勝利しました！', lost: '敗北しました', ratingNoChange: '変動なし', rematch: 'もう一度', home: 'ホームへ', rating: 'レート',
  },
};
const ACTIVE_PHASES = new Set(['matching', 'ready', 'countdown', 'reading', 'answering', 'rebound', 'result']);
const state = {
  phase: 'home', questionIndex: 0, score: 0, opponentScore: 0, lives: 5, answerSeconds: 7,
  answerRemaining: 7, selectedChars: [], charIndex: 0, rating: 1248,
  matchId: null, phaseStartedAt: null, phaseDeadline: null, answerRightLost: false,
  lastResultCorrect: null, lastResultText: '', resultKind: null,
  locale: localStorage.getItem(TEST_LOCALE_KEY) === 'ja' ? 'ja' : 'ko'
};
const clearTimer = () => { if (timer) { clearInterval(timer); timer = null; } };
const clearReconnectTimer = () => { if (reconnectTimer) { clearInterval(reconnectTimer); reconnectTimer = null; } };
const normalize = value => value.toLowerCase().replace(/\s+/g, '').trim();
const answerCharacters = question => Array.from(question.answers[0].normalize('NFKC').toUpperCase().replace(/[\s·.,!?！？'"“”‘’()（）\-_:：/]/g, ''));
const settingsButton = document.querySelector('#settings');
const countdownSound = new Audio('assets/audio/countdown.mp3');
countdownSound.preload = 'auto';
countdownSound.volume = 0.8;
const countdownGoSound = new Audio('assets/audio/countdown-go.mp3');
countdownGoSound.preload = 'auto';
countdownGoSound.volume = 0.8;
const choiceSound = new Audio('assets/audio/choice.mp3');
choiceSound.preload = 'auto';
choiceSound.volume = 0.8;
const buttonSound = new Audio('assets/audio/button.mp3');
buttonSound.preload = 'auto';
buttonSound.volume = 0.8;
const wrongSound = new Audio('assets/audio/wrong.mp3');
wrongSound.preload = 'auto';
wrongSound.volume = 0.85;
const correctSound = new Audio('assets/audio/correct.mp3');
correctSound.preload = 'auto';
correctSound.volume = 0.85;
const ui = key => UI[state.locale]?.[key] || UI.ko[key] || key;
const isJapaneseTest = () => state.locale === 'ja';
const activeQuestions = () => isJapaneseTest() ? JAPANESE_TEST_QUESTIONS : questions;
const currentRoundLimit = () => isJapaneseTest() ? JAPANESE_TEST_QUESTIONS.length : MAX_ROUNDS;

function showSettingsButton(visible) {
  settingsButton.hidden = !visible;
}

function playCountdownSound() {
  countdownSound.currentTime = 0;
  countdownSound.play().catch(() => {});
}

function playCountdownGoSound() {
  countdownGoSound.currentTime = 0;
  countdownGoSound.play().catch(() => {});
}

function playChoiceSound() {
  choiceSound.currentTime = 0;
  choiceSound.play().catch(() => {});
}

function playButtonSound() {
  buttonSound.currentTime = 0;
  buttonSound.play().catch(() => {});
}

function playWrongSound() {
  wrongSound.currentTime = 0;
  wrongSound.play().catch(() => {});
}

function playCorrectSound() {
  correctSound.currentTime = 0;
  correctSound.play().catch(() => {});
}

function matchShouldEnd() {
  return state.score >= WIN_SCORE
    || state.opponentScore >= WIN_SCORE
    || state.lives <= 0
    || state.questionIndex + 1 >= currentRoundLimit();
}

function advanceAfterRound() {
  clearTimer();
  if (matchShouldEnd()) { matchResult(); return; }
  state.questionIndex += 1;
  battle();
}

function currentQuestion() {
  const source = activeQuestions();
  return source.length ? source[state.questionIndex % source.length] : null;
}

function readSavedSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}

function persistSession({ disconnected = false } = {}) {
  if (!ACTIVE_PHASES.has(state.phase) || !state.matchId) return;
  const previous = readSavedSession();
  const disconnectedAt = disconnected ? Date.now() : document.hidden ? (previous?.disconnectedAt || Date.now()) : null;
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    version: 1,
    updatedAt: Date.now(),
    disconnectedAt,
    activeQuestionId: currentQuestion()?.id || null,
    state: { ...state }
  }));
}

function clearSavedSession() {
  clearReconnectTimer();
  localStorage.removeItem(SESSION_KEY);
}

function hydrateSession(snapshot) {
  Object.assign(state, snapshot.state || {});
  if (!Number.isFinite(state.opponentScore)) state.opponentScore = 0;
  const source = activeQuestions();
  const savedQuestionIndex = source.findIndex(question => question.id === snapshot.activeQuestionId);
  const targetIndex = state.questionIndex % Math.max(source.length, 1);
  if (savedQuestionIndex >= 0 && savedQuestionIndex !== targetIndex) {
    [source[targetIndex], source[savedQuestionIndex]] = [source[savedQuestionIndex], source[targetIndex]];
  }
}

function reconnectAge(snapshot) {
  return Date.now() - (snapshot.disconnectedAt || snapshot.updatedAt || 0);
}

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

function showToast(message) {
  let toast = document.querySelector('.status-toast');
  if (!toast) { toast = document.createElement('div'); toast.className = 'status-toast'; document.body.appendChild(toast); }
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 1800);
}

function home() {
  clearTimer(); clearSavedSession(); state.phase = 'home'; state.matchId = null;
  document.documentElement.lang = state.locale;
  showSettingsButton(true);
  const sourceLabel = isJapaneseTest() ? `日本語テスト · ${JAPANESE_TEST_QUESTIONS.length}問` : `${seasonInfo.seasonId} · ${seasonInfo.eligibleCount.toLocaleString()}문제`;
  app.innerHTML = `<div class="title-screen centered"><div class="eyebrow">Think fast. Play fair.</div><h1>QUIZ<br><span>BATTLE</span></h1><p class="muted">${ui('titleCopy')}</p><div class="title-meta"><span>GOLD · 1,248</span><span>${sourceLabel}</span></div><button class="primary title-primary" id="online-match">${ui('online')}</button><button class="text-button title-secondary" id="friend-match">${ui('friend')}</button><button class="text-button title-secondary" id="ranking">${ui('ranking')}</button><button class="test-locale-button" id="test-locale">${isJapaneseTest() ? '한국어로 돌아가기' : '日本語 TEST'}</button></div>`;
  document.querySelector('#online-match').onclick = activeQuestions().length ? matching : () => showToast(isJapaneseTest() ? 'テスト問題を読み込めませんでした' : '시즌 문제를 불러오지 못했습니다');
  document.querySelector('#friend-match').onclick = friendMatch;
  document.querySelector('#ranking').onclick = ranking;
  document.querySelector('#test-locale').onclick = () => {
    state.locale = isJapaneseTest() ? 'ko' : 'ja';
    localStorage.setItem(TEST_LOCALE_KEY, state.locale);
    state.questionIndex = 0; state.score = 0; state.opponentScore = 0; state.lives = 5;
    home();
  };
}

function friendMatch() {
  showSettingsButton(false);
  app.innerHTML = `<div class="battle-page centered"><div class="result-card"><div class="eyebrow">FRIEND MATCH</div><h2>${ui('friend')}</h2><p class="muted">${isJapaneseTest() ? '招待コード機能は準備中です。' : '초대 코드를 만들거나 입력하는 기능을 준비하고 있습니다.'}</p><button class="primary" id="friend-back">${ui('backTitle')}</button></div></div>`;
  document.querySelector('#friend-back').onclick = home;
}

function ranking() {
  showSettingsButton(false);
  app.innerHTML = `<div class="battle-page centered"><div class="ranking-card"><div class="eyebrow">RANKING</div><h2>${isJapaneseTest() ? '現在のランキング' : '현재 랭킹'}</h2><ol class="ranking-list"><li><b>1</b><span>QuizMaster</span><strong>2,184</strong></li><li><b>2</b><span>${ui('opponent')}</span><strong>2,096</strong></li><li><b>3</b><span>${ui('me')}</span><strong>1,248</strong></li></ol><button class="primary" id="ranking-back">${ui('backTitle')}</button></div></div>`;
  document.querySelector('#ranking-back').onclick = home;
}

function settings() {
  clearTimer();
  showSettingsButton(false);
  app.innerHTML = `<div class="battle-page centered"><div class="settings-card"><div class="eyebrow">SETTINGS</div><h2>${ui('settings')}</h2><div class="settings-list"><button class="setting-row" aria-pressed="true"><span><strong>${ui('sound')}</strong><small>${isJapaneseTest() ? 'ボタンと正解の効果音' : '버튼과 정답 효과음'}</small></span><b>ON</b></button><button class="setting-row" aria-pressed="true"><span><strong>${ui('vibration')}</strong><small>${isJapaneseTest() ? '早押し時のフィードバック' : '빠른 누르기 피드백'}</small></span><b>ON</b></button><div class="setting-row static"><span><strong>${ui('language')}</strong><small>${isJapaneseTest() ? '一時テストモード' : '앱 표시 언어'}</small></span><b>${isJapaneseTest() ? '日本語 TEST' : '한국어'}</b></div></div><button class="primary" id="settings-back">${ui('backTitle')}</button></div></div>`;
  document.querySelectorAll('.setting-row[aria-pressed]').forEach(button => {
    button.onclick = () => {
      const enabled = button.getAttribute('aria-pressed') === 'true';
      button.setAttribute('aria-pressed', String(!enabled));
      button.querySelector('b').textContent = enabled ? 'OFF' : 'ON';
    };
  });
  document.querySelector('#settings-back').onclick = home;
}

function matching({ resume = false } = {}) {
  clearTimer();
  showSettingsButton(false);
  if (!resume) {
    state.questionIndex = 0; state.score = 0; state.opponentScore = 0; state.lives = 5;
    state.selectedChars = []; state.charIndex = 0; state.answerRemaining = state.answerSeconds;
    state.lastResultCorrect = null; state.lastResultText = ''; state.resultKind = null; state.answerRightLost = false;
    state.matchId = globalThis.crypto?.randomUUID?.() || `match-${Date.now()}`;
    state.phaseStartedAt = Date.now(); state.phaseDeadline = state.phaseStartedAt + 1300;
  }
  state.phase = 'matching'; persistSession();
  app.innerHTML = `<div class="battle-page centered"><div class="match-orb"><span>VS</span></div><div class="eyebrow">MATCHMAKING</div><h2>${ui('searching')}</h2><p class="muted">${ui('searchingSub')}</p><div class="searching-dots"><i></i><i></i><i></i></div><button class="cancel" id="cancel">${ui('cancel')}</button></div>`;
  document.querySelector('#cancel').onclick = home;
  const remaining = Math.max(0, (state.phaseDeadline || Date.now()) - Date.now());
  setTimeout(() => { if (state.phase === 'matching') battleReady(); }, remaining);
}

function battleReady() {
  showSettingsButton(false);
  state.phase = 'ready'; state.phaseStartedAt = Date.now(); state.phaseDeadline = null; persistSession();
  app.innerHTML = `<div class="battle-page centered"><div class="eyebrow">MATCH FOUND · ${isJapaneseTest() ? 'TEST' : 'RANKED'}</div><h2>${ui('readyTitle')}</h2><div class="ready-versus"><div><span class="ready-avatar mine">${isJapaneseTest() ? '自' : '민'}</span><b>${ui('me')}</b><small>1,248 · GOLD</small></div><strong>VS</strong><div><span class="ready-avatar">${isJapaneseTest() ? '相' : '별'}</span><b>${ui('opponent')}</b><small>1,232 · GOLD</small></div></div><button class="primary" id="ready">${ui('ready')}</button></div>`;
  document.querySelector('#ready').onclick = countdown;
}

function countdown({ resume = false } = {}) {
  clearTimer(); showSettingsButton(false); state.phase = 'countdown';
  if (!resume || !state.phaseDeadline) { state.phaseStartedAt = Date.now(); state.phaseDeadline = state.phaseStartedAt + 2550; }
  persistSession();
  app.innerHTML = `<div class="battle-page centered countdown-page"><div class="eyebrow">GET READY</div><div class="count-number" id="count">3</div><p class="muted">${ui('nextHint')}</p></div>`;
  let lastCount = null;
  const tick = () => {
    const remaining = (state.phaseDeadline || 0) - Date.now();
    const el = document.querySelector('#count');
    const countValue = remaining <= 450 ? 'GO' : String(Math.max(1, Math.ceil((remaining - 450) / 700)));
    if (el) el.textContent = countValue;
    if (countValue !== lastCount && ['3', '2', '1'].includes(countValue)) playCountdownSound();
    if (countValue !== lastCount && countValue === 'GO') playCountdownGoSound();
    lastCount = countValue;
    if (remaining <= 0) { clearTimer(); battle(); }
  };
  tick(); timer = setInterval(tick, 100);
}

function battle({ resume = false } = {}) {
  clearTimer(); showSettingsButton(false);
  const q = currentQuestion();
  const questionChars = Array.from(q.text);
  const revealDuration = questionChars.length * QUESTION_CHAR_MS;
  const roundDuration = revealDuration + POST_REVEAL_WAIT_MS;
  if (!resume) {
    state.phase = 'reading'; state.phaseStartedAt = Date.now();
    state.phaseDeadline = state.phaseStartedAt + roundDuration; state.answerRightLost = false;
    state.selectedChars = []; state.charIndex = 0; state.answerRemaining = state.answerSeconds; state.resultKind = null;
  } else if (!state.phaseStartedAt) {
    state.phaseStartedAt = (state.phaseDeadline || Date.now()) - roundDuration;
  }
  const locked = state.phase === 'rebound' || state.answerRightLost;
  const roundLimit = currentRoundLimit();
  const seasonLabel = isJapaneseTest() ? '日本語 TEST · 3問' : seasonInfo.seasonId;
  app.innerHTML = `<div class="battle-page battle-arena">
    <div class="battle-head"><button class="back" id="back">${ui('leave')}</button><span class="round">${seasonLabel}</span></div>
    <section class="scoreboard" aria-label="score">
      <article class="combatant me"><div class="combat-avatar">${isJapaneseTest() ? '自' : '민'}</div><div class="combat-copy"><strong>${ui('me')}</strong><small>★ ${state.rating.toLocaleString()}</small><span class="combat-life">♥ ${state.lives}</span></div><b class="combat-score">${state.score}</b></article>
      <div class="round-hub"><div><strong>${state.questionIndex + 1}</strong><span>/ ${roundLimit}</span></div><small>ROUND</small><i></i></div>
      <article class="combatant opponent"><b class="combat-score">${state.opponentScore}</b><div class="combat-copy"><strong>${ui('opponent')}</strong><small>★ 1,232</small><span class="combat-life">♥ 5</span></div><div class="combat-avatar">${isJapaneseTest() ? '相' : '별'}</div></article>
    </section>
    <div class="question-timer-row"><span class="timer-icon">◷</span><b id="question-clock">00:00</b><div class="question-progress"><span id="progress-fill"></span></div></div>
    <section class="question-card live-question-card">
      <div class="question-meta"><span class="q-badge">Q.</span><span class="category-pill">${q.category}</span><span class="difficulty-pill">${q.difficulty.toUpperCase()}</span><span class="round-caption">${state.questionIndex + 1} / ${roundLimit}</span></div>
      <div class="question" id="question-text">${locked ? q.text : ''}</div>
      <div class="answer-panel" id="answer"><div class="answer-guide">${ui('answerGuide')} · <span id="answer-clock">7</span>${isJapaneseTest() ? '秒' : '초'}</div><div class="selected-chars" id="selected-chars">—</div><div class="candidate-options" id="candidate-options"></div></div>
    </section>
    <div class="buzzer-zone" id="buzzer-zone"><button class="buzz" id="buzz"><span>⚡</span><strong>${ui('buzz')}</strong><small>${ui('buzzSub')}</small></button></div>
    <div class="status" id="status">${ui('revealStart')}</div>
  </div>`;
  document.querySelector('#back').onclick = home;
  const buzzButton = document.querySelector('#buzz');
  if (locked) {
    document.querySelector('#buzzer-zone').style.display = 'none';
    document.querySelector('#status').textContent = isJapaneseTest() ? '接続が切れたため、この問題の回答権を失いました' : '연결이 끊겨 이 문제의 답변권을 잃었습니다 · 상대 진행을 기다리는 중';
  } else {
    buzzButton.onclick = claimAnswer;
  }
  persistSession();
  const tick = () => {
    const now = Date.now();
    const remaining = Math.max(0, (state.phaseDeadline || 0) - now);
    const fill = document.querySelector('#progress-fill');
    const status = document.querySelector('#status');
    const clock = document.querySelector('#question-clock');
    const seconds = Math.max(0, Math.ceil(remaining / 1000));
    if (clock) clock.textContent = `00:${String(seconds).padStart(2, '0')}`;
    if (locked) {
      const lockedDuration = Math.max(1, (state.phaseDeadline || now) - (state.phaseStartedAt || now));
      if (fill) fill.style.width = `${Math.min(100, remaining / lockedDuration * 100)}%`;
    } else {
      const elapsed = Math.max(0, now - state.phaseStartedAt);
      const revealCount = Math.min(questionChars.length, Math.floor(elapsed / QUESTION_CHAR_MS));
      const questionText = document.querySelector('#question-text');
      if (questionText) questionText.textContent = questionChars.slice(0, revealCount).join('');
      if (fill) fill.style.width = `${Math.min(100, remaining / roundDuration * 100)}%`;
      if (status) status.textContent = revealCount < questionChars.length
        ? `${isJapaneseTest() ? '問題表示中' : '문제 공개 중'} · ${revealCount}/${questionChars.length}`
        : `${isJapaneseTest() ? '全文表示済み' : '문제 전체가 공개되었습니다'} · ${Math.max(0, Math.ceil(remaining / 1000))}${isJapaneseTest() ? '秒' : '초'} ${isJapaneseTest() ? '回答受付' : '후 다음 문제'}`;
    }
    if (remaining <= 0) showTimedOutAnswer();
  };
  tick(); timer = setInterval(tick, 40);
}

function claimAnswer() {
  if (state.phase !== 'reading') return;
  state.phase = 'answering'; state.selectedChars = []; state.charIndex = 0; state.answerRemaining = state.answerSeconds;
  state.phaseStartedAt = Date.now(); state.phaseDeadline = state.phaseStartedAt + state.answerSeconds * 1000; state.answerRightLost = false; clearTimer(); persistSession();
  const buzzButton = document.querySelector('#buzz'); buzzButton.classList.add('is-pressed'); setTimeout(() => { document.querySelector('#buzzer-zone').style.display = 'none'; document.querySelector('#answer').classList.add('active'); renderCandidates(); }, 120);
  document.querySelector('#status').textContent = ui('answerRight');
  timer = setInterval(() => {
    state.answerRemaining = Math.max(0, Math.ceil(((state.phaseDeadline || 0) - Date.now()) / 1000));
    const clock = document.querySelector('#answer-clock'); if (clock) clock.textContent = state.answerRemaining;
    persistSession();
    if (state.answerRemaining <= 0) { clearTimer(); judge(false); }
  }, 200);
}

function renderCandidates() {
  const q = currentQuestion(); const answer = answerCharacters(q);
  const candidateCount = state.rating >= 1600 ? 6 : state.rating >= 1400 ? 4 : 3;
  const koreanPool = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '하', '국', '도', '리', '수', '빛'];
  const japanesePool = ['東', '京', '富', '士', '山', '日', '本', '大', '阪', '川', '海', '白', '赤', '青', '都'];
  const latinPool = Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  const numberPool = Array.from('0123456789');
  const correct = answer[state.charIndex];
  const distractors = /[0-9]/.test(correct) ? numberPool : /[A-Z]/.test(correct) ? latinPool : isJapaneseTest() ? japanesePool : koreanPool;
  const choices = [correct, ...distractors.filter(char => char !== correct && !answer.includes(char))].slice(0, candidateCount);
  choices.sort((a, b) => a.localeCompare(b, state.locale));
  document.querySelector('#selected-chars').textContent = state.selectedChars.join(' ') || '—';
  document.querySelector('#candidate-options').innerHTML = choices.map(char => `<button class="candidate" data-char="${char}">${char}</button>`).join('');
  document.querySelectorAll('.candidate').forEach(button => { button.onclick = () => selectCharacter(button.dataset.char); });
}

function selectCharacter(char) {
  if (state.phase !== 'answering') return; const answer = answerCharacters(currentQuestion());
  if (char !== answer[state.charIndex]) { playWrongSound(); document.querySelector('#candidate-options').classList.add('wrong-pick'); setTimeout(() => judge(false), 260); return; }
  playChoiceSound();
  state.selectedChars.push(char); state.charIndex += 1; persistSession();
  if (state.charIndex >= answer.length) judge(true); else renderCandidates();
}

function judge(correct) {
  if (state.phase !== 'answering') return; clearTimer(); state.phase = 'result'; state.phaseStartedAt = Date.now(); state.phaseDeadline = state.phaseStartedAt + RESULT_DISPLAY_MS;
  if (correct) playCorrectSound();
  if (correct) state.score += 1; else state.lives -= 1;
  state.resultKind = 'answer';
  state.lastResultCorrect = correct;
  state.lastResultText = correct ? ui('correct') : state.selectedChars.length ? ui('wrong') : ui('answerTimeout');
  persistSession(); renderQuestionResult();
}

function showTimedOutAnswer() {
  if (state.phase !== 'reading' && state.phase !== 'rebound') return;
  clearTimer(); state.phase = 'result'; state.resultKind = 'both-timeout';
  state.phaseStartedAt = Date.now(); state.phaseDeadline = state.phaseStartedAt + RESULT_DISPLAY_MS;
  state.lastResultCorrect = null; state.lastResultText = ui('bothTimeout');
  persistSession(); renderTimedOutAnswer();
}

function renderTimedOutAnswer() {
  const q = currentQuestion();
  const seconds = Math.ceil(RESULT_DISPLAY_MS / 1000);
  app.innerHTML = `<div class="battle-page centered timeout-answer-page"><div class="timeout-answer-card"><div class="eyebrow">ROUND ${state.questionIndex + 1} / ${currentRoundLimit()}</div><p>${ui('bothTimeout')}</p><div class="timeout-answer"><span>${ui('answer')}</span><strong>${q.answers[0]}</strong></div><small><b id="timeout-clock">${seconds}</b>${isJapaneseTest() ? '秒後に' : '초 후'} ${matchShouldEnd() ? ui('matchResult') : ui('next')}</small></div></div>`;
  const tick = () => {
    if (state.phase !== 'result' || state.resultKind !== 'both-timeout') { clearTimer(); return; }
    const remaining = Math.max(0, (state.phaseDeadline || 0) - Date.now());
    const clock = document.querySelector('#timeout-clock');
    if (clock) clock.textContent = Math.max(0, Math.ceil(remaining / 1000));
    if (remaining <= 0) advanceAfterRound();
  };
  tick(); timer = setInterval(tick, 100);
}

function renderQuestionResult() {
  const q = currentQuestion(); const correct = state.lastResultCorrect; const resultText = state.lastResultText;
  app.innerHTML = `<div class="battle-page centered"><div class="result-card"><div class="result-icon ${correct ? '' : 'wrong'}">${correct ? '✓' : '×'}</div><div class="eyebrow">ROUND ${state.questionIndex + 1} / ${currentRoundLimit()}</div><h2>${resultText}</h2><p>${ui('answer')}: <strong>${q.answers[0]}</strong></p><p class="explanation">${q.explanation}</p><div class="result-stats"><span>${ui('myScore')} <b>${state.score}</b></span><span>${ui('lives')} <b>${'♥ '.repeat(Math.max(0, state.lives)).trim() || '0'}</b></span></div><p class="result-auto-next"><b id="result-clock">${Math.ceil(RESULT_DISPLAY_MS / 1000)}</b>${isJapaneseTest() ? '秒後に' : '초 후'} ${matchShouldEnd() ? ui('matchResult') : ui('next')}</p></div></div>`;
  const tick = () => {
    if (state.phase !== 'result' || state.resultKind !== 'answer') { clearTimer(); return; }
    const remaining = Math.max(0, (state.phaseDeadline || 0) - Date.now());
    const clock = document.querySelector('#result-clock');
    if (clock) clock.textContent = Math.max(0, Math.ceil(remaining / 1000));
    if (remaining <= 0) advanceAfterRound();
  };
  tick(); timer = setInterval(tick, 100);
}

function showReconnect(snapshot) {
  clearTimer(); clearReconnectTimer();
  const remaining = Math.max(0, Math.ceil((RECONNECT_GRACE_MS - reconnectAge(snapshot)) / 1000));
  app.innerHTML = `<div class="battle-page centered"><div class="connection-card"><div class="connection-pulse">↻</div><div class="eyebrow">RECONNECTING</div><h2>대전으로 복귀하는 중</h2><p class="muted">경기 시간은 계속 진행됩니다.<br>답변 중 끊겼다면 해당 문제의 답변권은 사라집니다.</p><div class="connection-meta"><span>복귀 유예</span><strong id="reconnect-left">${remaining}초</strong></div></div></div>`;
  setTimeout(() => resumeSavedMatch(snapshot), 550);
}

function resumeSavedMatch(snapshot) {
  if (!snapshot || reconnectAge(snapshot) > RECONNECT_GRACE_MS) { showReconnectExpired(); return; }
  hydrateSession(snapshot);
  const now = Date.now();
  const deadlinePassed = state.phaseDeadline && state.phaseDeadline <= now;
  if (state.phase === 'answering') {
    state.answerRightLost = true; state.phase = 'rebound';
    if (deadlinePassed) { showTimedOutAnswer(); return; }
    battle({ resume: true }); return;
  }
  if (state.phase === 'rebound') {
    if (deadlinePassed) { showTimedOutAnswer(); return; }
    battle({ resume: true }); return;
  }
  if (state.phase === 'reading') {
    if (deadlinePassed) { showTimedOutAnswer(); return; }
    battle({ resume: true }); return;
  }
  if (state.phase === 'countdown') {
    if (deadlinePassed) battle(); else countdown({ resume: true });
    return;
  }
  if (state.phase === 'matching') {
    if (deadlinePassed) battleReady(); else matching({ resume: true });
    return;
  }
  if (state.phase === 'ready') { battleReady(); return; }
  if (state.phase === 'result') {
    if (deadlinePassed) { advanceAfterRound(); }
    else { persistSession(); state.resultKind === 'both-timeout' ? renderTimedOutAnswer() : renderQuestionResult(); }
    return;
  }
  home();
}

function showDisconnected() {
  clearTimer(); clearReconnectTimer(); persistSession({ disconnected: true });
  const snapshot = readSavedSession();
  app.innerHTML = `<div class="battle-page centered"><div class="connection-card"><div class="connection-pulse offline">!</div><div class="eyebrow">CONNECTION LOST</div><h2>연결이 끊겼습니다</h2><p class="muted">경기는 멈추지 않습니다.<br>45초 안에 연결되면 현재 진행 위치로 돌아갑니다.</p><div class="connection-meta"><span>남은 복귀 시간</span><strong id="reconnect-left">45초</strong></div><button class="primary" id="retry-connection">다시 연결</button></div></div>`;
  document.querySelector('#retry-connection').onclick = attemptReconnect;
  reconnectTimer = setInterval(() => {
    const left = Math.max(0, Math.ceil((RECONNECT_GRACE_MS - reconnectAge(snapshot)) / 1000));
    const label = document.querySelector('#reconnect-left'); if (label) label.textContent = `${left}초`;
    if (left <= 0) showReconnectExpired();
  }, 250);
}

function attemptReconnect() {
  const snapshot = readSavedSession();
  if (!snapshot || reconnectAge(snapshot) > RECONNECT_GRACE_MS) { showReconnectExpired(); return; }
  if (!navigator.onLine) return;
  showReconnect(snapshot);
}

function showReconnectExpired() {
  clearTimer(); clearSavedSession(); state.phase = 'match-result'; state.matchId = null;
  app.innerHTML = `<div class="battle-page centered"><div class="result-card"><div class="result-icon wrong">×</div><div class="eyebrow">DISCONNECTED</div><h2>복귀 시간이 끝났습니다</h2><p class="muted">45초 안에 재접속하지 못해 이번 경기는 패배 처리되었습니다.</p><button class="primary" id="expired-home">홈으로</button></div></div>`;
  document.querySelector('#expired-home').onclick = home;
}

function matchResult() {
  clearSavedSession(); showSettingsButton(false); state.phase = 'match-result'; state.phaseStartedAt = Date.now(); state.phaseDeadline = null;
  const roundLimit = currentRoundLimit();
  const tied = state.questionIndex + 1 >= roundLimit && state.score === state.opponentScore && state.lives > 0;
  const won = !tied && (state.score >= WIN_SCORE || (state.lives > 0 && state.score > state.opponentScore));
  const title = tied ? ui('tied') : won ? ui('won') : ui('lost');
  const icon = tied ? '—' : won ? '🏆' : '×';
  const rating = tied ? ui('ratingNoChange') : won ? '+18' : '-14';
  const ruleCopy = isJapaneseTest() ? `日本語テスト · 全${roundLimit}問` : `최대 ${roundLimit}라운드 · ${WIN_SCORE}문제 선취`;
  app.innerHTML = `<div class="battle-page centered"><div class="result-card final"><div class="result-icon ${won || tied ? '' : 'wrong'}">${icon}</div><div class="eyebrow">MATCH COMPLETE · ${Math.min(state.questionIndex + 1, roundLimit)} ROUNDS</div><h2>${title}</h2><p>${ruleCopy}</p><div class="final-score"><b>${state.score}</b><span>—</span><b>${state.opponentScore}</b></div><div class="rating-change">${ui('rating')} <strong>${rating}</strong></div><button class="primary" id="rematch">${ui('rematch')}</button><button class="text-button" id="home">${ui('home')}</button></div></div>`;
  document.querySelector('#rematch').onclick = () => { state.questionIndex = 0; state.score = 0; state.opponentScore = 0; state.lives = 5; matching(); }; document.querySelector('#home').onclick = home;
}

async function bootstrap() {
  document.documentElement.lang = state.locale;
  app.innerHTML = `<div class="battle-page centered"><div class="match-orb"><span>QB</span></div><p class="muted">${isJapaneseTest() ? 'テスト問題を準備しています…' : '시즌 문제를 불러오는 중...'}</p></div>`;
  try { await loadActiveSeason(); } catch (error) { console.error(error); seasonInfo = { seasonId: '시즌 데이터 오류', eligibleCount: 0 }; }
  const snapshot = readSavedSession();
  if (snapshot?.state?.matchId && ACTIVE_PHASES.has(snapshot.state.phase)) {
    hydrateSession(snapshot);
    if (reconnectAge(snapshot) <= RECONNECT_GRACE_MS) showReconnect(snapshot); else showReconnectExpired();
  } else home();
}

window.addEventListener('offline', () => { if (ACTIVE_PHASES.has(state.phase)) showDisconnected(); });
window.addEventListener('online', () => { if (readSavedSession()?.disconnectedAt) attemptReconnect(); });
window.addEventListener('pagehide', () => persistSession({ disconnected: true }));
document.addEventListener('visibilitychange', () => {
  if (!ACTIVE_PHASES.has(state.phase)) return;
  if (document.hidden) { clearTimer(); persistSession({ disconnected: true }); }
  else if (readSavedSession()?.disconnectedAt) attemptReconnect();
});
document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (button && !button.classList.contains('candidate')) playButtonSound();
});
document.querySelector('#settings').onclick = settings;

bootstrap();
