//
//
//

/**
 * GridSize is a model that represents the size of a grid.
 */
export class GridSize {
  public readonly rows: number;

  public readonly columns: number;

  private constructor(rows: number, columns: number) {
    this.rows = rows;
    this.columns = columns;
  }

  public static new(rows: number, columns: number): GridSize {
    return new GridSize(rows, columns);
  }
}
