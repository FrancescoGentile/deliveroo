//
//
//

import { Hashable } from './hashable';

export class HashMap<K extends Hashable, V> {
  private readonly _map: Map<string, [K, V]>;

  public constructor(map?: Map<string, [K, V]>) {
    if (map !== undefined) {
      this._map = map;
    } else {
      this._map = new Map();
    }
  }

  public get(key: K): V | undefined {
    const entry = this._map.get(key.hash());
    return entry === undefined ? undefined : entry[1];
  }

  public set(key: K, value: V): void {
    this._map.set(key.hash(), [key, value]);
  }

  public has(key: K): boolean {
    return this._map.has(key.hash());
  }

  public delete(key: K): void {
    this._map.delete(key.hash());
  }

  public clear(): void {
    this._map.clear();
  }

  public entries(): IterableIterator<[K, V]> {
    return this._map.values();
  }

  public *values(): IterableIterator<V> {
    for (const [, value] of this._map.values()) {
      yield value;
    }
  }

  public forEach(callback: (value: V, key: K) => void): void {
    this._map.forEach(([key, value]) => callback(value, key));
  }

  public copy(): HashMap<K, V> {
    const map = new Map(this._map);
    return new HashMap(map);
  }

  public get size(): number {
    return this._map.size;
  }
}
