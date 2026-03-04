import { formatTime } from './utils.js';

let timerState = 'idle';
let holdTimeout = null;
let startTime = 0;
let elapsed = 0;
let animationFrame = null;
let currentScramble = '';

export function initTimer(timerDisplay, { getScrambleText, onStop }) {
  function handleInputDown() {
    if (timerState === 'running') {
      stopTimer();
    } else if (timerState === 'idle' || timerState === 'stopped') {
      startHolding();
    }
  }

  function handleInputUp() {
    if (timerState === 'holding') {
      cancelHolding();
    } else if (timerState === 'ready') {
      startTimerRun();
    }
  }

  function startHolding() {
    timerDisplay.textContent = '0.00';
    timerState = 'holding';
    timerDisplay.style.color = '#ffd700';
    holdTimeout = setTimeout(() => {
      timerState = 'ready';
      timerDisplay.style.color = '#00e676';
    }, 300);
  }

  function cancelHolding() {
    clearTimeout(holdTimeout);
    timerState = 'idle';
    timerDisplay.style.color = '#ffffff';
  }

  function startTimerRun() {
    timerState = 'running';
    timerDisplay.style.color = '#ffffff';
    currentScramble = getScrambleText();
    startTime = performance.now();
    updateDisplay();
  }

  function stopTimer() {
    timerState = 'stopped';
    elapsed = Math.round(performance.now() - startTime);
    cancelAnimationFrame(animationFrame);
    timerDisplay.textContent = formatTime(elapsed);
    timerDisplay.style.color = '#ffffff';
    onStop(elapsed, currentScramble);
  }

  function updateDisplay() {
    if (timerState !== 'running') return;
    elapsed = performance.now() - startTime;
    timerDisplay.textContent = formatTime(elapsed);
    animationFrame = requestAnimationFrame(updateDisplay);
  }

  // Keyboard
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space') return;
    e.preventDefault();
    if (!e.repeat) handleInputDown();
  });

  document.addEventListener('keyup', (e) => {
    if (e.code !== 'Space') return;
    e.preventDefault();
    handleInputUp();
  });

  // Touch
  timerDisplay.addEventListener('touchstart', (e) => {
    e.preventDefault();
    handleInputDown();
  });

  timerDisplay.addEventListener('touchend', (e) => {
    e.preventDefault();
    handleInputUp();
  });
}
