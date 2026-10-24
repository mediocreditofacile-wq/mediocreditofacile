import { describe, expect, it } from 'vitest';
import { corpoMail, oggettoMail, type LeadSimulatore } from './mail-simulatore';

const lead = (extra: Partial<LeadSimulatore> = {}): LeadSimulatore => ({
  variante: 'cliente',
  nome: 'Mario <b>Rossi</b>',
  telefono: '3331234567',
  email: 'mario@esempio.it',
  importo: 15000,
  durata: '48',
  tipologia: 'Altri Beni Strumentali',
  canone: '360,00 €',
  clientePiva: '01234567890',
  cliente: {
    piva: '01234567890', trovata: true, ragioneSociale: 'ROSSI SRL', forma: 'SRL', ateco: '28.92', indirizzo: 'Via Roma 1',
    stato: 'ATTIVA', inizioAttivita: '2015-01-01', annoBilancio: 2025, fatturato: 100000, utile: 5000,
  },
  fornitore: { piva: '09876543210', letta: null },
  esito: { colore: 'verde', criteri: [{ chiave: 'anni', nome: 'Anni di attività', valore: '11 anni', ok: true }], indicazioni: [] },
  scheda: 'ordinata',
  avvisi: [],
  ...extra,
});

describe('mail del simulatore', () => {
  it('oggetto con ragione sociale, importo e colore', () => {
    expect(oggettoMail(lead())).toBe('Simulatore: ROSSI SRL · 15.000 € · verde');
    expect(oggettoMail(lead({ cliente: null, esito: null }))).toBe('Simulatore: P.IVA 01234567890 · 15.000 € · senza esito');
  });

  it('il corpo non lascia passare HTML dal modulo', () => {
    const html = corpoMail(lead());
    expect(html).not.toContain('<b>Rossi</b>');
    expect(html).toContain('Mario &lt;b&gt;Rossi&lt;/b&gt;');
  });

  it('con la scheda ordinata porta il link alla valutazione', () => {
    expect(corpoMail(lead())).toContain('/tools/valutazione');
    expect(corpoMail(lead({ scheda: 'no' }))).not.toContain('/tools/valutazione');
  });

  it('gli avvisi stanno in cima', () => {
    const html = corpoMail(lead({ avvisi: ['Verifica non partita: tetto del giorno raggiunto.'] }));
    expect(html.indexOf('tetto del giorno')).toBeLessThan(html.indexOf('Cliente finale'));
  });
});
