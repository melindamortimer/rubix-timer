# Scramble Diagram & 2-Player Remote Mode Design

## Overview

Two features for the Rubik's timer app:
1. **3D Scramble Diagram** - Interactive CSS 3D cube showing the scrambled state
2. **2-Player Remote Mode** - Real-time head-to-head solving with a friend via Supabase

## Feature 1: 3D Scramble Diagram

### New Files
- `js/cube-state.js` - Cube state simulator (applies scramble moves to a solved cube)
- `js/cube-renderer.js` - CSS 3D cube rendering + drag-to-rotate interaction

### Cube State Model
A `state` object with 6 keys (`U, D, L, R, F, B`), each an array of 9 color values representing 3x3 stickers in reading order (top-left to bottom-right). Starts as a solved cube, then each scramble move permutes the stickers according to standard Rubik's notation.

Standard colors: White (U), Yellow (D), Green (F), Blue (B), Red (R), Orange (L).

### CSS 3D Rendering
- `.cube-scene` container with `perspective: 600px`
- `.cube` div with `transform-style: preserve-3d`, containing 6 `.face` divs
- Each face positioned with `rotateX/Y` + `translateZ`, rendered as a 3x3 CSS grid of `.sticker` divs
- Colors applied from the cube state model

### Drag Interaction
- `mousedown`/`mousemove`/`mouseup` + touch equivalents on the scene
- Adjusts `rotateX` and `rotateY` of the `.cube` div
- Simple momentum-free drag

### UI Placement
- Below the scramble text bar, above the timer
- ~150-180px size, doesn't dominate layout
- Updates whenever the scramble changes (new scramble generated or refreshed)

## Feature 2: 2-Player Remote Mode

### New Files
- `js/multiplayer.js` - Room management, Supabase connection, real-time sync
- `js/multiplayer-ui.js` - 2-player UI rendering and layout switching

### Dependencies
- `@supabase/supabase-js` loaded via CDN (keeps the no-build-tool approach)

### Supabase Schema

**Table: `rooms`**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| code | varchar(6) | Alphanumeric room code, unique |
| scramble | text | Shared scramble string |
| player1_name | text | Display name |
| player2_name | text | Null until P2 joins |
| player1_time | integer | Null until P1 stops (milliseconds) |
| player2_time | integer | Null until P2 stops (milliseconds) |
| status | text | waiting / active / finished |
| created_at | timestamptz | Auto-set, used for cleanup |

No auth required - players are anonymous with display names.

### Real-Time Sync (Supabase Broadcast)
- Each room gets a Realtime channel: `room:{code}`
- Players broadcast timer state every ~100ms while running:
  ```json
  {
    "event": "timer_update",
    "payload": {
      "player": 1,
      "state": "running",
      "elapsed": 12345
    }
  }
  ```
- On stop, broadcast final time once
- States: `idle`, `holding`, `ready`, `running`, `stopped`

### Room Flow
1. User clicks "2 Player" button in header
2. Modal appears: "Create Room" or "Join Room"
3. **Create:** Enter display name -> get room code + shareable link. Shows "Waiting for opponent..."
4. **Join:** Enter code (or arrive via link) + display name -> join room
5. Both players see shared scramble + 3D cube + side-by-side timers
6. Each player controls their own timer with spacebar (same hold-to-start mechanic)
7. After both finish, show results comparison. "New Scramble" generates fresh scramble for both

### Side-by-Side Layout
- Timer area splits into two columns: left = you, right = opponent
- Each side: player name, timer display, status indicator
- Shared scramble + 3D cube centered above both timers
- Stats/history section hides during 2-player mode

### Joining Methods
- **Room code:** 6-character alphanumeric code displayed prominently
- **Shareable link:** URL with room code as query parameter (e.g., `?room=ABC123`)

## Edge Cases

- **Player disconnects:** Other player gets "Opponent disconnected" message. Can keep solving or leave.
- **Mid-solve scramble change:** "New Scramble" only enabled when both timers are idle/stopped.
- **Page refresh:** Player can rejoin with same room code. State recovered from `rooms` table.
- **Room code collision:** 6-char alphanumeric = ~2B combinations. Uniqueness checked on create.
- **Stale rooms:** Rooms older than 1 hour can be cleaned up (tiny rows, low priority).
- **Leaving:** "Leave Room" button returns to solo mode. Other player notified.

## What Stays Unchanged
- Solo mode: timer, stats, history, sessions, CSV import/export - all untouched
- Scramble generator: same `generateScramble()`, reused by multiplayer
- localStorage for solo data - multiplayer solves are ephemeral (not saved to history)

## Architecture Summary

```
Solo Mode (unchanged):
  app.js -> timer.js + scramble.js + storage.js + stats.js + chart.js + history.js

New (both modes):
  scramble.js -> cube-state.js -> cube-renderer.js (3D diagram)

New (2-player mode):
  app.js -> multiplayer.js (Supabase) -> multiplayer-ui.js (split layout)
              |
              +-- Supabase Realtime Broadcast (timer sync)
              +-- Supabase Postgres (room state)
```
