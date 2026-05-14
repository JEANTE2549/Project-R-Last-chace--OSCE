import asyncio
from ollama import AsyncClient

async def test():
    client = AsyncClient()
    try:
        models = await client.list()
        print("Connected! Models:", [m['name'] for m in models['models']])
    except Exception as e:
        print("Error:", e)

asyncio.run(test())
