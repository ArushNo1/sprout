from uagents import Agent, Context

agent = Agent(name="alice", seed="any secret phrase you pick", mailbox=True)

@agent.on_event("startup")
async def hello(ctx: Context):
    ctx.logger.info(f"I'm {ctx.agent.name}, address: {ctx.agent.address}")

if __name__ == "__main__":
    agent.run()