// Solmar Bay — seeded random numbers.
// One tiny generator (mulberry32 style) so the same seed always grows the same
// city, the same traffic and the same pedestrians.

export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A random float in [lo, hi).
export function range(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}

// A random integer in [lo, hi], inclusive on both ends.
export function int(rng, lo, hi) {
  return Math.floor(lo + rng() * (hi - lo + 1));
}

// One random element of an array.
export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// Read a seed from a URL query value: a number stays a number, anything else
// becomes a fresh random seed.
export function seedFromParam(value) {
  const n = parseInt(value, 10);
  if (Number.isFinite(n)) return n >>> 0;
  return (Math.random() * 0xffffffff) >>> 0;
}
