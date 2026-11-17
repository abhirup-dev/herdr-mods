// Subsequence match: null if q's letters aren't all in s in order; else a score, higher better
// (consecutive letters, word starts and an early first letter count).
export function fuzzy(q, s) {
  if (!q) return 0;
  const hay = s.toLowerCase();
  let score = 0, at = -1, run_ = 0;
  for (const ch of q.toLowerCase()) {
    if (ch === " ") continue;
    const i = hay.indexOf(ch, at + 1);
    if (i < 0) return null;
    run_ = i === at + 1 ? run_ + 1 : 0;
    score += 1 + run_ * 3 + (i === 0 || /[\/\-_.:# ]/.test(hay[i - 1]) ? 2 : 0);
    at = i;
  }
  return score - hay.indexOf(q.toLowerCase().trim()[0]) * 0.01;
}
