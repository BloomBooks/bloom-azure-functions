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
`npm install --production` and `tsc` on the server. When a new instance starts, the host loads every
function's script, which pulled in about 2,000 modules, each read file by file from the app's Azure
Files share. That makes Node cold starts on the Consumption plan slow.

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
4. Run by hand on `master` (**Actions → Build and deploy → Run workflow**) it can deploy to staging
   or, after approval in the `production` environment, straight to production. It never deploys
   another branch.

With `WEBSITE_RUN_FROM_PACKAGE=1`, Azure stores the zip under `d:\home\data\SitePackages` and mounts
it as `wwwroot`. Instances read one zip instead of thousands of small files. **`wwwroot` becomes
read-only**: you can no longer edit code in the portal (**Code + Test** still runs functions), and
the app must not write files under its own folder (nothing in this repo does; use `%TEMP%` if
something ever needs to).

## One-time setup

### Azure

1. **Stop the old deployment.** In the staging slot's Deployment Center, choose **Disconnect** (or
   `az functionapp deployment source delete -g <resource-group> -n bloom-functions --slot staging`).
   Do this just before merging this change. Otherwise Kudu, finding no `deploy.cmd`, falls back to
   its default Node build, which doesn't run `tsc`: staging ends up with no `dist` and none of the
   functions load. Also check that the production slot has no Deployment Center source.
2. **App settings, on the staging slot only** (**Configuration → Application settings**, or
   `az functionapp config appsettings set -g <resource-group> -n bloom-functions --slot staging --settings WEBSITE_RUN_FROM_PACKAGE=1`):
   - `WEBSITE_RUN_FROM_PACKAGE` = `1`. Do **not** make it a deployment slot setting. Don't set it on
     production by hand: production has no package until the first swap, and the swap carries the
     setting there along with the package. (The deploy action may also set it; setting it first
     avoids an extra restart.)
   - Remove `SCM_DO_BUILD_DURING_DEPLOYMENT` if it is present.
   - Leave `WEBSITE_NODE_DEFAULT_VERSION` (`~20`), `FUNCTIONS_EXTENSION_VERSION` (`~4`),
     `WEBSITE_CONTENTAZUREFILECONNECTIONSTRING` and `WEBSITE_CONTENTSHARE` as they are.
3. **An identity for GitHub** (OIDC, no stored password): create an app registration (or user-assigned
   managed identity) and give it the **Website Contributor** role on `bloom-functions` (this covers
   its slots). Add two federated credentials for GitHub Actions, entity type *Environment*:
   - `repo:BloomBooks/bloom-azure-functions:environment:staging`
   - `repo:BloomBooks/bloom-azure-functions:environment:production`

### GitHub

1. **Settings → Environments**: create `staging` and `production`. On both, set **Deployment branches
   and tags** to `master` only. On `production`, add required reviewers.
2. Repository (or environment) secrets:
   - `AZURE_CLIENT_ID` — the app registration's (or managed identity's) client ID
   - `AZURE_TENANT_ID`
   - `AZURE_SUBSCRIPTION_ID`

If OIDC is not possible, a publish profile works instead: download it for each slot, store it as
`AZURE_FUNCTIONAPP_PUBLISH_PROFILE_STAGING` / `..._PRODUCTION`, drop the `azure/login` steps and pass
`publish-profile:` to `Azure/functions-action`. That needs **SCM Basic Auth** turned on for the app.

## Cutting over

1. Do the one-time setup above.
2. Disconnect the staging Deployment Center and merge this change. The push runs the workflow.
3. Check staging (see "Verifying a deploy"). **Don't swap until this passes.** Until then, staging
   still holds the last Kudu build.
4. Swap, at a quiet time, with someone watching production: try `/v1/social`, a `/v1/books`
   request, and a Durable orchestration end to end (an upload, checking `/v1/status`). This is the
   first time production runs code built by CI rather than by Kudu. Production now runs from the
   package.
5. Right after that swap, set `WEBSITE_RUN_FROM_PACKAGE=1` on the staging slot again. The swap moved
   the setting to production with the package, and staging is now the old production site, without
   it. Skip this and the next deploy to staging is extracted into `wwwroot` as plain files, and the
   swap after that quietly puts a non-package build into production. From then on both slots have
   the setting and it swaps freely.
6. Once it has been stable for a while, delete the old Kudu-built files in `d:\home\site\wwwroot`
   on both slots (Kudu console). They are hidden under the package, but would reappear if
   `WEBSITE_RUN_FROM_PACKAGE` were ever removed.

## Normal deploy

Merge to `master`. The workflow deploys to staging. Check staging (see "Verifying a deploy"), then
swap.

## Staging and swapping

- Portal: **bloom-functions → Deployment slots → Swap**, source `staging`, target `production`.
- CLI: `az functionapp deployment slot swap -g <resource-group> -n bloom-functions --slot staging --target-slot production`

The package swaps with the slot. After a swap, staging holds what used to be in production.

### Slot settings

`host.json` takes the Durable Functions task hub name from the `DurableTaskHubName` app setting. Each
slot has its own value (`TaskHub` in production, `TaskHubStaging` in staging), marked as a
**deployment slot setting**, so it stays with the slot on a swap
and staging and production never share orchestrations. Keep it that way when adding or copying
settings. This change does not touch it.

## Rolling back

- **Just swapped and it's bad:** swap again. Staging still has the previous production build, as
  long as nothing has been pushed to `master` since. This doesn't apply after a direct production
  deploy: then staging holds whatever was last deployed there, not the previous production build.
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
func azure functionapp publish bloom-functions --slot staging --javascript
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
- In Kudu (**Advanced Tools → Debug console**) for the slot you deployed to or swapped into,
  `d:\home\data\SitePackages\packagename.txt` names the new zip, and the slot's app settings include
  `WEBSITE_RUN_FROM_PACKAGE=1`.

### Measuring cold start (before and after)

In Application Insights → **Logs**. Run these for two weeks before the switch and again after.

Both are approximate: Application Insights samples `traces` and `requests` by default, and we haven't
checked how the two slots show up in `cloud_RoleName`. If both show `bloom-functions`, staging's
instances (timers start them too) are mixed in.

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

That excludes loading our Node code, which is where this change should help most. This one looks
at each new instance's first request: how long after the instance's first log line it ran, and how
long it took. Neither number includes time a caller waited before the instance was ready, so it
undercounts what callers feel.

```kusto
let since = ago(14d);
let instanceStarts = traces
    | where timestamp > since
    | summarize instanceStart = min(timestamp) by cloud_RoleInstance
    // Drop instances that may have started before the window.
    | where instanceStart > since + 1d;
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

- **Other settings that must stick to a slot.** `DurableTaskHubName` already is one (see "Slot
  settings" below). Anything else that differs between staging and production must be too. Also: the timer
  functions (dailyTimer, bookCleanup, contentfulToCrowdin) run in the staging slot as well unless
  disabled there with sticky `AzureWebJobs.<name>.Disabled = true` settings.
- **Tests in CI are partial.** Most suites call the real Parse server, S3 or Google Sheets and need
  secrets, so `test:ci` skips them; only `books/utils` and `opds/bookEntry` run. `books/parseAdapters.test.ts` is also skipped because three of its tests
  already fail on `master`; it should be fixed and put back.
- **Not tried against Azure.** The workflow, `Azure/functions-action` with OIDC on a Windows
  Consumption slot, and the KQL queries have not been run. The build and packaging steps were tried
  locally.
- **`googleapis` is loaded on first use.** It was 830 of the roughly 2,000 modules every instance
  loaded at startup, though only `subscriptions` uses it. It is now loaded on that function's first
  call, so startup loads about 1,100 modules, and the first `subscriptionInfo` call on each instance
  is slower instead. It is still 115 MB of the package; `@googleapis/sheets` would shrink that.
- **Run-from-package may not be the whole story** behind the 2026-10-27 stall. Loading files from the
  share usually costs seconds to tens of seconds, not minutes. Other suspects: throttling on the
  storage account behind the share (the zip is still read from it, and Durable Functions may use the
  same account), an extension bundle download on cold start (`host.json` allows any 4.x), and Durable
  Functions acquiring leases at host start. Check the host traces and the storage account's metrics
  for that day, and use the queries above to see whether start times improve.
- **Deploys restart staging.** Every push to `master` restarts staging, interrupting any Durable
  activities or timer runs there; Durable replays them. Orchestrator code must also stay
  replay-compatible across a swap, since production keeps its task hub history. Both were already
  true with Kudu.
- **Node 20** reached end of life on 2026-04-30. Moving to Node 22 is a separate change.
