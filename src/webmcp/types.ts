export type StableToolError = {
  code: string;
  message: string;
  details: Record<string, unknown>;
};

export type StableToolMeta = {
  request_id: string;
  truncated?: boolean;
  max_bytes?: number;
};

export type StableToolOk<T> = {
  ok: true;
  data: T;
  meta: StableToolMeta;
};

export type StableToolErr = {
  ok: false;
  error: StableToolError;
  meta: StableToolMeta;
};

export type StableToolResult<T = unknown> = StableToolOk<T> | StableToolErr;

