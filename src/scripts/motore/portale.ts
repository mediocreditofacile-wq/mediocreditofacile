// Punto d'ingresso del portale del motore: legge la carrozzeria dalla pagina,
// passa dal gate e monta le sezioni.

import { montaAzioni } from './azioni';
import { montaCliente } from './cliente';
import { $, apriTab, stato } from './comune';
import { avviaGate } from './gate';
import { montaPratiche } from './pratiche';
import { montaProposte } from './proposte';
import { montaRete } from './rete';
import { montaSimulazione } from './simulazione';
import { caricaStorico, montaStorico } from './storico';

/** Sessione caduta mentre si lavora: una fascia in cima con il pulsante per rientrare */
function avvisaSessioneScaduta() {
  if (document.getElementById('mt-scaduta')) return;
  const fascia = document.createElement('div');
  fascia.id = 'mt-scaduta';
  fascia.className = 'mt-msg mt-msg--errore mt-scaduta';
  fascia.setAttribute('role', 'alert');
  fascia.innerHTML = `<span>La sessione è scaduta: rientra con email e password.</span>
    <button type="button" class="mt-btn">Rientra</button>`;
  fascia.querySelector('button')!.addEventListener('click', () => location.reload());
  $('tool').prepend(fascia);
}

function entra(s: any) {
  stato.ruolo = s.ruolo;
  stato.vedeTutto = Boolean(s.vedeTutto);
  stato.utente = s.utente;
  stato.carrozzeria = s.carrozzeria;
  stato.catalogo = s.catalogo ?? [];

  const etichetta = s.ruolo === 'referente' ? ' · referente' : s.ruolo === 'admin' ? ' · MCF' : '';
  $('chi-sono').textContent = `${s.utente?.nome || s.utente?.email}${etichetta}`;
  const tab = (nome: string) => document.querySelector<HTMLButtonElement>(`.mt-tab[data-tab="${nome}"]`)!;
  tab('rete').hidden = !(s.ruolo === 'referente' || s.ruolo === 'admin');
  tab('mcf').hidden = s.ruolo !== 'admin';

  montaSimulazione();
  montaCliente();
  montaProposte();
  montaAzioni();
  montaPratiche();
  // Il pannello MCF si scarica solo quando entra l'admin: il browser degli
  // agenti non riceve nemmeno il suo codice
  if (s.ruolo === 'admin') void import('./admin').then((m) => m.montaAdmin());
  montaStorico();
  montaRete();
  void caricaStorico();
}

export function avviaPortale() {
  const radice = $('motore');
  stato.slug = radice.dataset.slug ?? '';
  stato.settore = radice.dataset.settore ?? 'generico';

  document.querySelectorAll<HTMLButtonElement>('.mt-tab').forEach((t) => {
    t.addEventListener('click', () => apriTab(t.dataset.tab!));
  });
  document.addEventListener('mt:sessione-scaduta', () => { if (!$('tool').hidden) avvisaSessioneScaduta(); });
  void avviaGate(entra);
}
