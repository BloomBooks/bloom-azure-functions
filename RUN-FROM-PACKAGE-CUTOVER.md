# Cut-over: Kudu builds → run from package

The plan for switching `bloom-functions` to the deployment described in [DEPLOYMENT.md](DEPLOYMENT.md).
Delete this file once the switch is done and stable.

## Why

Before this change:

- The staging slot's Deployment Center followed GitHub `master`. On each push, Kudu ran `deploy.cmd`:
  it copied the source into `wwwroot`, ran `npm install --production` and `tsc` on the server.
  Production got the code by a swap.
- When a new instance started, the host loaded every function's script, about 2,000 modules, each
  read file by file from the app's Azure Files share.

After it, CI builds a zip, the app runs from that one file, and `googleapis` (830 of those modules) is
loaded only when `subscriptions` first needs it, so startup loads about 1,100 modules. Microsoft
recommends run-from-package for Windows Consumption, and says it can reduce cold start for Node apps
with large `node_modules`. It also moves the build off the server, so a deploy no longer depends on
`npm install` succeeding in Kudu, and moves to Node 22, since Microsoft no longer supports Node 20.

**It also addresses the 2026-10-27 stall.** Every cold start holds its requests for about 3 minutes
while the worker loads our code: 150–246 s, median 190 s, across 96 instance starts in 30 days. The
host passes each request on as it arrives, but none of our code runs until all of them are released
at once. CPU is low and storage was healthy. 10-27 was just a morning with many cold starts.

The cause is the Node worker loading our modules synchronously, file by file, from the Azure Files
share. That's about 2,000 modules, almost half of them from `googleapis`, and nothing else can run
until it finishes. The log timing confirms it. `contentfulToCrowdin`, loaded after 52% of the
modules, logged a line at a steady point in each instance's hold: 0.43 / 0.45 / 0.46 of the way
through (p10 / median / p90), however long the hold was. Fewer modules (lazy `googleapis`: 2,037 →
1,077) read from one zip (run-from-package) should shorten the hold a lot.

The "Connection error occurred. Waiting for ~2000 ms before retrying..." warning printed at each
release comes from our own code, but it is a symptom, not the cause. `contentfulToCrowdin` started the
whole Contentful→Crowdin sync at module load, on every instance start. Its connection failed during
the hold, and its retry warning was the first thing to run once the worker was free. This branch
removes that call, so the warning no longer marks the release. Measure the "after" by how long
requests take on fresh instances instead (below).

## One-time setup

### Azure

Everything here can be done in the Azure portal. App settings are under **Settings → Environment variables** on
the Function App, or on a slot (**bloom-functions → Deployment → Deployment slots → staging**); each
has a **Deployment slot setting** checkbox. The CLI equivalents are given where they exist.

1. **Publish profiles for GitHub.** On the Function App and on the staging slot:
   - **Settings → Configuration → General settings**: turn **SCM Basic Auth Publishing Credentials**
     on, and save. Leave **FTP Basic Auth Publishing Credentials** off; nothing needs it.
   - **Overview → Download publish profile**. Keep the two files private; each is a password for
     deploying to its slot.
2. **Staging slot settings** (portal: the staging slot's **Settings → Environment variables**; CLI:
   `az functionapp config appsettings set -g <resource-group> -n bloom-functions --slot staging --settings WEBSITE_NODE_DEFAULT_VERSION=~22`):
   - `WEBSITE_NODE_DEFAULT_VERSION` = `~22` (was `~20`; Microsoft no longer supports Node 20 for
     Functions). Check it is **not** a deployment slot setting, so the swap moves production to Node
     22 together with the code.
   - Remove `SCM_DO_BUILD_DURING_DEPLOYMENT` if it is present.
   - Not `WEBSITE_RUN_FROM_PACKAGE` yet: with it set and no package deployed, the slot has no code
     at all. It is set in "Cutting over", right before the first deploy.
3. **Check** that the production slot has no source in **Deployment → Deployment Center**. (The timer
   functions are already disabled in staging with sticky settings; see DEPLOYMENT.md, "Settings and
   credentials".)

### GitHub

1. **Settings → Environments**: create `staging` and `production`. On both, set **Deployment branches
   and tags** to `master` only. On `production`, add required reviewers.
2. In each environment (**Settings → Environments → staging**, then **production**), add an
   environment secret named `AZURE_FUNCTIONAPP_PUBLISH_PROFILE`, pasting in the whole contents of that
   slot's publish profile file. Staging gets the staging slot's profile, production gets the
   production one. Then delete the downloaded files.

## Cutting over

1. Do the setup above.
2. On staging, back to back:
   - Disconnect the Deployment Center (portal: the staging slot's **Deployment → Deployment Center →
     Disconnect**; CLI:
     `az functionapp deployment source delete -g <resource-group> -n bloom-functions --slot staging`).
     Otherwise, once this change is merged, Kudu finds no `deploy.cmd`, falls back to its default
     Node build without `tsc`, and staging ends up with no `dist` and no working functions.
   - In the staging slot's **Settings → Environment variables**, set `WEBSITE_RUN_FROM_PACKAGE` = `1`, **not** a
     deployment slot setting. Not on production: it
     has no package until the first swap, which carries the setting there with it.
   - Deploy this pull request's build artifact by hand (DEPLOYMENT.md, "Deploying by hand"; the
     portal's Cloud Shell runs the one command it needs).

   Staging serves nothing between setting `WEBSITE_RUN_FROM_PACKAGE` and the deploy finishing. If the
   deploy fails, remove the setting to bring back the last Kudu build.
3. Check staging (see DEPLOYMENT.md, "Verifying a deploy"). **Don't swap until this passes.**
4. Merge this change. The workflow deploys the same code to staging, which tests its own deploy.
   Check staging again.
5. At a quiet time, with no orchestrations running, swap. Watch production: `/v1/social`, a
   `/v1/books` request, and a Durable orchestration end to end (an upload, checking `/v1/status`).
   This is the first time production runs code built by CI rather than by Kudu.
6. In the staging slot's **Settings → Environment variables**, set `WEBSITE_RUN_FROM_PACKAGE` = `1` and
   `WEBSITE_NODE_DEFAULT_VERSION` = `~22` again.
   The swap moved both settings to production, and staging is now the old production site, with
   neither. Nothing else sets `WEBSITE_RUN_FROM_PACKAGE`. Without it, the next deploy to staging is
   unpacked into `wwwroot` as plain files, and the swap after that puts them into production.

## After

1. After a couple of weeks, compare how long the first requests on each new production instance take,
   before and after the switch: the second query in
   [DEPLOYMENT.md](DEPLOYMENT.md#watching-cold-start). Before, requests that arrive in an instance's
   first few minutes take up to its 150–246 s hold.
2. Once stable, delete the old Kudu-built files in `d:\home\site\wwwroot` on both slots (Kudu console).
   They're hidden under the package, but would reappear if `WEBSITE_RUN_FROM_PACKAGE` were removed.
3. Delete this file.

## Backing out

Revert this change's commits and remove `WEBSITE_RUN_FROM_PACKAGE` from both slots'
**Settings → Environment variables**. Then reconnect the staging slot's **Deployment Center** to GitHub
(`BloomBooks/bloom-azure-functions`, branch `master`). Choose the App Service build service (Kudu)
as the build provider, not GitHub Actions; the portal now suggests GitHub Actions by default. The
next push builds with Kudu again; then swap.

## Not yet verified

The workflow, `Azure/functions-action` with a publish profile on a Windows Consumption slot, and the
KQL queries
have not been run against Azure. The build and packaging steps were run locally. Steps 2–4 of
"Cutting over" test the package on staging first, then the workflow's own deploy.
