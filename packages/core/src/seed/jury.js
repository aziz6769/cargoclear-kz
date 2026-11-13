// Jury demonstration scenario. ALL figures are FICTIONAL demonstration data, not market quotations.
// Built on demand (in the user's language) so launching/resetting the demo never touches user-created records.

export const JURY_IDS = {
  carriers: ['car_jury_a', 'car_jury_b', 'car_jury_c'],
  shipment: 'shp_jury1',
  offers: ['off_jury_a', 'off_jury_b', 'off_jury_c'],
  comparison: 'cmp_jury1',
};

const TEXT = {
  ru: {
    shipment: 'Товары для магазина',
    origin: 'Алматы',
    destination: 'Туркестан',
    point: 'Магазин, г. Туркестан',
    cargo: 'Бытовые товары для розничного магазина, паллеты',
    req: 'Сухой груз, без штабелирования',
    comparison: 'Демо: Алматы → Туркестан',
    cmpNotes: 'Демонстрационный сценарий: цифры вымышленные.',
    a: { hub: 'Пункт выдачи перевозчика A, Туркестан', notes: 'Менеджер не подтвердил разгрузку и доставку до магазина.', inc: ['Перевозка', 'Погрузка'], exc: ['Разгрузка'] },
    b: { notes: 'Доставка до адреса магазина подтверждена письменно.', inc: ['Перевозка', 'Погрузка', 'Разгрузка', 'Страхование', 'Доставка до адреса'], exc: [] },
    c: { terminal: 'Грузовой терминал, Туркестан', notes: 'Только до терминала; доставку до магазина организует клиент.', inc: ['Перевозка до терминала'], exc: ['Доставка до магазина'], charge: 'Терминальная обработка' },
  },
  kk: {
    shipment: 'Дүкенге арналған тауарлар',
    origin: 'Алматы',
    destination: 'Түркістан',
    point: 'Дүкен, Түркістан қ.',
    cargo: 'Бөлшек сауда дүкеніне арналған тұрмыстық тауарлар, паллеттер',
    req: 'Құрғақ жүк, қабаттап қоюға болмайды',
    comparison: 'Демо: Алматы → Түркістан',
    cmpNotes: 'Демонстрациялық сценарий: сандар ойдан шығарылған.',
    a: { hub: 'A тасымалдаушысының беру пункті, Түркістан', notes: 'Менеджер түсіруді және дүкенге дейін жеткізуді растамады.', inc: ['Тасымал', 'Тиеу'], exc: ['Түсіру'] },
    b: { notes: 'Дүкен мекенжайына дейін жеткізу жазбаша расталды.', inc: ['Тасымал', 'Тиеу', 'Түсіру', 'Сақтандыру', 'Мекенжайға дейін жеткізу'], exc: [] },
    c: { terminal: 'Жүк терминалы, Түркістан', notes: 'Тек терминалға дейін; дүкенге жеткізуді клиент ұйымдастырады.', inc: ['Терминалға дейін тасымал'], exc: ['Дүкенге жеткізу'], charge: 'Терминалдық өңдеу' },
  },
  en: {
    shipment: 'Retail store goods',
    origin: 'Almaty',
    destination: 'Turkestan',
    point: 'Retail store, Turkestan',
    cargo: 'Household goods for a retail store, pallets',
    req: 'Dry cargo, do not stack',
    comparison: 'Demo: Almaty → Turkestan',
    cmpNotes: 'Demonstration scenario: figures are fictional.',
    a: { hub: 'Carrier A pickup point, Turkestan', notes: 'The manager did not confirm unloading or delivery to the store.', inc: ['Transport', 'Loading'], exc: ['Unloading'] },
    b: { notes: 'Delivery to the store address confirmed in writing.', inc: ['Transport', 'Loading', 'Unloading', 'Insurance', 'Delivery to address'], exc: [] },
    c: { terminal: 'Freight terminal, Turkestan', notes: 'To the terminal only; the client arranges delivery to the store.', inc: ['Transport to terminal'], exc: ['Delivery to the store'], charge: 'Terminal handling' },
  },
};

const U = { status: 'unknown', amount: null };
const INC = { status: 'included', amount: null };
const EXC = { status: 'excluded', amount: null };
const NA = { status: 'na', amount: null };
const costs = (o) => ({
  pickup: NA, loading: U, unloading: U, fuel: NA, storage: U, terminal: U, handling: U, lastMile: U, insurance: U, customs: U, other: NA, ...o,
});

export function buildJuryScenario(lang = 'ru', now = new Date().toISOString()) {
  const x = TEXT[lang] ?? TEXT.ru;
  const [ia, ib, ic] = JURY_IDS.carriers;
  const [oa, ob, oc] = JURY_IDS.offers;
  const day = now.slice(0, 10);
  const base = { currency: 'KZT', quoteDate: day, validUntil: '', startLocation: x.origin, isDemo: true, createdAt: now, shipmentId: JURY_IDS.shipment, additionalCharges: [] };

  const carriers = [
    ['A', ia], ['B', ib], ['C', ic],
  ].map(([n, id]) => ({ id, name: `Carrier ${n}`, contactName: '', phone: '', email: '', notes: '', isDemo: true, createdAt: now }));

  const shipments = [
    {
      id: JURY_IDS.shipment, name: x.shipment, originCountry: 'KZ', origin: x.origin, destinationCountry: 'KZ', destination: x.destination,
      deliveryPoint: x.point, cargoDescription: x.cargo, requiredDate: '', weightKg: 2400, volumeM3: 18, category: 'general', packages: 60,
      requirements: x.req, deliveryLevel: 'warehouse', storageDays: 0, insuranceRequired: true, customsRequired: false, specialHandling: false,
      status: 'active', isDemo: true, createdAt: now,
    },
  ];

  const offers = [
    {
      ...base, id: oa, carrierId: ia, price: 180000, endpoint: 'hub', endpointLabel: x.a.hub, transportType: 'truck_ltl', deliveryDays: 3,
      includedServices: x.a.inc, excludedServices: x.a.exc, notes: x.a.notes,
      costs: costs({ loading: INC, unloading: EXC, fuel: U, lastMile: U }),
    },
    {
      ...base, id: ob, carrierId: ib, price: 215000, endpoint: 'warehouse', endpointLabel: x.point, transportType: 'truck_ftl', deliveryDays: 2,
      includedServices: x.b.inc, excludedServices: x.b.exc, notes: x.b.notes,
      costs: costs({ loading: INC, unloading: INC, insurance: INC }),
    },
    {
      ...base, id: oc, carrierId: ic, price: 165000, endpoint: 'terminal', endpointLabel: x.c.terminal, transportType: 'rail', deliveryDays: 4,
      includedServices: x.c.inc, excludedServices: x.c.exc, notes: x.c.notes,
      additionalCharges: [{ name: x.c.charge, amount: null }],
      costs: costs({ loading: INC, lastMile: EXC }),
    },
  ];

  const comparisons = [
    { id: JURY_IDS.comparison, name: x.comparison, shipmentId: JURY_IDS.shipment, offerIds: [oa, ob, oc], notes: x.cmpNotes, createdAt: now, updatedAt: now, isDemo: true, demoLang: lang },
  ];
  return { carriers, shipments, offers, comparisons };
}
