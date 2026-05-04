import './style.css';
import { HexBoard } from './hexBoard';

const sizeInput   = document.getElementById('size-input')   as HTMLInputElement;
const applyBtn    = document.getElementById('apply-btn')     as HTMLButtonElement;
const symToggle   = document.getElementById('symmetry-toggle') as HTMLInputElement;
const symGroup    = document.getElementById('symmetry-group') as HTMLDivElement;
const clearBtn    = document.getElementById('clear-btn')     as HTMLButtonElement;
const svg         = document.getElementById('hex-board')     as unknown as SVGSVGElement;
const infoText    = document.getElementById('info-text')     as HTMLParagraphElement;

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
  const n = Math.max(2, Math.min(19, isNaN(raw) ? currentSize : raw));
  sizeInput.value = String(n);
  currentSize = n;
  const symOn = isOdd(n) && symToggle.checked;
  board.resize(n, symOn);
  updateSymmetryUI(n);
}

function init() {
  currentSize = parseInt(sizeInput.value, 10);
  const symOn = isOdd(currentSize) && symToggle.checked;
  board = new HexBoard(svg, currentSize, symOn);
  updateSymmetryUI(currentSize);

  applyBtn.addEventListener('click', applySize);

  sizeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') applySize();
  });

  symToggle.addEventListener('change', () => {
    if (!isOdd(currentSize)) return;
    board.setSymmetry(symToggle.checked);
  });

  clearBtn.addEventListener('click', () => board.clear());
}

init();
