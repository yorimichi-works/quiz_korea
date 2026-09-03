const app = document.querySelector('#app');
const categories = [
  ['상식', '일반상식'], ['한국사', '韓国史'], ['세계사·지리', '世界史・地理'], ['과학·수학', '科学・数学'],
  ['K-POP', 'K-POP全般'], ['연예·방송', '芸能・ドラマ'], ['게임', 'ゲーム'], ['스포츠', 'スポーツ']
];
let questions = [];
let seasonInfo = { seasonId: 'loading', eligibleCount: 0 };
let rankConfig = { version: 'rank-v1-fallback', winPoints: 100, tiers: [{ tier: 'D', requirement: 1000 }, { tier: 'C', requirement: 1500 }, { tier: 'B', requirement: 2500 }, { tier: 'A', requirement: 4000 }, { tier: 'AA', requirement: 6000 }], master: { requirement: 10000 } };
let timer;
let reconnectTimer;
const SESSION_KEY = 'quiz-battle.active-session.v1';
const TEST_LOCALE_KEY = 'quiz-battle.test-locale.v1';
const HOME_INTRO_SESSION_KEY = 'meonjeo.home-intro.v1';
const RANK_POINTS_KEY = 'meonjeo.rank-points.v1';
const RANK_AWARDED_MATCH_KEY = 'meonjeo.rank-awarded-match.v1';
const MATCH_HISTORY_KEY = 'meonjeo.match-history.v1';
const REPORT_OUTBOX_KEY = 'meonjeo.report-outbox.v1';
const RECONNECT_GRACE_MS = 45000;
const QUESTION_CHAR_MS = 130;
const POST_REVEAL_WAIT_MS = 5000;
const RESULT_DISPLAY_MS = 5000;
const OPPONENT_CHAR_MS = 650;
const OPPONENT_RESULT_HOLD_MS = 1200;
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
    catchphrase: '알았다면, 먼저 눌러라.', titleCopy: '문제를 먼저 알아채고 누르는<br>1대1 실시간 버저 퀴즈', online: '온라인 매치', onlineSub: '랜덤 상대와 바로 대전', friend: '친구 매치', friendSub: '초대 코드로 친구와 대전', ranking: '랭킹', rankingSub: '현재 레이팅 순위 확인',
    backTitle: '타이틀로', searching: '상대를 찾는 중...', searchingSub: '현재 대기열에서 가장 가까운 레이팅의<br>플레이어를 찾고 있습니다.', cancel: '취소', readyTitle: '상대를 찾았습니다', startingSoon: '곧 시작합니다', ready: '준비하기', readySending: '준비 중…', readyDone: 'READY', waitingOpponent: '상대를 기다리는 중', nextHint: '다음 문제를 준비하세요',
    leave: '← 나가기', me: '민수', opponent: '별빛토끼', answerGuide: '정답 문자를 순서대로 선택하세요', buzz: '버저 누르기', buzzSub: '먼저 누르면 답할 수 있어요!', revealStart: '문제가 한 글자씩 공개됩니다',
    answerRight: '답변권을 얻었습니다 · 문자를 순서대로 선택하세요', correct: '정답입니다!', wrong: '오답입니다', answerTimeout: '시간이 끝났습니다', bothTimeout: '양쪽 모두 시간 초과', answer: '정답',
    myScore: '내 점수', lives: '남은 라이프', showResult: '결과 보기', next: '다음 문제', matchResult: '경기 결과', settings: '설정', sound: '효과음', vibration: '진동', language: '언어',
    tied: '무효 경기입니다', won: '승리했습니다!', lost: '아쉽게 패배했습니다', ratingNoChange: '변동 없음', rematch: '다시 대전', home: '홈으로', rating: '레이팅', rankPoint: '랭크 포인트', rankNoLoss: '패배해도 줄어들지 않습니다',
  },
  ja: {
    catchphrase: '分かったなら、先に押せ。', titleCopy: '問題を先に見抜いて押す<br>1対1リアルタイム早押しクイズ', online: 'オンラインマッチング', onlineSub: 'ランダムな相手とすぐ対戦', friend: 'フレンドマッチング', friendSub: '招待コードで友達と対戦', ranking: 'ランキング', rankingSub: '現在のレート順位を確認',
    backTitle: 'タイトルへ', searching: '対戦相手を探しています…', searchingSub: '近いレートのプレイヤーを<br>検索しています。', cancel: 'キャンセル', readyTitle: '対戦相手とマッチングしました！', startingSoon: 'まもなく対戦を開始します', ready: '準備する', readySending: '準備中…', readyDone: 'READY', waitingOpponent: '対戦相手を待っています', nextHint: '次の問題を準備してください',
    leave: '← 終了', me: 'あなた', opponent: 'テスト相手', answerGuide: '正解の文字を順番に選んでください', buzz: '早押し', buzzSub: '先に押すと回答できます！', revealStart: '問題が1文字ずつ表示されます',
    answerRight: '回答権を獲得しました · 文字を順番に選んでください', correct: '正解です！', wrong: '不正解です', answerTimeout: '回答時間終了', bothTimeout: '両者とも時間切れ', answer: '答え',
    myScore: '自分の得点', lives: '残りライフ', showResult: '結果を見る', next: '次の問題', matchResult: '試合結果', settings: '設定', sound: '効果音', vibration: '振動', language: '言語',
    tied: '無効試合です', won: '勝利しました！', lost: '敗北しました', ratingNoChange: '変動なし', rematch: 'もう一度', home: 'ホームへ', rating: 'レート', rankPoint: 'ランクポイント', rankNoLoss: '負けても減りません',
  },
};
const ACTIVE_PHASES = new Set(['matching', 'match-found', 'waiting-ready', 'ready', 'countdown', 'reading', 'answering', 'rebound', 'result']);
const state = {
  phase: 'home', questionIndex: 0, score: 0, opponentScore: 0, lives: 5, answerSeconds: 7,
  answerRemaining: 7, selectedChars: [], charIndex: 0, rating: 1248,
  matchId: null, phaseStartedAt: null, phaseDeadline: null, answerRightLost: false,
  lastResultCorrect: null, lastResultText: '', resultKind: null, questionHistory: [],
  opponentAnswerActive: false, opponentAnswerSequence: [], opponentTypedChars: [], opponentMarks: [],
  opponentWillAnswerCorrect: false, rankPoints: Math.max(0, Number(localStorage.getItem(RANK_POINTS_KEY)) || 0), lastRankGain: 0, rankBeforeLabel: null,
  answerInputUnlockedAt: 0,
  locale: localStorage.getItem(TEST_LOCALE_KEY) === 'ja' ? 'ja' : 'ko'
};
const clearTimer = () => { if (timer) { clearInterval(timer); timer = null; } };
const clearReconnectTimer = () => { if (reconnectTimer) { clearInterval(reconnectTimer); reconnectTimer = null; } };
const normalize = value => value.toLowerCase().replace(/\s+/g, '').trim();
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
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

function rankFromPoints(totalPoints) {
  let remaining = Math.max(0, Math.floor(Number(totalPoints) || 0));
  const stageMarks = ['−', '', '＋'];
  for (const entry of rankConfig.tiers) {
    for (let stage = 0; stage < stageMarks.length; stage += 1) {
      if (remaining < entry.requirement) {
        const label = `${entry.tier}${stageMarks[stage]}`;
        return { tier: entry.tier, label, baseLabel: entry.tier, stageMark: stageMarks[stage], current: remaining, required: entry.requirement, isMaster: false, masterLevel: null };
      }
      remaining -= entry.requirement;
    }
  }
  const requirement = Math.max(1, Number(rankConfig.master.requirement) || 10000);
  const masterLevel = Math.floor(remaining / requirement) + 1;
  const current = remaining % requirement;
  return { tier: 'MASTER', label: `Master ${masterLevel}`, baseLabel: 'M', stageMark: '', current, required: requirement, isMaster: true, masterLevel };
}

function rankEmblemMarkup(rank, extraClass = '') {
  const tierClass = rank.tier.toLowerCase();
  const stage = rank.stageMark ? `<small class="rank-stage">${escapeHtml(rank.stageMark)}</small>` : '';
  const masterLevel = rank.isMaster ? `<small class="rank-master-level" style="--rank-digits:${String(rank.masterLevel).length}">${escapeHtml(rank.masterLevel)}</small>` : '';
  return `<span class="rank-emblem rank-tier-${tierClass} ${extraClass}" role="img" aria-label="${escapeHtml(rank.label)}"><svg viewBox="0 0 48 56" aria-hidden="true"><path class="rank-shield" d="M24 3 42 10v15c0 12.5-7.2 22.5-18 28C13.2 47.5 6 37.5 6 25V10L24 3Z"/><path class="rank-cut" d="M24 8.5 37 14v11c0 8.2-4.4 15.2-13 20.2C15.4 40.2 11 33.2 11 25V14l13-5.5Z"/></svg><b>${escapeHtml(rank.baseLabel)}</b>${stage}${masterLevel}</span>`;
}

function renderRankPreview() {
  showSettingsButton(false);
  const samples = [0, 1000, 2000, 3000, 4500, 6000, 7500, 10000, 12500, 15000, 19000, 23000, 27000, 33000, 39000, 45000, 85000, 100025000];
  const cards = samples.map(points => { const rank = rankFromPoints(points); return `<article class="rank-preview-item">${rankEmblemMarkup(rank, 'rank-emblem-preview')}<strong>${rank.label}</strong><small>${points.toLocaleString()} RP</small></article>`; }).join('');
  app.innerHTML = `<div class="rank-preview-page"><div class="eyebrow">RANK BADGES · ${escapeHtml(rankConfig.version)}</div><h1>${isJapaneseTest() ? 'ランクアイコン' : '랭크 아이콘'}</h1><p>${isJapaneseTest() ? 'レートとは別の、減少しない累積ランク' : '레이팅과 별개로 감소하지 않는 누적 랭크'}</p><div class="rank-preview-grid">${cards}</div><button class="primary" id="rank-preview-back">${ui('home')}</button></div>`;
  document.querySelector('#rank-preview-back').onclick = () => { globalThis.location.href = globalThis.location.pathname; };
}

function settleRankPoints({ won, tied }) {
  const rankedMatch = state.matchId && !String(state.matchId).startsWith('friend-');
  if (!rankedMatch || tied) return { gain: 0, before: rankFromPoints(state.rankPoints), after: rankFromPoints(state.rankPoints) };
  const alreadySettled = localStorage.getItem(RANK_AWARDED_MATCH_KEY) === state.matchId;
  if (alreadySettled) {
    const after = rankFromPoints(state.rankPoints);
    return { gain: state.lastRankGain || 0, before: rankFromPoints(Math.max(0, state.rankPoints - (state.lastRankGain || 0))), after };
  }
  const before = rankFromPoints(state.rankPoints);
  const gain = won ? Number(rankConfig.winPoints) || 100 : 0;
  state.rankPoints += gain;
  state.lastRankGain = gain;
  state.rankBeforeLabel = before.label;
  localStorage.setItem(RANK_POINTS_KEY, String(state.rankPoints));
  localStorage.setItem(RANK_AWARDED_MATCH_KEY, state.matchId);
  return { gain, before, after: rankFromPoints(state.rankPoints) };
}

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

function recordCurrentQuestion(outcome) {
  const question = currentQuestion();
  if (!question) return;
  const entry = { round: state.questionIndex + 1, questionId: question.id, category: question.category, questionText: question.text, answer: question.answers[0], explanation: question.explanation, outcome };
  const existingIndex = state.questionHistory.findIndex(item => item.round === entry.round);
  if (existingIndex >= 0) state.questionHistory[existingIndex] = entry;
  else state.questionHistory.push(entry);
}

function historyOverlayMarkup() {
  const historyLabel = isJapaneseTest() ? '問題履歴' : '문제 기록';
  const emptyLabel = isJapaneseTest() ? 'プレイした問題がここに追加されます。' : '플레이한 문제가 여기에 추가됩니다.';
  const answerLabel = isJapaneseTest() ? '答え' : '정답';
  const explanationLabel = isJapaneseTest() ? '解説' : '해설';
  const entries = state.questionHistory.map(item => {
    const outcomeLabel = item.outcome === 'correct' ? (isJapaneseTest() ? '正解' : '정답') : item.outcome === 'opponent-correct' ? (isJapaneseTest() ? '相手正解' : '상대 정답') : item.outcome === 'timeout' ? (isJapaneseTest() ? '時間切れ' : '시간 초과') : (isJapaneseTest() ? '不正解' : '오답');
    return `<article class="history-item"><button class="history-question" type="button" aria-expanded="false"><span><small>Q${item.round} · ${escapeHtml(item.category)} · ${outcomeLabel}</small><strong>${escapeHtml(item.questionText)}</strong></span><b aria-hidden="true">＋</b></button><div class="history-answer" hidden><p><span>${answerLabel}</span><strong>${escapeHtml(item.answer)}</strong></p><p><span>${explanationLabel}</span>${escapeHtml(item.explanation)}</p><button class="history-report" type="button" data-question-id="${escapeHtml(item.questionId)}" data-question-label="${escapeHtml(item.questionText)}">${isJapaneseTest() ? 'この問題を報告' : '이 문제 신고'}</button></div></article>`;
  }).join('');
  return `<button class="history-rail" id="history-toggle" type="button" aria-controls="history-drawer" aria-expanded="false"><span>${historyLabel}</span><b>${state.questionHistory.length}</b></button><div class="history-scrim" id="history-scrim"><aside class="history-drawer" id="history-drawer" aria-hidden="true" aria-label="${historyLabel}"><header><div><small>REVIEW</small><h2>${historyLabel}</h2></div><button id="history-close" type="button" aria-label="${isJapaneseTest() ? '閉じる' : '닫기'}">×</button></header><div class="history-list">${entries || `<p class="history-empty">${emptyLabel}</p>`}</div></aside></div>`;
}

function bindHistoryDrawer() {
  const toggle = document.querySelector('#history-toggle');
  const scrim = document.querySelector('#history-scrim');
  const drawer = document.querySelector('#history-drawer');
  if (!toggle || !scrim || !drawer) return;
  const setOpen = open => {
    scrim.classList.toggle('is-open', open);
    toggle.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    drawer.setAttribute('aria-hidden', String(!open));
  };
  toggle.onclick = () => setOpen(toggle.getAttribute('aria-expanded') !== 'true');
  document.querySelector('#history-close').onclick = () => setOpen(false);
  scrim.onclick = event => { if (event.target === scrim) setOpen(false); };
  document.querySelectorAll('.history-question').forEach(button => {
    button.onclick = () => {
      const open = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!open));
      button.querySelector('b').textContent = open ? '＋' : '−';
      button.nextElementSibling.hidden = open;
    };
  });
  document.querySelectorAll('.history-report').forEach(button => {
    button.onclick = () => openReportDialog({ kind: 'question', targetId: button.dataset.questionId, targetLabel: button.dataset.questionLabel, matchId: state.matchId });
  });
}

function readStoredList(key) {
  try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; }
}

function openReportDialog({ kind = 'feedback', targetId = null, targetLabel = '', matchId = null } = {}) {
  document.querySelector('#report-dialog')?.remove();
  const title = kind === 'player' ? (isJapaneseTest() ? '対戦相手を通報' : '상대 신고') : kind === 'question' ? (isJapaneseTest() ? '問題を報告' : '문제 신고') : (isJapaneseTest() ? '問題報告・要望' : '문제 신고 · 건의');
  const dialog = document.createElement('dialog');
  dialog.id = 'report-dialog'; dialog.className = 'report-dialog';
  dialog.innerHTML = `<form method="dialog"><div class="eyebrow">REPORT</div><h2>${title}</h2>${targetLabel ? `<p class="report-target">${escapeHtml(targetLabel)}</p>` : ''}<label>${isJapaneseTest() ? '種類' : '유형'}<select id="report-category"><option value="incorrect">${isJapaneseTest() ? '内容が間違っている' : '내용이 틀림'}</option><option value="inappropriate">${isJapaneseTest() ? '不適切な内容・名前' : '부적절한 내용·이름'}</option><option value="bug">${isJapaneseTest() ? '不具合' : '오류'}</option><option value="request">${isJapaneseTest() ? '要望・その他' : '건의·기타'}</option></select></label><label>${isJapaneseTest() ? '詳細' : '상세 내용'}<textarea id="report-detail" rows="4" maxlength="500" placeholder="${isJapaneseTest() ? '気になった点を入力してください' : '확인이 필요한 내용을 입력해 주세요'}"></textarea></label><p class="report-error" id="report-error"></p><div class="report-actions"><button class="text-button" id="report-cancel" type="button">${isJapaneseTest() ? 'キャンセル' : '취소'}</button><button class="primary" id="report-submit" type="submit">${isJapaneseTest() ? '送信' : '보내기'}</button></div></form>`;
  document.body.appendChild(dialog);
  dialog.querySelector('#report-cancel').onclick = () => dialog.close();
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.querySelector('form').onsubmit = event => {
    event.preventDefault();
    const detail = dialog.querySelector('#report-detail').value.trim();
    if (detail.length < 2) { dialog.querySelector('#report-error').textContent = isJapaneseTest() ? '詳細を2文字以上入力してください' : '상세 내용을 2자 이상 입력해 주세요'; return; }
    const outbox = readStoredList(REPORT_OUTBOX_KEY);
    outbox.unshift({ reportId: globalThis.crypto?.randomUUID?.() || `report-${Date.now()}`, kind, category: dialog.querySelector('#report-category').value, targetId, targetLabel, matchId, detail, locale: state.locale, createdAt: new Date().toISOString(), status: 'queued' });
    localStorage.setItem(REPORT_OUTBOX_KEY, JSON.stringify(outbox.slice(0, 100)));
    dialog.close();
    showToast(isJapaneseTest() ? '報告を受け付けました' : '신고가 접수되었습니다');
  };
  dialog.showModal();
  dialog.querySelector('#report-detail').focus();
}

function recordMatchHistory({ won, tied }) {
  if (!state.matchId) return;
  const history = readStoredList(MATCH_HISTORY_KEY);
  if (history.some(item => item.matchId === state.matchId)) return;
  history.unshift({ matchId: state.matchId, opponentName: ui('opponent'), opponentIcon: isJapaneseTest() ? '相' : '별', opponentRating: 1232, playedAt: new Date().toISOString(), result: tied ? 'draw' : won ? 'win' : 'loss' });
  localStorage.setItem(MATCH_HISTORY_KEY, JSON.stringify(history.slice(0, 30)));
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
  if (!Array.isArray(state.questionHistory)) state.questionHistory = [];
  if (!Array.isArray(state.opponentAnswerSequence)) state.opponentAnswerSequence = [];
  if (!Array.isArray(state.opponentTypedChars)) state.opponentTypedChars = [];
  if (!Array.isArray(state.opponentMarks)) state.opponentMarks = [];
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

async function loadRankConfig() {
  const payload = await fetch('data/rank-config.json').then(response => {
    if (!response.ok) throw new Error('rank config unavailable');
    return response.json();
  });
  if (!Array.isArray(payload.tiers) || !payload.tiers.length || !payload.master?.requirement) throw new Error('rank config invalid');
  rankConfig = payload;
}

function showToast(message) {
  let toast = document.querySelector('.status-toast');
  if (!toast) { toast = document.createElement('div'); toast.className = 'status-toast'; document.body.appendChild(toast); }
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 1800);
}

function unlockHomeMenu() {
  delete app.dataset.homeLocked;
  app.querySelectorAll('.menu-card').forEach(button => {
    button.disabled = false;
    button.classList.remove('is-selected');
  });
}

function bindHomeMenuAction(selector, action) {
  const button = document.querySelector(selector);
  button.onclick = () => {
    if (app.dataset.homeLocked === 'true') return;
    app.dataset.homeLocked = 'true';
    app.querySelectorAll('.menu-card').forEach(menuButton => { menuButton.disabled = true; });
    button.classList.add('is-selected');
    setTimeout(action, 220);
  };
}

function home() {
  clearTimer(); clearSavedSession(); state.phase = 'home'; state.matchId = null;
  state.rankPoints = Math.max(0, Number(localStorage.getItem(RANK_POINTS_KEY)) || state.rankPoints || 0);
  document.documentElement.lang = state.locale;
  document.title = isJapaneseTest() ? '먼저!（先に！）— テスト版' : '먼저! — 실시간 1대1 버저 퀴즈';
  showSettingsButton(true);
  delete app.dataset.homeLocked;
  const isFirstHome = sessionStorage.getItem(HOME_INTRO_SESSION_KEY) !== 'seen';
  sessionStorage.setItem(HOME_INTRO_SESSION_KEY, 'seen');
  const motionClass = isFirstHome ? 'home-intro' : 'home-return';
  const brandTranslation = isJapaneseTest() ? '<span class="brand-translation">（先に！）</span>' : '';
  const playerRank = rankFromPoints(state.rankPoints);
  document.querySelector('#top-profile').innerHTML = `<div class="top-profile-rank">${rankEmblemMarkup(playerRank, 'rank-emblem-top')}<div><b>${playerRank.label}</b><small>${playerRank.current.toLocaleString()} RP</small></div></div><div class="top-profile-rating"><span>RATING</span><strong>${state.rating.toLocaleString()}</strong></div>`;
  app.innerHTML = `<div class="title-screen ${motionClass}">
    <section class="title-brand-panel" aria-labelledby="home-title">
      <h1 id="home-title" aria-label="${isJapaneseTest() ? '먼저!（先に！）' : '먼저!'}"><span class="logo-clip"><span class="logo-letter">먼</span></span><span class="logo-clip"><span class="logo-letter">저</span></span><span class="logo-clip logo-bang"><span class="logo-letter">!</span></span>${brandTranslation}</h1>
    </section>
    <nav class="home-menu" aria-label="${isJapaneseTest() ? 'メインメニュー' : '메인 메뉴'}">
      <button class="menu-card menu-card-primary" id="online-match" type="button"><span class="menu-number">01</span><span class="menu-copy"><strong>${ui('online')}</strong><small>${ui('onlineSub')}</small></span><span class="menu-arrow" aria-hidden="true">→</span></button>
      <button class="menu-card" id="friend-match" type="button"><span class="menu-number">02</span><span class="menu-copy"><strong>${ui('friend')}</strong><small>${ui('friendSub')}</small></span><span class="menu-arrow" aria-hidden="true">→</span></button>
      <button class="menu-card" id="ranking" type="button"><span class="menu-number">03</span><span class="menu-copy"><strong>${ui('ranking')}</strong><small>${ui('rankingSub')}</small></span><span class="menu-arrow" aria-hidden="true">→</span></button>
    </nav>
    <button class="test-locale-button" id="test-locale" type="button">${isJapaneseTest() ? '한국어로 돌아가기' : '日本語 TEST'}</button>
  </div>`;
  bindHomeMenuAction('#online-match', () => {
    if (activeQuestions().length) matching();
    else {
      showToast(isJapaneseTest() ? 'テスト問題を読み込めませんでした' : '시즌 문제를 불러오지 못했습니다');
      unlockHomeMenu();
    }
  });
  bindHomeMenuAction('#friend-match', friendMatch);
  bindHomeMenuAction('#ranking', ranking);
  document.querySelector('#test-locale').onclick = () => {
    state.locale = isJapaneseTest() ? 'ko' : 'ja';
    localStorage.setItem(TEST_LOCALE_KEY, state.locale);
    state.questionIndex = 0; state.score = 0; state.opponentScore = 0; state.lives = 5;
    home();
  };
}

function generateRoomCode() {
  const values = new Uint32Array(1);
  globalThis.crypto.getRandomValues(values);
  return String(1000 + (values[0] % 9000));
}

function startFriendMatch(roomCode) {
  state.questionIndex = 0; state.score = 0; state.opponentScore = 0; state.lives = 5;
  state.selectedChars = []; state.charIndex = 0; state.answerRemaining = state.answerSeconds;
  state.lastResultCorrect = null; state.lastResultText = ''; state.resultKind = null; state.answerRightLost = false; state.questionHistory = []; state.opponentAnswerActive = false; state.opponentAnswerSequence = []; state.opponentTypedChars = []; state.opponentMarks = [];
  state.matchId = `friend-${roomCode}-${Date.now()}`;
  battleReady();
}

function friendMatch() {
  showSettingsButton(false);
  const createLabel = isJapaneseTest() ? '部屋番号を作る' : '방 번호 만들기';
  const joinLabel = isJapaneseTest() ? '部屋に入る' : '방에 들어가기';
  app.innerHTML = `<div class="battle-page centered friend-room-page"><div class="friend-room-card"><div class="eyebrow">FRIEND MATCH</div><h2>${ui('friend')}</h2><div class="friend-room-actions">
    <section class="friend-room-option"><span class="friend-step">01</span><h3>${createLabel}</h3><button class="friend-room-button" id="create-room" type="button">${createLabel}<span aria-hidden="true">→</span></button><div class="created-room" id="created-room" hidden aria-live="polite"><small>${isJapaneseTest() ? 'この番号を友人に伝えてください' : '이 번호를 친구에게 알려 주세요'}</small><strong id="created-room-code"></strong><span>${isJapaneseTest() ? '参加を待っています…' : '참가를 기다리는 중…'}</span></div></section>
    <section class="friend-room-option"><span class="friend-step">02</span><h3>${joinLabel}</h3><form class="room-join-form" id="room-join-form"><label for="room-code-input">${isJapaneseTest() ? '4桁の部屋番号' : '4자리 방 번호'}</label><div><input id="room-code-input" name="roomCode" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{4}" maxlength="4" placeholder="0000" aria-describedby="room-code-message" required><button type="submit" aria-label="${joinLabel}">→</button></div><p id="room-code-message" aria-live="polite"></p></form></section>
  </div><button class="text-button friend-back" id="friend-back" type="button">${ui('backTitle')}</button></div></div>`;
  document.querySelector('#create-room').onclick = () => {
    const roomCode = generateRoomCode();
    document.querySelector('#created-room-code').textContent = roomCode;
    document.querySelector('#created-room').hidden = false;
  };
  const roomInput = document.querySelector('#room-code-input');
  roomInput.addEventListener('input', () => { roomInput.value = roomInput.value.replace(/\D/g, '').slice(0, 4); });
  document.querySelector('#room-join-form').onsubmit = event => {
    event.preventDefault();
    const roomCode = roomInput.value;
    const message = document.querySelector('#room-code-message');
    if (!/^\d{4}$/.test(roomCode)) {
      message.textContent = isJapaneseTest() ? '4桁の数字を入力してください' : '4자리 숫자를 입력해 주세요';
      roomInput.focus();
      return;
    }
    message.textContent = isJapaneseTest() ? '部屋に入ります…' : '방에 입장합니다…';
    document.querySelectorAll('.friend-room-card button,.friend-room-card input').forEach(control => { control.disabled = true; });
    setTimeout(() => startFriendMatch(roomCode), 300);
  };
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
  app.innerHTML = `<div class="battle-page centered"><div class="settings-card"><div class="eyebrow">SETTINGS</div><h2>${ui('settings')}</h2><div class="settings-list"><button class="setting-row" aria-pressed="true"><span><strong>${ui('sound')}</strong><small>${isJapaneseTest() ? 'ボタンと正解の効果音' : '버튼과 정답 효과음'}</small></span><b>ON</b></button><button class="setting-row" aria-pressed="true"><span><strong>${ui('vibration')}</strong><small>${isJapaneseTest() ? '早押し時のフィードバック' : '빠른 누르기 피드백'}</small></span><b>ON</b></button><div class="setting-row static"><span><strong>${ui('language')}</strong><small>${isJapaneseTest() ? '一時テストモード' : '앱 표시 언어'}</small></span><b>${isJapaneseTest() ? '日本語 TEST' : '한국어'}</b></div><button class="setting-row setting-link" id="feedback-report"><span><strong>${isJapaneseTest() ? '問題報告・要望' : '문제 신고 · 건의'}</strong><small>${isJapaneseTest() ? '問題、動作、改善案を送る' : '문제·오류·개선 의견 보내기'}</small></span><b>→</b></button><button class="setting-row setting-link" id="match-history"><span><strong>${isJapaneseTest() ? 'マッチング履歴' : '매칭 기록'}</strong><small>${isJapaneseTest() ? '対戦相手の確認・通報' : '상대 확인 및 신고'}</small></span><b>→</b></button></div><button class="primary" id="settings-back">${ui('backTitle')}</button></div></div>`;
  document.querySelectorAll('.setting-row[aria-pressed]').forEach(button => {
    button.onclick = () => {
      const enabled = button.getAttribute('aria-pressed') === 'true';
      button.setAttribute('aria-pressed', String(!enabled));
      button.querySelector('b').textContent = enabled ? 'OFF' : 'ON';
    };
  });
  document.querySelector('#feedback-report').onclick = () => openReportDialog({ kind: 'feedback' });
  document.querySelector('#match-history').onclick = matchHistory;
  document.querySelector('#settings-back').onclick = home;
}

function matchHistory() {
  clearTimer(); showSettingsButton(false);
  const history = readStoredList(MATCH_HISTORY_KEY);
  const empty = isJapaneseTest() ? '対戦履歴はまだありません' : '아직 매칭 기록이 없습니다';
  const rows = history.map(item => {
    const resultLabel = item.result === 'win' ? (isJapaneseTest() ? '勝利' : '승리') : item.result === 'loss' ? (isJapaneseTest() ? '敗北' : '패배') : (isJapaneseTest() ? '無効' : '무효');
    const date = new Date(item.playedAt).toLocaleString(isJapaneseTest() ? 'ja-JP' : 'ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `<article class="match-history-row"><span class="match-history-avatar">${escapeHtml(item.opponentIcon)}</span><div><strong>${escapeHtml(item.opponentName)}</strong><small>RATING ${Number(item.opponentRating).toLocaleString()} · ${date}</small></div><b class="match-history-result ${item.result}">${resultLabel}</b><button class="match-report" type="button" data-match-id="${escapeHtml(item.matchId)}" data-player-name="${escapeHtml(item.opponentName)}">${isJapaneseTest() ? '通報' : '신고'}</button></article>`;
  }).join('');
  app.innerHTML = `<div class="battle-page centered"><div class="settings-card match-history-card"><div class="eyebrow">MATCH HISTORY</div><h2>${isJapaneseTest() ? 'マッチング履歴' : '매칭 기록'}</h2><div class="match-history-list">${rows || `<p class="history-empty">${empty}</p>`}</div><button class="primary" id="history-back">${isJapaneseTest() ? '設定へ戻る' : '설정으로'}</button></div></div>`;
  document.querySelectorAll('.match-report').forEach(button => { button.onclick = () => openReportDialog({ kind: 'player', targetId: button.dataset.playerName, targetLabel: button.dataset.playerName, matchId: button.dataset.matchId }); });
  document.querySelector('#history-back').onclick = settings;
}

function matching({ resume = false } = {}) {
  clearTimer();
  showSettingsButton(false);
  if (!resume) {
    state.questionIndex = 0; state.score = 0; state.opponentScore = 0; state.lives = 5;
    state.selectedChars = []; state.charIndex = 0; state.answerRemaining = state.answerSeconds;
    state.lastResultCorrect = null; state.lastResultText = ''; state.resultKind = null; state.answerRightLost = false; state.questionHistory = []; state.opponentAnswerActive = false; state.opponentAnswerSequence = []; state.opponentTypedChars = []; state.opponentMarks = [];
    state.matchId = globalThis.crypto?.randomUUID?.() || `match-${Date.now()}`;
    state.phaseStartedAt = Date.now(); state.phaseDeadline = state.phaseStartedAt + 1300;
  }
  state.phase = 'matching'; persistSession();
  app.innerHTML = `<div class="battle-page centered"><div class="match-orb"><span>VS</span></div><div class="eyebrow">MATCHMAKING</div><h2>${ui('searching')}</h2><p class="muted">${ui('searchingSub')}</p><div class="searching-dots"><i></i><i></i><i></i></div><button class="cancel" id="cancel">${ui('cancel')}</button></div>`;
  document.querySelector('#cancel').onclick = home;
  const remaining = Math.max(0, (state.phaseDeadline || Date.now()) - Date.now());
  setTimeout(() => { if (state.phase === 'matching') battleReady(); }, remaining);
}

function renderMatchFoundScreen({ waiting = false, animate = false } = {}) {
  const playerRank = rankFromPoints(state.rankPoints);
  const opponentRank = rankFromPoints(4500);
  app.innerHTML = `<div class="battle-page centered match-found-page ${animate ? 'match-found-animate' : ''}"><div class="eyebrow">MATCH FOUND · ${isJapaneseTest() ? 'TEST' : 'RANKED'}</div><h2>${ui('readyTitle')}</h2><div class="ready-versus"><div class="ready-player ready-player-me"><span class="ready-avatar mine">${isJapaneseTest() ? '自' : '민'}</span><b>${ui('me')}</b><small>${rankEmblemMarkup(playerRank, 'rank-emblem-inline')}<span>RATING 1,248</span></small></div><strong class="ready-vs">VS</strong><div class="ready-player ready-player-opponent"><span class="ready-avatar">${isJapaneseTest() ? '相' : '별'}</span><b>${ui('opponent')}</b><small>${rankEmblemMarkup(opponentRank, 'rank-emblem-inline')}<span>RATING 1,232</span></small></div></div><button class="primary ready-action ${waiting ? 'is-ready' : ''}" id="ready" type="button" ${waiting ? 'disabled' : ''}>${waiting ? ui('readyDone') : ui('ready')}</button><p class="match-starting" id="ready-status">${waiting ? `${ui('waitingOpponent')}<span class="waiting-dots"><i></i><i></i><i></i></span>` : '&nbsp;'}</p></div>`;
  if (!waiting) document.querySelector('#ready').onclick = () => waitForOpponentReady();
}

function battleReady() {
  clearTimer(); showSettingsButton(false);
  state.phase = 'match-found'; state.phaseStartedAt = Date.now(); state.phaseDeadline = null; persistSession();
  const animationKey = `meonjeo.match-found.${state.matchId}`;
  const animate = sessionStorage.getItem(animationKey) !== 'seen';
  sessionStorage.setItem(animationKey, 'seen');
  renderMatchFoundScreen({ animate });
}

function waitForOpponentReady({ resume = false } = {}) {
  clearTimer(); showSettingsButton(false);
  if (!resume || !state.phaseDeadline) { state.phaseStartedAt = Date.now(); state.phaseDeadline = state.phaseStartedAt + 1050; }
  state.phase = 'waiting-ready'; persistSession();
  renderMatchFoundScreen({ waiting: true });
  const remaining = Math.max(0, (state.phaseDeadline || Date.now()) - Date.now());
  setTimeout(() => { if (state.phase === 'waiting-ready') countdown(); }, remaining);
}

function countdown({ resume = false } = {}) {
  clearTimer(); showSettingsButton(false); state.phase = 'countdown';
  if (!resume || !state.phaseDeadline) { state.phaseStartedAt = Date.now(); state.phaseDeadline = state.phaseStartedAt + 1600; }
  persistSession();
  app.innerHTML = `<div class="battle-page centered countdown-page"><div class="eyebrow">GET READY</div><p class="countdown-title">${ui('startingSoon')}</p><div class="count-clip"><div class="count-number" id="count">3</div></div><div class="countdown-sweep"><span></span></div></div>`;
  let lastCount = null;
  const tick = () => {
    const remaining = (state.phaseDeadline || 0) - Date.now();
    const el = document.querySelector('#count');
    const countValue = remaining <= 400 ? 'GO' : String(Math.max(1, Math.ceil((remaining - 400) / 400)));
    if (el && countValue !== lastCount) { el.textContent = countValue; el.classList.remove('count-enter'); void el.offsetWidth; el.classList.add('count-enter'); }
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
  </div>${historyOverlayMarkup()}`;
  bindHistoryDrawer();
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
  state.phaseStartedAt = Date.now(); state.phaseDeadline = state.phaseStartedAt + state.answerSeconds * 1000; state.answerInputUnlockedAt = state.phaseStartedAt + 500; state.answerRightLost = false; clearTimer(); persistSession();
  const buzzButton = document.querySelector('#buzz'); buzzButton.disabled = true; buzzButton.classList.add('is-pressed'); setTimeout(() => { document.querySelector('#buzzer-zone').style.display = 'none'; document.querySelector('#answer').classList.add('active','is-input-locked'); renderCandidates(); }, 120);
  setTimeout(() => { if (state.phase !== 'answering') return; document.querySelector('#answer')?.classList.remove('is-input-locked'); renderCandidates(); }, 500);
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
  const inputLocked = Date.now() < (state.answerInputUnlockedAt || 0);
  document.querySelector('#candidate-options').innerHTML = choices.map(char => `<button class="candidate" data-char="${char}" ${inputLocked ? 'disabled' : ''}>${char}</button>`).join('');
  document.querySelectorAll('.candidate').forEach(button => { button.onclick = () => selectCharacter(button.dataset.char); });
}

function selectCharacter(char) {
  if (state.phase !== 'answering' || Date.now() < (state.answerInputUnlockedAt || 0)) return; const answer = answerCharacters(currentQuestion());
  if (char !== answer[state.charIndex]) { playWrongSound(); document.querySelector('#candidate-options').classList.add('wrong-pick'); setTimeout(() => judge(false), 260); return; }
  playChoiceSound();
  state.selectedChars.push(char); state.charIndex += 1; persistSession();
  if (state.charIndex >= answer.length) judge(true); else renderCandidates();
}

function opponentWrongCharacter(correct) {
  const pool = /[0-9]/.test(correct) ? Array.from('0123456789') : /[A-Z]/.test(correct) ? Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ') : isJapaneseTest() ? ['東', '京', '富', '士', '山', '日', '本', '大', '川', '海'] : ['가', '나', '다', '라', '마', '바', '사', '아', '자', '하'];
  return pool.find(character => character !== correct) || '×';
}

function startOpponentAnswer() {
  const answer = answerCharacters(currentQuestion());
  const wrongIndex = Math.min(3, Math.max(0, answer.length - 1));
  const randomValue = new Uint32Array(1);
  globalThis.crypto.getRandomValues(randomValue);
  state.opponentWillAnswerCorrect = randomValue[0] % 2 === 0;
  state.opponentAnswerSequence = state.opponentWillAnswerCorrect ? [...answer] : [...answer.slice(0, wrongIndex), opponentWrongCharacter(answer[wrongIndex])];
  state.opponentTypedChars = [];
  state.opponentMarks = [];
  state.opponentAnswerActive = true;
  state.phase = 'rebound';
  state.phaseStartedAt = Date.now();
  state.phaseDeadline = state.phaseStartedAt + state.opponentAnswerSequence.length * OPPONENT_CHAR_MS + OPPONENT_RESULT_HOLD_MS;
  persistSession();
  renderOpponentAnswer();
}

function finishOpponentAnswer() {
  clearTimer();
  state.opponentAnswerActive = false;
  state.phase = 'result';
  state.resultKind = 'answer';
  state.phaseStartedAt = Date.now();
  state.phaseDeadline = state.phaseStartedAt + RESULT_DISPLAY_MS;
  state.lastResultCorrect = false;
  if (state.opponentWillAnswerCorrect) {
    state.opponentScore += 1;
    state.lastResultText = isJapaneseTest() ? '対戦相手が正解しました' : '상대가 정답을 맞혔습니다';
    recordCurrentQuestion('opponent-correct');
  } else {
    state.lastResultText = isJapaneseTest() ? '両者とも不正解です' : '양쪽 모두 오답입니다';
    recordCurrentQuestion('wrong');
  }
  persistSession();
  renderQuestionResult();
}

function renderOpponentAnswer() {
  clearTimer(); showSettingsButton(false);
  const question = currentQuestion();
  const roundLimit = currentRoundLimit();
  const typingLabel = isJapaneseTest() ? `${ui('opponent')}さんが入力中です...` : `${ui('opponent')}님이 입력 중입니다...`;
  app.innerHTML = `<div class="battle-page battle-arena opponent-answer-page"><div class="battle-head"><button class="back" id="back">${ui('leave')}</button><span class="round">ROUND ${state.questionIndex + 1} / ${roundLimit}</span></div><section class="scoreboard" aria-label="score"><article class="combatant me"><div class="combat-avatar">${isJapaneseTest() ? '自' : '민'}</div><div class="combat-copy"><strong>${ui('me')}</strong><small>★ ${state.rating.toLocaleString()}</small><span class="combat-life">♥ ${state.lives}</span></div><b class="combat-score">${state.score}</b></article><div class="round-hub"><div><strong>${state.questionIndex + 1}</strong><span>/ ${roundLimit}</span></div><small>ROUND</small><i></i></div><article class="combatant opponent"><b class="combat-score">${state.opponentScore}</b><div class="combat-copy"><strong>${ui('opponent')}</strong><small>★ 1,232</small><span class="combat-life">♥ 5</span></div><div class="combat-avatar">${isJapaneseTest() ? '相' : '별'}</div></article></section><section class="opponent-input-card"><p class="opponent-typing-label"><span></span>${typingLabel}</p><div class="opponent-question">${escapeHtml(question.text)}</div><div class="opponent-entry" aria-live="polite"><div class="opponent-marks" id="opponent-marks"></div><div class="opponent-characters" id="opponent-characters"></div></div><p class="opponent-input-note" id="opponent-input-note">${isJapaneseTest() ? '入力した文字がリアルタイムで表示されます' : '입력한 글자가 실시간으로 표시됩니다'}</p></section></div>${historyOverlayMarkup()}`;
  document.querySelector('#back').onclick = home;
  bindHistoryDrawer();
  const answer = answerCharacters(question);
  let lastSoundCount = state.opponentTypedChars.length;
  const tick = () => {
    if (state.phase !== 'rebound' || !state.opponentAnswerActive) { clearTimer(); return; }
    const elapsed = Math.max(0, Date.now() - (state.phaseStartedAt || Date.now()));
    const revealCount = Math.min(state.opponentAnswerSequence.length, Math.floor(elapsed / OPPONENT_CHAR_MS));
    state.opponentTypedChars = state.opponentAnswerSequence.slice(0, revealCount);
    state.opponentMarks = state.opponentTypedChars.map((character, index) => character === answer[index] ? '〇' : '×');
    if (revealCount > lastSoundCount) {
      const latestMark = state.opponentMarks[revealCount - 1];
      const answerCompleted = revealCount === state.opponentAnswerSequence.length;
      if (latestMark === '×') playWrongSound();
      else if (answerCompleted && state.opponentWillAnswerCorrect) playCorrectSound();
      else playChoiceSound();
      lastSoundCount = revealCount;
    }
    const marks = document.querySelector('#opponent-marks');
    const characters = document.querySelector('#opponent-characters');
    if (marks) marks.innerHTML = state.opponentMarks.map(mark => `<span class="${mark === '×' ? 'is-wrong' : 'is-right'}">${mark}</span>`).join('');
    if (characters) characters.innerHTML = state.opponentTypedChars.map((character, index) => `<span class="${state.opponentMarks[index] === '×' ? 'is-wrong' : ''}">${escapeHtml(character)}</span>`).join('');
    if (state.opponentMarks.includes('×')) document.querySelector('#opponent-input-note').textContent = isJapaneseTest() ? '入力を間違えました' : '입력을 틀렸습니다';
    else if (revealCount === state.opponentAnswerSequence.length) document.querySelector('#opponent-input-note').textContent = isJapaneseTest() ? '回答が完成しました' : '답변을 완성했습니다';
    persistSession();
    if (Date.now() >= (state.phaseDeadline || 0)) finishOpponentAnswer();
  };
  tick(); timer = setInterval(tick, 80);
}

function judge(correct) {
  if (state.phase !== 'answering') return; clearTimer();
  if (correct) playCorrectSound();
  if (!correct) {
    state.lives -= 1;
    state.lastResultText = state.selectedChars.length ? ui('wrong') : ui('answerTimeout');
    startOpponentAnswer();
    return;
  }
  state.phase = 'result'; state.phaseStartedAt = Date.now(); state.phaseDeadline = state.phaseStartedAt + RESULT_DISPLAY_MS;
  state.score += 1;
  state.resultKind = 'answer';
  state.lastResultCorrect = true;
  state.lastResultText = ui('correct');
  recordCurrentQuestion('correct');
  persistSession(); renderQuestionResult();
}

function showTimedOutAnswer() {
  if (state.phase !== 'reading' && state.phase !== 'rebound') return;
  clearTimer(); state.phase = 'result'; state.resultKind = 'both-timeout';
  state.phaseStartedAt = Date.now(); state.phaseDeadline = state.phaseStartedAt + RESULT_DISPLAY_MS;
  state.lastResultCorrect = null; state.lastResultText = ui('bothTimeout');
  recordCurrentQuestion('timeout');
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
  app.innerHTML = `<div class="battle-page centered"><div class="result-card answer-result-card"><div class="result-icon ${correct ? '' : 'wrong'}">${correct ? '✓' : '×'}</div><div class="eyebrow">ROUND ${state.questionIndex + 1} / ${currentRoundLimit()}</div><h2>${resultText}</h2><div class="result-revealed-answer"><span>${ui('answer')}</span><strong>${q.answers[0]}</strong></div><p class="explanation">${q.explanation}</p><div class="result-stats"><span>${ui('myScore')} <b>${state.score}</b></span><span>${ui('lives')} <b>${'♥ '.repeat(Math.max(0, state.lives)).trim() || '0'}</b></span></div><p class="result-auto-next"><b id="result-clock">${Math.ceil(RESULT_DISPLAY_MS / 1000)}</b>${isJapaneseTest() ? '秒後に' : '초 후'} ${matchShouldEnd() ? ui('matchResult') : ui('next')}</p></div></div>`;
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
    if (state.opponentAnswerActive) {
      if (deadlinePassed) finishOpponentAnswer(); else renderOpponentAnswer();
      return;
    }
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
  if (state.phase === 'match-found' || state.phase === 'ready') { battleReady(); return; }
  if (state.phase === 'waiting-ready') { if (deadlinePassed) countdown(); else waitForOpponentReady({ resume: true }); return; }
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
  recordMatchHistory({ won, tied });
  const title = tied ? ui('tied') : won ? ui('won') : ui('lost');
  const icon = tied ? '—' : won ? '🏆' : '×';
  const ratingDelta = tied ? 0 : won ? 18 : -14;
  const ratingAfter = state.rating + ratingDelta;
  const ratingDeltaLabel = ratingDelta > 0 ? `+${ratingDelta}` : ratingDelta === 0 ? '±0' : String(ratingDelta);
  const rankResult = settleRankPoints({ won, tied });
  const rankPointsBefore = Math.max(0, state.rankPoints - rankResult.gain);
  const rankProgress = Math.min(100, Math.round((rankResult.after.current / rankResult.after.required) * 100));
  const rankProgressBefore = Math.min(100, Math.round((rankResult.before.current / rankResult.before.required) * 100));
  const rankUp = rankResult.before.label !== rankResult.after.label;
  const rankGainLabel = rankResult.gain > 0 ? `+${rankResult.gain} RP` : '+0 RP';
  const ruleCopy = isJapaneseTest() ? `日本語テスト · 全${roundLimit}問` : `최대 ${roundLimit}라운드 · ${WIN_SCORE}문제 선취`;
  app.innerHTML = `<div class="battle-page centered"><div class="result-card final"><div class="result-icon ${won || tied ? '' : 'wrong'}">${icon}</div><div class="eyebrow">MATCH COMPLETE · ${Math.min(state.questionIndex + 1, roundLimit)} ROUNDS</div><h2>${title}</h2><p>${ruleCopy}</p><div class="final-score"><b>${state.score}</b><span>—</span><b>${state.opponentScore}</b></div><div class="result-progression"><div class="rating-change"><span>RATING</span><b>${state.rating.toLocaleString()} → ${ratingAfter.toLocaleString()}</b><strong>${ratingDeltaLabel}</strong></div><div class="rank-result ${rankUp ? 'is-promoted' : ''}">${rankEmblemMarkup(rankResult.after, 'rank-emblem-result')}<div><small>${rankUp ? 'RANK UP!' : ui('rankPoint')}</small><strong>${rankResult.after.label}<em>${rankGainLabel}</em></strong><div class="rank-progress" style="--rank-from:${rankUp ? 0 : rankProgressBefore}%;--rank-to:${rankProgress}%"><span></span></div><p>${rankPointsBefore.toLocaleString()} → ${state.rankPoints.toLocaleString()} RP · ${ui('rankNoLoss')}</p></div></div></div><button class="primary" id="rematch">${ui('rematch')}</button><button class="text-button" id="home">${ui('home')}</button></div></div>${historyOverlayMarkup()}`;
  bindHistoryDrawer();
  document.querySelector('#rematch').onclick = () => { state.questionIndex = 0; state.score = 0; state.opponentScore = 0; state.lives = 5; state.questionHistory = []; matching(); }; document.querySelector('#home').onclick = home;
}

async function bootstrap() {
  document.documentElement.lang = state.locale;
  app.innerHTML = `<div class="battle-page centered"><div class="match-orb"><span>먼</span></div><p class="muted">${isJapaneseTest() ? 'テスト問題を準備しています…' : '시즌 문제를 불러오는 중...'}</p></div>`;
  const [seasonLoad, rankLoad] = await Promise.allSettled([loadActiveSeason(), loadRankConfig()]);
  if (seasonLoad.status === 'rejected') { console.error(seasonLoad.reason); seasonInfo = { seasonId: '시즌 데이터 오류', eligibleCount: 0 }; }
  if (rankLoad.status === 'rejected') console.error(rankLoad.reason);
  if (new URLSearchParams(globalThis.location.search).has('rank-preview')) { renderRankPreview(); return; }
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
