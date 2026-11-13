/**
 * Storage adapter contract (implemented by Dexie on web, AsyncStorage on mobile, memory in tests):
 *   getAll(coll) get(coll,id) put(coll,item) bulkPut(coll,items) remove(coll,id)
 *   clearAll() getMeta(key) setMeta(key,value)
 * All methods are async.
 */
export function createMemoryAdapter() {
  const data = { carriers: new Map(), shipments: new Map(), offers: new Map(), comparisons: new Map(), documents: new Map(), events: new Map() };
  let meta = new Map();
  const clone = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
  return {
    async getAll(c) {
      return [...data[c].values()].map(clone);
    },
    async get(c, id) {
      return clone(data[c].get(id));
    },
    async put(c, item) {
      data[c].set(item.id, clone(item));
    },
    async bulkPut(c, items) {
      for (const i of items) data[c].set(i.id, clone(i));
    },
    async remove(c, id) {
      data[c].delete(id);
    },
    async clearAll() {
      for (const m of Object.values(data)) m.clear();
      meta = new Map();
    },
    async getMeta(k) {
      return clone(meta.get(k));
    },
    async setMeta(k, v) {
      meta.set(k, clone(v));
    },
  };
}
