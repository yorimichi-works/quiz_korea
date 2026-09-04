/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFile } from 'node:fs/promises';

const baseUrl = process.env.MEONJEO_TEST_URL || 'http://localhost:3001';
const apiKey = 'AIzaSyAFNxcPTqD8LK6IWXlygncDoaUFRAdb6sQ';
const season = JSON.parse(await readFile(new URL('../data/seasons/S2-2026/questions.ko.json', import.meta.url), 'utf8'));
const answers = new Map(season.questions
  .filter((question: { enabledInSeason:boolean; qaStatus:string }) => question.enabledInSeason && question.qaStatus !== 'REJECT')
  .map((question: { questionText:string; canonicalAnswer:string }) => [question.questionText, question.canonicalAnswer]));
const sleep = (ms:number) => new Promise(resolve => setTimeout(resolve,ms));

async function jsonFetch(url:string, options:RequestInit = {}): Promise<{ payload:any; elapsed:number }> {
  const started = performance.now(); const response = await fetch(url, options); const elapsed = performance.now()-started;
  const payload:any = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(payload)}`);
  return { payload, elapsed };
}

async function anonymousUser() {
  let idToken = '';
  try {
    const { payload } = await jsonFetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, { method:'POST', headers:{'Content-Type':'application/json'}, body:'{"returnSecureToken":true}' });
    idToken = payload.idToken as string;
    const session = await jsonFetch(`${baseUrl}/api/realtime?action=session`, { method:'POST', headers:{ Authorization:`Bearer ${idToken}`, 'Content-Type':'application/json' }, body:'{}' });
    return { idToken, sessionToken:session.payload.sessionToken as string };
  } catch (error) {
    if (idToken) await jsonFetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${apiKey}`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({idToken}) }).catch(() => null);
    throw error;
  }
}

const users: Array<{ idToken:string; sessionToken:string }> = [];
const requestTimes:number[] = []; let retries = 0; let completed = 0; let aWins = 0; let bWins = 0; let forfeitVerified = false;
async function realtime(userIndex:number, action:string, body:Record<string,unknown>) {
  const result = await jsonFetch(`${baseUrl}/api/realtime?action=${action}`, { method:'POST', headers:{ Authorization:`Meonjeo ${users[userIndex].sessionToken}`, 'Content-Type':'application/json', 'X-Meonjeo-QA':'local-200' }, body:JSON.stringify(body) });
  requestTimes.push(result.elapsed); return result.payload;
}

try {
  users.push(await anonymousUser());
  users.push(await anonymousUser());
  for (let matchNumber=0; matchNumber<200; matchNumber+=1) {
    const first = await realtime(0,'join',{ source:'rated' });
    const second = await realtime(1,'join',{ source:'rated' });
    const matchId = second.matchId || first.matchId; if (!matchId) throw new Error(`Match ${matchNumber} did not form`);
    let snapshots:any[] = [];
    for (let attempt=0; attempt<20; attempt+=1) {
      snapshots = [(await realtime(0,'snapshot',{matchId})).snapshot,(await realtime(1,'snapshot',{matchId})).snapshot];
      if (snapshots[0].phase === 'open') break; await sleep(8);
    }
    if (snapshots[0]?.phase !== 'open') throw new Error(`Match ${matchNumber} never opened`);
    const preferred = matchNumber % 2; const other = preferred === 0 ? 1 : 0;
    const buzzId = crypto.randomUUID();
    const winnerBuzz = await realtime(preferred,'buzz',{ matchId, questionToken:snapshots[preferred].questionToken, buzzId, clientSequence:matchNumber+1 });
    await realtime(other,'buzz',{ matchId, questionToken:snapshots[other].questionToken, buzzId:crypto.randomUUID(), clientSequence:matchNumber+1 });
    const winner = winnerBuzz.winner === 'me' ? preferred : other;
    const questionText = snapshots[winner].question.text; const answer = answers.get(questionText); if (!answer) throw new Error(`Answer missing for ${questionText}`);
    const questionToken = snapshots[winner].questionToken;
    const answerId = crypto.randomUUID(); const answerResult = await realtime(winner,'answer',{ matchId, questionToken, answerId, answer });
    if (answerResult.snapshot?.result?.kind !== 'correct') throw new Error(`Expected correct answer for ${questionText}; sent ${answer}`);
    if (matchNumber % 20 === 0) { await realtime(winner,'answer',{ matchId, questionToken, answerId, answer }); retries += 1; }
    let complete:any = answerResult.snapshot;
    for (let attempt=0; attempt<20 && complete.phase !== 'complete'; attempt+=1) { await sleep(8); complete = (await realtime(winner,'snapshot',{matchId})).snapshot; }
    if (complete.phase !== 'complete') throw new Error(`Match ${matchNumber} did not complete`);
    completed += 1; if (winner === 0) aWins += 1; else bWins += 1;
    if (completed % 20 === 0) console.log(`QA progress: ${completed}/200 matches complete`);
  }
  const forfeitFirst = await realtime(0,'join',{ source:'rated' });
  const forfeitSecond = await realtime(1,'join',{ source:'rated' });
  const forfeitMatchId = forfeitSecond.matchId || forfeitFirst.matchId;
  if (!forfeitMatchId) throw new Error('Forfeit verification match did not form');
  await realtime(0,'leave',{ matchId:forfeitMatchId });
  const forfeitSnapshot = (await realtime(1,'snapshot',{ matchId:forfeitMatchId })).snapshot;
  forfeitVerified = forfeitSnapshot.phase === 'complete' && forfeitSnapshot.result?.kind === 'forfeit' && forfeitSnapshot.opponentLives === 0 && forfeitSnapshot.reward?.ratingDelta > 0;
  if (!forfeitVerified) throw new Error(`Forfeit did not award the remaining player: ${JSON.stringify(forfeitSnapshot)}`);
  const authHeaders = (index:number) => ({ Authorization:`Bearer ${users[index].idToken}` });
  const [progressA,progressB,titlesA,titlesB] = await Promise.all([
    jsonFetch(`${baseUrl}/api/progress`,{headers:authHeaders(0)}), jsonFetch(`${baseUrl}/api/progress`,{headers:authHeaders(1)}),
    jsonFetch(`${baseUrl}/api/titles`,{headers:authHeaders(0)}), jsonFetch(`${baseUrl}/api/titles`,{headers:authHeaders(1)}),
  ]);
  const ordered=[...requestTimes].sort((a,b)=>a-b); const percentile=(ratio:number)=>Math.round(ordered[Math.floor((ordered.length-1)*ratio)]);
  console.log(JSON.stringify({ completed, wins:{a:aWins,b:bWins}, forfeitVerified, idempotentAnswerRetries:retries, apiLatencyMs:{p50:percentile(.5),p95:percentile(.95),max:Math.round(ordered.at(-1) || 0)}, progress:{a:progressA.payload.progress,b:progressB.payload.progress}, titles:{a:titlesA.payload,b:titlesB.payload} },null,2));
} finally {
  await Promise.allSettled(users.map(user => jsonFetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${apiKey}`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({idToken:user.idToken}) })));
}
