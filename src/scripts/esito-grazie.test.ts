import { describe, expect, it } from 'vitest';
import { fraseEsito, htmlEsito, type RisultatoSimulatore } from './esito-grazie';

const r = (extra: Partial<RisultatoSimulatore> = {}): RisultatoSimulatore => ({
  variante: 'azienda',
  colore: 'giallo',
  motivo: null,
  ragioneSociale: 'ROSSI <SRL>',
  indirizzo: 'Via Roma 1',
  forma: 'SRL',
  criteri: [{ chiave: 'anni', nome: 'Anni di attività', valore: '11 anni', ok: true }],
  indicazioni: ['Un anticipo può aiutare.'],
  documenti: ['Visura camerale'],
  importo: 15000,
  consegnato: true,
  ...extra,
});

describe('esito su /grazie', () => {
  it('non promette mai l\'esito', () => {
    for (const colore of ['verde', 'giallo', 'rosso', null] as const) {
      const t = fraseEsito(r({ colore, motivo: colore ? null : 'non_trovata' })).toLowerCase();
      expect(t).not.toContain('approvat');
      expect(t).not.toContain('garantit');
    }
  });

  it('parla del cliente nel modulo del fornitore', () => {
    expect(fraseEsito(r({ variante: 'cliente', colore: 'verde' }))).toContain('del tuo cliente');
    expect(fraseEsito(r({ colore: 'verde' }))).toContain('della tua azienda');
  });

  it('scappa l\'HTML dei dati del registro', () => {
    expect(htmlEsito(r())).toContain('ROSSI &lt;SRL&gt;');
  });

  it('senza consegna della mail offre WhatsApp e telefono', () => {
    expect(htmlEsito(r({ consegnato: false }))).toContain('wa.me/393939957840');
    expect(htmlEsito(r())).not.toContain('wa.me');
  });

  it('senza colore niente nota sulla valutazione', () => {
    expect(htmlEsito(r({ colore: null, motivo: 'non_trovata', criteri: [] }))).not.toContain('non è una delibera');
  });
});
