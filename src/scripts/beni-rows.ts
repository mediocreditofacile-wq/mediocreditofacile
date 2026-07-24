// Gestione della distinta beni nei portali partner (Full Service, Stilo, Expo).
// Una pratica = un contratto con una o piu' righe bene; il totale pilota la
// checklist e il campo importo legacy. Prefisso-agnostico: lavora su ID e
// data-attribute stabili, uguali su tutte le pagine, cosi' un solo helper serve
// tutti i portali. Il markup (classi CSS) resta nella singola pagina.
//
// Contratto DOM richiesto nella pagina:
//  - #beni-rows          contenitore delle righe
//  - .bene-row           una riga (la prima e' il template da clonare)
//      [data-bene="tipologia"]   select (opzionale)
//      [data-bene="descrizione"] input testo
//      [data-bene="importo"]     input number
//      [data-bene-remove]        bottone rimuovi riga
//  - #beni-add           bottone "+ Aggiungi bene"
//  - #beni-total         span dove scrivere il totale formattato
//  - #beni-json          input hidden name="beni" (JSON serializzato)
//  - #importo            input hidden name="importo" (sincronizzato col totale)

const eur = (n: number) =>
  n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

export function initBeniRows(): void {
  const container = document.getElementById('beni-rows');
  const addBtn = document.getElementById('beni-add');
  const totalEl = document.getElementById('beni-total');
  const jsonEl = document.getElementById('beni-json') as HTMLInputElement | null;
  const importoEl = document.getElementById('importo') as HTMLInputElement | null;
  if (!container || !addBtn || !jsonEl) return;

  const rows = () => Array.from(container.querySelectorAll<HTMLElement>('.bene-row'));

  const readRow = (row: HTMLElement) => ({
    tipologia: (row.querySelector('[data-bene="tipologia"]') as HTMLInputElement | null)?.value.trim() ?? '',
    descrizione: (row.querySelector('[data-bene="descrizione"]') as HTMLInputElement | null)?.value.trim() ?? '',
    importo: (row.querySelector('[data-bene="importo"]') as HTMLInputElement | null)?.value.trim() ?? '',
  });

  function sync() {
    const beni = rows().map(readRow);
    const totale = beni.reduce((s, b) => s + (parseFloat(b.importo) || 0), 0);

    jsonEl!.value = JSON.stringify(beni);
    if (totalEl) totalEl.textContent = eur(totale);
    if (importoEl) {
      importoEl.value = totale > 0 ? String(totale) : '';
      // La checklist dinamica ascolta 'input' su #importo: la faccio scattare
      importoEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Il bottone rimuovi si nasconde quando resta una sola riga
    const rs = rows();
    rs.forEach((row) => {
      const rm = row.querySelector<HTMLElement>('[data-bene-remove]');
      if (rm) rm.style.visibility = rs.length > 1 ? 'visible' : 'hidden';
    });
  }

  function wireRow(row: HTMLElement) {
    row.querySelectorAll<HTMLInputElement>('[data-bene]').forEach((inp) => {
      inp.addEventListener('input', sync);
      inp.addEventListener('change', sync);
    });
    const rm = row.querySelector<HTMLElement>('[data-bene-remove]');
    rm?.addEventListener('click', () => {
      if (rows().length <= 1) return; // non si elimina l'ultima riga
      row.remove();
      sync();
    });
  }

  // Template = prima riga presente in pagina
  const template = rows()[0];
  if (!template) return;

  addBtn.addEventListener('click', () => {
    const clone = template.cloneNode(true) as HTMLElement;
    clone.querySelectorAll<HTMLInputElement>('[data-bene]').forEach((inp) => {
      if (inp instanceof HTMLSelectElement) inp.selectedIndex = 0;
      else inp.value = '';
      inp.classList.remove('is-error');
    });
    container.appendChild(clone);
    wireRow(clone);
    sync();
    (clone.querySelector('[data-bene="descrizione"]') as HTMLInputElement | null)?.focus();
  });

  rows().forEach(wireRow);
  sync();
}
