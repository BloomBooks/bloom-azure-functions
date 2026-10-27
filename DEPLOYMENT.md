# Deployment

How `bloom-functions` is built and deployed. For the one-time switch from Kudu builds to this setup,
see [RUN-FROM-PACKAGE-CUTOVER.md](RUN-FROM-PACKAGE-CUTOVER.md); until that is done, the app still
deploys the old way.

This app is being replaced, function by function, by Supabase Edge Functions; see
[SUPABASE-MIGRATION.md](SUPABASE-MIGRATION.md). Don't invest much more in this setup than it takes to
keep it fast and safe.

## How it works

The app is a Windows Function App on the Consumption plan, running Node 22, with a `staging` slot.
[.github/workflows/build-and-deploy.yml](.github/workflows/build-and-deploy.yml):

1. On every pull request and push to `master`: `npm ci`, lint, the tests that need no secrets
   (`npm run test:ci`), `tsc`, `npm prune --omit=dev`.
2. Zips exactly what the Functions host needs: `host.json`, `package.json`, each function folder's
   `function.json`, `dist`, and production `node_modules`. The zip (about 21 MB) is kept as a workflow
   artifact for 90 days.
3. On a push to `master`, deploys the zip to the **staging** slot with `Azure/functions-action`.
   Production gets it by a slot swap.
4. Run by hand on `master` (**Actions → Build and deploy → Run workflow**) it can deploy to staging
   or, after approval in the `production` environment, straight to production. It never deploys
   another branch.

Both slots have `WEBSITE_RUN_FROM_PACKAGE=1`. Azure keeps the zip in `d:\home\data\SitePackages` and
mounts it as `wwwroot`, so an instance reads one zip instead of thousands of small files. This is
Microsoft's recommended deployment for Windows Consumption, and it reduces Node cold starts.
**`wwwroot` is read-only**: you can't edit code in the portal (**Code + Test** still runs functions),
and the app must not write files under its own folder (nothing does; use `%TEMP%` if something ever
needs to).

The workflow builds on Linux, while Microsoft's samples use `windows-latest` for Windows apps. That's
fine as long as no dependency has native or OS-specific code (none does today). If one is ever added,
switch the build job to `windows-latest`.

## Settings and credentials

App settings that matter for deployment:

- `WEBSITE_RUN_FROM_PACKAGE` = `1` on both slots. **Not** a deployment slot setting, so it swaps with
  the code. Nothing sets it for you: neither the workflow's deploy (with a publish profile) nor
  `az ... config-zip` does. If a slot is missing it, a deploy is unpacked into `wwwroot` as plain
  files, and the next swap puts that into production.
- `WEBSITE_NODE_DEFAULT_VERSION` = `~22` on both slots, matching `volta.node` in `package.json`.
  **Not** a deployment slot setting, so the Node version swaps with the code built for it. Change both
  together.
- `DurableTaskHubName`: `TaskHub` in production, `TaskHubStaging` in staging. A **deployment slot
  setting**, so each slot keeps its own Durable Functions task hub across swaps and they never share
  orchestrations. `host.json` reads it.
- Never make `WEBSITE_CONTENTSHARE` or `WEBSITE_CONTENTAZUREFILECONNECTIONSTRING` slot settings, and
  don't set `SCM_DO_BUILD_DURING_DEPLOYMENT`.
- The timer functions (dailyTimer, bookCleanup, contentfulToCrowdin) are disabled in the staging slot
  by `AzureWebJobs.<name>.Disabled` = `1` settings, each a **deployment slot setting**, so they stay
  with staging through a swap. The staging slot's **Functions** list shows them as Disabled. If you
  add another timer, disable it in staging the same way. Don't use the Disable button in the slot's
  function list: it writes the same setting without ticking **Deployment slot setting**, so the next
  swap would disable the timer in production.

App settings are under **Settings → Environment variables** on the Function App, or on a slot
(**bloom-functions → Deployment → Deployment slots → staging**).

GitHub deploys with each slot's **publish profile**, which needs **SCM Basic Auth Publishing
Credentials** turned on for both slots (**Settings → Configuration → General settings**). Each
profile is stored as the secret `AZURE_FUNCTIONAPP_PUBLISH_PROFILE` on its GitHub environment:
the staging slot's on `staging`, production's on `production`. Both environments only allow `master`,
and `production` requires a reviewer, so only an approved job can read production's profile. A
profile is a password for deploying to its slot. If one leaks, use **Reset publish profile** on that
slot's **Overview** and store the new one.

## Normal deploy

Merge to `master`. The workflow deploys to staging. Check staging (see "Verifying a deploy"), then
swap.

## Swapping staging into production

Before swapping, make sure no Durable orchestrations are running in production (for example, no book
upload in progress). After a swap, production's existing orchestrations replay against the new code,
so orchestrator changes must stay replay-compatible.

- Portal: **bloom-functions → Deployment → Deployment slots → Swap**, source `staging`, target
  `production`.
- CLI: `az functionapp deployment slot swap -g <resource-group> -n bloom-functions --slot staging --target-slot production`

After a swap, staging holds what used to be in production.

## Rolling back

- **Just swapped and it's bad:** swap again. Staging still has the previous production build, as long
  as nothing has been pushed to `master` since. This doesn't apply after a direct production deploy:
  then staging holds whatever was last deployed there.
- **Older build:** re-run the deploy job of that build's workflow run (GitHub allows re-runs for 30
  days), or download its artifact and deploy it by hand (below). Then swap if you deployed to staging.

## Deploying by hand

From a build artifact (preferred, it's exactly what CI built and tested): download
`bloom-functions-<sha>` from the workflow run, unzip it once to get `bloom-functions-<sha>.zip`, check
that the target slot has `WEBSITE_RUN_FROM_PACKAGE=1` (this command won't set it), then run:

```
az functionapp deployment source config-zip -g <resource-group> -n bloom-functions --slot staging --src bloom-functions-<sha>.zip
```

The portal has no button that uploads a zip as a package, but its **Cloud Shell** (the `>_` icon at
the top of the portal) runs this command without installing anything. In Cloud Shell, upload the zip
with **Manage files → Upload**, then run the command; it is already signed in. The resource group is
on the Function App's **Overview** page. From your own machine, run `az login` first.

From your own checkout, with [Core Tools v4](https://learn.microsoft.com/azure/azure-functions/functions-run-local):

```
npm ci
npm run build
npm prune --omit=dev
func azure functionapp publish bloom-functions --slot staging --javascript
npm ci
```

`func` zips the folder minus what `.funcignore` excludes, and sets `WEBSITE_RUN_FROM_PACKAGE`. Don't use
the VS Code "Deploy to Function App" command; it would upload dev dependencies. Don't build a zip with
PowerShell's `Compress-Archive`; it fails on long `node_modules` paths.

## Verifying a deploy

- The workflow run is green and **Deployment Center → Logs** on the slot shows the new deployment.
- **Functions** lists all 12 functions (bookCleanup, books, contentfulToCrowdin, dailyTimer, fs,
  longRunningActionOrchestrator, longRunningActions, opds, social, stats, status, subscriptions).
- A request that needs no database works, e.g.
  `https://<slot-host>/v1/social?link=https://bloomlibrary.org&title=test` returns HTML.
- In Kudu (**Advanced Tools → Debug console**) for the slot you deployed to or swapped into,
  `d:\home\data\SitePackages\packagename.txt` names the new zip, and the slot's app settings include
  `WEBSITE_RUN_FROM_PACKAGE=1`.

## Watching cold start

Microsoft doesn't document a cold-start query; these are our own heuristics, in Application Insights →
**Logs**. Application Insights samples `traces` and `requests` by default, so counts are approximate.
If both slots report `cloud_RoleName` as `bloom-functions`, staging's instances are mixed in.

Host start time, as the host logs it (this excludes loading our Node code):

```kusto
traces
| where timestamp > ago(14d)
| where message startswith "Host started ("
| extend hostStartMs = toint(extract(@"Host started \((\d+)ms\)", 1, message))
| summarize starts = count(), p50 = percentile(hostStartMs, 50), p95 = percentile(hostStartMs, 95), max = max(hostStartMs)
    by cloud_RoleName, bin(timestamp, 1d)
| order by timestamp asc
```

Each new instance's first request: how long after the instance's first log line it ran, and how long
it took. Neither number includes time a caller waited before the instance was ready.

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

## Known limitations

- **Tests in CI are partial.** Most suites call the real Parse server, S3 or Google Sheets and need
  secrets, so `test:ci` skips them; only `books/utils` and `opds/bookEntry` run.
  `books/parseAdapters.test.ts` is also skipped because three of its tests fail; it should be fixed and
  put back.
- **`googleapis` is loaded on first use** in `subscriptions`, because loading it at startup doubled the
  modules every new instance loads. The first `subscriptionInfo` call on each instance is slower
  instead. It's still 115 MB of the package; `@googleapis/sheets` would shrink that.
- **Every push to `master` restarts staging**, interrupting any Durable activities running there (such
  as an upload being tested); Durable replays them.
- **Windows Consumption is now "legacy".** Microsoft recommends moving to Flex Consumption (Linux, no
  slots). We're not doing that, since this app is moving to Supabase.
