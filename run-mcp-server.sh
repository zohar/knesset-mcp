#!/bin/bash

# Check if TypeScript is installed
if ! command -v tsc &> /dev/null; then
    echo "TypeScript compiler (tsc) not found. Installing..."
    npm install -g typescript
fi

# Compile the TypeScript file
echo "Compiling the knesset-mcp-server-fix.ts file..."
npx tsc --module esnext --moduleResolution node --target es2022 --esModuleInterop true knesset-mcp-server-fix.ts

# Run the compiled JavaScript
echo "Running the MCP server..."
node knesset-mcp-server-fix.js 2> mcp-server-fix.log

# The log will be saved to mcp-server-fix.log
# To view logs in real-time, open another terminal and run:
# tail -f mcp-server-fix.log