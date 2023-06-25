//
//
//

import { AgentID } from './agent';
import { Position } from './location';
import { Parcel } from './parcel';

export interface EnviromentChange {
  newFreeParcels: [Parcel, Position][];
  nowCarriedParcels: [Parcel, AgentID][];
}
