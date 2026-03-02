# Rubik's Timer v2 Enhancements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add sessions, CSV import/export, delta columns, date grouping, and layout fixes to the existing Rubik's timer.

**Architecture:** Enhance the existing single `index.html`. Add a `session` field to all solves, store session metadata in a separate localStorage key. Widen the layout to 1100px to accommodate delta columns. Session selector sits between scramble bar and timer.

**Tech Stack:** Vanilla HTML/CSS/JS, no dependencies. Single file.

**Current file:** `index.html` (~435 lines)

**Design doc:** `docs/plans/2026-03-02-enhancements-design.md`

---

### Task 1: Data model migration + session storage

**Files:**
- Modify: `index.html` (JS section)

**Context:** Currently solves are stored in `rubix-timer-solves` as a flat array with `{id, time, scramble, date}`. We need to add a `session` field to every solve and create a new `rubix-timer-sessions` key for session metadata.

**Step 1: Add session storage functions**

Add these functions after the existing `clearAllSolves()` function:

```javascript
// === Sessions ===

function loadSessionMeta() {
  try {
    const data = localStorage.getItem('rubix-timer-sessions');
    return data ? JSON.parse(data) : { sessions: ['Default'], activeSession: 'Default' };
  } catch {
    return { sessions: ['Default'], activeSession: 'Default' };
  }
}

function saveSessionMeta(meta) {
  localStorage.setItem('rubix-timer-sessions', JSON.stringify(meta));
}

function getActiveSession() {
  return loadSessionMeta().activeSession;
}

function setActiveSession(name) {
  const meta = loadSessionMeta();
  meta.activeSession = name;
  saveSessionMeta(meta);
}

function createSession(name) {
  const meta = loadSessionMeta();
  if (!meta.sessions.includes(name)) {
    meta.sessions.push(name);
  }
  meta.activeSession = name;
  saveSessionMeta(meta);
}

function renameSession(oldName, newName) {
  const meta = loadSessionMeta();
  const idx = meta.sessions.indexOf(oldName);
  if (idx !== -1) meta.sessions[idx] = newName;
  if (meta.activeSession === oldName) meta.activeSession = newName;
  saveSessionMeta(meta);

  const solves = loadSolves();
  solves.forEach(s => { if (s.session === oldName) s.session = newName; });
  saveSolves(solves);
}

function deleteSession(name) {
  const meta = loadSessionMeta();
  meta.sessions = meta.sessions.filter(s => s !== name);
  if (meta.sessions.length === 0) meta.sessions = ['Default'];
  if (meta.activeSession === name) meta.activeSession = meta.sessions[0];
  saveSessionMeta(meta);

  const solves = loadSolves().filter(s => s.session !== name);
  saveSolves(solves);
}

function getSessionSolves() {
  return loadSolves().filter(s => s.session === getActiveSession());
}
```

**Step 2: Migrate existing data**

Add a migration function that runs once on page load. Place it right after the session functions:

```javascript
function migrateData() {
  const solves = loadSolves();
  if (solves.length > 0 && solves[0].session === undefined) {
    solves.forEach(s => { s.session = 'Default'; });
    saveSolves(solves);
  }
  const meta = loadSessionMeta();
  saveSessionMeta(meta); // ensure key exists
}

migrateData();
```

**Step 3: Update addSolve to include session**

Change the `addSolve` function to include the active session:

```javascript
function addSolve(time, scramble) {
  const solves = loadSolves();
  solves.unshift({
    id: crypto.randomUUID(),
    time: Math.round(time),
    scramble: scramble,
    date: new Date().toISOString(),
    session: getActiveSession()
  });
  saveSolves(solves);
  return solves;
}
```

**Step 4: Update renderStats to filter by session**

Change `renderStats` to use `getSessionSolves()` instead of `loadSolves()`:

Replace the first line of `renderStats`:
```javascript
// Old: const solves = loadSolves();
const solves = getSessionSolves();
```

Also update the `clearAllSolves` button handler to only clear the active session:

```javascript
document.getElementById('clear-all-btn').addEventListener('click', () => {
  if (confirm('Delete all solves in this session?')) {
    const session = getActiveSession();
    const solves = loadSolves().filter(s => s.session !== session);
    saveSolves(solves);
    renderStats();
  }
});
```

**Step 5: Verify**

Open in browser. Existing solves should still appear (migrated to "Default"). New solves should have `session: "Default"` in localStorage. Stats should be unchanged.

---

### Task 2: Scramble bar layout fix

**Files:**
- Modify: `index.html` (HTML + CSS)

**Context:** Currently the scramble text and refresh button are on the same flex row, causing the button to shift as scramble length varies.

**Step 1: Update scramble bar HTML**

Change the `#scramble-bar` div from:
```html
<div id="scramble-bar">
  <span id="scramble-text"></span>
  <button onclick="showNewScramble()" title="New scramble">&#x21BB;</button>
</div>
```

To:
```html
<div id="scramble-bar">
  <div id="scramble-text"></div>
  <button onclick="showNewScramble()" title="New scramble">&#x21BB;</button>
</div>
```

**Step 2: Update scramble bar CSS**

Change `#scramble-bar` from flex row to flex column:

```css
#scramble-bar {
  padding: 12px 16px;
  text-align: center;
  font-family: monospace;
  font-size: 1.1rem;
  min-height: 60px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
```

Remove `margin-left: 12px` and `flex-shrink: 0` from `#scramble-bar button` since they're no longer needed in column layout. Keep the rest of the button styling.

**Step 3: Verify**

Open in browser. Scramble text should be on one line, refresh button centered below it. Button should not move when scramble changes.

---

### Task 3: Session selector UI

**Files:**
- Modify: `index.html` (HTML + CSS + JS)

**Context:** Add a session selector bar between the scramble bar and timer. Contains a dropdown, create button, and today's solve count.

**Step 1: Add session bar HTML**

Insert between `#scramble-bar` and `#timer-display`:

```html
<div id="session-bar">
  <div id="session-controls">
    <select id="session-select"></select>
    <button id="session-add" title="New session">+</button>
    <button id="session-rename" title="Rename session">&#x270E;</button>
    <button id="session-delete" title="Delete session">&#x2715;</button>
  </div>
  <span id="session-today"></span>
</div>
```

**Step 2: Add session bar CSS**

```css
#session-bar {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  padding: 4px 16px;
  font-size: 0.85rem;
  color: #888;
}

#session-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

#session-select {
  background: #222;
  color: #e0e0e0;
  border: 1px solid #444;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.85rem;
  cursor: pointer;
}

#session-bar button {
  background: none;
  border: 1px solid #444;
  color: #888;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
}

#session-bar button:hover { color: #fff; border-color: #666; }

#session-today {
  color: #666;
  font-size: 0.8rem;
}
```

**Step 3: Add session bar JS logic**

Add a function to render the session bar and wire up events:

```javascript
function renderSessionBar() {
  const meta = loadSessionMeta();
  const select = document.getElementById('session-select');
  select.innerHTML = '';
  meta.sessions.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    if (name === meta.activeSession) opt.selected = true;
    select.appendChild(opt);
  });

  // Today's count
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = getSessionSolves().filter(s => s.date.slice(0, 10) === today).length;
  document.getElementById('session-today').textContent = todayCount > 0 ? `Today: ${todayCount}` : '';
}

document.getElementById('session-select').addEventListener('change', (e) => {
  setActiveSession(e.target.value);
  renderSessionBar();
  renderStats();
});

document.getElementById('session-add').addEventListener('click', () => {
  const name = prompt('Session name:');
  if (name && name.trim()) {
    createSession(name.trim());
    renderSessionBar();
    renderStats();
  }
});

document.getElementById('session-rename').addEventListener('click', () => {
  const current = getActiveSession();
  const name = prompt('Rename session:', current);
  if (name && name.trim() && name.trim() !== current) {
    renameSession(current, name.trim());
    renderSessionBar();
    renderStats();
  }
});

document.getElementById('session-delete').addEventListener('click', () => {
  const current = getActiveSession();
  if (confirm(`Delete session "${current}" and all its solves?`)) {
    deleteSession(current);
    renderSessionBar();
    renderStats();
  }
});
```

**Step 4: Call renderSessionBar on page load**

Add `renderSessionBar();` right after `renderStats();` at the end of the script.

Also call `renderSessionBar()` inside `stopTimer()` after `renderStats()` to update today's count.

**Step 5: Add blur to new buttons**

Update the button blur handler at the bottom. Since we now have dynamically-changing buttons, use event delegation on body instead:

Replace:
```javascript
document.querySelectorAll('button').forEach(btn => {
  btn.addEventListener('mouseup', () => btn.blur());
});
```

With:
```javascript
document.addEventListener('mouseup', (e) => {
  if (e.target.tagName === 'BUTTON') e.target.blur();
});
```

**Step 6: Verify**

Open in browser. Session selector should appear. Switching sessions should filter history and stats. Creating, renaming, deleting sessions should all work. Today's count should update after each solve.

---

### Task 4: Wider layout + delta columns

**Files:**
- Modify: `index.html` (CSS + JS)

**Context:** Widen container to 1100px. Add vs Best, vs Ao3, vs Ao5 delta columns to each history row.

**Step 1: Widen container CSS**

Change `.container` max-width from `800px` to `1100px`.

**Step 2: Add delta column CSS**

```css
.history-delta {
  width: 70px;
  font-family: monospace;
  font-size: 0.8rem;
  text-align: right;
}
.delta-positive { color: #ff5252; }
.delta-negative { color: #00e676; }
.delta-neutral { color: #888; }
.delta-best { color: #ffd700; }
```

Also add a header row style:

```css
.history-header-row {
  display: flex;
  align-items: center;
  padding: 4px 0;
  font-size: 0.7rem;
  color: #555;
  text-transform: uppercase;
  border-bottom: 1px solid #333;
}

.history-header-row span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

**Step 3: Update renderStats to add delta columns**

In the `renderStats` function, compute best/ao3/ao5 once (already done), then for each solve row add three delta spans:

```javascript
function formatDelta(solveTime, reference) {
  if (reference === null) return null;
  const diff = solveTime - reference;
  return { text: (diff >= 0 ? '+' : '') + (diff / 1000).toFixed(2), diff };
}
```

In the `solves.forEach` loop, after creating the existing spans, add:

```javascript
const deltaBest = document.createElement('span');
deltaBest.className = 'history-delta';
const bestDelta = formatDelta(solve.time, best);
if (bestDelta) {
  deltaBest.textContent = bestDelta.text;
  if (bestDelta.diff === 0) deltaBest.classList.add('delta-best');
  else if (bestDelta.diff <= 500) deltaBest.classList.add('delta-negative');
  else if (bestDelta.diff >= 3000) deltaBest.classList.add('delta-positive');
  else deltaBest.classList.add('delta-neutral');
} else {
  deltaBest.textContent = '—';
  deltaBest.classList.add('delta-neutral');
}

const deltaAo3 = document.createElement('span');
deltaAo3.className = 'history-delta';
const ao3Delta = formatDelta(solve.time, ao3);
if (ao3Delta) {
  deltaAo3.textContent = ao3Delta.text;
  deltaAo3.classList.add(ao3Delta.diff <= 0 ? 'delta-negative' : 'delta-positive');
} else {
  deltaAo3.textContent = '—';
  deltaAo3.classList.add('delta-neutral');
}

const deltaAo5 = document.createElement('span');
deltaAo5.className = 'history-delta';
const ao5Delta = formatDelta(solve.time, ao5);
if (ao5Delta) {
  deltaAo5.textContent = ao5Delta.text;
  deltaAo5.classList.add(ao5Delta.diff <= 0 ? 'delta-negative' : 'delta-positive');
} else {
  deltaAo5.textContent = '—';
  deltaAo5.classList.add('delta-neutral');
}

row.append(num, time, deltaBest, deltaAo3, deltaAo5, scramble, del);
```

**Step 4: Add column header row**

Before the `solves.forEach` loop, insert a header row:

```javascript
if (solves.length > 0) {
  const header = document.createElement('div');
  header.className = 'history-header-row';

  const cols = [
    { text: '#', width: '40px' },
    { text: 'Time', width: '80px' },
    { text: 'vs Best', width: '70px', align: 'right' },
    { text: 'vs Ao3', width: '70px', align: 'right' },
    { text: 'vs Ao5', width: '70px', align: 'right' },
    { text: 'Scramble', flex: true },
    { text: '', width: '32px' }
  ];

  cols.forEach(col => {
    const span = document.createElement('span');
    span.textContent = col.text;
    if (col.width) span.style.width = col.width;
    if (col.flex) span.style.flex = '1';
    if (col.align) span.style.textAlign = col.align;
    header.appendChild(span);
  });

  historyList.appendChild(header);
}
```

**Step 5: Verify**

Open in browser with some existing solves. Confirm:
- Container is wider
- Delta columns appear with correct values
- Best solve shows +0.00 in gold
- Close-to-best shows green, far-from-best shows red
- "—" shows when Ao3/Ao5 not yet available
- Column headers visible

---

### Task 5: Date grouping in history

**Files:**
- Modify: `index.html` (CSS + JS in renderStats)

**Context:** Group solves by date within the history list. Show subtle date headers like "Today", "Yesterday", "Mar 2".

**Step 1: Add date header CSS**

```css
.history-date-header {
  padding: 8px 0 4px;
  font-size: 0.75rem;
  color: #555;
  border-bottom: 1px solid #2a2a2a;
  margin-top: 4px;
}
```

**Step 2: Add date formatting helper**

```javascript
function formatDateHeader(dateStr) {
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
```

**Step 3: Insert date headers in renderStats loop**

In the `solves.forEach` loop, before creating each row, check if the date group changed:

```javascript
let lastDateGroup = '';

solves.forEach((solve, i) => {
  const dateGroup = solve.date.slice(0, 10);
  if (dateGroup !== lastDateGroup) {
    lastDateGroup = dateGroup;
    const dateHeader = document.createElement('div');
    dateHeader.className = 'history-date-header';
    dateHeader.textContent = formatDateHeader(solve.date);
    historyList.appendChild(dateHeader);
  }

  // ... existing row creation code ...
});
```

**Step 4: Verify**

Open in browser. Solves should be grouped under date headers. "Today" for today's solves, "Yesterday" for yesterday's, and "Mon DD" format for older dates.

---

### Task 6: CSV export

**Files:**
- Modify: `index.html` (HTML + JS)

**Context:** Add an export button in the history header. Downloads a CSV of the current session's solves.

**Step 1: Add export button to history header HTML**

Update the `#history-header` div to include export/import buttons:

```html
<div id="history-header">
  <span>Solves</span>
  <div id="history-actions">
    <button id="export-btn" title="Export CSV">Export</button>
    <button id="import-btn" title="Import CSV">Import</button>
    <button id="clear-all-btn" title="Clear all">Clear All</button>
  </div>
</div>
```

**Step 2: Add CSS for history actions**

```css
#history-actions {
  display: flex;
  gap: 6px;
}

#export-btn, #import-btn {
  background: none;
  border: 1px solid #555;
  color: #888;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.75rem;
}

#export-btn:hover, #import-btn:hover { color: #fff; border-color: #666; }
```

**Step 3: Implement CSV export**

```javascript
document.getElementById('export-btn').addEventListener('click', () => {
  const solves = getSessionSolves();
  if (solves.length === 0) {
    alert('No solves to export.');
    return;
  }

  const header = 'time_ms,scramble,date,session';
  const rows = solves.map(s =>
    `${s.time},"${s.scramble.replace(/"/g, '""')}",${s.date},${s.session}`
  );
  const csv = [header, ...rows].join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const session = getActiveSession().replace(/[^a-zA-Z0-9]/g, '-');
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `rubix-timer-${session}-${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});
```

**Step 4: Verify**

Open in browser with some solves. Click Export. A CSV file should download. Open it — should have correct header and data rows with quoted scrambles.

---

### Task 7: CSV import

**Files:**
- Modify: `index.html` (HTML + JS)

**Context:** Add import functionality. Hidden file input triggered by the import button. Parses CSV, validates, deduplicates, appends solves.

**Step 1: Add hidden file input**

Add inside the container, anywhere (it's hidden):

```html
<input type="file" id="import-file" accept=".csv" style="display: none;">
```

**Step 2: Implement CSV import**

```javascript
document.getElementById('import-btn').addEventListener('click', () => {
  document.getElementById('import-file').click();
});

document.getElementById('import-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const text = event.target.result;
    const lines = text.trim().split('\n');

    if (lines.length < 2) {
      alert('CSV file is empty or has no data rows.');
      return;
    }

    const header = lines[0].toLowerCase().trim();
    if (!header.includes('time_ms') || !header.includes('scramble')) {
      alert('Invalid CSV format. Expected columns: time_ms, scramble, date, session');
      return;
    }

    const existing = loadSolves();
    const existingKeys = new Set(existing.map(s => `${s.time}_${s.date}`));

    let imported = 0;
    const meta = loadSessionMeta();

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Parse CSV line handling quoted fields
      const fields = parseCSVLine(line);
      if (fields.length < 2) continue;

      const time = parseInt(fields[0], 10);
      const scramble = fields[1];
      const date = fields[2] || new Date().toISOString();
      const session = fields[3] || getActiveSession();

      if (isNaN(time) || time <= 0) continue;

      const key = `${time}_${date}`;
      if (existingKeys.has(key)) continue;

      existing.unshift({
        id: crypto.randomUUID(),
        time: time,
        scramble: scramble,
        date: date,
        session: session
      });

      if (!meta.sessions.includes(session)) {
        meta.sessions.push(session);
      }

      existingKeys.add(key);
      imported++;
    }

    saveSolves(existing);
    saveSessionMeta(meta);
    renderSessionBar();
    renderStats();
    alert(`Imported ${imported} solve(s).`);
  };

  reader.readAsText(file);
  e.target.value = ''; // reset so same file can be re-imported
});

function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}
```

**Step 3: Verify**

Export a CSV, then clear solves, then import the same CSV. All solves should reappear. Import again — should show "Imported 0 solve(s)" (deduplication).

---

### Task 8: Polish + final integration

**Files:**
- Modify: `index.html`

**Step 1: Update page load hint logic**

The hint hide check at the bottom should use `getSessionSolves()` instead of `loadSolves()`:

```javascript
if (getSessionSolves().length > 0) {
  const hint = document.getElementById('hint');
  if (hint) hint.style.display = 'none';
}
```

Also show the hint again when switching to a session with no solves. Add to the session-select change handler:

```javascript
const hint = document.getElementById('hint');
if (hint) {
  hint.style.display = getSessionSolves().length > 0 ? 'none' : '';
}
```

**Step 2: Ensure proper ordering of init calls at script end**

The bottom of the script should have this order:
```javascript
migrateData();
renderStats();
renderSessionBar();

if (getSessionSolves().length > 0) {
  const hint = document.getElementById('hint');
  if (hint) hint.style.display = 'none';
}

document.addEventListener('mouseup', (e) => {
  if (e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT') e.target.blur();
});
```

**Step 3: Final verification**

Full end-to-end test:
1. Open page — "Default" session selected, existing solves visible
2. Create session "OH" — switches to empty session, hint reappears
3. Do 5 solves in "OH" — stats populate, delta columns show correctly
4. Switch back to "Default" — old solves visible with their stats
5. Export "Default" as CSV — file downloads
6. Delete "Default" session — solves gone, switches to "OH"
7. Import the CSV — "Default" session recreated with all solves
8. Check date grouping — "Today" header appears
9. Scramble button stays fixed below scramble text
10. Rename "OH" to "One-Handed" — session name updates everywhere
11. Mobile viewport — session bar doesn't overflow

---

## Task Dependency Order

```
Task 1 (data migration) → Task 2 (scramble fix, independent) → Task 3 (session UI) → Task 4 (wider + deltas) → Task 5 (date grouping) → Task 6 (CSV export) → Task 7 (CSV import) → Task 8 (polish)
```

Tasks 1 and 2 can run in parallel. Tasks 3-8 are sequential.
