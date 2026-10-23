// Le regole pure della scheda Proposte del settore mezzi (Bergamelli): chi vende,
// la risposta iniziale sul targato, il corpo per il server, l'anticipo, la colonna
// del leasing che va nel PDF. Il controllo vero lo rifa' il server.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validaBeni } from '../../lib/motore/beni-mezzi';
import { ANTICIPO_MAX_MEZZI, type MezziBrowser } from '../../lib/motore/config-mezzi';
import { stato, traduci } from './comune';
import {
  campoDiErrore,
  campoSimulazione,
  checklistPraticaMezzi,
  chiavePdf,
  colonneConRighe,
  corpoPraticaMezzi,
  corpoProposte,
  corpoSimulazione,
  durateLeasing,
  etichettaColonna,
  leggiAnticipo,
  messaggioRiga,
  messaggioSimulazione,
  provaSimulazione,
  rigaASchermo,
  rigaIntatta,
  righeDaMandare,
  rigaVuota,
  sceltePratica,
  targatoDaMenu,
  targatoIniziale,
  venditoreSuggerito,
  VOCE_BILANCIO_ANALITICO,
  type PreventivoPerPratica,
  type RigaInPagina,
  type SimulazioneInPagina,
} from './mezzi-browser';

// La configurazione come la vede il browser: quella di Bergamelli (piano, Task 12)
const CFG: MezziBrowser = {
  venditori: [
    { codice: 'manc', ragioneSociale: 'MANC SRL', categorie: ['Gru a torre', 'Autogru'] },
    { codice: 'nolsystem', ragioneSociale: 'NOL SYSTEM ITALIA SRL', categorie: [] },
  ],
  categorie: [
    { nome: 'Gru a torre', targato: false },
    { nome: 'Autogru', targato: true },
    { nome: 'Movimento terra', targato: null },
    { nome: 'Piattaforme aeree', targato: null },
    { nome: 'Carrelli elevatori', targato: false },
    { nome: 'Autocarri', targato: true },
    { nome: 'Ponteggi', targato: false },
    { nome: 'Attrezzature', targato: false },
  ],
  anticipoPerc: 10,
  mostraNomiPartner: true,
};

const riga = (r: Partial<RigaInPagina> = {}): RigaInPagina => ({
  descrizione: 'Gru Potain MDT 219',
  categoria: 'Gru a torre',
  quantita: '1',
  prezzo: '48.500,00',
  targato: false,
  ...r,
});

describe('venditoreSuggerito', () => {
  it('la gru la vende Manc, il carrello Nol System', () => {
    expect(venditoreSuggerito(CFG, 'Gru a torre')).toBe('manc');
    expect(venditoreSuggerito(CFG, 'Autogru')).toBe('manc');
    expect(venditoreSuggerito(CFG, 'Carrelli elevatori')).toBe('nolsystem');
  });

  it('una categoria che nessuno elenca, o non ancora scelta, va al venditore di tutto il resto', () => {
    expect(venditoreSuggerito(CFG, 'Ponteggi')).toBe('nolsystem');
    expect(venditoreSuggerito(CFG, '')).toBe('nolsystem');
  });

  it('senza un venditore di tutto il resto, una categoria che nessuno elenca non ha venditore', () => {
    const senzaDefault: MezziBrowser = { ...CFG, venditori: [CFG.venditori[0]] };
    expect(venditoreSuggerito(senzaDefault, 'Carrelli elevatori')).toBeNull();
    expect(venditoreSuggerito(senzaDefault, 'Gru a torre')).toBe('manc');
  });
});

describe('targatoIniziale', () => {
  it("l'autogru e' targata, la gru a torre no", () => {
    expect(targatoIniziale(CFG.categorie, 'Autogru')).toBe(true);
    expect(targatoIniziale(CFG.categorie, 'Gru a torre')).toBe(false);
  });

  it('movimento terra e piattaforme aeree non hanno risposta: la domanda va fatta', () => {
    expect(targatoIniziale(CFG.categorie, 'Movimento terra')).toBeNull();
    expect(targatoIniziale(CFG.categorie, 'Piattaforme aeree')).toBeNull();
  });

  it('una categoria non scelta o sconosciuta non ha risposta, mai "non targato"', () => {
    expect(targatoIniziale(CFG.categorie, '')).toBeNull();
    expect(targatoIniziale(CFG.categorie, 'Elicotteri')).toBeNull();
  });
});

describe('corpoProposte', () => {
  it('quantita e prezzo come li ha scritti l utente: li legge il server', () => {
    const c = corpoProposte('bergamelli', 'r-1', [riga({ quantita: '2', prezzo: '48.500,00' })], 'manc', 10);
    expect(c).toEqual({
      f: 'bergamelli',
      ricercaId: 'r-1',
      beni: [{ descrizione: 'Gru Potain MDT 219', categoria: 'Gru a torre', quantita: '2', prezzo: '48.500,00', targato: false }],
      venditore: 'manc',
      anticipoPerc: 10,
    });
    // E il server li legge davvero: 2 x 48.500
    const letti = validaBeni(CFG.categorie, c.beni);
    expect(letti.ok && letti.totale).toBe(97_000);
  });

  it("l'anticipo e' un numero, non un testo", () => {
    const c = corpoProposte('bergamelli', 'r-1', [riga()], 'manc', 0);
    expect(c.anticipoPerc).toBe(0);
    expect(typeof c.anticipoPerc).toBe('number');
  });

  it('il targato viaggia come true, false o null: mai una stringa', () => {
    const c = corpoProposte('bergamelli', 'r-1', [
      riga({ categoria: 'Autogru', targato: true }),
      riga({ categoria: 'Gru a torre', targato: false }),
      riga({ categoria: 'Movimento terra', targato: null }),
    ], 'manc', 10);
    const beni = c.beni as { targato: unknown }[];
    expect(beni.map((b) => b.targato)).toEqual([true, false, null]);
    // Senza risposta su movimento terra il server si ferma su quella riga
    expect(validaBeni(CFG.categorie, c.beni)).toEqual({ ok: false, error: 'targato_mancante', riga: 2 });
  });

  it('ogni bene porta solo i cinque campi che il server legge', () => {
    const c = corpoProposte('b', 'r', [{ ...riga(), extra: 'x' } as RigaInPagina], 'manc', 10);
    expect(Object.keys((c.beni as object[])[0]).sort()).toEqual(['categoria', 'descrizione', 'prezzo', 'quantita', 'targato']);
  });
});

describe('leggiAnticipo', () => {
  it('un intero da 0 al massimo, anche con spazi intorno', () => {
    expect(leggiAnticipo('10')).toBe(10);
    expect(leggiAnticipo(' 0 ')).toBe(0);
    expect(leggiAnticipo(String(ANTICIPO_MAX_MEZZI))).toBe(ANTICIPO_MAX_MEZZI);
  });

  it('il massimo e quello del server', () => {
    expect(leggiAnticipo(String(ANTICIPO_MAX_MEZZI + 1))).toBeNull();
  });

  it('fuori scala o scritto male non si legge: nessun ripiego sul default', () => {
    for (const v of ['', '   ', '45', '20%', '1.000', '20,5', '20.5', '-1', 'dieci']) {
      expect(leggiAnticipo(v), v).toBeNull();
    }
  });
});

describe('rigaVuota', () => {
  it('una riga appena aggiunta e vuota, anche con la quantita 1 di partenza', () => {
    expect(rigaVuota({ descrizione: '', categoria: '', quantita: '1', prezzo: '', targato: null })).toBe(true);
    expect(rigaVuota({ descrizione: '  ', categoria: '', quantita: '3', prezzo: ' ', targato: null })).toBe(true);
  });

  it('basta la descrizione, la categoria o il prezzo per non essere vuota', () => {
    expect(rigaVuota({ descrizione: 'Gru', categoria: '', quantita: '1', prezzo: '', targato: null })).toBe(false);
    expect(rigaVuota({ descrizione: '', categoria: 'Autogru', quantita: '1', prezzo: '', targato: true })).toBe(false);
    expect(rigaVuota({ descrizione: '', categoria: '', quantita: '1', prezzo: '100', targato: null })).toBe(false);
  });
});

describe('campoDiErrore', () => {
  it('ogni errore di riga segna la casella giusta', () => {
    expect(campoDiErrore('descrizione_mancante')).toBe('descrizione');
    expect(campoDiErrore('categoria_non_valida')).toBe('categoria');
    expect(campoDiErrore('quantita_non_valida')).toBe('quantita');
    expect(campoDiErrore('prezzo_non_valido')).toBe('prezzo');
    expect(campoDiErrore('importo_non_valido')).toBe('prezzo');
    expect(campoDiErrore('targato_mancante')).toBe('targato');
  });

  it('gli errori che non sono di una casella non segnano niente', () => {
    expect(campoDiErrore('venditore_non_valido')).toBeNull();
    expect(campoDiErrore('beni_vuoti')).toBeNull();
  });
});

describe('messaggioRiga', () => {
  it('un prezzo col solo punto delle migliaia: il server non sceglie, la pagina dice come scriverlo', () => {
    expect(messaggioRiga('prezzo_non_valido', riga({ prezzo: '61.000' })))
      .toBe('Scrivi 61000 oppure 61.000,00: con il solo punto non si capisce se sono migliaia o decimali.');
    expect(messaggioRiga('prezzo_non_valido', riga({ prezzo: ' 1.250.000 € ' })))
      .toBe('Scrivi 1250000 oppure 1.250.000,00: con il solo punto non si capisce se sono migliaia o decimali.');
    // Ed e' proprio quello che il server rifiuta
    expect(validaBeni(CFG.categorie, [riga({ prezzo: '61.000' })])).toEqual({ ok: false, error: 'prezzo_non_valido', riga: 0 });
  });

  it('una quantita col punto delle migliaia va scritta senza punti', () => {
    expect(messaggioRiga('quantita_non_valida', riga({ quantita: '1.000' }))).toBe('Scrivi la quantità senza punti: 1000.');
  });

  it('gli altri errori restano quelli di sempre', () => {
    expect(messaggioRiga('prezzo_non_valido', riga({ prezzo: '0' }))).toBeNull();
    expect(messaggioRiga('prezzo_non_valido', riga({ prezzo: '61.000,00' }))).toBeNull();
    expect(messaggioRiga('targato_mancante', riga({ prezzo: '61.000' }))).toBeNull();
    expect(messaggioRiga('prezzo_non_valido', undefined)).toBeNull();
  });
});

// --- il leasing a schermo ---------------------------------------------------------

const r = (durata: number, rata: number) => ({
  durata, rata, numRate: durata - 1, anticipo: 5000, anticipoPerc: 10, riscatto: 500, riscattoPerc: 1,
  speseIstruttoria: 400, speseIncassoRata: 5, spese: 400 + 5 * (durata - 1), totale: 60_000,
});
const colonna = (chiave: string, righe: ReturnType<typeof r>[], nome: string | null = null, motivo: string | null = null) =>
  ({ chiave, nome, motivo, righe });

describe('etichettaColonna', () => {
  it('il nome del partner quando c e, altrimenti Soluzione e la lettera', () => {
    expect(etichettaColonna(colonna('A', [], 'Sella Leasing'))).toBe('Sella Leasing');
    expect(etichettaColonna(colonna('B', [], null))).toBe('Soluzione B');
  });
});

describe('durateLeasing e colonneConRighe', () => {
  it('le durate di tutte le colonne, una volta sola e in ordine', () => {
    const leasing = [colonna('A', [r(60, 900), r(36, 1400)]), colonna('B', []), colonna('C', [r(84, 700), r(60, 910)])];
    expect(durateLeasing(leasing)).toEqual([36, 60, 84]);
    expect(colonneConRighe(leasing).map((c) => c.chiave)).toEqual(['A', 'C']);
  });
});

describe('chiavePdf: la colonna del leasing che va nel PDF', () => {
  const TRE = [
    colonna('A', [r(36, 1500), r(60, 950)]),
    colonna('B', [r(36, 1450), r(60, 930)]),
    colonna('C', [r(36, 1400), r(60, 940)]),
  ];

  it('senza scelta, la rata piu bassa a 60 mesi', () => {
    expect(chiavePdf(TRE, null)).toBe('B');
  });

  it('a parita resta la prima nell ordine', () => {
    expect(chiavePdf([colonna('A', [r(60, 900)]), colonna('B', [r(60, 900)])], null)).toBe('A');
  });

  it('la scelta dell agente vale finche quella colonna ha righe', () => {
    expect(chiavePdf(TRE, 'C')).toBe('C');
    const senzaC = [TRE[0], TRE[1], colonna('C', [], null, 'Importo sotto il minimo')];
    expect(chiavePdf(senzaC, 'C')).toBe('B');
    expect(chiavePdf(TRE, 'Z')).toBe('B');
  });

  it('una colonna senza righe non va mai nel PDF', () => {
    expect(chiavePdf([colonna('A', [], null, 'Importo sotto il minimo'), TRE[2]], null)).toBe('C');
  });

  it('senza i 60 mesi in comune vale la durata piu lunga in comune', () => {
    const l = [colonna('A', [r(36, 1500), r(48, 1100)]), colonna('B', [r(36, 1400), r(48, 1200)])];
    expect(chiavePdf(l, null)).toBe('A');
  });

  it('senza durate in comune va la prima colonna con righe', () => {
    expect(chiavePdf([colonna('A', []), colonna('B', [r(36, 1500)]), colonna('C', [r(84, 600)])], null)).toBe('B');
  });

  it('nessuna colonna con righe: niente leasing nel PDF', () => {
    expect(chiavePdf([], null)).toBeNull();
    expect(chiavePdf([colonna('A', [], null, 'x')], 'A')).toBeNull();
  });
});

describe('i messaggi del settore mezzi', () => {
  it('targato, venditore, anticipo e beni vuoti hanno un testo per l agente', () => {
    const prima = stato.settore;
    try {
      stato.settore = 'mezzi';
      expect(traduci('targato_mancante')).toBe('Indica se il mezzo è targato.');
      expect(traduci('anticipo_non_valido')).toBe("L'anticipo va da 0 a 30%.");
      for (const codice of ['venditore_non_valido', 'beni_vuoti', 'troppi_beni']) {
        expect(traduci(codice), codice).not.toBe('Qualcosa non ha funzionato. Riprova.');
      }
      expect(traduci('configurazione_mancante')).toBe('Il portale non è ancora configurato per i mezzi. Scrivi a Mediocredito Facile.');
      // Sugli altri settori la configurazione che manca resta quella della pratica
      stato.settore = 'distinta';
      expect(traduci('configurazione_mancante')).toBe('Il portale non è configurato per le pratiche. Scrivi a Mediocredito Facile.');
    } finally {
      stato.settore = prima;
    }
  });
});

// --- le righe che vanno al server ---------------------------------------------------

const intatta = (): RigaInPagina => ({ descrizione: '', categoria: '', quantita: '1', prezzo: '', targato: null });

describe('rigaIntatta', () => {
  it('la riga appena aggiunta, anche senza la quantita di partenza', () => {
    expect(rigaIntatta(intatta())).toBe(true);
    expect(rigaIntatta({ ...intatta(), quantita: '' })).toBe(true);
    expect(rigaIntatta({ ...intatta(), descrizione: '  ', prezzo: ' ' })).toBe(true);
  });

  it('basta toccare un campo, quantita e targato compresi, perche la riga conti', () => {
    expect(rigaIntatta({ ...intatta(), descrizione: 'Gru' })).toBe(false);
    expect(rigaIntatta({ ...intatta(), categoria: 'Autogru', targato: true })).toBe(false);
    expect(rigaIntatta({ ...intatta(), prezzo: '100' })).toBe(false);
    expect(rigaIntatta({ ...intatta(), quantita: '3' })).toBe(false);
    expect(rigaIntatta({ ...intatta(), targato: false })).toBe(false);
  });
});

describe('righeDaMandare e rigaASchermo', () => {
  it('la riga appena aggiunta resta fuori: il conto e quello di prima, senza errori', () => {
    const { righe, indici } = righeDaMandare([riga(), intatta()]);
    expect(righe).toEqual([riga()]);
    expect(indici).toEqual([0]);
    expect(validaBeni(CFG.categorie, corpoProposte('b', 'r', righe, 'manc', 10).beni).ok).toBe(true);
  });

  it('la prima riga va sempre, anche intatta: il server dice che manca la descrizione', () => {
    expect(righeDaMandare([intatta()]).righe).toEqual([intatta()]);
    const { righe, indici } = righeDaMandare([intatta(), riga()]);
    expect(indici).toEqual([0, 1]);
    expect(righe).toHaveLength(2);
  });

  it("l'errore del server torna sulla riga a schermo, saltando quelle rimaste fuori", () => {
    const aSchermo = [riga(), intatta(), riga({ prezzo: '61.000' }), intatta()];
    const { righe, indici } = righeDaMandare(aSchermo);
    expect(indici).toEqual([0, 2]);
    const v = validaBeni(CFG.categorie, corpoProposte('b', 'r', righe, 'manc', 10).beni);
    expect(v).toEqual({ ok: false, error: 'prezzo_non_valido', riga: 1 });
    expect(rigaASchermo(indici, v.ok ? null : v.riga)).toBe(2);
  });

  it('un errore senza riga resta senza riga, e un indice che non esiste non si inventa', () => {
    expect(rigaASchermo([0, 2], null)).toBeNull();
    expect(rigaASchermo([0, 2], undefined)).toBeNull();
    expect(rigaASchermo([0, 2], 5)).toBeNull();
  });
});

// --- la simulazione ------------------------------------------------------------------

const sim = (s: Partial<SimulazioneInPagina> = {}): SimulazioneInPagina => ({
  importo: '48.500,00', categoria: 'Gru a torre', targato: false, venditore: 'manc', ...s,
});

describe('provaSimulazione', () => {
  it('senza importo o senza categoria non si chiede niente e non si rimprovera niente', () => {
    expect(provaSimulazione(CFG.categorie, sim({ importo: '' }))).toBe('incompleta');
    expect(provaSimulazione(CFG.categorie, sim({ importo: '   ' }))).toBe('incompleta');
    expect(provaSimulazione(CFG.categorie, sim({ categoria: '' }))).toBe('incompleta');
  });

  it('un importo che il server non legge, o oltre il tetto, e importo_non_valido', () => {
    expect(provaSimulazione(CFG.categorie, sim({ importo: '61.000' }))).toBe('importo_non_valido');
    expect(provaSimulazione(CFG.categorie, sim({ importo: 'tanti' }))).toBe('importo_non_valido');
    expect(provaSimulazione(CFG.categorie, sim({ importo: '0' }))).toBe('importo_non_valido');
    expect(provaSimulazione(CFG.categorie, sim({ importo: '99999999' }))).toBe('importo_non_valido');
  });

  it('movimento terra senza risposta sul targato si ferma: mai "non targato"', () => {
    expect(provaSimulazione(CFG.categorie, sim({ categoria: 'Movimento terra', targato: null }))).toBe('targato_mancante');
    expect(provaSimulazione(CFG.categorie, sim({ categoria: 'Movimento terra', targato: true }))).toBe('pronta');
  });

  it('una categoria che non e del fornitore si segna', () => {
    expect(provaSimulazione(CFG.categorie, sim({ categoria: 'Elicotteri' }))).toBe('categoria_non_valida');
  });

  it('importo e categoria a posto: si chiede il conto', () => {
    expect(provaSimulazione(CFG.categorie, sim())).toBe('pronta');
    expect(provaSimulazione(CFG.categorie, sim({ importo: '61000' }))).toBe('pronta');
  });
});

describe('corpoSimulazione', () => {
  it("l'importo com'e scritto, il targato true, false o null, chi vende", () => {
    expect(corpoSimulazione('bergamelli', sim())).toEqual({
      f: 'bergamelli', importo: '48.500,00', categoria: 'Gru a torre', targato: false, venditore: 'manc',
    });
    expect(corpoSimulazione('b', sim({ categoria: 'Movimento terra', targato: null })).targato).toBeNull();
    expect(corpoSimulazione('b', sim({ categoria: 'Autogru', targato: true })).targato).toBe(true);
  });

  it('niente anticipo, niente documento: la simulazione non salva', () => {
    expect(Object.keys(corpoSimulazione('b', sim())).sort()).toEqual(['categoria', 'f', 'importo', 'targato', 'venditore']);
  });
});

describe('targatoDaMenu', () => {
  it('Sì e No sono booleani, "Da indicare" e tutto il resto null', () => {
    expect(targatoDaMenu('si')).toBe(true);
    expect(targatoDaMenu('no')).toBe(false);
    expect(targatoDaMenu('')).toBeNull();
    expect(targatoDaMenu('forse')).toBeNull();
  });
});

describe('campoSimulazione e messaggioSimulazione', () => {
  it('ogni errore segna la sua casella', () => {
    expect(campoSimulazione('importo_non_valido')).toBe('importo');
    expect(campoSimulazione('categoria_non_valida')).toBe('categoria');
    expect(campoSimulazione('targato_mancante')).toBe('targato');
    expect(campoSimulazione('venditore_non_valido')).toBe('venditore');
    expect(campoSimulazione('calcolo_non_riuscito')).toBeNull();
  });

  it('"61.000" dice come scriverlo, gli altri errori restano quelli di sempre', () => {
    expect(messaggioSimulazione('importo_non_valido', sim({ importo: '61.000' })))
      .toBe('Scrivi 61000 oppure 61.000,00: con il solo punto non si capisce se sono migliaia o decimali.');
    expect(messaggioSimulazione('importo_non_valido', sim({ importo: '0' }))).toBeNull();
    expect(messaggioSimulazione('targato_mancante', sim({ importo: '61.000' }))).toBeNull();
  });
});

// --- la pratica ------------------------------------------------------------------------

const preventivo = (p: Partial<PreventivoPerPratica> = {}): PreventivoPerPratica => ({
  id: 'EB-20261023-0001',
  ricercaId: 'r-1',
  chiaveLeasing: 'B',
  schermo: {
    totale: 48_500,
    noleggio: { rate: [24, 36, 48, 60].map((durata) => ({ durata })), durataEvidenza: 60 },
    leasing: [
      { chiave: 'A', nome: null, righe: [] },
      { chiave: 'B', nome: null, righe: [36, 48, 60, 72, 84].map((durata) => ({ durata })) },
      { chiave: 'C', nome: null, righe: [36, 48].map((durata) => ({ durata })) },
    ],
  },
  ...p,
});

describe('sceltePratica', () => {
  it('senza preventivo, o col preventivo di un altro cliente, la pratica non parte', () => {
    expect(sceltePratica(null, 'r-1')).toBeNull();
    expect(sceltePratica(preventivo(), null)).toBeNull();
    expect(sceltePratica(preventivo(), 'r-2')).toBeNull();
  });

  it("importo e preventivo vengono dal preventivo salvato: l'importo non si scrive", () => {
    const s = sceltePratica(preventivo(), 'r-1')!;
    expect(s.propostaId).toBe('EB-20261023-0001');
    expect(s.ricercaId).toBe('r-1');
    expect(s.importo).toBe(48_500);
  });

  it('il noleggio offre le sue durate e parte dalla durata in evidenza', () => {
    const s = sceltePratica(preventivo(), 'r-1')!;
    expect(s.noleggio).toEqual({ durate: [24, 36, 48, 60], durata: 60 });
    expect(s.prodotto).toBe('noleggio');
  });

  it("senza durata in evidenza il noleggio parte dall'ultima", () => {
    const p = preventivo();
    p.schermo.noleggio = { rate: [36, 48].map((durata) => ({ durata })), durataEvidenza: null };
    expect(sceltePratica(p, 'r-1')!.noleggio).toEqual({ durate: [36, 48], durata: 48 });
  });

  it('il leasing offre solo le colonne che quotano, con le loro durate, a 60 mesi o all ultima', () => {
    const s = sceltePratica(preventivo(), 'r-1')!;
    expect(s.leasing).toEqual([
      { chiave: 'B', etichetta: 'Soluzione B', durate: [36, 48, 60, 72, 84], durata: 60 },
      { chiave: 'C', etichetta: 'Soluzione C', durate: [36, 48], durata: 48 },
    ]);
  });

  it('coi nomi accesi il menu dice il partner', () => {
    const p = preventivo();
    p.schermo.leasing[1].nome = 'Credem Leasing';
    expect(sceltePratica(p, 'r-1')!.leasing[0].etichetta).toBe('Credem Leasing');
  });

  it('la colonna di partenza e quella del PDF, se quota; se no la prima che quota', () => {
    expect(sceltePratica(preventivo(), 'r-1')!.colonna).toBe('B');
    expect(sceltePratica(preventivo({ chiaveLeasing: 'C' }), 'r-1')!.colonna).toBe('C');
    expect(sceltePratica(preventivo({ chiaveLeasing: 'A' }), 'r-1')!.colonna).toBe('B');
    expect(sceltePratica(preventivo({ chiaveLeasing: null }), 'r-1')!.colonna).toBe('B');
  });

  it('senza noleggio (mezzo targato) il prodotto e il leasing', () => {
    const p = preventivo();
    p.schermo.noleggio = null;
    const s = sceltePratica(p, 'r-1')!;
    expect(s.noleggio).toBeNull();
    expect(s.prodotto).toBe('leasing');
  });

  it('senza leasing che quota resta il noleggio', () => {
    const p = preventivo({ chiaveLeasing: null });
    p.schermo.leasing = [{ chiave: 'A', nome: null, righe: [] }];
    const s = sceltePratica(p, 'r-1')!;
    expect(s.leasing).toEqual([]);
    expect(s.colonna).toBeNull();
    expect(s.prodotto).toBe('noleggio');
  });

  it('un preventivo che non quota niente non apre una pratica', () => {
    const p = preventivo();
    p.schermo.noleggio = null;
    p.schermo.leasing = [];
    expect(sceltePratica(p, 'r-1')).toBeNull();
  });
});

describe('checklistPraticaMezzi', () => {
  it('sul leasing, in coda, il bilancio analitico; sul noleggio no', () => {
    const noleggio = checklistPraticaMezzi('Società di capitali', 48_500, ['Offerta del venditore'], 'noleggio');
    const leasing = checklistPraticaMezzi('Società di capitali', 48_500, ['Offerta del venditore'], 'leasing');
    expect(noleggio).not.toContain(VOCE_BILANCIO_ANALITICO);
    expect(leasing).toEqual([...noleggio, VOCE_BILANCIO_ANALITICO]);
  });

  it('e la stessa lista che arriva a MCF con la pratica', async () => {
    const { checklistPratica } = await import('../../lib/motore/pratica');
    const extra = (prodotto: string) => ({
      venditore: 'MANC SRL', partner: null, rivalutare: false,
      checklistExtra: prodotto === 'leasing' ? [VOCE_BILANCIO_ANALITICO] : [],
    });
    for (const [forma, importo] of [['Ditta individuale', 8_000], ['Società di capitali', 48_500]] as const) {
      for (const prodotto of ['noleggio', 'leasing']) {
        expect(checklistPraticaMezzi(forma, importo, ['Offerta del venditore'], prodotto))
          .toEqual(checklistPratica(forma, importo, extra(prodotto), ['Offerta del venditore']));
      }
    }
  });

  it('la voce del bilancio analitico e parola per parola quella del server', async () => {
    const server = await import('../../lib/motore/pratica-mezzi');
    expect(VOCE_BILANCIO_ANALITICO).toBe(server.VOCE_BILANCIO_ANALITICO);
  });
});

describe('corpoPraticaMezzi', () => {
  const campi = {
    f: 'bergamelli', ricercaId: 'r-1', bozza: 'b-1', formaGiuridica: 'Società di capitali',
    referente: { nome: 'Mario Rossi', telefono: '3331234567', email: 'm@x.it' },
    iban: 'IT60X0542811101000000123456', note: '', documenti: [],
  };

  it('il preventivo e la colonna del leasing; nessun importo, lo rilegge il server', () => {
    const c = corpoPraticaMezzi(campi, 'EB-1', 'leasing', 60, 'B');
    expect(c).toEqual({ ...campi, propostaId: 'EB-1', prodotto: 'leasing', durata: 60, leasingChiave: 'B' });
    expect(c).not.toHaveProperty('importo');
  });

  it('sul noleggio la colonna non va', () => {
    const c = corpoPraticaMezzi(campi, 'EB-1', 'noleggio', 48, 'B');
    expect(c).toEqual({ ...campi, propostaId: 'EB-1', prodotto: 'noleggio', durata: 48 });
    expect(c).not.toHaveProperty('leasingChiave');
  });
});

describe('i messaggi della pratica dei mezzi', () => {
  it('ogni rifiuto del server ha un testo per l agente', () => {
    const prima = stato.settore;
    try {
      stato.settore = 'mezzi';
      expect(traduci('preventivo_mancante')).toBe('Scarica prima il preventivo nella scheda Proposte: la pratica parte da lì.');
      for (const codice of ['preventivo_non_trovato', 'prodotto_non_valido', 'partner_non_valido', 'durata_non_valida']) {
        expect(traduci(codice), codice).not.toBe('Qualcosa non ha funzionato. Riprova.');
      }
    } finally {
      stato.settore = prima;
    }
  });
});

// --- quello che il browser importa ------------------------------------------------

describe('import nei file del browser', () => {
  // config-mezzi porta gli spread, gli altri moduli i listini e il database: dal
  // browser se ne importano solo i tipi, altrimenti finiscono nel bundle degli agenti
  const RISERVATI = ['config-mezzi', 'calcolo-mezzi', 'preventivo-mezzi', 'leasing-confronto', 'pratica-mezzi', 'instradamento', 'pratica'];
  for (const file of ['./mezzi-browser.ts', './proposte-mezzi.ts', './simulazione-mezzi.ts', './simulazione.ts', './pratiche.ts']) {
    it(`${file} importa solo tipi dai moduli del server`, () => {
      const sorgente = readFileSync(new URL(file, import.meta.url), 'utf8');
      const importazioni = [...sorgente.matchAll(/^import\s+(type\s+)?[^;]*?from\s+'([^']+)'/gms)];
      expect(importazioni.length).toBeGreaterThan(0);
      for (const [, tipo, modulo] of importazioni) {
        if (RISERVATI.some((m) => modulo.endsWith(`/${m}`))) expect(tipo, `${file}: ${modulo}`).toBe('type ');
      }
    });
  }
});
