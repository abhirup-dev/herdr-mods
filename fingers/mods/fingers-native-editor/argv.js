// The machine's own editor, read where it runs: its login shell's $VISUAL, then $EDITOR, then the
// system default (`editor` on Debian), then vi. `+line` (vi, vim, nvim, nano, emacs) when known.
// The file comes in as "$@", never through a parser.
const ENV_LAUNCH =
  'exec "${SHELL:-/bin/sh}" -lic \'e=${VISUAL:-$EDITOR}; [ -n "$e" ] || e=$(command -v editor || echo vi); eval "exec $e \\"\\$@\\""\' "$0" "$@"';

/** argv that opens `path` in `editor`: "env" (the machine's own, above) or a template. */
export function launchArgv(editor, path, line, col) {
  if (editor !== "env") return editorArgv(editor, path, line, col);
  return ["/bin/sh", "-c", ENV_LAUNCH, "fingers-editor", ...(line ? [`+${line}`] : []), path];
}

/** argv for `template` ("nvim +{line} {path}"): words split on spaces (quotes group), placeholders
 *  filled, words holding {line}/{col} dropped when there is none. No {path}: `+{line} {path}` is
 *  appended, as herdr-fingers does. No shell: a file name is one argument whatever it holds. */
export function editorArgv(template, path, line, col) {
  const words = template.match(/"[^"]*"|'[^']*'|\S+/g)?.map((w) => w.replace(/^(["'])(.*)\1$/, "$2")) ?? [];
  if (!words.some((w) => w.includes("{path}"))) words.push(...(line ? ["+{line}"] : []), "{path}");
  return words
    .filter((w) => (!w.includes("{line}") || line) && (!w.includes("{col}") || col))
    .map((w) => w.replaceAll("{path}", path).replaceAll("{line}", String(line ?? "")).replaceAll("{col}", String(col ?? "")));
}
