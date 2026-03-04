// js/multiplayer-ui.js

import {
  createRoom, joinRoom, leaveRoom, onEvent, getRoomInfo,
  broadcastTimerUpdate, broadcastNewScramble, saveFinishTime,
} from './multiplayer.js';
import { applyScramble } from './cube-state.js';
import { updateCubeColors } from './cube-renderer.js';
import { formatTime } from './utils.js';

let isMultiplayerActive = false;
let myFinished = false;
let oppFinished = false;
let showNewScrambleRef = null;

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
  // Existing elements we toggle
  statsPanel: document.getElementById('stats-panel'),
  sessionBar: document.getElementById('session-bar'),
  hint: document.getElementById('hint'),
  newRoundBtn: document.getElementById('new-round-btn'),
};

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
    if (payload.state === 'stopped') {
      oppFinished = true;
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
    // Auto-return to solo after 5 seconds
    setTimeout(() => {
      if (isMultiplayerActive && dom.splitStatusOpp.textContent === 'Disconnected') {
        handleLeave();
      }
    }, 5000);
  });

  // Check URL for room code on load
  const params = new URLSearchParams(window.location.search);
  const roomCode = params.get('room');
  if (roomCode) {
    dom.modal.style.display = 'flex';
    dom.codeInput.value = roomCode.toUpperCase();
    // Clear the URL param
    window.history.replaceState({}, '', window.location.pathname);
  }
}

function enterMultiplayerMode(myName, opponentName, scramble) {
  isMultiplayerActive = true;
  dom.multiplayerBtn.textContent = 'Leave';
  dom.multiplayerBtn.style.borderColor = '#ff5252';
  dom.multiplayerBtn.style.color = '#ff5252';

  // Switch to split layout
  dom.soloTimer.style.display = 'none';
  dom.splitTimer.style.display = 'flex';
  dom.statsPanel.style.display = 'none';
  dom.sessionBar.style.display = 'none';
  if (dom.hint) dom.hint.style.display = 'none';

  // Set names
  dom.splitNameYou.textContent = myName;
  dom.splitNameOpp.textContent = opponentName;
  dom.splitNameOpp.style.color = '';

  // Apply the shared scramble
  const moves = scramble.split(' ');
  updateCubeColors(applyScramble(moves));
}

function handleLeave() {
  leaveRoom();
  isMultiplayerActive = false;
  myFinished = false;
  oppFinished = false;
  dom.multiplayerBtn.textContent = '2P';
  dom.multiplayerBtn.style.borderColor = '';
  dom.multiplayerBtn.style.color = '';
  dom.newRoundBtn.style.display = 'none';

  // Restore solo layout
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
    dom.splitDisplayOpp.textContent = formatTime(elapsed);
    dom.splitDisplayOpp.style.color = '#ffffff';
    dom.splitStatusOpp.textContent = 'Solving...';
  } else if (state === 'holding') {
    dom.splitDisplayOpp.style.color = '#ffd700';
    dom.splitStatusOpp.textContent = '';
  } else if (state === 'ready') {
    dom.splitDisplayOpp.style.color = '#00e676';
    dom.splitStatusOpp.textContent = '';
  } else {
    dom.splitDisplayOpp.style.color = '#ffffff';
    dom.splitStatusOpp.textContent = '';
  }
}

function resetRoundState() {
  myFinished = false;
  oppFinished = false;
  dom.newRoundBtn.style.display = 'none';
  dom.splitDisplayYou.textContent = '0.00';
  dom.splitDisplayYou.style.color = '#ffffff';
  dom.splitDisplayOpp.textContent = '0.00';
  dom.splitDisplayOpp.style.color = '#ffffff';
  dom.splitStatusYou.textContent = '';
  dom.splitStatusOpp.textContent = '';
}

function checkBothFinished() {
  if (myFinished && oppFinished) {
    const { playerNumber } = getRoomInfo();
    // Only P1 (room creator) can trigger new round
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
