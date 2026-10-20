// Il catalogo iniziale e la configurazione di Led Office (Emme 2 Servizi) che il seed
// scrive sul database. Quello che si controlla qui e' che niente vada perso alla
// lettura: i lettori di config-distinta.ts scartano in silenzio un elemento scritto
// male, e una voce della checklist scartata sarebbe un documento che nessuno chiede.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { leggiVoce } from './catalogo-import';
import {
  CANALI_LO,
  CATEGORIE_LO,
  CHECKLIST_LO,
  SOCIETA_EMME2,
  VALIDO_FINO_LO,
  vociLedOffice,
} from './catalogo-ledoffice';
import { leggiCanali, leggiCategorie, leggiChecklist, leggiSocieta, vociChecklist } from './config-distinta';

const voci = vociLedOffice();
const prezzoDi = (pezzo: RegExp) => voci.filter((v) => pezzo.test(v.nome)).map((v) => v.prezzo);
const categoriaDi = (pezzo: RegExp) => voci.filter((v) => pezzo.test(v.nome)).map((v) => v.attributi.categoria);

describe('catalogo Led Office', () => {
  it('ha delle voci', () => {
    expect(voci.length).toBeGreaterThan(20);
  });

  it('ogni voce passa la validazione dell\'import senza perdere codice, nome o prezzo', () => {
    for (const v of voci) {
      const letta = leggiVoce({ codice: v.codice, nome: v.nome, prezzo: v.prezzo, descrizione: v.descrizione });
      expect(letta, v.codice).not.toBeNull();
      expect(letta, v.codice).toMatchObject({ codice: v.codice, nome: v.nome, prezzo: v.prezzo });
    }
  });

  it('codici unici, nella forma LO-<CATEGORIA>-<MODELLO>', () => {
    const codici = voci.map((v) => v.codice);
    expect(new Set(codici).size).toBe(codici.length);
    for (const c of codici) expect(c).toMatch(/^LO-[A-Z]+-[A-Z0-9]+(-[A-Z0-9]+)*$/);
  });

  it('ogni voce ha una categoria che esiste e scade il 31/12/2026', () => {
    const nomi = CATEGORIE_LO.map((c) => c.nome);
    for (const v of voci) {
      expect(nomi, v.codice).toContain(v.attributi.categoria);
      expect(v.attributi.valido_fino, v.codice).toBe('2026-12-31');
    }
    expect(VALIDO_FINO_LO).toBe('2026-12-31');
  });

  it('nessuna riga servizi e nessun LEDwall: il LEDwall si fa fuori listino, a progetto', () => {
    for (const v of voci) {
      expect(v.nome, v.codice).not.toMatch(/SERVIZI|TRASPORTO|INSTALLAZIONE|CONFIGURAZIONE/i);
      expect(v.attributi.categoria, v.codice).not.toBe('LEDwall');
      expect(v.nome, v.codice).not.toMatch(/LED ?WALL/i);
    }
  });

  it('i prezzi del brief ci sono', () => {
    expect(prezzoDi(/GALAXY TAB S10 FE/)).toEqual([560]);
    expect(prezzoDi(/SERVER DELL/)).toEqual([14_000]);
    expect(prezzoDi(/THE WALL/)).toEqual([14_600]);
    // La Ricoh ha due voci: base e con il kit accessori completo
    expect(prezzoDi(/RICOH IM C6010/).sort((a, b) => a - b)).toEqual([6_200, 14_900]);
    expect(prezzoDi(/RICOH IM C6010$/)).toEqual([6_200]);
    expect(prezzoDi(/RICOH IM C6010 .*KIT/)).toEqual([14_900]);
  });

  it('un solo prezzo per bene: dove le proposte divergono vale la piu\' recente', () => {
    // Server HP: 6.200 a giugno, 6.600 a luglio, 6.300 a ottobre
    expect(prezzoDi(/SERVER HP/)).toEqual([6_300]);
    // MSI Vision XAI: 6.000 a giugno, 5.000 nella proposta del 28/07
    expect(prezzoDi(/VISION XAI/)).toEqual([5_000]);
    // All-in-one i5 256 GB: 1.105,69 il 09/07, 951,23 il 28/07
    expect(prezzoDi(/ALL IN ONE MSI I5/)).toEqual([951.23]);
  });

  it('workstation con scheda RTX e MacBook Pro Max fra le Workstation grafiche', () => {
    const rtx = categoriaDi(/RTX/);
    expect(rtx.length).toBeGreaterThanOrEqual(3);
    for (const c of rtx) expect(c).toBe('Workstation grafiche');
    expect(categoriaDi(/MACBOOK PRO .*MAX/)).toEqual(['Workstation grafiche']);
    // Il MacBook Air resta una postazione normale
    expect(categoriaDi(/MACBOOK AIR/)).toEqual(['Postazioni di lavoro']);
  });

  it('nel file non c\'e\' nessuna partita IVA oltre a quella di Emme 2', () => {
    const sorgente = readFileSync(new URL('./catalogo-ledoffice.ts', import.meta.url), 'utf8');
    const undici = (sorgente.match(/\d{11}/g) ?? []).filter((p) => p !== SOCIETA_EMME2.piva);
    expect(undici).toEqual([]);
  });
});

describe('configurazione Led Office', () => {
  it('canali: Econocom, Grenke spento, Pagarent col 5%, in questo ordine', () => {
    expect(CANALI_LO.map((c) => c.canale)).toEqual(['econocom', 'grenke', 'pagarent']);
    expect(CANALI_LO.find((c) => c.canale === 'grenke')).toMatchObject({ attivo: false, tabella: 'pioneer', maggiorazionePerc: 0 });
    expect(CANALI_LO.find((c) => c.canale === 'pagarent')).toMatchObject({ attivo: true, tabella: 'pagarent', maggiorazionePerc: 5 });
    expect(CANALI_LO.find((c) => c.canale === 'econocom')).toMatchObject({
      attivo: true, tabella: 'econocom-pa', maggiorazionePerc: 0, fatturatoMin: 5_000_000, importoMin: 150_000,
    });
  });

  it('i canali si rileggono interi', () => {
    expect(leggiCanali(JSON.parse(JSON.stringify(CANALI_LO)))).toEqual(CANALI_LO);
  });

  it('checklist: nove voci, solo PDF e JPG, si rilegge intera', () => {
    expect(CHECKLIST_LO.voci).toHaveLength(9);
    expect(CHECKLIST_LO.formati).toEqual(['pdf', 'jpg']);
    expect(leggiChecklist(JSON.parse(JSON.stringify(CHECKLIST_LO)))).toEqual(CHECKLIST_LO);
  });

  it('obbligatorie solo la proposta firmata e il documento d\'identita\'', () => {
    expect(CHECKLIST_LO.voci.filter((v) => v.obbligatoria).map((v) => v.nome)).toEqual([
      'Proposta di vendita firmata e timbrata dal cliente',
      "Documento d'identità e tessera sanitaria del legale rappresentante, fronte e retro in un unico PDF",
    ]);
  });

  it('sopra 50.000 euro di beni si chiede la situazione contabile, sotto no', () => {
    const nomi = (classe: 'capitali' | 'persone' | 'individuale', beni: number) =>
      vociChecklist(CHECKLIST_LO, classe, beni).map((v) => v.nome);
    expect(nomi('capitali', 80_000)).toContain("Situazione contabile dell'anno (bilancio provvisorio)");
    expect(nomi('capitali', 50_000)).not.toContain("Situazione contabile dell'anno (bilancio provvisorio)");
  });

  it('bilanci alle societa\' di capitali, dichiarazioni a ditte e societa\' di persone', () => {
    const nomi = (classe: 'capitali' | 'persone' | 'individuale') =>
      vociChecklist(CHECKLIST_LO, classe, 10_000).map((v) => v.nome);
    expect(nomi('capitali')).toContain('Ultimi due bilanci depositati con ricevuta di deposito');
    expect(nomi('capitali')).not.toContain('Ultime due dichiarazioni dei redditi');
    for (const c of ['persone', 'individuale'] as const) {
      expect(nomi(c)).toContain('Ultime due dichiarazioni dei redditi');
      expect(nomi(c)).not.toContain('Ultimi due bilanci depositati con ricevuta di deposito');
    }
  });

  it('categorie nell\'ordine della spec, con i flag, e si rileggono intere', () => {
    expect(CATEGORIE_LO.map((c) => c.nome)).toEqual([
      'Postazioni di lavoro',
      'Workstation grafiche',
      'Periferiche e tablet',
      'Server e stampa',
      'Digital signage e display',
      'LEDwall',
    ]);
    expect(CATEGORIE_LO.filter((c) => c.postazione).map((c) => c.nome)).toEqual(['Postazioni di lavoro', 'Workstation grafiche']);
    expect(CATEGORIE_LO.filter((c) => c.ledwall).map((c) => c.nome)).toEqual(['LEDwall']);
    const signage = CATEGORIE_LO.find((c) => c.nome === 'Digital signage e display')!;
    expect(CATEGORIE_LO.find((c) => c.nome === 'LEDwall')!.settoriTipici).toEqual(signage.settoriTipici);
    expect(CATEGORIE_LO.find((c) => c.nome === 'Workstation grafiche')!.settoriTipici).toEqual(['58', '59', '60', '62', '71', '72', '73', '74', '90']);
    expect(leggiCategorie(JSON.parse(JSON.stringify(CATEGORIE_LO)))).toEqual(CATEGORIE_LO);
  });

  it('societa\' fornitrice: Emme 2 Servizi, si rilegge col logo', () => {
    const conLogo = { ...SOCIETA_EMME2, logo: 'brand/emme2-servizi.jpg' };
    expect(leggiSocieta(JSON.parse(JSON.stringify(conLogo)))).toEqual(conLogo);
    expect(SOCIETA_EMME2).toEqual({
      ragioneSociale: 'EMME 2 SERVIZI S.R.L.',
      piva: '07000311212',
      rea: 'CE-274424',
      indirizzo: 'Via Nazionale Appia 17 - 81028 Santa Maria a Vico (CE)',
      telefono: '0823 80 91 64',
      email: 'info@emme2servizi.it',
      pec: 'emme2gas@pec.it',
    });
  });
});
