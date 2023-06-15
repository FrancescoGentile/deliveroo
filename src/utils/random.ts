//
//
//

/**
 * Returns a random integer between a and b (exclusive) if b is specified,
 * otherwise between 0 and a (exclusive)
 * @param a if b is specified, this is the min value, otherwise this is the max value
 * @param b if specified, this is the max value
 * @returns the random integer
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
