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
