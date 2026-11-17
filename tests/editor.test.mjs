// Tests for the editor mod's command building. Run: make test (node --test)
import { test } from "node:test";
import assert from "node:assert/strict";
import { editorArgv, launchArgv } from "../mods/fingers-native-editor/argv.js";

test("placeholders", () => {
  assert.deepEqual(editorArgv("nvim +{line} {path}", "/r/a.lua", 12), ["nvim", "+12", "/r/a.lua"]);
  assert.deepEqual(editorArgv("code -g {path}:{line}:{col}", "/r/a.ts", 3, 7), ["code", "-g", "/r/a.ts:3:7"]);
});
test("words with a missing line or col are dropped", () => {
  assert.deepEqual(editorArgv("nvim +{line} {path}", "/r/a.lua", null), ["nvim", "/r/a.lua"]);
  assert.deepEqual(editorArgv("hx {path} +{col}", "/r/a", 1, null), ["hx", "/r/a"]);
});
test("no {path}: +{line} {path} appended", () => {
  assert.deepEqual(editorArgv("vim", "/r/a", 4), ["vim", "+4", "/r/a"]);
  assert.deepEqual(editorArgv("vim", "/r/a", null), ["vim", "/r/a"]);
});
test("quotes group words; a path with spaces stays one argument", () => {
  assert.deepEqual(editorArgv('emacsclient -t "{path}"', "/r/my file.md", null), ["emacsclient", "-t", "/r/my file.md"]);
  assert.deepEqual(editorArgv("nvim {path}", "/r/a; rm -rf ~", null), ["nvim", "/r/a; rm -rf ~"]);
});
test("env: the machine's $VISUAL, then $EDITOR, then its default", async () => {
  const { execFileSync } = await import("node:child_process");
  const run = (env) => execFileSync(launchArgv("env", "/r/my file.md", 3)[0], launchArgv("env", "/r/my file.md", 3).slice(1),
    { env: { PATH: "/usr/bin:/bin", HOME: "/nonexistent", SHELL: "/bin/sh", ...env }, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  assert.equal(run({ EDITOR: "echo" }), "+3 /r/my file.md\n");
  assert.equal(run({ EDITOR: "false", VISUAL: "echo v" }), "v +3 /r/my file.md\n");
  assert.deepEqual(launchArgv("nvim {path}", "/r/a", 1), ["nvim", "/r/a"]); // a template still wins
});
