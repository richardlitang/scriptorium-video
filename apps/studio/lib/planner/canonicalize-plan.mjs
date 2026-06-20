import { prepareVideoPlanForSchema } from "@lvstudio/core";

export function canonicalizePlanForPersistence(plan = {}) {
  const prepared = prepareVideoPlanForSchema(plan);
  if (!prepared || typeof prepared !== "object" || Array.isArray(prepared)) return { sections: [] };
  return {
    ...prepared,
    sections: Array.isArray(prepared.sections) ? prepared.sections : [],
  };
}
