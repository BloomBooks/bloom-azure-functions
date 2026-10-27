# Cut-over: Kudu builds → run from package

The plan for switching `bloom-functions` to the deployment described in [DEPLOYMENT.md](DEPLOYMENT.md).
Delete this file once the switch is done and stable.

## Why

On 2026-10-27 new instances stalled for about 3.5 minutes after starting. Slow Node cold starts on
the Consumption plan are one suspect. Before this change:

- The staging slot's Deployment Center followed GitHub `master`. On each push, Kudu ran `deploy.cmd`:
  it copied the source into `wwwroot`, ran `npm install --production` and `tsc` on the server.
  Production got the code by a swap.
- When a new instance started, the host loaded every function's script, about 2,000 modules, each
  read file by file from the app's Azure Files share.

After it, CI builds a zip, the app runs from that one file, and `googleapis` (830 of those modules) is
loaded only when `subscriptions` first needs it, so startup loads about 1,100 modules. Microsoft
recommends run-from-package for Windows Consumption, and says it can reduce cold start for Node apps
with large `node_modules`.

This may not be the whole story. Loading files from the share usually costs seconds to tens of seconds,
not minutes. Other suspects for the stall: throttling on the storage account behind the share (the zip
is still read from it, and Durable Functions may use the same account), an extension bundle download on
cold start (`host.json` allows any 4.x), and Durable Functions acquiring leases at host start.

## Before: look at the 2026-10-27 stall

This change won't help if the stall was caused by storage or by Azure itself, so check that first. It
needs only the logs we already have. In Application Insights → **Logs**, this lists long silences on
each instance that day, with the last log line before each and the first after:

```kusto
traces
| where timestamp between (datetime(2026-10-27) .. datetime(2026-10-28))
| project timestamp, cloud_RoleInstance, message
| order by cloud_RoleInstance asc, timestamp asc
| extend prevTime = prev(timestamp), prevMsg = prev(message), prevInstance = prev(cloud_RoleInstance)
| where cloud_RoleInstance == prevInstance
| extend gapSeconds = datetime_diff('second', timestamp, prevTime)
| where gapSeconds > 60
| project cloud_RoleInstance, gapStart = prevTime, gapSeconds, lastBefore = prevMsg, firstAfter = message
| order by gapSeconds desc
```

Idle instances have quiet stretches too; the interesting gaps are in an instance's first few minutes.
Storage timeouts, extension bundle downloads or Durable lease messages around the gap point away from
this change; a late "Worker process started and initialized" points at loading our modules, which this
change targets. Also check the storage account's metrics that day (Transactions split by Response type,
for throttling) and **Diagnose and solve problems** on the Function App.

If the stall happens again, add `SCALE_CONTROLLER_LOGGING_ENABLED` = `AppInsights:Verbose` (a
deployment slot setting on production) to log why instances are added, and remove it afterwards.

## One-time setup

### Azure

1. **Identity for GitHub.** Create an app registration (or user-assigned managed identity), give it
   **Website Contributor** on `bloom-functions` (this covers its slots), and add two federated
   credentials, entity type *Environment*:
   - `repo:BloomBooks/bloom-azure-functions:environment:staging`
   - `repo:BloomBooks/bloom-azure-functions:environment:production`
2. **Staging slot settings** (**Configuration → Application settings**, or
   `az functionapp config appsettings set -g <resource-group> -n bloom-functions --slot staging --settings WEBSITE_RUN_FROM_PACKAGE=1`):
   - `WEBSITE_RUN_FROM_PACKAGE` = `1`, **not** a deployment slot setting. Don't set it on production
     yet: production has no package until the first swap, which carries the setting there with it.
   - Remove `SCM_DO_BUILD_DURING_DEPLOYMENT` if it is present.
3. **Check** that the production slot has no Deployment Center source, and that the timer functions are
   disabled in staging if you don't want them running there (see DEPLOYMENT.md, "Settings and
   credentials").

### GitHub

1. **Settings → Environments**: create `staging` and `production`. On both, set **Deployment branches
   and tags** to `master` only. On `production`, add required reviewers.
2. Secrets: `AZURE_CLIENT_ID` (the app registration's or managed identity's client ID),
   `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`.

If OIDC is not possible, a publish profile works instead: download it for each slot, store it as
`AZURE_FUNCTIONAPP_PUBLISH_PROFILE_STAGING` / `..._PRODUCTION`, drop the `azure/login` steps and pass
`publish-profile:` to `Azure/functions-action`. That needs **SCM Basic Auth** turned on for the app.

## Cutting over

1. Do the setup above.
2. Disconnect the staging slot's Deployment Center (**Disconnect**, or
   `az functionapp deployment source delete -g <resource-group> -n bloom-functions --slot staging`),
   then merge this change. Do the two together: if Kudu is still connected, it finds no `deploy.cmd`,
   falls back to its default Node build without `tsc`, and staging ends up with no `dist` and no
   working functions.
3. The merge runs the workflow. Check staging (see DEPLOYMENT.md, "Verifying a deploy"). **Don't swap
   until this passes**; until then staging still holds the last Kudu build.
4. At a quiet time, with no orchestrations running, swap. Watch production: `/v1/social`, a
   `/v1/books` request, and a Durable orchestration end to end (an upload, checking `/v1/status`).
   This is the first time production runs code built by CI rather than by Kudu.
5. Set `WEBSITE_RUN_FROM_PACKAGE` = `1` on staging again. The swap moved the setting to production,
   and staging is now the old production site, without it. The deploy action would set it on the next
   deploy anyway, but a hand deploy with `az ... config-zip` would not, and would leave plain files that
   the next swap puts into production.

## After

1. After a couple of weeks, run the queries in
   [DEPLOYMENT.md](DEPLOYMENT.md#watching-cold-start) over the weeks before and after the switch.
2. Once stable, delete the old Kudu-built files in `d:\home\site\wwwroot` on both slots (Kudu console).
   They're hidden under the package, but would reappear if `WEBSITE_RUN_FROM_PACKAGE` were removed.
3. Delete this file.

## Backing out

Revert this change's commits, remove `WEBSITE_RUN_FROM_PACKAGE` from both slots, and reconnect the
staging slot's Deployment Center to GitHub `master`. The next push builds with Kudu again; then swap.

## Not yet verified

The workflow, `Azure/functions-action` with OIDC on a Windows Consumption slot, and the KQL queries
have not been run against Azure. The build and packaging steps were run locally.

The workflow can't deploy before it's merged (it only deploys from `master`), but the pull request's
build job produces the zip. The safest first test is to disconnect the staging Deployment Center, set
`WEBSITE_RUN_FROM_PACKAGE` on staging, and deploy the pull request's artifact to staging by hand
(DEPLOYMENT.md, "Deploying by hand"). That checks the package and the slot settings; merging then
tests the workflow's own deploy.
