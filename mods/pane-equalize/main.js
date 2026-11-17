// Equalize When Linear Tiling. When a pane is added to or closed in a tab whose panes form one
// straight line (all side by side, or all stacked), the sizes adapt the way you'd expect while
// keeping your own proportions: a new pane gets the line's average share and the others shrink
// in proportion; a closed pane's share is spread over the rest in proportion. Dragging a divider
// is never undone, and a line you never resized stays even. A tab with a split inside a split
// (bspwm-style nesting) is left alone.
//
// Herdr has no command for pane sizes. The app keeps each tab's split tree in a herdr-core
// document ("herdr-app") and follows changes to it live; sizes there are relative weights. On its
// own the app halves the split pane, and gives a closed pane's whole share to its left neighbour
// (the right one when it was first). This undoes exactly that: on a split, the halved pane gets
// its share back and the new pane the average; on a close, the neighbour gives back the closed
// pane's share, as last read. Writes name the version they read, so a write that races the app's
// own save fails and is tried again.
// shortcut: a close needs the closed pane's share from before; it is read when panes change and
// when focus moves, so a divider dragged and then closed without focus moving in between uses the
// share from before the drag. Only tabs of this computer's spaces; remote tabs are left alone.
//
// Cmd+Alt+E (mod.open): an overlay copy evens out every split of the focused tab, nested ones
// too, and closes; the working copy re-reads the sizes so a later close adapts from these.
// The working copy is an invisible 0px block in the layout, so it runs whatever is shown.
// It also evens out a tab the same way when one of its panes is zoomed or unzoomed (Cmd+Shift+Enter),
// and the focused tab when the app zoom changes (Cmd +/-/0).

import { View, div } from "gpui-kit";
import { panes, focused, exec, props, closeOverlay, shared, setShared, spaces, settings } from "herdr";
import { adapt, weight } from "./adapt.js";

const FORCED = "pane-equalize.forced";

const rpc = async (method, params) => {
  const line = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
  const r = await exec("sh", ["-c", 'printf "%s\\n" "$1" | hc connect', "sh", line]);
  const reply = JSON.parse(r.stdout.split("\n").find((l) => l.includes('"id":1')) ?? "{}");
  if (reply.error || !reply.result) throw new Error(reply.error?.message ?? (r.stderr || "no reply"));
  return reply.result;
};

const findTab = (doc, id) => {
  for (const s of doc.spaces ?? []) for (const t of s.tabs ?? []) if (t.id === id) return t;
  return null;
};

const leaves = (n) => (n.type === "block" ? [n.id] : (n.children ?? []).flatMap(leaves));

// The row or column of panes a tab is, looking through one-child wrappers (a tab split only
// downward is a row holding one column); null when a split sits inside another split.
const line = (root) => {
  let n = root;
  while (n?.children?.length === 1 && n.children[0].type !== "block") n = n.children[0];
  return n?.children?.length > 1 && n.children.every((c) => c.type === "block") ? n : null;
};

export default class PaneEqualize extends View {
  init(_props, cx) {
    if (props()?.overlay) {
      cx.spawn(async () => {
        await this.force(focused()?.tab);
        closeOverlay(props().overlay);
      });
      return;
    }
    this.seen = null; // tab id -> its panes, joined
    this.lines = {}; // tab id -> { ids, weights } of its line, as last read
    this.focus = null;
    this.pending = new Set(); // tabs whose panes changed and await react()
  }

  // Every split in the tab gets equal shares.
  async force(tab) {
    const even = (n) => {
      if (n.type === "block") return;
      for (const c of n.children ?? []) { if (!c.size?.px) c.size = { weight: 1 }; even(c); }
    };
    for (let tries = 0; tries < 3 && tab; tries++) {
      try {
        const { value, version } = await rpc("doc.get", { name: "herdr-app" });
        const t = findTab(value, tab);
        if (!t) return;
        even(t.root);
        await rpc("doc.set", { name: "herdr-app", value, version });
        setShared(FORCED, Date.now());
        return;
      } catch {
        // The app saved in between: read again.
      }
    }
  }

  // Notes every tab's line, so a later close knows the closed pane's share.
  async snapshot() {
    try {
      const { value } = await rpc("doc.get", { name: "herdr-app" });
      // A tab mid-change is left to react(), which knows what it was before.
      for (const s of value.spaces ?? []) for (const t of s.tabs ?? []) if (!this.pending.has(t.id)) this.note(t.id, line(t.root));
    } catch {
      // Unreadable now; the next change or focus move reads again.
    }
  }

  note(tab, n) {
    this.lines[tab] = n ? { ids: n.children.map((c) => c.id), weights: n.children.map(weight) } : null;
  }

  // After a tab's panes changed: waits until the saved tree shows them, then adapts its line.
  async react(tab, want, was, cx) {
    // The noted line counts only if it is of the panes from just before this change.
    const noted = this.lines[tab];
    const before = noted && noted.ids.slice().sort().join(",") === was.slice().sort().join(",") ? noted : null;
    for (let tries = 0; tries < 6; tries++) {
      await new Promise((ok) => cx.timer.after(250, ok));
      try {
        const { value, version } = await rpc("doc.get", { name: "herdr-app" });
        const t = findTab(value, tab);
        if (!t) return;
        if (leaves(t.root).sort().join(",") !== want) continue;
        const n = line(t.root);
        const next = n ? adapt(n.children, was, before) : null;
        if (next) n.children.forEach((c, k) => { c.size = { weight: next[k] }; });
        if (next) await rpc("doc.set", { name: "herdr-app", value, version });
        this.note(tab, n);
        break;
      } catch {
        // A stale version (the app saved first) or a missing reply: read again.
      }
    }
    this.pending.delete(tab);
  }

  render(cx) {
    if (props()?.overlay) return div();
    const now = {};
    for (const p of panes()) if (!p.pane.includes("/")) (now[p.tab] ??= []).push(p.pane);
    for (const k in now) now[k] = now[k].sort().join(",");
    // After a forced equalize, or at start: note the sizes.
    const forced = shared(FORCED) ?? null;
    if (!this.seen || forced !== this.forced) cx.spawn(() => this.snapshot());
    this.forced = forced;
    if (this.seen) for (const [tab, list] of Object.entries(now)) {
      const was = this.seen[tab];
      if (was === undefined || was === list) continue;
      this.pending.add(tab);
      cx.spawn((cx) => this.react(tab, list, was.split(","), cx));
    }
    this.seen = now;
    // A pane zoomed or unzoomed, or the app zoom changed: even out that tab (the focused one for app zoom), as Cmd+Alt+E does.
    const zoomed = new Set(spaces().flatMap((s) => s.tabs ?? []).filter((t) => t.zoomed).map((t) => t.id));
    const scale = settings().zoom;
    if (this.zoomed) {
      const flipped = [...zoomed, ...this.zoomed].filter((t) => zoomed.has(t) !== this.zoomed.has(t));
      if (scale !== this.scale && focused()?.tab) flipped.push(focused().tab);
      for (const tab of new Set(flipped)) if (!this.pending.has(tab)) cx.spawn(() => this.force(tab));
    }
    this.zoomed = zoomed;
    this.scale = scale;
    // Moving focus is when a dragged divider has most likely settled: note the sizes then.
    const f = focused()?.pane ?? null;
    if (this.focus !== null && f !== this.focus) cx.spawn(() => this.snapshot());
    this.focus = f;
    return div();
  }
}
