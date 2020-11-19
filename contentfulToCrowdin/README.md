
What this code does (or may do eventually)

# 1 Get Contentful Export

Pulls down the latest Bloom Library strings in Contentful.com that we want to be translated using Crowdin.com.

# 2 For each file (currently there are 3), produce a json file in the format that Contentful calls "Chrome JSON"

# 3 Push that file to Crowdin

# Required environment variable secrets

* bloomCrowdinApiToken (SILCrowdinBot has a "Contentful Transfer Function token" for this)
* bloomContentfulReadOnlyToken (this is the same token used by the live bloomlibrary.org SPA, so not actually a secret)

# Note: Not yet a Azure Function

This is not yet an actual azure function. It lives in this repo because it will ideally become a function that is auto-run once a day or whatever.

For now:

1) Have typescript installed globally, e.g. `npm add -g typescript`
2) On the command line from the root of this folder, `ts-node index.ts`
3) It will place a file named "bloom-library-contentful.json" in this directory (it is git-ignored).

