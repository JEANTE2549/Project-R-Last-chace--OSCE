from ollama import Client

client = Client()
try:
    models = client.list()
    print("Connected! Models:", [m['name'] for m in models['models']])
except Exception as e:
    print("Error:", e)
