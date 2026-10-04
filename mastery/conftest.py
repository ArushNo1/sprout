# The original tests import modules flat (`from bkt import ...`). Putting this
# directory on sys.path lets them run both from inside mastery/ and as
# `python -m pytest mastery` from the repo root.
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
