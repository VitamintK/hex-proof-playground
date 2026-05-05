import './style.css';
import { HexBoard, BoardState, BrushColor } from './hexBoard';

const sizeInput    = document.getElementById('size-input')      as HTMLInputElement;
const applyBtn     = document.getElementById('apply-btn')        as HTMLButtonElement;
const symToggle    = document.getElementById('symmetry-toggle')  as HTMLInputElement;
const symGroup     = document.getElementById('symmetry-group')   as HTMLDivElement;
const clearBtn     = document.getElementById('clear-btn')        as HTMLButtonElement;
const saveBtn      = document.getElementById('save-btn')         as HTMLButtonElement;
const loadBtn      = document.getElementById('load-btn')         as HTMLButtonElement;
const shareBtn     = document.getElementById('share-btn')        as HTMLButtonElement;
const fileInput    = document.getElementById('file-input')       as HTMLInputElement;
const brushBtns    = document.querySelectorAll<HTMLButtonElement>('.brush-btn');
const svg          = document.getElementById('hex-board')        as unknown as SVGSVGElement;
const infoText     = document.getElementById('info-text')        as HTMLParagraphElement;

let currentSize = 11;
let board: HexBoard;

function isOdd(n: number): boolean {
  return n % 2 !== 0;
}

function updateSymmetryUI(n: number) {
  if (isOdd(n)) {
    symGroup.classList.remove('disabled');
    infoText.textContent =
      'Symmetry mode: click a cell to place a red stone — mirrored cells are filled automatically. Click again to clear the group.';
  } else {
    symGroup.classList.add('disabled');
    infoText.textContent = 'Even board: click to cycle a cell through empty → red → blue → empty.';
  }
}

function applySize() {
  const raw = parseInt(sizeInput.value, 10);
  const n = Math.max(2, Math.min(41, isNaN(raw) ? currentSize : raw));
  sizeInput.value = String(n);
  currentSize = n;
  const symOn = isOdd(n) && symToggle.checked;
  board.resize(n, symOn);
  updateSymmetryUI(n);
}

// --- Serialization ---

function stateToHash(state: BoardState): string {
  return btoa(JSON.stringify(state));
}

function hashToState(hash: string): BoardState | null {
  try {
    return JSON.parse(atob(hash)) as BoardState;
  } catch {
    return null;
  }
}

function pushHash(state: BoardState) {
  history.replaceState(null, '', '#' + stateToHash(state));
}

// --- Save ---

function saveToFile() {
  const state = board.getState();
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hex-board-${state.size}x${state.size}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Load ---

function loadFromState(state: BoardState) {
  const { size, symmetry } = board.loadState(state);
  currentSize = size;
  sizeInput.value = String(size);
  symToggle.checked = symmetry;
  updateSymmetryUI(size);
}

function loadFromFile(file: File) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const state = JSON.parse(e.target!.result as string) as BoardState;
      loadFromState(state);
      setStatus('Board loaded.');
    } catch {
      setStatus('Error: invalid file format.');
    }
  };
  reader.readAsText(file);
}

// --- Share ---

function copyShareLink() {
  const state = board.getState();
  const url = location.origin + location.pathname + '#' + stateToHash(state);
  navigator.clipboard.writeText(url).then(() => {
    setStatus('Share link copied to clipboard!');
  }).catch(() => {
    // Fallback: show the URL in the status bar so user can copy manually
    setStatus(`Share URL: ${url}`);
  });
}

// --- Status flash ---

let statusTimer = 0;
function setStatus(msg: string) {
  infoText.textContent = msg;
  clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => updateSymmetryUI(currentSize), 3000);
}

// --- Init ---

function init() {
  currentSize = parseInt(sizeInput.value, 10);

  // Try to restore from URL hash
  const hash = location.hash.slice(1);
  const hashState = hash ? hashToState(hash) : null;

  if (hashState) {
    const symOn = isOdd(hashState.size) && hashState.symmetry;
    board = new HexBoard(svg, hashState.size, symOn);
    loadFromState(hashState);
  } else {
    const symOn = isOdd(currentSize) && symToggle.checked;
    board = new HexBoard(svg, currentSize, symOn);
    updateSymmetryUI(currentSize);
  }

  board.onChange = () => pushHash(board.getState());

  applyBtn.addEventListener('click', applySize);

  sizeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') applySize();
  });

  symToggle.addEventListener('change', () => {
    if (!isOdd(currentSize)) return;
    board.setSymmetry(symToggle.checked);
  });

  clearBtn.addEventListener('click', () => board.clear());

  brushBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      brushBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      board.setBrush(btn.dataset['color'] as BrushColor);
    });
  });

  saveBtn.addEventListener('click', saveToFile);

  loadBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    if (fileInput.files?.[0]) {
      loadFromFile(fileInput.files[0]);
      fileInput.value = '';
    }
  });

  shareBtn.addEventListener('click', copyShareLink);
}

init();
