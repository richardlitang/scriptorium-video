export function pickRouteContext<
  Context extends Record<string, unknown>,
  const Keys extends readonly Extract<keyof Context, string>[],
>(context: Context, moduleName: string, keys: Keys): Pick<Context, Keys[number]> {
  const scoped = {} as Pick<Context, Keys[number]>;
  for (const key of keys) {
    if (!(key in context)) {
      throw new Error(`[studio-routes] Missing dependency "${String(key)}" for ${moduleName}.`);
    }
    scoped[key] = context[key] as Pick<Context, Keys[number]>[typeof key];
  }
  return scoped;
}

export function requireRouteContext<
  Context extends Record<string, unknown>,
  const Keys extends readonly Extract<keyof Context, string>[],
>(context: Context, moduleName: string, keys: Keys): void {
  for (const key of keys) {
    if (!(key in context)) {
      throw new Error(`[studio-routes] Missing dependency "${String(key)}" for ${moduleName}.`);
    }
  }
}
