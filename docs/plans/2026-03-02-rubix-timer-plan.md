# Rubik's Cube Timer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a single-file HTML Rubik's cube speedsolving timer with scramble generation, stackmat-style input, statistics, and solve history.

**Architecture:** Single `index.html` with inline CSS and JS. Three visual zones (scramble bar, timer, stats/history). State machine for timer (IDLE → HOLDING → READY → RUNNING → STOPPED). localStorage for persistence.

**Tech Stack:** Vanilla HTML/CSS/JS, no dependencies.

**Design doc:** `docs/plans/2026-03-02-rubix-timer-design.md`

---

### Task 1: HTML skeleton + dark theme CSS

**Files:**
- Create: `index.html`

**Step 1: Create the base HTML with all structural elements and dark theme styling**

Write `index.html` with:
- DOCTYPE, meta viewport, title "Rubik's Timer"
- `<style>` block with dark theme:
  - `body`: `background: #1a1a2e`, `color: #e0e0e0`, `font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`, `margin: 0`, `height: 100vh`, `display: flex`, `flex-direction: column`
  - Container: max-width 800px, centered, full height, flex column
- Three zones as empty containers:
  - `#scramble-bar`: top, padding, centered text, `font-family: monospace`, `font-size: 1.1rem`, `min-height: 60px`
  - `#timer-display`: flex-grow center, massive monospace font (`clamp(4rem, 15vw, 8rem)`), centered, `user-select: none`
  - `#stats-panel`: bottom section, flex column, `max-height: 45vh`, `overflow: hidden`
- Placeholder text in each zone: scramble bar says "Scramble here", timer says "0.00", stats panel says "Stats here"

**Step 2: Verify by opening in browser**

Open `index.html` in browser. Confirm:
- Dark background, light text
- Three zones visible, timer is large and centered
- Responsive — shrink window, timer font scales down

---

### Task 2: Scramble generator

**Files:**
- Modify: `index.html` (add JS inside `<script>` at bottom of body)

**Step 1: Implement the scramble generator function**

Add a `<script>` block at the end of `<body>`. Write:

```javascript
function generateScramble() {
  const faces = ['R', 'L', 'U', 'D', 'F', 'B'];
  const modifiers = ['', "'", '2'];
  const axes = { R: 0, L: 0, U: 1, D: 1, F: 2, B: 2 };
  const moves = [];
  let lastFace = '', lastAxis = -1;

  for (let i = 0; i < 20; i++) {
    let face;
    do {
      face = faces[Math.floor(Math.random() * faces.length)];
    } while (face === lastFace || (axes[face] === lastAxis && moves.length > 0));

    const mod = modifiers[Math.floor(Math.random() * modifiers.length)];
    moves.push(face + mod);
    lastAxis = axes[face];
    lastFace = face;
  }
  return moves.join(' ');
}
```

**Step 2: Wire scramble to the scramble bar**

```javascript
const scrambleBar = document.getElementById('scramble-bar');

function showNewScramble() {
  scrambleBar.textContent = generateScramble();
}

showNewScramble();
```

**Step 3: Add a "new scramble" button**

Update the `#scramble-bar` HTML to include a refresh button (small, subtle, right side). Use a unicode refresh icon ↻. On click, call `showNewScramble()`.

**Step 4: Verify**

Open in browser. Confirm:
- A 20-move scramble appears on load
- No consecutive same-face or same-axis moves
- Clicking refresh generates a new scramble

---

### Task 3: Timer state machine + display

**Files:**
- Modify: `index.html` (extend JS)

**Step 1: Implement the timer state machine**

Add timer state variables and core logic:

```javascript
let timerState = 'idle'; // idle, holding, ready, running, stopped
let holdTimeout = null;
let startTime = 0;
let elapsed = 0;
let animationFrame = null;
let currentScramble = '';

const timerDisplay = document.getElementById('timer-display');
```

**Step 2: Implement spacebar hold-release logic**

```javascript
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    if (e.repeat) return;

    if (timerState === 'running') {
      stopTimer();
    } else if (timerState === 'idle' || timerState === 'stopped') {
      startHolding();
    }
  }
});

document.addEventListener('keyup', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    if (timerState === 'holding') {
      cancelHolding();
    } else if (timerState === 'ready') {
      startTimer();
    }
  }
});
```

**Step 3: Implement state transition functions**

```javascript
function startHolding() {
  timerState = 'holding';
  timerDisplay.style.color = '#ffd700'; // yellow
  holdTimeout = setTimeout(() => {
    timerState = 'ready';
    timerDisplay.style.color = '#00e676'; // green
  }, 300);
}

function cancelHolding() {
  clearTimeout(holdTimeout);
  timerState = 'idle';
  timerDisplay.style.color = '#ffffff';
}

function startTimer() {
  timerState = 'running';
  timerDisplay.style.color = '#ffffff';
  currentScramble = scrambleBar.textContent;
  startTime = performance.now();
  updateDisplay();
}

function stopTimer() {
  timerState = 'stopped';
  elapsed = performance.now() - startTime;
  cancelAnimationFrame(animationFrame);
  timerDisplay.textContent = formatTime(elapsed);
  timerDisplay.style.color = '#ffffff';
  showNewScramble();
  // saveSolve() will be added in Task 5
}

function updateDisplay() {
  if (timerState !== 'running') return;
  elapsed = performance.now() - startTime;
  timerDisplay.textContent = formatTime(elapsed);
  animationFrame = requestAnimationFrame(updateDisplay);
}

function formatTime(ms) {
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) {
    return totalSeconds.toFixed(2);
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(2).padStart(5, '0');
  return minutes + ':' + seconds;
}
```

**Step 4: Verify**

Open in browser. Test:
- Hold spacebar → timer turns yellow
- Hold 300ms+ → turns green
- Release → timer starts counting
- Tap spacebar → timer stops, new scramble appears
- Release early (before green) → timer resets to idle, no start

---

### Task 4: Mobile touch support

**Files:**
- Modify: `index.html` (extend JS, minor CSS)

**Step 1: Add touch event handlers**

```javascript
let touchStartTime = 0;

timerDisplay.addEventListener('touchstart', (e) => {
  e.preventDefault();
  if (timerState === 'running') {
    stopTimer();
  } else if (timerState === 'idle' || timerState === 'stopped') {
    startHolding();
  }
});

timerDisplay.addEventListener('touchend', (e) => {
  e.preventDefault();
  if (timerState === 'holding') {
    cancelHolding();
  } else if (timerState === 'ready') {
    startTimer();
  }
});
```

**Step 2: Add CSS touch-action and cursor**

Add to `#timer-display` style: `touch-action: none; cursor: pointer;`

**Step 3: Verify**

Use browser DevTools mobile emulation. Tap and hold the timer area — same hold-release behavior as spacebar.

---

### Task 5: localStorage persistence + save/load solves

**Files:**
- Modify: `index.html` (extend JS)

**Step 1: Implement save/load functions**

```javascript
function loadSolves() {
  const data = localStorage.getItem('rubix-timer-solves');
  return data ? JSON.parse(data) : [];
}

function saveSolves(solves) {
  localStorage.setItem('rubix-timer-solves', JSON.stringify(solves));
}

function addSolve(time, scramble) {
  const solves = loadSolves();
  solves.unshift({
    id: crypto.randomUUID(),
    time: Math.round(time),
    scramble: scramble,
    date: new Date().toISOString()
  });
  saveSolves(solves);
  return solves;
}

function deleteSolve(id) {
  const solves = loadSolves().filter(s => s.id !== id);
  saveSolves(solves);
  return solves;
}

function clearAllSolves() {
  saveSolves([]);
  return [];
}
```

**Step 2: Wire saveSolve into stopTimer**

In `stopTimer()`, after setting elapsed, add:

```javascript
addSolve(elapsed, currentScramble);
renderStats();
```

**Step 3: Verify**

Open in browser. Do a solve. Open DevTools → Application → Local Storage. Confirm a solve entry exists with id, time, scramble, date.

---

### Task 6: Statistics calculations

**Files:**
- Modify: `index.html` (extend JS)

**Step 1: Implement stat functions**

```javascript
function calcBest(solves) {
  if (solves.length === 0) return null;
  return Math.min(...solves.map(s => s.time));
}

function calcAvg(solves, count) {
  if (solves.length < count) return null;
  const recent = solves.slice(0, count).map(s => s.time);
  if (count <= 3) {
    return recent.reduce((a, b) => a + b, 0) / count;
  }
  // Trimmed mean: drop best and worst
  recent.sort((a, b) => a - b);
  const trimmed = recent.slice(1, -1);
  return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
}
```

**Step 2: Verify with console**

In DevTools console, manually test:
- `calcBest([{time:5000},{time:3000}])` → `3000`
- `calcAvg([{time:1000},{time:2000},{time:3000},{time:4000},{time:5000}], 5)` → `3000` (drops 1000 and 5000, averages 2000+3000+4000)

---

### Task 7: Stats + history UI rendering

**Files:**
- Modify: `index.html` (extend CSS + JS, update HTML structure)

**Step 1: Update stats panel HTML structure**

Replace `#stats-panel` placeholder with:

```html
<div id="stats-panel">
  <div id="stats-row">
    <div class="stat"><span class="stat-label">Best</span><span id="stat-best" class="stat-value">—</span></div>
    <div class="stat"><span class="stat-label">Ao3</span><span id="stat-ao3" class="stat-value">—</span></div>
    <div class="stat"><span class="stat-label">Ao5</span><span id="stat-ao5" class="stat-value">—</span></div>
    <div class="stat"><span class="stat-label">Ao12</span><span id="stat-ao12" class="stat-value">—</span></div>
  </div>
  <div id="history-header">
    <span>Solves</span>
    <button id="clear-all-btn" title="Clear all">Clear All</button>
  </div>
  <div id="history-list"></div>
</div>
```

**Step 2: Add CSS for stats row and history list**

```css
#stats-row {
  display: flex;
  justify-content: space-around;
  padding: 12px 0;
  border-bottom: 1px solid #333;
}
.stat { text-align: center; }
.stat-label { display: block; font-size: 0.75rem; color: #888; text-transform: uppercase; }
.stat-value { display: block; font-size: 1.2rem; font-family: monospace; margin-top: 4px; }
#history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  font-size: 0.85rem;
  color: #888;
}
#clear-all-btn {
  background: none;
  border: 1px solid #555;
  color: #888;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.75rem;
}
#clear-all-btn:hover { color: #ff5252; border-color: #ff5252; }
#history-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 12px;
}
.history-row {
  display: flex;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #222;
  font-size: 0.9rem;
}
.history-num { width: 40px; color: #666; }
.history-time { width: 80px; font-family: monospace; font-weight: bold; }
.history-scramble { flex: 1; font-family: monospace; font-size: 0.75rem; color: #666; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.history-delete {
  background: none;
  border: none;
  color: #555;
  cursor: pointer;
  font-size: 1rem;
  padding: 4px 8px;
}
.history-delete:hover { color: #ff5252; }
```

**Step 3: Implement renderStats function**

```javascript
function renderStats() {
  const solves = loadSolves();

  document.getElementById('stat-best').textContent =
    solves.length > 0 ? formatTime(calcBest(solves)) : '—';
  document.getElementById('stat-ao3').textContent =
    calcAvg(solves, 3) !== null ? formatTime(calcAvg(solves, 3)) : '—';
  document.getElementById('stat-ao5').textContent =
    calcAvg(solves, 5) !== null ? formatTime(calcAvg(solves, 5)) : '—';
  document.getElementById('stat-ao12').textContent =
    calcAvg(solves, 12) !== null ? formatTime(calcAvg(solves, 12)) : '—';

  const historyList = document.getElementById('history-list');
  historyList.innerHTML = '';

  solves.forEach((solve, i) => {
    const row = document.createElement('div');
    row.className = 'history-row';
    row.innerHTML = `
      <span class="history-num">${solves.length - i}.</span>
      <span class="history-time">${formatTime(solve.time)}</span>
      <span class="history-scramble" title="${solve.scramble}">${solve.scramble}</span>
      <button class="history-delete" title="Delete" data-id="${solve.id}">✕</button>
    `;
    historyList.appendChild(row);
  });
}
```

**Step 4: Wire up delete and clear all**

```javascript
document.getElementById('history-list').addEventListener('click', (e) => {
  const btn = e.target.closest('.history-delete');
  if (btn) {
    deleteSolve(btn.dataset.id);
    renderStats();
  }
});

document.getElementById('clear-all-btn').addEventListener('click', () => {
  if (confirm('Delete all solves?')) {
    clearAllSolves();
    renderStats();
  }
});
```

**Step 5: Call renderStats on page load**

Add at the bottom of the script:
```javascript
renderStats();
```

**Step 6: Verify**

Open in browser. Do 5 solves. Confirm:
- Stats update after each solve
- Ao3 appears after 3 solves, Ao5 after 5
- Best shows lowest time
- History shows all solves newest-first with scrambles
- Delete button removes a solve and recalculates stats
- Clear All asks for confirmation, then wipes everything

---

### Task 8: Polish + edge cases

**Files:**
- Modify: `index.html`

**Step 1: Prevent spacebar scrolling and input focus issues**

Ensure the keydown handler's `e.preventDefault()` covers all cases. Add:
```javascript
// Prevent any input elements from capturing spacebar
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && e.target === document.body) {
    e.preventDefault();
  }
}, true);
```

**Step 2: Add a subtle instruction hint**

Below the timer display, add a small muted text: "Hold spacebar to start" that hides once the first solve is recorded.

```html
<div id="hint" style="color: #555; font-size: 0.8rem; text-align: center; margin-top: 8px;">
  Hold spacebar to start
</div>
```

Hide it after first solve in `stopTimer()`:
```javascript
const hint = document.getElementById('hint');
if (hint) hint.style.display = 'none';
```

**Step 3: Style the scramble refresh button**

Make sure the refresh button is subtle, monospace, and sits next to the scramble text:
```css
#scramble-bar button {
  background: none;
  border: 1px solid #444;
  color: #888;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  margin-left: 12px;
}
#scramble-bar button:hover { color: #fff; border-color: #666; }
```

**Step 4: Final verification**

Full end-to-end test:
1. Open page — scramble visible, timer at 0.00, hint visible
2. Hold spacebar — yellow, then green after 300ms
3. Release — timer runs
4. Tap spacebar — timer stops, time saved, new scramble, hint gone
5. Do 12 solves — all stats populated
6. Delete a solve — stats recalculate
7. Clear all — everything gone
8. Refresh page — localStorage persists previous solves (if any remain)
9. Test on mobile viewport — touch works, responsive layout

---

## Task Dependency Order

```
Task 1 (skeleton) → Task 2 (scramble) → Task 3 (timer) → Task 4 (touch) → Task 5 (persistence) → Task 6 (stats calc) → Task 7 (stats UI) → Task 8 (polish)
```

All tasks are sequential — each builds on the previous.
