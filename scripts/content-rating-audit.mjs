import { readFile } from 'node:fs/promises';

const season = JSON.parse(await readFile(
  new URL('../data/seasons/S2-2026/questions.ko.json', import.meta.url),
  'utf8',
));

const patterns = {
  violenceOrCrime: /전쟁|살인|폭력|테러|암살|사형|범죄|총격|총기|폭탄|죽음|사망|복수|처형|학살/,
  gambling: /도박|카지노|타짜|베팅/,
  controlledSubstances: /마약|대마초|코카인|헤로인|필로폰/,
  alcoholOrTobacco: /담배|흡연|주류|소주|맥주|(?<![가-힣])와인|알코올/,
  sexualContent: /성폭력|성범죄|강간|성매매|나체|누드|성행위/,
  profanity: /씨발|시발|개새끼|병신|좆|fuck|shit/i,
  fearOrHorror: /공포|흡혈귀|괴물|악마|좀비|귀신|저주/,
};

const questions = season.questions.filter(
  question => question.enabledInSeason && question.qaStatus !== 'REJECT',
);

const results = Object.fromEntries(Object.entries(patterns).map(([name, pattern]) => {
  const matches = questions
    .filter(question => pattern.test([
      question.questionText,
      question.canonicalAnswer,
      question.explanation,
      ...(question.acceptedAliases || []),
    ].filter(Boolean).join(' ')))
    .map(question => ({
      questionId: question.questionId,
      questionText: question.questionText,
    }));
  return [name, { count: matches.length, examples: matches.slice(0, 10) }];
}));

console.log(JSON.stringify({
  auditedQuestions: questions.length,
  note: 'Keyword hits require human context review; a hit is not automatically a rating declaration.',
  results,
}, null, 2));
