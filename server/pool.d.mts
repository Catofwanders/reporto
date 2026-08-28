/** Run `job` over `items`, at most `limit` at a time, preserving input order. */
export function pooled<T, R>(
  items: T[],
  limit: number,
  job: (item: T, index: number) => Promise<R>,
): Promise<(R | undefined)[]>;
