const app = document.querySelector('#app');

const categories = [
  ['상식', '일반상식'], ['한국사', '韓国史'], ['세계사·지리', '世界史・地理'], ['과학·수학', '科学・数学'],
  ['K-POP', 'K-POP全般'], ['연예·방송', '芸能・ドラマ'], ['게임', 'ゲーム'], ['스포츠', 'スポーツ']
];

function home() {
  app.innerHTML = `<div class="page">
    <section class="hero"><div class="hero-copy"><div class="eyebrow">Think fast. Play fair.</div><h1>문제를 먼저 맞히는<br><span style="color:var(--cobalt)">1vs1 퀴즈 배틀</span></h1><p class="lede">지금 바로 상대를 찾아보세요.<br>짧고 강렬한 한 판이 시작됩니다.</p></div><button class="quick-match" id="match"><span class="arrow">↗</span><strong>빠른 대전</strong><span>랜덤 매칭으로 바로 시작</span></button></section>
    <section class="dashboard"><div class="card stat-card"><div class="stat-label">현재 레이팅</div><div class="rating">1,248 <small>▲ 24</small></div><div class="rank-row"><span>최고 랭크 · 골드</span><span class="rank-badge">GOLD</span></div></div>
      <div class="card"><div class="card-title">최근 전적 <a href="#">전체보기</a></div><div class="recent-list"><div class="recent-item"><span class="result win">W</span><span>김민준</span><span class="recent-meta">+16<br>2분 전</span></div><div class="recent-item"><span class="result loss">L</span><span>별빛토끼</span><span class="recent-meta">-12<br>어제</span></div><div class="recent-item"><span class="result win">W</span><span>QuizMaster</span><span class="recent-meta">+18<br>어제</span></div></div></div></section>
    <section class="card section"><div class="card-title">카테고리 <a href="#">준비 중인 모드</a></div><div class="category-grid">${categories.map(c => `<button class="category"><b>${c[0]}</b><span>${c[1]}</span></button>`).join('')}</div></section>
  </div>`;
  document.querySelector('#match').onclick = battle;
}

function battle() {
  app.innerHTML = `<div class="battle-page"><div class="battle-head"><button class="back" id="back">← 홈으로</button><span class="round">RANKED MATCH · 01</span></div>
    <div class="players"><div class="player me"><div class="player-top"><span>나</span><span class="hearts">♥ ♥ ♥</span></div><div class="player-name">민수</div><span class="points" id="my-points">0</span> <small>점</small></div><span class="vs">VS</span><div class="player"><div class="player-top"><span>상대</span><span class="hearts">♥ ♥ ♥</span></div><div class="player-name">별빛토끼</div><span class="points">0</span> <small>점</small></div></div>
    <div class="question-card"><div class="question-label">상식 · QUESTION 01</div><div class="question">대한민국의 수도는 어디일까요?</div><div class="progress"><span></span></div><button class="buzz" id="buzz">빠르게 누르기</button><div class="status" id="status">문제가 보이면 아는 순간 눌러주세요</div><div class="answer-panel" id="answer"><input id="answer-input" placeholder="정답을 입력하세요" autocomplete="off"><button id="submit">정답 제출</button></div></div></div>`;
  document.querySelector('#back').onclick = home;
  document.querySelector('#buzz').onclick = () => { document.querySelector('#buzz').style.display = 'none'; document.querySelector('#answer').classList.add('active'); document.querySelector('#status').textContent = '回答権を獲得しました · 7秒'; document.querySelector('#answer-input').focus(); };
  document.querySelector('#submit').onclick = () => { const v = document.querySelector('#answer-input').value.trim(); if (v.includes('서울') || v.includes('ソウル')) { document.querySelector('#my-points').textContent = '1'; document.querySelector('#status').textContent = '정답입니다! 다음 문제를 준비합니다.'; } else { document.querySelector('#status').textContent = '오답입니다. 상대의 답변을 기다립니다.'; } document.querySelector('#answer').classList.remove('active'); };
}

home();
