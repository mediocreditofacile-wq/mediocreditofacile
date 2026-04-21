#!/usr/bin/env python3
"""
Genera il Refresh Token OAuth2 per Google Ads API.

Prerequisiti:
1. Vai su https://console.cloud.google.com
2. Crea un progetto (o usa uno esistente)
3. Abilita "Google Ads API" in API & Services → Library
4. Crea credenziali OAuth2 (tipo: Desktop App) in API & Services → Credentials
5. Scarica il JSON o copia Client ID e Client Secret

Uso:
    python3 scripts/get_refresh_token.py
"""

import sys

try:
    from google_auth_oauthlib.flow import InstalledAppFlow
except ImportError:
    print("Installa le dipendenze:")
    print("  pip3 install google-auth-oauthlib google-ads")
    sys.exit(1)

SCOPES = ["https://www.googleapis.com/auth/adwords"]

def main():
    client_id = input("Client ID: ").strip()
    client_secret = input("Client Secret: ").strip()

    client_config = {
        "installed": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    }

    flow = InstalledAppFlow.from_client_config(client_config, scopes=SCOPES)
    flow.run_local_server(port=8080)

    print("\n✅ Refresh Token ottenuto:")
    print(flow.credentials.refresh_token)
    print("\nCopialo in scripts/google-ads.yaml alla voce refresh_token")

if __name__ == "__main__":
    main()
