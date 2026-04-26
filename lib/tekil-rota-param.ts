/**
 * Next.js App Router `useParams()[name]` değerleri `string | string[] | undefined`
 * olabildiğinden, dinamik segmenti tek dizeye indirger.
 */
export function tekilRotaParam(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) {
    const x = v[0];
    return typeof x === "string" ? x : "";
  }
  if (typeof v === "string") return v;
  return "";
}
