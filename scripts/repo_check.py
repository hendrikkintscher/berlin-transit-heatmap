# ruff: noqa
# fmt: off
# (vendored into repos with their own lint rules: kept out of their ruff check and ruff format)
"""Bookkeeping check for a repo: feature_list.json, PROGRESS.md, VERSION vs CHANGELOG.md, retired files, local links.

One source: project-templates/kit/ckit/repo_check.py. sync_template.py copies it byte-identical into each repo's
scripts/repo_check.py, so pre-push hooks and cloud sessions need no install. Never edit a copy: change the source,
bump project-templates/VERSION and run `py sync_template.py --apply`.
Per-repo settings: scripts/check.toml (every key optional, defaults in DEFAULTS below).

Usage: python scripts/repo_check.py [--root DIR] [--json]     exit 1 on any problem
Stdlib only, Python >= 3.11 (tomllib).
"""
import json
import pathlib
import re
import subprocess
import sys
import urllib.parse

try:
    import tomllib
except ImportError:  # Python < 3.11
    tomllib = None

TASK_KEYS = ("id", "title", "kind", "owner", "priority", "size", "deps", "test", "passes")
PRIORITIES = (None, "high", "medium", "normal", "low", 1, 2, 3, 4, 5)  # words, or 1 (highest) to 5
SIZES = (None, "S", "M", "L")
LINK_SKIP = (".git", "node_modules", ".venv", "venv", "build", "dist", ".gradle", ".godot", "worktrees", "__pycache__")

DEFAULTS = {
    "tasks": {"file": "feature_list.json", "required": True, "keys": list(TASK_KEYS)},
    "progress": {"file": "PROGRESS.md", "required": True, "max_entries": 10},
    # mode: "section" = VERSION needs a CHANGELOG.md section; "git" = history in git only, VERSION and CHANGELOG.md
    # must not exist; "off" = not checked
    "changelog": {"mode": "section"},
    "retired": {"files": ["HANDOVER.md", "docs/HANDOVER.md", "ROADMAP.md"]},
    # skip_dirs adds to LINK_SKIP; outside-repo links (../other-repo) are not checked; code spans/blocks are ignored
    "links": {"check": True, "skip_dirs": []},
}


def load_config(root):
    """DEFAULTS merged with scripts/check.toml (section by section). Raises ValueError on a bad file."""
    cfg = {k: dict(v) for k, v in DEFAULTS.items()}
    p = pathlib.Path(root) / "scripts" / "check.toml"
    if not p.exists():
        return cfg
    if tomllib is None:
        raise ValueError("scripts/check.toml needs Python >= 3.11 (tomllib)")
    try:
        data = tomllib.loads(p.read_text(encoding="utf-8"))
    except (OSError, tomllib.TOMLDecodeError) as e:
        raise ValueError(f"scripts/check.toml: {e}") from e
    for sec, vals in data.items():
        if sec not in cfg or not isinstance(vals, dict):
            raise ValueError(f"scripts/check.toml: unknown section [{sec}]")
        unknown = set(vals) - set(DEFAULTS[sec])
        if unknown:
            raise ValueError(f"scripts/check.toml: unknown key(s) in [{sec}]: {sorted(unknown)}")
        cfg[sec].update(vals)
    return cfg


def load_features(path):
    """Tasks from feature_list.json. Accepts {"features": [...]}, older {"tasks": [...]} and a plain list.
    Returns (features, error); error is None when it parsed."""
    try:
        data = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        return [], f"unreadable ({e})"
    if isinstance(data, dict):
        data = data.get("features", data.get("tasks"))
    if not isinstance(data, list) or not all(isinstance(f, dict) for f in data):
        return [], 'no task list (want {"features": [...]})'
    return data, None


def validate_features(features, keys=TASK_KEYS):
    fail = []
    ids = [f.get("id") for f in features]
    dups = sorted({str(i) for i in ids if ids.count(i) > 1})
    if dups:
        fail.append(f"duplicate ids {dups}")
    for f in features:
        fid = f.get("id", "?")
        missing = set(keys) - f.keys()
        if missing:
            fail.append(f"{fid}: missing {sorted(missing)}")
        if not isinstance(f.get("passes"), bool):
            fail.append(f"{fid}: passes must be true or false")
        if f.get("priority") not in PRIORITIES:
            fail.append(f"{fid}: priority must be high, medium, normal, low or 1-5")
        if f.get("size") not in SIZES:
            fail.append(f"{fid}: size must be S, M or L")
        deps = f.get("deps", [])
        for d in deps if isinstance(deps, list) else [deps]:
            if d not in ids:
                fail.append(f"{fid}: unknown dep {d}")
    return fail


def progress_entries(text):
    return len(re.findall(r"^## \d{4}-\d{2}-\d{2}", text, re.M))


def changelog_has(version, text):
    """The shared rule: a heading '## X.Y.Z ·', '## [X.Y.Z] —', '## vX.Y.Z - ' ... for this version."""
    return bool(re.search(rf"^## \[?v?{re.escape(version)}\]?[\s·—-]", text, re.M))


CODE = re.compile(r"^(```|~~~).*?^\1[^\n]*$|`[^`\n]*`", re.M | re.S)
LINK = re.compile(r"\]\(\s*<?([^)#:>\s]+)>?(?:\s+\"[^\"]*\")?\s*\)")


def md_files(root, skip):
    root = pathlib.Path(root)
    try:
        r = subprocess.run(["git", "ls-files", "-co", "--exclude-standard", "-z", "--", "*.md"], cwd=root,
                           capture_output=True, timeout=60)
        if r.returncode == 0:
            files = [root / p for p in r.stdout.decode("utf-8", "replace").split("\0") if p]
            return [f for f in files if f.is_file() and not skip & set(f.relative_to(root).parts)]
    except (OSError, subprocess.TimeoutExpired):
        pass
    return [f for f in root.rglob("*.md") if not skip & set(f.relative_to(root).parts)]


def dead_links(root, skip_dirs=()):
    """Local Markdown links whose target is missing: 'file: dead link x'. '/x' counts from the repo root (as on
    GitHub); links that leave the repo, code spans and fenced blocks are ignored."""
    root = pathlib.Path(root).resolve()
    skip = set(LINK_SKIP) | set(skip_dirs)
    fail = []
    for md in sorted(md_files(root, skip)):
        text = CODE.sub("", md.read_text(encoding="utf-8", errors="replace"))
        for link in LINK.findall(text):
            link = urllib.parse.unquote(link)
            target = (root / link.lstrip("/")) if link.startswith("/") else (md.parent / link)
            target = target.resolve()
            if target != root and root not in target.parents:
                continue
            if not target.exists():
                fail.append(f"{md.relative_to(root).as_posix()}: dead link {link}")
    return fail


def read(p):
    return p.read_text(encoding="utf-8", errors="replace")


def check(root, cfg=None):
    """All checks for the repo at root. Returns a list of problems (empty = passed)."""
    root = pathlib.Path(root)
    try:
        cfg = cfg or load_config(root)
    except ValueError as e:
        return [str(e)]
    fail = []

    t = cfg["tasks"]
    tf = root / t["file"]
    if tf.exists():
        feats, err = load_features(tf)
        fail += [f"{t['file']}: {err}"] if err else [f"{t['file']}: {m}" for m in validate_features(feats, t["keys"])]
    elif t["required"]:
        fail.append(f"{t['file']}: missing")

    pr = cfg["progress"]
    pf = root / pr["file"]
    if pf.exists():
        n = progress_entries(read(pf))
        if n > pr["max_entries"]:
            fail.append(f"{pr['file']}: {n} entries (> {pr['max_entries']}), roll older ones into the summary")
    elif pr["required"]:
        fail.append(f"{pr['file']}: missing")

    mode = cfg["changelog"]["mode"]
    if mode == "section":
        vf, cf = root / "VERSION", root / "CHANGELOG.md"
        if not vf.exists() or not cf.exists():
            fail.append("VERSION or CHANGELOG.md missing (set [changelog] mode = \"git\" in scripts/check.toml if history is git only)")
        else:
            v = read(vf).strip()
            if not changelog_has(v, read(cf)):
                fail.append(f"VERSION {v} has no '## {v} · YYYY-MM-DD' section in CHANGELOG.md")
    elif mode == "git":
        fail += [f"{f}: retired, history is in git; delete it" for f in ("VERSION", "CHANGELOG.md") if (root / f).exists()]
    elif mode != "off":
        fail.append(f"scripts/check.toml: [changelog] mode must be section, git or off, not {mode!r}")

    for old in cfg["retired"]["files"]:
        if (root / old).exists():
            fail.append(f"{old}: retired, migrate it into feature_list.json + PROGRESS.md")

    if cfg["links"]["check"]:
        fail += dead_links(root, cfg["links"]["skip_dirs"])
    return fail


def main(argv=None):
    args = list(sys.argv[1:] if argv is None else argv)
    as_json = "--json" in args
    root = pathlib.Path(__file__).resolve().parent.parent
    if "--root" in args:
        root = pathlib.Path(args[args.index("--root") + 1])
    fail = check(root)
    if as_json:
        print(json.dumps({"ok": not fail, "problems": fail}, ensure_ascii=False, indent=1))
    else:
        print("\n".join(fail) if fail else "bookkeeping check passed")
    return 1 if fail else 0


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
