export function pickRouteContext(context, moduleName, keys) {
  const scoped = {};
  for (const key of keys) {
    if (!(key in context)) {
      throw new Error(`[studio-routes] Missing dependency "${key}" for ${moduleName}.`);
    }
    scoped[key] = context[key];
  }
  return scoped;
}

export function requireRouteContext(context, moduleName, keys) {
  for (const key of keys) {
    if (!(key in context)) {
      throw new Error(`[studio-routes] Missing dependency "${key}" for ${moduleName}.`);
    }
  }
}
