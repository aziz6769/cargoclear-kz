// FICTIONAL demo data for Kazakhstan routes. Regenerate with `npm run seed`.
import carriers from './carriers.json';
import shipments from './shipments.json';
import offers from './offers.json';
import comparisons from './comparisons.json';

import { buildJuryScenario } from './jury.js';

export { JURY_IDS, buildJuryScenario } from './jury.js';
export const seed = { carriers, shipments, offers, comparisons, juryScenario: buildJuryScenario };
export default seed;
