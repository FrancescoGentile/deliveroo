//
//
//

import { Parcel } from 'src/domain/structs';

import { Environment } from 'src/domain/environment';
import { Hashable } from 'src/utils';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface State<T> {
  availableParcels: T[];

  readonly pickedParcels: Parcel[];

  readonly arrivalTime: number;

  readonly environment: Environment;
}

export class NodeID implements Hashable {
  private static _counter = 0;

  private readonly _id: string;

  public constructor(id: string) {
    this._id = id;
  }

  public static new(): NodeID {
    const id = NodeID._counter.toString();
    NodeID._counter += 1;

    return new NodeID(id);
  }

  public hash(): string {
    return this._id;
  }
}
