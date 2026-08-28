"""
Original proof-of-concept: pull a raw profile payload from LinkedIn's Voyager
API using a manually-extracted session cookie. No browser involved.

This is the spike that established the endpoint; the hosted service in src/
is a port of this same request. Kept as a reference implementation — see the
"Provenance -> code" table in README.md.

Credentials come from the environment ONLY. Never hard-code them here.

    export LI_AT="<li_at cookie value>"
    export JSESSIONID="ajax:<digits>"        # no surrounding quotes
    python fetch_profile.py <linkedin-profile-url>
"""

import os
import re
import sys
import json
import httpx

LI_AT = os.environ.get("LI_AT", "")
JSESSIONID = os.environ.get("JSESSIONID", "")  # no quotes here
USER_AGENT = os.environ.get(
    "LI_USER_AGENT",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    "(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
)

# LinkedIn versions its response "decorations" (e.g. the trailing -107). Old
# versions eventually return 410; the current one shipped by the Android app
# (com.linkedin.android 4.1.1239) is -107. Override via env when it moves.
DECORATION_ID = os.environ.get(
    "DECORATION_ID",
    "com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-107",
)


def extract_public_id(profile_url: str) -> str:
    """Pulls the public identifier out of a linkedin.com/in/<id>/ URL."""
    match = re.search(r"linkedin\.com/in/([^/?]+)", profile_url)
    if not match:
        raise ValueError(f"Could not parse a public identifier from: {profile_url}")
    return match.group(1)


def require_credentials() -> None:
    """Fail loudly if the session cookies were not supplied via the environment."""
    missing = [name for name, value in (("LI_AT", LI_AT), ("JSESSIONID", JSESSIONID)) if not value]
    if missing:
        raise RuntimeError(
            f"Missing required environment variable(s): {', '.join(missing)}. "
            "Extract them from a logged-in LinkedIn browser session and export them "
            "(or put them in a git-ignored .env). Never hard-code them in this file."
        )


def fetch_profile_view(public_id: str) -> dict:
    require_credentials()

    # The old /identity/profiles/{id}/profileView route is retired (returns 410).
    # Current equivalent: query dash/profiles by memberIdentity with a decorationId
    # that tells LinkedIn which nested fields to include in the response.
    url = "https://www.linkedin.com/voyager/api/identity/dash/profiles"
    params = {
        "q": "memberIdentity",
        "memberIdentity": public_id,
        "decorationId": DECORATION_ID,
    }

    headers = {
        "User-Agent": USER_AGENT,
        "csrf-token": JSESSIONID,
        "x-restli-protocol-version": "2.0.0",
        "x-li-lang": "en_US",
        "Accept": "application/vnd.linkedin.normalized+json+2.1",
    }

    cookies = {
        "li_at": LI_AT,
        "JSESSIONID": f'"{JSESSIONID}"',  # LinkedIn expects this cookie value quoted
    }

    with httpx.Client(headers=headers, cookies=cookies, timeout=15.0) as client:
        resp = client.get(url, params=params)

    print(f"Status: {resp.status_code}", file=sys.stderr)

    if resp.status_code == 401 or resp.status_code == 403:
        raise RuntimeError(
            "Auth failed. Likely causes: expired li_at, mismatched User-Agent, "
            "or a stale JSESSIONID/csrf-token pair. Re-extract both cookies fresh "
            "from the same logged-in browser session."
        )
    if resp.status_code == 404:
        raise RuntimeError("Profile not found — check the public identifier / privacy settings.")
    if resp.status_code == 410:
        raise RuntimeError(
            "410 Gone — the DECORATION_ID version is stale (LinkedIn retires old ones). "
            "Get a current value from the latest LinkedIn Android APK: "
            "`strings apk/classes*.dex | grep FullProfileWithEntities`, then set the "
            "DECORATION_ID env var to the newest one."
        )

    resp.raise_for_status()
    return resp.json()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python fetch_profile.py <linkedin-profile-url>", file=sys.stderr)
        sys.exit(1)

    public_id = extract_public_id(sys.argv[1])
    data = fetch_profile_view(public_id)

    # Dump raw response so we can see the real shape before we design the schema.
    with open("raw_response.json", "w") as f:
        json.dump(data, f, indent=2)

    print(f"Saved raw response for '{public_id}' to raw_response.json ({len(json.dumps(data))} bytes)")
