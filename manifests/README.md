# winget manifests

Seed manifests for the Windows installer, laid out the way
[microsoft/winget-pkgs](https://github.com/microsoft/winget-pkgs) expects them:

```
manifests/s/Shido275/Flowstate/1.0.0/
  Shido275.Flowstate.yaml               # version
  Shido275.Flowstate.installer.yaml     # installer URL, type, SHA-256
  Shido275.Flowstate.locale.en-US.yaml  # listing text
```

## Before you submit 1.0.0

Every release asset has this shape (electron-builder's `artifactName` plus the tag):

```
https://github.com/<owner>/<repo>/releases/download/v<version>/Flowstate-Setup-<version>.exe
```

For 1.0.0 that is
`https://github.com/<owner>/<repo>/releases/download/v1.0.0/Flowstate-Setup-1.0.0.exe`.

1. **The repository URLs** (`PackageUrl`, `PublisherUrl`, `PublisherSupportUrl`,
   `LicenseUrl`, `InstallerUrl`) already point at
   `https://github.com/shido275/flowstate`. If the repository ever moves, rewrite
   them in one go:

   ```bash
   sed -i 's|shido275/flowstate|<owner>/<repo>|g' manifests/s/Shido275/Flowstate/1.0.0/*.yaml
   ```

2. **`REPLACE_WITH_SHA256_FROM_THE_1_0_0_RELEASE`** — the hash of the published
   `Flowstate-Setup-1.0.0.exe`, from the release's `SHA256SUMS.txt` asset (the
   Release run also prints it into its job summary):

   ```powershell
   Get-FileHash .\Flowstate-Setup-1.0.0.exe -Algorithm SHA256
   ```

The publisher segment `Shido275` is the GitHub account name, not a company. To
ship under a different publisher, change `PackageIdentifier` in all three files,
`Publisher` in the locale file, and the folder to
`manifests/<first letter>/<publisher>/<package>/<version>/`.

## First submission — by hand, once

`wingetcreate update` can only bump a package that already exists, so 1.0.0 goes
in as an ordinary pull request:

```powershell
winget validate --manifest manifests/s/Shido275/Flowstate/1.0.0
wingetcreate submit manifests/s/Shido275/Flowstate/1.0.0 --token <PAT with public_repo>
```

Or fork `microsoft/winget-pkgs` by hand and copy the `1.0.0` folder into
`manifests/s/Shido275/Flowstate/`. A moderator reviews it; expect a few days.

## Every release after that

The `winget` job in `.github/workflows/release.yml` runs, on each `v*` tag:

```powershell
wingetcreate update Shido275.Flowstate --version <package.json version> `
  --urls <release asset URL> --submit --token $env:WINGET_TOKEN
```

It is gated behind the repository variable **`WINGET_SUBMIT`** — set it to
`true` after the 1.0.0 PR is merged, otherwise every release would fail trying to
update a package that does not exist upstream yet.

The job downloads the published asset and compares it against the release's
`SHA256SUMS.txt` before submitting. That check is what ties the PR to the bytes
you built: `wingetcreate` has no `--sha256` option and hashes the download itself.

## One-time setup

- Secret `WINGET_TOKEN` (Settings → Secrets and variables → Actions): a *classic*
  personal access token with the `public_repo` scope, on the account that should
  own the PR. `GITHUB_TOKEN` cannot open a PR in `microsoft/winget-pkgs`.
- Variable `WINGET_SUBMIT` = `true`, once 1.0.0 is live in the repository.
- The repository must be public: winget downloads the installer from the release URL.
