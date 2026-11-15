// What a new gardener starts with: a few sample plants (sample/starter-plants.json: apple tree, tomato, mint, rhododendron,
// sweetgum, tulip – full records without photos, no garden), so the catalog shows what a plant record can hold, and
// settings.welcome, which opens the Welcome page on the first visit.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// kept in sample/ so the Welcome page can show them too (the file holds no photos or private data)
const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'sample', 'starter-plants.json');
const str = (v, n) => String(v == null ? '' : v).slice(0, n || 255);

async function starterPlants() {
  try {
    const list = JSON.parse(await readFile(FILE, 'utf8'));
    return Array.isArray(list) ? list.filter(p => p && typeof p.id === 'string' && p.id) : [];
  } catch (e) {
    if (e.code !== 'ENOENT') console.error(new Date().toISOString(), 'starter-plants.json cannot be read:', e.message);
    return [];
  }
}

export async function addStarterData(conn, gardenerId, lang) {
  const now = Date.now();
  for (const p of await starterPlants()) {
    // photos are never shared between gardeners (they may be someone else's work)
    const plant = Object.assign({}, p, { sample: true, mt: now });
    delete plant.photo;
    await conn.query(
      'INSERT INTO plants (gardener_id, id, name_cs, name_sk, name_en, name_la, type, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [gardenerId, str(plant.id, 32), str(plant.name_cs), str(plant.name_sk), str(plant.name_en), str(plant.name_la), str(plant.type, 32), JSON.stringify(plant)]);
  }
  const settings = { lang: lang === 'en' ? 'en' : 'cs', welcome: true };
  await conn.query('INSERT INTO meta (gardener_id, k, data) VALUES (?, ?, ?)', [gardenerId, 'settings', JSON.stringify(settings)]);
}
