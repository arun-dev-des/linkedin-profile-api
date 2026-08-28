# Verifying the endpoint against the LinkedIn Android app

This document shows how to independently confirm that the API call in
[`fetch_profile.py`](../fetch_profile.py) targets a **real, current LinkedIn
endpoint** — by finding the same string constants inside LinkedIn's official
Android app.

Nothing here requires a phone, an emulator, or running the app. It is pure
static inspection of the app package (APK).

---

## What we are proving

`fetch_profile.py` calls:

```
GET /voyager/api/identity/dash/profiles
    ?q=memberIdentity
    &decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-107
```

If LinkedIn's own app contains the strings `identityDashProfilesByMemberIdentity`
and `com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-<n>`,
then this is a first-party endpoint and calling pattern — not something invented
or scraped from a third party.

---

## Prerequisites (macOS)

| Tool | Already installed? |
| --- | --- |
| `unzip` | Yes, ships with macOS |
| `strings` | Ships with the Xcode command-line tools. If missing, run `xcode-select --install` and retry. |
| `grep` | Yes, ships with macOS |

---

## Steps

### 1. Get the APK

Download the LinkedIn Android app package from a mirror such as
[APKMirror](https://www.apkmirror.com/apk/linkedin-corporation/linkedin/).
Any recent version works. This project was verified against:

```
com.linkedin.android  version 4.1.1239  (build 214700)
```

Put the `.apk` file in the project root. Its filename will look like:

```
com.linkedin.android_4.1.1239-214700_minAPI28(...)_apkmirror.com.apk
```

> The APK is git-ignored (`*.apk` in `.gitignore`) — it is a large third-party
> binary and should not be committed.

### 2. Unpack it

An APK is just a ZIP archive.

```bash
cd ~/Downloads/tross-challenge
unzip -o com.linkedin.android*.apk -d apk
```

- `-o` overwrite without prompting
- `com.linkedin.android*.apk` a wildcard so you do not have to type the full
  messy filename
- `-d apk` extract into a new `apk/` directory

The compiled app code lands in `apk/classes.dex`, `apk/classes2.dex`, …
(multiple files because the app is large).

### 3. Search the compiled code for the endpoint strings

```bash
strings apk/classes*.dex | grep -E \
  'FullProfileWithEntities|FullProfileByMemberIdentity|identityDashProfilesByMemberIdentity|deco\.identity\.profile'
```

- `strings apk/classes*.dex` extracts every run of readable text from the
  `.dex` files
- `|` pipes that text into the next command
- `grep -E '...|...'` prints only lines containing one of these phrases

---

## Expected output

```
com.linkedin.voyager.dash.deco.identity.profile.FullProfileSkill-3
com.linkedin.voyager.dash.deco.identity.profile.AudienceBuilderForm-77
com.linkedin.voyager.dash.deco.identity.profile.ConnectionsUsingProductProfiles-1
com.linkedin.voyager.dash.deco.identity.profile.ProfileVersionTag-3
com.linkedin.voyager.dash.deco.identity.profile.TopCardComplete-142
com.linkedin.voyager.dash.deco.identity.profile.EmploymentType-4
com.linkedin.voyager.dash.deco.identity.profile.MessagingVideoConferenceParticipantProfile-2
com.linkedin.voyager.dash.deco.identity.profile.ProfileWithStudentAndPosition-5
identityDashProfilesByMemberIdentity
com.linkedin.voyager.dash.deco.identity.profile.LocalizedProfileWithEntities-105
com.linkedin.voyager.dash.deco.identity.profile.TopCardCore-43
FullProfileByMemberIdentity
FullProfileWithEntitiesV2
com.linkedin.voyager.dash.deco.identity.profile.BrowsemapProfile-62
com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-107
identityDashProfilesByMemberIdentity
```

(Lines and ordering vary by app version. Some strings appear more than once
because they are referenced from multiple `.dex` files.)

### The two lines that matter

| String | Confirms |
| --- | --- |
| `identityDashProfilesByMemberIdentity` | The finder `fetch_profile.py` selects with `q=memberIdentity` |
| `com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-107` | The exact decoration `fetch_profile.py` sends (default `DECORATION_ID`) |

The other lines (`FullProfileSkill-3`, `TopCardComplete-142`,
`LocalizedProfileWithEntities-105`, `BrowsemapProfile-62`, `TopCardCore-43`,
`FullProfileWithEntitiesV2`, …) confirm that
`com.linkedin.voyager.dash.deco.identity.profile.*` is a whole live family of
projections — `FullProfileWithEntities` is not a one-off.

---

## Reading the raw output

If you run `strings` without cleaning the output, some lines start with a stray
character:

```
Kcom.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-107
$identityDashProfilesByMemberIdentity
```

That leading `K` / `$` is **not part of the string**. `.dex` files store each
string with a length byte in front of it, and `strings` prints that byte as a
character. `K` = 75, `$` = 36 — the byte-length of the string that follows.
Ignore it; the real value starts at `com.linkedin...` / `identityDash...`.

---

## When `-107` stops working

LinkedIn retires old decoration versions. When `fetch_profile.py` starts getting
`HTTP 410`, download a newer APK and re-run:

```bash
strings apk/classes*.dex | grep -oE \
  'com\.linkedin\.voyager\.dash\.deco\.identity\.profile\.FullProfileWithEntities-[0-9]+'
```

Take the highest number and set it:

```bash
export DECORATION_ID="com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-<newnumber>"
```

---

## Optional: dig further

```bash
# Every "identityDashProfiles*" finder / query the app knows about
strings apk/classes*.dex | grep -oE '[a-zA-Z]*[Ii]dentityDashProfiles[a-zA-Z]*' | sort -u

# The persisted GraphQL query IDs for the same resource
strings apk/classes*.dex | grep -oE 'voyagerIdentityDashProfiles\.[0-9a-f]{16,}' | sort -u

# Confirm the Voyager base path is present
strings apk/classes*.dex | grep -oE 'voyager/api/[a-zA-Z/]*' | sort -u | head
```
