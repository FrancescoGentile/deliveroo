//
//
//

import { Socket, io } from 'socket.io-client';
import {
  Direction,
  ParcelID,
  Parcel,
  Tile,
  Position,
  Config,
  GridSize,
} from 'src/domain/models';
import { Server } from 'src/domain/ports';
import { HashSet } from 'src/utils';
import * as utils from './utils';

export class SocketIOServer implements Server {
  private constructor(
    private readonly _socket: Socket,
    public readonly config: Config,
    public readonly gridSize: GridSize,
    public readonly crossableTiles: Tile[],
    public readonly initialPosition: Position
  ) {}

  public static async new(
    host: string,
    token: string
  ): Promise<SocketIOServer> {
    const socket = io(host, {
      extraHeaders: {
        'x-token': token,
      },
      autoConnect: true,
    });

    const [config, location, [size, tiles]] = await Promise.all([
      utils.getConfig(socket),
      utils.getInitialLocation(socket),
      utils.getMap(socket),
    ]);

    return new SocketIOServer(socket, config, size, tiles, location);
  }

  public onParcelsSensing(callback: (parcels: [Parcel, Position][]) => void) {
    this._socket.on('parcels sensing', (parcels) => {
      const newParcels: [Parcel, Position][] = [];
      // eslint-disable-next-line no-restricted-syntax
      for (const parcel of parcels) {
        newParcels.push([
          Parcel.new(parcel.id, parcel.reward),
          Position.new(parcel.x, parcel.y),
        ]);
      }

      callback(newParcels);
    });
  }

  public async move(direction: Direction): Promise<boolean> {
    return new Promise((resolve, _reject) => {
      this._socket.emit(
        'move',
        direction,
        (response: boolean | PromiseLike<boolean>) => {
          resolve(response);
        }
      );
    });
  }

  public async pickUp(): Promise<HashSet<ParcelID>> {
    return new Promise((resolve, _reject) => {
      this._socket.emit('pickup', (response: any[]) => {
        const parcels: HashSet<ParcelID> = new HashSet<ParcelID>();
        // eslint-disable-next-line no-restricted-syntax
        for (const parcel of response) {
          parcels.add(ParcelID.new(parcel.id));
        }

        resolve(parcels);
      });
    });
  }

  public async putDown(parcels: Parcel[] | null): Promise<HashSet<ParcelID>> {
    return new Promise((resolve, _reject) => {
      const idsString =
        parcels !== null
          ? parcels.map((parcel) => parcel._id.toString())
          : null;
      this._socket.emit('putdown', idsString, (response: any[]) => {
        const putDownParcels: HashSet<ParcelID> = new HashSet<ParcelID>();
        // eslint-disable-next-line no-restricted-syntax
        for (const parcel of response) {
          putDownParcels.add(ParcelID.new(parcel.id));
        }

        resolve(putDownParcels);
      });
    });
  }
}
