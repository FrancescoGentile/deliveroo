//
//
//

import { Duration } from "./time";

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
    let max: number;
    let min: number;

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

/**
 * Returns a random element from the given array.
 * @param weights The weights of the elements.
 * @param values The elements.
 * @returns The index and the value of the random element.
 */
export function categoricalSample<T>(weights: number[], values: T[]): [number, T] {
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const random = Math.random() * totalWeight;

    let i = 0;
    let w = weights[i];

    while (w < random) {
        i += 1;
        w += weights[i];
    }

    return [i, values[i]];
}

/**
 * Returns the normalized entropy of the given counts.
 *
 * @param counts The counts.
 *
 * @returns The normalized entropy.
 *
 * @throws {Error} If the counts are empty.
 */
export function normalized_entropy(counts: number[]): number {
    if (counts.length === 0) {
        throw new Error("Counts cannot be empty.");
    }

    if (counts.length === 1) {
        return 1;
    }

    const total = counts.reduce((a, b) => a + b, 0);
    const entropy = counts.reduce((a, b) => a + (b / total) * Math.log2(b / total), 0);
    return -entropy / Math.log2(counts.length);
}

/**
 * Shuffles the given array in place.
 *
 * @param array The array.
 *
 * @returns The shuffled array (the same as the input array).
 */
export function shuffle_in_place<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i -= 1) {
        const j = getRandomInt(i + 1);
        [array[i], array[j]] = [array[j], array[i]];
    }

    return array;
}

/**
 * Returns a shuffled copy of the given array.
 *
 * @param array The array.
 *
 * @returns The shuffled array.
 */
export function shuffle<T>(array: T[]): T[] {
    const res = array.slice();
    return shuffle_in_place(res);
}
