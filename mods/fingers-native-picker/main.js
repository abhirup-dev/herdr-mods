// Fingers picker: every URL, path, hash, IP... on the focused terminal's screen, in a native
// popup. Type to fuzzy-filter; ↑/↓ (ctrl-j/ctrl-k, ctrl-n/ctrl-p) to move; Enter or click acts; Tab cycles the
// action (open → copy → paste); shift-enter pastes, ctrl-y copies, cmd-enter opens; Esc leaves.
// The matches and the config come from fingers-native's fingers.py (`list`), so both modes
// match the same things.
import * as fs from "fs/promises";
import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, Scrollbar, VirtualListScrollHandle, v_virtual_list } from "gpui-base";
import { appHome, closeOverlay, exec, focused, notify, props, run, theme } from "herdr";
import { fuzzy } from "./fuzzy.js";

const ACTIONS = ["open", "copy", "paste"];
const ROW = 34; // px; the virtual list needs every row exactly this tall
const KIND_COLOR = { url: "ansi4", file: "ansi2", sha: "ansi3", uuid: "ansi5", ip: "ansi6", "kubernetes-pod": "ansi1", "git-status": "ansi2", "git-status-branch": "ansi2", diff: "ansi2" };
const KIND_LABEL = { "kubernetes-pod": "pod", "git-status": "git", "git-status-branch": "branch" };

export default class FingersPicker extends View {
  init(_props, cx) {
    this.items = null; // null: still reading
    this.error = null;
    this.filter = "";
    this.at = 0;
    this.action = "open";
    this.cwd = "";
    this.source = focused();
    this.input = InputState.new({ placeholder: "Filter links, paths, hashes…" });
    this.scroll = VirtualListScrollHandle.new(); // keeps the selected row on screen
    this.input.on("change", (_e, cx) => { this.filter = this.input.value(); this.at = 0; this.scroll.scroll_to_item(0); cx.notify(); });
    this.input.on("submit", (_e, cx) => this.act(this.rows()[this.at], this.action, cx));
    this.input.focus();
    cx.timer.after(400, () => this.input.focus());
    this.handle = cx.focus_handle();
    cx.spawn(async (cx) => {
      if (!this.source?.terminal) {
        this.error = "Focus a terminal pane first";
        return cx.notify();
      }
      try {
        // make install links the fastest Python as fingers-native/python3 (Apple's 3.9 starts ~5x
        // slower); run, not fs.exists'd: the link leads outside the folders a mod may read.
        const dir = `${appHome()}/mods/fingers-native`;
        const argv = ["-I", `${dir}/fingers.py`, "list", this.source.terminal];
        const r = await exec(`${dir}/python3`, argv).catch(() => exec("/usr/bin/python3", argv));
        const out = JSON.parse(r.stdout);
        this.items = out.matches;
        this.cwd = out.cwd;
        this.machine = out.machine; // the terminal's machine (null: this one): its files live there
        this.action = out.config.action;
        this.editor = out.config.editor;
      } catch (e) {
        this.error = `Couldn't read the screen: ${e}`;
      }
      cx.notify();
    });
  }

  rows() {
    if (!this.items) return [];
    if (!this.filter.trim()) return this.items;
    return this.items
      .map((m) => ({ m, s: fuzzy(this.filter, `${m.text} ${m.kind}`) }))
      .filter((x) => x.s !== null)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.m);
  }

  close() {
    closeOverlay(props().overlay);
  }

  act(m, action, cx) {
    if (!m) return;
    if (action === "paste") {
      cx.write_to_clipboard(m.text);
      this.close(); // focus goes back to the source terminal, which terminal.paste follows
      return run("terminal.paste");
    }
    if (action === "open" && /^https?:\/\//.test(m.text)) cx.open_url(m.text);
    else if (action === "open" && m.file && (!m.dir || this.machine) && this.editor) {
      // The editor, via the editor mod (float, split or tab per config); another machine's folder too.
      const [, line, col] = m.text.match(/:(\d+)(?::(\d+))?$/) ?? [];
      const req = { path: m.file, line: line ? +line : null, col: col ? +col : null, cwd: this.cwd, pane: this.source?.pane, machine: this.machine };
      // The same hand-off as hints mode (fingers.py): the request file, then mod.open. An overlay
      // opened from here with props stalls while a space on another machine is shown.
      return cx.spawn(async () => {
        await fs.writeFile(`${appHome()}/fingers-native-open.json`, JSON.stringify(req));
        run("mod.open", { name: "fingers-native-editor" });
        this.close(); // last: closing ends this task
      });
    } else if (action === "open" && m.file && !this.machine) exec("open", [m.file]); // Finder can't reach another machine
    else {
      cx.write_to_clipboard(m.text);
      notify({ title: "Copied", body: m.text, level: "info", timeout: 1500 });
    }
    this.close();
  }

  render() {
    const t = theme();
    const rows = this.rows();
    this.at = Math.max(0, Math.min(this.at, rows.length - 1));
    const color = (k) => t[KIND_COLOR[k] ?? "dim"] ?? t.dim;

    const row = (m, i) => {
      const on = i === this.at;
      return h_flex()
        .mx(4)
        .px(10)
        .h(ROW)
        .flex_none()
        .rounded(7)
        .gap(10)
        .items_center()
        .cursor_pointer()
        .when(on, (el) => el.bg(t.hover))
        .child(div().w(46).flex_none().text_size(10.5).font_semibold().text_color(color(m.kind)).child(KIND_LABEL[m.kind] ?? m.kind))
        .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).font_family("JetBrains Mono").text_size(12.5).child(m.text))
        .when(on, (el) => el.child(div().text_size(11).text_color(t.dim).child(`⏎ ${this.action}`)));
    };

    const chip = (a) =>
      div()
        .id(`fp-act-${a}`)
        .px(8)
        .py(2)
        .rounded(5)
        .cursor_pointer()
        .text_color(a === this.action ? t.accent_foreground : t.dim)
        .when(a === this.action, (el) => el.bg(t.accent))
        .hover((s) => s.text_color(t.foreground))
        .on_click((_e, cx) => { this.action = a; cx.notify(); })
        .child(a);

    // A popup sizes to its content, and a shrinking popup leaves stale pixels below it: size the
    // list by every match, not the filtered ones, so typing never changes the popup's height.
    const listH = Math.min(440, Math.max(1, this.items?.length ?? 1) * ROW);
    const body = this.error
      ? div().p(12).text_color(t.blocked).child(this.error)
      : !this.items
        ? div().p(12).text_color(t.dim).child("Reading the screen…")
        : !rows.length
          ? div().h(listH).flex_none().p(12).text_color(t.dim).child(this.items.length ? "Nothing matches" : "Nothing to pick on this screen")
          : div().relative().w_full().h(listH).flex_none()
              .child(v_virtual_list("fp-list", rows.length, ROW, (i) => String(i), (range) => rows.slice(range.start, range.end).map((m, j) => row(m, range.start + j)))
                .on_item_click((key, cx) => this.act(rows[+key], this.action, cx)) // a virtual list's rows can't hold handlers
                .track_scroll(this.scroll).size_full())
              .child(Scrollbar.vertical("fp-list").viewport_from_layout().absolute().inset_0());

    return v_flex()
      .id("fingers-picker")
      .track_focus(this.handle)
      .w_full()
      .min_h(0)
      .p(16)
      .gap(10)
      .bg(t.popover)
      .text_size(13)
      .on_key_down((e, cx) => {
        const k = e.keystroke;
        const n = Math.max(rows.length, 1);
        if (k === "escape") return this.close();
        if (k === "down" || k === "ctrl-j" || k === "ctrl-n") this.scroll.scroll_to_item((this.at = (this.at + 1) % n));
        else if (k === "up" || k === "ctrl-k" || k === "ctrl-p") this.scroll.scroll_to_item((this.at = (this.at + n - 1) % n));
        else if (k === "tab") this.action = ACTIONS[(ACTIONS.indexOf(this.action) + 1) % ACTIONS.length];
        else if (k === "shift-enter") return this.act(rows[this.at], "paste", cx);
        else if (k === "cmd-enter") return this.act(rows[this.at], "open", cx);
        else if (k === "ctrl-y") return this.act(rows[this.at], "copy", cx);
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(
        h_flex().items_center().gap(8)
          .child(div().flex_1().text_size(15).font_semibold().text_color(t.foreground).child("Fingers"))
          .child(div().text_size(11).text_color(t.dim).child(this.items ? `${rows.length}/${this.items.length}` : ""))
          .child(div().text_size(11).text_color(t.dim).child("Esc")),
      )
      .child(
        h_flex().h(36).flex_none().px(10).gap(8).items_center().rounded(9).border_1().border_color(t.accent).bg(t.background)
          .child(Input.new(this.input).flex_1().h_full().text_size(12.8).text_color(t.foreground)),
      )
      .child(body)
      .child(
        h_flex().flex_none().gap(6).items_center().text_size(11).text_color(t.dim)
          .child("Enter / click:")
          .children(ACTIONS.map(chip))
          .child(div().flex_1())
          .child("Tab action · ⇧⏎ paste · ⌃Y copy · ⌘⏎ open"),
      );
  }
}
