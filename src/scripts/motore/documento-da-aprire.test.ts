// Quale PDF si apre da solo appena generato il preventivo. I nomi sono quelli
// veri dei generatori: pdf-macchine, pdf-generico, pdf-mezzi, pdf-ledoffice e
// i prospetti fotovoltaico del microservizio.

import { describe, expect, it } from 'vitest';
import { documentoDaAprire } from './documento-da-aprire';

const doc = (nome: string) => ({ nome, pathname: `preventivi/x/ID/${nome}` });

describe('il PDF che si apre da solo', () => {
  it('Duplex: il preventivo di noleggio', () => {
    expect(documentoDaAprire([doc('preventivo-noleggio-DX-1.pdf')])?.nome).toBe('preventivo-noleggio-DX-1.pdf');
  });

  it('noleggio e leasing: il noleggio, in qualunque ordine arrivino', () => {
    const docs = [doc('prospetto-leasing-FI-1.pdf'), doc('preventivo-noleggio-FI-1.pdf')];
    expect(documentoDaAprire(docs)?.nome).toBe('preventivo-noleggio-FI-1.pdf');
  });

  it('fotovoltaico: il prospetto di noleggio, non l infografico', () => {
    const docs = [
      doc('Prospetto_Infografico_Noleggio_PV_rossi_20261024.pdf'),
      doc('Prospetto_Noleggio_Operativo_PV_rossi_20261024.pdf'),
      doc('Prospetto_Leasing_PV_rossi_20261024.pdf'),
    ];
    expect(documentoDaAprire(docs)?.nome).toBe('Prospetto_Noleggio_Operativo_PV_rossi_20261024.pdf');
  });

  it('Led Office: il preventivo del canone, non la proposta di vendita', () => {
    const docs = [doc('proposta-vendita-LO-1.pdf'), doc('preventivo-canone-LO-1.pdf')];
    expect(documentoDaAprire(docs)?.nome).toBe('preventivo-canone-LO-1.pdf');
  });

  it('solo leasing (mezzo usato, niente noleggio): si apre il leasing', () => {
    expect(documentoDaAprire([doc('prospetto-leasing-EB-1.pdf')])?.nome).toBe('prospetto-leasing-EB-1.pdf');
  });

  it('nessun documento, niente da aprire', () => {
    expect(documentoDaAprire([])).toBeNull();
  });
});
