# Solution Studio

A local-first workbench for Power Platform solution ZIPs. Upload an exported solution, inspect its
metadata, fix the usual deployment blockers, then download a rebuilt ZIP and a matching
`DeploymentSettings.json` — or connect to Power Platform to export and import without the manual
round-trip.

The editor runs entirely in the browser. There is no backend, database, or telemetry. Local editing
never uploads your solution bytes. The optional Power Platform connection uses delegated Microsoft
sign-in and talks directly to Microsoft APIs from your browser.

**Live app:** https://acharyanandusaji.github.io/solution-studio/

## What it does

- **Package inspection** — reads `solution.xml` and `customizations.xml`, the publisher, root
  components, ZIP entries, environment variables and connection references.
- **Version editing** — edit `major.minor.build.revision` directly, use one-click bump buttons, or
  apply a version from local download history.
- **Missing dependencies** — review every `<MissingDependency>` entry and optionally clear the list on
  download. The element is kept as an empty `<MissingDependencies />`, matching what Dataverse exports
  and expects; the original package is never modified.
- **Environment variables** — see defaults and current values, edit values, and write them back into
  `customizations.xml` or the modern `environmentvariabledefinitions/<name>/environmentvariablevalues.json`
  sidecar files. Managed exports are supported.
- **Connection references** — map logical references to target connection IDs. These IDs go into
  deployment settings, not into the solution ZIP.
- **Connection consolidation** — group references by connector and apply one shared connection ID
  (for example a service-principal connection) to an entire group. For true structural consolidation,
  pick one reference as the survivor and merge the other references on the same connector into it:
  the rebuilt ZIP removes the merged `<connectionreference>` nodes and their root components, and
  rewrites cloud flow definitions to use the surviving logical name. References on other connectors
  are never touched.
- **Deployment settings** — generate a PAC CLI-compatible `DeploymentSettings.json`, copy or download
  it, and import existing settings files.
- **Review before download** — a change set and pre-import health report gate the download.
- **Direct export and import** — optionally sign in with a Microsoft work account, discover your
  environments, export a solution into the workspace, edit it, choose a target environment and start
  the Dataverse import from the page. Progress and the import log are shown inline.
- **Extras** — ZIP explorer with text previews, raw XML editor with validation, CRC integrity check,
  local deployment profiles, version history, and a built-in sample solution.

## Safety model

The uploaded ZIP is kept in memory and never mutated. Structured edits live in React state and are
only applied when you build a new ZIP. Files other than `solution.xml`, `customizations.xml`,
environment variable value files and cloud flow definitions (`Workflows/*.json`) are copied into the
output archive unchanged.

Two deliberate limitations are surfaced in the UI:

- Changing `<Managed>` only changes the manifest flag. It is **not** a managed/unmanaged conversion.
  Real conversion happens by exporting or importing in Dataverse.
- Clearing the `<MissingDependencies>` list removes metadata, not the dependencies themselves. The
  required components must already exist in the target environment. The element itself is kept as
  `<MissingDependencies />` because every Dataverse export includes it and deleting the node can make
  import fail with a generic "Object reference not set to an instance of an object" error.

Connection reference merging only applies to references on the exact same connector (Dataverse and
its legacy variants are not interchangeable). Canvas apps (`.msapp`) are binary and cannot be
rewritten, so their connections must be verified manually after import.

## Getting started

Requirements: Node.js 20.19+ or 22.12+ and npm.

```bash
npm install
npm run dev
```

Open the URL Vite prints, then drag in a solution ZIP or choose **Try a sample**.

### Useful commands

```bash
npm run dev       # local development server
npm run build     # type-check and build to dist/
npm run preview   # serve the production build locally
npm run lint      # run oxlint
npm test          # run the XML/unit tests once
```

## Connecting to Power Platform

The cloud flow is optional. Without it, upload and download work exactly as before. To export and
import directly, register a single-page application in Microsoft Entra ID once per tenant.

### 1. Register the app

1. In the [Microsoft Entra admin center](https://entra.microsoft.com/), open **App registrations** and
   choose **New registration**.
2. Name it (for example `Solution Studio`) and choose the account types your organisation uses.
   **Accounts in any organizational directory** is the most flexible.
3. Under **Authentication → Single-page application**, add the redirect URI for the page you use:
   - GitHub Pages: `https://acharyanandusaji.github.io/solution-studio/`
   - Local development: the URL Vite prints, for example `http://localhost:5173/`
   The URI must match exactly, including the trailing slash.
4. Copy the **Application (client) ID**. This is not a secret and is safe to paste into the app.

### 2. Grant delegated permissions

Under **API permissions → Add a permission**, add:

| API | Permission | Type |
| --- | --- | --- |
| Dynamics CRM | `user_impersonation` | Delegated |
| Power Platform API (`8578e004-a5c6-46e7-913e-12f58912df43`) | `EnvironmentManagement.Environments.Read` | Delegated |
| Power Apps Service (`475226c6-020e-4fb2-8a90-7a972cbfc1d4`) | `user_impersonation` | Delegated (legacy fallback) |

The Power Platform API permission is used for environment discovery. The Power Apps Service
permission is optional and only needed by older registrations: if the current API fails, the app
retries with the legacy BAP endpoint. If the Power Platform API is not visible in the permission
picker, create its service principal first (see the Microsoft Learn authentication article) or use
only the legacy permission and paste environment URLs manually.

Then choose **Grant admin consent**. Without consent, sign-in or token acquisition fails with a
consent error. The app never requests application permissions and holds no client secret.

### 3. Use it

1. Open the **Power Platform** tab (or **Connect to Power Platform** on the upload screen).
2. Paste the client ID, keep the tenant as `organizations` (or enter your tenant ID/domain) and save.
3. Sign in with your Microsoft work account. The app discovers environments through the current Power
   Platform API and falls back to the legacy admin API; you can also paste any Dataverse URL manually.
4. Pick the source environment, load its solutions, and choose **Export & edit**. The exported ZIP is
   loaded into the workspace like an uploaded file.
5. Edit version, managed flag, environment variables, connections and dependencies as usual.
6. In the **Power Platform** tab, choose the target environment, review the import options and confirm.
   The app rebuilds the ZIP in memory, calls `ImportSolutionAsync`, polls the async operation and shows
   the result plus the import log when the import fails.

### Security model

- Authorization code flow with PKCE through MSAL; no client secret exists in the static bundle.
- Access tokens are cached in `sessionStorage` for the current tab only. Signing out clears the cache;
  closing the tab discards it.
- Only the client ID and tenant are persisted, in `localStorage`.
- Requests go directly from your browser to `login.microsoftonline.com`,
  `api.powerplatform.com` (or `api.bap.microsoft.com` on the legacy fallback) and your Dataverse org.
  There is no proxy or backend.
- The app can only do what the signed-in user is already allowed to do. Admin consent grants the
  permission to request a token, not extra Dataverse privileges.

### Cloud limitations

- Environment discovery needs an account that can read the Power Platform environment list. If the
  list is empty or discovery is denied, paste the environment URL directly.
- Import is destructive. The confirmation dialog and acknowledgment are mandatory, and the app blocks
  the import when the pre-import health report has failed checks. Keep a backup solution in the target.
- Connection references are sent as `ComponentParameters` only when **Bind connection references** is
  enabled and the deployment settings contain a connection ID. Environment variable values travel in
  the rebuilt ZIP.
- Canvas app (`.msapp`) binaries still cannot be rewritten, so their embedded connections must be
  verified after import. This applies to both the manual and cloud flows.
- `ImportSolutionAsync` continues server-side even if you close the tab. Check solution history in the
  Power Apps maker portal if you lose the progress view.

## Deploying to GitHub Pages (free)

The repo ships with `.github/workflows/deploy.yml`. Vite is configured with a relative base, so the
same build works at `https://<user>.github.io/<repo>/` or on a custom domain.

1. Create a new repository on GitHub.
2. Push this project to the `main` branch:

   ```bash
   git init -b main
   git add .
   git commit -m "Build Solution Studio"
   git remote add origin https://github.com/<user>/<repo>.git
   git push -u origin main
   ```

3. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
4. The workflow builds and deploys on every push to `main`. The site URL appears in the workflow run
   and under **Settings → Pages**.

Any static host works too: run `npm run build` and publish the `dist/` folder (Netlify, Cloudflare
Pages, Azure Static Web Apps, an internal web server, and so on).

## How the rebuild works

1. Start from the original XML or an applied raw XML override.
2. Write the target version and managed flag into `solution.xml`.
3. Clear the `<MissingDependencies>` list when requested, keeping an empty `<MissingDependencies />`.
4. Write edited environment variable values into each `environmentvariablevalues.json` sidecar, or
   into `customizations.xml` when no sidecar exists.
5. Validate the edited XML documents.
6. Copy every other ZIP entry into a new archive and download it as
   `<uniqueName>_<version>_<managed|unmanaged>.zip`.

`DeploymentSettings.json` is generated separately from the same in-memory state:

```json
{
  "EnvironmentVariables": [{ "SchemaName": "con_ApiBaseUrl", "Value": "https://api.example" }],
  "ConnectionReferences": [
    {
      "LogicalName": "con_DataverseReference",
      "ConnectionId": "00000000-0000-0000-0000-000000000000",
      "ConnectorId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps"
    }
  ]
}
```

Typical import:

```bash
pac solution import --path Contoso.SampleSolution_1.0.0.43_unmanaged.zip \
  --settings Contoso.SampleSolution.deploymentSettings.json
```

## Local data

Version history, deployment profiles and the Power Platform app configuration use `localStorage`,
keyed by solution unique name (or a single cloud config entry). They never leave the browser and can
be cleared from the UI. Cloud access tokens use `sessionStorage` and never leave the browser tab. No
solution content is persisted anywhere else.

## Tech stack

React 19, TypeScript, Vite, JSZip, fast-xml-parser, MSAL Browser and lucide-react. Styling is
hand-written CSS with no UI framework.

## License

MIT. See [LICENSE](LICENSE).
