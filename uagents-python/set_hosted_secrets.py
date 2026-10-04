"""Sets each hosted agent's secrets on Agentverse from your local files. Run it yourself:

    python set_hosted_secrets.py              # all three
    python set_hosted_secrets.py sprout       # or tutor / curriculum / arcade / garden

Reads AGENTVERSE_API_KEY, ASI_ONE_API_KEY, SPACETIMEDB_DB and TRUSTED_ORCHESTRATORS from
uagents-python/.env, and each agent's database token from uagents-python/.env.agents
(<AGENT>_SPACETIMEDB_TOKEN, one per agent). Prints names only, never values.
"""

import os
import sys
from pathlib import Path

from dotenv import dotenv_values, load_dotenv

import deploy_hosted as d

HERE = Path(__file__).parent
load_dotenv(HERE / ".env")
local, agents = dotenv_values(HERE / ".env"), dotenv_values(HERE / ".env.agents")
TOKEN_VAR = {name: f"{name.upper()}_SPACETIMEDB_TOKEN" for name in d.ADDRESSES}

if __name__ == "__main__":
    key = os.getenv("AGENTVERSE_API_KEY") or sys.exit("Set AGENTVERSE_API_KEY in uagents-python/.env")
    for target in sys.argv[1:] or list(d.ADDRESSES):
        secrets = {"ASI_ONE_API_KEY": local.get("ASI_ONE_API_KEY"),
                   "SPACETIMEDB_DB": local.get("SPACETIMEDB_DB") or "sprout-live",
                   "SPACETIMEDB_TOKEN": agents.get(TOKEN_VAR[target])}
        if target != "sprout":
            secrets["TRUSTED_ORCHESTRATORS"] = local.get("TRUSTED_ORCHESTRATORS")
        for name, value in secrets.items():
            if not value:
                print(f"{target}: {name} missing locally, skipped")
                continue
            r = d.request("POST", "/v1/hosting/secrets", key,
                          json={"address": d.ADDRESSES[target], "name": name, "secret": value})
            print(f"{target}: {name} -> {r.status_code}")
