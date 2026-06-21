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
    if (!(key in context)) {
      throw new Error(`[studio-routes] Missing dependency "${key}" for ${moduleName}.`);
    }
  }
}
