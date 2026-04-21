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
      "command": "npx",
      "args": ["-y", "knesset-mcp"]
    }
  }
}
```

3. Restart Claude Desktop — the Knesset tools will be available.

The `npx -y` flag auto-installs the package on first run and caches it. Requires Node.js >= 20.10.0.

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

### Members & Factions

- `list-factions` — Lists parties (factions) in a given Knesset. Use this first to find the `FactionID` of the party you care about. Optional `onlyCurrent` filter to exclude factions that have disbanded or merged.
- `list-knesset-members` — Lists Knesset members (MKs) with their party affiliation. Optional `factionId` filter returns only members of a specific party (pair with `list-factions` to discover IDs). Optional `onlyCurrent` filter limits results to active memberships.

**How to get a party's MK roster:**

1. Call `list-factions` with the Knesset number → find the `FactionID` of the party.
2. Call `list-knesset-members` with that `knessetNum` and `factionId` → get the member list.

Note: an MK who switched parties mid-term appears once per stint. Pass `onlyCurrent: true` to see only the active membership.

## Example prompts

Sample prompts in Hebrew you can try once the server is wired up. Each one exercises a specific tool or combination of tools.

### Single-tool prompts

**`list-factions`**
- "אילו סיעות פעילות כיום בכנסת ה-25?"
- "תראה לי את כל הסיעות שהיו בכנסת ה-24, כולל כאלה שהתפצלו או התאחדו."

**`list-knesset-members`**
- "מי חברי סיעת הליכוד בכנסת הנוכחית?"
- "תן לי את רשימת כל חברי הכנסת המכהנים כרגע בכנסת ה-25."

**`list-committees`**
- "אילו ועדות פעילות היום בכנסת?"
- "מה הן כל הוועדות שפעלו בכנסת ה-24?"

**`get-committee-info`**
- "תן לי פרטים על ועדת הכספים."
- "מה המידע על הוועדה עם המזהה 2010?"

**`search-bills-by-name`**
- "חפש הצעות חוק שמכילות את המילה 'פנסיה'."
- "מצא הצעות חוק על 'דיור ציבורי' בכנסת ה-25."

**`list-bills-by-type`**
- "תראה לי את הצעות החוק הממשלתיות האחרונות בכנסת ה-25."
- "מה הן 20 הצעות החוק הפרטיות העדכניות ביותר?"

**`list-bills-by-status`**
- "אילו הצעות חוק עברו בקריאה שלישית לאחרונה (סטטוס 118)?"
- "תן לי את הצעות החוק שאושרו בוועדה לקריאה שנייה ושלישית בכנסת ה-25."

**`list-recent-bills-by-stage`**
- "אילו חוקים עברו ונכנסו לספר החוקים לאחרונה?"
- "תן לי את ההצעות שאושרו בקריאה ראשונה בכנסת הנוכחית."

**`get-bill-info`**
- "תן לי את כל הפרטים והיוזמים של הצעת החוק עם המזהה 2145694."
- "מי יזם את הצעת החוק הזו ומה הסטטוס הנוכחי שלה? (BillID: ...)"

### Multi-tool prompts

**Two tools**
- "תראה לי את כל הסיעות החרדיות בכנסת ה-25, ואז פרט את חברי הכנסת של 'יהדות התורה'." → `list-factions` + `list-knesset-members`
- "חפש הצעות חוק על 'אלימות במשפחה' בכנסת הנוכחית, ואז תן לי את הפרטים המלאים והיוזמים של הכי רלוונטית." → `search-bills-by-name` + `get-bill-info`
- "תראה לי את כל הוועדות הפעילות בכנסת, ואז תן לי את המידע המפורט על ועדת החוקה." → `list-committees` + `get-committee-info`
- "אילו חוקים עברו בקריאה שלישית לאחרונה? בחר את 3 החשובים ביותר ותן לי פרטים על כל אחד." → `list-recent-bills-by-stage` + `get-bill-info`

**Three tools**
- "מצא את הסיעה 'יש עתיד' בכנסת ה-25, ראה מי חבריה, ואז חפש הצעות חוק שמזכירות אחד מהם בשם — בחר את מרב מיכאלי לדוגמה." → `list-factions` + `list-knesset-members` + `search-bills-by-name`
- "תראה לי 10 הצעות חוק ממשלתיות אחרונות ו-10 הצעות פרטיות אחרונות, ואז פרט את ההצעה הפרטית שהכי מתקדמת בתהליך החקיקה." → `list-bills-by-type` (×2) + `get-bill-info`
- "חפש הצעות חוק על 'תחבורה ציבורית', סנן את אלו שאושרו לקריאה ראשונה (סטטוס 109), ותן לי פרטים על הפעילה ביותר." → `search-bills-by-name` + `list-bills-by-status` + `get-bill-info`

**Four or more tools**
- "צור לי פרופיל שלם של סיעת 'העבודה' בכנסת ה-25: רשימת החברים, באילו ועדות הם פעילים, ודוגמה להצעת חוק שהם יזמו. התחל ממציאת מזהה הסיעה." → `list-factions` + `list-knesset-members` + `list-committees` + `search-bills-by-name` + `get-bill-info`
- "הכן לי סיכום חקיקה: 5 חוקים שעברו לאחרונה, 5 הצעות שאושרו לקריאה שנייה-שלישית, ו-5 הצעות שאושרו לקריאה ראשונה — עבור הכנסת הנוכחית. עבור החוק החשוב ביותר שעבר, תן לי את הפרטים המלאים." → `list-recent-bills-by-stage` (×3) + `get-bill-info`
- "אני מתעניין בחקיקת סביבה. חפש הצעות חוק על 'אקלים' ו'זיהום', תן לי פרטים על כל אחת כולל היוזמים, ובדוק לאיזו סיעה משתייך כל יוזם — האם זה חוצה קואליציה/אופוזיציה?" → `search-bills-by-name` + `get-bill-info` + `list-factions` + `list-knesset-members`

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
