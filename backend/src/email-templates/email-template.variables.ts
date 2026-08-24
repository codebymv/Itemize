export const extractEmailTemplateVariables = (...values: Array<string | null>): string[] => {
  const variables: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    for (const match of value.matchAll(/\{\{(\w+)\}\}/g)) {
      const variable = match[1];
      if (!seen.has(variable)) {
        seen.add(variable);
        variables.push(variable);
      }
    }
  }
  return variables;
};
