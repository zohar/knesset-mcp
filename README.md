# Knesset MCP Server

A Model Context Protocol (MCP) server for accessing the Israeli Knesset (Parliament) information API. This server provides structured access to committee data, bills, Knesset members, and more through standardized interfaces compatible with AI assistants like Claude.

## Features

- Get information about Knesset committees
- Access committee sessions and details
- Search for bills by type (private, government, committee)
- Get detailed information about specific bills
- Look up Knesset members by session

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/username/knesset-mcp.git
   cd knesset-mcp
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

### Running the Server

1. Make the run script executable:
   ```bash
   chmod +x run-new-mcp-server.sh
   ```

2. Run the server:
   ```bash
   ./run-new-mcp-server.sh
   ```

This will compile the TypeScript code and start the MCP server. Keep this terminal window open while using the server with Claude or other MCP clients.

### Integrating with Claude

1. Open Claude Desktop
2. Go to Settings (gear icon)
3. Select the "MCP Servers" tab
4. Click "Add New Server"
5. Fill in the following details:
   - **Name**: Knesset
   - **Command**: `node [FULL_PATH_TO_YOUR_DIRECTORY]/knesset-mcp-server-fix.js`
   
   Replace `[FULL_PATH_TO_YOUR_DIRECTORY]` with the absolute path to your directory.
   
   For example: 
   ```
   node /path/to/your/project/knesset-mcp-server-fix.js
   ```

6. Click "Add Server"

## Available Resources

The server exposes the following resources:

- `knesset://committees/{knessetNum}` - Get committees for a specific Knesset number
- `knesset://committee/{committeeId}/sessions` - Get sessions for a specific committee
- `knesset://bills/{billType}` - Get bills by type (private, government, committee)
- `knesset://knesset-members/{knessetNum}` - Get members of a specific Knesset

## Available Tools

- `get-bill-info` - Get detailed information about a specific bill by ID
- `search-bills-by-name` - Search for bills by keyword in their name
- `get-committee-info` - Get information about a specific committee by ID

## Troubleshooting

If you encounter connection issues:

1. Check the log file: `cat mcp-server-fix.log`
2. Ensure the path in Claude's configuration is absolute, not relative
3. Restart both the server and Claude
4. Make sure your TypeScript compilation completed successfully

## Data Source

This server accesses the official Knesset OData API at:
`http://knesset.gov.il/Odata/ParliamentInfo.svc`

## License

MIT
