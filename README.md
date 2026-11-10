# Solution Studio

A local-first workbench for Power Platform solution ZIPs. Upload an exported solution, inspect its
metadata, fix the usual deployment blockers, then download a rebuilt ZIP and a matching
`DeploymentSettings.json`.

Everything runs in the browser. There is no backend, database, account, or telemetry. Your solution
bytes never leave your machine.

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

Version history and deployment profiles use `localStorage`, keyed by solution unique name. They never
leave the browser and can be cleared from the UI. No solution content is persisted anywhere else.

## Tech stack

React 19, TypeScript, Vite, JSZip, fast-xml-parser and lucide-react. Styling is hand-written CSS with
no UI framework.

## License

MIT. See [LICENSE](LICENSE).
