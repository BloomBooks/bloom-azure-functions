# 1 Get Contentful Export

Pulls down the latest Bloom Library strings in Contentful.com that we want to be translated using Crowdin.com.

# 2 For each file (currently there are 3), produce a json file in the format that Contentful calls "Chrome JSON"

# 3 Push that file to Crowdin

# Required environment variable secrets

- bloomCrowdinApiToken (SILCrowdinBot has a "Contentful Transfer Function token" for this)
- bloomContentfulReadOnlyToken (this is the same token used by the live bloomlibrary.org SPA, so not actually a secret)

This runs once a day.

# Running manually on Azure (as of Nov 2020)

Under Home > bloom-functions > contentfulToCrowdin, go to "Code + Test".
Set the file to "index.ts".
Click "Test/Run"
Leave the inputs empty, click The "Run" button in the lower right.

# Running locally

1. Have typescript installed globally, e.g. `npm add -g typescript`
2. Temporarily add a top-level call to the function you want to test, e.g. `readTransformUpload();`. Don't commit it: the host loads this module on every instance start, so a top-level call runs the sync on every cold start.
3. On the command line from the root of this folder, `ts-node index.ts`
