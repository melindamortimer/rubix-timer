# Scramble Diagram & 2-Player Remote Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an interactive 3D scramble diagram and Supabase-powered remote 2-player mode to the Rubik's timer.

**Architecture:** Two independent features sharing the scramble generator. The 3D cube is pure CSS/JS with a state simulator that applies moves to a solved cube. The multiplayer mode uses Supabase Realtime Broadcast for live timer sync and Supabase Postgres for room state. Both features are additive — solo mode is untouched.

**Tech Stack:** Vanilla JS ES modules, CSS 3D transforms, Supabase JS client (CDN), Supabase Realtime Broadcast.

---

## Phase 1: 3D Scramble Diagram

### Task 1: Cube State Simulator

**Files:**
- Create: `js/cube-state.js`

**Step 1: Create the cube state module with solved state and face rotation logic**

The cube state is 6 faces, each with 9 sticker indices. Each move (R, L, U, D, F, B) with modifiers (none, ', 2) permutes stickers on the rotated face and adjacent edges.

```javascript
// js/cube-state.js

// Face indices (reading order, top-left to bottom-right):
// 0 1 2
// 3 4 5
// 6 7 8

const COLORS = { U: '#ffffff', D: '#ffdd00', F: '#00aa00', B: '#0000dd', R: '#dd0000', L: '#ff8800' };

function createSolvedCube() {
  const state = {};
  for (const face of Object.keys(COLORS)) {
    state[face] = Array(9).fill(COLORS[face]);
  }
  return state;
}

// Rotate a face's own 9 stickers 90° clockwise
function rotateFaceCW(faceArr) {
  return [
    faceArr[6], faceArr[3], faceArr[0],
    faceArr[7], faceArr[4], faceArr[1],
    faceArr[8], faceArr[5], faceArr[2],
  ];
}

// Each move definition: which face rotates, and 4 edge strips that cycle clockwise.
// Each strip is [face, i0, i1, i2] — the 3 stickers from that face involved in the cycle.
const MOVE_DEFS = {
  R: { face: 'R', edges: [['U',2,5,8], ['F',2,5,8], ['D',2,5,8], ['B',6,3,0]] },
  L: { face: 'L', edges: [['U',0,3,6], ['B',8,5,2], ['D',0,3,6], ['F',0,3,6]] },
  U: { face: 'U', edges: [['B',2,1,0], ['R',2,1,0], ['F',2,1,0], ['L',2,1,0]] },
  D: { face: 'D', edges: [['F',6,7,8], ['R',6,7,8], ['B',6,7,8], ['L',6,7,8]] },
  F: { face: 'F', edges: [['U',6,7,8], ['R',0,3,6], ['D',2,1,0], ['L',8,5,2]] },
  B: { face: 'B', edges: [['U',2,1,0], ['L',0,3,6], ['D',6,7,8], ['R',8,5,2]] },
};

function applyMoveCW(state, moveName) {
  const def = MOVE_DEFS[moveName];
  // Rotate face itself
  state[def.face] = rotateFaceCW(state[def.face]);
  // Cycle edge strips: [0] -> [1] -> [2] -> [3] -> [0]
  const edges = def.edges;
  const saved = edges[3].slice(1).map(i => state[edges[3][0]][i]);
  for (let e = 3; e > 0; e--) {
    const src = edges[e - 1];
    const dst = edges[e];
    for (let s = 0; s < 3; s++) {
      state[dst[0]][dst[s + 1]] = state[src[0]][src[s + 1]];
    }
  }
  for (let s = 0; s < 3; s++) {
    state[edges[0][0]][edges[0][s + 1]] = saved[s];
  }
}

function applyMove(state, moveStr) {
  const face = moveStr[0];
  const mod = moveStr.slice(1);
  const times = mod === "'" ? 3 : mod === '2' ? 2 : 1;
  for (let i = 0; i < times; i++) {
    applyMoveCW(state, face);
  }
}

export function applyScramble(movesArray) {
  const state = createSolvedCube();
  for (const move of movesArray) {
    applyMove(state, move);
  }
  return state;
}

export { COLORS };
```

**Step 2: Verify manually**

Open browser console on the app, import the module, and test:
```javascript
import { applyScramble } from './js/cube-state.js';
const state = applyScramble(["R", "U", "R'", "U'"]);
console.log(state); // Should show mixed colors on affected faces
```

Check: U face should NOT be all-white anymore after R U R' U'.

**Step 3: Commit**

```bash
git add js/cube-state.js
git commit -m "Add cube state simulator for applying scramble moves"
```

---

### Task 2: CSS 3D Cube Renderer

**Files:**
- Create: `js/cube-renderer.js`
- Modify: `styles.css` (append cube styles)

**Step 1: Add CSS styles for the 3D cube**

Append to `styles.css`:

```css
/* 3D Cube */
.cube-scene {
  width: 150px;
  height: 150px;
  perspective: 600px;
  margin: 0 auto;
  cursor: grab;
}

.cube-scene:active { cursor: grabbing; }

.cube {
  width: 100%;
  height: 100%;
  position: relative;
  transform-style: preserve-3d;
  transform: rotateX(-25deg) rotateY(-35deg);
  transition: none;
}

.cube-face {
  position: absolute;
  width: 150px;
  height: 150px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: 3px;
  padding: 3px;
  box-sizing: border-box;
  backface-visibility: hidden;
}

.cube-face--U { transform: rotateX(90deg) translateZ(75px); }
.cube-face--D { transform: rotateX(-90deg) translateZ(75px); }
.cube-face--F { transform: translateZ(75px); }
.cube-face--B { transform: rotateY(180deg) translateZ(75px); }
.cube-face--R { transform: rotateY(90deg) translateZ(75px); }
.cube-face--L { transform: rotateY(-90deg) translateZ(75px); }

.sticker {
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.4);
}
```

**Step 2: Create the cube renderer module**

```javascript
// js/cube-renderer.js

const FACE_NAMES = ['U', 'D', 'F', 'B', 'R', 'L'];

let cubeEl = null;
let rotX = -25;
let rotY = -35;

export function initCubeRenderer(sceneEl) {
  cubeEl = document.createElement('div');
  cubeEl.className = 'cube';
  sceneEl.appendChild(cubeEl);

  // Create 6 faces with 9 stickers each
  for (const face of FACE_NAMES) {
    const faceEl = document.createElement('div');
    faceEl.className = `cube-face cube-face--${face}`;
    faceEl.dataset.face = face;
    for (let i = 0; i < 9; i++) {
      const sticker = document.createElement('div');
      sticker.className = 'sticker';
      faceEl.appendChild(sticker);
    }
    cubeEl.appendChild(faceEl);
  }

  // Drag-to-rotate
  let isDragging = false;
  let lastX = 0;
  let lastY = 0;

  function onPointerDown(e) {
    isDragging = true;
    lastX = e.clientX ?? e.touches[0].clientX;
    lastY = e.clientY ?? e.touches[0].clientY;
  }

  function onPointerMove(e) {
    if (!isDragging) return;
    const x = e.clientX ?? e.touches[0].clientX;
    const y = e.clientY ?? e.touches[0].clientY;
    const dx = x - lastX;
    const dy = y - lastY;
    rotY += dx * 0.6;
    rotX -= dy * 0.6;
    rotX = Math.max(-90, Math.min(90, rotX));
    cubeEl.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg)`;
    lastX = x;
    lastY = y;
  }

  function onPointerUp() {
    isDragging = false;
  }

  sceneEl.addEventListener('mousedown', onPointerDown);
  sceneEl.addEventListener('touchstart', onPointerDown, { passive: true });
  document.addEventListener('mousemove', onPointerMove);
  document.addEventListener('touchmove', onPointerMove, { passive: true });
  document.addEventListener('mouseup', onPointerUp);
  document.addEventListener('touchend', onPointerUp);
}

export function updateCubeColors(cubeState) {
  if (!cubeEl) return;
  for (const face of FACE_NAMES) {
    const faceEl = cubeEl.querySelector(`[data-face="${face}"]`);
    const stickers = faceEl.querySelectorAll('.sticker');
    for (let i = 0; i < 9; i++) {
      stickers[i].style.backgroundColor = cubeState[face][i];
    }
  }
}
```

**Step 3: Commit**

```bash
git add js/cube-renderer.js styles.css
git commit -m "Add CSS 3D cube renderer with drag-to-rotate"
```

---

### Task 3: Integrate 3D Cube into the App

**Files:**
- Modify: `index.html` (add cube scene div)
- Modify: `js/app.js` (import cube modules, update on scramble change)

**Step 1: Add cube scene element to HTML**

In `index.html`, after the `#scramble-bar` div (line 19) and before `#session-bar` (line 21), insert:

```html
    <div id="cube-scene" class="cube-scene"></div>
```

**Step 2: Update app.js to wire up the cube**

Add imports at top of `js/app.js`:

```javascript
import { applyScramble } from './cube-state.js';
import { initCubeRenderer, updateCubeColors } from './cube-renderer.js';
```

Add to the DOM references object:

```javascript
cubeScene: document.getElementById('cube-scene'),
```

After the DOM references, initialize the renderer:

```javascript
initCubeRenderer(dom.cubeScene);
```

Modify `showNewScramble()` to also update the cube:

```javascript
function showNewScramble() {
  const moves = generateScramble();
  dom.scrambleText.innerHTML = moves
    .map(m => `<span class="scramble-move">${m}</span>`)
    .join('');
  updateCubeColors(applyScramble(moves));
}
```

**Step 3: Verify manually**

- Open the app in the browser
- See the 3D cube below the scramble text, showing the scrambled state
- Click-drag to rotate the cube and view all faces
- Click the refresh scramble button — cube updates to new scramble
- Complete a solve — new scramble + cube updates

**Step 4: Commit**

```bash
git add index.html js/app.js
git commit -m "Integrate 3D scramble cube into main app"
```

---

### Task 4: Validate Cube State Simulator Accuracy

**Files:**
- Modify: `js/cube-state.js` (fix any edge cycle bugs)

The edge permutation definitions in MOVE_DEFS are the trickiest part and most likely to have bugs. Each move's 4 edge strips must cycle in the correct clockwise direction.

**Step 1: Test known algorithms in browser console**

Test the "sexy move" (R U R' U') x 6 which returns to solved state:

```javascript
import { applyScramble, COLORS } from './js/cube-state.js';

// 6 repetitions of (R U R' U') = identity
const moves = "R U R' U'".split(' ');
const sixTimes = [];
for (let i = 0; i < 6; i++) sixTimes.push(...moves);

const state = applyScramble(sixTimes);
// Every face should be uniform (all same color)
for (const [face, stickers] of Object.entries(state)) {
  const allSame = stickers.every(s => s === COLORS[face]);
  console.log(face, allSame ? 'PASS' : 'FAIL', stickers);
}
```

Also test T-perm (R U R' U' R' F R2 U' R' U' R U R' F') which is also an identity when applied twice.

**Step 2: Fix any incorrect edge permutations found**

If a face doesn't return to solved, the MOVE_DEFS for that face's edges are wrong. Fix the specific [face, i0, i1, i2] indices.

**Step 3: Commit fixes if any**

```bash
git add js/cube-state.js
git commit -m "Fix cube state edge permutations"
```

---

## Phase 2: Supabase Setup

### Task 5: Create Supabase Project and Schema

**Files:**
- Create: `js/supabase-config.js`

**Step 1: Set up Supabase project**

Use the Supabase MCP tools or dashboard to:
1. Identify or create a Supabase project for this app
2. Apply migration to create the `rooms` table:

```sql
CREATE TABLE rooms (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  code varchar(6) NOT NULL UNIQUE,
  scramble text NOT NULL,
  player1_name text NOT NULL,
  player2_name text,
  player1_time integer,
  player2_time integer,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'finished')),
  created_at timestamptz DEFAULT now()
);

-- Enable realtime for the rooms table
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;

-- RLS: allow anonymous access (no auth)
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to rooms" ON rooms FOR ALL USING (true) WITH CHECK (true);

-- Index for code lookups
CREATE INDEX idx_rooms_code ON rooms (code);

-- Auto-cleanup old rooms (optional, can also be a cron)
```

**Step 2: Create Supabase config module**

```javascript
// js/supabase-config.js

// These will be set after creating the Supabase project
export const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
```

**Step 3: Add Supabase JS client to index.html**

Add before the app.js script tag:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
```

**Step 4: Commit**

```bash
git add js/supabase-config.js index.html
git commit -m "Add Supabase project config and client CDN"
```

---

### Task 6: Multiplayer Room Management

**Files:**
- Create: `js/multiplayer.js`

**Step 1: Create the multiplayer module with room CRUD and realtime sync**

```javascript
// js/multiplayer.js

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';
import { generateScramble } from './scramble.js';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentRoom = null;
let currentChannel = null;
let playerNumber = null; // 1 or 2
let callbacks = {};

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I/O/0/1 to avoid confusion
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function createRoom(playerName) {
  const code = generateRoomCode();
  const scramble = generateScramble().join(' ');

  const { data, error } = await supabase
    .from('rooms')
    .insert({ code, scramble, player1_name: playerName, status: 'waiting' })
    .select()
    .single();

  if (error) throw error;

  currentRoom = data;
  playerNumber = 1;
  await joinChannel(code);
  return { code, room: data };
}

export async function joinRoom(code, playerName) {
  // Fetch room
  const { data: room, error: fetchErr } = await supabase
    .from('rooms')
    .select()
    .eq('code', code.toUpperCase())
    .single();

  if (fetchErr || !room) throw new Error('Room not found');
  if (room.status !== 'waiting') throw new Error('Room is already full');

  // Update room with player 2
  const { data, error } = await supabase
    .from('rooms')
    .update({ player2_name: playerName, status: 'active' })
    .eq('id', room.id)
    .select()
    .single();

  if (error) throw error;

  currentRoom = data;
  playerNumber = 2;
  await joinChannel(code.toUpperCase());

  // Notify P1 that P2 joined
  currentChannel.send({
    type: 'broadcast',
    event: 'player_joined',
    payload: { name: playerName },
  });

  return { room: data };
}

async function joinChannel(code) {
  currentChannel = supabase.channel(`room:${code}`, {
    config: { broadcast: { self: false } },
  });

  currentChannel
    .on('broadcast', { event: 'timer_update' }, ({ payload }) => {
      if (callbacks.onOpponentTimerUpdate) callbacks.onOpponentTimerUpdate(payload);
    })
    .on('broadcast', { event: 'player_joined' }, ({ payload }) => {
      if (callbacks.onOpponentJoined) callbacks.onOpponentJoined(payload);
    })
    .on('broadcast', { event: 'new_scramble' }, ({ payload }) => {
      if (callbacks.onNewScramble) callbacks.onNewScramble(payload);
    })
    .on('broadcast', { event: 'player_left' }, () => {
      if (callbacks.onOpponentLeft) callbacks.onOpponentLeft();
    })
    .subscribe();
}

export function broadcastTimerUpdate(state, elapsed) {
  if (!currentChannel) return;
  currentChannel.send({
    type: 'broadcast',
    event: 'timer_update',
    payload: { player: playerNumber, state, elapsed },
  });
}

export async function broadcastNewScramble() {
  if (!currentChannel || !currentRoom) return;
  const scramble = generateScramble().join(' ');

  // Update room in DB
  await supabase
    .from('rooms')
    .update({ scramble, player1_time: null, player2_time: null })
    .eq('id', currentRoom.id);

  currentChannel.send({
    type: 'broadcast',
    event: 'new_scramble',
    payload: { scramble },
  });

  return scramble;
}

export async function saveFinishTime(timeMs) {
  if (!currentRoom) return;
  const col = playerNumber === 1 ? 'player1_time' : 'player2_time';
  await supabase
    .from('rooms')
    .update({ [col]: timeMs })
    .eq('id', currentRoom.id);
}

export async function leaveRoom() {
  if (currentChannel) {
    currentChannel.send({
      type: 'broadcast',
      event: 'player_left',
      payload: { player: playerNumber },
    });
    supabase.removeChannel(currentChannel);
  }
  currentRoom = null;
  currentChannel = null;
  playerNumber = null;
}

export function onEvent(eventName, callback) {
  callbacks[eventName] = callback;
}

export function getRoomInfo() {
  return { room: currentRoom, playerNumber };
}
```

**Step 2: Commit**

```bash
git add js/multiplayer.js
git commit -m "Add multiplayer room management with Supabase Realtime"
```

---

### Task 7: Multiplayer UI — Modal and Layout

**Files:**
- Create: `js/multiplayer-ui.js`
- Modify: `index.html` (add 2P button, modal HTML, split timer area)
- Modify: `styles.css` (add modal + split layout styles)

**Step 1: Add HTML elements**

In `index.html`, add the 2-player button in `#app-header`:

```html
    <div id="app-header">
      <img id="logo" src="rubix_logo.png" alt="Rubik's Cube">
      <span id="app-title">Rubik's Timer</span>
      <button class="btn-ghost" id="multiplayer-btn" title="2 Player Mode">2P</button>
    </div>
```

Add the modal HTML before the closing `</body>`:

```html
    <!-- Multiplayer Modal -->
    <div id="mp-modal" class="modal-overlay" style="display:none;">
      <div class="modal">
        <div class="modal-header">
          <span>2 Player Mode</span>
          <button class="btn-ghost modal-close" id="mp-modal-close">&times;</button>
        </div>
        <div id="mp-modal-body">
          <input type="text" id="mp-name-input" class="mp-input" placeholder="Your name" maxlength="20">
          <div class="mp-actions">
            <button class="btn-primary" id="mp-create-btn">Create Room</button>
            <span class="mp-or">or</span>
            <div class="mp-join-row">
              <input type="text" id="mp-code-input" class="mp-input" placeholder="Room code" maxlength="6">
              <button class="btn-primary" id="mp-join-btn">Join</button>
            </div>
          </div>
          <div id="mp-error" class="mp-error"></div>
        </div>
        <!-- Waiting state -->
        <div id="mp-waiting" style="display:none;">
          <p>Waiting for opponent...</p>
          <div class="mp-code-display" id="mp-room-code"></div>
          <p class="mp-share-hint">Share this code or link with your friend</p>
          <button class="btn-ghost" id="mp-copy-link">Copy Link</button>
        </div>
      </div>
    </div>
```

Replace the `#timer-area` div to support split layout:

```html
    <div id="timer-area">
      <div id="solo-timer">
        <div id="timer-display">0.00</div>
        <div id="vs-best"></div>
      </div>
      <div id="split-timer" style="display:none;">
        <div class="split-player split-player--you">
          <div class="split-name" id="split-name-you">You</div>
          <div class="split-display" id="split-display-you">0.00</div>
          <div class="split-status" id="split-status-you"></div>
        </div>
        <div class="split-divider"></div>
        <div class="split-player split-player--opp">
          <div class="split-name" id="split-name-opp">Opponent</div>
          <div class="split-display" id="split-display-opp">0.00</div>
          <div class="split-status" id="split-status-opp"></div>
        </div>
      </div>
    </div>
```

**Step 2: Add CSS for modal and split layout**

Append to `styles.css`:

```css
/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal {
  background: #1e1e3a;
  border: 1px solid #444;
  border-radius: 12px;
  padding: 24px;
  min-width: 320px;
  max-width: 400px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  font-size: 1.1rem;
  font-weight: 600;
}

.modal-close {
  font-size: 1.4rem;
  border: none;
  padding: 4px 8px;
}

.mp-input {
  background: #222;
  color: #e0e0e0;
  border: 1px solid #444;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 1rem;
  width: 100%;
  box-sizing: border-box;
}

.mp-input::placeholder { color: #666; }

.mp-actions {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
}

.mp-or {
  color: #666;
  font-size: 0.85rem;
}

.mp-join-row {
  display: flex;
  gap: 8px;
  width: 100%;
}

.mp-join-row .mp-input {
  text-transform: uppercase;
  letter-spacing: 0.15em;
  font-family: monospace;
  font-size: 1.1rem;
  text-align: center;
}

.btn-primary {
  background: #4a4aff;
  color: #fff;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.95rem;
  font-weight: 500;
  width: 100%;
}

.btn-primary:hover { background: #5a5aff; }

.mp-error {
  color: #ff5252;
  font-size: 0.85rem;
  margin-top: 8px;
  min-height: 1.2em;
}

.mp-code-display {
  font-family: monospace;
  font-size: 2.5rem;
  letter-spacing: 0.3em;
  text-align: center;
  color: #fff;
  padding: 16px;
}

.mp-share-hint {
  color: #666;
  font-size: 0.8rem;
  text-align: center;
}

/* Split Timer Layout */
#split-timer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  width: 100%;
}

.split-player {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.split-divider {
  width: 1px;
  height: 120px;
  background: #333;
}

.split-name {
  font-size: 0.9rem;
  color: #888;
  margin-bottom: 8px;
  font-weight: 500;
}

.split-display {
  font-family: monospace;
  font-size: clamp(2rem, 8vw, 4rem);
  user-select: none;
}

.split-status {
  font-size: 0.8rem;
  color: #666;
  margin-top: 4px;
  min-height: 1.2em;
}
```

**Step 3: Create the multiplayer UI module**

```javascript
// js/multiplayer-ui.js

import {
  createRoom, joinRoom, leaveRoom, onEvent, getRoomInfo,
  broadcastTimerUpdate, broadcastNewScramble, saveFinishTime,
} from './multiplayer.js';
import { applyScramble } from './cube-state.js';
import { updateCubeColors } from './cube-renderer.js';
import { formatTime } from './utils.js';

let isMultiplayerActive = false;
let opponentTimerInterval = null;

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
};

export function initMultiplayerUI(showNewScrambleFn) {
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
    const { room, playerNumber } = getRoomInfo();
    dom.modal.style.display = 'none';
    const myName = dom.nameInput.value.trim();
    enterMultiplayerMode(myName, payload.name, room.scramble);
  });

  onEvent('onOpponentTimerUpdate', (payload) => {
    updateOpponentDisplay(payload);
  });

  onEvent('onNewScramble', (payload) => {
    const moves = payload.scramble.split(' ');
    showNewScrambleFn(moves);
    dom.splitDisplayYou.textContent = '0.00';
    dom.splitDisplayOpp.textContent = '0.00';
    dom.splitStatusYou.textContent = '';
    dom.splitStatusOpp.textContent = '';
  });

  onEvent('onOpponentLeft', () => {
    dom.splitStatusOpp.textContent = 'Disconnected';
    dom.splitNameOpp.style.color = '#ff5252';
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
  dom.multiplayerBtn.textContent = '2P';
  dom.multiplayerBtn.style.borderColor = '';
  dom.multiplayerBtn.style.color = '';

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

export function isMultiplayer() {
  return isMultiplayerActive;
}

export { broadcastTimerUpdate, broadcastNewScramble, saveFinishTime };
```

**Step 4: Commit**

```bash
git add js/multiplayer-ui.js index.html styles.css
git commit -m "Add multiplayer UI with modal, room creation, and split timer layout"
```

---

### Task 8: Wire Multiplayer into Timer and App

**Files:**
- Modify: `js/timer.js` (add broadcast hook for timer state changes)
- Modify: `js/app.js` (integrate multiplayer UI, handle mode switching)

**Step 1: Add a state change callback to timer.js**

Modify `initTimer` to accept an optional `onStateChange` callback:

```javascript
export function initTimer(timerDisplay, { getScrambleText, onStop, onStateChange }) {
```

Call it whenever state changes:

In `startHolding()`, after setting `timerState = 'holding'`:
```javascript
if (onStateChange) onStateChange('holding', 0);
```

In `cancelHolding()`, after setting `timerState = 'idle'`:
```javascript
if (onStateChange) onStateChange('idle', 0);
```

In `startTimerRun()`, after setting `timerState = 'running'`:
```javascript
if (onStateChange) onStateChange('running', 0);
```

In `updateDisplay()`, after calculating elapsed:
```javascript
if (onStateChange) onStateChange('running', elapsed);
```

In `stopTimer()`, after setting `timerState = 'stopped'`:
```javascript
if (onStateChange) onStateChange('stopped', elapsed);
```

**Step 2: Update app.js to integrate multiplayer**

Add import:
```javascript
import { initMultiplayerUI, isMultiplayer, broadcastTimerUpdate, broadcastNewScramble, saveFinishTime } from './multiplayer-ui.js';
```

Update the `initTimer` call to include the state change callback:
```javascript
initTimer(dom.timerDisplay, {
  getScrambleText: getCurrentScrambleText,
  onStop(elapsed, scramble) {
    if (isMultiplayer()) {
      broadcastTimerUpdate('stopped', elapsed);
      saveFinishTime(elapsed);
      // Update your side of the split display
      document.getElementById('split-display-you').textContent = formatTime(elapsed);
      document.getElementById('split-status-you').textContent = 'Done!';
      document.getElementById('split-display-you').style.color = '#00e676';
    } else {
      showNewScramble();
      addSolve(elapsed, scramble);
      renderStats();
      renderSessionBar();
      if (dom.hint) dom.hint.style.display = 'none';
    }
  },
  onStateChange(state, elapsed) {
    if (isMultiplayer()) {
      broadcastTimerUpdate(state, elapsed);
      if (state === 'running' || state === 'holding' || state === 'ready') {
        document.getElementById('split-display-you').textContent = formatTime(elapsed);
      }
    }
  }
});
```

Add `formatTime` to the utils import:
```javascript
import { formatOrDash, formatDelta, formatTime } from './utils.js';
```

Modify `showNewScramble()` to accept optional pre-generated moves (for multiplayer):
```javascript
function showNewScramble(presetMoves) {
  const moves = presetMoves || generateScramble();
  dom.scrambleText.innerHTML = moves
    .map(m => `<span class="scramble-move">${m}</span>`)
    .join('');
  updateCubeColors(applyScramble(moves));
}
```

Initialize multiplayer UI at the bottom, passing the scramble function:
```javascript
initMultiplayerUI(showNewScramble);
```

Update `window.showNewScramble` to match the new signature:
```javascript
window.showNewScramble = () => showNewScramble();
```

**Step 3: Handle the "New Scramble" flow in multiplayer**

In `multiplayer-ui.js`, add a "New Round" button that appears after both finish. This button calls `broadcastNewScramble()` and updates both displays. For now, the scramble refresh button in the scramble bar can be reused — when in multiplayer mode, it should broadcast the new scramble to both players.

Wire this up in `app.js` by modifying the refresh button behavior:

```javascript
window.showNewScramble = async () => {
  if (isMultiplayer()) {
    const scramble = await broadcastNewScramble();
    if (scramble) showNewScramble(scramble.split(' '));
  } else {
    showNewScramble();
  }
};
```

**Step 4: Verify end-to-end**

1. Open the app in two browser tabs
2. Tab 1: Click "2P", enter name, Create Room
3. Tab 2: Click "2P", enter name, enter room code, Join
4. Both tabs should show side-by-side timers with the same scramble
5. Start solving in Tab 1 — Tab 2 should see Tab 1's timer running
6. Stop in Tab 1 — Tab 2 shows Tab 1's final time
7. Stop in Tab 2 — both see final results
8. Click refresh scramble — both get the new scramble

**Step 5: Commit**

```bash
git add js/timer.js js/app.js js/multiplayer-ui.js
git commit -m "Wire multiplayer into timer and app with realtime broadcasting"
```

---

### Task 9: Throttle Timer Broadcasts

**Files:**
- Modify: `js/multiplayer-ui.js` or `js/app.js`

Broadcasting every `requestAnimationFrame` (~60fps) is too frequent. Throttle to ~10 updates/second.

**Step 1: Add throttle to the onStateChange callback in app.js**

```javascript
let lastBroadcast = 0;
const BROADCAST_INTERVAL = 100; // ms

onStateChange(state, elapsed) {
  if (!isMultiplayer()) return;
  const now = performance.now();
  if (state === 'running' && now - lastBroadcast < BROADCAST_INTERVAL) return;
  lastBroadcast = now;
  broadcastTimerUpdate(state, elapsed);
  if (state === 'running' || state === 'holding' || state === 'ready') {
    document.getElementById('split-display-you').textContent = formatTime(elapsed);
  }
}
```

**Step 2: Commit**

```bash
git add js/app.js
git commit -m "Throttle multiplayer timer broadcasts to 10/sec"
```

---

### Task 10: Polish and Edge Cases

**Files:**
- Modify: `js/multiplayer-ui.js` (handle disconnect, rejoin)
- Modify: `styles.css` (responsive adjustments)

**Step 1: Handle opponent disconnect gracefully**

The `onOpponentLeft` handler already shows "Disconnected". Add a "Return to Solo" option after a few seconds.

**Step 2: Make split timer responsive**

Add media query for small screens — stack timers vertically instead of side-by-side:

```css
@media (max-width: 500px) {
  #split-timer {
    flex-direction: column;
  }
  .split-divider {
    width: 80%;
    height: 1px;
    margin: 12px 0;
  }
}
```

**Step 3: Add a "New Round" button visible after both players finish**

In the split timer area, below both timers, show a "New Round" button when both have stopped. Only the room creator (P1) can trigger it.

**Step 4: Verify all edge cases**

- Create room, close tab → room stays in "waiting" (stale, cleaned up later)
- Both finish → "New Round" button appears
- One player refreshes → can rejoin with same code
- Invalid room code → error message shown
- Mobile: split layout stacks vertically

**Step 5: Commit**

```bash
git add js/multiplayer-ui.js styles.css
git commit -m "Add multiplayer polish: responsive layout, new round, disconnect handling"
```

---

## Summary of New/Modified Files

| File | Action | Purpose |
|------|--------|---------|
| `js/cube-state.js` | Create | Scramble move simulator |
| `js/cube-renderer.js` | Create | CSS 3D cube with drag rotation |
| `js/supabase-config.js` | Create | Supabase project URL and anon key |
| `js/multiplayer.js` | Create | Room CRUD, Supabase Realtime, broadcasting |
| `js/multiplayer-ui.js` | Create | Modal, split layout, mode switching |
| `index.html` | Modify | Add cube scene, 2P button, modal, split timer HTML |
| `styles.css` | Modify | Add cube, modal, split timer styles |
| `js/app.js` | Modify | Wire cube + multiplayer, mode-aware callbacks |
| `js/timer.js` | Modify | Add onStateChange callback |

## Commit Sequence

1. `Add cube state simulator for applying scramble moves`
2. `Add CSS 3D cube renderer with drag-to-rotate`
3. `Integrate 3D scramble cube into main app`
4. `Fix cube state edge permutations` (if needed)
5. `Add Supabase project config and client CDN`
6. `Add multiplayer room management with Supabase Realtime`
7. `Add multiplayer UI with modal, room creation, and split timer layout`
8. `Wire multiplayer into timer and app with realtime broadcasting`
9. `Throttle multiplayer timer broadcasts to 10/sec`
10. `Add multiplayer polish: responsive layout, new round, disconnect handling`
