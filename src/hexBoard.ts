export type CellColor = 'empty' | 'red' | 'blue' | 'disabled';

export interface BoardState {
  version: number;
  size: number;
  symmetry: boolean;
  cells: Array<[number, number, 'red' | 'blue']>;
}

interface SymmetryGroup {
  // (r,c) → red, (c,r) → blue, (n-1-c, n-1-r) → blue, (n-1-r, n-1-c) → red
  entries: Array<{ row: number; col: number; color: 'red' | 'blue' }>;
}

const HEX_SIZE = 22; // circumradius in px
const PADDING = 40;

function hexVertices(cx: number, cy: number, size: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    // Pointy-top: first vertex at 30°
    const angle = (Math.PI / 180) * (60 * i - 30);
    const x = cx + size * Math.cos(angle);
    const y = cy + size * Math.sin(angle);
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return pts.join(' ');
}

function cellCenter(row: number, col: number, size: number): { cx: number; cy: number } {
  const w = Math.sqrt(3) * size; // horizontal distance between centers
  const h = 2 * size;            // vertical distance between centers (full height)
  const cx = PADDING + col * w + row * (w / 2);
  const cy = PADDING + row * (h * 0.75);
  return { cx, cy };
}

function svgSize(n: number, size: number): { width: number; height: number } {
  const w = Math.sqrt(3) * size;
  const h = 2 * size;
  const width = PADDING * 2 + (n - 1) * w + (n - 1) * (w / 2) + w;
  const height = PADDING * 2 + (n - 1) * (h * 0.75) + h;
  return { width, height };
}

function isOnMainDiagonal(r: number, c: number): boolean {
  return r === c;
}

function isOnAntiDiagonal(r: number, c: number, n: number): boolean {
  return r + c === n - 1;
}

function isCellDisabled(r: number, c: number, n: number, symmetryOn: boolean): boolean {
  if (!symmetryOn || n % 2 === 0) return false;
  return isOnMainDiagonal(r, c) || isOnAntiDiagonal(r, c, n);
}

function symmetryGroup(r: number, c: number, n: number): SymmetryGroup {
  const seen = new Set<string>();
  const entries: SymmetryGroup['entries'] = [];

  function add(row: number, col: number, color: 'red' | 'blue') {
    const key = `${row},${col}`;
    if (!seen.has(key)) {
      seen.add(key);
      entries.push({ row, col, color });
    }
  }

  add(r, c, 'red');                          // original → red
  add(c, r, 'blue');                         // mirror over main diagonal → blue
  add(n - 1 - c, n - 1 - r, 'blue');        // mirror over anti-diagonal → blue
  add(n - 1 - r, n - 1 - c, 'red');         // 180° rotation (both mirrors) → red

  return { entries };
}

function cellColorFill(color: CellColor, disabled: boolean): { fill: string; stroke: string; strokeDash: string } {
  if (disabled) return { fill: '#1e1e32', stroke: '#2e2e4e', strokeDash: '4,3' };
  switch (color) {
    case 'red':   return { fill: '#e05555', stroke: '#c03030', strokeDash: '' };
    case 'blue':  return { fill: '#4a90d9', stroke: '#2a6ab9', strokeDash: '' };
    case 'empty': return { fill: '#2a2a4a', stroke: '#3a3a6a', strokeDash: '' };
    default:      return { fill: '#2a2a4a', stroke: '#3a3a6a', strokeDash: '' };
  }
}

export class HexBoard {
  private n: number;
  private symmetryOn: boolean;
  private grid: CellColor[][];
  private svg: SVGSVGElement;
  private cellElements: Map<string, SVGGElement> = new Map();
  onChange: (() => void) | null = null;

  constructor(svg: SVGSVGElement, n: number, symmetryOn: boolean) {
    this.svg = svg;
    this.n = n;
    this.symmetryOn = symmetryOn;
    this.grid = this.makeGrid();
    this.render();
  }

  getState(): BoardState {
    const cells: Array<[number, number, 'red' | 'blue']> = [];
    for (let r = 0; r < this.n; r++) {
      for (let c = 0; c < this.n; c++) {
        const color = this.grid[r][c];
        if (color === 'red' || color === 'blue') {
          cells.push([r, c, color]);
        }
      }
    }
    return { version: 1, size: this.n, symmetry: this.symmetryOn, cells };
  }

  loadState(state: BoardState): { size: number; symmetry: boolean } {
    const n = Math.max(2, Math.min(19, state.size));
    this.n = n;
    this.symmetryOn = state.symmetry;
    this.grid = this.makeGrid();
    for (const [r, c, color] of state.cells) {
      if (r >= 0 && r < n && c >= 0 && c < n) {
        this.grid[r][c] = color;
      }
    }
    this.render();
    return { size: this.n, symmetry: this.symmetryOn };
  }

  private makeGrid(): CellColor[][] {
    const grid: CellColor[][] = [];
    for (let r = 0; r < this.n; r++) {
      grid.push(new Array<CellColor>(this.n).fill('empty'));
    }
    return grid;
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

  private key(r: number, c: number): string {
    return `${r},${c}`;
  }

  private render() {
    while (this.svg.firstChild) this.svg.removeChild(this.svg.firstChild);
    this.cellElements.clear();

    const { width, height } = svgSize(this.n, HEX_SIZE);
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
    const size = HEX_SIZE;
    const w = Math.sqrt(3) * size;
    const h = 2 * size;
    const bandWidth = 8;

    const halfW = w / 2;
    const quarterH = h * 0.25;

    // Red borders: top-right and bottom-left edges (connect col extremes)
    // Blue borders: top-left and bottom-right edges (connect row extremes)
    // This matches traditional Hex: Red connects top↔bottom, Blue connects left↔right
    // Actually in standard Hex, let's say Red = top & bottom, Blue = left & right

    const ns = this.n;

    // Top border (red) — above row 0
    const topPts = [
      cellCenter(0, 0, size),
      cellCenter(0, ns - 1, size),
    ];
    const topPolyPts = [
      `${topPts[0].cx - halfW},${topPts[0].cy - quarterH}`,
      `${topPts[1].cx + halfW},${topPts[1].cy - quarterH}`,
      `${topPts[1].cx + halfW},${topPts[1].cy - quarterH - bandWidth}`,
      `${topPts[0].cx - halfW},${topPts[0].cy - quarterH - bandWidth}`,
    ].join(' ');
    this.appendBand(topPolyPts, '#c03030');

    // Bottom border (red) — below row n-1
    const botPts = [
      cellCenter(ns - 1, 0, size),
      cellCenter(ns - 1, ns - 1, size),
    ];
    const botPolyPts = [
      `${botPts[0].cx - halfW},${botPts[0].cy + quarterH}`,
      `${botPts[1].cx + halfW},${botPts[1].cy + quarterH}`,
      `${botPts[1].cx + halfW},${botPts[1].cy + quarterH + bandWidth}`,
      `${botPts[0].cx - halfW},${botPts[0].cy + quarterH + bandWidth}`,
    ].join(' ');
    this.appendBand(botPolyPts, '#c03030');

    // Left border (blue) — left of col 0
    const leftPts: string[] = [];
    for (let r = 0; r < ns; r++) {
      const { cx, cy } = cellCenter(r, 0, size);
      if (r === 0) {
        leftPts.push(`${cx - halfW},${cy - quarterH}`);
        leftPts.push(`${cx - halfW - bandWidth},${cy - quarterH}`);
      }
      leftPts.push(`${cx - halfW - bandWidth},${cy + quarterH}`);
      leftPts.push(`${cx - halfW},${cy + quarterH}`);
    }
    // close: walk back the inner edge
    const leftInnerBack: string[] = [];
    for (let r = ns - 1; r >= 0; r--) {
      const { cx, cy } = cellCenter(r, 0, size);
      leftInnerBack.push(`${cx - halfW},${cy + quarterH}`);
      leftInnerBack.push(`${cx - halfW},${cy - quarterH}`);
    }
    this.appendBand([...leftPts, ...leftInnerBack].join(' '), '#2a6ab9');

    // Right border (blue)
    const rightPts: string[] = [];
    for (let r = 0; r < ns; r++) {
      const { cx, cy } = cellCenter(r, ns - 1, size);
      if (r === 0) {
        rightPts.push(`${cx + halfW},${cy - quarterH}`);
        rightPts.push(`${cx + halfW + bandWidth},${cy - quarterH}`);
      }
      rightPts.push(`${cx + halfW + bandWidth},${cy + quarterH}`);
      rightPts.push(`${cx + halfW},${cy + quarterH}`);
    }
    const rightInnerBack: string[] = [];
    for (let r = ns - 1; r >= 0; r--) {
      const { cx, cy } = cellCenter(r, ns - 1, size);
      rightInnerBack.push(`${cx + halfW},${cy + quarterH}`);
      rightInnerBack.push(`${cx + halfW},${cy - quarterH}`);
    }
    this.appendBand([...rightPts, ...rightInnerBack].join(' '), '#2a6ab9');
  }

  private appendBand(points: string, fill: string) {
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', points);
    poly.setAttribute('fill', fill);
    poly.setAttribute('opacity', '0.55');
    this.svg.appendChild(poly);
  }

  private renderCell(r: number, c: number) {
    const { cx, cy } = cellCenter(r, c, HEX_SIZE);
    const disabled = isCellDisabled(r, c, this.n, this.symmetryOn);
    const color = this.grid[r][c];

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', `hex-cell${disabled ? ' disabled' : ''}`);

    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', hexVertices(cx, cy, HEX_SIZE - 1.5));
    this.applyCellStyle(poly, color, disabled);

    g.appendChild(poly);

    if (!disabled) {
      g.addEventListener('click', () => this.handleClick(r, c));
    }

    this.svg.appendChild(g);
    this.cellElements.set(this.key(r, c), g);
  }

  private applyCellStyle(poly: SVGPolygonElement, color: CellColor, disabled: boolean) {
    const { fill, stroke, strokeDash } = cellColorFill(color, disabled);
    poly.setAttribute('fill', fill);
    poly.setAttribute('stroke', stroke);
    poly.setAttribute('stroke-width', '1.5');
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
      for (let c = 0; c < this.n; c++) {
        this.updateCell(r, c);
      }
    }
  }

  private handleClick(r: number, c: number) {
    if (isCellDisabled(r, c, this.n, this.symmetryOn)) return;

    const useSymmetry = this.symmetryOn && this.n % 2 !== 0;

    if (useSymmetry) {
      this.handleSymmetricClick(r, c);
    } else {
      this.handleFreeClick(r, c);
    }
  }

  private handleSymmetricClick(r: number, c: number) {
    const group = symmetryGroup(r, c, this.n);
    const anyColored = group.entries.some(e => this.grid[e.row][e.col] !== 'empty');
    for (const entry of group.entries) {
      this.grid[entry.row][entry.col] = anyColored ? 'empty' : entry.color;
      this.updateCell(entry.row, entry.col);
    }
    this.onChange?.();
  }

  private handleFreeClick(r: number, c: number) {
    const cur = this.grid[r][c];
    this.grid[r][c] = cur === 'empty' ? 'red' : cur === 'red' ? 'blue' : 'empty';
    this.updateCell(r, c);
    this.onChange?.();
  }
}
