// I beni del settore mezzi: le righe che l'agente descrive a mano, ricontrollate sul
// server contro le categorie del fornitore. Il browser si aggira, quindi si provano
// soprattutto i casi storti: ogni riga che non regge ferma l'elenco con il suo
// motivo e il suo indice. Il caso che pesa di piu' e' il targato senza risposta:
// non vale mai "non targato", altrimenti Grenke quoterebbe un mezzo targato.

import { describe, expect, it } from 'vitest';
import { validaBeni } from './beni-mezzi';
import type { CategoriaMezzo } from './config-mezzi';
import { MAX_QUANTITA, MAX_RIGHE, MAX_TOTALE } from './distinta';

// --- fixture ----------------------------------------------------------------

// Una categoria con la risposta decisa a monte (false, true) e due che si chiedono sempre (null)
const CAT: CategoriaMezzo[] = [
  { nome: 'Gru a torre', targato: false },
  { nome: 'Autocarri', targato: true },
  { nome: 'Movimento terra', targato: null },
  { nome: 'Piattaforme aeree', targato: null },
];

const gru = { descrizione: 'Gru Potain', categoria: 'Gru a torre', quantita: 1, prezzo: '48.500,00' };

describe('validaBeni: un bene valido', () => {
  it('legge il prezzo all\'italiana e prende il targato dalla categoria', () => {
    const e = validaBeni(CAT, [gru]);
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(e.beni).toEqual([
      { descrizione: 'Gru Potain', categoria: 'Gru a torre', quantita: 1, prezzo: 48500, targato: false, totale: 48500 },
    ]);
    expect(e.totale).toBe(48500);
    expect(e.targato).toBe(false);
    expect(e.categorie).toEqual(['Gru a torre']);
  });

  it('il prezzo si arrotonda al centesimo, il totale di riga e\' prezzo per quantita\', quello dell\'elenco la somma dei totali di riga', () => {
    const e = validaBeni(CAT, [
      { ...gru, quantita: 3, prezzo: '33,333' },
      { descrizione: 'Autocarro', categoria: 'Autocarri', quantita: 2, prezzo: 10.1 },
    ]);
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(e.beni[0].prezzo).toBe(33.33);
    expect(e.beni[0].totale).toBe(99.99);
    expect(e.beni[1].totale).toBe(20.2);
    expect(e.totale).toBe(120.19);
  });

  it('ripulisce la descrizione e la taglia a 200 caratteri', () => {
    const e = validaBeni(CAT, [{ ...gru, descrizione: `  ${'x'.repeat(250)}  ` }]);
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(e.beni[0].descrizione).toBe('x'.repeat(200));
  });

  it('del browser conta solo cio\' che serve: una categoria con il nome stampato in altro modo non passa', () => {
    expect(validaBeni(CAT, [{ ...gru, categoria: 'gru a torre' }])).toEqual({ ok: false, error: 'categoria_non_valida', riga: 0 });
  });
});

describe('validaBeni: la domanda sul targato', () => {
  it('una categoria senza default e una riga senza risposta: targato_mancante, con l\'indice della riga', () => {
    const e = validaBeni(CAT, [gru, { descrizione: 'Escavatore', categoria: 'Movimento terra', quantita: 1, prezzo: 90000 }]);
    expect(e).toEqual({ ok: false, error: 'targato_mancante', riga: 1 });
  });

  it('una categoria senza default e una riga con la risposta: vale la risposta', () => {
    const e = validaBeni(CAT, [
      { descrizione: 'Escavatore', categoria: 'Movimento terra', quantita: 1, prezzo: 90000, targato: false },
      { descrizione: 'Pala gommata', categoria: 'Movimento terra', quantita: 1, prezzo: 70000, targato: true },
    ]);
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(e.beni.map((b) => b.targato)).toEqual([false, true]);
  });

  it('la riga con targato true su una categoria targato false: vale la riga (Enrico conferma o corregge)', () => {
    const e = validaBeni(CAT, [{ ...gru, targato: true }]);
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(e.beni[0].targato).toBe(true);
    expect(e.targato).toBe(true);
  });

  it('la riga con targato false su una categoria targato true: vale la riga', () => {
    const e = validaBeni(CAT, [{ descrizione: 'Dumper', categoria: 'Autocarri', quantita: 1, prezzo: 50000, targato: false }]);
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(e.beni[0].targato).toBe(false);
  });

  it('senza risposta sulla riga si usa il default della categoria, anche quando e\' true', () => {
    const e = validaBeni(CAT, [{ descrizione: 'Autocarro', categoria: 'Autocarri', quantita: 1, prezzo: 50000 }]);
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(e.beni[0].targato).toBe(true);
  });

  // Un "si" o un 1 non sono una risposta: su una categoria senza default si richiede,
  // mai si legge come falso (ne' come vero, che sarebbe comunque una scelta al posto suo)
  it.each([['si'], ['sì'], ['true'], ['false'], [1], [0], [null], ['']])(
    'targato %j non e\' una risposta: su una categoria senza default e\' targato_mancante',
    (valore) => {
      const e = validaBeni(CAT, [{ descrizione: 'Piattaforma', categoria: 'Piattaforme aeree', quantita: 1, prezzo: 60000, targato: valore }]);
      expect(e).toEqual({ ok: false, error: 'targato_mancante', riga: 0 });
    },
  );

  it('targato non booleano su una categoria con default: vale il default', () => {
    const e = validaBeni(CAT, [{ ...gru, targato: 'si' }]);
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(e.beni[0].targato).toBe(false);
  });

  it('targato dell\'elenco e\' vero se lo e\' almeno un bene', () => {
    const e = validaBeni(CAT, [gru, { descrizione: 'Autocarro', categoria: 'Autocarri', quantita: 1, prezzo: 50000 }]);
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(e.targato).toBe(true);
  });
});

describe('validaBeni: le categorie dell\'esito', () => {
  it('senza doppioni, nell\'ordine in cui compaiono', () => {
    const e = validaBeni(CAT, [
      { descrizione: 'Autocarro 1', categoria: 'Autocarri', quantita: 1, prezzo: 50000 },
      gru,
      { descrizione: 'Autocarro 2', categoria: 'Autocarri', quantita: 1, prezzo: 40000 },
      { ...gru, descrizione: 'Gru Liebherr' },
    ]);
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(e.categorie).toEqual(['Autocarri', 'Gru a torre']);
  });

  it('un esito riuscito ha sempre almeno un bene e almeno una categoria', () => {
    const e = validaBeni(CAT, [gru]);
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(e.beni.length).toBeGreaterThan(0);
    expect(e.categorie.length).toBeGreaterThan(0);
  });
});

describe('validaBeni: i rifiuti', () => {
  it.each([
    ['non e\' un elenco', 'ciao'],
    ['null', null],
    ['un oggetto', { gru }],
    ['un elenco vuoto', []],
  ])('%s: beni_vuoti', (_nome, grezze) => {
    expect(validaBeni(CAT, grezze)).toEqual({ ok: false, error: 'beni_vuoti', riga: null });
  });

  it(`${MAX_RIGHE} righe passano, ${MAX_RIGHE + 1} no: troppi_beni`, () => {
    expect(validaBeni(CAT, Array.from({ length: MAX_RIGHE }, () => gru)).ok).toBe(true);
    expect(validaBeni(CAT, Array.from({ length: MAX_RIGHE + 1 }, () => gru))).toEqual({ ok: false, error: 'troppi_beni', riga: null });
  });

  it('descrizione vuota, di soli spazi o non testuale: descrizione_mancante con la riga', () => {
    for (const descrizione of ['', '   ', undefined, 42]) {
      expect(validaBeni(CAT, [gru, { ...gru, descrizione }])).toEqual({ ok: false, error: 'descrizione_mancante', riga: 1 });
    }
  });

  it('categoria sconosciuta o mancante: categoria_non_valida con la riga', () => {
    expect(validaBeni(CAT, [{ ...gru, categoria: 'Cucine' }])).toEqual({ ok: false, error: 'categoria_non_valida', riga: 0 });
    expect(validaBeni(CAT, [gru, gru, { ...gru, categoria: undefined }])).toEqual({ ok: false, error: 'categoria_non_valida', riga: 2 });
    expect(validaBeni(CAT, [{ ...gru, categoria: 7 }])).toEqual({ ok: false, error: 'categoria_non_valida', riga: 0 });
  });

  it('una categoria che il fornitore non ha non passa, anche se il browser la manda con la risposta sul targato', () => {
    expect(validaBeni([], [{ ...gru, targato: false }])).toEqual({ ok: false, error: 'categoria_non_valida', riga: 0 });
  });

  it('quantita\' "1.000" e\' ambigua (1000 o 1,0): quantita_non_valida; lo stesso per zero, decimali, oltre il massimo', () => {
    for (const quantita of ['1.000', 0, -1, 1.5, '2,5', MAX_QUANTITA + 1, 'tre', undefined, null]) {
      expect(validaBeni(CAT, [{ ...gru, quantita }])).toEqual({ ok: false, error: 'quantita_non_valida', riga: 0 });
    }
    expect(validaBeni(CAT, [{ ...gru, quantita: '2' }]).ok).toBe(true);
    expect(validaBeni(CAT, [{ ...gru, quantita: 2, prezzo: 1 }]).ok).toBe(true);
  });

  it('prezzo zero, negativo, mancante o illeggibile: prezzo_non_valido', () => {
    for (const prezzo of [0, '0', '0,00', -5, '', undefined, null, 'gratis', '1.500']) {
      expect(validaBeni(CAT, [gru, { ...gru, prezzo }])).toEqual({ ok: false, error: 'prezzo_non_valido', riga: 1 });
    }
  });

  it('un totale di riga oltre i dieci milioni: importo_non_valido con la riga; esattamente dieci milioni passa', () => {
    expect(validaBeni(CAT, [{ ...gru, quantita: 1, prezzo: MAX_TOTALE }]).ok).toBe(true);
    expect(validaBeni(CAT, [gru, { ...gru, quantita: 2, prezzo: 6_000_000 }])).toEqual({ ok: false, error: 'importo_non_valido', riga: 1 });
  });

  it('un totale di elenco oltre i dieci milioni, con ogni riga sotto: importo_non_valido senza riga', () => {
    const e = validaBeni(CAT, [
      { ...gru, prezzo: 6_000_000 },
      { ...gru, prezzo: 6_000_000 },
    ]);
    expect(e).toEqual({ ok: false, error: 'importo_non_valido', riga: null });
  });

  it('si ferma alla prima riga che non regge, anche se piu\' avanti ce ne sono altre storte', () => {
    const e = validaBeni(CAT, [gru, { ...gru, prezzo: 0 }, { ...gru, categoria: 'Cucine' }]);
    expect(e).toEqual({ ok: false, error: 'prezzo_non_valido', riga: 1 });
  });

  it('una riga che non e\' un oggetto: descrizione_mancante, senza eccezioni', () => {
    for (const riga of [null, 'gru', 5, [gru]]) {
      expect(validaBeni(CAT, [riga])).toEqual({ ok: false, error: 'descrizione_mancante', riga: 0 });
    }
  });
});
