// Cmd+W (keys.json: "mod.open:confirm-pane-close"): asks "Close pane?" before closing the
// focused pane. The shipped `confirm` dialog's look; drawn here rather than opened from here,
// because a dialog another mod opens doesn't get the keyboard. Enter closes, Esc cancels.
// The pane is named when the dialog opens, so focus moving to it can't change which closes.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run, props, closeOverlay, theme, focused, panes } from "herdr";

export default class ConfirmPaneClose extends View {
  init(_props, cx) {
    const id = focused()?.pane;
    this.pane = id && panes().find((p) => p.pane === id);
    this.handle = cx.focus_handle();
    // Focusing in the same press that opened it doesn't hold; after it's drawn does.
    cx.timer.after(30, () => this.handle.focus());
    if (!this.pane) cx.timer.after(0, () => closeOverlay(props().overlay));
  }

  yes() {
    closeOverlay(props().overlay);
    run("pane.close", { pane: this.pane.pane });
  }

  render() {
    const t = theme();
    // Closing the dialog hands focus elsewhere; give it back to the pane.
    const no = () => { closeOverlay(props().overlay); if (this.pane) run("pane.focus", { pane: this.pane.pane }); };
    const button = (id, label, bg, fg, onClick) =>
      h_flex().id(id).h(32).px(14).items_center().rounded(8).border_1().border_color(id === "no" ? t.input : bg).bg(bg).text_color(fg).cursor_pointer().hover((s) => s.opacity(0.88)).on_click(onClick).child(label);
    return v_flex().id("confirm").track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "enter") this.yes();
        else if (e.key === "escape") no();
        else return;
        cx.stop_propagation();
      })
      .size_full().min_h(0).p(18).gap(12).bg(t.popover).text_size(13)
      .child(h_flex().items_center().child(div().flex_1().text_size(15).font_semibold().text_color(t.foreground).child("Close pane?")).child(div().text_size(11).text_color(t.dim).child("Esc")))
      .child(div().flex_1().min_h(0).truncate().text_color(t.muted).child(this.pane?.title || "Its terminal ends."))
      .child(h_flex().justify_end().gap(8).text_size(12)
        .child(button("no", "Cancel", t.raised, t.foreground, no))
        .child(button("yes", "Close", t.solid, t.solid_foreground, () => this.yes())));
  }
}
