## How to Deploy

1. Create a Python env and install deps:
   ```
   python -m venv .venv
   .venv\Scripts\activate
   pip install -r requirements.txt
   ```
2. Configure the agent:
   ```
   cd uagents-python
   copy .env.example .env   # then edit AGENT_SEED to a long secret phrase
   ```
3. Run it: `python agent.py`
4. The log prints an **Agent inspector** link. Open it and click **Connect → Mailbox** to link the agent to Agentverse.
5. In Agentverse, open the agent's dashboard, add a README and keywords, and it's discoverable on ASI:One via the chat protocol.

The agent keeps running only while `python agent.py` is running, so host it somewhere persistent (VM, Railway, Render, etc.) with `AGENT_SEED` set as an env var. Keep the same seed, since it fixes the agent's address.

Put your logic in `handle_text` in `uagents-python/agent.py`.
