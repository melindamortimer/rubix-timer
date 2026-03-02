# Rubik's Timer v2 Enhancements — Design

## Summary

Five enhancements to the existing single-file Rubik's timer: fixed scramble button, sessions, wider layout with delta columns, CSV import/export, and date grouping.

## 1. Scramble bar layout fix

Move refresh button to its own centered line below the scramble text. Prevents button jumping as scramble lengths vary.

## 2. Sessions

Each solve gets a `session` field. Existing solves migrated to "Default".

**Session metadata** in separate localStorage key:
```json
{ "sessions": ["Default"], "activeSession": "Default" }
```

**UI:** Session selector bar between scramble and timer:
- Dropdown to switch active session
- [+] button to create new session (prompt for name)
- Date summary: "Today: N" solves in this session
- Rename/delete sessions via context menu or edit button

Stats and history filter to active session. Date grouping in history with subtle headers ("Today", "Mar 2", etc.).

## 3. Wider layout + delta columns

Expand container to max-width 1100px. History rows gain three delta columns:
- **vs Best**: difference from session best. Color coded (green if close, red if far).
- **vs Ao3**: difference from current Ao3. "—" if insufficient solves.
- **vs Ao5**: difference from current Ao5. "—" if insufficient solves.

Formatted as +1.23 / -0.45 with sign.

## 4. CSV import/export

**Export:** Downloads `rubix-timer-{session}-{date}.csv` with columns: `time_ms,scramble,date,session`.

**Import:** File picker, validates columns, creates missing sessions, appends solves. Deduplicates by matching time_ms + date.

## 5. Data model

Two localStorage keys:
- `rubix-timer-solves`: array of `{ id, time, scramble, date, session }`
- `rubix-timer-sessions`: `{ sessions: [...], activeSession: "..." }`

Migration: existing solves get `session: "Default"`.
