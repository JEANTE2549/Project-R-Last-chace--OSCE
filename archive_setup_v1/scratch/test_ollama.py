import asyncio
from ollama import AsyncClient

async def test():
    client = AsyncClient()
    try:
        response = await client.chat(model='llama3.1', messages=[{'role': 'user', 'content': 'hello'}])
        print("Success:", response['message']['content'])
    except Exception as e:
        print("Error:", e)

asyncio.run(test())
