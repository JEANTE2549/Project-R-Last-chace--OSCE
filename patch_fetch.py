import re

file_path = "patient-simulator-widget.js"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# For fetches that only have a URL: fetch(...) -> fetch(..., { headers: { 'ngrok-skip-browser-warning': '1' } })
# We only want to match fetch(`...`) without existing options.
content = re.sub(
    r"fetch\((`\$\{fetchBase[^\}]*\}[^`]*`)\)",
    r"fetch(\1, { headers: { 'ngrok-skip-browser-warning': '1' } })",
    content
)

# For fetches that already have options: fetch(..., { -> fetch(..., { headers: { 'ngrok-skip-browser-warning': '1' }, 
content = re.sub(
    r"fetch\((`\$\{fetchBase[^\}]*\}[^`]*`),\s*\{",
    r"fetch(\1, { headers: { 'ngrok-skip-browser-warning': '1' },",
    content
)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Patched fetch calls safely!")
