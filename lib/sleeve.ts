// Deterministic Blue Note "sleeve" identity derived from a tune's title.
// Same title -> same face, so the wall stays recognizable as it grows.

export const ACCENTS = [
  { name: "orange", value: "#E1541B" },
  { name: "teal", value: "#2A6E63" },
  { name: "mustard", value: "#D69A16" },
  { name: "cobalt", value: "#2E4C97" },
  { name: "red", value: "#BE2E1C" },
  { name: "plum", value: "#6B3A6E" },
] as const;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function accentFor(title: string): string {
  return ACCENTS[hash(title) % ACCENTS.length].value;
}

// Reserved for future layout variety on generated sleeves.
export function variantFor(title: string): "A" | "B" {
  return (hash(title) >> 8) % 2 === 0 ? "A" : "B";
}
