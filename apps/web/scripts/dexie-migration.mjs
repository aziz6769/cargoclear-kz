// Proves a real IndexedDB (fake-indexeddb) database created by the Phase 1-2 schema (v1) upgrades to v2
// without losing data, and the new stores work. Usage: node scripts/dexie-migration.mjs
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { createRepository } from '@cargoclear/core';
import { createDexieAdapter } from '../src/storage/dexieAdapter.js';

const old = new Dexie('cc-mig');
old.version(1).stores({ shipments: 'id', carriers: 'id', offers: 'id', comparisons: 'id', meta: 'key' });
await old.table('carriers').put({ id: 'car_1', name: 'Legacy Carrier', createdAt: '2025-01-01' });
await old.table('shipments').put({ id: 'shp_1', name: 'Legacy shipment', createdAt: '2025-01-01', status: 'active' });
await old.table('meta').put({ key: 'seeded', value: true });
await old.table('meta').put({ key: 'settings', value: { language: 'kk', currency: 'KZT' } });
old.close();

const repo = createRepository(createDexieAdapter('cc-mig'));
await repo.init();
const car = (await repo.getCarriers())[0];
const ok = [];
const check = (n, c) => { ok.push(c); console.log(`${c ? 'PASS' : 'FAIL'}  ${n}`); };
check('legacy carrier kept and upgraded', car.name === 'Legacy Carrier' && car.routes === '' && Array.isArray(car.services));
check('legacy shipment kept', (await repo.getShipments())[0].status === 'active');
check('settings kept', (await repo.getSettings()).language === 'kk');
const d = await repo.createDocument({ title: 'Quote A', type: 'quote', shipmentId: 'shp_1' });
check('documents store works after upgrade', (await repo.getDocuments({ shipmentId: 'shp_1' }))[0].id === d.id);
await repo.updateShipment('shp_1', { status: 'delivered' });
check('events store works after upgrade', (await repo.getEvents({ entityId: 'shp_1' })).some((e) => e.kind === 'status'));
await repo.clearAllData();
check('clearAllData empties new stores', (await repo.getDocuments()).length === 0 && (await repo.getEvents()).length === 0);
process.exit(ok.every(Boolean) ? 0 : 1);
