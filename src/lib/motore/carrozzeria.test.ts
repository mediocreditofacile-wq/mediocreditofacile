// La carrozzeria dalla riga del database: i default delle tre impostazioni
// nuove lasciano gli altri fornitori esattamente com'erano.

import { describe, expect, it } from 'vitest';
import { carrozzeriaDaRiga, prodottoAmmesso, type RigaCarrozzeria } from './carrozzeria';

const RIGA: RigaCarrozzeria = {
  slug: 'x', nome: 'X', citta: null, prefisso: 'XX', organization_id: 'org', tabella_canoni: 'sputnik',
  brand_logo: null, brand_colore: null, brand_accento: null, attivo: true, settore: 'generico',
  etichetta_bene: 'Bene', partner_leasing: 'alba', soglia_leasing: '0', tetto_mese_euro: '30', demo: false,
  documenti_extra: [], tabella_alternativa: null, regole_semaforo: 'credit-policy', leasing: true,
};

describe('carrozzeria dalla riga', () => {
  it('i default lasciano tutto com era', () => {
    const c = carrozzeriaDaRiga(RIGA);
    expect(c.settore).toBe('generico');
    expect(c.tabellaAlternativa).toBeNull();
    expect(c.regoleSemaforo).toBe('credit-policy');
    expect(c.leasing).toBe(true);
  });

  it('legge il settore macchine e le tre impostazioni', () => {
    const c = carrozzeriaDaRiga({
      ...RIGA, settore: 'macchine', tabella_alternativa: 'grace-duplex', regole_semaforo: 'locatore', leasing: false,
    });
    expect(c.settore).toBe('macchine');
    expect(c.tabellaAlternativa).toBe('grace-duplex');
    expect(c.regoleSemaforo).toBe('locatore');
    expect(c.leasing).toBe(false);
  });

  it('un valore sconosciuto torna al default sicuro', () => {
    const c = carrozzeriaDaRiga({ ...RIGA, settore: 'boh', regole_semaforo: 'boh', tabella_alternativa: '' });
    expect(c.settore).toBe('generico');
    expect(c.regoleSemaforo).toBe('credit-policy');
    expect(c.tabellaAlternativa).toBeNull();
  });
});

describe('prodotto della pratica', () => {
  it('col leasing spento si carica solo noleggio', () => {
    expect(prodottoAmmesso(carrozzeriaDaRiga({ ...RIGA, leasing: false }), 'leasing')).toBe('noleggio');
  });
  it('col leasing acceso si rispetta la scelta', () => {
    expect(prodottoAmmesso(carrozzeriaDaRiga(RIGA), 'leasing')).toBe('leasing');
    expect(prodottoAmmesso(carrozzeriaDaRiga(RIGA), 'altro')).toBe('noleggio');
  });
});
