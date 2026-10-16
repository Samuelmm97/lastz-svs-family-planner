/* DOM test: load planner.html in jsdom, stub window.fetch, and drive the real UI.
   Proves the form "Save" and a board "Join this slot" tap both POST an entry to the
   shared store under the right namespaced key. */
"use strict";
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const html = fs.readFileSync(path.join(__dirname, "planner.html"), "utf8");

const posted = [];
let getCount = 0;
function fakeFetch(url, opts) {
  opts = opts || {};
  if (!opts.method || opts.method === "GET") {
    getCount++;
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  }
  posted.push({ url: String(url), body: JSON.parse(opts.body) });
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
}

const dom = new JSDOM(html, {
  url: "https://example.org/fplan/",
  runScripts: "dangerously",
  pretendToBeVisual: true,
  beforeParse(window) { window.fetch = fakeFetch; }
});
const { window } = dom;
const doc = window.document;

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.error("FAIL:", m); } else console.log("ok  :", m); };
const tick = () => new Promise(r => setTimeout(r, 30));

(async () => {
  ok(!!window.Core, "Core present in the page");
  ok(!!doc.getElementById("boardwrap").querySelector("table"), "coverage table rendered at load");
  const cells = [...doc.querySelectorAll("#boardwrap button.cell")].filter(b => /st-/.test(b.className));
  ok(cells.length >= 8, "task cells rendered (" + cells.length + ")");

  // --- fill the form and Save ---
  doc.getElementById("f-name").value = "Ahmed";
  doc.getElementById("f-alliance").value = "Helm";
  doc.getElementById("f-tier").value = "core";
  doc.getElementById("f-hq").value = "27";
  doc.getElementById("btn-save").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await tick();
  const save = posted.find(p => p.body["fplan798:m:ahmed"]);
  ok(!!save, "Save POSTs the entry under fplan798:m:ahmed");
  if (save) {
    const e = JSON.parse(save.body["fplan798:m:ahmed"]);
    ok(e.name === "Ahmed" && e.tier === "core" && e.hq === 27, "posted entry carries name/tier/hq");
  }
  ok(doc.getElementById("whoami").textContent.indexOf("Ahmed") === 0, "header shows the signed-in member");

  // --- join a task slot from the board ---
  const before = posted.length;
  // pick the "reserve" row's 12:00 cell (a real target) by clicking any st- cell
  cells[0].dispatchEvent(new window.MouseEvent("click", { bubbles: true })); // select
  const joinBtn = [...doc.querySelectorAll("#detail button")].find(b => /Join/.test(b.textContent));
  ok(!!joinBtn, "detail panel offers a Join button for the selected slot");
  if (joinBtn) {
    joinBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    await tick();
    const join = posted.slice(before).find(p => p.body["fplan798:m:ahmed"]);
    ok(!!join, "Join POSTs the updated entry");
    if (join) {
      const e = JSON.parse(join.body["fplan798:m:ahmed"]);
      const ids = Object.keys(e.tasks || {});
      ok(ids.length === 1 && /^clash\|/.test(ids[0]), "entry now carries one clash task: " + ids[0]);
    }
    // the same slot should now read as the member's own
    const nowMine = [...doc.querySelectorAll("#boardwrap button.cell")].some(b => /mine/.test(b.className));
    ok(nowMine, "the joined cell is marked as mine");
  }

  ok(getCount >= 1, "page pulled the shared store on load (GET issued)");

  // --- leave the slot again (destructive path has its own confirm in UI, not here) ---
  console.log(fails === 0 ? "\nALL DOM TESTS PASSED" : `\n${fails} DOM FAILURE(S)`);
  window.close();
  process.exit(fails === 0 ? 0 : 1);
})().catch(err => { console.error("DOM test threw:", err); process.exit(1); });
