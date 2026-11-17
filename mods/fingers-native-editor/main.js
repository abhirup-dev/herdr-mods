// Fingers editor: opens a file from a hint or the picker in the configured editor.
//   Launcher (props {path, line, col, cwd, pane, machine}, or the request file fingers.py writes):
//   starts the editor on the file's machine (null: this one) per config `open_in` - "float" (a window over the layout), "split" (a pane beside the
//   source, config `split`: right/down) or "tab" - then closes itself.
//   Header (props {bar, terminal, title, cwd}): the float's drag strip, styled like a pane header,
//   with the pane header's icons: dock right / below / docked and zoomed (terminal.keep), close.
import * as fs from "fs/promises";
import { View, div, image, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { appHome, closeOverlay, hc, home, notify, openOverlay, panes, props, readTextFile, run, terminals, theme } from "herdr";
import { launchArgv } from "./argv.js";

const CONFIG = () => `${home()}/.config/herdr-fingers-native/config.json`;
const REQUEST = () => `${appHome()}/fingers-native-open.json`;

async function loadConfig() {
  let c = {};
  try {
    c = JSON.parse((await readTextFile(CONFIG())) ?? "{}");
  } catch {}
  return {
    editor: !("editor" in c) ? "env" : typeof c.editor === "string" && c.editor.trim() ? c.editor : null,
    open_in: ["float", "split", "tab"].includes(c.open_in) ? c.open_in : "float",
    split: c.split === "down" ? "down" : "right",
  };
}

async function request() {
  if (props()?.path) return props();
  try {
    const r = JSON.parse((await readTextFile(REQUEST())) ?? "null");
    await fs.unlink(REQUEST()).catch(() => {});
    return r;
  } catch {
    return null;
  }
}

export default class FingersEditor extends View {
  init(_props, cx) {
    if (props()?.bar) return; // the float's header: render only
    if (!props()?.overlay) return; // a docked copy does nothing
    cx.spawn(async (cx) => {
      const done = () => closeOverlay(props().overlay);
      const req = await request();
      const cfg = await loadConfig();
      if (!req?.path || !cfg.editor) return done(); // callers only come here with an editor set
      const name = req.path.split("/").pop();
      const argv = launchArgv(cfg.editor, req.path, req.line, req.col);
      const on = req.machine ? ["--on", req.machine] : []; // tab.new and pane.split already start in the space's machine
      const folder = req.cwd ?? req.path.slice(0, req.path.lastIndexOf("/"));
      if (cfg.open_in === "tab") {
        done();
        return run("tab.new", { argv, folder });
      }
      if (cfg.open_in === "split") {
        done();
        return run("pane.split", { direction: cfg.split, argv, ...(req.pane ? { pane: req.pane } : {}) });
      }
      // float: a core terminal of its own, shown in a window with a header to drag and dock by.
      // The core starts it at 200x120 and the window shrinks it after: an editor drawn before that
      // keeps a broken screen. So wait (max 2 s) for the size to change, then exec the editor;
      // argv goes in as "$@", never through the shell's parser.
      const WAIT_FOR_SIZE = 's=$(stty size); i=0; while [ "$(stty size)" = "$s" ] && [ $i -lt 100 ]; do sleep 0.02; i=$((i+1)); done; exec "$@"';
      const r = await hc(["run", "--bg", "--json", "--no-parent", ...on, "--cwd", folder, "--", "/bin/sh", "-c", WAIT_FOR_SIZE, "fingers-editor", ...argv]);
      let t = null;
      try {
        t = JSON.parse(r.stdout);
      } catch {}
      if (!t?.address) {
        done();
        return notify({ title: "Fingers", body: (r.stdout || "couldn't start the editor").trim(), level: "error" });
      }
      for (let i = 0; i < 40 && !terminals().some((x) => x.address === t.address); i++) await cx.sleep(25);
      // frame "none" + the layout's pane look (compact.json's tab pane), so it reads as a pane.
      openOverlay({
        kind: "window",
        frame: "none",
        width: 0.62,
        height: 0.72,
        layout: {
          type: "column",
          background: "background",
          border: { width: 1, color: "border" },
          radius: 10,
          shadow: "lg",
          focus: { border: { width: 1, color: "accent" } },
          children: [
            { type: "block", size: { px: 30 }, content: { mod: "fingers-native-editor", props: { bar: true, terminal: t.address, title: name, cwd: folder, machine: req.machine } } },
            { type: "block", content: { terminal: t.address } },
          ],
        },
      });
      done(); // after the window: closing this overlay first can drop the task before openOverlay
      // No focus call: pane.focus can't reach a window's terminal; a click puts the keyboard there.
    });
  }

  // The float's header, in the look of the app's `pane` header mod. Docking makes it a real pane;
  // the app's top-center grip then moves it anywhere in the tab.
  render() {
    const p = props() ?? {};
    if (!p.bar) return div();
    const t = theme();
    const prog = terminals().find((x) => x.address === p.terminal)?.program;
    const pic = !prog?.icon ? null : prog.tint ? svg(prog.icon).size(14).flex_none().text_color(t.dim) : image(prog.icon).w(14).h(14).flex_none();
    const h = home();
    const dir = p.machine ? `${p.machine}:${p.cwd ?? ""}` : !p.cwd ? "" : p.cwd === h ? "~" : p.cwd.startsWith(h + "/") ? "~" + p.cwd.slice(h.length) : p.cwd;
    const dock = (place, zoomCx) => {
      run("terminal.keep", { terminal: p.terminal, place });
      if (!zoomCx) return closeOverlay(p.overlay);
      // keep finishes in the background: wait for the pane, zoom it, then close (this ends the task).
      zoomCx.spawn(async (cx) => {
        let pane = null;
        for (let i = 0; i < 40 && !pane; i++) {
          pane = panes().find((x) => x.terminal === p.terminal)?.pane;
          if (!pane) await cx.sleep(25);
        }
        if (pane) run("pane.zoom", { pane });
        closeOverlay(p.overlay);
      });
    };
    const button = (id, icon, tip, onClick) =>
      div()
        .id(id).p(3).rounded(4).text_color(t.dim)
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .tooltip(tip)
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation()) // a press here isn't a drag
        .on_click((_e, cx) => {
          cx.stop_propagation();
          onClick(cx);
        })
        .child(svg(`mods/pane/${icon}.svg`).size(14));
    return h_flex()
      .size_full().px(10).gap(8).items_center().bg(t.background).border_b(1).border_color(t.border).text_size(12)
      .when(Boolean(pic), (el) => el.child(pic))
      .child(div().flex_none().truncate().max_w(260).font_medium().text_color(t.foreground).child(p.title ?? "editor"))
      .child(div().flex_1().truncate().text_color(t.dim).child(dir))
      .child(button("fe-right", "split-right", "Dock to the right", () => dock("right")))
      .child(button("fe-down", "split-down", "Dock below", () => dock("down")))
      .child(button("fe-zoom", "zoom", "Dock and zoom", (cx) => dock("right", cx)))
      .child(button("fe-close", "close", "Close", () => run("terminal.kill", { terminal: p.terminal })));
  }
}
