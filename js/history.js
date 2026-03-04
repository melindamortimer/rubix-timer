import { formatTime, formatDateHeader, formatDelta } from './utils.js';
import { loadSolves, saveSolves, loadSessionMeta, saveSessionMeta, getActiveSession, getSessionSolves } from './storage.js';

function createDeltaElement(solveTime, reference) {
  const el = document.createElement('span');
  el.className = 'history-delta';
  const delta = formatDelta(solveTime, reference);
  if (delta) {
    el.textContent = delta.text;
    el.classList.add(delta.diff <= 0 ? 'delta-negative' : 'delta-positive');
  } else {
    el.textContent = '\u2014';
    el.classList.add('delta-neutral');
  }
  return el;
}

export function renderHistoryList(historyList, solves, ao3, ao5) {
  historyList.innerHTML = '';

  if (solves.length === 0) return;

  const header = document.createElement('div');
  header.className = 'history-header-row';

  const cols = [
    { text: '#', width: '40px' },
    { text: 'Time', width: '80px' },
    { text: 'vs Ao3', width: '70px', align: 'right' },
    { text: 'vs Ao5', width: '70px', align: 'right' },
    { text: 'Scramble', flex: true, marginLeft: '12px' },
    { text: '', width: '32px' }
  ];

  cols.forEach(col => {
    const span = document.createElement('span');
    span.textContent = col.text;
    if (col.width) span.style.width = col.width;
    if (col.flex) span.style.flex = '1';
    if (col.align) span.style.textAlign = col.align;
    if (col.marginLeft) span.style.marginLeft = col.marginLeft;
    header.appendChild(span);
  });

  historyList.appendChild(header);

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

    const row = document.createElement('div');
    row.className = 'history-row';

    const num = document.createElement('span');
    num.className = 'history-num';
    num.textContent = `${solves.length - i}.`;

    const time = document.createElement('span');
    time.className = 'history-time';
    time.textContent = formatTime(solve.time);

    const scramble = document.createElement('span');
    scramble.className = 'history-scramble';
    scramble.title = solve.scramble;
    scramble.textContent = solve.scramble;

    const del = document.createElement('button');
    del.className = 'history-delete';
    del.title = 'Delete';
    del.dataset.id = solve.id;
    del.textContent = '\u2715';

    row.append(
      num,
      time,
      createDeltaElement(solve.time, ao3),
      createDeltaElement(solve.time, ao5),
      scramble,
      del
    );
    historyList.appendChild(row);
  });
}

// === CSV Import / Export ===

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
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

export function exportSolves() {
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
}

export function importSolves(file, onComplete) {
  const reader = new FileReader();
  reader.onload = (event) => {
    const lines = event.target.result.trim().split('\n');

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
    const meta = loadSessionMeta();
    let imported = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const fields = parseCSVLine(line);
      if (fields.length < 2) continue;

      const time = parseInt(fields[0], 10);
      if (isNaN(time) || time <= 0) continue;

      const scramble = fields[1];
      const date = fields[2] || new Date().toISOString();
      const session = fields[3] || getActiveSession();
      const key = `${time}_${date}`;

      if (existingKeys.has(key)) continue;

      existing.unshift({ id: crypto.randomUUID(), time, scramble, date, session });

      if (!meta.sessions.includes(session)) {
        meta.sessions.push(session);
      }

      existingKeys.add(key);
      imported++;
    }

    saveSolves(existing);
    saveSessionMeta(meta);
    onComplete();
    alert(`Imported ${imported} solve(s).`);
  };

  reader.readAsText(file);
}
