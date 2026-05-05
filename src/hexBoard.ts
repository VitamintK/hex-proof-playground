export type CellColor = 'empty' | 'red' | 'blue' | 'white';
export type BrushColor = 'red' | 'blue' | 'white';

export interface BoardState {
  version: number;
  size: number;
  symmetry: boolean;
  cells: Array<[number, number, BrushColor]>;
}

interface SymmetryGroup {
  entries: Array<{ row: number; col: number; color: BrushColor }>;
}

const MAX_HEX_SIZE = 22;
const MIN_HEX_SIZE = 5;
const PADDING = 40;
// Target viewport the board should fit within
const MAX_BOARD_WIDTH  = 1200;
const MAX_BOARD_HEIGHT = 950;

function computeHexSize(n: number): number {
  const wFactor = Math.sqrt(3) * (1.5 * (n - 1) + 1);
  const hFactor = 2 * (0.75 * (n - 1) + 1);
  const fromWidth  = (MAX_BOARD_WIDTH  - 2 * PADDING) / wFactor;
  const fromHeight = (MAX_BOARD_HEIGHT - 2 * PADDING) / hFactor;
  return Math.min(MAX_HEX_SIZE, Math.max(MIN_HEX_SIZE, Math.floor(Math.min(fromWidth, fromHeight))));
}

function hexVertices(cx: number, cy: number, size: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    pts.push(`${(cx + size * Math.cos(angle)).toFixed(2)},${(cy + size * Math.sin(angle)).toFixed(2)}`);
  }
  return pts.join(' ');
}

function cellCenter(row: number, col: number, size: number): { cx: number; cy: number } {
  const w = Math.sqrt(3) * size;
  const h = 2 * size;
  return {
    cx: PADDING + col * w + row * (w / 2),
    cy: PADDING + row * (h * 0.75),
  };
}

function svgSize(n: number, size: number): { width: number; height: number } {
  const w = Math.sqrt(3) * size;
  const h = 2 * size;
  return {
    width:  PADDING * 2 + (n - 1) * w + (n - 1) * (w / 2) + w,
    height: PADDING * 2 + (n - 1) * (h * 0.75) + h,
  };
}

function isCellDisabled(r: number, c: number, n: number, symmetryOn: boolean): boolean {
  if (!symmetryOn || n % 2 === 0) return false;
  return r === c || r + c === n - 1;
}

function symmetryGroup(r: number, c: number, n: number, brush: BrushColor): SymmetryGroup {
  // White is its own opposite; red and blue swap.
  const other: BrushColor = brush === 'red' ? 'blue' : brush === 'blue' ? 'red' : 'white';
  const seen = new Set<string>();
  const entries: SymmetryGroup['entries'] = [];

  function add(row: number, col: number, color: BrushColor) {
    const key = `${row},${col}`;
    if (!seen.has(key)) {
      seen.add(key);
      entries.push({ row, col, color });
    }
  }

  add(r, c,               brush); // primary → brush color
  add(c, r,               other); // mirror over main diagonal → other color
  add(n-1-c, n-1-r,       other); // mirror over anti-diagonal → other color
  add(n-1-r, n-1-c,       brush); // 180° rotation → brush color

  return { entries };
}

function cellColorFill(color: CellColor, disabled: boolean): { fill: string; stroke: string; strokeDash: string } {
  if (disabled) {
    if (color === 'white') return { fill: '#f0f0f0', stroke: '#888888', strokeDash: '4,3' };
    return { fill: '#1e1e32', stroke: '#2e2e4e', strokeDash: '4,3' };
  }
  switch (color) {
    case 'red':   return { fill: '#e05555', stroke: '#c03030', strokeDash: '' };
    case 'blue':  return { fill: '#4a90d9', stroke: '#2a6ab9', strokeDash: '' };
    case 'white': return { fill: '#f0f0f0', stroke: '#888888', strokeDash: '' };
    default:      return { fill: '#2a2a4a', stroke: '#3a3a6a', strokeDash: '' };
  }
}

export class HexBoard {
  private n: number;
  private symmetryOn: boolean;
  private brush: BrushColor = 'red';
  private grid: CellColor[][];
  private svg: SVGSVGElement;
  private cellElements: Map<string, SVGGElement> = new Map();
  private hexSize: number = MAX_HEX_SIZE;

  // drag state
  private dragging = false;
  private dragMode: 'paint' | 'erase' = 'paint';
  private visitedInDrag = new Set<string>();

  onChange: (() => void) | null = null;

  constructor(svg: SVGSVGElement, n: number, symmetryOn: boolean) {
    this.svg = svg;
    this.n = n;
    this.symmetryOn = symmetryOn;
    this.grid = this.makeGrid();
    this.render();
    this.attachPointerListeners();
  }

  setBrush(color: BrushColor) { this.brush = color; }

  getState(): BoardState {
    const cells: Array<[number, number, BrushColor]> = [];
    for (let r = 0; r < this.n; r++) {
      for (let c = 0; c < this.n; c++) {
        const color = this.grid[r][c];
        if (color === 'red' || color === 'blue') cells.push([r, c, color]);
      }
    }
    return { version: 1, size: this.n, symmetry: this.symmetryOn, cells };
  }

  loadState(state: BoardState): { size: number; symmetry: boolean } {
    const n = Math.max(2, Math.min(41, state.size));
    this.n = n;
    this.symmetryOn = state.symmetry;
    this.grid = this.makeGrid();
    for (const [r, c, color] of state.cells) {
      if (r >= 0 && r < n && c >= 0 && c < n) this.grid[r][c] = color;
    }
    this.render();
    return { size: this.n, symmetry: this.symmetryOn };
  }

  resize(n: number, symmetryOn: boolean) {
    this.n = n;
    this.symmetryOn = symmetryOn;
    this.grid = this.makeGrid();
    this.render();
    this.onChange?.();
  }

  setSymmetry(on: boolean) {
    this.symmetryOn = on;
    this.grid = this.makeGrid();
    this.render();
    this.onChange?.();
  }

  clear() {
    this.grid = this.makeGrid();
    this.updateAllCells();
    this.onChange?.();
  }

  private makeGrid(): CellColor[][] {
    return Array.from({ length: this.n }, () => new Array<CellColor>(this.n).fill('empty'));
  }

  private key(r: number, c: number): string { return `${r},${c}`; }

  // --- Pointer handling ---

  private attachPointerListeners() {
    this.svg.addEventListener('pointerdown', (e) => {
      const cell = this.cellFromEvent(e);
      if (!cell) return;
      e.preventDefault();
      this.svg.setPointerCapture(e.pointerId);
      this.dragging = true;
      this.visitedInDrag.clear();

      // Determine gesture mode from first cell
      const cur = this.grid[cell.r][cell.c];
      this.dragMode = cur === this.brush ? 'erase' : 'paint';
      this.applyBrushToCell(cell.r, cell.c);
    });

    this.svg.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const cell = this.cellFromEvent(e);
      if (!cell) return;
      this.applyBrushToCell(cell.r, cell.c);
    });

    const endDrag = () => {
      if (!this.dragging) return;
      this.dragging = false;
      this.visitedInDrag.clear();
      this.onChange?.();
    };
    this.svg.addEventListener('pointerup', endDrag);
    this.svg.addEventListener('pointercancel', endDrag);
  }

  private cellFromEvent(e: PointerEvent): { r: number; c: number } | null {
    // Walk up from the element under the pointer to find a hex-cell group
    let el = document.elementFromPoint(e.clientX, e.clientY) as Element | null;
    while (el && el !== this.svg) {
      const r = el.getAttribute('data-row');
      const c = el.getAttribute('data-col');
      if (r !== null && c !== null) return { r: +r, c: +c };
      el = el.parentElement;
    }
    return null;
  }

  private applyBrushToCell(r: number, c: number) {
    // Axis cells are blocked for red/blue; white may paint anywhere.
    if (this.brush !== 'white' && isCellDisabled(r, c, this.n, this.symmetryOn)) return;

    const useSymmetry = this.symmetryOn && this.n % 2 !== 0;

    if (useSymmetry) {
      // Use any cell in the group as the visit key to avoid double-triggering
      const group = symmetryGroup(r, c, this.n, this.brush);
      const groupKey = group.entries.map(e => this.key(e.row, e.col)).sort().join('|');
      if (this.visitedInDrag.has(groupKey)) return;
      this.visitedInDrag.add(groupKey);

      if (this.dragMode === 'erase') {
        const anyColored = group.entries.some(e => this.grid[e.row][e.col] !== 'empty');
        if (!anyColored) return;
        for (const entry of group.entries) {
          this.grid[entry.row][entry.col] = 'empty';
          this.updateCell(entry.row, entry.col);
        }
      } else {
        const allPainted = group.entries.every(e => this.grid[e.row][e.col] !== 'empty');
        if (allPainted) return;
        for (const entry of group.entries) {
          this.grid[entry.row][entry.col] = entry.color;
          this.updateCell(entry.row, entry.col);
        }
      }
    } else {
      const cellKey = this.key(r, c);
      if (this.visitedInDrag.has(cellKey)) return;
      this.visitedInDrag.add(cellKey);

      if (this.dragMode === 'erase') {
        if (this.grid[r][c] === 'empty') return;
        this.grid[r][c] = 'empty';
      } else {
        if (this.grid[r][c] === this.brush) return;
        this.grid[r][c] = this.brush;
      }
      this.updateCell(r, c);
    }
  }

  // --- Rendering ---

  private render() {
    this.hexSize = computeHexSize(this.n);

    while (this.svg.firstChild) this.svg.removeChild(this.svg.firstChild);
    this.cellElements.clear();

    const { width, height } = svgSize(this.n, this.hexSize);
    this.svg.setAttribute('width', String(width));
    this.svg.setAttribute('height', String(height));

    this.renderBorderBands();
    for (let r = 0; r < this.n; r++) {
      for (let c = 0; c < this.n; c++) {
        this.renderCell(r, c);
      }
    }
  }

  private renderBorderBands() {
    const size = this.hexSize;
    const w = Math.sqrt(3) * size;
    const h = 2 * size;
    const bandWidth = Math.max(4, size * 0.35);
    const halfW = w / 2;
    const quarterH = h * 0.25;
    const ns = this.n;

    const topPts = [cellCenter(0, 0, size), cellCenter(0, ns - 1, size)];
    this.appendBand([
      `${topPts[0].cx - halfW},${topPts[0].cy - quarterH}`,
      `${topPts[1].cx + halfW},${topPts[1].cy - quarterH}`,
      `${topPts[1].cx + halfW},${topPts[1].cy - quarterH - bandWidth}`,
      `${topPts[0].cx - halfW},${topPts[0].cy - quarterH - bandWidth}`,
    ].join(' '), '#c03030');

    const botPts = [cellCenter(ns - 1, 0, size), cellCenter(ns - 1, ns - 1, size)];
    this.appendBand([
      `${botPts[0].cx - halfW},${botPts[0].cy + quarterH}`,
      `${botPts[1].cx + halfW},${botPts[1].cy + quarterH}`,
      `${botPts[1].cx + halfW},${botPts[1].cy + quarterH + bandWidth}`,
      `${botPts[0].cx - halfW},${botPts[0].cy + quarterH + bandWidth}`,
    ].join(' '), '#c03030');

    const leftOuter: string[] = [], leftInner: string[] = [];
    for (let r = 0; r < ns; r++) {
      const { cx, cy } = cellCenter(r, 0, size);
      if (r === 0) {
        leftOuter.push(`${cx - halfW},${cy - quarterH}`);
        leftOuter.push(`${cx - halfW - bandWidth},${cy - quarterH}`);
      }
      leftOuter.push(`${cx - halfW - bandWidth},${cy + quarterH}`);
      leftOuter.push(`${cx - halfW},${cy + quarterH}`);
    }
    for (let r = ns - 1; r >= 0; r--) {
      const { cx, cy } = cellCenter(r, 0, size);
      leftInner.push(`${cx - halfW},${cy + quarterH}`, `${cx - halfW},${cy - quarterH}`);
    }
    this.appendBand([...leftOuter, ...leftInner].join(' '), '#2a6ab9');

    const rightOuter: string[] = [], rightInner: string[] = [];
    for (let r = 0; r < ns; r++) {
      const { cx, cy } = cellCenter(r, ns - 1, size);
      if (r === 0) {
        rightOuter.push(`${cx + halfW},${cy - quarterH}`);
        rightOuter.push(`${cx + halfW + bandWidth},${cy - quarterH}`);
      }
      rightOuter.push(`${cx + halfW + bandWidth},${cy + quarterH}`);
      rightOuter.push(`${cx + halfW},${cy + quarterH}`);
    }
    for (let r = ns - 1; r >= 0; r--) {
      const { cx, cy } = cellCenter(r, ns - 1, size);
      rightInner.push(`${cx + halfW},${cy + quarterH}`, `${cx + halfW},${cy - quarterH}`);
    }
    this.appendBand([...rightOuter, ...rightInner].join(' '), '#2a6ab9');
  }

  private appendBand(points: string, fill: string) {
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', points);
    poly.setAttribute('fill', fill);
    poly.setAttribute('opacity', '0.55');
    this.svg.appendChild(poly);
  }

  private renderCell(r: number, c: number) {
    const size = this.hexSize;
    const { cx, cy } = cellCenter(r, c, size);
    const disabled = isCellDisabled(r, c, this.n, this.symmetryOn);

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', `hex-cell${disabled ? ' disabled' : ''}`);
    g.setAttribute('data-row', String(r));
    g.setAttribute('data-col', String(c));

    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', hexVertices(cx, cy, size - Math.max(1, size * 0.07)));
    this.applyCellStyle(poly, this.grid[r][c], disabled);

    g.appendChild(poly);
    this.svg.appendChild(g);
    this.cellElements.set(this.key(r, c), g);
  }

  private applyCellStyle(poly: SVGPolygonElement, color: CellColor, disabled: boolean) {
    const { fill, stroke, strokeDash } = cellColorFill(color, disabled);
    poly.setAttribute('fill', fill);
    poly.setAttribute('stroke', stroke);
    poly.setAttribute('stroke-width', String(Math.max(0.8, this.hexSize * 0.07)));
    if (strokeDash) poly.setAttribute('stroke-dasharray', strokeDash);
    else poly.removeAttribute('stroke-dasharray');
  }

  private updateCell(r: number, c: number) {
    const g = this.cellElements.get(this.key(r, c));
    if (!g) return;
    const poly = g.querySelector('polygon') as SVGPolygonElement | null;
    if (!poly) return;
    const disabled = isCellDisabled(r, c, this.n, this.symmetryOn);
    this.applyCellStyle(poly, this.grid[r][c], disabled);
  }

  private updateAllCells() {
    for (let r = 0; r < this.n; r++) {
      for (let c = 0; c < this.n; c++) this.updateCell(r, c);
    }
  }
}
