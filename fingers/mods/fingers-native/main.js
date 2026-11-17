// Fingers hint mode. Opened by a key (mod.open:fingers-native): starts fingers.py in a new core
// terminal, shows it in place of the focused pane (terminal.show) and closes itself.
// fingers.py draws the pane's text with hints, acts on the picked one and gives the pane back.
import { View, div } from "gpui-kit";
import { appHome, closeOverlay, focused, hc, notify, props, run, terminals } from "herdr";

export default class Fingers extends View {
  init(_props, cx) {
    if (!props()?.overlay) return; // a docked copy does nothing; only the key's overlay acts
    const f = focused();
    const done = () => closeOverlay(props().overlay);
    if (!f?.terminal || !f?.pane) {
      notify({ title: "Fingers", body: "Focus a terminal pane first", level: "warning" });
      return done();
    }
    cx.spawn(async (cx) => {
      const script = `${appHome()}/mods/fingers-native/fingers.py`;
      // make install links the fastest Python here (Apple's 3.9 starts ~5x slower).
      const python = `${appHome()}/mods/fingers-native/python3`;
      const r = await hc(["run", "--bg", "--json", "--rm", "--no-parent", "--", python, "-I", script, "hints", f.terminal, f.pane]);
      let t = null;
      try { t = JSON.parse(r.stdout); } catch {}
      if (!t?.address) {
        notify({ title: "Fingers", body: (r.stderr || r.stdout || "hc run failed").trim(), level: "error" });
        return done();
      }
      // The app hears of the new terminal a moment after hc returns; show it once it has.
      for (let i = 0; i < 40 && !terminals().some((x) => x.address === t.address); i++) await cx.sleep(25);
      done(); // this launcher must be gone first, or terminal.show doesn't take
      run("terminal.show", { terminal: t.address, pane: f.pane });
    });
  }

  render() {
    return div();
  }
}
