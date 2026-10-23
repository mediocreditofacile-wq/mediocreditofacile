// Celle delle checklist col documento dell'anno (data-doc-anno="societa" o "ditta").
// Il testo si ricalcola nel browser a ogni visita: la pagina e' statica, e quello
// scritto in build invecchierebbe fino al deploy successivo.
import { documentoAnno } from '../lib/checklist-pratica';

export function aggiornaDocumentiAnno(radice: ParentNode = document): void {
  radice.querySelectorAll<HTMLElement>('[data-doc-anno]').forEach((cella) => {
    const forma = cella.dataset.docAnno;
    if (forma === 'societa' || forma === 'ditta') cella.textContent = documentoAnno(forma);
  });
}
