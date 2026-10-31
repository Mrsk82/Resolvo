// The owner file lists every workspace. Nothing in the app removes a workspace (the owner portal only "suspends" one), so a save
// that is missing a workspace the file on disk already has is an old copy being written back by mistake. Put those workspaces back.
'use strict';

function protectBrands(current, next) {
  const restored = [];
  if (!current || !Array.isArray(current.brands) || !next || typeof next !== 'object') return { data: next, restored };
  next.brands = Array.isArray(next.brands) ? next.brands : [];
  const have = new Set(next.brands.map((b) => b && b.slug));
  for (const b of current.brands) if (b && b.slug && !have.has(b.slug)) { next.brands.push(b); restored.push(b.slug); }
  return { data: next, restored };
}

// Save only the fields a slow job changed onto a fresh copy of the file, so whatever else changed while it was busy is kept.
function patchFields(fresh, source, fields) {
  for (const f of fields) {
    const a = fresh[f], b = source[f];
    if (b && typeof b === 'object' && !Array.isArray(b)) fresh[f] = Object.assign({}, a && typeof a === 'object' ? a : {}, b);
    else if (b !== undefined) fresh[f] = b;
  }
  return fresh;
}

module.exports = { protectBrands, patchFields };
