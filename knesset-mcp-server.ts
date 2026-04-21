#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE_URL = "https://knesset.gov.il/Odata/ParliamentInfo.svc";

async function fetchOdataApi(
  endpoint: string,
  params?: Record<string, string>,
): Promise<any> {
  let url = `${BASE_URL}/${endpoint}`;
  if (params) url += `?${new URLSearchParams(params).toString()}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "MCP-Knesset-Server/1.0" },
  });
  if (!response.ok) {
    throw new Error(`Knesset OData request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

function errorResult(prefix: string, error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: `${prefix}: ${msg}` }], isError: true };
}

// SubTypeID values for bills, from KNS_ItemType.
const BILL_TYPE_ID: Record<string, number> = {
  government: 53,
  private: 54,
  committee: 55,
};

// Selected StatusIDs from KNS_Status for bills (there are more; these are the
// legislative-stage milestones). Used for labeling and for the stage helper tool.
const BILL_STATUS_LABEL: Record<number, string> = {
  101: "Preparing for first reading",
  106: "House Committee — assigning handling committee",
  108: "Preparing for first reading",
  109: "Approved in committee for first reading",
  111: "Plenum — before first reading",
  113: "Preparing for second-third reading",
  114: "Plenum — before second-third reading",
  115: "Returned to committee for third reading prep",
  117: "Plenum — before third reading",
  118: "Passed third reading (became law)",
  130: "Laid before plenum for second-third reading",
  131: "Laid before plenum for third reading",
  141: "Laid before plenum for first reading",
  142: "House Committee — assigning handling committee",
  167: "Approved in committee for first reading",
  178: "Approved in committee for second-third reading",
  179: "Approved in committee for second-third reading",
};

const BILL_STAGE: Record<string, { ids: number[]; description: string }> = {
  "first-reading-approved": { ids: [109, 167], description: "Approved in committee for first reading" },
  "first-reading-plenum": { ids: [111, 141], description: "On plenum agenda for first reading" },
  "second-third-approved": { ids: [178, 179], description: "Approved in committee for second-third reading" },
  "second-third-plenum": { ids: [114, 130], description: "On plenum agenda for second-third reading" },
  "third-reading-plenum": { ids: [117, 131], description: "On plenum agenda for third reading" },
  passed: { ids: [118], description: "Passed third reading (became law)" },
};

function labelStatus(statusId: number | null | undefined): string {
  if (statusId == null) return "N/A";
  return BILL_STATUS_LABEL[statusId]
    ? `${statusId} (${BILL_STATUS_LABEL[statusId]})`
    : String(statusId);
}

function formatBill(bill: any, idx?: number): string[] {
  const prefix = typeof idx === "number" ? `${idx + 1}. ` : "";
  return [
    `${prefix}Bill ID: ${bill.BillID}`,
    `   Name: ${bill.Name || "N/A"}`,
    `   Knesset #: ${bill.KnessetNum ?? "N/A"}`,
    `   Type: ${bill.SubTypeDesc || "N/A"}`,
    `   Status: ${labelStatus(bill.StatusID)}`,
    `   Last Updated: ${bill.LastUpdatedDate || "N/A"}`,
    "",
  ];
}

function formatBillList(bills: any[], header: string): string {
  if (bills.length === 0) return `No bills found for ${header}.`;
  const lines = [`Found ${bills.length} bills — ${header}:\n`];
  bills.forEach((b, i) => lines.push(...formatBill(b, i)));
  return lines.join("\n");
}

async function queryBills(
  filter: string,
  orderBy: string,
  top: number,
): Promise<any[]> {
  const data = await fetchOdataApi("KNS_Bill()", {
    $filter: filter,
    $orderby: orderBy,
    $top: String(top),
  });
  return Array.isArray(data?.value) ? data.value : [];
}

const server = new McpServer({ name: "knesset-parliament-info", version: "1.1.0" });

// ---------- Bill tools ----------

server.registerTool(
  "get-bill-info",
  {
    description: "Get detailed information about a specific bill by its BillID, including initiators.",
    inputSchema: {
      billId: z.number().int().positive().describe("KNS_Bill BillID"),
    },
  },
  async ({ billId }) => {
    try {
      const data = await fetchOdataApi(`KNS_Bill(${billId})`, {
        $expand: "KNS_BillInitiators",
      });
      if (!data || !data.BillID) {
        return { content: [{ type: "text", text: `No bill found with ID ${billId}` }] };
      }
      const lines = [
        `Bill ID: ${data.BillID}`,
        `Name: ${data.Name || "N/A"}`,
        `Knesset #: ${data.KnessetNum ?? "N/A"}`,
        `Type: ${data.SubTypeDesc || "N/A"}`,
        `Status: ${labelStatus(data.StatusID)}`,
        `Private Number: ${data.PrivateNumber ?? "N/A"}`,
        `Committee ID: ${data.CommitteeID ?? "N/A"}`,
        `Publication Date: ${data.PublicationDate || "N/A"}`,
        `Publication Series: ${data.PublicationSeriesDesc || "N/A"}`,
        `Last Updated: ${data.LastUpdatedDate || "N/A"}`,
      ];
      const initiators = Array.isArray(data.KNS_BillInitiators) ? data.KNS_BillInitiators : [];
      if (initiators.length > 0) {
        lines.push("", "Initiators:");
        initiators.forEach((ini: any, idx: number) => {
          lines.push(
            `${idx + 1}. PersonID: ${ini.PersonID}, Ordinal: ${ini.Ordinal}, IsInitiator: ${ini.IsInitiator ? "Yes" : "No"}`,
          );
        });
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (error) {
      return errorResult("Error fetching bill", error);
    }
  },
);

server.registerTool(
  "search-bills-by-name",
  {
    description: "Search bills by keyword in their name. Returns up to 20 most recent Knesset matches.",
    inputSchema: {
      keyword: z.string().min(2).describe("Keyword to search for in bill names"),
      knessetNum: z.number().int().positive().optional().describe("Optional Knesset number to filter by"),
    },
  },
  async ({ keyword, knessetNum }) => {
    try {
      const safeKeyword = keyword.replace(/'/g, "''");
      let filter = `substringof('${safeKeyword}', Name)`;
      if (knessetNum) filter += ` and KnessetNum eq ${knessetNum}`;
      const bills = await queryBills(filter, "KnessetNum desc", 20);
      return {
        content: [{ type: "text", text: formatBillList(bills, `keyword "${keyword}"`) }],
      };
    } catch (error) {
      return errorResult("Error searching bills", error);
    }
  },
);

server.registerTool(
  "list-bills-by-status",
  {
    description:
      "List recent bills filtered by StatusID (from KNS_Status), ordered by LastUpdatedDate descending. Ordering uses LastUpdatedDate since the OData API does not expose per-stage transition dates on KNS_Bill.",
    inputSchema: {
      statusId: z
        .number()
        .int()
        .positive()
        .describe("KNS_Status StatusID. Common: 118=passed third reading, 178/179=approved in committee for 2nd-3rd reading, 109/167=approved for first reading"),
      knessetNum: z.number().int().positive().optional().describe("Optional Knesset number to filter by"),
      limit: z.number().int().positive().max(100).optional().describe("Max bills to return (default 10)"),
    },
  },
  async ({ statusId, knessetNum, limit }) => {
    try {
      let filter = `StatusID eq ${statusId}`;
      if (knessetNum) filter += ` and KnessetNum eq ${knessetNum}`;
      const bills = await queryBills(filter, "LastUpdatedDate desc", limit ?? 10);
      return {
        content: [
          { type: "text", text: formatBillList(bills, `StatusID=${labelStatus(statusId)}`) },
        ],
      };
    } catch (error) {
      return errorResult("Error listing bills by status", error);
    }
  },
);

server.registerTool(
  "list-recent-bills-by-stage",
  {
    description:
      "List recent bills at a named legislative stage. Note: the Knesset combines 2nd and 3rd readings into one vote, so 'second-third-approved' is the closest proxy to 'passed second reading'. 'passed' = became law.",
    inputSchema: {
      stage: z
        .enum([
          "first-reading-approved",
          "first-reading-plenum",
          "second-third-approved",
          "second-third-plenum",
          "third-reading-plenum",
          "passed",
        ])
        .describe("Legislative stage"),
      knessetNum: z.number().int().positive().optional().describe("Optional Knesset number to filter by"),
      limit: z.number().int().positive().max(100).optional().describe("Max bills to return (default 10)"),
    },
  },
  async ({ stage, knessetNum, limit }) => {
    try {
      const cfg = BILL_STAGE[stage];
      const statusFilter =
        cfg.ids.length === 1
          ? `StatusID eq ${cfg.ids[0]}`
          : `(${cfg.ids.map((id) => `StatusID eq ${id}`).join(" or ")})`;
      let filter = statusFilter;
      if (knessetNum) filter += ` and KnessetNum eq ${knessetNum}`;
      const bills = await queryBills(filter, "LastUpdatedDate desc", limit ?? 10);
      return {
        content: [
          {
            type: "text",
            text: formatBillList(bills, `${stage} — ${cfg.description}`),
          },
        ],
      };
    } catch (error) {
      return errorResult("Error listing bills by stage", error);
    }
  },
);

server.registerTool(
  "list-bills-by-type",
  {
    description: "List bills by type (private, government, or committee), optionally filtered by Knesset number, ordered by most recent update.",
    inputSchema: {
      billType: z.enum(["private", "government", "committee"]).describe("Bill origin type"),
      knessetNum: z.number().int().positive().optional().describe("Optional Knesset number to filter by"),
      limit: z.number().int().positive().max(100).optional().describe("Max bills to return (default 20)"),
    },
  },
  async ({ billType, knessetNum, limit }) => {
    try {
      let filter = `SubTypeID eq ${BILL_TYPE_ID[billType]}`;
      if (knessetNum) filter += ` and KnessetNum eq ${knessetNum}`;
      const bills = await queryBills(filter, "LastUpdatedDate desc", limit ?? 20);
      return {
        content: [{ type: "text", text: formatBillList(bills, `${billType} bills`) }],
      };
    } catch (error) {
      return errorResult("Error listing bills by type", error);
    }
  },
);

// ---------- Committee tools ----------

server.registerTool(
  "get-committee-info",
  {
    description: "Get information about a specific committee by its CommitteeID.",
    inputSchema: {
      committeeId: z.number().int().positive().describe("KNS_Committee CommitteeID"),
    },
  },
  async ({ committeeId }) => {
    try {
      const data = await fetchOdataApi(`KNS_Committee(${committeeId})`);
      if (!data || !data.CommitteeID) {
        return { content: [{ type: "text", text: `No committee found with ID ${committeeId}` }] };
      }
      const lines = [
        `Committee ID: ${data.CommitteeID}`,
        `Name: ${data.Name || "N/A"}`,
        `Knesset #: ${data.KnessetNum ?? "N/A"}`,
        `Type: ${data.CommitteeTypeDesc || "N/A"}`,
        `Category: ${data.CategoryDesc || "N/A"}`,
        `Email: ${data.Email || "N/A"}`,
        `Start Date: ${data.StartDate || "N/A"}`,
        `Finish Date: ${data.FinishDate || "N/A"}`,
        `Is Current: ${data.IsCurrent ? "Yes" : "No"}`,
      ];
      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (error) {
      return errorResult("Error fetching committee", error);
    }
  },
);

server.registerTool(
  "list-committees",
  {
    description: "List committees for a given Knesset number.",
    inputSchema: {
      knessetNum: z.number().int().positive().describe("Knesset number"),
      onlyCurrent: z.boolean().optional().describe("If true, only currently active committees"),
      limit: z.number().int().positive().max(200).optional().describe("Max committees to return (default 100)"),
    },
  },
  async ({ knessetNum, onlyCurrent, limit }) => {
    try {
      let filter = `KnessetNum eq ${knessetNum}`;
      if (onlyCurrent) filter += ` and IsCurrent eq true`;
      const data = await fetchOdataApi("KNS_Committee()", {
        $filter: filter,
        $orderby: "Name asc",
        $top: String(limit ?? 100),
      });
      const committees = Array.isArray(data?.value) ? data.value : [];
      if (committees.length === 0) {
        return { content: [{ type: "text", text: `No committees found for Knesset ${knessetNum}.` }] };
      }
      const lines = [`Found ${committees.length} committees for Knesset ${knessetNum}:\n`];
      committees.forEach((c: any, i: number) => {
        lines.push(`${i + 1}. Committee ID: ${c.CommitteeID}`);
        lines.push(`   Name: ${c.Name || "N/A"}`);
        lines.push(`   Type: ${c.CommitteeTypeDesc || "N/A"}`);
        lines.push(`   Is Current: ${c.IsCurrent ? "Yes" : "No"}`);
        lines.push("");
      });
      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (error) {
      return errorResult("Error listing committees", error);
    }
  },
);

// ---------- Member tools ----------

server.registerTool(
  "list-knesset-members",
  {
    description:
      "List Knesset members (MKs) with party (faction) affiliation for a given Knesset. Uses PositionID=54 on KNS_PersonToPosition, which is the row that carries FactionID/FactionName (PositionID=43 exists but has null faction fields). Optionally filter by factionId — use list-factions to discover IDs. Note: an MK who switched factions mid-term appears once per stint.",
    inputSchema: {
      knessetNum: z.number().int().positive().describe("Knesset number"),
      factionId: z.number().int().positive().optional().describe("Optional KNS_Faction FactionID to filter to one party"),
      onlyCurrent: z.boolean().optional().describe("If true, only current memberships (IsCurrent=true)"),
      limit: z.number().int().positive().max(200).optional().describe("Max members to return (default 150)"),
    },
  },
  async ({ knessetNum, factionId, onlyCurrent, limit }) => {
    try {
      let filter = `KnessetNum eq ${knessetNum} and PositionID eq 54`;
      if (factionId) filter += ` and FactionID eq ${factionId}`;
      if (onlyCurrent) filter += ` and IsCurrent eq true`;
      const data = await fetchOdataApi("KNS_PersonToPosition()", {
        $filter: filter,
        $expand: "KNS_Person",
        $orderby: "FactionID asc",
        $top: String(limit ?? 150),
      });
      const rows = Array.isArray(data?.value) ? data.value : [];
      if (rows.length === 0) {
        return { content: [{ type: "text", text: `No members found for Knesset ${knessetNum}${factionId ? ` in faction ${factionId}` : ""}.` }] };
      }
      const header = factionId
        ? `Found ${rows.length} members in Knesset ${knessetNum} faction ${factionId}:`
        : `Found ${rows.length} members for Knesset ${knessetNum}:`;
      const lines = [header + "\n"];
      rows.forEach((r: any, i: number) => {
        const p = r.KNS_Person || {};
        const name = [p.FirstName, p.LastName].filter(Boolean).join(" ") || "N/A";
        lines.push(`${i + 1}. PersonID: ${r.PersonID} — ${name}`);
        lines.push(`   Faction: ${r.FactionName || "N/A"} (ID: ${r.FactionID ?? "N/A"})`);
        lines.push(`   Start: ${r.StartDate || "N/A"}   Finish: ${r.FinishDate || "N/A"}   Current: ${r.IsCurrent ? "Yes" : "No"}`);
        lines.push("");
      });
      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (error) {
      return errorResult("Error listing Knesset members", error);
    }
  },
);

server.registerTool(
  "list-factions",
  {
    description: "List factions (parties) for a given Knesset number. Use the returned FactionID with list-knesset-members to get party rosters.",
    inputSchema: {
      knessetNum: z.number().int().positive().describe("Knesset number"),
      onlyCurrent: z.boolean().optional().describe("If true, only currently active factions"),
      limit: z.number().int().positive().max(200).optional().describe("Max factions to return (default 50)"),
    },
  },
  async ({ knessetNum, onlyCurrent, limit }) => {
    try {
      let filter = `KnessetNum eq ${knessetNum}`;
      if (onlyCurrent) filter += ` and IsCurrent eq true`;
      const data = await fetchOdataApi("KNS_Faction()", {
        $filter: filter,
        $orderby: "Name asc",
        $top: String(limit ?? 50),
      });
      const factions = Array.isArray(data?.value) ? data.value : [];
      if (factions.length === 0) {
        return { content: [{ type: "text", text: `No factions found for Knesset ${knessetNum}.` }] };
      }
      const lines = [`Found ${factions.length} factions for Knesset ${knessetNum}:\n`];
      factions.forEach((f: any, i: number) => {
        lines.push(`${i + 1}. Faction ID: ${f.FactionID} — ${f.Name || "N/A"}`);
        lines.push(`   Current: ${f.IsCurrent ? "Yes" : "No"}   Start: ${f.StartDate || "N/A"}   Finish: ${f.FinishDate || "N/A"}`);
        lines.push("");
      });
      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (error) {
      return errorResult("Error listing factions", error);
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Knesset MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
