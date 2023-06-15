//
//
//

import { Hashable } from './hashable';

export class HashSet<V extends Hashable> {
  private readonly _map: Map<string, V> = new Map();

  public static new<V extends Hashable>(): HashSet<V> {
    return new HashSet();
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
