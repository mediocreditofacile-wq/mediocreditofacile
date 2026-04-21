/**
 * Google Ads Script — Sostituisci URL da .com a .it in bulk
 *
 * Cosa fa:
 * 1. Scansiona tutti gli annunci attivi
 * 2. Scansiona tutti i sitelink
 * 3. Sostituisce mediocreditofacile.com → mediocreditofacile.it
 * 4. Genera un log con tutte le modifiche
 *
 * Come usarlo:
 * 1. Vai su Google Ads → Strumenti → Script
 * 2. Crea nuovo script
 * 3. Incolla questo codice
 * 4. Prima esecuzione: imposta PREVIEW_ONLY = true (test senza modificare)
 * 5. Seconda esecuzione: imposta PREVIEW_ONLY = false (applica le modifiche)
 */

// ============ CONFIGURAZIONE ============
var OLD_DOMAIN = 'mediocreditofacile.com';
var NEW_DOMAIN = 'mediocreditofacile.it';
var PREVIEW_ONLY = true; // true = solo anteprima, false = applica modifiche
// =========================================

function main() {
  Logger.log('=== SOSTITUZIONE URL: ' + OLD_DOMAIN + ' → ' + NEW_DOMAIN + ' ===');
  Logger.log('Modalità: ' + (PREVIEW_ONLY ? 'ANTEPRIMA (nessuna modifica)' : 'MODIFICA ATTIVA'));
  Logger.log('');

  var totale = 0;

  totale += aggiornaAnnunciResponsivi();
  totale += aggiornaAnnunciEspansi();
  totale += aggiornaSitelinks();
  totale += aggiornaKeywordUrls();

  Logger.log('');
  Logger.log('=== RIEPILOGO ===');
  Logger.log('Totale URL aggiornati: ' + totale);

  if (PREVIEW_ONLY && totale > 0) {
    Logger.log('');
    Logger.log('⚠ Modalità ANTEPRIMA — nessuna modifica applicata.');
    Logger.log('Per applicare le modifiche, imposta PREVIEW_ONLY = false e riesegui.');
  }
}

// --- ANNUNCI RESPONSIVE (RSA) ---
function aggiornaAnnunciResponsivi() {
  Logger.log('--- Annunci Responsive (RSA) ---');
  var count = 0;

  var ads = AdsApp.ads()
    .withCondition('Type = RESPONSIVE_SEARCH_AD')
    .withCondition('Status != REMOVED')
    .get();

  while (ads.hasNext()) {
    var ad = ads.next();
    var urls = ad.urls();

    // URL finale
    var finalUrl = urls.getFinalUrl();
    if (finalUrl && finalUrl.indexOf(OLD_DOMAIN) > -1) {
      var newUrl = finalUrl.replace(OLD_DOMAIN, NEW_DOMAIN);
      Logger.log('[RSA] URL finale: ' + finalUrl + ' → ' + newUrl);
      Logger.log('       Campagna: ' + ad.getCampaign().getName() +
                 ' | Gruppo: ' + ad.getAdGroup().getName());
      if (!PREVIEW_ONLY) {
        urls.setFinalUrl(newUrl);
      }
      count++;
    }

    // URL mobile finale
    var mobileFinalUrl = urls.getMobileFinalUrl();
    if (mobileFinalUrl && mobileFinalUrl.indexOf(OLD_DOMAIN) > -1) {
      var newMobileUrl = mobileFinalUrl.replace(OLD_DOMAIN, NEW_DOMAIN);
      Logger.log('[RSA] URL mobile: ' + mobileFinalUrl + ' → ' + newMobileUrl);
      if (!PREVIEW_ONLY) {
        urls.setMobileFinalUrl(newMobileUrl);
      }
      count++;
    }

    // Tracking template
    var trackingTemplate = urls.getTrackingTemplate();
    if (trackingTemplate && trackingTemplate.indexOf(OLD_DOMAIN) > -1) {
      var newTracking = trackingTemplate.replace(new RegExp(escapeRegex(OLD_DOMAIN), 'g'), NEW_DOMAIN);
      Logger.log('[RSA] Tracking: ' + trackingTemplate + ' → ' + newTracking);
      if (!PREVIEW_ONLY) {
        urls.setTrackingTemplate(newTracking);
      }
      count++;
    }
  }

  Logger.log('RSA aggiornati: ' + count);
  Logger.log('');
  return count;
}

// --- ANNUNCI ESPANSI (ETA) — legacy, ancora attivi in molti account ---
function aggiornaAnnunciEspansi() {
  Logger.log('--- Annunci Espansi (ETA) ---');
  var count = 0;

  var ads = AdsApp.ads()
    .withCondition('Type = EXPANDED_TEXT_AD')
    .withCondition('Status != REMOVED')
    .get();

  while (ads.hasNext()) {
    var ad = ads.next();
    var urls = ad.urls();

    var finalUrl = urls.getFinalUrl();
    if (finalUrl && finalUrl.indexOf(OLD_DOMAIN) > -1) {
      var newUrl = finalUrl.replace(OLD_DOMAIN, NEW_DOMAIN);
      Logger.log('[ETA] URL finale: ' + finalUrl + ' → ' + newUrl);
      Logger.log('       Campagna: ' + ad.getCampaign().getName() +
                 ' | Gruppo: ' + ad.getAdGroup().getName());
      if (!PREVIEW_ONLY) {
        urls.setFinalUrl(newUrl);
      }
      count++;
    }

    var mobileFinalUrl = urls.getMobileFinalUrl();
    if (mobileFinalUrl && mobileFinalUrl.indexOf(OLD_DOMAIN) > -1) {
      var newMobileUrl = mobileFinalUrl.replace(OLD_DOMAIN, NEW_DOMAIN);
      Logger.log('[ETA] URL mobile: ' + mobileFinalUrl + ' → ' + newMobileUrl);
      if (!PREVIEW_ONLY) {
        urls.setMobileFinalUrl(newMobileUrl);
      }
      count++;
    }
  }

  Logger.log('ETA aggiornati: ' + count);
  Logger.log('');
  return count;
}

// --- SITELINKS ---
function aggiornaSitelinks() {
  Logger.log('--- Sitelink Extensions ---');
  var count = 0;

  // Sitelink a livello di campagna
  var campaigns = AdsApp.campaigns()
    .withCondition('Status != REMOVED')
    .get();

  while (campaigns.hasNext()) {
    var campaign = campaigns.next();
    var sitelinks = campaign.extensions().sitelinks().get();

    while (sitelinks.hasNext()) {
      var sitelink = sitelinks.next();
      var urls = sitelink.urls();

      var finalUrl = urls.getFinalUrl();
      if (finalUrl && finalUrl.indexOf(OLD_DOMAIN) > -1) {
        var newUrl = finalUrl.replace(OLD_DOMAIN, NEW_DOMAIN);
        Logger.log('[Sitelink] "' + sitelink.getLinkText() + '": ' + finalUrl + ' → ' + newUrl);
        Logger.log('            Campagna: ' + campaign.getName());
        if (!PREVIEW_ONLY) {
          urls.setFinalUrl(newUrl);
        }
        count++;
      }

      var mobileFinalUrl = urls.getMobileFinalUrl();
      if (mobileFinalUrl && mobileFinalUrl.indexOf(OLD_DOMAIN) > -1) {
        var newMobileUrl = mobileFinalUrl.replace(OLD_DOMAIN, NEW_DOMAIN);
        Logger.log('[Sitelink] "' + sitelink.getLinkText() + '" mobile: ' + mobileFinalUrl + ' → ' + newMobileUrl);
        if (!PREVIEW_ONLY) {
          urls.setMobileFinalUrl(newMobileUrl);
        }
        count++;
      }
    }
  }

  Logger.log('Sitelink aggiornati: ' + count);
  Logger.log('');
  return count;
}

// --- KEYWORD URLS (URL finale a livello di keyword) ---
function aggiornaKeywordUrls() {
  Logger.log('--- Keyword Final URLs ---');
  var count = 0;

  var keywords = AdsApp.keywords()
    .withCondition('Status != REMOVED')
    .get();

  while (keywords.hasNext()) {
    var keyword = keywords.next();
    var urls = keyword.urls();

    var finalUrl = urls.getFinalUrl();
    if (finalUrl && finalUrl.indexOf(OLD_DOMAIN) > -1) {
      var newUrl = finalUrl.replace(OLD_DOMAIN, NEW_DOMAIN);
      Logger.log('[KW] "' + keyword.getText() + '": ' + finalUrl + ' → ' + newUrl);
      Logger.log('      Campagna: ' + keyword.getCampaign().getName() +
                 ' | Gruppo: ' + keyword.getAdGroup().getName());
      if (!PREVIEW_ONLY) {
        urls.setFinalUrl(newUrl);
      }
      count++;
    }
  }

  Logger.log('Keyword URLs aggiornati: ' + count);
  Logger.log('');
  return count;
}

// --- UTILITY ---
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
