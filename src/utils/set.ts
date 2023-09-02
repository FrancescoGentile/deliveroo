//
//
//

import { Hashable } from './interfaces';

export class HashSet<V extends Hashable> {
  private readonly _map: Map<string, V> = new Map();

  public constructor(values?: V[]) {
    if (values) {
      for (const value of values) {
        this.add(value);
      }
    }
  }

  public add(value: V): void {
    this._map.set(value.hash(), value);
  }

  public has(value: V): boolean {
    return this._map.has(value.hash());
  }

  public delete(value: V): void {
    this._map.delete(value.hash());
  }

  public clear(): void {
    this._map.clear();
  }

  public clone(): HashSet<V> {
    const clone = new HashSet<V>();
    for (const value of this.values()) {
      clone.add(value);
    }

    return clone;
  }

  public values(): IterableIterator<V> {
    return this._map.values();
  }

  public forEach(callback: (value: V) => void): void {
    this._map.forEach((value) => callback(value));
  }

  public get size(): number {
    return this._map.size;
  }
}
