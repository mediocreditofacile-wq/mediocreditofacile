// Il preventivo del settore macchine: stesso contenuto di /tools/duplex, numeri
// dello schermo, nessun nome della societa' di locazione, nessun semaforo.

import { describe, expect, it } from 'vitest';
import { TABELLA_GRACE_DUPLEX, TABELLA_SPUTNIK_DUPLEX } from '../tabelle-canoni';
import type { CalcoloProposta, RicercaSalvata } from './calcolo-proposta';
import { clienteDellaProposta } from './cliente-proposta';
import type { Carrozzeria, VoceCatalogo } from './carrozzeria';
import { vociDuplex } from './catalogo-duplex';
import { contenutoMacchine, documentiMacchine } from './pdf-macchine';
import { calcolaMacchine, validaConfigurazione } from './proposte-macchine';

const VOCI: VoceCatalogo[] = vociDuplex().map((v, i) => ({ id: i + 1, ...v, attivo: true }));
const OGGI = new Date(2026, 9, 15, 10);
const AGENTE = { nome: 'Mario Rossi', email: 'mario@example.invalid' };
const K: Carrozzeria = {
  slug: 'duplex', nome: 'Duplex', citta: 'Signa', prefisso: 'DX', organizationId: 'org',
  tabellaCanoni: 'sputnik-duplex', brand: { logo: null, colore: '#1B3A57', accento: '#E66A2C' },
  settore: 'macchine', etichettaBene: 'Macchina per la pulizia', partnerLeasing: 'alba', sogliaLeasing: 0,
  tettoMeseEuro: 100, demo: false, documentiExtra: [], attivo: true,
  tabellaAlternativa: 'grace-duplex', regoleSemaforo: 'locatore', leasing: false,
};

function calcolo(
  codice: string,
  prezzo: number,
  accessori: Record<string, number> = {},
  senzaVerifica?: { intestatario: string },
): CalcoloProposta {
  const r = validaConfigurazione(VOCI, { codice, accessori });
  if (!r.ok) throw new Error(r.error);
  const macchine = calcolaMacchine(r.conf, prezzo, 60, new Date(2026, 9, 15), TABELLA_SPUTNIK_DUPLEX, TABELLA_GRACE_DUPLEX);
  const ricerca = senzaVerifica ? null : ({
    id: 'r1', piva: '01234567890', ragione_sociale: 'Pulizie Prova S.r.l.', eventi: null,
    dati_credito: {
      dati: {},
      scheda: { piva: '01234567890', ragioneSociale: 'Pulizie Prova S.r.l.', formaGiuridica: "SOCIETA' A RESPONSABILITA' LIMITATA", sede: 'Via Roma 1, Prato (PO)' },
    },
  } as unknown as RicercaSalvata);
  return {
    ricerca,
    cliente: clienteDellaProposta(ricerca, senzaVerifica?.intestatario),
    voce: r.conf.macchina, prezzo, esito: {}, bp: null, inputBp: {}, descrizione: r.conf.descrizione, macchine,
  } as unknown as CalcoloProposta;
}

describe('preventivo macchine', () => {
  const d = contenutoMacchine(calcolo('ULTRAX-45', 3500, { 'UX-MICROFIBRA': 0 }), K, 'DX-20261015-100000', AGENTE, OGGI);
  const testo = JSON.stringify(d);

  it('marchio e riferimento del fornitore', () => {
    expect(d.marchio).toBe('fornitore');
    expect(d.titolo).toBe('Duplex');
    expect(d.filename).toBe('preventivo-noleggio-DX-20261015-100000.pdf');
    expect(d.riferimento).toContain('DX-20261015-100000');
  });
  it('cliente, fornitura e agente', () => {
    expect(testo).toContain('Pulizie Prova S.r.l.');
    expect(testo).toContain('01234567890');
    expect(testo).toContain('Ultrax 45');
    expect(testo).toContain('Mario Rossi');
  });
  it('le due colonne con canoni e date', () => {
    expect(testo).toContain('Due modi di partire');
    expect(testo).toContain('81,00 euro al mese');
    expect(testo).toContain('80,05 euro al mese');
    expect(testo).toContain('1° gennaio 2027');
    expect(testo).toContain('1° aprile 2027');
  });
  it('tutte le voci e il totale', () => {
    for (const v of ['Anticipo', 'Pro rata alla consegna', 'Spese di istruttoria', 'Canoni, 60 mesi', 'Polizza all risk', 'Riscatto a fine contratto', 'Totale in 60 mesi']) {
      expect(testo).toContain(v);
    }
    expect(testo).toContain('5.040,00 euro');
    expect(testo).toContain("124,25 euro all'anno");
  });
  it('la quota minima della polizza si dice solo quando si applica', () => {
    expect(testo).not.toContain('quota minima');
    const d340 = JSON.stringify(contenutoMacchine(calcolo('DUPLEX-340-CAVO', 1931), K, 'DX-1', AGENTE, OGGI));
    expect(d340).toContain('la quota minima fatturabile è 115 euro');
  });
  it('accenti veri, non apostrofi', () => {
    expect(testo).not.toMatch(/[aeiou]'/i);
  });
  it('niente locatore, coefficienti o semaforo', () => {
    expect(testo).not.toMatch(/grenke|reterent|coeffic|sputnik|semaforo|verde|giallo/i);
  });
  it('il PDF esce', () => {
    const [pdf] = documentiMacchine(calcolo('ULTRAX-45', 3500), K, 'DX-1', AGENTE, OGGI);
    expect(pdf.contenuto.startsWith('JVBER')).toBe(true);
  });
  it('sta in una pagina, come il preventivo di /tools/duplex', () => {
    const [pdf] = documentiMacchine(calcolo('ULTRAX-45', 3738, { 'UX-MICROFIBRA': 2 }), K, 'DX-1', AGENTE, OGGI);
    const testoPdf = Buffer.from(pdf.contenuto, 'base64').toString('latin1');
    expect(testoPdf.match(/\/Type \/Page\b/g)).toHaveLength(1);
  });
});

describe('preventivo prima della verifica', () => {
  it('col nome scritto a mano: il nome, niente partita IVA', () => {
    const t = JSON.stringify(contenutoMacchine(calcolo('ULTRAX-45', 3500, {}, { intestatario: 'Bar Centrale' }), K, 'DX-1', AGENTE, OGGI));
    expect(t).toContain('Bar Centrale');
    expect(t).not.toContain('Partita IVA');
    expect(t).not.toContain('Ragione sociale');
    expect(t).toContain('Mario Rossi');
    expect(t).toContain('81,00 euro al mese');
  });
  it('sopra 10.000 euro, senza forma giuridica: le due strade per la reddituale', () => {
    const t = JSON.stringify(contenutoMacchine(calcolo('ULTRAX-45', 12000, {}, { intestatario: 'Bar Centrale' }), K, 'DX-3', AGENTE, OGGI));
    expect(t).toContain('bilanci depositati per le società');
    expect(t).toContain('dichiarazioni dei redditi per le ditte individuali');
  });
  it('senza nome: nessuna riga del cliente, resta chi lo ha preparato', () => {
    const d = contenutoMacchine(calcolo('ULTRAX-45', 3500, {}, { intestatario: '' }), K, 'DX-2', AGENTE, OGGI);
    const t = JSON.stringify(d);
    expect(t).not.toContain('Cliente');
    expect(t).toContain('Preparato da');
  });
});
