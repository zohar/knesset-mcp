# Knesset MCP Server

A Model Context Protocol (MCP) server for accessing the Israeli Knesset's parliamentary information API. This server provides a standardized interface for AI applications like Claude to query and interact with Knesset data.

## Features

- **Resources**: Access Knesset data through URI-based resources
  - Committee information by Knesset number
  - Committee sessions
  - Bills by type (private, government, committee)
  - Knesset member information

- **Tools**: Execute functions to get specific information
  - Get bill information by ID
  - Search bills by keyword
  - Get committee information
  - Get Knesset member details
  - Get current Knesset number

- **Prompts**: Pre-defined prompt templates for common analysis tasks
  - Analyze legislation process
  - Search for legislation related to specific topics
  - Analyze Knesset member voting records

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/knesset-mcp-server.git
cd knesset-mcp-server

# Install dependencies
npm install

# Build
npm run build
```

## Usage

### Running the server

```bash
# Start the server
npm start
```

### Using with Claude Desktop

1. Make sure you have [Claude Desktop](https://claude.ai/download) installed
2. Edit your Claude Desktop configuration at `~/Library/Application Support/Claude/claude_desktop_config.json` (Mac) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "knesset": {
      "command": "node",
      "args": [
        "/ABSOLUTE/PATH/TO/knesset-mcp-server/build/index.js"
      ]
    }
  }
}
```

3. Restart Claude Desktop
4. The Knesset MCP tools will now be available in Claude

## API Details

This server connects to the Knesset's ODATA API located at:
`http://knesset.gov.il/Odata/ParliamentInfo.svc`

### Resource URIs

- `knesset://committees/{knessetNum}` - Get committees for a specific Knesset number
- `knesset://committee/{committeeId}/sessions` - Get sessions for a specific committee
- `knesset://bills/{billType}` - Get bills by type (private, government, committee)
- `knesset://knesset-members/{knessetNum}` - Get members of a specific Knesset

### Tools

- `get-bill-info` - Get detailed information about a specific bill by ID
- `search-bills-by-name` - Search for bills by keyword in their name
- `get-committee-info` - Get information about a specific committee by ID
- `get-knesset-member` - Get information about a specific Knesset member by ID
- `get-current-knesset-number` - Get the number of the current Knesset

### Prompts

- `analyze-legislation-process` - Analyze the legislative process of a bill
- `search-related-legislation` - Search for legislation related to a specific topic
- `mk-voting-record` - Analyze the voting record of a Knesset member

## Development

To run the server in development mode:

```bash
npm run dev
```

For testing your MCP server, you can use the [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
npx @modelcontextprotocol/inspector node build/index.js
```

## License

MIT
