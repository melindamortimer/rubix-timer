const STORAGE_KEYS = {
  solves: 'rubix-timer-solves',
  sessions: 'rubix-timer-sessions',
};

const DEFAULT_SESSION_META = { sessions: ['Default'], activeSession: 'Default' };

function loadJSON(key, fallback) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch {
    return fallback;
  }
}

export function loadSolves() {
  return loadJSON(STORAGE_KEYS.solves, []);
}

export function saveSolves(solves) {
  localStorage.setItem(STORAGE_KEYS.solves, JSON.stringify(solves));
}

export function addSolve(time, scramble) {
  const solves = loadSolves();
  solves.unshift({
    id: crypto.randomUUID(),
    time: Math.round(time),
    scramble,
    date: new Date().toISOString(),
    session: getActiveSession()
  });
  saveSolves(solves);
  return solves;
}

export function deleteSolve(id) {
  const solves = loadSolves().filter(s => s.id !== id);
  saveSolves(solves);
  return solves;
}

// === Session Management ===

export function loadSessionMeta() {
  return loadJSON(STORAGE_KEYS.sessions, { ...DEFAULT_SESSION_META });
}

export function saveSessionMeta(meta) {
  localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(meta));
}

export function getActiveSession() {
  return loadSessionMeta().activeSession;
}

export function setActiveSession(name) {
  const meta = loadSessionMeta();
  meta.activeSession = name;
  saveSessionMeta(meta);
}

export function createSession(name) {
  const meta = loadSessionMeta();
  if (!meta.sessions.includes(name)) {
    meta.sessions.push(name);
  }
  meta.activeSession = name;
  saveSessionMeta(meta);
}

export function renameSession(oldName, newName) {
  const meta = loadSessionMeta();
  const idx = meta.sessions.indexOf(oldName);
  if (idx !== -1) meta.sessions[idx] = newName;
  if (meta.activeSession === oldName) meta.activeSession = newName;
  saveSessionMeta(meta);

  const solves = loadSolves();
  solves.forEach(s => { if (s.session === oldName) s.session = newName; });
  saveSolves(solves);
}

export function deleteSession(name) {
  const meta = loadSessionMeta();
  meta.sessions = meta.sessions.filter(s => s !== name);
  if (meta.sessions.length === 0) meta.sessions = ['Default'];
  if (meta.activeSession === name) meta.activeSession = meta.sessions[0];
  saveSessionMeta(meta);

  const solves = loadSolves().filter(s => s.session !== name);
  saveSolves(solves);
}

export function getSessionSolves() {
  return loadSolves().filter(s => s.session === getActiveSession());
}

export function migrateData() {
  const solves = loadSolves();
  if (solves.length > 0 && solves[0].session === undefined) {
    solves.forEach(s => { s.session = 'Default'; });
    saveSolves(solves);
  }
  saveSessionMeta(loadSessionMeta());
}
