# How the LinkedIn profile fetch works

A beginner-friendly walkthrough of `fetch_profile_view()` in
[`fetch_profile.py`](../fetch_profile.py) — what every line does and *why* each
piece is required.

For the higher-level "how was this reverse-engineered / is it a real endpoint"
story, see the [README](../README.md).

---

## One sentence

The function makes **one HTTP GET request** — the same kind your browser makes
when you open a page — with extra labels attached so LinkedIn treats it as a
**logged-in user** instead of an anonymous stranger.

## Mental model

Think of it as walking up to LinkedIn's back office and asking a clerk for
someone's profile printout. To get served you need four things:

| Thing you need | In the code |
| --- | --- |
| 1. The right counter to walk up to | the **URL** |
| 2. A clearly worded request slip | the **query parameters** |
| 3. Your ID badge | the **cookies** |
| 4. Paperwork filled out their way | the **headers** |

If any one of these is wrong, the clerk says no.

---

## 1. The counter — the URL

```python
url = "https://www.linkedin.com/voyager/api/identity/dash/profiles"
```

Just the address of LinkedIn's "give me profile data" service. We did not invent
it — LinkedIn's own Android app calls this exact address (confirmed by
inspecting the app; see README).

- `voyager` — LinkedIn's internal nickname for "the part of our system the apps
  talk to." It's just a place; the word doesn't matter.
- `identity/dash/profiles` — the "profiles" service in its current generation
  (`dash` = the newer version of LinkedIn's data layer; older non-`dash`
  profile endpoints are being retired and return `410 Gone`).

---

## 2. The request slip — query parameters

```python
params = {
    "q": "memberIdentity",
    "memberIdentity": public_id,
    "decorationId": "com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93",
}
```

These get glued to the end of the URL as `?q=memberIdentity&memberIdentity=...`
(the part after the `?` in a URL).

### `q` — "which way do you want to search?"

LinkedIn's service can find a profile several ways. `"memberIdentity"` means
"I'll give you the username from the profile URL; find them by that."

### `memberIdentity` — the actual username

The slug from `linkedin.com/in/`**`iamarun4official`**`/`. That value is what
`public_id` holds (extracted by `extract_public_id()`).

Nice bonus: this endpoint accepts the plain username. LinkedIn's *website*
requires the internal ID form (`ACoAAB0...`), which would need an extra lookup
step first. The REST endpoint skips that.

### `decorationId` — "how much detail do you want?"

The important one. Without it, LinkedIn returns a nearly empty response (just an
ID). With it, LinkedIn includes the **whole profile**: jobs, education, skills,
certifications, languages.

The long string is just a **name for a preset** — like ordering "the works"
pizza instead of listing every topping. `FullProfileWithEntities` = "the
profile plus all its attached stuff."

The `-93` on the end is a **version number**. LinkedIn bumps it every few
months and retires old ones. If this code suddenly breaks with a `410` months
from now, this number is almost certainly why.

> **Action item:** move this to an environment variable
> (`DECORATION_ID`) with a current default (`...FullProfileWithEntities-107`),
> so it can be updated in one place without a code change.

---

## 3. Your ID badge — cookies

```python
cookies = {
    "li_at": LI_AT,
    "JSESSIONID": f'"{JSESSIONID}"',
}
```

Cookies are how "logged in" works. When you log into LinkedIn in a browser,
LinkedIn gives your browser some secret strings and says "show me these on every
request so I know it's you." This code copies two of them and sends them
manually.

### `li_at` — the real "I'm logged in as this account" pass

The sensitive one. Anyone who has this value **is** you on LinkedIn.
**Never commit it. Never paste it anywhere public.**

### `JSESSIONID` — a second string LinkedIn also requires

Two quirks:

1. LinkedIn stores it **with literal quote marks around the value**, like
   `"ajax:12345"`. That is why the code writes `f'"{JSESSIONID}"'` — it wraps
   the value in real quote characters.
2. `li_at` and `JSESSIONID` must be grabbed from the **same browser session at
   the same time**. Mixing an old one with a new one fails auth.

Both cookies expire after a while (weeks to months). When they do: log into
LinkedIn again in a browser and copy fresh values.

---

## 4. The paperwork — headers

```python
headers = {
    "User-Agent": USER_AGENT,
    "csrf-token": JSESSIONID,
    "x-restli-protocol-version": "2.0.0",
    "x-li-lang": "en_US",
    "Accept": "application/vnd.linkedin.normalized+json+2.1",
}
```

Headers are extra notes attached to a request. LinkedIn is picky about these.

### `User-Agent` — "what kind of program is asking?"

Normally a browser fills this in automatically ("I'm Chrome on a Mac"). This is
a script, not a browser, so we set it to look like a normal browser. If it looks
scripted or is missing, LinkedIn is more likely to block the request. Keep it
looking like a recent desktop browser, and keep it the same across requests.

### `csrf-token` — a security check

LinkedIn wants the `JSESSIONID` value sent **again**, here in the headers, to
prove the request really came from you (and not another website tricking your
browser). It is the same value as the `JSESSIONID` cookie — but **without** the
quote marks this time.

> Quotes on the cookie value, no quotes on the header value. LinkedIn's rule.

### `x-restli-protocol-version: 2.0.0` — "use format version 2"

LinkedIn's service supports an old and a new way of formatting requests and
errors. This picks the new one. Always include it.

### `x-li-lang: en_US` — "answer in US English"

Otherwise job titles, month names, and some text can come back in another
language depending on whose profile it is. Keeps output consistent.

### `Accept: application/vnd.linkedin.normalized+json+2.1` — "reply as JSON, this style"

LinkedIn's "normalized" style spreads the data into one big flat list of items
linked by ID, which you then have to reassemble ("this person -> these jobs ->
this company"). It is awkward, but it is what LinkedIn's own app uses, so asking
for the same thing keeps us compatible. Turning that flat list into a clean
response schema is the next chunk of work on this project.

---

## Sending it + handling failures

```python
with httpx.Client(headers=headers, cookies=cookies, timeout=15.0) as client:
    resp = client.get(url, params=params)
```

`httpx` is an HTTP client library (like `requests`, slightly newer). This makes
a client that always attaches the headers and cookies, sends the GET, and gives
up after 15 seconds if LinkedIn does not answer.

Then the code checks the HTTP status code that came back:

| Status | Plain meaning | What to do |
| --- | --- | --- |
| `401` / `403` | "Who are you? Go away." | Cookies are expired or mismatched — get fresh `li_at` + `JSESSIONID` from the same browser session. Also check the `User-Agent`. |
| `404` | "No such person." | Wrong username, or the profile is private to your account. |
| `410` | "That thing is gone." | Your `decorationId` version was retired — use a newer number. |
| anything else non-2xx | generic failure | `resp.raise_for_status()` throws. |
| `200` | success | `resp.json()` returns the data as a Python dict. |

These are standard HTTP status codes (you have seen `404` before). The code just
translates each into a readable "here is what broke and how to fix it" message.

### Gap to close

When this runs on a **hosted server** (not your laptop), LinkedIn may reply with
**`429`** ("too many requests") or **`999`** ("you look like a bot"). That is a
*different* problem from expired cookies — it means "slow down / change the
server's IP", not "re-log-in". Add an explicit branch for it with its own
message. Right now it falls through to the generic `raise_for_status()`.

---

## TL;DR

It is one GET request.

- The **URL** says *which service*.
- The **parameters** say *who* and *how much detail*.
- The **cookies** say *I am logged in*.
- The **headers** say *treat me like the real app*.
- The rest is checking the reply and turning error codes into readable messages.
