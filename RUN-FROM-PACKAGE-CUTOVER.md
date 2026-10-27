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
cold start (`host.json` allows any 4.x), Durable Functions acquiring leases at host start, and Node 20
(below).

## Decide first

- **Node version.** Microsoft no longer supports Node 20 for Functions (supported: 22 and 24). Retired
  versions get no fixes and "in certain cases" may be limited to one instance, which could itself cause
  slow starts under load. Recommended: move to Node 22 before or alongside this switch, as its own
  change: `WEBSITE_NODE_DEFAULT_VERSION` = `~22` on both slots, `volta.node` and `@types/node` in
  `package.json`. The function.json programming model works on 22.

## Before: get a baseline

1. Turn off request sampling so the numbers are complete, without a deploy: add the app setting
   `AzureFunctionsJobHost__logging__applicationInsights__samplingSettings__excludedTypes` = `Request`
   on production.
2. For the stall investigation, add `SCALE_CONTROLLER_LOGGING_ENABLED` = `AppInsights:Verbose` on
   production. It logs why instances are added or removed. It's verbose; remove it afterwards.
3. Run the queries in [DEPLOYMENT.md](DEPLOYMENT.md#watching-cold-start) for the two weeks before the
   switch, and save the results. Look at 2026-10-27 in the host traces (extension bundle loading, host
   lock lease messages) and at the storage account's metrics for throttling.

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

1. Run the cold-start queries again after two weeks and compare with the baseline.
2. Remove `SCALE_CONTROLLER_LOGGING_ENABLED`. Keep or remove the sampling override as you like.
3. Once stable, delete the old Kudu-built files in `d:\home\site\wwwroot` on both slots (Kudu console).
   They're hidden under the package, but would reappear if `WEBSITE_RUN_FROM_PACKAGE` were removed.
4. Delete this file.

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
