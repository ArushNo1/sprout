import asyncio

from uagents import Agent, Context

# Python 3.14 no longer creates a default event loop, which uagents expects.
asyncio.set_event_loop(asyncio.new_event_loop())

agent = Agent(name="alice", seed="any secret phrase you pick", port=8001, mailbox=True)


@agent.on_event("startup")
async def hello(ctx: Context):
    ctx.logger.info(f"I'm {ctx.agent.name}, address: {ctx.agent.address}")


if __name__ == "__main__":
    agent.run()
