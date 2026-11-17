// Tests for the picker's fuzzy matcher. Run: make test (node --test)
import { test } from "node:test";
import assert from "node:assert/strict";
import { fuzzy } from "../mods/fingers-native-picker/fuzzy.js";

test("empty query matches everything", () => assert.equal(fuzzy("", "anything"), 0));
test("letters must appear in order", () => {
  assert.equal(fuzzy("zx", "xyz"), null);
  assert.notEqual(fuzzy("kmp", "config/keymaps.lua"), null);
});
test("consecutive and word-start letters rank higher", () => {
  assert.ok(fuzzy("keymaps", "config/keymaps.lua path") > fuzzy("keymaps", "k/e/y/m/a/p/s"));
  assert.ok(fuzzy("gh", "https://github.com x") < fuzzy("gh", "gh-pages y"));
});
test("case-insensitive", () => assert.notEqual(fuzzy("README", "readme.md"), null));
