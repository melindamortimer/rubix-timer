import { formatOrDash, formatDelta, formatTime } from './utils.js';
import { generateScramble } from './scramble.js';
import { applyScramble } from './cube-state.js';
import { initCubeRenderer, updateCubeColors } from './cube-renderer.js';
import {
  addSolve, deleteSolve, loadSolves, saveSolves,
  loadSessionMeta, getActiveSession, setActiveSession,
  createSession, renameSession, deleteSession,
  getSessionSolves, migrateData
} from './storage.js';
import { calcBest, calcAvg, getVsBestColor } from './stats.js';
import { renderSpeedChart } from './chart.js';
import { renderHistoryList, exportSolves, importSolves } from './history.js';
import { initTimer } from './timer.js';
import { initMultiplayerUI, isMultiplayer, broadcastTimerUpdate, broadcastNewScramble, saveFinishTime, markMyFinished, setTimerControl, handleMyStateChange, recordMySolve } from './multiplayer-ui.js';

// === DOM References ===

const dom = {
  scrambleText: document.getElementById('scramble-text'),
  timerDisplay: document.getElementById('timer-display'),
  vsBest: document.getElementById('vs-best'),
  hint: document.getElementById('hint'),
  statBest: document.getElementById('stat-best'),
  statAo3: document.getElementById('stat-ao3'),
  statAo5: document.getElementById('stat-ao5'),
  statAo12: document.getElementById('stat-ao12'),
  historyList: document.getElementById('history-list'),
  sessionSelect: document.getElementById('session-select'),
  sessionToday: document.getElementById('session-today'),
  chartCanvas: document.getElementById('speed-chart'),
  chartContainer: document.getElementById('speed-chart-container'),
  importFile: document.getElementById('import-file'),
  cubeScene: document.getElementById('cube-scene'),
  splitDisplayYou: document.getElementById('split-display-you'),
  splitStatusYou: document.getElementById('split-status-you'),
};

initCubeRenderer(dom.cubeScene);

// === Scramble Display ===

function showNewScramble(presetMoves) {
  const moves = presetMoves || generateScramble();
  dom.scrambleText.innerHTML = moves
    .map(m => `<span class="scramble-move">${m}</span>`)
    .join('');
  updateCubeColors(applyScramble(moves));
}

function getCurrentScrambleText() {
  return [...dom.scrambleText.querySelectorAll('.scramble-move')]
    .map(el => el.textContent)
    .join(' ');
}

// === UI Updates ===

function updateHintVisibility() {
  if (dom.hint) {
    dom.hint.style.display = getSessionSolves().length > 0 ? 'none' : '';
  }
}

function updateStatValues(solves) {
  const best = calcBest(solves);
  const ao3 = calcAvg(solves, 3);
  const ao5 = calcAvg(solves, 5);
  const ao12 = calcAvg(solves, 12);

  dom.statBest.textContent = formatOrDash(best);
  dom.statAo3.textContent = formatOrDash(ao3);
  dom.statAo5.textContent = formatOrDash(ao5);
  dom.statAo12.textContent = formatOrDash(ao12);

  return { best, ao3, ao5, ao12 };
}

function updateVsBest(solves) {
  if (solves.length <= 1) {
    dom.vsBest.textContent = '';
    return;
  }

  const previousBest = calcBest(solves.slice(1));
  const delta = formatDelta(solves[0].time, previousBest);

  if (!delta) {
    dom.vsBest.textContent = '';
    return;
  }

  dom.vsBest.textContent = 'vs best: ' + delta.text;
  dom.vsBest.style.color = delta.diff === 0 ? '#ffd700' : getVsBestColor(delta.diff);
}

function renderStats() {
  const solves = getSessionSolves();
  const { ao3, ao5 } = updateStatValues(solves);
  updateVsBest(solves);
  renderSpeedChart(solves, dom.chartCanvas, dom.chartContainer);
  renderHistoryList(dom.historyList, solves, ao3, ao5);
}

function renderSessionBar() {
  const meta = loadSessionMeta();
  dom.sessionSelect.innerHTML = '';
  meta.sessions.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    if (name === meta.activeSession) opt.selected = true;
    dom.sessionSelect.appendChild(opt);
  });

  const today = new Date().toISOString().slice(0, 10);
  const todayCount = getSessionSolves().filter(s => s.date.slice(0, 10) === today).length;
  dom.sessionToday.textContent = todayCount > 0 ? `Today: ${todayCount}` : '';
}

function refreshAll() {
  renderSessionBar();
  renderStats();
  updateHintVisibility();
}

// === Timer Integration ===

let lastBroadcast = 0;
const BROADCAST_INTERVAL = 100; // ms — throttle to ~10 updates/sec

const timerControl = initTimer(dom.timerDisplay, {
  getScrambleText: getCurrentScrambleText,
  onStop(elapsed, scramble) {
    if (isMultiplayer()) {
      saveFinishTime(elapsed);
      dom.splitDisplayYou.textContent = formatTime(elapsed);
      dom.splitStatusYou.textContent = 'Done!';
      dom.splitDisplayYou.style.color = '#00e676';
      recordMySolve(elapsed);
      markMyFinished();
    } else {
      showNewScramble();
      addSolve(elapsed, scramble);
      renderStats();
      renderSessionBar();
      if (dom.hint) dom.hint.style.display = 'none';
    }
  },
  onStateChange(state, elapsed) {
    if (!isMultiplayer()) return;
    if (state === 'ready' || state === 'mp-released') {
      handleMyStateChange(state);
      broadcastTimerUpdate(state, elapsed);
      return;
    }
    const now = performance.now();
    if (state === 'running' && now - lastBroadcast < BROADCAST_INTERVAL) return;
    lastBroadcast = now;
    broadcastTimerUpdate(state, elapsed);
    if (state === 'running' || state === 'holding') {
      dom.splitDisplayYou.textContent = formatTime(elapsed);
    }
  }
});
setTimerControl(timerControl);

// === Event Listeners ===

dom.historyList.addEventListener('click', (e) => {
  const btn = e.target.closest('.history-delete');
  if (btn) {
    deleteSolve(btn.dataset.id);
    renderStats();
  }
});

document.getElementById('export-btn').addEventListener('click', exportSolves);

document.getElementById('import-btn').addEventListener('click', () => {
  dom.importFile.click();
});

dom.importFile.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) importSolves(file, refreshAll);
  e.target.value = '';
});

document.getElementById('clear-all-btn').addEventListener('click', () => {
  if (confirm('Delete all solves in this session?')) {
    const solves = loadSolves().filter(s => s.session !== getActiveSession());
    saveSolves(solves);
    renderStats();
  }
});

dom.sessionSelect.addEventListener('change', (e) => {
  setActiveSession(e.target.value);
  refreshAll();
});

document.getElementById('session-add').addEventListener('click', () => {
  const name = prompt('Session name:');
  if (name && name.trim()) {
    createSession(name.trim());
    refreshAll();
  }
});

document.getElementById('session-rename').addEventListener('click', () => {
  const current = getActiveSession();
  const name = prompt('Rename session:', current);
  if (name && name.trim() && name.trim() !== current) {
    renameSession(current, name.trim());
    refreshAll();
  }
});

document.getElementById('session-delete').addEventListener('click', () => {
  const current = getActiveSession();
  if (confirm(`Delete session "${current}" and all its solves?`)) {
    deleteSession(current);
    refreshAll();
  }
});

document.addEventListener('mouseup', (e) => {
  if (e.target.tagName === 'BUTTON') e.target.blur();
});

// Cube panel toggle
const cubePanel = document.getElementById('cube-panel');
const cubeToggle = document.getElementById('cube-toggle');
cubeToggle.addEventListener('click', () => {
  cubePanel.classList.toggle('collapsed');
  cubeToggle.innerHTML = cubePanel.classList.contains('collapsed') ? '&#x25B6;' : '&#x25C0;';
});

// Expose for the inline onclick in HTML
window.showNewScramble = async () => {
  if (isMultiplayer()) {
    const scramble = await broadcastNewScramble();
    if (scramble) showNewScramble(scramble.split(' '));
  } else {
    showNewScramble();
  }
};

// === Initialization ===

migrateData();
showNewScramble();
renderStats();
renderSessionBar();
updateHintVisibility();
initMultiplayerUI(showNewScramble);
