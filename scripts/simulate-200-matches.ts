import { ratingDelta } from '../lib/rating.ts';

let seed = 20260904;
const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
let ratingA = 1248; let ratingB = 1248; let winsA = 0; let winsB = 0; let rankA = 0; let rankB = 0;
const deltas:number[] = []; const rtts:number[] = []; const waits:number[] = [];
for (let match = 0; match < 200; match += 1) {
  const rttA = Math.round(24 + random() * 130); const rttB = Math.round(24 + random() * 130);
  const wait = Math.round(150 + random() * 850); rtts.push(rttA,rttB); waits.push(wait);
  const aWon = random() < 0.55;
  const delta = ratingDelta(ratingA,ratingB,aWon ? 1 : 0);
  ratingA += delta; ratingB -= delta; deltas.push(Math.abs(delta));
  if (aWon) { winsA += 1; rankA += 100; } else { winsB += 1; rankB += 100; }
}
const percentile = (values:number[], ratio:number) => [...values].sort((a,b)=>a-b)[Math.floor((values.length-1)*ratio)];
const rankLabel = (points:number) => { let rest=points; for (const [tier,need] of [['D',1000],['C',1500],['B',2500],['A',4000],['AA',6000]] as const) for (const mark of ['−','','＋']) { if (rest < need) return `${tier}${mark}`; rest -= need; } return `Master ${Math.floor(rest/10000)+1}`; };
console.log(JSON.stringify({ matches:200, assumedSkill:{ aWinRate:0.55 }, wins:{ a:winsA,b:winsB }, rating:{ a:ratingA,b:ratingB,total:ratingA+ratingB,averageDelta:Number((deltas.reduce((a,b)=>a+b,0)/deltas.length).toFixed(1)) }, rankPoints:{ a:rankA,b:rankB,rankA:rankLabel(rankA),rankB:rankLabel(rankB) }, network:{ medianRttMs:percentile(rtts,.5),p95RttMs:percentile(rtts,.95),medianQueueWaitMs:percentile(waits,.5),p95QueueWaitMs:percentile(waits,.95) } }, null, 2));
