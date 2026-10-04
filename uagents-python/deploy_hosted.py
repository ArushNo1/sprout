"""Uploads the hosted builds to Agentverse: build, stop the agent, replace its files, start it again.

    python deploy_hosted.py                 # all three
    python deploy_hosted.py sprout          # or tutor / curriculum
    python deploy_hosted.py --dry-run       # build and list the files, change nothing

Needs AGENTVERSE_API_KEY (agentverse.ai > Profile > API Keys) in uagents-python/.env or the
environment. Secrets in each agent's editor .env (ASI_ONE_API_KEY, SPACETIMEDB_TOKEN, ...) are not
touched. The files are replaced as a set, so anything in the agent that isn't in dist/ is dropped.
"""

import json
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

import build_hosted

HERE = Path(__file__).parent
load_dotenv(HERE / ".env")

API = os.getenv("AGENTVERSE_URL", "https://agentverse.ai").rstrip("/")
ADDRESSES = {
    "sprout": os.getenv("SPROUT_ADDRESS", "agent1q27e9dntmewremft08ehnpdd7davz8kgy7dz744gr87q9jfqvewuq2h7q4g"),
    "tutor": os.getenv("TUTOR_ADDRESS", "agent1qfd9vn03a5udss62gpl9nag9r6qljz9td0ngmrdfzea70csvk04hwpc5upy"),
    "curriculum": os.getenv("CURRICULUM_ADDRESS", "agent1qtddszc00qe3jgkpsu652wvp0nm4j4tywcpjt554ct5acn09gs3lu3nk8nh"),
}


def files_for(target: str) -> list:
    folder = build_hosted.DIST / target
    paths = sorted(folder.glob("*.py"), key=lambda p: (p.name != "agent.py", p.name))  # agent.py first
    return [{"id": i, "name": p.name, "value": p.read_text(), "language": "python"} for i, p in enumerate(paths)]


def request(method: str, path: str, token: str, **kwargs) -> requests.Response:
    return requests.request(method, f"{API}{path}", headers={"Authorization": f"Bearer {token}"}, timeout=60, **kwargs)


def upload(address: str, files: list, token: str):
    # The API documents `code` as the list of files; older examples send it as a JSON string. Try both.
    r = request("PUT", f"/v1/hosting/agents/{address}/code", token, json={"code": files})
    if r.status_code in (400, 422):
        r = request("PUT", f"/v1/hosting/agents/{address}/code", token, json={"code": json.dumps(files)})
    r.raise_for_status()
    return r.json().get("digest", "")


def deploy(target: str, token: str):
    address, files = ADDRESSES[target], files_for(target)
    print(f"{target}: {len(files)} files -> {address[:20]}...")
    request("POST", f"/v1/hosting/agents/{address}/stop", token).raise_for_status()
    try:
        print(f"  uploaded, digest {upload(address, files, token)[:12]}")
    finally:
        request("POST", f"/v1/hosting/agents/{address}/start", token).raise_for_status()  # never leave it stopped
    print("  running")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    targets = args or ["sprout", "tutor", "curriculum"]
    unknown = [t for t in targets if t not in ADDRESSES]
    if unknown:
        sys.exit(f"unknown target {unknown}; use sprout, tutor or curriculum")
    for t in targets:
        build_hosted.build_sprout() if t == "sprout" else build_hosted.build_specialist(t)
    if "--dry-run" in sys.argv:
        for t in targets:
            print(f"{t}: " + ", ".join(f"{f['name']} ({len(f['value'].splitlines())} lines)" for f in files_for(t)))
        sys.exit(0)
    key = os.getenv("AGENTVERSE_API_KEY")
    if not key:
        sys.exit("Set AGENTVERSE_API_KEY (agentverse.ai > Profile > API Keys) in uagents-python/.env")
    for t in targets:
        deploy(t, key)
