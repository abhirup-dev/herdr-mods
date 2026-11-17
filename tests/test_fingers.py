"""Tests for fingers.py's pure parts: config, matching and hints. Run: make test"""
import json, os, sys, tempfile, unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "mods", "fingers-native"))
import fingers  # noqa: E402

SCREEN = [
    "Updated config/terminal/herdr/config.toml:42 and ./install, see ~/.config/rc/keys.env.",
    "See https://github.com/anishathalye/dotbot#configuration and git@github.com:a/b.git, PR #482.",
    "Commits a130286 and e0e870e; UUID 3f2a9c1e-7b4d-4e8a-9f12-0c5d6e7a8b90.",
    "IP 192.168.1.24:8080, pod nginx-deployment-66b6c48dd5-7xb2r, on 20261031",
    "\tmodified:   src/main.rs",
    "--- a/lib/old.py",
    "Your branch is up to date with 'origin/main'.",
    "keys: open/copy/paste, 48k/500k tokens, keybindings, brew/Brewfile:14",
]


def texts(lines, overrides=None, exists=None):
    return {(m[2], m[3]) for m in fingers.find_matches(lines, fingers.compile_patterns(overrides or {}), exists)}


class Matching(unittest.TestCase):
    def test_kinds(self):
        got = texts(SCREEN)
        for want in [
            ("config/terminal/herdr/config.toml:42", "file"),
            ("./install", "file"),
            ("~/.config/rc/keys.env", "file"),  # trailing full stop dropped
            ("https://github.com/anishathalye/dotbot#configuration", "url"),
            ("git@github.com:a/b.git", "url"),
            ("a130286", "sha"),
            ("3f2a9c1e-7b4d-4e8a-9f12-0c5d6e7a8b90", "uuid"),  # whole, not split into SHAs
            ("192.168.1.24", "ip"),
            ("nginx-deployment-66b6c48dd5-7xb2r", "kubernetes-pod"),
            ("src/main.rs", "git-status"),  # the match group, not "modified:"
            ("lib/old.py", "diff"),
            ("origin/main", "git-status-branch"),
        ]:
            self.assertIn(want, got)

    def test_line_numbers_make_a_file(self):
        got = texts(SCREEN)
        self.assertIn(("brew/Brewfile:14", "file"), got)
        self.assertNotIn(("localhost:3000", "file"), texts(["http on localhost:3000 and host:22"]))

    def test_loose_paths_need_to_exist(self):
        with tempfile.TemporaryDirectory() as d:
            os.makedirs(os.path.join(d, "config/shell"))
            for f in ("config/shell/zshrc", "mise.toml"):
                open(os.path.join(d, f), "w").close()
            os.mkdir(os.path.join(d, ".git"))
            sub = os.path.join(d, "config")
            find = fingers.file_finder(sub)  # inside the repo: the git root resolves too
            line = ["edit config/shell/zshrc and mise.toml, not open/copy/paste or example.com"]
            got = fingers.find_matches(line, fingers.compile_patterns({}), find)
            self.assertEqual({(m[2], m[4]) for m in got}, {("config/shell/zshrc", True), ("mise.toml", True)})
            # Unverified anchored files stay, unmarked; existing ones are marked.
            got = fingers.find_matches(["./nope.py and ./mise.toml"], fingers.compile_patterns({}), fingers.file_finder(d))
            self.assertEqual({(m[2], m[4]) for m in got}, {("./nope.py", False), ("./mise.toml", True)})

    def test_remote_check_agrees_with_file_finder(self):
        """REMOTE_CHECK (sh, run on another machine) resolves like file_finder; run here to test it."""
        import subprocess
        with tempfile.TemporaryDirectory() as d:
            d = os.path.realpath(d)
            os.makedirs(os.path.join(d, "config/shell"))
            open(os.path.join(d, "config/shell/zshrc"), "w").close()
            open(os.path.join(d, "mise.toml"), "w").close()
            subprocess.run(["git", "init", "-q", d], check=True)
            sub = os.path.join(d, "config")
            rels = ["shell/zshrc", "mise.toml", "shell", "nope.py", d + "/mise.toml"]
            out = subprocess.run(["sh", "-c", fingers.REMOTE_CHECK, "fingers", sub, *rels], capture_output=True, text=True).stdout.split("\n")
            self.assertEqual(out[0], os.path.expanduser("~"))
            got = {row.split("\t")[1]: (row.split("\t")[0], row.split("\t")[2]) for row in out[1:] if row}
            local = fingers.file_finder(sub)
            for rel in rels:
                self.assertEqual(got.get(rel, (None, None))[1], local(rel), rel)
            self.assertEqual(got["shell"][0], "d")

    def test_machine_of(self):
        self.assertEqual((fingers.machine_of("vps/t7"), fingers.machine_of("t7")), ("vps", None))

    def test_ip_wins_over_loose_file(self):
        got = texts(["IP 192.168.1.24 here"], exists=lambda t: True)
        self.assertIn(("192.168.1.24", "ip"), got)

    def test_false_positives_stay_out(self):
        # What the TUI config dropped: word/word, k8s kinds inside words, plain numbers.
        got = {t for t, _ in texts(SCREEN)}
        for bad in ["open/copy/paste", "48k/500k", "bindings", "20261031", "#482"]:
            self.assertFalse(any(bad in t for t in got), bad)

    def test_no_overlaps(self):
        for y in range(len(SCREEN)):
            spans = sorted((m[1], m[1] + len(m[2])) for m in fingers.find_matches(SCREEN, fingers.compile_patterns({})) if m[0] == y)
            for (a, b), (c, _) in zip(spans, spans[1:]):
                self.assertLessEqual(b, c)

    def test_custom_and_disabled_patterns(self):
        got = texts(SCREEN + ["ticket ABC-123"], {"jira": r"\b[A-Z][A-Z0-9]+-\d+\b", "sha": False, "broken": "("})
        self.assertIn(("ABC-123", "jira"), got)
        self.assertFalse(any(k == "sha" for _, k in got))

    def test_long_words_stay_fast(self):
        import time
        start = time.monotonic()
        line = "a" * 300 + "/" + "b" * 300 + " " + "x." * 300  # wider than any real screen
        fingers.find_matches([line] * 60, fingers.compile_patterns({}))
        self.assertLess(time.monotonic() - start, 1.0)


class Hints(unittest.TestCase):
    def test_equal_width_no_prefixes(self):
        for alpha in fingers.ALPHABETS.values():
            for n in (1, 9, 10, 11, 25, 150):
                hs = fingers.make_hints(n, alpha)
                self.assertEqual(len(hs), n)
                self.assertEqual(len(set(hs)), n)
                self.assertEqual(len({len(h) for h in hs}), 1)

    def test_numeric(self):
        self.assertEqual(fingers.make_hints(3, "1234567890"), ["1", "2", "3"])
        self.assertEqual(fingers.make_hints(12, "1234567890")[:2], ["11", "12"])

    def test_same_text_same_hint_bottom_first(self):
        m = [(0, 0, "a/b", "file", None), (1, 0, "c/d", "file", None), (2, 0, "a/b", "file", None)]
        h = fingers.assign_hints(m, "as")
        self.assertEqual(h, {"a/b": "a", "c/d": "s"})


class Config(unittest.TestCase):
    def load(self, data):
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            f.write(data if isinstance(data, str) else json.dumps(data))
        try:
            return fingers.load_config(f.name)
        finally:
            os.unlink(f.name)

    def test_defaults_when_missing_or_invalid(self):
        self.assertEqual(fingers.load_config("/nonexistent")["alphabet"], fingers.ALPHABETS["alphabet"])
        self.assertEqual(self.load("{not json")["hints"], "alphabet")

    def test_editor_settings(self):
        c = fingers.load_config("/nonexistent")
        self.assertEqual((c["editor"], c["open_in"], c["split"]), ("env", "float", "right"))
        c = self.load({"editor": "nvim +{line} {path}", "open_in": "tab", "split": "down"})
        self.assertEqual((c["editor"], c["open_in"], c["split"]), ("nvim +{line} {path}", "tab", "down"))
        c = self.load({"editor": "  ", "open_in": "window", "split": "left"})
        self.assertEqual((c["editor"], c["open_in"], c["split"]), (None, "float", "right"))

    def test_split_line(self):
        self.assertEqual(fingers.split_line("a/b.lua:12"), (12, None))
        self.assertEqual(fingers.split_line("a/b.lua:12:5"), (12, 5))
        self.assertEqual(fingers.split_line("a/b.lua:1-64"), (1, None))
        self.assertEqual(fingers.split_line("a/b.lua"), (None, None))

    def test_new_path(self):  # where a missing file opens: absolute/~ as written, relative under cwd
        self.assertEqual(fingers.new_path("lua/plugins/x.lua:3", "/repo"), "/repo/lua/plugins/x.lua")
        self.assertEqual(fingers.new_path("/abs/x.lua:3:4", "/repo"), "/abs/x.lua")
        self.assertEqual(fingers.new_path("~/x.md", "/repo"), os.path.expanduser("~/x.md"))
        self.assertIsNone(fingers.new_path("rel/x.md", None))
        self.assertEqual(fingers.new_path("~/x.md:2", "/r", "/home/u"), "/home/u/x.md")  # another machine's home

    def test_numeric_and_bad_values(self):
        c = self.load({"hints": "numeric", "action": "fly", "alphabet": None})
        self.assertEqual((c["alphabet"], c["action"]), ("1234567890", "open"))
        self.assertEqual(self.load({"alphabet": "qwer"})["alphabet"], fingers.ALPHABETS["alphabet"])  # q cancels
        self.assertEqual(self.load({"alphabet": "jkjk"})["alphabet"], "jk")


if __name__ == "__main__":
    unittest.main()
