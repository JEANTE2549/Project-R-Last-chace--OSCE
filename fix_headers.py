import re

with open('patient-simulator-widget.js', 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace(
    "{ headers: { 'ngrok-skip-browser-warning': '1' }, headers: { 'ngrok-skip-browser-warning': '1' } }", 
    "{ headers: { 'ngrok-skip-browser-warning': '1' } }"
)

with open('patient-simulator-widget.js', 'w', encoding='utf-8') as f:
    f.write(c)

print("Fixed duplicates.")
