// The pane header's split / zoom / close buttons, in the tab bar, for the focused pane.
import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { focused, panes, run, theme } from "herdr";

export default class PaneActions extends View {
  button(t, icon, command, args) {
    return div()
      .id(`pa-${icon}`)
      .p(4)
      .rounded(4)
      .text_color(t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run(command, args);
      })
      .child(svg(`mods/pane/${icon}.svg`).size(14));
  }

  render() {
    const t = theme();
    const pane = focused()?.pane;
    const zoomed = panes().find((p) => p.pane === pane)?.zoomed;
    return h_flex()
      .size_full()
      .items_center()
      .justify_end()
      .gap(2)
      .pr(8)
      .when(!!pane, (el) =>
        el
          .child(this.button(t, "split-right", "pane.split", { direction: "right", pane }))
          .child(this.button(t, "split-down", "pane.split", { direction: "down", pane }))
          .child(this.button(t, zoomed ? "unzoom" : "zoom", "pane.zoom", { pane }))
          .child(this.button(t, "close", "pane.close", { pane })));
  }
}
