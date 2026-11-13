// Generates src/seed/*.json. ALL names, contacts and prices are FICTIONAL demo data.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'seed');
const KEYS = ['loading', 'unloading', 'storage', 'terminal', 'handling', 'lastMile', 'insurance', 'customs'];

const inc = () => ({ status: 'included', amount: null });
const ch = (n) => ({ status: 'charged', amount: n });
const ex = (n = null) => ({ status: 'excluded', amount: n });
const costs = (o = {}) => Object.fromEntries(KEYS.map((k) => [k, o[k] ?? { status: 'unknown', amount: null }]));

const carriers = [
  ['car_demo1', 'Степной Экспресс', 'Айдос Серик', '+7 (700) 000-00-01', 'demo1@example.kz', 'Основной автоперевозчик по трассе Алматы — Астана.'],
  ['car_demo2', 'КазТранзит Логистик', 'Марат Оспан', '+7 (700) 000-00-02', 'demo2@example.kz', 'Часто дешевле по базовой цене, но доставляет до терминала.'],
  ['car_demo3', 'Алатау Карго', 'Алия Нұр', '+7 (700) 000-00-03', 'demo3@example.kz', 'Сборные грузы, собственный хаб в Астане.'],
  ['car_demo4', 'Сарыарка Фрейт', 'Данияр Ж.', '+7 (700) 000-00-04', 'demo4@example.kz', 'Юг — Центр, работает с продуктами и стройматериалами.'],
  ['car_demo5', 'Жібек Жолы Транс', 'Ерлан Т.', '+7 (700) 000-00-05', 'demo5@example.kz', 'Мультимодальные перевозки, часть тарифов в USD.'],
].map(([id, name, contactName, phone, email, notes]) => ({
  id, name, contactName, phone, email, notes, isDemo: true, createdAt: '2026-09-01T09:00:00.000Z',
}));

const S = (id, name, origin, destination, deliveryPoint, weightKg, volumeM3, category, packages, status, extra = {}) => ({
  id, name, origin, destination, deliveryPoint, weightKg, volumeM3, category, packages,
  requirements: '', deliveryLevel: 'warehouse', storageDays: 0,
  insuranceRequired: false, customsRequired: false, specialHandling: false,
  status, isDemo: true, createdAt: '2026-10-15T09:00:00.000Z', ...extra,
});

const shipments = [
  S('shp_demo01', 'Офисная мебель', 'Алматы', 'Астана', 'Склад клиента, ул. Сарайшык, Астана', 3200, 28, 'furniture', 40, 'active', { requirements: 'Защитная упаковка, без штабелирования' }),
  S('shp_demo02', 'Стройматериалы', 'Алматы', 'Шымкент', 'Строительная база, Шымкент', 12000, 20, 'construction', 24, 'active'),
  S('shp_demo03', 'Продукты питания', 'Туркестан', 'Астана', 'Распределительный центр, Астана', 5000, 30, 'food', 120, 'active', { insuranceRequired: true, requirements: 'Сухой груз, +5…+25 °C' }),
  S('shp_demo04', 'Бытовая техника', 'Шымкент', 'Алматы', 'Магазин, пр. Абая, Алматы', 1800, 14, 'electronics', 60, 'active', { insuranceRequired: true }),
  S('shp_demo05', 'Автозапчасти', 'Алматы', 'Астана', 'Склад автосервиса, Астана', 900, 6, 'auto_parts', 35, 'delivered'),
  S('shp_demo06', 'Медицинское оборудование', 'Астана', 'Алматы', 'Клиника, Алматы', 450, 5, 'medical', 8, 'draft', { insuranceRequired: true, specialHandling: true, requirements: 'Хрупкое, температурный режим' }),
  S('shp_demo07', 'Текстиль (импорт)', 'Хоргос', 'Алматы', 'Склад, Алматы', 7500, 38, 'textile', 300, 'active', { customsRequired: true, storageDays: 3 }),
  S('shp_demo08', 'Оборудование для пекарни', 'Шымкент', 'Туркестан', 'Пекарня, Туркестан', 2200, 12, 'equipment', 9, 'delivered'),
  S('shp_demo09', 'Упаковка и тара', 'Алматы', 'Шымкент', 'Склад, Шымкент', 4100, 32, 'general', 80, 'draft'),
  S('shp_demo10', 'Запчасти сельхозтехники', 'Астана', 'Туркестан', 'Агрохозяйство, Туркестанская обл.', 3600, 18, 'equipment', 22, 'draft'),
];

const O = (id, carrierId, shipmentId, createdAt, o) => ({
  id, carrierId, shipmentId, currency: 'KZT', startLocation: '', endpointLabel: '',
  includedServices: [], excludedServices: [], additionalCharges: [], notes: '', createdAt, ...o,
});

const offers = [
  // cmp 1: мебель в Астану — разные точки доставки
  O('off_demo01', 'car_demo1', 'shp_demo01', '2026-11-10T08:30:00.000Z', {
    price: 520000, startLocation: 'Алматы, склад клиента', endpoint: 'warehouse', endpointLabel: 'Склад клиента, Астана',
    transportType: 'truck_ftl', deliveryDays: 2, includedServices: ['Погрузка', 'Доставка до склада'], excludedServices: ['Разгрузка'],
    costs: costs({ loading: inc(), unloading: ch(25000) }),
  }),
  O('off_demo02', 'car_demo2', 'shp_demo01', '2026-11-10T08:35:00.000Z', {
    price: 410000, startLocation: 'Алматы', endpoint: 'terminal', endpointLabel: 'Грузовой терминал, Астана',
    transportType: 'rail', deliveryDays: 4, includedServices: ['Погрузка', 'Перевозка до терминала'], excludedServices: ['Доставка со склада терминала'],
    notes: 'Менеджер не подтвердил разгрузку и хранение.',
    costs: costs({ loading: inc(), terminal: ch(18000), lastMile: ex() }),
  }),
  O('off_demo03', 'car_demo3', 'shp_demo01', '2026-11-10T08:40:00.000Z', {
    price: 455000, startLocation: 'Алматы', endpoint: 'hub', endpointLabel: 'Хаб Алатау Карго, Астана',
    transportType: 'truck_ltl', deliveryDays: 3, includedServices: ['Погрузка', 'Разгрузка на хабе'],
    costs: costs({ loading: inc(), unloading: inc(), terminal: inc(), lastMile: ch(60000) }),
  }),
  // cmp 2: стройматериалы в Шымкент
  O('off_demo04', 'car_demo2', 'shp_demo02', '2026-11-06T10:00:00.000Z', {
    price: 380000, startLocation: 'Алматы', endpoint: 'warehouse', endpointLabel: 'Строительная база, Шымкент',
    transportType: 'truck_ftl', deliveryDays: 3, costs: costs({ loading: ch(20000), unloading: inc() }),
  }),
  O('off_demo05', 'car_demo4', 'shp_demo02', '2026-11-06T10:05:00.000Z', {
    price: 350000, startLocation: 'Алматы', endpoint: 'warehouse', endpointLabel: 'Строительная база, Шымкент',
    transportType: 'truck_ftl', deliveryDays: 4, costs: costs({ loading: ch(30000), unloading: ch(45000) }),
  }),
  O('off_demo06', 'car_demo1', 'shp_demo02', '2026-11-06T10:10:00.000Z', {
    price: 360000, startLocation: 'Алматы', endpoint: 'warehouse', endpointLabel: 'Строительная база, Шымкент',
    transportType: 'truck_ftl', deliveryDays: 3, notes: 'Разгрузку обещали уточнить.',
    costs: costs({ loading: inc() }),
  }),
  // cmp 3: продукты Туркестан → Астана (оффер в USD)
  O('off_demo07', 'car_demo4', 'shp_demo03', '2026-10-30T07:00:00.000Z', {
    price: 610000, startLocation: 'Туркестан', endpoint: 'warehouse', endpointLabel: 'РЦ, Астана',
    transportType: 'truck_ftl', deliveryDays: 4, costs: costs({ loading: inc(), unloading: ch(30000), insurance: ch(22000) }),
  }),
  O('off_demo08', 'car_demo5', 'shp_demo03', '2026-10-30T07:10:00.000Z', {
    price: 1250, currency: 'USD', startLocation: 'Туркестан', endpoint: 'warehouse', endpointLabel: 'РЦ, Астана',
    transportType: 'multimodal', deliveryDays: 5, notes: 'Цена в USD, курс не зафиксирован.',
    costs: costs({ loading: inc(), unloading: inc(), insurance: inc() }),
  }),
  O('off_demo09', 'car_demo3', 'shp_demo03', '2026-10-30T07:20:00.000Z', {
    price: 590000, startLocation: 'Туркестан', endpoint: 'warehouse', endpointLabel: 'РЦ, Астана',
    transportType: 'truck_ltl', deliveryDays: 4, costs: costs({ loading: inc(), unloading: ch(28000) }),
  }),
  // cmp 4: бытовая техника в Алматы — всё посчитано
  O('off_demo10', 'car_demo1', 'shp_demo04', '2026-10-24T11:00:00.000Z', {
    price: 240000, startLocation: 'Шымкент', endpoint: 'warehouse', endpointLabel: 'Магазин, Алматы',
    transportType: 'truck_ltl', deliveryDays: 2, costs: costs({ loading: inc(), unloading: ch(15000), insurance: ch(9000) }),
  }),
  O('off_demo11', 'car_demo3', 'shp_demo04', '2026-10-24T11:05:00.000Z', {
    price: 205000, startLocation: 'Шымкент', endpoint: 'warehouse', endpointLabel: 'Магазин, Алматы',
    transportType: 'truck_ltl', deliveryDays: 3, costs: costs({ loading: ch(12000), unloading: ch(15000), insurance: inc() }),
  }),
  O('off_demo12', 'car_demo4', 'shp_demo04', '2026-10-24T11:10:00.000Z', {
    price: 225000, startLocation: 'Шымкент', endpoint: 'hub', endpointLabel: 'Хаб Сарыарка Фрейт, Алматы',
    transportType: 'truck_ltl', deliveryDays: 2,
    costs: costs({ loading: inc(), unloading: inc(), terminal: ch(8000), lastMile: ch(20000), insurance: ch(10000) }),
  }),
  // cmp 5: автозапчасти — один терминальный оффер с пробелами
  O('off_demo13', 'car_demo2', 'shp_demo05', '2026-11-11T09:00:00.000Z', {
    price: 135000, startLocation: 'Алматы', endpoint: 'warehouse', endpointLabel: 'Склад автосервиса, Астана',
    transportType: 'truck_ltl', deliveryDays: 3, costs: costs({ loading: inc(), unloading: inc() }),
  }),
  O('off_demo14', 'car_demo5', 'shp_demo05', '2026-11-11T09:05:00.000Z', {
    price: 120000, startLocation: 'Алматы', endpoint: 'terminal', endpointLabel: 'Терминал ст. Астана-1',
    transportType: 'rail', deliveryDays: 5, excludedServices: ['Доставка со станции'],
    costs: costs({ loading: inc(), terminal: ch(6000), storage: ex(4000), lastMile: ex() }),
  }),
  O('off_demo15', 'car_demo1', 'shp_demo05', '2026-11-11T09:10:00.000Z', {
    price: 150000, startLocation: 'Алматы', endpoint: 'warehouse', endpointLabel: 'Склад автосервиса, Астана',
    transportType: 'truck_ltl', deliveryDays: 2, costs: costs({ loading: ch(8000), unloading: ch(10000) }),
  }),
];

const C = (id, name, shipmentId, offerIds, createdAt, notes = '') => ({
  id, name, shipmentId, offerIds, notes, createdAt, updatedAt: createdAt, isDemo: true,
});
const comparisons = [
  C('cmp_demo1', 'Мебель в Астану: терминал vs склад', 'shp_demo01', ['off_demo01', 'off_demo02', 'off_demo03'], '2026-11-10T08:45:00.000Z'),
  C('cmp_demo2', 'Стройматериалы в Шымкент', 'shp_demo02', ['off_demo04', 'off_demo05', 'off_demo06'], '2026-11-06T10:15:00.000Z'),
  C('cmp_demo3', 'Продукты Туркестан → Астана', 'shp_demo03', ['off_demo07', 'off_demo08', 'off_demo09'], '2026-10-30T07:30:00.000Z'),
  C('cmp_demo4', 'Бытовая техника в Алматы', 'shp_demo04', ['off_demo10', 'off_demo11', 'off_demo12'], '2026-10-24T11:15:00.000Z'),
  C('cmp_demo5', 'Автозапчасти в Астану', 'shp_demo05', ['off_demo13', 'off_demo14', 'off_demo15'], '2026-11-11T09:15:00.000Z'),
];

const w = (name, data) => writeFileSync(join(out, `${name}.json`), JSON.stringify(data, null, 2) + '\n');
w('carriers', carriers);
w('shipments', shipments);
w('offers', offers);
w('comparisons', comparisons);
console.log(`seed: ${carriers.length} carriers, ${shipments.length} shipments, ${offers.length} offers, ${comparisons.length} comparisons`);
