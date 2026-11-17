// How a line of panes resizes after the app's own split or close; see main.js.

export const weight = (c) => c.size?.weight ?? 1;

// The line's weights after the app's own split or close, adapted; null when nothing to change.
// `was`: the tab's panes before the change. `before`: the line's panes and weights as last read
// ({ids, weights}), needed for a close; null when unknown or not from just before this change.
export function adapt(children, was, before) {
  const ids = children.map((c) => c.id);
  const w = children.map(weight);
  const added = ids.filter((id) => !was.includes(id));
  const gone = was.filter((id) => !ids.includes(id));
  if (added.length === 1 && gone.length === 0 && ids.length === was.length + 1) {
    // The app halved the pane before the new one (or after it, when the new one is first).
    const i = ids.indexOf(added[0]);
    const s = i > 0 ? i - 1 : i + 1;
    w[s] += w[i];
    const others = w.filter((_, k) => k !== i);
    w[i] = others.reduce((a, b) => a + b, 0) / others.length;
    return w;
  }
  if (gone.length === 1 && added.length === 0 && before) {
    // The app gave the closed pane's share to its left neighbour (right, when it was first).
    const at = before.ids.indexOf(gone[0]);
    const share = before.weights[at];
    const left = before.ids.slice(0, at).reverse().find((id) => ids.includes(id));
    const right = before.ids.slice(at + 1).find((id) => ids.includes(id));
    const k = ids.indexOf(left ?? right);
    if (k < 0 || !(w[k] - share > 1e-6)) return null;
    w[k] -= share;
    return w;
  }
  return null;
}
