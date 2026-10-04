"""Creates the Sprout Arcade and Sprout Garden hosted agents on Agentverse, with their profile README.

    python create_hosted_agents.py              # both
    python create_hosted_agents.py arcade       # or garden

Needs AGENTVERSE_API_KEY in uagents-python/.env. Each new agent's address is appended to .env as
ARCADE_ADDRESS / GARDEN_ADDRESS, which deploy_hosted.py and the Sprout orchestrator read. Then:

    python deploy_hosted.py arcade garden       # upload the code
    python set_hosted_secrets.py arcade garden  # ASI key, database token (your own registered token)
    python deploy_hosted.py sprout              # so Sprout can reach them

Agents that already have an address in .env are skipped. The agent's name, README (with the
Innovation Lab and hackathon badges) and description are set from the package README.
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

import deploy_hosted as d

HERE = Path(__file__).parent
load_dotenv(HERE / ".env")

AGENTS = {
    "arcade": ("Sprout Arcade", "ARCADE_ADDRESS",
               "Turns what you're weakest on into a multiplayer study game: live rooms and solo arcade runs "
               "that feed your Sprout mastery."),
    "garden": ("Sprout Garden", "GARDEN_ADDRESS",
               "Shows where you stand: your learning journey map, every course's garden, and answers to "
               "progress questions across courses."),
}


def create(key: str, target: str):
    name, var, description = AGENTS[target]
    if os.getenv(var):
        print(f"{target}: {var} already set, skipping")
        return
    r = d.request("POST", "/v1/hosting/agents", key, json={"name": name})
    r.raise_for_status()
    address = r.json()["address"]
    readme = (HERE / target / "README.md").read_text(encoding="utf-8")
    r = d.request("PUT", f"/v1/hosting/agents/{address}", key,
                  json={"name": name, "readme": readme, "short_description": description})
    print(f"{target}: created {address}; profile {'updated' if r.ok else f'not updated (HTTP {r.status_code})'}")
    with open(HERE / ".env", "a", encoding="utf-8") as f:
        f.write(f"\n{var}={address}\n")


if __name__ == "__main__":
    key = os.getenv("AGENTVERSE_API_KEY") or sys.exit("Set AGENTVERSE_API_KEY in uagents-python/.env")
    for target in sys.argv[1:] or list(AGENTS):
        create(key, target)
