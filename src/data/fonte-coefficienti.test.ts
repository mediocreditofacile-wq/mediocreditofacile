import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * REGOLA: un coefficiente non si inventa e non si stima. Deve venire da una tabella
 * (PDF del kit, listino del partner, calcolatore ufficiale del portale) e il file che
 * lo contiene deve dire QUALE tabella e QUANDO e' stata letta. Se la tabella non c'e',
 * si chiede al partner: non si mette un numero verosimile.
 *
 * Nasce dal caso Duplex del 23/09/2026: il portale aveva quattro coefficienti piatti,
 * messi a maggio senza fonte, che non corrispondevano a nessuna tabella Grenke. Sulle
 * macchine sotto i 2.500 euro sbagliavano del 20%, e un agente ha quotato un cliente
 * con un canone che il contratto non avrebbe mai confermato.
 *
 * Questo test e' la regola resa eseguibile: se un file di coefficienti non dichiara
 * fonte e data, `npm test` fallisce.
 */

const CARTELLA = path.join(process.cwd(), 'src/data');

// Un file "quota": contiene fasce { da, a, c } oppure costanti di coefficienti e riscatti.
const SEMBRA_TABELLA = /_COEFF|COEFFICIENTI|_FASCE|RISCATT|\{\s*da:\s*\d|"da"\s*:\s*\d/;

// Come si dichiara la fonte: da dove viene il numero...
const DICHIARA_FONTE = /(fonte|provenienza|rilevat|tabella inviata|estratt|listino ufficiale|kit)/i;
// ...e di quando e' quel listino, perche' i coefficienti cambiano.
const DICHIARA_DATA =
  /\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}|\b\d{1,2}\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+\d{4}/i;

const TESTA = 2500; // la dichiarazione sta in testa al file, non sepolta in fondo

function fileDati(): string[] {
  return fs
    .readdirSync(CARTELLA)
    .filter((f) => /\.(ts|json)$/.test(f) && !/\.test\.ts$/.test(f));
}

describe('ogni tabella di coefficienti dichiara da dove viene', () => {
  const tabelle = fileDati().filter((f) =>
    SEMBRA_TABELLA.test(fs.readFileSync(path.join(CARTELLA, f), 'utf8')),
  );

  it('il controllo trova le tabelle che conosciamo', () => {
    // Se questa lista si svuota vuol dire che il rilevamento si e' rotto e il test
    // passerebbe sempre, senza controllare niente.
    expect(tabelle).toContain('grenke.ts');
    expect(tabelle).toContain('duplex-sputnik.ts');
    expect(tabelle.length).toBeGreaterThan(5);
  });

  it.each(tabelle)('%s dichiara fonte e data', (nome) => {
    const testa = fs.readFileSync(path.join(CARTELLA, nome), 'utf8').slice(0, TESTA);
    expect(
      DICHIARA_FONTE.test(testa),
      `${nome}: manca la fonte del coefficiente. Scrivi in testa al file da quale tabella viene (PDF del kit, listino del partner, calcolatore del portale). Se la tabella non ce l'hai, chiedila: non stimare.`,
    ).toBe(true);
    expect(
      DICHIARA_DATA.test(testa),
      `${nome}: la fonte non dice di quando e'. Aggiungi la data del listino o della lettura: un coefficiente vecchio vale quanto uno inventato.`,
    ).toBe(true);
  });
});
