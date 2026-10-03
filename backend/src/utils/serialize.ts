/**
 * Converts Prisma Decimal values to plain numbers (recursively) so the API
 * always returns numeric money values instead of strings.
 */
export function toPlain(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(toPlain);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.toNumber === 'function' && typeof obj.toFixed === 'function') {
      return (obj as unknown as { toNumber: () => number }).toNumber();
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = toPlain(v);
    return out;
  }
  return value;
}

export const num = (v: unknown): number => Number(v ?? 0);
