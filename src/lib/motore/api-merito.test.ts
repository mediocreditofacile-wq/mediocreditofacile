// /api/motore/merito, la scheda Cliente: che cosa arriva al browser nel semaforo della
// verifica senza importo. Sessione, database e Registro finti.
//
// Il punto: su Duplex (criteri del locatore, settore macchine) la verifica dice
// "Indicazione massima importo finanziabile" e "Con il noleggio può arrivare fino a X";
// sui mezzi (Bergamelli) no, perche' Econocom parte da 150.000 senza tetto e Grenke
// Sputnik arriva a 500.000. Il server manda i due campi a null e la pagina non scrive niente.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ query: vi.fn(), queryUna: vi.fn() }));
const motore = vi.hoisted(() => ({ sessioneMotore: vi.fn() }));
const oa = vi.hoisted(() => ({ schedaSoloCache: vi.fn() }));

// Il resto del modulo (pool, env) resta quello vero: nessuna query parte senza passare di qui
vi.mock('../db', async (originale) => ({
  ...(await originale<typeof import('../db')>()),
  query: db.query,
  queryUna: db.queryUna,
}));
vi.mock('@vercel/functions', () => ({ waitUntil: vi.fn() }));
vi.mock('./sessione', async (originale) => ({
  ...(await originale<typeof import('./sessione')>()),
  sessioneMotore: motore.sessioneMotore,
}));
vi.mock('../openapi', async (originale) => ({
  ...(await originale<typeof import('../openapi')>()),
  schedaSoloCache: oa.schedaSoloCache,
}));

import { GET } from '../../pages/api/motore/merito';
import type { Carrozzeria } from './carrozzeria';
import type { DatiCreditoMotore, SchedaRidotta } from './merito';

const K: Carrozzeria = {
  slug: 'duplex', nome: 'Duplex', citta: null, prefisso: 'DX', organizationId: 'org-1', tabellaCanoni: 'sputnik',
  brand: { logo: null, colore: null, accento: null }, settore: 'macchine', etichettaBene: 'Macchina',
  partnerLeasing: 'alba', sogliaLeasing: 0, tettoMeseEuro: 100, demo: false, documentiExtra: [], attivo: true,
  tabellaAlternativa: null, regoleSemaforo: 'locatore', leasing: false, prezzoVerifica: 5,
  canali: null, societaFornitrice: null, checklist: null, categorie: null, mezzi: null,
};
const BERGAMELLI: Carrozzeria = { ...K, slug: 'bergamelli', nome: 'Bergamelli', prefisso: 'EB', settore: 'mezzi', leasing: true, prezzoVerifica: null };

const sessione = (k: Carrozzeria) => ({
  ok: true,
  contesto: { userId: 'u-1', email: 'agente@example.it', nome: 'Agente', ruolo: 'agente', organizationId: 'org-1' },
  carrozzeria: k,
  vedeTutto: false,
});

// Un cliente solido: 15% di 1,2 milioni = 180.000, sotto il patrimonio e il tetto di 199.000
const DATI: DatiCreditoMotore = {
  fatturato: 1_200_000, annoBilancio: new Date().getFullYear() - 1, patrimonioNetto: 400_000, utile: 60_000,
  inizioAttivita: '2010-03-01', rating: null, formaCodice: 'SR', attiva: true, cessata: false,
  capitaleSociale: 20_000, dipendenti: 30, bilanciConRicavi: [2025, 2024], atecoCodice: '41.20.00',
};
const SCHEDA = {
  piva: '01234567890', ragioneSociale: 'EDILE ALFA S.R.L.', formaGiuridica: "SOCIETA' A RESPONSABILITA' LIMITATA",
  sede: 'VIA ROMA 1, ROMA (RM)', ateco: '41.20.00', attivaDal: '01/03/2010', statoAttivita: 'Attiva',
  fatturato: 1_200_000, annoBilancio: 2025, trendFatturato: null, utile: 60_000, patrimonioNetto: 400_000,
  ebitda: null, dipendenti: 30, rating: null, lineaCreditoConsigliata: 150_000, unitaLocali: [], pec: '', codiceSdi: '',
} as unknown as SchedaRidotta;

const riga = () => ({
  id: 'r-1',
  piva: '01234567890',
  dati_credito: { dati: DATI, scheda: SCHEDA },
  // Verifica conclusa: nessuna rilettura da Openapi
  eventi: { stato: 'assenti', id: 'ev-1', avviata: null, chiusa: null, codice: '01234567890', daRegistro: true, mail: 'non-serve' },
});

const leggi = async (k: Carrozzeria, attesaEventi: boolean) => {
  motore.sessioneMotore.mockResolvedValueOnce(sessione(k));
  db.queryUna.mockResolvedValueOnce(riga());
  const r = await GET({
    request: new Request(`https://www.example.it/api/motore/merito?f=${k.slug}&id=r-1${attesaEventi ? '&eventi=1' : ''}`),
  });
  expect(r.status).toBe(200);
  return (await r.json()) as { ok: boolean; credito: Record<string, unknown> };
};

beforeEach(() => {
  vi.clearAllMocks();
  oa.schedaSoloCache.mockResolvedValue(null);
});

describe('/api/motore/merito: l indicazione massima della verifica senza importo', () => {
  for (const attesaEventi of [false, true]) {
    const come = attesaEventi ? "nell'attesa degli eventi" : 'riaprendo la ricerca';

    it(`Duplex, ${come}: l'indicazione c'e' come oggi, col limite che la decide`, async () => {
      const c = await leggi(K, attesaEventi);
      expect(c.ok).toBe(true);
      expect(c.credito.indicazioneMassima).toBe(180_000);
      expect(c.credito.indicazioneBase).toBe('volume');
    });

    it(`Bergamelli, ${come}: niente indicazione e niente base, il resto del semaforo resta`, async () => {
      const duplex = (await leggi(K, attesaEventi)).credito;
      const c = (await leggi(BERGAMELLI, attesaEventi)).credito;
      expect(c.indicazioneMassima).toBeNull();
      expect(c.indicazioneBase).toBeNull();
      expect(c.semaforo).toBe(duplex.semaforo);
      expect(c.criteri).toEqual(duplex.criteri);
    });
  }
});
