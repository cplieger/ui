/**
 * qr.ts — `qrCode()` draws a text as a QR code symbol (ISO/IEC 18004) in an
 * SVG, encoded in the page, so a secret such as an `otpauth://` URI never
 * leaves it. `encodeQr()` gives the symbol's modules for another drawing.
 * @module
 */

export type QrLevel = "L" | "M" | "Q" | "H";
export type QrMode = "numeric" | "alphanumeric" | "byte";

export interface QrSymbol {
  /** 1 to 40; the side is `4 × version + 17` modules. */
  readonly version: number;
  readonly level: QrLevel;
  /** The data mask the standard's penalty rules chose, 0 to 7. */
  readonly mask: number;
  readonly mode: QrMode;
  /** Modules per side, with no quiet zone. */
  readonly size: number;
  /** Row by row, 1 for a dark module. */
  readonly modules: Uint8Array;
}

export interface QrOptions {
  /** Error correction: about 7, 15, 25 or 30% of the symbol recoverable.
   *  Default "M". */
  readonly level?: QrLevel;
  /** The image's accessible name. Default none: the image is hidden from
   *  assistive technology, as the text beside it is the alternative. */
  readonly label?: string;
  /** The light margin, in modules. Default and least 4, as the standard
   *  requires; a smaller or fractional value throws a `RangeError`. */
  readonly quiet?: number;
}

const SVG = "http://www.w3.org/2000/svg";
const ALPHANUMERIC = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
// The level's two format bits (Table 12).
const FORMAT: Record<QrLevel, number> = { L: 1, M: 0, Q: 3, H: 2 };
const LEVELS: Record<QrLevel, number> = { L: 0, M: 1, Q: 2, H: 3 };

// Table 9, by level then version (index 0 unused): error correction
// codewords per block, then the number of blocks.
const ECC_PER_BLOCK = [
  [
    0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30,
    30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  ],
  [
    0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28,
    28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
  ],
  [
    0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30,
    30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  ],
  [
    0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30,
    30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  ],
] as const;
const BLOCKS = [
  [
    0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14,
    15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25,
  ],
  [
    0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25,
    26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
  ],
  [
    0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34,
    34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68,
  ],
  [
    0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37,
    40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81,
  ],
] as const;

const at = (table: readonly (readonly number[])[], level: QrLevel, version: number): number =>
  table[LEVELS[level]]?.[version] ?? 0;

// Modules left for data and error correction once the function patterns
// and the format and version information are placed.
function rawModules(version: number): number {
  let n = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    n -= (25 * align - 10) * align - 55;
    if (version >= 7) {
      n -= 36;
    }
  }
  return n;
}

const dataCodewords = (version: number, level: QrLevel): number =>
  Math.floor(rawModules(version) / 8) -
  at(ECC_PER_BLOCK, level, version) * at(BLOCKS, level, version);

// Table 3: the character count indicator's length by version range.
function countBits(mode: QrMode, version: number): number {
  const range = version <= 9 ? 0 : version <= 26 ? 1 : 2;
  const bits = { numeric: [10, 12, 14], alphanumeric: [9, 11, 13], byte: [8, 16, 16] }[mode];
  return bits[range] ?? 0;
}

class Bits {
  readonly bits: number[] = [];
  put(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i--) {
      this.bits.push((value >>> i) & 1);
    }
  }
}

function modeOf(text: string): QrMode {
  if (/^\d*$/.test(text)) {
    return "numeric";
  }
  if (/^[\d A-Z$%*+\-./:]*$/.test(text)) {
    return "alphanumeric";
  }
  return "byte";
}

function segment(text: string, mode: QrMode): { bits: number[]; count: number } {
  const out = new Bits();
  if (mode === "numeric") {
    for (let i = 0; i < text.length; i += 3) {
      const group = text.slice(i, i + 3);
      out.put(Number(group), group.length * 3 + 1);
    }
    return { bits: out.bits, count: text.length };
  }
  if (mode === "alphanumeric") {
    for (let i = 0; i < text.length; i += 2) {
      const a = ALPHANUMERIC.indexOf(text.charAt(i));
      if (i + 1 < text.length) {
        out.put(a * 45 + ALPHANUMERIC.indexOf(text.charAt(i + 1)), 11);
      } else {
        out.put(a, 6);
      }
    }
    return { bits: out.bits, count: text.length };
  }
  const bytes = new TextEncoder().encode(text);
  for (const b of bytes) {
    out.put(b, 8);
  }
  return { bits: out.bits, count: bytes.length };
}

// GF(256) over x^8 + x^4 + x^3 + x^2 + 1.
function multiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function generator(degree: number): number[] {
  const g = Array.from({ length: degree }, () => 0);
  g[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      g[j] = multiply(g[j] ?? 0, root) ^ (g[j + 1] ?? 0);
    }
    root = multiply(root, 2);
  }
  return g;
}

function remainder(data: readonly number[], divisor: readonly number[]): number[] {
  const r = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ (r.shift() ?? 0);
    r.push(0);
    divisor.forEach((c, i) => {
      r[i] = (r[i] ?? 0) ^ multiply(c, factor);
    });
  }
  return r;
}

// The data codewords split into blocks, each followed by its error
// correction, then interleaved column by column (section 7.6).
function interleave(data: readonly number[], version: number, level: QrLevel): number[] {
  const blocks = at(BLOCKS, level, version);
  const ecc = at(ECC_PER_BLOCK, level, version);
  const raw = Math.floor(rawModules(version) / 8);
  const short = blocks - (raw % blocks);
  const shortLength = Math.floor(raw / blocks);
  const divisor = generator(ecc);
  const all: number[][] = [];
  for (let i = 0, k = 0; i < blocks; i++) {
    const part = data.slice(k, k + shortLength - ecc + (i < short ? 0 : 1));
    k += part.length;
    const check = remainder(part, divisor);
    if (i < short) {
      part.push(0);
    }
    all.push([...part, ...check]);
  }
  const out: number[] = [];
  for (let i = 0; i < shortLength + 1; i++) {
    all.forEach((block, j) => {
      if (i !== shortLength - ecc || j >= short) {
        out.push(block[i] ?? 0);
      }
    });
  }
  return out;
}

function alignments(version: number): number[] {
  if (version === 1) {
    return [];
  }
  const size = version * 4 + 17;
  const count = Math.floor(version / 7) + 2;
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const out = [6];
  for (let pos = size - 7; out.length < count; pos -= step) {
    out.splice(1, 0, pos);
  }
  return out;
}

const MASKS: readonly ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

class Grid {
  readonly size: number;
  readonly dark: Uint8Array;
  readonly fixed: Uint8Array;
  constructor(size: number) {
    this.size = size;
    this.dark = new Uint8Array(size * size);
    this.fixed = new Uint8Array(size * size);
  }
  get(x: number, y: number): number {
    return this.dark[y * this.size + x] ?? 0;
  }
  set(x: number, y: number, dark: boolean): void {
    this.dark[y * this.size + x] = dark ? 1 : 0;
    this.fixed[y * this.size + x] = 1;
  }
}

function drawFunctions(grid: Grid, version: number): void {
  const { size } = grid;
  for (let i = 0; i < size; i++) {
    grid.set(6, i, i % 2 === 0);
    grid.set(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [
    [3, 3],
    [size - 4, 3],
    [3, size - 4],
  ] as const) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        const ring = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < size && y >= 0 && y < size) {
          grid.set(x, y, ring !== 2 && ring !== 4);
        }
      }
    }
  }
  const centres = alignments(version);
  const last = centres.length - 1;
  centres.forEach((cx, i) => {
    centres.forEach((cy, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) {
        return;
      }
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          grid.set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    });
  });
  drawFormat(grid, "L", 0);
  if (version >= 7) {
    let r = version;
    for (let i = 0; i < 12; i++) {
      r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    }
    const bits = (version << 12) | r;
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      grid.set(a, b, dark);
      grid.set(b, a, dark);
    }
  }
}

// The format information's 15 bits, BCH-coded and masked (section 7.9),
// in both copies, and the dark module beside the lower copy.
function drawFormat(grid: Grid, level: QrLevel, mask: number): void {
  const { size } = grid;
  const data = (FORMAT[level] << 3) | mask;
  let r = data;
  for (let i = 0; i < 10; i++) {
    r = (r << 1) ^ ((r >>> 9) * 0x537);
  }
  const bits = ((data << 10) | r) ^ 0x5412;
  const bit = (i: number): boolean => ((bits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) {
    grid.set(8, i, bit(i));
  }
  grid.set(8, 7, bit(6));
  grid.set(8, 8, bit(7));
  grid.set(7, 8, bit(8));
  for (let i = 9; i < 15; i++) {
    grid.set(14 - i, 8, bit(i));
  }
  for (let i = 0; i < 8; i++) {
    grid.set(size - 1 - i, 8, bit(i));
  }
  for (let i = 8; i < 15; i++) {
    grid.set(8, size - 15 + i, bit(i));
  }
  grid.set(8, size - 8, true);
}

// The codewords' bits in the two-module-wide zigzag from the lower right
// (section 7.7.3), skipping the function patterns and the timing column.
function drawData(grid: Grid, codewords: readonly number[]): void {
  const { size } = grid;
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) {
      right = 5;
    }
    const upward = ((right + 1) & 2) === 0;
    for (let v = 0; v < size; v++) {
      const y = upward ? size - 1 - v : v;
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        if (grid.fixed[y * size + x] === 1) {
          continue;
        }
        const word = codewords[i >>> 3] ?? 0;
        grid.dark[y * size + x] = (word >>> (7 - (i & 7))) & 1;
        i++;
      }
    }
  }
}

function applyMask(grid: Grid, mask: number): void {
  const test = MASKS[mask] ?? (() => false);
  for (let y = 0; y < grid.size; y++) {
    for (let x = 0; x < grid.size; x++) {
      const i = y * grid.size + x;
      if (grid.fixed[i] === 0 && test(x, y)) {
        grid.dark[i] = (grid.dark[i] ?? 0) ^ 1;
      }
    }
  }
}

// The four penalty rules of section 7.8.3. A finder-like run counts the
// light quiet zone around the symbol as light modules.
function penalty(grid: Grid): number {
  const { size } = grid;
  let score = 0;
  const finders = (runs: number[]): number => {
    const n = runs[1] ?? 0;
    const core = n > 0 && runs[2] === n && runs[3] === n * 3 && runs[4] === n && runs[5] === n;
    const before = core && (runs[0] ?? 0) >= n * 4 && (runs[6] ?? 0) >= n ? 1 : 0;
    const after = core && (runs[6] ?? 0) >= n * 4 && (runs[0] ?? 0) >= n ? 1 : 0;
    return before + after;
  };
  const line = (get: (i: number) => number): void => {
    const runs = [0, 0, 0, 0, 0, 0, 0];
    const push = (length: number): void => {
      runs.pop();
      runs.unshift(runs[0] === 0 ? length + size : length);
    };
    let colour = 0;
    let run = 0;
    for (let i = 0; i < size; i++) {
      if (get(i) === colour) {
        run++;
        if (run === 5) {
          score += 3;
        } else if (run > 5) {
          score++;
        }
      } else {
        push(run);
        if (colour === 0) {
          score += finders(runs) * 40;
        }
        colour = get(i);
        run = 1;
      }
    }
    if (colour === 1) {
      push(run);
      run = 0;
    }
    push(run + size);
    score += finders(runs) * 40;
  };
  for (let y = 0; y < size; y++) {
    line((x) => grid.get(x, y));
  }
  for (let x = 0; x < size; x++) {
    line((y) => grid.get(x, y));
  }
  let dark = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = grid.get(x, y);
      dark += c;
      if (
        x < size - 1 &&
        y < size - 1 &&
        c === grid.get(x + 1, y) &&
        c === grid.get(x, y + 1) &&
        c === grid.get(x + 1, y + 1)
      ) {
        score += 3;
      }
    }
  }
  const total = size * size;
  score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return score;
}

/** Encodes `text` in one segment of the smallest mode that holds it
 *  (numeric, alphanumeric, else byte as UTF-8) in the smallest version at
 *  `level`. Throws a `RangeError` when version 40 cannot hold it. */
export function encodeQr(text: string, level: QrLevel = "M"): QrSymbol {
  if (!Object.hasOwn(LEVELS, level)) {
    throw new RangeError(`unknown QR error correction level ${level}`);
  }
  const mode = modeOf(text);
  const { bits, count } = segment(text, mode);
  let version = 1;
  for (; version <= 40; version++) {
    const needed = 4 + countBits(mode, version) + bits.length;
    if (count < 2 ** countBits(mode, version) && needed <= dataCodewords(version, level) * 8) {
      break;
    }
  }
  if (version > 40) {
    throw new RangeError(`the text needs more than a version 40 QR code holds at level ${level}`);
  }

  const capacity = dataCodewords(version, level) * 8;
  const out = new Bits();
  out.put({ numeric: 1, alphanumeric: 2, byte: 4 }[mode], 4);
  out.put(count, countBits(mode, version));
  out.bits.push(...bits);
  out.put(0, Math.min(4, capacity - out.bits.length));
  out.put(0, (8 - (out.bits.length % 8)) % 8);
  const data: number[] = [];
  for (let i = 0; i < out.bits.length; i += 8) {
    data.push(out.bits.slice(i, i + 8).reduce((byte, b) => (byte << 1) | b, 0));
  }
  for (let pad = 0xec; data.length < capacity / 8; pad ^= 0xec ^ 0x11) {
    data.push(pad);
  }

  const size = version * 4 + 17;
  const grid = new Grid(size);
  drawFunctions(grid, version);
  drawData(grid, interleave(data, version, level));
  let mask = 0;
  let best = Infinity;
  for (let m = 0; m < 8; m++) {
    applyMask(grid, m);
    drawFormat(grid, level, m);
    const score = penalty(grid);
    if (score < best) {
      best = score;
      mask = m;
    }
    applyMask(grid, m);
  }
  applyMask(grid, mask);
  drawFormat(grid, level, mask);
  return { version, level, mask, mode, size, modules: grid.dark };
}

/** Draws `text` as a QR code: an `svg.cp-qr` of one path, its viewBox in
 *  modules with the quiet zone. Throws as `encodeQr` does. */
export function qrCode(text: string, options: QrOptions = {}): SVGSVGElement {
  const quiet = options.quiet ?? 4;
  if (!Number.isInteger(quiet) || quiet < 4) {
    throw new RangeError("a QR code's quiet zone is at least 4 modules");
  }
  const symbol = encodeQr(text, options.level);
  const { size, modules } = symbol;
  const side = size + quiet * 2;
  let d = "";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (modules[y * size + x] !== 1) {
        continue;
      }
      let run = 1;
      while (x + run < size && modules[y * size + x + run] === 1) {
        run++;
      }
      d += `M${x + quiet} ${y + quiet}h${run}v1h-${run}z`;
      x += run;
    }
  }
  const svg = document.createElementNS(SVG, "svg");
  svg.classList.add("cp-qr");
  svg.setAttribute("viewBox", `0 0 ${side} ${side}`);
  svg.setAttribute("shape-rendering", "crispEdges");
  if (options.label === undefined) {
    svg.setAttribute("aria-hidden", "true");
  } else {
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", options.label);
  }
  const path = document.createElementNS(SVG, "path");
  path.setAttribute("d", d);
  svg.append(path);
  return svg;
}
