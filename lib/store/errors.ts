/**
 * 저장소 계층이 던지는 오류. HTTP 계층(lib/wiki/http.ts)이 상태 코드로 바꾼다.
 */
export type StoreErrorCode =
  | "bad_path"
  | "bad_request"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "exists"
  | "too_large"
  | "unsupported_type"
  | "read_only"
  | "unavailable"
  | "git_failed";

const STATUS: Record<StoreErrorCode, number> = {
  bad_path: 400,
  bad_request: 400,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  exists: 409,
  too_large: 413,
  unsupported_type: 415,
  read_only: 503,
  unavailable: 503,
  git_failed: 500,
};

export class StoreError extends Error {
  readonly code: StoreErrorCode;
  readonly status: number;
  readonly extra: Record<string, unknown>;

  constructor(
    code: StoreErrorCode,
    message: string,
    extra: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "StoreError";
    this.code = code;
    this.status = STATUS[code];
    this.extra = extra;
  }
}

export function isStoreError(e: unknown): e is StoreError {
  return e instanceof StoreError;
}
