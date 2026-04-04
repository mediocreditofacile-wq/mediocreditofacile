# mcf-ads-engine/setup_auth.py
"""
One-time script to obtain Google Ads OAuth2 refresh token.
Run once: python setup_auth.py
Then copy the printed refresh_token into google-ads.yaml.
"""
import json
from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ["https://www.googleapis.com/auth/adwords"]

# Load client_id and client_secret from a downloaded OAuth2 JSON file
# Download from: Google Cloud Console > APIs & Services > Credentials > OAuth 2.0 Client IDs
CLIENT_SECRETS_FILE = "client_secrets.json"


def main():
    flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRETS_FILE, SCOPES)
    credentials = flow.run_local_server(port=8080)
    print("\n=== REFRESH TOKEN ===")
    print(credentials.refresh_token)
    print("Copia questo valore in google-ads.yaml come 'refresh_token'")


if __name__ == "__main__":
    main()
