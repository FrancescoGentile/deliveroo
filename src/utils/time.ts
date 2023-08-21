//
//
//

// ---------------------------------------------------------------------------
// Instant
// ---------------------------------------------------------------------------

export class Instant {
  private constructor(private readonly _value: number) {}

  public static now(): Instant {
    return new Instant(Date.now());
  }

  public static fromMilliseconds(milliseconds: number): Instant {
    return new Instant(milliseconds);
  }

  public get milliseconds(): number {
    return this._value;
  }

  public add(duration: Duration): Instant {
    return new Instant(this._value + duration.milliseconds);
  }

  public subtract(other: Instant): Duration {
    return Duration.fromMilliseconds(this._value - other._value);
  }

  public equals(other: Instant): boolean {
    return this._value === other._value;
  }

  public serialize(): string {
    return this._value.toString();
  }

  public static deserialize(serialized: string): Instant {
    return new Instant(parseInt(serialized, 10));
  }
}

// ---------------------------------------------------------------------------
// Duration
// ---------------------------------------------------------------------------

export class Duration {
  private constructor(private readonly _value: number) {}

  public static fromMilliseconds(milliseconds: number): Duration {
    return new Duration(milliseconds);
  }

  public get milliseconds(): number {
    return this._value;
  }

  public add(other: Duration): Duration {
    return new Duration(this._value + other._value);
  }

  public multiply(factor: number): Duration {
    return new Duration(this._value * factor);
  }

  public equals(other: Duration): boolean {
    return this._value === other._value;
  }

  public serialize(): string {
    return this._value.toString();
  }

  public static deserialize(serialized: string): Duration {
    return new Duration(parseInt(serialized, 10));
  }
}
