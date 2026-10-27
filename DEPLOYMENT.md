# Deployment

> **Status: proposal.** This describes deploying `bloom-functions` with run-from-package from a
> GitHub Actions workflow. Until the one-time setup below is done, the app still deploys the old
> way (Kudu builds the source on the server).
>
> This app is being replaced, function by function, by Supabase Edge Functions; see
> [SUPABASE-MIGRATION.md](SUPABASE-MIGRATION.md). Don't invest much more in this setup than it takes
> to keep it fast and safe.

## How it worked before

`.deployment` told Kudu to run `deploy.cmd`, which copied the source into `wwwroot`, ran
`npm install --production` and `tsc` on the server. Each new instance then loaded `dist` and about
8,000 `node_modules` files one by one from the app's Azure Files share, which makes Node cold starts
on the Consumption plan slow.

The staging slot's Deployment Center was connected to GitHub, following `master`, so every push to
`master` made Kudu build and deploy to staging. Production got the code by swapping staging into
production in the portal. The new workflow keeps that mapping.

## How it works now

[.github/workflows/build-and-deploy.yml](.github/workflows/build-and-deploy.yml):

1. On every pull request and push to `master`: `npm ci`, lint, the tests that need no secrets
   (`npm run test:ci`), `tsc`, `npm prune --omit=dev`.
2. Zips exactly what the Functions host needs: `host.json`, `package.json`, each function folder's
   `function.json`, `dist`, and production `node_modules`. The zip (about 21 MB) is kept as a workflow
   artifact for 90 days.
3. On a push to `master`, deploys the zip to the **staging** slot. Production gets it by a slot swap,
   as before.
4. Run by hand (**Actions → Build and deploy → Run workflow**) it can deploy to staging or, after
   approval in the `production` environment, straight to production.

With `WEBSITE_RUN_FROM_PACKAGE=1`, Azure stores the zip under `d:\home\data\SitePackages` and mounts
it as `wwwroot`. Instances read one zip instead of thousands of small files. **`wwwroot` becomes
read-only**: you can no longer edit code in the portal (**Code + Test** still runs functions), and
the app must not write files under its own folder (nothing in this repo does; use `%TEMP%` if
something ever needs to).

## One-time setup

### Azure

1. **Stop the old deployment.** In the staging slot's Deployment Center, choose **Disconnect** (or
   `az functionapp deployment source delete -g <resource-group> -n bloom-functions --slot staging`).
   Otherwise the next push to `master` makes Kudu try to build with a `deploy.cmd` that no longer
   exists. Do this just before merging this change, so staging never gets both deploys.
2. **App settings, on both slots** (**Configuration → Application settings**, or `az functionapp config appsettings set ... --settings WEBSITE_RUN_FROM_PACKAGE=1`, with `--slot staging` for staging):
   - `WEBSITE_RUN_FROM_PACKAGE` = `1`. Same value on both slots; it does not need to be a
     deployment-slot ("sticky") setting. The deploy action may set it too; setting it ourselves keeps
     it visible and documented.
   - Remove `SCM_DO_BUILD_DURING_DEPLOYMENT` if it is present.
   - Leave `WEBSITE_NODE_DEFAULT_VERSION` (`~20`), `FUNCTIONS_EXTENSION_VERSION` (`~4`),
     `WEBSITE_CONTENTAZUREFILECONNECTIONSTRING` and `WEBSITE_CONTENTSHARE` as they are.
3. **An identity for GitHub** (OIDC, no stored password): create an app registration (or user-assigned
   managed identity) and give it the **Website Contributor** role on `bloom-functions` (this covers
   its slots). Add two federated credentials for GitHub Actions, entity type *Environment*:
   - `repo:BloomBooks/bloom-azure-functions:environment:staging`
   - `repo:BloomBooks/bloom-azure-functions:environment:production`

### GitHub

1. **Settings → Environments**: create `staging` and `production`. On `production`, add required
   reviewers.
2. Repository (or environment) secrets:
   - `AZURE_CLIENT_ID` — the app registration's (or managed identity's) client ID
   - `AZURE_TENANT_ID`
   - `AZURE_SUBSCRIPTION_ID`

If OIDC is not possible, a publish profile works instead: download it for each slot, store it as
`AZURE_FUNCTIONAPP_PUBLISH_PROFILE_STAGING` / `..._PRODUCTION`, drop the `azure/login` steps and pass
`publish-profile:` to `Azure/functions-action`. That needs **SCM Basic Auth** turned on for the app.

## Normal deploy

Merge to `master`. The workflow deploys to staging. Check staging (see "Verifying a deploy"), then
swap.

## Staging and swapping

- Portal: **bloom-functions → Deployment slots → Swap**, source `staging`, target `production`.
- CLI: `az functionapp deployment slot swap -g <resource-group> -n bloom-functions --slot staging --target-slot production`

The package swaps with the slot. After a swap, staging holds what used to be in production.

## Rolling back

- **Just swapped and it's bad:** swap again. Staging still has the previous production build.
- **Older build:** open that build's workflow run and re-run its deploy job (GitHub allows re-runs for
  30 days), or download its artifact and deploy it by hand (below). Then swap if you deployed to
  staging.

## Deploying by hand

From a build artifact (preferred, it's exactly what CI built and tested): download
`bloom-functions-<sha>` from the workflow run, unzip it once to get `bloom-functions-<sha>.zip`, then

```
az login
az functionapp deployment source config-zip -g <resource-group> -n bloom-functions --slot staging --src bloom-functions-<sha>.zip
```

From your own checkout, with [Core Tools v4](https://learn.microsoft.com/azure/azure-functions/functions-run-local):

```
npm ci
npm run build
npm prune --omit=dev
func azure functionapp publish bloom-functions --slot staging
npm ci
```

`func` zips the folder minus what `.funcignore` excludes. Don't use the VS Code "Deploy to Function
App" command here; it would upload dev dependencies. Don't build the zip with PowerShell's
`Compress-Archive`; it fails on long `node_modules` paths.

## Verifying a deploy

- The workflow run is green and **Deployment Center → Logs** on the slot shows the new deployment.
- **Functions** lists all 12 functions (bookCleanup, books, contentfulToCrowdin, dailyTimer, fs,
  longRunningActionOrchestrator, longRunningActions, opds, social, stats, status, subscriptions).
- A request that needs no database works, e.g.
  `https://<slot-host>/v1/social?link=https://bloomlibrary.org&title=test` returns HTML.
- In Kudu (**Advanced Tools → Debug console**), `d:\home\data\SitePackages\packagename.txt` names the
  new zip.

### Measuring cold start (before and after)

In Application Insights → **Logs**. Run these for two weeks before the switch and again after.

Host start time, as the host logs it:

```kusto
traces
| where timestamp > ago(14d)
| where message startswith "Host started ("
| extend hostStartMs = toint(extract(@"Host started \((\d+)ms\)", 1, message))
| summarize starts = count(), p50 = percentile(hostStartMs, 50), p95 = percentile(hostStartMs, 95), max = max(hostStartMs)
    by cloud_RoleName, bin(timestamp, 1d)
| order by timestamp asc
```

That excludes loading our Node code, which is where run-from-package should help most. This one
measures what callers feel: the first request on each new instance.

```kusto
let since = ago(14d);
let instanceStarts = traces
    | where timestamp > since
    | summarize instanceStart = min(timestamp) by cloud_RoleInstance;
requests
| where timestamp > since
| summarize arg_min(timestamp, name, duration) by cloud_RoleInstance
| join kind=inner instanceStarts on cloud_RoleInstance
| extend secondsFromInstanceStart = datetime_diff('second', timestamp, instanceStart)
| summarize instances = count(),
    p50FirstRequestMs = percentile(duration, 50), p95FirstRequestMs = percentile(duration, 95),
    p95SecondsFromInstanceStart = percentile(secondsFromInstanceStart, 95)
    by bin(instanceStart, 1d)
| order by instanceStart asc
```

## Risks and open questions

- **Durable Functions task hub per slot.** `host.json` uses `%DurableTaskHubName%`. Each slot must
  have its own value, marked as a deployment-slot setting, or staging and production share
  orchestrations. Check this before the first swap; it is true today too, but worth confirming.
- **Other settings that must stick to a slot**: anything that differs between staging and production
  (e.g. storage connection, database credentials if staging uses different ones). Also: the timer
  functions (dailyTimer, bookCleanup, contentfulToCrowdin) run in the staging slot as well unless
  disabled there with sticky `AzureWebJobs.<name>.Disabled = true` settings.
- **Tests in CI are partial.** Most suites call the real Parse server and S3 and need secrets, so
  `test:ci` skips them. `books/parseAdapters.test.ts` is also skipped because three of its tests
  already fail on `master`; it should be fixed and put back.
- **Not tried against Azure.** The workflow, `Azure/functions-action` with OIDC on a Windows
  Consumption slot, and the KQL queries have not been run. The build and packaging steps were tried
  locally.
- **Package size.** Production `node_modules` is about 150 MB, 115 MB of it `googleapis` (used only by
  subscriptions). Switching to `@googleapis/sheets` would shrink the package and cold start further.
- **Run-from-package may not be the whole story** behind the 2026-10-27 stall. Use the queries above
  to see whether instance start times actually improve.
