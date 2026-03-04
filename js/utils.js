export function formatTime(ms) {
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) {
    return totalSeconds.toFixed(2);
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(2).padStart(5, '0');
  return minutes + ':' + seconds;
}

export function formatOrDash(value) {
  return value !== null ? formatTime(value) : '\u2014';
}

export function formatDateHeader(dateStr) {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const dStr = date.toISOString().slice(0, 10);
  const tStr = today.toISOString().slice(0, 10);
  const yStr = yesterday.toISOString().slice(0, 10);

  if (dStr === tStr) return 'Today';
  if (dStr === yStr) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatDelta(solveTime, reference) {
  if (reference === null) return null;
  const diff = solveTime - reference;
  return { text: (diff >= 0 ? '+' : '') + (diff / 1000).toFixed(2), diff };
}
