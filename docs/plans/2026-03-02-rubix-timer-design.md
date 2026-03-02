# Rubik's Cube Timer — Design

## Summary

A single-file HTML Rubik's cube speedsolving timer with scramble generation, solve history, and statistics.

## Decisions

- **Cube type:** 3x3 only
- **Timer input:** Spacebar hold-release (stackmat style), touch support on mobile
- **Storage:** localStorage
- **File structure:** Single index.html (all CSS/JS inline)
- **Theme:** Dark
- **Scramble method:** Random-move (not random-state)

## Layout

Three vertically stacked zones:

1. **Scramble bar** (top) — current scramble + new scramble button
2. **Timer display** (center) — large monospace time, color-coded by state
3. **Stats + history panel** (bottom) — stats row + scrollable solve list

## Timer States

```
IDLE → (hold spacebar 300ms) → READY → (release) → RUNNING → (tap spacebar) → STOPPED → IDLE
```

Color coding: white (idle/running/stopped), yellow (holding), green (ready).

## Statistics

| Stat | Method |
|------|--------|
| Best | Lowest time ever |
| Ao3  | Mean of last 3 |
| Ao5  | Trimmed mean of last 5 (drop best & worst) |
| Ao12 | Trimmed mean of last 12 (drop best & worst) |

Show "—" when insufficient solves.

## Solve History

- Newest first, scrollable
- Each row: solve number, time, scramble, delete button
- Delete recalculates all stats
- Clear all with confirmation

## Scramble Generation

20 random moves from `{R, L, U, D, F, B} × {(none), ', 2}`.
- No consecutive same-face moves
- No consecutive same-axis moves (R/L, U/D, F/B)

## Data Model (localStorage)

```json
{
  "solves": [
    { "id": "uuid", "time": 12345, "scramble": "R U' F2 ...", "date": "2026-03-02T..." }
  ]
}
```

Times in milliseconds. Display as `ss.xx` or `m:ss.xx`.

## Tech

- Single index.html, no dependencies
- Dark theme, monospace timer font
- Responsive (desktop + mobile touch)
