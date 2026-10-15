// Il cliente di una proposta: la scheda verificata se c'e', altrimenti il nome
// che l'agente scrive a mano (settore macchine, proposte prima della verifica).

import { describe, expect, it } from 'vitest';
import type { RicercaSalvata } from './calcolo-proposta';
import { clienteDellaProposta } from './cliente-proposta';

const RICERCA = {
  id: 'r1', piva: '01234567890', ragione_sociale: 'Pulizie Prova S.r.l.', eventi: null,
  dati_credito: { dati: {}, scheda: { piva: '01234567890', ragioneSociale: 'Pulizie Prova S.r.l.', sede: 'Via Roma 1, Prato (PO)', formaGiuridica: 'SOCIETA A RESPONSABILITA LIMITATA' } },
} as unknown as RicercaSalvata;

describe('cliente della proposta', () => {
  it('con la verifica: ragione sociale, partita IVA e sede dalla scheda', () => {
    expect(clienteDellaProposta(RICERCA, 'Nome scritto a mano')).toEqual({
      nome: 'Pulizie Prova S.r.l.', piva: '01234567890', sede: 'Via Roma 1, Prato (PO)', forma: 'SOCIETA A RESPONSABILITA LIMITATA', verificato: true,
    });
  });
  it('senza verifica: il nome scritto dall agente, ripulito', () => {
    expect(clienteDellaProposta(null, '  Bar  Centrale   di Rossi ')).toEqual({
      nome: 'Bar Centrale di Rossi', piva: null, sede: null, forma: null, verificato: false,
    });
  });
  it('senza verifica e senza nome: vuoto, non inventato', () => {
    expect(clienteDellaProposta(null, undefined)).toEqual({ nome: '', piva: null, sede: null, forma: null, verificato: false });
    expect(clienteDellaProposta(null, 'x'.repeat(300)).nome).toHaveLength(120);
  });
});
