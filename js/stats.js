export function calcBest(solves) {
  if (solves.length === 0) return null;
  return solves.reduce((min, s) => s.time < min ? s.time : min, solves[0].time);
}

export function calcAvg(solves, count) {
  if (solves.length < count) return null;
  const recent = solves.slice(0, count).map(s => s.time);
  if (count <= 3) {
    return recent.reduce((a, b) => a + b, 0) / count;
  }
  recent.sort((a, b) => a - b);
  const trimmed = recent.slice(1, -1);
  return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
}

export function getVsBestColor(diffMs) {
  if (diffMs <= 0) return '#00e676';
  if (diffMs <= 500) return '#00e676';
  if (diffMs >= 3000) return '#ff5252';
  return '#888';
}
