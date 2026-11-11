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

/** How much more one `work(large)` costs than one `work(small)`. The samples alternate and each
 *  side keeps its fastest, so a burst of load from other work slows both or neither. */
export function costRatio(work: (input: string) => void, small: string, large: string): number {
  let fastSmall = Infinity;
  let fastLarge = Infinity;
  for (let trial = 0; trial < 7; trial += 1) {
    fastSmall = Math.min(fastSmall, batchCost(work, small));
    fastLarge = Math.min(fastLarge, batchCost(work, large));
  }
  return fastLarge / fastSmall;
}
