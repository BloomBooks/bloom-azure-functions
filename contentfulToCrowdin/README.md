What this code does (or may do eventually)

# 1 Get Contentful Export

Future:
Pull down the latest Bloom Library strings in Contentful.com that we want to be translated using Crowdin.com.

For now:

1) Install the contentful cli: 

2) Get the export file `contentful space export --config contentful-config.json`. This will create the file "contentful-export.json" in this directory (it is git-ignored).


# 2 Produce a json file in the format that Contentful calls "Chrome JSON"

For now:

1) Have typescript installed globally, e.g. `npm add -g typescript`
2) On the command line from the root of this folder, `ts-node index.ts`
3) It will place a file named "bloom-library-contentful.json" in this directory (it is git-ignored).

# 3 Push that file to Crowdin

Future: Do that via crowdin API

For now: Manually upload it to Crowdin


# Note: Not yet a Azure Function

This is not yet an actual azure function. It lives in this repo because it will ideally become a function that is auto-run once a day or whatever.
