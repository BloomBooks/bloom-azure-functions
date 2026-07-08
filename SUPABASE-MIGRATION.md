# ⚠️ This repo is being migrated to Supabase

These Azure Functions are being replaced, function by function, with Supabase Edge Functions in
[BloomBooks/bloom-core-supabase](https://github.com/BloomBooks/bloom-core-supabase).

The migration plan — inventory, prioritized order, Cloudflare routing notes, and per-function
cutover/rollback details — lives there:

**[bloom-core-supabase/MIGRATION-PLAN.md](https://github.com/BloomBooks/bloom-core-supabase/blob/develop/MIGRATION-PLAN.md)**

Status: `fs` has already been migrated and serves production traffic via a Cloudflare routing
rule; all other functions here are still live. Before changing a function in this repo, check the
plan to see whether it is about to move.
