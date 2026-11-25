"""Bookkeeping checks run by scripts/check.sh: runs scripts/repo_check.py, configured by scripts/check.toml.
Synced from project-templates (sync_template.py); do not edit. Exit 1 on any problem."""
import pathlib
import runpy
import sys

sys.argv[0] = str(pathlib.Path(__file__).with_name("repo_check.py"))
runpy.run_path(sys.argv[0], run_name="__main__")
