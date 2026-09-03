export type QuizTimePhase = 'hidden' | 'upcoming' | 'startingSoon' | 'live' | 'endedToday' | 'disabled';

export type QuizTimeConfig = {
  enabled: boolean;
  eventId: string;
  timezone: string;
  startLocalTime: string;
  endLocalTime: string;
  startingSoonMinutes: number;
  showAllDay: boolean;
  copyVersion: number;
};

export const DEFAULT_QUIZ_TIME_CONFIG: QuizTimeConfig = {
  enabled: true,
  eventId: 'daily_quiz_time',
  timezone: 'Asia/Seoul',
  startLocalTime: '21:00',
  endLocalTime: '22:00',
  startingSoonMinutes: 30,
  showAllDay: true,
  copyVersion: 1,
};

function localParts(at: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(at);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    year: Number(values.year), month: Number(values.month), day: Number(values.day),
    hour: Number(values.hour), minute: Number(values.minute), second: Number(values.second),
    dateKey: `${values.year}-${values.month}-${values.day}`,
  };
}

function minutesOf(time: string) {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function zonedInstant(year: number, month: number, day: number, time: string, timezone: string) {
  const [hour, minute] = time.split(':').map(Number);
  let guess = Date.UTC(year, month - 1, day, hour, minute);
  for (let index = 0; index < 3; index += 1) {
    const seen = localParts(new Date(guess), timezone);
    const seenAsUtc = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute, seen.second);
    guess -= seenAsUtc - Date.UTC(year, month - 1, day, hour, minute);
  }
  return guess;
}

export function getQuizTimeState(config: QuizTimeConfig, nowMs = Date.now()) {
  if (!config.enabled) return { phase: 'disabled' as QuizTimePhase, dateKey: '', serverNow: nowMs, nextStartAt: null, currentEndAt: null, remainingMs: 0 };
  const now = localParts(new Date(nowMs), config.timezone);
  const minuteNow = now.hour * 60 + now.minute + now.second / 60;
  const startMinute = minutesOf(config.startLocalTime);
  const endMinute = minutesOf(config.endLocalTime);
  const startAt = zonedInstant(now.year, now.month, now.day, config.startLocalTime, config.timezone);
  const endAt = zonedInstant(now.year, now.month, now.day, config.endLocalTime, config.timezone);
  const tomorrow = new Date(Date.UTC(now.year, now.month - 1, now.day) + 86400000);
  const nextDayStart = zonedInstant(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth() + 1, tomorrow.getUTCDate(), config.startLocalTime, config.timezone);
  let phase: QuizTimePhase;
  if (minuteNow >= startMinute && minuteNow < endMinute) phase = 'live';
  else if (minuteNow >= startMinute - config.startingSoonMinutes && minuteNow < startMinute) phase = 'startingSoon';
  else if (minuteNow >= endMinute) phase = config.showAllDay ? 'endedToday' : 'hidden';
  else phase = config.showAllDay ? 'upcoming' : 'hidden';
  const nextStartAt = minuteNow < startMinute ? startAt : nextDayStart;
  const target = phase === 'live' ? endAt : nextStartAt;
  return { phase, dateKey: now.dateKey, serverNow: nowMs, nextStartAt, currentEndAt: phase === 'live' ? endAt : null, remainingMs: Math.max(0, target - nowMs) };
}
