//
//
//

/**
 * Returns the k largest elements from the given array (not sorted).
 *
 * @param elements The array of elements
 * @param k The number of elements to return
 *
 * @returns The k largest elements and their indexes in the original array
 */
export function kmax(elements: number[], k: number): [number[], number[]] {
    if (k < 0 || k > elements.length) {
        throw new Error("Invalid value for k");
    }

    const array: [number, number][] = elements.map((e, i) => [e, i]);

    // Quickselect algorithm
    let left = 0;
    let right = array.length - 1;
    while (right > left) {
        let pivotIndex = Math.floor(Math.random() * (right - left + 1)) + left;
        pivotIndex = partition(array, left, right, pivotIndex);
        if (k === pivotIndex) {
            break;
        }
        if (k < pivotIndex) {
            right = pivotIndex - 1;
        } else {
            left = pivotIndex + 1;
        }
    }

    const partition1 = array.slice(0, k);

    const values = partition1.map((e) => e[0]);
    const indexes = partition1.map((e) => e[1]);

    return [values, indexes];
}

function partition(
    array: [number, number][],
    left: number,
    right: number,
    pivotIndex: number,
): number {
    const pivotValue = array[pivotIndex][0];
    let i = left;

    // Move pivot to end
    [array[pivotIndex], array[right]] = [array[right], array[pivotIndex]];

    for (let j = left; j < right; j += 1) {
        if (array[j][0] > pivotValue) {
            [array[i], array[j]] = [array[j], array[i]];
            i += 1;
        }
    }

    // Move pivot to its final place
    [array[i], array[right]] = [array[right], array[i]];

    return i;
}
