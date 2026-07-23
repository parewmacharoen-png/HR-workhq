// ============================================================================
// shared/kernel/result.ts
// Lightweight Result type for explicit success/failure without throwing.
// ============================================================================

export class Result<T> {
  private constructor(
    public readonly isSuccess: boolean,
    private readonly _value?: T,
    public readonly error?: string,
  ) {}

  static ok<U>(value?: U): Result<U> {
    return new Result<U>(true, value);
  }

  static fail<U>(error: string): Result<U> {
    return new Result<U>(false, undefined, error);
  }

  getValue(): T {
    if (!this.isSuccess) {
      throw new Error(`Cannot get value of a failed result: ${this.error}`);
    }
    return this._value as T;
  }
}
