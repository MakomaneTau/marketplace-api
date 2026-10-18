// Supabase encodes the URL; quote the value for PostgREST's logical-filter grammar.
// User punctuation must remain data rather than creating another OR expression.
export function searchPattern(value) {
  const pattern = `%${value.replace(/[\\%_]/g, "\\$&")}%`;
  return `"${pattern.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
