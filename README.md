# SvS Family Planner — State 798

A single-file web page where alliance members post **when they can be online** during
SvS and **volunteer for the roles** (capital/turret garrison, rally lead, mud pressure,
point farming, reserve) that the alliance needs covered, block by block. Leads see
exactly which slots are empty and which of the biggest players are online **without a
backup** — the thing that gets their HQ blown up.

It answers a member's idea: *"maximise people's availability and contribution, give
clear direction, and make sure our biggest players always have backup online — and stop
grass people thinking their only job is to bubble."*

## What's on the page

- **My availability** — name, alliance, tier (Grass / Mid / Core / Leadership), HQ level,
  your local UTC offset, who you can back up, and a note for leads.
- **Coverage board** — two phases:
  - *Capital Clash · Saturday* — 8 roles × 12 two-hour blocks (server time).
  - *Prep phase · Sunday–Friday* — the daily point tasks × 6 days.
  Each cell shows volunteers vs. target and is colour-coded **needs people / below
  target / covered**. Tap a cell to see who's on it and **Join / Leave this slot**.
- **Coverage summary** — how many targeted slots are filled, and for every gap the
  names of people who are online and could plug it.
- **Core players without a backup online** — flags any Core/Leadership player who is
  online in a block with no named backup (or nobody at all beside them).
- **What can I do?** — a plain-language guide per tier, so low-HQ members have real
  jobs (reinforce, garrison a turret slot, farm points, be the reserve) instead of just
  bubbling.
- **Share / backup** — export/import everyone as JSON, or paste a quick roster list.

## How sharing works

Everyone who opens the page and taps **Save to shared plan** lands in the same shared
sheet — a free Zapier **Storage** record (`https://store.zapier.com/api/records`), no
account and no server of ours. One record per member, keyed `fplan798:m:<ign>`, so two
people never clobber each other. The page pulls the sheet on load and every 60 s.

It is a **coordination aid, not a secure system** — anyone with the link can edit it
(please only edit your own row). If you are offline it still works on your device and
syncs next time you tap **Sync**.

## Files

| file | purpose |
|---|---|
| `config.json` | alliances, tiers, phases/roles/blocks, coverage targets, the guide text, and the store id — **edit this to change the plan** |
| `planner.template.html` | the page with a `/*__DATA__*/` placeholder |
| `build.py` | injects `config.json` into the template → `planner.html` / `index.html` / `data.json` |
| `planner.html`, `index.html` | the built page (open either one) |
| `data.json` | the injected data, kept next to the page |
| `_core_test.js` | headless logic tests (data, coverage, backups, time, store keys, import/export) |
| `_dom_test.js` | jsdom test driving the real UI (form save + join-slot POST) |

## Change the plan and rebuild

```bash
# edit config.json (add a role, change a target, add a language, swap the alliance)
python build.py            # rewrites planner.html + index.html + data.json
node _core_test.js         # logic must stay green
npm i jsdom && node _dom_test.js   # optional: exercise the UI
```

The build creates the shared-sheet id (a uuid4) on first run and stores it in
`config.json`, so the sheet never drifts.

## Notes / limits

- Times are **server time (Apocalypse Time)**; each member may set their local offset to
  see their own time on a slot.
- Coverage targets (`min`) are guidance — leads can rebalance during the event.
- This planner covers **people and roles**; for HQ tile placement use the separate
  *SvS HQ planner* page.
