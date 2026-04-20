# Knesset MCP Server

A Model Context Protocol (MCP) server for accessing the Israeli Knesset's parliamentary information API. Exposes a focused set of tools so AI assistants like Claude can query bills, committees, and members from the Knesset OData service.

## Requirements

- Node.js **>= 20.10.0** (older versions fail with `SELF_SIGNED_CERT_IN_CHAIN` against `knesset.gov.il`)

## Installation

```bash
git clone https://github.com/yourusername/knesset-mcp-server.git
cd knesset-mcp-server
npm install
npm run build
```

## Usage

### Running the server

```bash
npm start       # run the built server
npm run dev     # run TypeScript directly via ts-node
```

### Using with Claude Desktop

1. Install [Claude Desktop](https://claude.ai/download).
2. Edit your Claude Desktop configuration at `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "knesset": {
      "command": "node",
      "args": [
        "/ABSOLUTE/PATH/TO/knesset-mcp-server/build/knesset-mcp-server.js"
      ]
    }
  }
}
```

3. Restart Claude Desktop — the Knesset tools will be available.

## Tools

### Bills

- `get-bill-info` — Detailed info for a bill by `BillID`, including initiators.
- `search-bills-by-name` — Keyword search over bill names (up to 20 most recent matches). Optional `knessetNum` filter.
- `list-bills-by-status` — Bills filtered by a raw `StatusID` from `KNS_Status`, ordered by `LastUpdatedDate` desc.
- `list-recent-bills-by-stage` — Bills at a named legislative stage:
  `first-reading-approved`, `first-reading-plenum`, `second-third-approved`, `second-third-plenum`, `third-reading-plenum`, `passed`.
  Note: the Knesset combines 2nd and 3rd readings into one vote, so `second-third-approved` is the closest proxy to "passed second reading"; `passed` means the bill became law.
- `list-bills-by-type` — Bills by origin: `private`, `government`, or `committee`. Optional `knessetNum`.

### Committees

- `get-committee-info` — Committee details by `CommitteeID`.
- `list-committees` — Committees for a given Knesset number, with optional `onlyCurrent` filter.

### Members

- `list-knesset-members` — Members (MKs) of a given Knesset (PositionID=43).

## API

Backed by the Knesset OData service at:

```
https://knesset.gov.il/Odata/ParliamentInfo.svc
```

Ordering uses `LastUpdatedDate` because the OData API does not expose per-stage transition dates on `KNS_Bill`.

## Development

For ad-hoc testing of the server you can use the [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
npx @modelcontextprotocol/inspector node build/knesset-mcp-server.js
```

A minimal smoke test is included:

```bash
node test-mcp.mjs
```

## License

MIT
