import fetch from "node-fetch";
import { z } from "zod";

// Constants
const BASE_URL = "http://knesset.gov.il/Odata/ParliamentInfo.svc";

// Utility function to make ODATA API requests
async function fetchOdataApi(endpoint: string, params?: Record<string, string>): Promise<any> {
  let url = `${BASE_URL}/${endpoint}`;
  
  if (params) {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      queryParams.append(key, value);
    });
    url += `?${queryParams.toString()}`;
  }
  
  const response = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "MCP-Knesset-Server/1.0"
    }
  });
  
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

// Custom MCP Server implementation
class KnessetMcpServer {
  private resources: Map<string, any> = new Map();
  private tools: Map<string, any> = new Map();
  private prompts: Map<string, any> = new Map();
  private transport: any;

  constructor(config: { name: string, version: string, capabilities: any }) {
    console.log(`Initializing ${config.name} v${config.version}`);
  }

  // Resources
  registerResource(template: { uriTemplate: string, name: string, description: string }, handler: Function) {
    console.log(`Registering resource: ${template.name} - ${template.uriTemplate}`);
    this.resources.set(template.uriTemplate, {
      template,
      handler
    });
    return this;
  }

  // Tools
  registerTool(name: string, description: string, params: any, handler: Function) {
    console.log(`Registering tool: ${name}`);
    this.tools.set(name, {
      name,
      description,
      params,
      handler
    });
    return this;
  }

  // Prompts
  registerPrompt(name: string, description: string, args: any[], handler: Function) {
    console.log(`Registering prompt: ${name}`);
    this.prompts.set(name, {
      name,
      description,
      args,
      handler
    });
    return this;
  }

  // Connect to transport
  async connect(transport: any) {
    this.transport = transport;
    console.log("Connected to transport");
    
    // Setup message handling
    if (this.transport.onMessage) {
      this.transport.onMessage(async (message: any) => {
        // Handle incoming messages
        try {
          // Very basic implementation
          console.log("Received message:", JSON.stringify(message).substring(0, 200) + "...");
          
          // Send a simple response
          await this.transport.sendResponse({
            id: message.id,
            result: { success: true }
          });
        } catch (error) {
          console.error("Error handling message:", error);
        }
      });
    }
    
    return this;
  }
}

// Create server instance
const server = new KnessetMcpServer({
  name: "knesset-parliament-info",
  version: "1.0.0",
  capabilities: {
    resources: {
      subscribe: true,
      listChanged: true
    },
    tools: {
      listChanged: true
    },
    prompts: {
      listChanged: true
    }
  },
});

// Resource definitions
server.registerResource({
  uriTemplate: "knesset://committees/{knessetNum}",
  name: "Knesset Committees",
  description: "Get committees for a specific Knesset number",
}, async (request: any) => {
  const knessetNum = request.uri.split("/").pop();
  
  try {
    const data = await fetchOdataApi(`KNS_Committee()`, { $filter: `KnessetNum eq ${knessetNum}` });
    
    if (!data.value || !Array.isArray(data.value)) {
      return {
        contents: [{
          uri: request.uri,
          mimeType: "application/json",
          text: JSON.stringify({ error: "No data found" }, null, 2)
        }]
      };
    }
    
    return {
      contents: [{
        uri: request.uri,
        mimeType: "application/json",
        text: JSON.stringify(data.value, null, 2)
      }]
    };
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      contents: [{
        uri: request.uri,
        mimeType: "application/json",
        text: JSON.stringify({ error: `Failed to fetch committees: ${errorMessage}` }, null, 2)
      }]
    };
  }
});

server.registerResource({
  uriTemplate: "knesset://committee/{committeeId}/sessions",
  name: "Committee Sessions",
  description: "Get sessions for a specific committee by ID",
}, async (request: any) => {
  const committeeId = request.uri.split("/")[2];
  
  try {
    const data = await fetchOdataApi(`KNS_Committee(${committeeId})`, { $expand: 'KNS_CommitteeSessions' });
    
    if (!data || !data.KNS_CommitteeSessions) {
      return {
        contents: [{
          uri: request.uri,
          mimeType: "application/json",
          text: JSON.stringify({ error: "No sessions found" }, null, 2)
        }]
      };
    }
    
    return {
      contents: [{
        uri: request.uri,
        mimeType: "application/json",
        text: JSON.stringify(data.KNS_CommitteeSessions, null, 2)
      }]
    };
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      contents: [{
        uri: request.uri,
        mimeType: "application/json",
        text: JSON.stringify({ error: `Failed to fetch committee sessions: ${errorMessage}` }, null, 2)
      }]
    };
  }
});

server.registerResource({
  uriTemplate: "knesset://bills/{billType}",
  name: "Knesset Bills",
  description: "Get bills by type (e.g., private, government, committee)",
}, async (request: any) => {
  const billType = request.uri.split("/").pop() || "";
  const billTypeMap: Record<string, number> = {
    "private": 54,
    "government": 53,
    "committee": 55
  };
  
  const billTypeId = billTypeMap[billType as keyof typeof billTypeMap];
  if (!billTypeId) {
    return {
      contents: [{
        uri: request.uri,
        mimeType: "application/json",
        text: JSON.stringify({ error: "Invalid bill type. Use 'private', 'government', or 'committee'." }, null, 2)
      }]
    };
  }
  
  try {
    const data = await fetchOdataApi(`KNS_Bill()`, { $filter: `SubTypeID eq ${billTypeId}`, $top: '100' });
    
    if (!data.value || !Array.isArray(data.value)) {
      return {
        contents: [{
          uri: request.uri,
          mimeType: "application/json",
          text: JSON.stringify({ error: "No bills found" }, null, 2)
        }]
      };
    }
    
    return {
      contents: [{
        uri: request.uri,
        mimeType: "application/json",
        text: JSON.stringify(data.value, null, 2)
      }]
    };
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      contents: [{
        uri: request.uri,
        mimeType: "application/json",
        text: JSON.stringify({ error: `Failed to fetch bills: ${errorMessage}` }, null, 2)
      }]
    };
  }
});

server.registerResource({
  uriTemplate: "knesset://knesset-members/{knessetNum}",
  name: "Knesset Members",
  description: "Get members of a specific Knesset by Knesset number",
}, async (request: any) => {
  const knessetNum = request.uri.split("/").pop();
  
  try {
    // Join PersonToPosition with Person to get all members of a specific Knesset
    const data = await fetchOdataApi(`KNS_PersonToPosition()`, { 
      $filter: `KnessetNum eq ${knessetNum} and PositionID eq 43`,
      $expand: 'KNS_Person'
    });
    
    if (!data.value || !Array.isArray(data.value)) {
      return {
        contents: [{
          uri: request.uri,
          mimeType: "application/json",
          text: JSON.stringify({ error: "No Knesset members found" }, null, 2)
        }]
      };
    }
    
    return {
      contents: [{
        uri: request.uri,
        mimeType: "application/json",
        text: JSON.stringify(data.value, null, 2)
      }]
    };
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      contents: [{
        uri: request.uri,
        mimeType: "application/json",
        text: JSON.stringify({ error: `Failed to fetch Knesset members: ${errorMessage}` }, null, 2)
      }]
    };
  }
});

// Tool definitions
interface BillInfoParams {
  billId: number;
}

server.registerTool(
  "get-bill-info",
  "Get detailed information about a specific bill by ID",
  {
    billId: z.number().int().positive().describe("The unique identifier of the bill"),
  },
  async (params: BillInfoParams) => {
    try {
      const data = await fetchOdataApi(`KNS_Bill(${params.billId})`);
      
      if (!data) {
        return {
          content: [
            {
              type: "text",
              text: `No bill found with ID ${params.billId}`
            }
          ],
          isError: false
        };
      }
      
      // Get the bill initiators if available
      let initiators: any[] = [];
      try {
        const initiatorsData = await fetchOdataApi(`KNS_Bill(${params.billId})`, { $expand: 'KNS_BillInitiators' });
        if (initiatorsData && initiatorsData.KNS_BillInitiators) {
          initiators = initiatorsData.KNS_BillInitiators;
        }
      } catch (error) {
        console.error("Error fetching initiators:", error);
      }
      
      // Format the response
      const response = [
        `Bill ID: ${data.BillID}`,
        `Name: ${data.Name || 'N/A'}`,
        `Knesset #: ${data.KnessetNum || 'N/A'}`,
        `Type: ${data.SubTypeDesc || 'N/A'}`,
        `Status: ${data.StatusID || 'N/A'}`,
        `Private Number: ${data.PrivateNumber || 'N/A'}`,
        `Committee ID: ${data.CommitteeID || 'N/A'}`,
        `Publication Date: ${data.PublicationDate || 'N/A'}`,
        `Publication Series: ${data.PublicationSeriesDesc || 'N/A'}`
      ];
      
      if (initiators.length > 0) {
        response.push("\nInitiators:");
        initiators.forEach((initiator: any, index: number) => {
          response.push(`${index + 1}. PersonID: ${initiator.PersonID}, Ordinal: ${initiator.Ordinal}, IsInitiator: ${initiator.IsInitiator ? 'Yes' : 'No'}`);
        });
      }
      
      return {
        content: [
          {
            type: "text",
            text: response.join("\n")
          }
        ],
        isError: false
      };
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Error fetching bill information: ${errorMessage}`
          }
        ],
        isError: true
      };
    }
  }
);

interface SearchBillsParams {
  keyword: string;
  knessetNum?: number;
}

server.registerTool(
  "search-bills-by-name",
  "Search for bills by keyword in their name",
  {
    keyword: z.string().min(2).describe("Keyword to search for in bill names"),
    knessetNum: z.number().int().positive().optional().describe("Optional Knesset number to filter by"),
  },
  async (params: SearchBillsParams) => {
    try {
      let filter = `substringof('${params.keyword}', Name)`;
      if (params.knessetNum) {
        filter += ` and KnessetNum eq ${params.knessetNum}`;
      }
      
      const data = await fetchOdataApi(`KNS_Bill()`, { 
        $filter: filter,
        $top: '20',
        $orderby: 'KnessetNum desc'
      });
      
      if (!data.value || data.value.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No bills found matching keyword "${params.keyword}"`
            }
          ],
          isError: false
        };
      }
      
      const response = [`Found ${data.value.length} bills matching "${params.keyword}":\n`];
      
      data.value.forEach((bill: any, index: number) => {
        response.push(`${index + 1}. Bill ID: ${bill.BillID}`);
        response.push(`   Name: ${bill.Name || 'N/A'}`);
        response.push(`   Knesset #: ${bill.KnessetNum || 'N/A'}`);
        response.push(`   Type: ${bill.SubTypeDesc || 'N/A'}`);
        response.push(``);
      });
      
      return {
        content: [
          {
            type: "text",
            text: response.join("\n")
          }
        ],
        isError: false
      };
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Error searching for bills: ${errorMessage}`
          }
        ],
        isError: true
      };
    }
  }
);

interface CommitteeInfoParams {
  committeeId: number;
}

server.registerTool(
  "get-committee-info",
  "Get information about a specific committee by ID",
  {
    committeeId: z.number().int().positive().describe("The unique identifier of the committee"),
  },
  async (params: CommitteeInfoParams) => {
    try {
      const data = await fetchOdataApi(`KNS_Committee(${params.committeeId})`);
      
      if (!data) {
        return {
          content: [
            {
              type: "text",
              text: `No committee found with ID ${params.committeeId}`
            }
          ],
          isError: false
        };
      }
      
      // Format the response
      const response = [
        `Committee ID: ${data.CommitteeID}`,
        `Name: ${data.Name || 'N/A'}`,
        `Knesset #: ${data.KnessetNum || 'N/A'}`,
        `Type: ${data.CommitteeTypeDesc || 'N/A'}`,
        `Category: ${data.CategoryDesc || 'N/A'}`,
        `Email: ${data.Email || 'N/A'}`,
        `Start Date: ${data.StartDate || 'N/A'}`,
        `Finish Date: ${data.FinishDate || 'N/A'}`,
        `Is Current: ${data.IsCurrent ? 'Yes' : 'No'}`
      ];
      
      return {
        content: [
          {
            type: "text",
            text: response.join("\n")
          }
        ],
        isError: false
      };
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Error fetching committee information: ${errorMessage}`
          }
        ],
        isError: true
      };
    }
  }
);

// Simplified StdioServerTransport implementation
class StdioServerTransport {
  private messageHandlers: Array<(message: any) => void> = [];

  constructor() {
    // Set up stdin/stdout handling
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (data: string) => {
      try {
        const lines = data.trim().split('\n');
        for (const line of lines) {
          if (line.trim()) {
            const message = JSON.parse(line);
            this.messageHandlers.forEach(handler => handler(message));
          }
        }
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    });
  }

  onMessage(handler: (message: any) => void) {
    this.messageHandlers.push(handler);
  }

  async sendResponse(response: any) {
    const responseText = JSON.stringify(response);
    process.stdout.write(responseText + '\n');
    return true;
  }
}

// Main function to run the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Knesset MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});