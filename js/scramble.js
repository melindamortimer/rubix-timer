const FACES = ['R', 'L', 'U', 'D', 'F', 'B'];
const MODIFIERS = ['', "'", '2'];
const FACE_AXES = { R: 0, L: 0, U: 1, D: 1, F: 2, B: 2 };

export function generateScramble() {
  const moves = [];
  let lastFace = '';
  let lastAxis = -1;

  for (let i = 0; i < 20; i++) {
    let face;
    do {
      face = FACES[Math.floor(Math.random() * FACES.length)];
    } while (face === lastFace || (FACE_AXES[face] === lastAxis && moves.length > 0));

    const mod = MODIFIERS[Math.floor(Math.random() * MODIFIERS.length)];
    moves.push(face + mod);
    lastAxis = FACE_AXES[face];
    lastFace = face;
  }
  return moves;
}
