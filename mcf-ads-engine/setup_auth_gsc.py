# mcf-ads-engine/setup_auth_gsc.py
"""
Ottiene il refresh token OAuth2 per Google Search Console (dati organici).
Run una volta: python setup_auth_gsc.py
Poi copia il refresh_token stampato in gsc-config.json.

Riusa lo stesso client OAuth di Google Ads (client_secrets.json), ma con
lo scope di Search Console (sola lettura).
"""
from google_auth_oauthlib.flow import InstalledAppFlow

# Scope sola lettura per Search Console (query, impression, click, posizione)
SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"]
CLIENT_SECRETS_FILE = "client_secrets.json"


def main():
    flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRETS_FILE, SCOPES)
    credentials = flow.run_local_server(port=8080)
    print("\n=== REFRESH TOKEN GSC ===")
    print(credentials.refresh_token)
    print("Copia questo valore in gsc-config.json come 'refresh_token'")


if __name__ == "__main__":
    main()
