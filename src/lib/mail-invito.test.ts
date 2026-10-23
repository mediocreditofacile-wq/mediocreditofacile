// Il testo dell'invito, famiglia per famiglia.
//
// Nessuna mail parte: il testo esce da testoInvito(), che e' pura, e dove si
// prova mailInvito() l'invio e le guide sono sostituiti da finti. Il database
// pure: la carrozzeria arriva da un finto carrozzeriaDaSlug.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const inviate: { to: string; subject: string; html: string; allegati?: { filename: string }[] }[] = [];
let tipiChiesti: string[] | undefined;
let carrozzeria: Record<string, unknown> | null = null;
let carrozzeriaRotta = false;

vi.mock('./mail-portale', async (originale) => ({
  ...(await originale<typeof import('./mail-portale')>()),
  inviaMail: async (o: (typeof inviate)[number]) => {
    inviate.push(o);
    return { ok: true, id: 'finto' };
  },
}));

vi.mock('./guide', () => ({
  allegatiGuide: async (tipi?: string[]) => {
    tipiChiesti = tipi;
    return (tipi ?? ['noleggio', 'portale-preventivi']).map((t) => ({ filename: `${t}.pdf`, content: 'eA==' }));
  },
}));

vi.mock('./motore/carrozzeria', () => ({
  carrozzeriaDaSlug: async () => {
    if (carrozzeriaRotta) throw new Error('ECONNRESET');
    return carrozzeria;
  },
}));

const { testoInvito, guideInvito, famigliaInvito, mailInvito } = await import('./mail-invito');
type Famiglia = Parameters<typeof testoInvito>[1];

const FOTOVOLTAICO: Famiglia = { tipo: 'preventivi-fotovoltaico' };
const PRATICHE: Famiglia = { tipo: 'pratiche' };
const FAS_ITALIA: Famiglia = { tipo: 'motore', settore: 'generico', leasing: true };
const DUPLEX: Famiglia = { tipo: 'motore', settore: 'macchine', leasing: false };
const BERGAMELLI: Famiglia = { tipo: 'motore', settore: 'mezzi', leasing: true };

const dati = (slug: string, ruolo = 'agente', organizzazione = 'Prova Srl') => ({
  invitationId: 'inv-123',
  organizzazione,
  slug,
  invitante: 'Alberto Amà',
  baseUrl: 'https://www.mediocreditofacile.it',
  ruolo,
});

/** Il testo che legge il destinatario, senza tag e spazi a capo */
const leggibile = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('testoInvito, fotovoltaico (Green-Go e motore fotovoltaico)', () => {
  it("all'agente parla di impianti e dei due prospetti", () => {
    const t = leggibile(testoInvito(dati('green-go'), FOTOVOLTAICO, true).html);
    expect(t).toContain('prepara i preventivi di noleggio operativo sugli impianti fotovoltaici');
    expect(t).toContain('i due prospetti in PDF');
    expect(t).toContain('In allegato due guide');
    expect(t).toContain('chiedi al tuo referente di rimandarlo');
  });

  it('al referente parla della sua rete, con gli accenti veri', () => {
    const t = leggibile(testoInvito(dati('green-go', 'referente'), FOTOVOLTAICO, true).html);
    expect(t).toContain('Da lì prepari i preventivi e apri gli accessi personali della tua rete');
    expect(t).toContain('è personale, non va condivisa');
    expect(t).toContain('rispondi a questa email');
  });

  it('porta entrambe le guide', () => {
    expect(guideInvito(FOTOVOLTAICO)).toEqual(['noleggio', 'portale-preventivi']);
  });
});

describe('testoInvito, portali pratiche (STILO)', () => {
  it('parla di canoni e pratiche, con la sola guida al noleggio', () => {
    const t = leggibile(testoInvito(dati('stilo'), PRATICHE, true).html);
    expect(t).toContain('simula i canoni di noleggio operativo e carica le pratiche');
    expect(t).toContain('carichi la pratica con i documenti del cliente');
    expect(t).toContain('In allegato la guida al noleggio operativo');
    expect(t).not.toMatch(/fotovoltaic/i);
    expect(guideInvito(PRATICHE)).toEqual(['noleggio']);
  });
});

describe('testoInvito, motore sugli altri settori', () => {
  it('Fas Italia: forniture, noleggio e leasing, niente impianti', () => {
    const t = leggibile(testoInvito(dati('fas-italia-orby1x', 'agente', 'Fas Italia'), FAS_ITALIA, true).html);
    expect(t).toContain(
      'Alberto Amà ti ha aperto un accesso al portale con cui Fas Italia prepara i preventivi di noleggio operativo e leasing sulle sue forniture.',
    );
    expect(t).toContain('Dalla partita IVA verifichi il cliente, scegli la fornitura e la durata');
    expect(t).toContain('Quando il cliente accetta, carichi la pratica con i suoi documenti');
    expect(t).toContain('In allegato la guida al noleggio operativo');
    expect(t).not.toMatch(/fotovoltaic|impiant|prospett|kWp/i);
  });

  it('Duplex: macchine, solo noleggio, la parola leasing non compare', () => {
    const { subject, html } = testoInvito(dati('duplex', 'agente', 'Duplex'), DUPLEX, true);
    const t = leggibile(html);
    expect(t).toContain(
      'Alberto Amà ti ha aperto un accesso al portale con cui Duplex prepara i preventivi di noleggio operativo sulle sue macchine.',
    );
    // Su Duplex il portale si apre sulle proposte: la verifica viene dopo, non prima
    expect(t).toContain('Scegli la macchina e la durata e scarichi il preventivo in PDF da consegnare, anche prima di verificare il cliente.');
    expect(t).toContain('Quando la trattativa si fa seria verifichi la partita IVA del cliente, e quando accetta carichi la pratica con i suoi documenti');
    expect(t).not.toContain('Dalla partita IVA verifichi il cliente');
    expect(t).not.toMatch(/leasing/i);
    expect(t).not.toMatch(/fotovoltaic|impiant|prospett|kWp/i);
    expect(subject).toBe('Il tuo accesso al portale Duplex — Mediocredito Facile');
  });

  it('al referente parla della rete, agli agenti del referente', () => {
    const referente = leggibile(testoInvito(dati('duplex', 'referente', 'Duplex'), DUPLEX, true).html);
    expect(referente).toContain(
      'Da lì prepari preventivi e pratiche, vedi quelli di tutta la tua rete e apri gli accessi personali dei tuoi agenti',
    );
    expect(referente).toContain('rispondi a questa email');
    expect(referente).not.toContain('chiedi al tuo referente');

    const agente = leggibile(testoInvito(dati('duplex', 'agente', 'Duplex'), DUPLEX, true).html);
    expect(agente).toContain('è personale e non va condivisa con altri agenti');
    expect(agente).toContain('se è scaduto chiedi al tuo referente di rimandarlo');
  });

  it('porta la sola guida al noleggio', () => {
    expect(guideInvito(FAS_ITALIA)).toEqual(['noleggio']);
    expect(guideInvito(DUPLEX)).toEqual(['noleggio']);
  });
});

describe('testoInvito, motore sul settore mezzi (Bergamelli)', () => {
  it('parla delle sue macchine, di noleggio operativo e di leasing', () => {
    const { subject, html } = testoInvito(dati('bergamelli', 'agente', 'Enrico Bergamelli'), BERGAMELLI, true);
    const t = leggibile(html);
    expect(t).toContain(
      'Alberto Amà ti ha aperto un accesso al portale con cui Enrico Bergamelli prepara i preventivi di noleggio operativo e leasing sulle sue macchine.',
    );
    expect(t).not.toMatch(/forniture|fotovoltaic|impiant|prospetti in PDF|kWp/i);
    expect(subject).toBe('Il tuo accesso al portale Enrico Bergamelli — Mediocredito Facile');
  });

  it("all'agente descrive il percorso vero: la verifica viene prima delle proposte", () => {
    const t = leggibile(testoInvito(dati('bergamelli', 'agente', 'Enrico Bergamelli'), BERGAMELLI, true).html);
    expect(t).toContain('Dalla partita IVA verifichi il cliente, descrivi i mezzi e scarichi il preventivo di noleggio');
    expect(t).toContain('il prospetto di leasing da consegnare');
    expect(t).toContain('Quando il cliente accetta, carichi la pratica con i suoi documenti');
    // Su Duplex il preventivo si scarica anche prima di verificare: sui mezzi no
    expect(t).not.toContain('anche prima di verificare il cliente');
  });

  it('il leasing segue la carrozzeria: spento, la parola non compare', () => {
    const senza: Famiglia = { tipo: 'motore', settore: 'mezzi', leasing: false };
    const t = leggibile(testoInvito(dati('bergamelli', 'agente', 'Enrico Bergamelli'), senza, true).html);
    expect(t).toContain('prepara i preventivi di noleggio operativo sulle sue macchine.');
    expect(t).not.toMatch(/leasing/i);
  });

  it('al referente parla della rete', () => {
    const t = leggibile(testoInvito(dati('bergamelli', 'referente', 'Enrico Bergamelli'), BERGAMELLI, true).html);
    expect(t).toContain('Da lì prepari preventivi e pratiche, vedi quelli di tutta la tua rete e apri gli accessi personali dei tuoi agenti');
    expect(t).toContain('rispondi a questa email');
  });

  it('porta la sola guida al noleggio', () => {
    expect(guideInvito(BERGAMELLI)).toEqual(['noleggio']);
  });
});

describe('testoInvito, regole comuni', () => {
  it("nessuna famiglia scrive l'accento con l'apostrofo", () => {
    for (const f of [FOTOVOLTAICO, PRATICHE, FAS_ITALIA, DUPLEX, BERGAMELLI]) {
      for (const ruolo of ['agente', 'referente']) {
        const t = leggibile(testoInvito(dati('x', ruolo), f, true).html);
        expect(t).not.toMatch(/\b(e|li|la|perche|cosi)'(\s|$)/);
      }
    }
  });

  it('il link porta al portale giusto', () => {
    expect(testoInvito(dati('green-go'), FOTOVOLTAICO, true).html)
      .toContain('https://www.mediocreditofacile.it/tools/green-go?invito=inv-123');
    expect(testoInvito(dati('duplex'), DUPLEX, true).html)
      .toContain('https://www.mediocreditofacile.it/portale/duplex?invito=inv-123');
  });

  it('senza allegati non promette guide', () => {
    for (const f of [FOTOVOLTAICO, PRATICHE, DUPLEX]) {
      expect(leggibile(testoInvito(dati('x'), f, false).html)).not.toContain('In allegato');
    }
  });

  it("i nomi che arrivano dal database non iniettano HTML", () => {
    const { html } = testoInvito(dati('x', 'agente', 'Fas <b>Italia</b>'), FAS_ITALIA, true);
    expect(html).toContain('Fas &lt;b&gt;Italia&lt;/b&gt;');
    expect(html).not.toContain('<b>Italia</b>');
  });
});

describe('famigliaInvito', () => {
  beforeEach(() => {
    carrozzeria = null;
    carrozzeriaRotta = false;
  });

  it('STILO e i portali pratiche non guardano la carrozzeria', async () => {
    carrozzeriaRotta = true;
    expect(await famigliaInvito('stilo')).toEqual(PRATICHE);
  });

  it('senza carrozzeria (Green-Go) e sul motore fotovoltaico resta il testo dei prospetti', async () => {
    expect(await famigliaInvito('green-go')).toEqual(FOTOVOLTAICO);
    carrozzeria = { settore: 'fotovoltaico', leasing: true };
    expect(await famigliaInvito('demo-fotovoltaico')).toEqual(FOTOVOLTAICO);
  });

  it('sugli altri settori legge settore e leasing', async () => {
    carrozzeria = { settore: 'generico', leasing: true };
    expect(await famigliaInvito('fas-italia-orby1x')).toEqual(FAS_ITALIA);
    carrozzeria = { settore: 'macchine', leasing: false };
    expect(await famigliaInvito('duplex')).toEqual(DUPLEX);
    carrozzeria = { settore: 'mezzi', leasing: true };
    expect(await famigliaInvito('bergamelli')).toEqual(BERGAMELLI);
  });

  it('una carrozzeria che non porta il campo leasing ha il leasing acceso', async () => {
    carrozzeria = { settore: 'generico' };
    expect(await famigliaInvito('fas-italia-orby1x')).toEqual(FAS_ITALIA);
  });
});

describe('mailInvito', () => {
  beforeEach(() => {
    inviate.length = 0;
    tipiChiesti = undefined;
    carrozzeria = null;
    carrozzeriaRotta = false;
  });

  const opts = (slug: string, organizzazione: string) => ({
    a: 'agente@example.invalid',
    invitationId: 'inv-9',
    organizzazione,
    slug,
    invitante: 'Alberto Amà',
    baseUrl: 'https://www.mediocreditofacile.it',
    ruolo: 'agente',
  });

  it('a Duplex manda il testo delle macchine con la sola guida al noleggio', async () => {
    carrozzeria = { settore: 'macchine', leasing: false };
    const esito = await mailInvito(opts('duplex', 'Duplex'));
    expect(esito.ok).toBe(true);
    expect(tipiChiesti).toEqual(['noleggio']);
    expect(inviate).toHaveLength(1);
    expect(inviate[0].to).toBe('agente@example.invalid');
    expect(inviate[0].allegati?.map((a) => a.filename)).toEqual(['noleggio.pdf']);
    expect(leggibile(inviate[0].html)).toContain('sulle sue macchine');
  });

  it('a Bergamelli manda il testo delle macchine e del leasing con la sola guida al noleggio', async () => {
    carrozzeria = { settore: 'mezzi', leasing: true };
    const esito = await mailInvito(opts('bergamelli', 'Enrico Bergamelli'));
    expect(esito.ok).toBe(true);
    expect(tipiChiesti).toEqual(['noleggio']);
    expect(inviate[0].allegati?.map((a) => a.filename)).toEqual(['noleggio.pdf']);
    const t = leggibile(inviate[0].html);
    expect(t).toContain('sulle sue macchine');
    expect(t).toContain('noleggio operativo e leasing');
  });

  it('a Green-Go manda le due guide', async () => {
    await mailInvito(opts('green-go', 'Green-Go'));
    expect(tipiChiesti).toEqual(['noleggio', 'portale-preventivi']);
    expect(inviate[0].allegati).toHaveLength(2);
  });

  it('se il database non risponde non manda niente e si riprova', async () => {
    carrozzeriaRotta = true;
    const esito = await mailInvito(opts('duplex', 'Duplex'));
    expect(esito.ok).toBe(false);
    expect(esito.ritentabile).toBe(true);
    expect(inviate).toHaveLength(0);
  });
});
