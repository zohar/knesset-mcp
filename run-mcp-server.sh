#!/bin/bash

# Build the project
echo "Building the project..."
npm run build

# Run the MCP server and redirect stderr to a log file
echo "Starting the MCP server..."
node build/knesset-mcp-server.js 2> mcp-server.log

# Note: To view logs in real-time in another terminal, run:
# tail -f mcp-server.log
