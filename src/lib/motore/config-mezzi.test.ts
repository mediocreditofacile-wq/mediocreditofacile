// Configurazione del settore mezzi: venditori, categorie con la domanda sul targato,
// condizioni del leasing. E' JSON scritto dal Pannello MCF o dal seed, quindi si
// provano soprattutto i casi storti: un valore che non si legge si scarta, non si
// indovina. I rifiuti sono un test ciascuno, cosi' un caso che smette di rifiutare
// fallisce da solo.

import { describe, expect, it } from 'vitest';
import { ALBA, CREDEM, SELLA } from '../../data/leasing';
import { pivaValida } from '../piva';
import {
  ANTICIPO_MAX_MEZZI,
  condizioneDaSpread,
  leggiConfigMezzi,
  venditoreDiCategoria,
} from './config-mezzi';

const MANC = {
  codice: 'manc',
  ragioneSociale: 'Manc S.r.l.',
  piva: '05400750260',
  indirizzo: 'Via Roma 1, 31100 Treviso (TV)',
  telefono: '+39 0422 000000',
  email: 'info@manc.example',
  pec: 'manc@pec.example',
  categorie: ['Gru a torre', 'Autogru'],
};

// Il venditore di tutto il resto: categorie vuote. Recapiti vuoti ammessi
const NOLSYSTEM = {
  codice: 'nolsystem',
  ragioneSociale: 'Nol System S.r.l.',
  piva: '01234567897',
  indirizzo: '',
  telefono: '',
  email: '',
  pec: '',
  categorie: [] as string[],
};

const VALIDA = {
  venditori: [MANC, NOLSYSTEM],
  categorie: [
    { nome: 'Gru a torre', targato: false },
    { nome: 'Autogru', targato: true },
    { nome: 'Carrelli elevatori', targato: null },
  ],
  leasing: {
    anticipoPerc: 10,
    partner: [
      { partner: 'sella', spreadFinoA48: 2.25, spreadDa60: 2.25 },
      { partner: 'credem', spreadFinoA48: 2.9, spreadDa60: 2.9 },
      { partner: 'alba', spreadFinoA48: 3.1, spreadDa60: 2.5 },
    ],
  },
  mostraNomiPartner: true,
};

/** Copia profonda della configurazione valida, ritoccata da `modifica` */
function con(modifica: (c: typeof VALIDA) => void): unknown {
  const copia = structuredClone(VALIDA);
  modifica(copia);
  return copia;
}

describe('leggiConfigMezzi: configurazione valida', () => {
  it('si rilegge identica', () => {
    expect(leggiConfigMezzi(VALIDA)).toEqual(VALIDA);
  });

  it('anticipo ai confini: 0 e 30 passano', () => {
    expect(ANTICIPO_MAX_MEZZI).toBe(30);
    expect(leggiConfigMezzi(con((c) => (c.leasing.anticipoPerc = 0)))?.leasing.anticipoPerc).toBe(0);
    expect(leggiConfigMezzi(con((c) => (c.leasing.anticipoPerc = 30)))?.leasing.anticipoPerc).toBe(30);
  });

  it('mostraNomiPartner false e un elenco di partner vuoto sono configurazioni valide', () => {
    const c = leggiConfigMezzi(con((x) => { x.mostraNomiPartner = false; x.leasing.partner = []; }))!;
    expect(c.mostraNomiPartner).toBe(false);
    expect(c.leasing.partner).toEqual([]);
  });
});

describe('leggiConfigMezzi: contenitore', () => {
  it('null, array e valori che non sono oggetti danno null', () => {
    for (const v of [null, undefined, [], [VALIDA], 'boh', 7, true]) expect(leggiConfigMezzi(v)).toBeNull();
  });

  it('senza uno dei quattro blocchi da null', () => {
    for (const chiave of ['venditori', 'categorie', 'leasing', 'mostraNomiPartner']) {
      expect(leggiConfigMezzi(con((c) => delete (c as Record<string, unknown>)[chiave])), chiave).toBeNull();
    }
  });

  it('venditori o categorie che non sono elenchi danno null', () => {
    expect(leggiConfigMezzi({ ...VALIDA, venditori: 'manc' })).toBeNull();
    expect(leggiConfigMezzi({ ...VALIDA, categorie: {} })).toBeNull();
    expect(leggiConfigMezzi({ ...VALIDA, leasing: [] })).toBeNull();
    expect(leggiConfigMezzi({ ...VALIDA, leasing: { ...VALIDA.leasing, partner: 'sella' } })).toBeNull();
  });
});

describe('leggiConfigMezzi: un venditore illeggibile fa cadere la configurazione', () => {
  // Il venditore decide la societa' che firma le offerte: uno illeggibile non si scarta,
  // altrimenti le sue categorie passerebbero in silenzio al venditore di default e
  // l'offerta uscirebbe con la ragione sociale e la P.IVA di un altro
  const EXTRA = { ...NOLSYSTEM, codice: 'extra', piva: '09876543217', categorie: ['Carrelli elevatori'] };
  const con3 = (ritocco: Record<string, unknown>) => con((c) => c.venditori.push({ ...EXTRA, ...ritocco }));

  it('il terzo venditore intatto si legge (prova del banco)', () => {
    expect(leggiConfigMezzi(con3({}))?.venditori.map((x) => x.codice)).toEqual(['manc', 'nolsystem', 'extra']);
  });

  it('partita IVA di Manc scritta male: niente configurazione, le sue gru non passano a Nol System', () => {
    // Un'ultima cifra sbagliata: sarebbe bastato scartare Manc per far firmare le autogru a Nol System
    expect(pivaValida('05400750261')).toBe(false);
    expect(leggiConfigMezzi(con((c) => (c.venditori[0].piva = '05400750261')))).toBeNull();
  });

  it.each(['Manc', 'm', 'a'.repeat(31), 'no_sys', 'con spazio', ' extra', ''])('codice "%s" fuori da [a-z0-9-]{2,30}', (codice) => {
    expect(leggiConfigMezzi(con3({ codice }))).toBeNull();
  });

  it('codice doppio da null: due venditori non possono avere lo stesso codice', () => {
    expect(leggiConfigMezzi(con3({ codice: 'manc' }))).toBeNull();
    expect(leggiConfigMezzi(con3({ codice: 'nolsystem', categorie: [] }))).toBeNull();
  });

  it.each(['12345678901', '5400750260', 'abcdefghilm', '', 5400750260])('partita IVA %j che non passa pivaValida()', (piva) => {
    expect(leggiConfigMezzi(con3({ piva }))).toBeNull();
  });

  it('ragione sociale vuota o mancante', () => {
    expect(leggiConfigMezzi(con3({ ragioneSociale: '  ' }))).toBeNull();
    expect(leggiConfigMezzi(con3({ ragioneSociale: undefined }))).toBeNull();
  });

  it('recapito che non e\' una stringa (puo\' essere vuota, non di un altro tipo)', () => {
    for (const campo of ['indirizzo', 'telefono', 'email', 'pec']) {
      expect(leggiConfigMezzi(con3({ [campo]: 12 })), campo).toBeNull();
      expect(leggiConfigMezzi(con3({ [campo]: undefined })), campo).toBeNull();
    }
  });

  it('categorie del venditore che non e\' un elenco di testi', () => {
    expect(leggiConfigMezzi(con3({ categorie: 'Carrelli elevatori' }))).toBeNull();
    expect(leggiConfigMezzi(con3({ categorie: ['Carrelli elevatori', 3] }))).toBeNull();
  });

  it('un elemento che non e\' nemmeno un oggetto fa cadere la configurazione', () => {
    expect(leggiConfigMezzi(con((c) => c.venditori.push('manc' as never)))).toBeNull();
    expect(leggiConfigMezzi(con((c) => c.venditori.push(null as never)))).toBeNull();
  });

  it('vale anche per il venditore di default', () => {
    expect(leggiConfigMezzi(con((c) => (c.venditori[1].piva = '12345678901')))).toBeNull();
  });
});

describe('leggiConfigMezzi: coerenza fra venditori e categorie', () => {
  it('una categoria elencata da due venditori da null', () => {
    expect(leggiConfigMezzi(con((c) => (c.venditori[1].categorie = ['Autogru'])))).toBeNull();
    // stessa cosa con un terzo venditore che ripete le categorie di Manc
    expect(leggiConfigMezzi(con((c) => c.venditori.push({ ...MANC, codice: 'altro', piva: '09876543217' })))).toBeNull();
  });

  it('nessun venditore con categorie vuote da null: manca il venditore di tutto il resto', () => {
    expect(leggiConfigMezzi(con((c) => (c.venditori[1].categorie = ['Carrelli elevatori'])))).toBeNull();
    expect(leggiConfigMezzi(con((c) => c.venditori.pop()))).toBeNull();
  });

  it('due venditori con categorie vuote danno null: il default deve essere uno solo', () => {
    expect(leggiConfigMezzi(con((c) => c.venditori.push({ ...NOLSYSTEM, codice: 'altro', piva: '09876543217' })))).toBeNull();
  });

  it('una categoria di un venditore che non sta in categorie da null', () => {
    expect(leggiConfigMezzi(con((c) => c.venditori[0].categorie.push('Ponteggi')))).toBeNull();
  });
});

describe('leggiConfigMezzi: categorie', () => {
  const nomi = (v: unknown) => leggiConfigMezzi(v)?.categorie.map((c) => c.nome);

  it('targato che non e\' booleano o null scarta la categoria', () => {
    expect(nomi(con((c) => c.categorie.push({ nome: 'Ponteggi', targato: 'si' as unknown as boolean })))).toEqual([
      'Gru a torre', 'Autogru', 'Carrelli elevatori',
    ]);
  });

  it('targato assente vale null: la domanda si fa sempre', () => {
    const c = leggiConfigMezzi(con((x) => x.categorie.push({ nome: 'Ponteggi' } as never)))!;
    expect(c.categorie.at(-1)).toEqual({ nome: 'Ponteggi', targato: null });
  });

  it('nome vuoto o doppio scarta la categoria', () => {
    expect(nomi(con((c) => c.categorie.push({ nome: ' ', targato: null })))).toHaveLength(3);
    expect(nomi(con((c) => c.categorie.push({ nome: 'Autogru', targato: false })))).toHaveLength(3);
  });

  it('una categoria scartata che un venditore elenca fa cadere la configurazione', () => {
    expect(leggiConfigMezzi(con((c) => (c.categorie[0] = { nome: 'Gru a torre', targato: 'boh' as unknown as boolean })))).toBeNull();
  });
});

describe('leggiConfigMezzi: leasing', () => {
  it.each([31, -1, '10', Number.NaN, null, undefined])('anticipoPerc %j da null', (anticipoPerc) => {
    expect(leggiConfigMezzi(con((c) => (c.leasing.anticipoPerc = anticipoPerc as number)))).toBeNull();
  });

  const partner = (v: unknown) => leggiConfigMezzi(v)?.leasing.partner.map((p) => p.partner);

  it('un partner sconosciuto si scarta, gli altri restano', () => {
    const v = con((c) => c.leasing.partner.push({ partner: 'ifis' as 'sella', spreadFinoA48: 2.25, spreadDa60: 2.25 }));
    expect(partner(v)).toEqual(['sella', 'credem', 'alba']);
  });

  it('un partner doppio: resta il primo', () => {
    const v = con((c) => c.leasing.partner.push({ partner: 'sella', spreadFinoA48: 2.5, spreadDa60: 2.5 }));
    expect(partner(v)).toEqual(['sella', 'credem', 'alba']);
    expect(leggiConfigMezzi(v)!.leasing.partner[0]).toEqual({ partner: 'sella', spreadFinoA48: 2.25, spreadDa60: 2.25 });
  });

  it('spreadFinoA48 che non esiste fra le condizioni a 36 mesi scarta quel partner', () => {
    expect(partner(con((c) => (c.leasing.partner[2].spreadFinoA48 = 4.9)))).toEqual(['sella', 'credem']);
    // 2,50 esiste su Alba solo da 60 mesi, non nel listino fino a 48
    expect(partner(con((c) => (c.leasing.partner[2].spreadFinoA48 = 2.5)))).toEqual(['sella', 'credem']);
  });

  it('spreadDa60 che non esiste fra le condizioni a 60 mesi scarta quel partner', () => {
    expect(partner(con((c) => (c.leasing.partner[2].spreadDa60 = 4.9)))).toEqual(['sella', 'credem']);
    // 3,10 esiste su Alba solo fino a 48 mesi, non nel listino da 60
    expect(partner(con((c) => (c.leasing.partner[2].spreadDa60 = 3.1)))).toEqual(['sella', 'credem']);
    expect(partner(con((c) => (c.leasing.partner[0].spreadDa60 = 9)))).toEqual(['credem', 'alba']);
  });

  it('spread che non e\' un numero scarta il partner', () => {
    expect(partner(con((c) => (c.leasing.partner[1].spreadFinoA48 = '2.90' as unknown as number)))).toEqual(['sella', 'alba']);
    expect(partner(con((c) => delete (c.leasing.partner[1] as Record<string, unknown>).spreadDa60))).toEqual(['sella', 'alba']);
  });
});

describe('leggiConfigMezzi: A-Leasing sull\'usato', () => {
  const conA = (extra: Record<string, unknown> = {}) =>
    con((c) => (c.leasing.partner as unknown[]).push({ partner: 'aleasing', spreadFinoA48: 4, spreadDa60: 4, ...extra }));

  it('si legge con lo spread del suo listino, e soloUsato resta com\'e\' scritto', () => {
    expect(leggiConfigMezzi(conA({ soloUsato: true }))!.leasing.partner[3]).toEqual({ partner: 'aleasing', spreadFinoA48: 4, spreadDa60: 4, soloUsato: true });
    expect(leggiConfigMezzi(conA({ soloUsato: false }))!.leasing.partner[3]).toEqual({ partner: 'aleasing', spreadFinoA48: 4, spreadDa60: 4, soloUsato: false });
  });

  it('soloUsato assente o null non si scrive: il partner vale sempre', () => {
    for (const extra of [{}, { soloUsato: null }]) {
      expect(leggiConfigMezzi(conA(extra))!.leasing.partner[3]).toEqual({ partner: 'aleasing', spreadFinoA48: 4, spreadDa60: 4 });
    }
  });

  it.each(['si', 1, 'true'])('soloUsato %j non si legge: il partner si scarta, gli altri restano', (soloUsato) => {
    expect(leggiConfigMezzi(conA({ soloUsato }))!.leasing.partner.map((p) => p.partner)).toEqual(['sella', 'credem', 'alba']);
  });

  it('uno spread che A-Leasing non ha scarta il partner: lo spread non si inventa', () => {
    expect(leggiConfigMezzi(con((c) => (c.leasing.partner as unknown[]).push({ partner: 'aleasing', spreadFinoA48: 3.5, spreadDa60: 4 })))!
      .leasing.partner.map((p) => p.partner)).toEqual(['sella', 'credem', 'alba']);
  });
});

describe('leggiConfigMezzi: nomi dei partner', () => {
  it.each(['si', 1, null, undefined])('mostraNomiPartner %j da null', (mostra) => {
    expect(leggiConfigMezzi(con((c) => (c.mostraNomiPartner = mostra as unknown as boolean)))).toBeNull();
  });
});

describe('venditoreDiCategoria', () => {
  const cfg = leggiConfigMezzi(VALIDA)!;

  it('la categoria elencata va al suo venditore', () => {
    expect(venditoreDiCategoria(cfg, 'Autogru')?.codice).toBe('manc');
    expect(venditoreDiCategoria(cfg, 'Gru a torre')?.codice).toBe('manc');
  });

  it('tutto il resto va al venditore di default', () => {
    expect(venditoreDiCategoria(cfg, 'Carrelli elevatori')?.codice).toBe('nolsystem');
    expect(venditoreDiCategoria(cfg, 'Una categoria mai sentita')?.codice).toBe('nolsystem');
  });

  it('restituisce il venditore intero, con i recapiti', () => {
    expect(venditoreDiCategoria(cfg, 'Autogru')).toEqual(MANC);
  });

  it('senza nessun venditore di default (configurazione costruita a mano) da null per il resto', () => {
    const senza = { ...cfg, venditori: [cfg.venditori[0]] };
    expect(venditoreDiCategoria(senza, 'Carrelli elevatori')).toBeNull();
    expect(venditoreDiCategoria(senza, 'Autogru')?.codice).toBe('manc');
  });
});

describe('condizioneDaSpread', () => {
  it('trova la condizione del listino di quella durata con quello spread', () => {
    expect(condizioneDaSpread(ALBA, 36, 3.1)!.id).toBe(394804);
    expect(condizioneDaSpread(ALBA, 60, 2.5)!.id).toBe(394812);
    expect(condizioneDaSpread(SELLA, 60, 2.25)!.id).toBe(397300);
    expect(condizioneDaSpread(CREDEM, 36, 2.9)!.id).toBe(391663);
  });

  it('Alba cambia listino con la durata: 48 mesi come 36, 72 come 60', () => {
    expect(condizioneDaSpread(ALBA, 48, 3.1)!.id).toBe(394804);
    expect(condizioneDaSpread(ALBA, 72, 2.5)!.id).toBe(394812);
  });

  it('uno spread che quel listino non ha da null', () => {
    expect(condizioneDaSpread(ALBA, 36, 2.5)).toBeNull();
    expect(condizioneDaSpread(ALBA, 60, 3.1)).toBeNull();
    expect(condizioneDaSpread(SELLA, 36, 4.9)).toBeNull();
  });

  it('tollera l\'errore di virgola mobile ma non un decimo di punto', () => {
    expect(condizioneDaSpread(CREDEM, 36, 2.9 + 1e-9)!.id).toBe(391663);
    expect(condizioneDaSpread(CREDEM, 36, 2.95)).toBeNull();
  });
});
