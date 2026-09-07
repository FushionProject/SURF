import assert from "node:assert/strict";
import { safeNextPath } from "../lib/supabase/safeNextPath.ts";
for (const input of [null, "https://evil.example", "//evil.example", "/\\evil.example", "/\t/evil.example", "/\n/evil.example", "javascript:alert(1)"]) {
  assert.equal(safeNextPath(input), "/account", JSON.stringify(input));
}
for (const input of ["/account", "/games?sport=baseball_mlb#market-board", "/feed", "/%2Fexample"]) {
  const output = safeNextPath(input);
  assert.equal(new URL(output, "https://surf.invalid").origin, "https://surf.invalid");
  assert.equal(output, input);
}
console.log("Auth redirect fixtures passed: external, backslash and control-character destinations rejected; internal routes preserved.");
