const FORMULA_RE = /^[=+\-@\t]/;

/**
 * Sanitize + escape a cell value for CSV output.
 * 1. Formula injection: prepends ' to values starting with = + - @ or tab
 * 2. Standard CSV escaping: quotes fields containing commas, newlines, or double-quotes
 */
export function csvCell(v: string | number | null | undefined): string {
  if (v == null) return '';
  let s = String(v);
  if (FORMULA_RE.test(s)) s = "'" + s;
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/**
 * Strip leading formula injection characters from an import value before DB storage.
 * Removes leading = + - @ or tab characters (repeatedly, in case of stacking like "=+CMD()").
 */
export function sanitizeImport(v: string): string {
  let s = v;
  while (s.length > 0 && FORMULA_RE.test(s)) {
    s = s.slice(1);
  }
  return s;
}
