// La configurazione di Enrico Bergamelli che il seed scrive sul database. Quello che si
// controlla qui e' che niente vada perso alla lettura (i lettori scartano in silenzio un
// elemento scritto male, o danno null a tutta la configurazione), che i codici dei venditori
// nei canali esistano davvero nella configurazione dei mezzi (il Pannello non lo controlla:
// vedi CLAUDE.md, sezione di /portale/bergamelli) e che le costanti instradino come dice la spec.

import { describe, expect, it } from 'vitest';
import { TABELLE } from '../tabelle-canoni';
import { pivaValida } from '../piva';
import { leggiCanali } from './config-distinta';
import { leggiConfigMezzi, venditoreDiCategoria } from './config-mezzi';
import { instrada, type BeneInstradamento, type ClienteInstradamento } from './instradamento';
import { controllaCanali, controllaMezzi } from './pannello-mcf';
import { CANALI_BERGAMELLI, CARROZZERIA_BERGAMELLI, CONFIG_MEZZI_BERGAMELLI } from './catalogo-bergamelli';

/** Come arriva dal database: una copia che passa da JSON */
const dalDatabase = <T>(v: T): unknown => JSON.parse(JSON.stringify(v));

const manc = CONFIG_MEZZI_BERGAMELLI.venditori.find((v) => v.codice === 'manc')!;
const nolsystem = CONFIG_MEZZI_BERGAMELLI.venditori.find((v) => v.codice === 'nolsystem')!;

describe('configurazione dei mezzi di Bergamelli', () => {
  it('si rilegge identica, senza che il lettore scarti niente', () => {
    expect(leggiConfigMezzi(dalDatabase(CONFIG_MEZZI_BERGAMELLI))).toEqual(CONFIG_MEZZI_BERGAMELLI);
  });

  it('il Pannello MCF la accetta com\'e\'', () => {
    expect(controllaMezzi(dalDatabase(CONFIG_MEZZI_BERGAMELLI))).toEqual({ ok: true, valore: CONFIG_MEZZI_BERGAMELLI });
  });

  it('due venditori: Manc con gru e autogru, Nol System con tutto il resto', () => {
    expect(CONFIG_MEZZI_BERGAMELLI.venditori.map((v) => v.codice)).toEqual(['manc', 'nolsystem']);
    expect(manc).toEqual({
      codice: 'manc',
      ragioneSociale: 'MANC SRL',
      piva: '03863700989',
      indirizzo: "Via dell'Industria 81, 25039 Travagliato (BS)",
      telefono: '',
      email: '',
      pec: 'mancsrl@legalmail.it',
      categorie: ['Gru a torre', 'Autogru'],
    });
    expect(nolsystem).toEqual({
      codice: 'nolsystem',
      ragioneSociale: 'NOL SYSTEM ITALIA SRL',
      piva: '05400750260',
      indirizzo: 'Via Solferino San Martino 3, 31100 Treviso (TV)',
      telefono: '+39 039 64210655',
      email: 'info@nolsystem.com',
      pec: 'nolsystemitalia@pec.it',
      categorie: [],
    });
  });

  it('le due partite IVA hanno la cifra di controllo giusta', () => {
    expect(pivaValida(manc.piva)).toBe(true);
    expect(pivaValida(nolsystem.piva)).toBe(true);
  });

  it('la ragione sociale di Manc e\' quella vera, non il segnaposto', () => {
    expect(manc.ragioneSociale).not.toBe('MANC');
    expect(manc.indirizzo).not.toBe('');
  });

  it('otto categorie, con la domanda sul targato dove la risposta e\' ovvia', () => {
    expect(CONFIG_MEZZI_BERGAMELLI.categorie).toEqual([
      { nome: 'Gru a torre', targato: false },
      { nome: 'Autogru', targato: true },
      { nome: 'Movimento terra', targato: null },
      { nome: 'Piattaforme aeree', targato: null },
      { nome: 'Carrelli elevatori', targato: false },
      { nome: 'Autocarri', targato: true },
      { nome: 'Ponteggi', targato: false },
      { nome: 'Attrezzature', targato: false },
    ]);
  });

  it('movimento terra e piattaforme aeree non hanno un default: la domanda si fa sempre', () => {
    for (const nome of ['Movimento terra', 'Piattaforme aeree']) {
      expect(CONFIG_MEZZI_BERGAMELLI.categorie.find((c) => c.nome === nome)!.targato, nome).toBeNull();
    }
  });

  it('ogni categoria dei venditori esiste fra le categorie', () => {
    const nomi = CONFIG_MEZZI_BERGAMELLI.categorie.map((c) => c.nome);
    for (const v of CONFIG_MEZZI_BERGAMELLI.venditori) {
      for (const categoria of v.categorie) expect(nomi, `${v.codice}: ${categoria}`).toContain(categoria);
    }
  });

  it('gru e autogru vanno a Manc, ogni altra categoria a Nol System', () => {
    for (const { nome } of CONFIG_MEZZI_BERGAMELLI.categorie) {
      const atteso = nome === 'Gru a torre' || nome === 'Autogru' ? 'manc' : 'nolsystem';
      expect(venditoreDiCategoria(CONFIG_MEZZI_BERGAMELLI, nome)?.codice, nome).toBe(atteso);
    }
  });

  it('leasing: anticipo 10, Sella e Credem piatti, Alba cambia a 60 mesi, A-Leasing in fondo e solo sull\'usato', () => {
    expect(CONFIG_MEZZI_BERGAMELLI.leasing).toEqual({
      anticipoPerc: 10,
      partner: [
        { partner: 'sella', spreadFinoA48: 2.25, spreadDa60: 2.25 },
        { partner: 'credem', spreadFinoA48: 2.9, spreadDa60: 2.9 },
        { partner: 'alba', spreadFinoA48: 3.1, spreadDa60: 2.5 },
        { partner: 'aleasing', spreadFinoA48: 4, spreadDa60: 4, soloUsato: true },
      ],
    });
  });

  it('i nomi dei partner si vedono a schermo', () => {
    expect(CONFIG_MEZZI_BERGAMELLI.mostraNomiPartner).toBe(true);
  });
});

describe('canali di Bergamelli', () => {
  const econocom = CANALI_BERGAMELLI.find((c) => c.canale === 'econocom')!;
  const grenke = CANALI_BERGAMELLI.find((c) => c.canale === 'grenke')!;

  it('si rileggono interi: nessun canale scartato per una condizione scritta male', () => {
    expect(leggiCanali(dalDatabase(CANALI_BERGAMELLI))).toEqual(CANALI_BERGAMELLI);
    expect(CANALI_BERGAMELLI).toHaveLength(2);
  });

  it('il Pannello MCF li accetta, con i listini che esistono davvero', () => {
    const esiste = (id: string) => id in TABELLE;
    expect(controllaCanali(dalDatabase(CANALI_BERGAMELLI), esiste)).toEqual({ ok: true, valore: CANALI_BERGAMELLI });
  });

  it('Econocom viene prima di Grenke', () => {
    expect(CANALI_BERGAMELLI.map((c) => c.canale)).toEqual(['econocom', 'grenke']);
  });

  it('Econocom: solo Nol System, clienti oltre 5 milioni di fatturato, beni da 150.000, niente targati, nessuna maggiorazione', () => {
    expect(econocom).toEqual({
      canale: 'econocom',
      attivo: true,
      tabella: 'econocom-pa',
      maggiorazionePerc: 0,
      fatturatoMin: 5_000_000,
      importoMin: 150_000,
      venditori: ['nolsystem'],
      escludiTargati: true,
      escludiUsati: true,
    });
  });

  it('nessun canale quota i mezzi targati: il noleggio lo valuta MCF su richiesta', () => {
    for (const canale of CANALI_BERGAMELLI) expect(canale.escludiTargati, canale.canale).toBe(true);
  });

  it('nessun canale quota i mezzi usati: il noleggio dell\'usato lo valuta MCF su richiesta (23/10/2026)', () => {
    for (const canale of CANALI_BERGAMELLI) expect(canale.escludiUsati, canale.canale).toBe(true);
  });

  it('Grenke: solo Manc, niente mezzi targati, niente Ponteggi', () => {
    expect(grenke).toEqual({
      canale: 'grenke',
      attivo: true,
      tabella: 'sputnik',
      maggiorazionePerc: 0,
      venditori: ['manc'],
      categorieEscluse: ['Ponteggi'],
      escludiTargati: true,
      escludiUsati: true,
    });
    expect(grenke.categorieEscluse).toContain('Ponteggi');
  });

  it('ogni venditore e ogni categoria nominati dai canali esistono nella configurazione', () => {
    const codici = CONFIG_MEZZI_BERGAMELLI.venditori.map((v) => v.codice);
    const categorie = CONFIG_MEZZI_BERGAMELLI.categorie.map((c) => c.nome);
    for (const canale of CANALI_BERGAMELLI) {
      for (const v of canale.venditori ?? []) expect(codici, `${canale.canale}: ${v}`).toContain(v);
      for (const c of canale.categorieEscluse ?? []) expect(categorie, `${canale.canale}: ${c}`).toContain(c);
    }
  });

  describe('instradano come dice la spec', () => {
    const OGGI = new Date(2026, 9, 23);
    const piccolo: ClienteInstradamento = {
      formaCodice: 'SR', inizioAttivita: '2015-03-10', fatturato: 800_000, atecoCodice: '412000',
    };
    const grande: ClienteInstradamento = { ...piccolo, fatturato: 6_000_000 };
    const bene = (venditore: string, categorie: string[], targato: boolean, usato = false): BeneInstradamento => ({ venditore, categorie, targato, usato });

    it('una gru a torre non targata di Manc va su Grenke', () => {
      const r = instrada(CANALI_BERGAMELLI, piccolo, 50_000, OGGI, bene('manc', ['Gru a torre'], false));
      expect(r?.canale).toBe('grenke');
    });

    it('un\'autogru targata di Manc non ha noleggio', () => {
      expect(instrada(CANALI_BERGAMELLI, piccolo, 50_000, OGGI, bene('manc', ['Autogru'], true))).toBeNull();
      expect(instrada(CANALI_BERGAMELLI, grande, 200_000, OGGI, bene('manc', ['Autogru'], true))).toBeNull();
    });

    it('un bene di Nol System non va mai su Grenke, nemmeno se non targato', () => {
      expect(instrada(CANALI_BERGAMELLI, piccolo, 50_000, OGGI, bene('nolsystem', ['Carrelli elevatori'], false))).toBeNull();
    });

    it('Nol System va su Econocom solo con cliente oltre 5 milioni e beni da 150.000', () => {
      const b = bene('nolsystem', ['Movimento terra'], false);
      expect(instrada(CANALI_BERGAMELLI, grande, 200_000, OGGI, b)?.canale).toBe('econocom');
      expect(instrada(CANALI_BERGAMELLI, grande, 140_000, OGGI, b)).toBeNull();
      expect(instrada(CANALI_BERGAMELLI, piccolo, 200_000, OGGI, b)).toBeNull();
    });

    it('un autocarro targato di Nol System non ha noleggio, nemmeno con cliente da 6 milioni e 200.000 di beni', () => {
      expect(instrada(CANALI_BERGAMELLI, grande, 200_000, OGGI, bene('nolsystem', ['Autocarri'], true))).toBeNull();
    });

    it('lo stesso autocarro non targato va su Econocom, a 36, 48 e 60 mesi', () => {
      const r = instrada(CANALI_BERGAMELLI, grande, 200_000, OGGI, bene('nolsystem', ['Autocarri'], false));
      expect(r?.canale).toBe('econocom');
      expect(r?.rate.map((x) => x.durata)).toEqual([36, 48, 60]);
    });

    it('i ponteggi di Nol System non hanno noleggio sotto i 150.000, e Grenke non li prende mai', () => {
      expect(instrada(CANALI_BERGAMELLI, piccolo, 30_000, OGGI, bene('nolsystem', ['Ponteggi'], false))).toBeNull();
    });

    it('la stessa gru di Manc usata non ha noleggio, ne\' il carrello usato di Nol System con cliente da 6 milioni', () => {
      expect(instrada(CANALI_BERGAMELLI, piccolo, 50_000, OGGI, bene('manc', ['Gru a torre'], false, true))).toBeNull();
      expect(instrada(CANALI_BERGAMELLI, grande, 200_000, OGGI, bene('nolsystem', ['Carrelli elevatori'], false, true))).toBeNull();
    });

    it('i ponteggi non vanno su Grenke nemmeno se Enrico li assegna a Manc', () => {
      expect(instrada(CANALI_BERGAMELLI, piccolo, 30_000, OGGI, bene('manc', ['Ponteggi'], false))).toBeNull();
      // Con una gru nella stessa offerta Grenke non quota comunque: la categoria esclusa tiene fuori tutta la distinta
      expect(instrada(CANALI_BERGAMELLI, piccolo, 80_000, OGGI, bene('manc', ['Gru a torre', 'Ponteggi'], false))).toBeNull();
    });

    it('senza il bene nessun canale regge: le condizioni sul bene non si saltano', () => {
      expect(instrada(CANALI_BERGAMELLI, grande, 200_000, OGGI, null)).toBeNull();
    });
  });
});

describe('carrozzeria di Bergamelli', () => {
  const c = CARROZZERIA_BERGAMELLI;

  it('i valori decisi, uno per uno', () => {
    expect(c).toEqual({
      slug: 'bergamelli',
      nome: 'Enrico Bergamelli · Manc e Nol System',
      citta: null,
      prefisso: 'EB',
      tabellaCanoni: 'sputnik',
      brand: { colore: null, accento: null },
      settore: 'mezzi',
      etichettaBene: 'Mezzo',
      partnerLeasing: 'alba',
      sogliaLeasing: 0,
      tettoMeseEuro: 30,
      demo: false,
      documentiExtra: ['Offerta del venditore'],
      tabellaAlternativa: null,
      regoleSemaforo: 'locatore',
      leasing: true,
      prezzoVerifica: null,
    });
  });

  it('il listino del fornitore esiste', () => {
    expect(TABELLE).toHaveProperty(c.tabellaCanoni);
  });
});
