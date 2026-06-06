import os

# Read the template
with open('server_template.js', 'r', encoding='utf-8') as f:
    content = f.read()

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(content)

size = os.path.getsize('server.js')
print(f"server.js restored: {size} bytes")
