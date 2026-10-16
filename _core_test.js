/* Headless verification of Core: runs the inline Core module in a vm with NO document,
   so the UI never initialises. Asserts data invariants, coverage/backup logic,
   time conversion, store keys and import/export round trips. Exit 1 on any failure. */
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const dir = __dirname;
const html = fs.readFileSync(path.join(dir, "planner.html"), "utf8");
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error("no inline script found"); process.exit(1); }
const script = m[1];
fs.writeFileSync(path.join(dir, "_inline.js"), script);

// syntax check
new vm.Script(script, { filename: "planner-inline.js" });

const ctx = { console, Math, JSON, Date, String, Number, Object, Array, RegExp, isNaN, parseInt, parseFloat, setTimeout, clearTimeout };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(script, ctx, { filename: "planner-inline.js" });

const Core = ctx.Core;
let fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.error("FAIL:", msg); } else { console.log("ok  :", msg); } }

ok(!!Core, "Core exported into the vm context");
ok(ctx.document === undefined, "no document in vm (UI did not initialise)");

const D = Core.data;

// --- data invariants ---
const phaseIds = D.phases.map(p => p.id);
ok(phaseIds.length >= 2, "at least two phases (clash + prep)");
for (const p of D.phases) {
  const colIds = p.cols.map(c => c.id);
  const rowIds = p.rows.map(r => r.id);
  ok(new Set(colIds).size === colIds.length, `${p.id}: column ids unique`);
  ok(new Set(rowIds).size === rowIds.length, `${p.id}: row ids unique`);
  ok(p.cols.length >= 6 && p.rows.length >= 6, `${p.id}: a real grid (${p.rows.length}x${p.cols.length})`);
  for (const r of p.rows) ok(typeof r.min === "number", `${p.id}/${r.id}: has a coverage target`);
}
ok(new Set(D.alliances.map(a => a.tag)).size === D.alliances.length, "alliance tags unique");
ok(new Set(D.tiers.map(t => t.id)).size === D.tiers.length, "tier ids unique");
ok(D.guide.tiers.length >= 3 && D.guide.tiers.every(g => D.tiers.some(t => t.id === g.id)), "guide cards map to real tiers");

// --- coverage engine ---
const P = D.phases[0]; // clash
const col0 = P.cols[0].id, col1 = P.cols[1].id;
const rowA = P.rows[0].id; // capital, wants core, min 2
const rowB = P.rows.find(r => r.tier === undefined && (r.min || 0) > 0).id;

let st = Core.newState();
const kap = Core.newEntry("Kraken"); kap.tier = "core"; kap.hq = 30;
kap.avail[P.id] = [col0];
Core.setEntry(st, kap);
let cov = Core.coverage(st, P.id);
ok(cov.head[col0].total === 1, "headcount counts an available member");
ok(cov.head[col1].total === 0, "headcount is per-block");
ok(cov.cells[Core.cellId(P.id, rowA, col0)].status === "gap", "a targeted slot with 0 signups is a gap");
ok(cov.cells[Core.cellId(P.id, rowA, col0)].min === 2, "target carried into the cell");
ok(cov.gaps.length > 0, "gaps are reported");

// one volunteer < min -> thin ; two -> ok
const a = Core.newEntry("Ahmed"); a.tier = "core"; a.tasks[Core.cellId(P.id, rowA, col0)] = true;
Core.setEntry(st, a);
cov = Core.coverage(st, P.id);
ok(cov.cells[Core.cellId(P.id, rowA, col0)].status === "thin", "1 of 2 target -> thin");
ok(cov.cells[Core.cellId(P.id, rowA, col0)].count === 1, "volunteer counted");
const b = Core.newEntry("Bear"); b.tier = "lead"; b.tasks[Core.cellId(P.id, rowA, col0)] = true;
Core.setEntry(st, b);
cov = Core.coverage(st, P.id);
ok(cov.cells[Core.cellId(P.id, rowA, col0)].status === "ok", "2 of 2 target -> ok");
ok(Core.isOnline(b, P.id, col0), "a task commitment implies online in that block");
ok(Core.onlineInCol(st, P.id, col0).length === 3, "online counts availability (Kraken) OR a task (Ahmed, Bear) in the block");

// --- backup logic ---
// Ahmed (core) alone in col1 with nobody else -> high severity
const ahmed = Core.entryFor(st, "Ahmed"); ahmed.avail[P.id] = [col1]; Core.setEntry(st, ahmed);
let bg = Core.backupGaps(st, P.id);
ok(bg.some(g => g.member === "Ahmed" && g.colId === col1 && g.severity === "high"), "alone core -> high backup gap");
// add a mid online in col1 -> downgraded to low
const mid = Core.newEntry("Midge"); mid.tier = "mid"; mid.avail[P.id] = [col1]; Core.setEntry(st, mid);
bg = Core.backupGaps(st, P.id);
const ahmedLow = bg.find(g => g.member === "Ahmed" && g.colId === col1);
ok(ahmedLow && ahmedLow.severity === "low", "core with a mid online but no named backup -> low");
// declare Midge as Ahmed's backup -> gap clears
mid.backupFor = ["Ahmed"]; Core.setEntry(st, mid);
bg = Core.backupGaps(st, P.id);
ok(!bg.some(g => g.member === "Ahmed" && g.colId === col1), "named backup online clears the gap");
// grass alone does not create a backup gap
const g1 = Core.newEntry("Grassy"); g1.tier = "grass"; g1.avail[P.id] = [P.cols[2].id]; Core.setEntry(st, g1);
bg = Core.backupGaps(st, P.id);
ok(!bg.some(g => g.member === "Grassy"), "grass players are not tracked for backups");

// --- time conversion ---
ok(Core.localLabel("12:00", 0, 0) === "12:00", "no tz offset -> server time");
ok(Core.localLabel("12:00", -5, 0) === "07:00", "UTC-5 shifts back 5h");
ok(Core.localLabel("02:00", -5, 0) === "21:00", "wraps to the previous day");
ok(Core.localLabel("20:00", 3, 0) === "23:00", "wraps forward");
ok(Core.localLabel("12:00", null, 0) === "", "missing tz -> empty label");

// --- store keys ---
ok(Core.memberKey("Ahmed") === "fplan798:m:ahmed", "member key is namespaced + normalised");
ok(Core.memberKey("Ünïted!") === Core.memberKey("united"), "key normalises case/accents/punctuation");
ok(Core.isMemberKey("fplan798:m:ahmed") === true, "isMemberKey true for our prefix");
ok(Core.isMemberKey("fplan798:cfg") === false, "isMemberKey false for other keys");

// --- merge: newest wins, junk ignored ---
let st2 = Core.newState();
const old = Core.newEntry("Ahmed"); old.tier = "grass"; old.updated = "2026-10-01T00:00:00Z";
const recent = Core.newEntry("Ahmed"); recent.tier = "core"; recent.updated = "2026-10-15T00:00:00Z";
st2.members[Core.norm("Ahmed")] = old;
let n = Core.mergeRecords(st2, { "fplan798:m:ahmed": JSON.stringify(recent), "fplan798:cfg": "x", "other:m:x": "{}" });
ok(n === 1, "merge counts the one valid newer record");
ok(st2.members[Core.norm("Ahmed")].tier === "core", "newer record wins");
n = Core.mergeRecords(st2, { "fplan798:m:ahmed": JSON.stringify(old) });
ok(n === 0, "older remote record does not overwrite");
n = Core.mergeRecords(st2, { "fplan798:m:bad": "{not json", "fplan798:m:noName": "{}" });
ok(n === 0, "junk records are ignored");

// --- import/export round trip ---
let st3 = Core.newState();
const e1 = Core.newEntry("Kraken"); e1.tier = "lead"; e1.hq = 31; e1.avail = { clash: [col0] }; e1.tasks = {}; e1.tasks[Core.cellId(P.id, rowA, col0)] = true;
Core.setEntry(st3, e1);
const dump = Core.exportJSON(st3);
let st4 = Core.newState();
const r = Core.importJSON(dump, st4);
ok(r.added === 1 && r.updated === 0, "import adds a new member");
ok(st4.members[Core.norm("Kraken")].tasks[Core.cellId(P.id, rowA, col0)] === true, "task survives round trip");
const r2 = Core.importJSON(dump, st4);
ok(r2.updated === 1, "re-import updates rather than duplicates");
let threw = false;
try { Core.importJSON("not json at all", st4); } catch (e) { threw = true; }
ok(threw, "import rejects non-JSON with an error");

// --- quick roster lines ---
let st5 = Core.newState();
const rr = Core.parseLines("Ahmed | Helm\nKraken\n# comment\n\nBear, SWT", st5);
ok(rr.added === 3, "parses 3 roster lines, ignores blanks/comment");
ok(st5.members[Core.norm("Bear")].alliance === "SWT", "line alliance parsed");
ok(st5.members[Core.norm("Kraken")].alliance === D.meta.defaultAlliance, "bare name uses default alliance");

// --- validation ---
ok(Core.validate({ name: "", tier: "grass" }).ok === false, "blank name rejected");
ok(Core.validate({ name: "Ahmed", tier: "whoops" }).ok === false, "bad tier rejected");
ok(Core.validate({ name: "Ahmed", tier: "core", hq: "abc" }).ok === false, "non-numeric HQ rejected");
ok(Core.validate({ name: "Ahmed", tier: "core", hq: "" }).ok === true, "blank HQ allowed (unknown)");

console.log(fails === 0 ? "\nALL CORE TESTS PASSED" : `\n${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);
