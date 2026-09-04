import { readFile, writeFile } from 'node:fs/promises';

const files = [
  new URL('../data/seasons/S1-2026/questions.ko.json', import.meta.url),
];

function repair(data) {
  const groups = new Map();
  for (const question of data.questions) {
    const group = groups.get(question.factGroupId) || [];
    group.push(question);
    groups.set(question.factGroupId, group);
  }

  for (const questions of groups.values()) {
    const q1 = questions.find(question => question.variantId === 'q1');
    const q2 = questions.find(question => question.variantId === 'q2');
    if (!q1 || !q2 || q1.categoryId !== q2.categoryId) continue;

    if (q1.categoryId === 'sports') {
      const inverse = q2.questionText.match(/^(.+)이\(가\) (.+)를 뜻하는 스포츠는 무엇일까요\?$/);
      if (inverse) {
        const term = q1.canonicalAnswer;
        const sport = q2.canonicalAnswer;
        const meaning = inverse[2];
        q1.questionText = `${sport}에서 다음 설명에 해당하는 용어는 무엇일까요? ${meaning}.`;
        q2.questionText = `‘${term}’이라는 표현을 사용하는 스포츠는 무엇일까요? 힌트: ${meaning}.`;
        q1.explanation = q2.explanation = `종목: ${sport}. 용어: ${term}. 의미: ${meaning}.`;
      } else {
        const eventMatch = q1.questionText.match(/^(.+?)\s*「(.+)」은 어떤 종목의 대회일까요\?$/);
        if (!eventMatch) continue;
        const description = eventMatch[1];
        const sport = q1.canonicalAnswer;
        const event = q2.canonicalAnswer;
        q1.questionText = `대회명은 「${event}」입니다. 이 대회가 열리는 스포츠 종목은 무엇일까요?`;
        q2.questionText = `${sport}에서 다음 설명에 해당하는 대회 또는 트로피는 무엇일까요? ${description}.`;
        q1.explanation = q2.explanation = `종목: ${sport}. 대회·트로피: ${event}.`;
      }
    } else if (q1.categoryId === 'kpop') {
      const artist = q1.canonicalAnswer;
      const song = q2.canonicalAnswer;
      q1.questionText = `데뷔곡이 「${song}」인 그룹 또는 가수는 누구일까요?`;
      q2.questionText = `${artist}의 대표 데뷔곡은 무엇일까요?`;
      q1.explanation = q2.explanation = `아티스트: ${artist}. 데뷔곡: ${song}.`;
    } else if (q1.categoryId === 'games') {
      const game = q2.canonicalAnswer;
      const relatedName = q1.canonicalAnswer;
      if (q2.questionText.startsWith('개발사 ')) {
        q1.questionText = `게임 「${game}」의 개발사는 어디일까요?`;
        q1.explanation = q2.explanation = `게임: ${game}. 개발사: ${relatedName}.`;
      } else {
        q1.questionText = `게임 「${game}」에 등장하는 대표 캐릭터는 누구일까요?`;
        if (q2.questionText.includes('가 등장하는 게임 시리즈')) {
          q2.questionText = `다음 캐릭터가 등장하는 게임 시리즈는 무엇일까요? 캐릭터: ${relatedName}.`;
        }
        q1.explanation = q2.explanation = `게임: ${game}. 대표 캐릭터: ${relatedName}.`;
        if (game.normalize('NFKC').toLowerCase().includes(relatedName.normalize('NFKC').toLowerCase())) {
          q1.enabledInSeason = false;
        }
      }
    } else if (q1.categoryId === 'anime_manga_webtoon') {
      const work = q1.canonicalAnswer;
      const creator = q2.canonicalAnswer;
      q1.explanation = q2.explanation = `작품: ${work}. 작가·원작자: ${creator}.`;
    } else if (q1.categoryId === 'entertainment_broadcast') {
      const work = q1.canonicalAnswer;
      const creator = q2.canonicalAnswer;
      q1.explanation = q2.explanation = `작품: ${work}. 관련 제작자·원작자: ${creator}.`;
      // Drama pairs mix directors, screenwriters, and original authors. Movie
      // director questions state one precise role and can safely stay live.
      q2.enabledInSeason = q2.questionText.startsWith('영화 ') && q2.questionText.includes('감독은 누구일까요?');
    }
  }
  return data;
}

for (const file of files) {
  const source = await readFile(file, 'utf8');
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const repaired = repair(JSON.parse(source));
  await writeFile(file, `${JSON.stringify(repaired, null, 2).replace(/\n/g, eol)}${eol}`, 'utf8');
}
