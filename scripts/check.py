"""Bookkeeping checks run by scripts/check.sh. Exit 1 on any problem."""
import json
import pathlib
import re
import sys

root = pathlib.Path(__file__).resolve().parent.parent
fail = []

# Tasks: feature_list.json
keys = {"id", "title", "kind", "owner", "priority", "size", "deps", "test", "passes"}
try:
    features = json.loads((root / "feature_list.json").read_text(encoding="utf-8"))["features"]
except (OSError, ValueError, KeyError) as e:
    features = []
    fail.append(f"feature_list.json: unreadable ({e})")
ids = [f.get("id") for f in features]
if len(ids) != len(set(ids)):
    fail.append("feature_list.json: duplicate ids")
for f in features:
    fid = f.get("id", "?")
    missing = keys - f.keys()
    if missing:
        fail.append(f"{fid}: missing {sorted(missing)}")
    if not isinstance(f.get("passes"), bool):
        fail.append(f"{fid}: passes must be true or false")
    if f.get("priority") not in (None, "high", "medium", "low"):
        fail.append(f"{fid}: priority must be high, medium or low")
    if f.get("size") not in (None, "S", "M", "L"):
        fail.append(f"{fid}: size must be S, M or L")
    for d in f.get("deps", []):
        if d not in ids:
            fail.append(f"{fid}: unknown dep {d}")

# Session log: PROGRESS.md
progress = (root / "PROGRESS.md").read_text(encoding="utf-8")
entries = re.findall(r"^## \d{4}-\d{2}-\d{2}", progress, re.M)
if len(entries) > 10:
    fail.append(f"PROGRESS.md: {len(entries)} entries (> 10), roll older ones into the summary")

# History: VERSION has a CHANGELOG.md section
version = (root / "VERSION").read_text(encoding="utf-8").strip()
# This repo keeps Keep a Changelog headings: "## [X.Y.Z] — YYYY-MM-DD".
if f"## [{version}] — " not in (root / "CHANGELOG.md").read_text(encoding="utf-8"):
    fail.append(f"VERSION {version} has no '## [{version}] — YYYY-MM-DD' section in CHANGELOG.md")

# Retired files
for old in ("HANDOVER.md", "docs/HANDOVER.md", "ROADMAP.md"):
    if (root / old).exists():
        fail.append(f"{old}: retired, migrate it into feature_list.json + PROGRESS.md")

# Local Markdown links
skip = {".git", "node_modules", ".venv", "venv", "dist", "work", "data"}
for md in root.rglob("*.md"):
    if skip & set(md.parts):
        continue
    for link in re.findall(r"\]\(([^)#:]+)\)", md.read_text(encoding="utf-8")):
        if not (md.parent / link).exists():
            fail.append(f"{md.relative_to(root)}: dead link {link}")

print("\n".join(fail) if fail else "bookkeeping check passed")
sys.exit(1 if fail else 0)
