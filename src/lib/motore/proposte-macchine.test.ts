// Settore macchine: configurazione (macchina e accessori della sua famiglia),
// canoni sulle due tabelle, date di pagamento e costi. I numeri attesi sono
// quelli di /tools/duplex e del simulatore ReteRent.

import { describe, expect, it } from 'vitest';
import { canoneDaCoefficiente } from '../../data/duplex-costi';
import { TABELLA_GRACE_DUPLEX, TABELLA_SPUTNIK_DUPLEX } from '../tabelle-canoni';
import type { Carrozzeria, VoceCatalogo } from './carrozzeria';
import { vociDuplex } from './catalogo-duplex';
import { calcolaMacchine, dataConsegna, esitoDaMacchine, validaConfigurazione } from './proposte-macchine';

const VOCI: VoceCatalogo[] = vociDuplex().map((v, i) => ({ id: i + 1, ...v, attivo: true }));
const OGGI = new Date(2026, 9, 15);
const CONSEGNA = new Date(2026, 9, 15);
const conf = (codice: string, accessori: Record<string, unknown> = {}) => {
  const r = validaConfigurazione(VOCI, { codice, accessori });
  if (!r.ok) throw new Error(r.error);
  return r.conf;
};
const calcola = (codice: string, prezzo: number, durata = 60) =>
  calcolaMacchine(conf(codice), prezzo, durata, CONSEGNA, TABELLA_SPUTNIK_DUPLEX, TABELLA_GRACE_DUPLEX);

describe('catalogo Duplex', () => {
  it('dieci macchine e dieci accessori', () => {
    expect(vociDuplex().filter((v) => v.attributi.tipo !== 'accessorio')).toHaveLength(10);
    expect(vociDuplex().filter((v) => v.attributi.tipo === 'accessorio')).toHaveLength(10);
  });
});

describe('configurazione', () => {
  it('Ultrax 45 con due spazzole in microfibra', () => {
    const c = conf('ULTRAX-45', { 'UX-MICROFIBRA': 2 });
    expect(c.listino).toBe(3738);
    expect(c.descrizione).toBe('Ultrax 45 + 2x Spazzola microfibra bianca');
    expect(c.famiglia).toBe('Ultrax 45');
  });
  it('zero non è un accessorio', () => {
    expect(conf('ULTRAX-45', { 'UX-MICROFIBRA': 0 }).accessori).toEqual([]);
  });
  it('rifiuta gli accessori sbagliati', () => {
    const err = (accessori: Record<string, unknown>) => validaConfigurazione(VOCI, { codice: 'ULTRAX-45', accessori });
    const no = { ok: false, error: 'accessorio_non_valido' };
    expect(err({ 'D340-BLU': 1 })).toEqual(no); // altra famiglia
    expect(err({ 'UX-MICROFIBRA': 1 })).toEqual(no); // fuori passo
    expect(err({ 'UX-MICROFIBRA': 6 })).toEqual(no); // oltre il massimo
    expect(err({ 'UX-SQUEEGY': 2 })).toEqual(no);
    expect(err({ 'UX-MICROFIBRA': -2 })).toEqual(no);
    expect(err({ 'UX-MICROFIBRA': 'due' })).toEqual(no);
    expect(err({ 'NON-ESISTE': 1 })).toEqual(no);
  });
  it('accessorio spento: non è nel catalogo attivo', () => {
    const attive = VOCI.filter((v) => v.codice !== 'UX-SQUEEGY');
    expect(validaConfigurazione(attive, { codice: 'ULTRAX-45', accessori: { 'UX-SQUEEGY': 1 } }))
      .toEqual({ ok: false, error: 'accessorio_non_valido' });
  });
  it('macchina inesistente, o un accessorio al posto della macchina', () => {
    expect(validaConfigurazione(VOCI, { codice: 'ULTRAX-99', accessori: {} })).toEqual({ ok: false, error: 'voce_non_trovata' });
    expect(validaConfigurazione(VOCI, { codice: 'UX-MICROFIBRA', accessori: {} })).toEqual({ ok: false, error: 'voce_non_trovata' });
  });
});

describe('canoni e date', () => {
  it('Ultrax 45 a 60 mesi, consegna il 15 ottobre 2026', () => {
    const m = calcola('ULTRAX-45', 3500);
    const r60 = m.righe.find((r) => r.durata === 60)!;
    expect(r60.canone).toBe(81);
    expect(r60.canoneAlternativo).toBe(80.05);
    expect(m.tradizionale!.primaFattura).toBe('2027-01-01');
    expect(m.tradizionale!.inCoda).toBe(false);
    expect(m.tradizionale!.giorniProRata).toBe(78);
    expect(m.tradizionale!.fineContratto).toBe('2031-12-31');
    expect(m.alternativa!.primaFattura).toBe('2027-04-01');
    expect(m.alternativa!.inCoda).toBe(true);
    expect(m.alternativa!.fineContratto).toBe('2032-03-31');
    expect(m.istruttoria).toBe(75);
    expect(m.polizzaAnnua).toBe(124.25);
    expect(m.riscatto).toBe(105);
    expect(m.tradizionale!.totale).toBe(5040);
    expect(m.nomeAlternativa).toBe('Grace Period');
    expect(m.consegna).toBe('2026-10-15');
  });
  it('Duplex 340 a cavo: 51,60 e 51,15, polizza al minimo', () => {
    const m = calcola('DUPLEX-340-CAVO', 1931);
    expect(m.tradizionale!.canone).toBe(51.6);
    expect(m.alternativa!.canone).toBe(51.15);
    expect(m.polizzaAnnua).toBe(115);
  });
  it('il prezzo trattato cambia fascia: 340 a batteria a 2.400 euro', () => {
    const m = calcola('DUPLEX-340-BATTERIA', 2400);
    expect(m.listino).toBe(2690);
    expect(m.prezzo).toBe(2400);
    expect(m.tradizionale!.canone).toBe(canoneDaCoefficiente(2400, 2.6724));
  });
  it('sopra i 100.000 euro la tradizionale non quota, la Grace sì', () => {
    const m = calcola('DUPLEX-ESCALATOR', 120_000);
    expect(m.righe.every((r) => r.canone === null && r.totale === null)).toBe(true);
    expect(m.righe.every((r) => r.canoneAlternativo !== null)).toBe(true);
    expect(m.tradizionale).toBeNull();
    expect(m.alternativa).not.toBeNull();
    expect(m.motivoFuoriListino).toBeNull();
  });
  it('sotto i 500 euro niente canone, e un motivo', () => {
    const m = calcola('DUPLEX-340-CAVO', 400);
    expect(m.tradizionale).toBeNull();
    expect(m.alternativa).toBeNull();
    expect(m.motivoFuoriListino).toMatch(/da 500/);
  });
  it('in uscita niente coefficienti né sigle di tabella', () => {
    expect(JSON.stringify(calcola('ULTRAX-45', 3500))).not.toMatch(/coeff|fascia|sputnik|grace-duplex|grenke/i);
  });
});

describe('data di consegna', () => {
  const oggi = new Date(2026, 9, 15).getTime();
  it('una data valida resta, anche nel passato recente', () => {
    expect(dataConsegna('2026-09-01', OGGI).getTime()).toBe(new Date(2026, 8, 1).getTime());
  });
  it('impossibile, illeggibile o lontana: oggi', () => {
    expect(dataConsegna('2026-02-30', OGGI).getTime()).toBe(oggi);
    expect(dataConsegna('abc', OGGI).getTime()).toBe(oggi);
    expect(dataConsegna('2030-01-01', OGGI).getTime()).toBe(oggi);
    expect(dataConsegna(undefined, OGGI).getTime()).toBe(oggi);
  });
});

describe('esito per il motore', () => {
  const K: Carrozzeria = {
    slug: 'duplex', nome: 'Duplex', citta: 'Signa', prefisso: 'DX', organizationId: 'org',
    tabellaCanoni: 'sputnik-duplex', brand: { logo: null, colore: '#1B3A57', accento: '#E66A2C' },
    settore: 'macchine', etichettaBene: 'Macchina per la pulizia', partnerLeasing: 'alba', sogliaLeasing: 0,
    tettoMeseEuro: 100, demo: false, documentiExtra: [], attivo: true,
    tabellaAlternativa: 'grace-duplex', regoleSemaforo: 'locatore', leasing: false,
  };
  const BILANCIO = {
    fatturato: 850_000, patrimonioNetto: 310_000, utile: 41_000, inizioAttivita: '2010-03-01',
    annoBilancio: 2025, formaCodice: 'SR', attiva: true, cessata: false,
  };
  it('verde scuro, noleggio sulle quattro durate, niente leasing', () => {
    const e = esitoDaMacchine(calcola('ULTRAX-45', 3500), BILANCIO, K, TABELLA_SPUTNIK_DUPLEX, 'assenti', OGGI);
    expect(e.semaforo).toBe('verde-scuro');
    expect(e.noleggio.map((n) => n.durata)).toEqual([24, 36, 48, 60]);
    expect(e.noleggio.find((n) => n.durata === 60)!.canone).toBe(81);
    expect(e.leasing).toEqual([]);
    expect(e.markup).toBe(0);
  });
  it('senza cliente verificato: stessi canoni, nessun semaforo', () => {
    const conVerifica = esitoDaMacchine(calcola('ULTRAX-45', 3500), BILANCIO, K, TABELLA_SPUTNIK_DUPLEX, 'assenti', OGGI);
    const e = esitoDaMacchine(calcola('ULTRAX-45', 3500), null, K, TABELLA_SPUTNIK_DUPLEX, 'non-avviata', OGGI);
    expect(e.semaforo).toBe('non-verificato');
    expect(e.locatore).toBeNull();
    expect(e.credito).toBeNull();
    expect(e.avvisi).toEqual([]);
    expect(e.bloccate).toBe(false);
    expect(e.noleggio).toEqual(conVerifica.noleggio);
  });
  it('il rosso non blocca e avvisa', () => {
    const e = esitoDaMacchine(calcola('ULTRAX-45', 3500), { ...BILANCIO, fatturato: 0 }, K, TABELLA_SPUTNIK_DUPLEX, 'assenti', OGGI);
    expect(e.semaforo).toBe('rosso');
    expect(e.bloccate).toBe(false);
    expect(e.noleggio).toHaveLength(4);
    expect(e.avvisi.join(' ')).toMatch(/carica la pratica/);
  });
});
