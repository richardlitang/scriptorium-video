export function pickRouteContext<
  TContext extends Record<string, unknown>,
  const TKeys extends readonly Extract<keyof TContext, string>[],
>(context: TContext, moduleName: string, keys: TKeys): Pick<TContext, TKeys[number]> {
  const scoped = {} as Pick<TContext, TKeys[number]>;
  for (const key of keys) {
    if (!(key in context)) {
      throw new Error(`[studio-routes] Missing dependency "${key}" for ${moduleName}.`);
    }
    scoped[key] = context[key];
  }
  return scoped;
}

export function requireRouteContext<TContext extends Record<string, unknown>>(
  context: TContext,
  moduleName: string,
  keys: readonly Extract<keyof TContext, string>[],
): void {
  for (const key of keys) {
    const segments = key.split(".");
    let value: unknown = context;
    for (const segment of segments) {
      if (!value || typeof value !== "object" || !(segment in value)) {
        const kind = segments.length > 1 ? "capability" : "dependency";
        throw new Error(`[studio-routes] Missing ${kind} "${key}" for ${moduleName}.`);
      }
      value = (value as Record<string, unknown>)[segment];
    }
  }
}
