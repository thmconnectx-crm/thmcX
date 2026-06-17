export function isWithinWindow(now: Date, start: string, end: string, timezone: string = "America/Sao_Paulo") {
  const current = now.toLocaleTimeString("pt-BR", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  return current >= start.slice(0, 5) && current <= end.slice(0, 5);
}

export function randomDelayMs(minSeconds: number, maxSeconds: number) {
  const min = Math.max(1, minSeconds);
  const max = Math.max(min, maxSeconds);
  const seconds = Math.floor(Math.random() * (max - min + 1)) + min;
  return seconds * 1000;
}

export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}
