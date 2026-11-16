import { DURATION_EDGES } from "../../frame/limits.js";

const THREE_DAYS = 259_200;

/** chartdata's duration ladder in seconds, from 0 to its first edge at or
 *  above `max`, as a server bins delays on it: 3 days by default. */
export function ladder(max = THREE_DAYS): readonly number[] {
  return DURATION_EDGES.slice(0, DURATION_EDGES.findIndex((edge) => edge >= max) + 1);
}
