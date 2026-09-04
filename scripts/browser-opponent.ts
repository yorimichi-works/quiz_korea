import { readFile } from 'node:fs/promises';

const baseUrl = process.env.MEONJEO_TEST_URL || 'https://meonjeo.syamo.chatgpt.site';
const buzzDelayMs = Math.max(0, Number(process.env.MEONJEO_BOT_BUZZ_DELAY_MS) || 0);
const passive = process.env.MEONJEO_BOT_PASSIVE === '1';
const apiKey = 'AIzaSyAFNxcPTqD8LK6IWXlygncDoaUFRAdb6sQ';
const season = JSON.parse(await readFile(new URL('../data/seasons/S1-2026/questions.ko.json', import.meta.url), 'utf8'));
const answers = new Map<string, string>(season.questions
  .filter((question: { enabledInSeason:boolean; qaStatus:string }) => question.enabledInSeason && question.qaStatus !== 'REJECT')
  .map((question: { questionText:string; canonicalAnswer:string }) => [question.questionText, question.canonicalAnswer]));
const sleep = (ms:number) => new Promise(resolve => setTimeout(resolve, ms));
type Snapshot = {
  status?:string; phase?:string; myScore?:number; opponentScore?:number; reward?:unknown;
  questionToken?:string; questionIndex?:number; question?:{ text?:string };
};

async function jsonFetch(url:string, options:RequestInit = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(payload)}`);
  return payload;
}

let idToken = '';
try {
  const signup = await jsonFetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:'{"returnSecureToken":true}',
  });
  idToken = String(signup.idToken || '');
  const session = await jsonFetch(`${baseUrl}/api/realtime?action=session`, {
    method:'POST', headers:{Authorization:`Bearer ${idToken}`,'Content-Type':'application/json'}, body:'{}',
  });
  const headers = {Authorization:`Meonjeo ${String(session.sessionToken)}`,'Content-Type':'application/json'};
  const realtime = (action:string, body:Record<string,unknown>) => jsonFetch(`${baseUrl}/api/realtime?action=${action}`, {
    method:'POST', headers, body:JSON.stringify(body),
  });

  let join = await realtime('join', {source:'rated'});
  for (let attempt=0; !join.matchId && attempt<120; attempt+=1) {
    await sleep(500);
    join = await realtime('join', {source:'rated'});
  }
  const matchId = String(join.matchId || '');
  if (!matchId) throw new Error('No match formed within 60 seconds');
  console.log(JSON.stringify({event:'matched',matchId}));

  let lastToken = '';
  while (true) {
    const result = await realtime('snapshot', {matchId});
    const snapshot = result.snapshot as Snapshot;
    if (snapshot.status === 'complete' || snapshot.phase === 'complete' || snapshot.phase === 'cancelled') {
      console.log(JSON.stringify({event:'finished',phase:snapshot.phase,myScore:snapshot.myScore,opponentScore:snapshot.opponentScore,reward:snapshot.reward || null}));
      break;
    }
    if (snapshot.phase === 'open' && snapshot.questionToken !== lastToken) {
      lastToken = String(snapshot.questionToken);
      const answer = answers.get(String(snapshot.question?.text || ''));
      if (!answer) throw new Error(`Missing answer for ${String(snapshot.question?.text || '')}`);
      console.log(JSON.stringify({event:'question',round:Number(snapshot.questionIndex)+1,text:snapshot.question?.text,answer,buzzDelayMs,passive}));
      if (passive) {
        await sleep(250);
        continue;
      }
      if (buzzDelayMs) await sleep(buzzDelayMs);
      const buzz = await realtime('buzz', {matchId,questionToken:snapshot.questionToken,buzzId:crypto.randomUUID(),clientSequence:snapshot.questionIndex + 1});
      const buzzSnapshot = buzz.snapshot as Snapshot & { buzzWinner?:string };
      if (buzzSnapshot?.buzzWinner === 'me') {
        await realtime('answer', {matchId,answerId:crypto.randomUUID(),answer});
        console.log(JSON.stringify({event:'answered',round:Number(snapshot.questionIndex)+1,answer}));
      }
    }
    await sleep(snapshot.phase === 'result' ? 250 : 100);
  }
} finally {
  if (idToken) {
    await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${apiKey}`, {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({idToken}),
    }).catch(() => null);
  }
}
