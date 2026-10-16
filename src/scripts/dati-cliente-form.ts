// Dati del cliente nei moduli pratica dei portali /tools/<slug> (Expo Energia,
// STILO, Full Service, UNIDIMA, Extreme Computer): cellulare ed email del
// referente e IBAN dell'azienda, tutti obbligatori.
//
// Lavora su campi con name="telefono", "email" e "iban" e su un elemento
// [data-iban-esito] per il motivo sotto l'IBAN. verifica() mette i motivi in
// setCustomValidity: va chiamata subito prima di form.reportValidity(), che
// ferma l'invio sul primo campo sbagliato. Le regole sono quelle del server
// (src/lib/dati-cliente-pratica.ts).

import { controllaCellulare, controllaEmail } from '../lib/dati-cliente-pratica';
import { initCampoIban } from './campo-iban';

export function initDatiCliente(form: HTMLFormElement) {
  const campo = (nome: string) => form.elements.namedItem(nome) as HTMLInputElement;
  const telefono = campo('telefono');
  const email = campo('email');
  const iban = initCampoIban(campo('iban'), form.querySelector<HTMLElement>('[data-iban-esito]'));
  for (const el of [telefono, email]) el.addEventListener('input', () => el.setCustomValidity(''));

  return {
    verifica() {
      telefono.setCustomValidity(controllaCellulare(telefono.value)?.messaggio ?? '');
      email.setCustomValidity(controllaEmail(email.value)?.messaggio ?? '');
      iban.verifica();
    },
  };
}
