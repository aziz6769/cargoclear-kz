import Dexie from 'dexie';

const TABLES = ['shipments', 'carriers', 'offers', 'comparisons', 'meta'];

/** Storage layer: IndexedDB via Dexie. Implements the adapter contract from @cargoclear/core. */
export function createDexieAdapter(name = 'cargoclear-kz') {
  const db = new Dexie(name);
  db.version(1).stores({
    shipments: 'id',
    carriers: 'id',
    offers: 'id',
    comparisons: 'id',
    meta: 'key',
  });
  return {
    getAll: (c) => db.table(c).toArray(),
    get: (c, id) => db.table(c).get(id),
    put: (c, item) => db.table(c).put(item),
    bulkPut: (c, items) => db.table(c).bulkPut(items),
    remove: (c, id) => db.table(c).delete(id),
    async clearAll() {
      await Promise.all(TABLES.map((t) => db.table(t).clear()));
    },
    async getMeta(key) {
      return (await db.table('meta').get(key))?.value;
    },
    async setMeta(key, value) {
      await db.table('meta').put({ key, value });
    },
  };
}
