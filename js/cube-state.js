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
  R: { face: 'R', edges: [['F',2,5,8], ['U',2,5,8], ['B',6,3,0], ['D',2,5,8]] },
  L: { face: 'L', edges: [['B',8,5,2], ['U',0,3,6], ['F',0,3,6], ['D',0,3,6]] },
  U: { face: 'U', edges: [['B',0,1,2], ['R',0,1,2], ['F',0,1,2], ['L',0,1,2]] },
  D: { face: 'D', edges: [['F',6,7,8], ['R',6,7,8], ['B',6,7,8], ['L',6,7,8]] },
  F: { face: 'F', edges: [['L',2,5,8], ['U',8,7,6], ['R',6,3,0], ['D',0,1,2]] },
  B: { face: 'B', edges: [['R',2,5,8], ['U',0,1,2], ['L',6,3,0], ['D',8,7,6]] },
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
