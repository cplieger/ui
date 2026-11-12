const SMALL = 1024;
const LARGE = 64 * 1024;

/** Below it, `costRatio` reads as linear: 64 times the input costs about 64 times the work when
 *  linear and 4096 times when quadratic, and the bound sits between them, at 64^1.5. */
export const LINEAR_BOUND = 512;

/** Milliseconds for one `work(input)`, over enough runs to span 15 ms: some engines' timers tick
 *  at 1 ms. */
function batchCost(work: (input: string) => void, input: string): number {
  let runs = 0;
  const start = performance.now();
  let now: number;
  do {
    work(input);
    runs += 1;
    now = performance.now();
  } while (now - start < 15);
  return (now - start) / runs;
}

/** How much more `work` costs on `generate` of 64 KiB than of 1 KiB. Load from other work comes in
 *  bursts, so each large batch is set against the small batches on either side of it, and the
 *  median of those ratios drops the trials a burst hit on one side only. */
export function costRatio(work: (input: string) => void, generate: (n: number) => string): number {
  const small = generate(SMALL);
  const large = generate(LARGE);
  const ratios: number[] = [];
  for (let trial = 0; trial < 7; trial += 1) {
    const before = batchCost(work, small);
    const cost = batchCost(work, large);
    const after = batchCost(work, small);
    ratios.push((2 * cost) / (before + after));
  }
  ratios.sort((a, b) => a - b);
  return ratios[3] ?? Infinity;
}
