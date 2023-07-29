//
//
//

import { Duration } from './time';

/**
 * Merges two sorted arrays into a single sorted array.
 * @param a The first array.
 * @param b The second array.
 * @param compare The comparison function.
 * Should return a negative number if the first argument should be sorted before the second,
 * a positive number if the first argument should be sorted after the second, and 0 if the order
 * does not matter. The function should be consistent with the sorting order of the arrays.
 * @returns The merged array.
 */
export function merge<T>(a: T[], b: T[], compare: (a: T, b: T) => number): T[] {
  const res = new Array(a.length + b.length);

  let i = 0;
  let j = 0;
  let k = 0;

  while (i < a.length && j < b.length) {
    if (compare(a[i], b[j]) <= 0) {
      res[k] = a[i];
      i += 1;
    } else {
      res[k] = b[j];
      j += 1;
    }
    k += 1;
  }

  while (i < a.length) {
    res[k] = a[i];
    i += 1;
    k += 1;
  }

  while (j < b.length) {
    res[k] = b[j];
    j += 1;
    k += 1;
  }

  return res;
}

/**
 * Returns a random integer between a and b (exclusive) if b is specified,
 * otherwise between 0 and a (exclusive).
 * @param a If b is specified, this is the min value, otherwise this is the max value.
 * @param b If specified, this is the max value.
 * @returns The random integer.
 */
export function getRandomInt(a: number, b?: number): number {
  let max;
  let min;

  if (b === undefined) {
    max = a;
    min = 0;
  } else {
    max = b;
    min = a;
  }

  return Math.floor(Math.random() * (max - min) + min);
}

export function sleep(duration: Duration): Promise<void> {
  // eslint-disable-next-line no-promise-executor-return
  return new Promise((resolve) => setTimeout(resolve, duration.milliseconds));
}
