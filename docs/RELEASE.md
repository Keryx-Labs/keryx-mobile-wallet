# Releasing the Keryx Mobile Wallet

The source repo is **private**; public downloads live in a separate **public** repo
(`Keryx-Labs/keryx-mobile-wallet-releases`). Pushing a `v*` tag here builds a **signed**
Android APK and publishes it as a GitHub Release in that public repo — the same shape as the
`keryx-node` / miner releases. The pipeline is `.github/workflows/release.yml`.

## One-time setup

### 1. Create the release keystore (do this once, keep it forever)

The keystore is the app's permanent identity. **If you lose it you can never ship an update that
installs over the current app** — users would have to uninstall/reinstall. Generate it locally and
back it up somewhere safe (password manager + offline copy):

```bash
keytool -genkeypair -v \
  -keystore keryx-release.jks \
  -alias keryx \
  -keyalg RSA -keysize 2048 -validity 10000
```

`keytool` will ask you to choose a keystore password and a key password — pick strong ones and store
them in a password manager. **Never commit the `.jks` or the passwords** (already git-ignored).

### 2. Add the secrets to the *source* repo (Settings → Secrets and variables → Actions)

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 keryx-release.jks` (Windows: `certutil -encodehex -f keryx-release.jks out.b64 0x40000001` or `[Convert]::ToBase64String([IO.File]::ReadAllBytes("keryx-release.jks"))`) |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password |
| `ANDROID_KEY_ALIAS` | `keryx` (the alias above) |
| `ANDROID_KEY_PASSWORD` | the key password |
| `RELEASES_TOKEN` | a Personal Access Token with **contents: read & write** on `Keryx-Labs/keryx-mobile-wallet-releases` |

For `RELEASES_TOKEN`, a fine-grained PAT scoped to just the releases repo is ideal (Repository access →
only that repo; Permissions → Contents: Read and write).

### 3. Create the public releases repo

Slash (org admin) creates **`Keryx-Labs/keryx-mobile-wallet-releases`** as **public**, and initializes
it **with a README** (that first commit is required so the release tag has something to point at).

## Cutting a release

From the private source repo:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The workflow then: builds the web app → `cap sync` → assembles a **signed** `assembleRelease` APK
(versionName from the tag, an increasing versionCode) → renames it `keryx-wallet-v1.0.0.apk` →
writes a `.sha256` → and publishes a Release with both files to the public releases repo.

Use the `CHANGELOG.md` from this repo as the human-readable notes to post alongside / in the Discord
announcement.

## Building a signed APK locally (optional)

Create a git-ignored `keystore.properties` at the repo root:

```properties
storeFile=/absolute/path/to/keryx-release.jks
storePassword=...
keyAlias=keryx
keyPassword=...
```

Then `cd android && ./gradlew assembleRelease` → `android/app/build/outputs/apk/release/app-release.apk`.
Without a keystore (or the env vars), `assembleRelease` produces an *unsigned* APK and debug builds are
unaffected.

## iOS

iOS can't be sideloaded from a downloadable file the way an APK can. Distribution needs an **Apple
Developer account ($99/yr)** and either **TestFlight** (public beta link — best for a first public
test) or the App Store (review). Ship the Android APK now; add a TestFlight link when the Apple
account is set up. Cloud build steps are in [`IOS_BUILD.md`](./IOS_BUILD.md).
