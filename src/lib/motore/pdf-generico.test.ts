// Preventivi PDF del motore fuori dal fotovoltaico: contenuto dei due documenti.
//
// Il contenuto si prova sulle funzioni pure; del PDF disegnato si controlla solo
// che esca e che sia un PDF. I numeri vengono dal motore vero (calcolaProposte)
// su un fornitore di prova con Sputnik e leasing Alba senza soglia.

import { describe, expect, it } from 'vitest';
import type { CalcoloProposta } from './calcolo-proposta';
import type { Carrozzeria } from './carrozzeria';
import { contenutoLeasing, contenutoNoleggio, documentiGenerici, NOTA_DEMO_PDF } from './pdf-generico';
import { calcolaProposte } from './proposte';

const K: Carrozzeria = {
  slug: 'fornitore-prova', nome: 'Forniture Prova', citta: 'Firenze', prefisso: 'FP', organizationId: 'org',
  tabellaCanoni: 'sputnik', brand: { logo: null, colore: '#2E3A46', accento: '#8A6A3A' },
  settore: 'generico', etichettaBene: 'Fornitura per hotel', partnerLeasing: 'alba', sogliaLeasing: 0,
  tettoMeseEuro: 30, demo: true, documentiExtra: ['Offerta del fornitore intestata al cliente'], attivo: true,
  tabellaAlternativa: null, regoleSemaforo: 'credit-policy', leasing: true, prezzoVerifica: null,
};
const BILANCIO = { fatturato: 2_000_000, patrimonioNetto: 600_000, utile: 80_000, inizioAttivita: '2005-03-01' };
const OGGI = new Date('2026-10-16T10:00:00+02:00');

function calcolo(prezzo: number): CalcoloProposta {
  return {
    ricerca: {
      id: 'r1', piva: '01234567890', ragione_sociale: 'Hotel Prova S.r.l.',
      dati_credito: {
        dati: BILANCIO,
        scheda: { piva: '01234567890', ragioneSociale: 'Hotel Prova S.r.l.', formaGiuridica: 'Societa a responsabilita limitata', sede: 'Rimini (RN)' },
      },
    },
    voce: { id: 1, codice: 'SC-40', nome: 'Sala colazione, 40 coperti', descrizione: 'Banco buffet e vetrine.', prezzo, attributi: {}, ordine: 0, attivo: true },
    prezzo,
    esito: calcolaProposte(prezzo, BILANCIO, K, OGGI),
    bp: null,
    inputBp: {} as CalcoloProposta['inputBp'],
  } as unknown as CalcoloProposta;
}

describe('preventivo di noleggio', () => {
  const d = contenutoNoleggio(calcolo(18_000), K, 'FP-20261016-100000', OGGI);

  it('porta il nome del fornitore e la nota dimostrativa', () => {
    expect(d.marchio).toBe('fornitore');
    expect(d.titolo).toBe('Forniture Prova');
    expect(d.notaDemo).toBe(NOTA_DEMO_PDF);
    expect(d.riferimento).toBe('N. FP-20261016-100000 · 16/10/2026');
  });

  it('ha una riga per durata, coi canoni del motore', () => {
    const t = d.blocchi.find((b) => b.tipo === 'tabella');
    expect(t && t.tipo === 'tabella' ? t.righe.map((r) => r[0]) : []).toEqual(['24 mesi', '30 mesi', '36 mesi', '48 mesi', '60 mesi']);
    // 18.000 a 60 mesi su Sputnik: 404,28
    expect(t && t.tipo === 'tabella' ? t.righe[4][1] : '').toBe('404,28');
  });

  it('dice le condizioni del listino e i documenti per la pratica', () => {
    const testo = JSON.stringify(d.blocchi);
    expect(testo).toMatch(/trimestrale anticipata/);
    expect(testo).toMatch(/Offerta del fornitore intestata al cliente/);
    expect(testo).toMatch(/Ultimi 2 bilanci depositati/); // sopra 10.000 euro, societa di capitali
  });
});

describe('prospetto di leasing', () => {
  it('esce a marchio MCF con OAM quando il motore propone il leasing', () => {
    const d = contenutoLeasing(calcolo(18_000), K, 'FP-1', OGGI)!;
    expect(d.marchio).toBe('mcf');
    expect(d.piede).toMatch(/OAM M325/);
    expect(d.notaDemo).toBe(NOTA_DEMO_PDF);
  });

  it('non esiste sotto il minimo del partner', () => {
    expect(contenutoLeasing(calcolo(4_000), K, 'FP-2', OGGI)).toBeNull();
  });
});

describe('riservatezza dei documenti al cliente', () => {
  it('nessun nome di societa di noleggio o leasing, nessun tasso', () => {
    const c = calcolo(18_000);
    const tutto = JSON.stringify([contenutoNoleggio(c, K, 'X', OGGI), contenutoLeasing(c, K, 'X', OGGI)]);
    expect(tutto).not.toMatch(/grenke|sputnik|pagarent|alba|sella|credem|affida leasing|\btan\b|tasso/i);
  });
});

describe('PDF disegnati', () => {
  it('due documenti con il leasing, uno senza, e sono PDF', () => {
    const due = documentiGenerici(calcolo(18_000), K, 'FP-3', OGGI);
    expect(due.map((f) => f.filename)).toEqual(['preventivo-noleggio-FP-3.pdf', 'prospetto-leasing-FP-3.pdf']);
    for (const f of due) expect(Buffer.from(f.contenuto, 'base64').subarray(0, 5).toString()).toBe('%PDF-');
    expect(documentiGenerici(calcolo(4_000), K, 'FP-4', OGGI)).toHaveLength(1);
  });
});
