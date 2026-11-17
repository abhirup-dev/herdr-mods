// Cmd+W (keys.json: "mod.open:confirm-pane-close"): asks "Close pane?" before closing the
// focused pane, in a small window (mod.json: a "window" overlay, not a dialog: a dialog dims the
// app and hides every pane's focus border). The pane keeps the keyboard and its focus border
// turns red while it asks, so you see which pane closes. Keys go to the terminal, so: click
// Close to close; Cmd+W again (mod.open toggles it) or Cancel keeps it.
// The look from before is kept in shared() and put back however the dialog ends.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run, props, closeOverlay, theme, focused, panes, layout, shared, setShared, checking } from "herdr";

const SAVED = "confirm-pane-close.focus";
const RED = { width: 2, color: "ansi1" };

// The shown layout's pane looks (`{tab, pane}` blocks), replaced with layout.set (applies live).
const looks = (n, out = []) => {
  if (n && typeof n === "object") {
    if (n.content?.tab !== undefined && n.content.pane) out.push(n.content.pane);
    for (const v of Object.values(n)) looks(v, out);
  }
  return out;
};
const paint = (focus) => {
  const l = layout();
  const all = looks(l);
  if (!all.length) return;
  for (const p of all) p.focus = focus;
  run("layout.set", { layout: l });
};

export default class ConfirmPaneClose extends View {
  init(_props, cx) {
    const id = focused()?.pane;
    this.pane = id && panes().find((p) => p.pane === id);
    if (!this.pane) return void cx.timer.after(0, () => closeOverlay(props().overlay));
    if (checking()) return; // herdr-app check runs commands for real: leave the layout alone
    // A look saved by a dialog that never got to put it back (a quit) is the real one.
    setShared(SAVED, shared(SAVED) ?? looks(layout())[0]?.focus ?? { width: 1, color: "accent" });
    paint(RED);
  }

  restore() {
    const before = shared(SAVED);
    if (!before) return;
    setShared(SAVED, null);
    paint(before);
  }

  // Herdr calls close() when the overlay goes away: Cmd+W again, a layout switch.
  close() {
    this.restore();
  }

  yes() {
    this.restore();
    closeOverlay(props().overlay);
    run("pane.close", { pane: this.pane.pane });
  }

  no() {
    this.restore();
    closeOverlay(props().overlay);
  }

  render() {
    const t = theme();
    const button = (id, label, bg, fg, onClick) =>
      h_flex().id(id).h(32).px(14).items_center().rounded(8).border_1().border_color(id === "no" ? t.input : bg).bg(bg).text_color(fg).cursor_pointer().hover((s) => s.opacity(0.88)).on_click(onClick).child(label);
    return v_flex().id("confirm")
      .size_full().min_h(0).p(18).gap(12).bg(t.popover).text_size(13)
      .child(h_flex().items_center().child(div().flex_1().text_size(15).font_semibold().text_color(t.foreground).child("Close pane?")).child(div().text_size(11).text_color(t.dim).child("⌘W keeps")))
      .child(div().flex_1().min_h(0).truncate().text_color(t.muted).child(this.pane?.title || "Its terminal ends."))
      .child(h_flex().justify_end().gap(8).text_size(12)
        .child(button("no", "Cancel", t.raised, t.foreground, () => this.no()))
        .child(button("yes", "Close", t.solid, t.solid_foreground, () => this.yes())));
  }
}
