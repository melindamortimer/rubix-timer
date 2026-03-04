// js/multiplayer-ui.js

import {
  createRoom, joinRoom, leaveRoom, onEvent, getRoomInfo,
  broadcastTimerUpdate, broadcastNewScramble, saveFinishTime,
  broadcastCountdownStart, broadcastCountdownTick,
} from './multiplayer.js';
import { applyScramble } from './cube-state.js';
import { updateCubeColors } from './cube-renderer.js';
import { formatTime, formatOrDash } from './utils.js';
import { calcBest, calcAvg } from './stats.js';

let isMultiplayerActive = false;
let myFinished = false;
let oppFinished = false;
let showNewScrambleRef = null;

// Countdown + ready state
let myReady = false;
let oppReady = false;
let countdownInterval = null;
let countdownActive = false;
let timerControl = null;

// Opponent local timer interpolation
let oppTimerStart = null;
let oppAnimFrame = null;

// In-memory stats
let mySolveTimes = [];
let oppSolveTimes = [];

const dom = {
  modal: document.getElementById('mp-modal'),
  modalBody: document.getElementById('mp-modal-body'),
  modalWaiting: document.getElementById('mp-waiting'),
  nameInput: document.getElementById('mp-name-input'),
  codeInput: document.getElementById('mp-code-input'),
  createBtn: document.getElementById('mp-create-btn'),
  joinBtn: document.getElementById('mp-join-btn'),
  closeBtn: document.getElementById('mp-modal-close'),
  roomCode: document.getElementById('mp-room-code'),
  copyLinkBtn: document.getElementById('mp-copy-link'),
  error: document.getElementById('mp-error'),
  multiplayerBtn: document.getElementById('multiplayer-btn'),
  // Split timer
  soloTimer: document.getElementById('solo-timer'),
  splitTimer: document.getElementById('split-timer'),
  splitNameYou: document.getElementById('split-name-you'),
  splitNameOpp: document.getElementById('split-name-opp'),
  splitDisplayYou: document.getElementById('split-display-you'),
  splitDisplayOpp: document.getElementById('split-display-opp'),
  splitStatusYou: document.getElementById('split-status-you'),
  splitStatusOpp: document.getElementById('split-status-opp'),
  splitStatsYou: document.getElementById('split-stats-you'),
  splitStatsOpp: document.getElementById('split-stats-opp'),
  // Countdown
  countdownOverlay: document.getElementById('countdown-overlay'),
  countdownText: document.getElementById('countdown-text'),
  // Existing elements we toggle
  statsPanel: document.getElementById('stats-panel'),
  sessionBar: document.getElementById('session-bar'),
  hint: document.getElementById('hint'),
  newRoundBtn: document.getElementById('new-round-btn'),
};

export function setTimerControl(control) {
  timerControl = control;
}

export function initMultiplayerUI(showNewScrambleFn) {
  showNewScrambleRef = showNewScrambleFn;

  // New Round button (P1 only)
  dom.newRoundBtn.addEventListener('click', async () => {
    const scramble = await broadcastNewScramble();
    if (scramble) {
      showNewScrambleFn(scramble.split(' '));
      resetRoundState();
    }
  });

  // Open modal
  dom.multiplayerBtn.addEventListener('click', () => {
    if (isMultiplayerActive) {
      handleLeave();
      return;
    }
    dom.modal.style.display = 'flex';
    dom.modalBody.style.display = '';
    dom.modalWaiting.style.display = 'none';
    dom.error.textContent = '';
  });

  // Close modal
  dom.closeBtn.addEventListener('click', () => {
    dom.modal.style.display = 'none';
  });

  dom.modal.addEventListener('click', (e) => {
    if (e.target === dom.modal) dom.modal.style.display = 'none';
  });

  // Create room
  dom.createBtn.addEventListener('click', async () => {
    const name = dom.nameInput.value.trim();
    if (!name) { dom.error.textContent = 'Enter your name'; return; }
    try {
      dom.error.textContent = '';
      const { code } = await createRoom(name);
      dom.modalBody.style.display = 'none';
      dom.modalWaiting.style.display = '';
      dom.roomCode.textContent = code;
    } catch (e) {
      dom.error.textContent = e.message;
    }
  });

  // Join room
  dom.joinBtn.addEventListener('click', async () => {
    const name = dom.nameInput.value.trim();
    const code = dom.codeInput.value.trim();
    if (!name) { dom.error.textContent = 'Enter your name'; return; }
    if (!code) { dom.error.textContent = 'Enter room code'; return; }
    try {
      dom.error.textContent = '';
      const { room } = await joinRoom(code, name);
      dom.modal.style.display = 'none';
      enterMultiplayerMode(name, room.player1_name, room.scramble);
    } catch (e) {
      dom.error.textContent = e.message;
    }
  });

  // Copy link
  dom.copyLinkBtn.addEventListener('click', () => {
    const code = dom.roomCode.textContent;
    const url = `${window.location.origin}${window.location.pathname}?room=${code}`;
    navigator.clipboard.writeText(url);
    dom.copyLinkBtn.textContent = 'Copied!';
    setTimeout(() => { dom.copyLinkBtn.textContent = 'Copy Link'; }, 2000);
  });

  // Realtime event handlers
  onEvent('onOpponentJoined', (payload) => {
    const { room } = getRoomInfo();
    dom.modal.style.display = 'none';
    const myName = dom.nameInput.value.trim();
    enterMultiplayerMode(myName, payload.name, room.scramble);
  });

  onEvent('onOpponentTimerUpdate', (payload) => {
    updateOpponentDisplay(payload);
    if (payload.state === 'ready') {
      oppReady = true;
      dom.splitStatusOpp.textContent = 'Ready!';
      checkBothReady();
    } else if (payload.state === 'mp-released') {
      handleOpponentReleased();
    }
    if (payload.state === 'stopped') {
      stopOppLocalTimer();
      oppFinished = true;
      oppSolveTimes.push(payload.elapsed);
      updateMultiplayerStats();
      checkBothFinished();
    }
  });

  onEvent('onNewScramble', (payload) => {
    const moves = payload.scramble.split(' ');
    showNewScrambleFn(moves);
    resetRoundState();
  });

  onEvent('onOpponentLeft', () => {
    dom.splitStatusOpp.textContent = 'Disconnected';
    dom.splitNameOpp.style.color = '#ff5252';
    clearCountdown();
    stopOppLocalTimer();
    setTimeout(() => {
      if (isMultiplayerActive && dom.splitStatusOpp.textContent === 'Disconnected') {
        handleLeave();
      }
    }, 5000);
  });

  onEvent('onCountdownStart', () => {
    countdownActive = true;
    showCountdownOverlay();
  });

  onEvent('onCountdownTick', ({ value }) => {
    updateCountdownDisplay(value);
    if (value === 0) {
      finishCountdown();
    }
  });

  // Check URL for room code on load
  const params = new URLSearchParams(window.location.search);
  const roomCode = params.get('room');
  if (roomCode) {
    dom.modal.style.display = 'flex';
    dom.codeInput.value = roomCode.toUpperCase();
    window.history.replaceState({}, '', window.location.pathname);
  }
}

// --- Countdown ---

function checkBothReady() {
  if (!myReady || !oppReady) return;
  const { playerNumber } = getRoomInfo();
  if (playerNumber === 1) {
    broadcastCountdownStart();
    startCountdown();
  }
}

function startCountdown() {
  countdownActive = true;
  showCountdownOverlay();
  let tick = 5;
  updateCountdownDisplay(tick);
  broadcastCountdownTick(tick);

  countdownInterval = setInterval(() => {
    tick--;
    broadcastCountdownTick(tick);
    updateCountdownDisplay(tick);
    if (tick === 0) {
      clearInterval(countdownInterval);
      countdownInterval = null;
      finishCountdown();
    }
  }, 1000);
}

function showCountdownOverlay() {
  dom.countdownOverlay.style.display = 'flex';
}

function updateCountdownDisplay(value) {
  if (value > 0) {
    dom.countdownText.textContent = value;
    dom.countdownText.style.color = '#ffd700';
  } else {
    dom.countdownText.textContent = 'GO!';
    dom.countdownText.style.color = '#00e676';
  }
}

function finishCountdown() {
  countdownActive = false;
  setTimeout(() => {
    dom.countdownOverlay.style.display = 'none';
    dom.countdownText.style.color = '#ffd700';
    if (timerControl) timerControl.forceStart();
    // Start local interpolation for opponent timer (both start at the same moment)
    startOppLocalTimer();
    dom.splitStatusYou.textContent = 'Solving...';
    dom.splitStatusOpp.textContent = 'Solving...';
  }, 500);
}

function cancelCountdownWithMessage(message) {
  clearCountdown();
  myReady = false;
  oppReady = false;
  // Flash the message briefly in both status fields
  dom.splitStatusYou.textContent = message;
  dom.splitStatusYou.style.color = '#ff5252';
  dom.splitStatusOpp.textContent = '';
  setTimeout(() => {
    dom.splitStatusYou.textContent = '';
    dom.splitStatusYou.style.color = '';
  }, 2000);
}

function handleOpponentReleased() {
  oppReady = false;
  if (countdownActive) {
    // P1 drives the countdown, so if we're P1 we need to stop the interval
    clearCountdown();
    myReady = false;
    if (timerControl) timerControl.resetToIdle();
    dom.splitStatusOpp.textContent = 'Released too early!';
    dom.splitStatusOpp.style.color = '#ff5252';
    dom.splitStatusYou.textContent = '';
    setTimeout(() => {
      dom.splitStatusOpp.textContent = '';
      dom.splitStatusOpp.style.color = '';
    }, 2000);
  } else {
    dom.splitStatusOpp.textContent = '';
  }
}

function clearCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  countdownActive = false;
  dom.countdownOverlay.style.display = 'none';
  dom.countdownText.style.color = '#ffd700';
}

// --- Opponent local timer interpolation ---

function startOppLocalTimer() {
  stopOppLocalTimer();
  oppTimerStart = performance.now();
  function tick() {
    const elapsed = performance.now() - oppTimerStart;
    dom.splitDisplayOpp.textContent = formatTime(elapsed);
    dom.splitDisplayOpp.style.color = '#ffffff';
    oppAnimFrame = requestAnimationFrame(tick);
  }
  tick();
}

function stopOppLocalTimer() {
  if (oppAnimFrame) {
    cancelAnimationFrame(oppAnimFrame);
    oppAnimFrame = null;
  }
  oppTimerStart = null;
}

// --- State change from app.js ---

export function handleMyStateChange(state) {
  if (state === 'ready') {
    myReady = true;
    dom.splitStatusYou.textContent = 'Ready!';
    checkBothReady();
  } else if (state === 'mp-released') {
    if (countdownActive) {
      // I released during countdown
      cancelCountdownWithMessage('Released too early!');
    } else {
      myReady = false;
      dom.splitStatusYou.textContent = '';
    }
  }
}

export function recordMySolve(elapsed) {
  mySolveTimes.push(elapsed);
  updateMultiplayerStats();
}

// --- Stats ---

function updateMultiplayerStats() {
  renderStatsInto(dom.splitStatsYou, mySolveTimes);
  renderStatsInto(dom.splitStatsOpp, oppSolveTimes);
}

function renderStatsInto(container, times) {
  if (times.length === 0) {
    container.innerHTML = '';
    return;
  }
  const solves = times.map(t => ({ time: t }));
  const best = calcBest(solves);
  const ao3 = calcAvg(solves, 3);
  const ao5 = calcAvg(solves, 5);

  container.innerHTML = `
    <div class="split-stat"><span class="split-stat-label">Best</span><span class="split-stat-value">${formatOrDash(best)}</span></div>
    <div class="split-stat"><span class="split-stat-label">Ao3</span><span class="split-stat-value">${formatOrDash(ao3)}</span></div>
    <div class="split-stat"><span class="split-stat-label">Ao5</span><span class="split-stat-value">${formatOrDash(ao5)}</span></div>
  `;
}

// --- Multiplayer mode lifecycle ---

function enterMultiplayerMode(myName, opponentName, scramble) {
  isMultiplayerActive = true;
  if (timerControl) timerControl.setMultiplayerMode(true);

  dom.multiplayerBtn.textContent = 'Leave';
  dom.multiplayerBtn.style.borderColor = '#ff5252';
  dom.multiplayerBtn.style.color = '#ff5252';

  dom.soloTimer.style.display = 'none';
  dom.splitTimer.style.display = 'flex';
  dom.statsPanel.style.display = 'none';
  dom.sessionBar.style.display = 'none';
  if (dom.hint) dom.hint.style.display = 'none';

  dom.splitNameYou.textContent = myName;
  dom.splitNameOpp.textContent = opponentName;
  dom.splitNameOpp.style.color = '';

  const moves = scramble.split(' ');
  updateCubeColors(applyScramble(moves));
}

function handleLeave() {
  leaveRoom();
  isMultiplayerActive = false;
  myFinished = false;
  oppFinished = false;
  myReady = false;
  oppReady = false;
  mySolveTimes = [];
  oppSolveTimes = [];
  clearCountdown();
  stopOppLocalTimer();
  if (timerControl) {
    timerControl.setMultiplayerMode(false);
    timerControl.resetToIdle();
  }

  dom.multiplayerBtn.textContent = '2P';
  dom.multiplayerBtn.style.borderColor = '';
  dom.multiplayerBtn.style.color = '';
  dom.newRoundBtn.style.display = 'none';
  dom.splitStatsYou.innerHTML = '';
  dom.splitStatsOpp.innerHTML = '';

  dom.soloTimer.style.display = '';
  dom.splitTimer.style.display = 'none';
  dom.statsPanel.style.display = '';
  dom.sessionBar.style.display = '';
}

function updateOpponentDisplay({ state, elapsed }) {
  if (state === 'stopped') {
    dom.splitDisplayOpp.textContent = formatTime(elapsed);
    dom.splitStatusOpp.textContent = 'Done!';
    dom.splitDisplayOpp.style.color = '#00e676';
  } else if (state === 'running') {
    // Local interpolation handles the display — ignore network updates
  } else if (state === 'holding') {
    dom.splitDisplayOpp.style.color = '#ffd700';
    dom.splitStatusOpp.textContent = '';
  } else if (state === 'ready') {
    dom.splitDisplayOpp.style.color = '#00e676';
    // Status set in onOpponentTimerUpdate handler
  } else if (state === 'mp-released') {
    dom.splitDisplayOpp.style.color = '#ffffff';
    // Status set in handleOpponentReleased
  } else {
    dom.splitDisplayOpp.style.color = '#ffffff';
    dom.splitStatusOpp.textContent = '';
  }
}

function resetRoundState() {
  myFinished = false;
  oppFinished = false;
  myReady = false;
  oppReady = false;
  stopOppLocalTimer();
  dom.newRoundBtn.style.display = 'none';
  dom.splitDisplayYou.textContent = '0.00';
  dom.splitDisplayYou.style.color = '#ffffff';
  dom.splitDisplayOpp.textContent = '0.00';
  dom.splitDisplayOpp.style.color = '#ffffff';
  dom.splitStatusYou.textContent = '';
  dom.splitStatusYou.style.color = '';
  dom.splitStatusOpp.textContent = '';
  dom.splitStatusOpp.style.color = '';
  if (timerControl) timerControl.resetToIdle();
}

function checkBothFinished() {
  if (myFinished && oppFinished) {
    const { playerNumber } = getRoomInfo();
    if (playerNumber === 1) {
      dom.newRoundBtn.style.display = '';
    }
  }
}

export function markMyFinished() {
  myFinished = true;
  checkBothFinished();
}

export function isMultiplayer() {
  return isMultiplayerActive;
}

export { broadcastTimerUpdate, broadcastNewScramble, saveFinishTime };
