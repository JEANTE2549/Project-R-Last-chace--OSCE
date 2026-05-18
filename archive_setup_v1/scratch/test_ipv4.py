from ollama import Client

client = Client(host='http://127.0.0.1:11434')
try:
    models = client.list()
    print("Connected! Models:", [m['name'] for m in models['models']])
except Exception as e:
    print("Error:", e)
