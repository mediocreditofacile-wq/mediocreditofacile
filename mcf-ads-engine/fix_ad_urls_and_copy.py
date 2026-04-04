#!/usr/bin/env python3
"""
Fix policy violations su Finanza Veloce e Diventa Partner:
  1. URL /finanzaveloce → /finanza-veloce  (tutti e 5 gli annunci FV)
  2. URL /diventapartner → /diventa-partner (tutti e 5 gli annunci DP)
  3. Rimuove `|` da headlines/descriptions in Finanza Veloce
  4. Sostituisce em dash `—` con trattino `-` nelle headlines Diventa Partner
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

import yaml
from google.ads.googleads.client import GoogleAdsClient
from google.protobuf import field_mask_pb2


# Ad IDs con URL errata e la URL corretta
AD_URL_FIXES = {
    # Finanza Veloce — tutti puntano a /finanzaveloce invece di /finanza-veloce
    800063350704: "https://www.mediocreditofacile.it/finanza-veloce",
    800097552148: "https://www.mediocreditofacile.it/finanza-veloce",
    800097594880: "https://www.mediocreditofacile.it/finanza-veloce",
    800063358432: "https://www.mediocreditofacile.it/finanza-veloce",
    # NOLEGGIO OPERATIVO ad group aveva /diventapartner → deve essere /finanza-veloce
    800097594886: "https://www.mediocreditofacile.it/finanza-veloce",
    # Diventa Partner — tutti puntano a /diventapartner invece di /diventa-partner
    800174554703: "https://www.mediocreditofacile.it/diventa-partner",
    800174555429: "https://www.mediocreditofacile.it/diventa-partner",
    800097626806: "https://www.mediocreditofacile.it/diventa-partner",
    800174558825: "https://www.mediocreditofacile.it/diventa-partner",
    800097626848: "https://www.mediocreditofacile.it/diventa-partner",
}

# Headlines/descriptions da correggere (ad_id → correzioni)
COPY_FIXES = {
    # Finanza Veloce — NOLEGGIO OPERATIVO — pipe in headline e description
    800097594886: {
        "headlines": {
            "Risposta in 24 Ore |": "Risposta in 24 Ore",
        },
        "descriptions": {
            "Compila il form, ti richiamiamo in 24 ore con una proposta su misura. Gratis. |":
                "Compila il form, ti richiamiamo in 24 ore con una proposta su misura. Gratis.",
        },
    },
    # Diventa Partner — tutti hanno "Diventa Partner — Gratis" con em dash
    800174554703: {"headlines": {"Diventa Partner — Gratis": "Diventa Partner Gratis"}},
    800174555429: {"headlines": {"Diventa Partner — Gratis": "Diventa Partner Gratis"}},
    800097626806: {"headlines": {"Diventa Partner — Gratis": "Diventa Partner Gratis"}},
    800174558825: {"headlines": {"Diventa Partner — Gratis": "Diventa Partner Gratis"}},
    800097626848: {"headlines": {"Diventa Partner — Gratis": "Diventa Partner Gratis"}},
}


def fetch_ads_details(customer_id: str, ad_ids: list, yaml_path: str = "google-ads.yaml"):
    """Recupera dettagli RSA (resource_name + testi) per i ad_ids dati."""
    client = GoogleAdsClient.load_from_storage(yaml_path)
    service = client.get_service("GoogleAdsService")
    ids_str = ", ".join(str(i) for i in ad_ids)
    query = f"""
SELECT
  ad_group_ad.ad.id,
  ad_group_ad.ad.resource_name,
  ad_group_ad.ad.final_urls,
  ad_group_ad.ad.responsive_search_ad.headlines,
  ad_group_ad.ad.responsive_search_ad.descriptions
FROM ad_group_ad
WHERE ad_group_ad.ad.id IN ({ids_str})
  AND ad_group_ad.status != 'REMOVED'
"""
    response = service.search(customer_id=customer_id, query=query)
    ads = {}
    for row in response:
        ad = row.ad_group_ad.ad
        rsa = ad.responsive_search_ad
        ads[ad.id] = {
            "resource_name": ad.resource_name,
            "final_urls": list(ad.final_urls),
            "headlines_raw": list(rsa.headlines),
            "descriptions_raw": list(rsa.descriptions),
        }
    return ads


def fix_ad(customer_id: str, ad_id: int, ad_info: dict,
           new_url: str, copy_fixes: dict, client, dry_run: bool):
    """Aggiorna final_urls e/o copy di un RSA."""
    h_fixes = copy_fixes.get("headlines", {})
    d_fixes = copy_fixes.get("descriptions", {})

    if dry_run:
        print(f"    [DRY-RUN] Ad {ad_id}: final_url → {new_url}")
        if h_fixes:
            for old, new in h_fixes.items():
                print(f"      headline: \"{old}\" → \"{new}\"")
        if d_fixes:
            for old, new in d_fixes.items():
                print(f"      description: \"{old[:60]}...\" → fixed")
        return

    # final_urls e copy si aggiornano via AdService (non AdGroupAdService)
    # resource_name Ad = "customers/{customer_id}/ads/{ad_id}"
    ad_resource_name = f"customers/{customer_id}/ads/{ad_id}"

    op = client.get_type("AdOperation")
    ad = op.update
    ad.resource_name = ad_resource_name

    paths = []

    # 1. Fix URL
    ad.final_urls.append(new_url)
    paths.append("final_urls")

    # 2. Fix copy (if needed)
    if h_fixes or d_fixes:
        for h_raw in ad_info["headlines_raw"]:
            text_val = h_raw.text if isinstance(h_raw.text, str) else str(h_raw.text)
            new_text = h_fixes.get(text_val, text_val)
            new_h = client.get_type("AdTextAsset")
            new_h.text = new_text
            if h_raw.pinned_field:
                new_h.pinned_field = h_raw.pinned_field
            ad.responsive_search_ad.headlines.append(new_h)

        for d_raw in ad_info["descriptions_raw"]:
            text_val = d_raw.text if isinstance(d_raw.text, str) else str(d_raw.text)
            new_text = d_fixes.get(text_val, text_val)
            new_d = client.get_type("AdTextAsset")
            new_d.text = new_text
            if d_raw.pinned_field:
                new_d.pinned_field = d_raw.pinned_field
            ad.responsive_search_ad.descriptions.append(new_d)

        paths.append("responsive_search_ad.headlines")
        paths.append("responsive_search_ad.descriptions")

    op.update_mask.CopyFrom(field_mask_pb2.FieldMask(paths=paths))

    ad_service = client.get_service("AdService")
    response = ad_service.mutate_ads(
        customer_id=customer_id, operations=[op]
    )
    print(f"    ✓ Ad {ad_id} aggiornato: {response.results[0].resource_name}")


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    with open("config.yaml") as f:
        config = yaml.safe_load(f)
    customer_id = config["google_ads"]["customer_id"]

    print(f"{'[DRY-RUN] ' if args.dry_run else ''}Fix URL e copy annunci\n")

    client = GoogleAdsClient.load_from_storage("google-ads.yaml")

    all_ad_ids = list(AD_URL_FIXES.keys())
    print(f"Fetch dettagli per {len(all_ad_ids)} annunci...")
    ads_info = fetch_ads_details(customer_id, all_ad_ids)
    print(f"Trovati: {len(ads_info)}\n")

    for ad_id, new_url in AD_URL_FIXES.items():
        if ad_id not in ads_info:
            print(f"  [WARN] Ad {ad_id} non trovato — skip")
            continue
        copy_fixes = COPY_FIXES.get(ad_id, {})
        print(f"  Ad {ad_id}:")
        print(f"    URL attuale: {ads_info[ad_id]['final_urls']}")
        print(f"    URL nuova:   {new_url}")
        fix_ad(customer_id, ad_id, ads_info[ad_id], new_url, copy_fixes, client, args.dry_run)

    print("\nCompletato.")


if __name__ == "__main__":
    main()
