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
    console.error(`Initializing ${config.name} v${config.version}`);
  }

  // Resources
  registerResource(template: { uriTemplate: string, name: string, description: string }, handler: Function) {
    console.error(`Registering resource: ${template.name} - ${template.uriTemplate}`);
    this.resources.set(template.uriTemplate, {
      template,
      handler
    });
    return this;
  }

  // Tools
  registerTool(name: string, description: string, params: any, handler: Function) {
    console.error(`Registering tool: ${name}`);
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
    console.error(`Registering prompt: ${name}`);
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
    console.error("Connected to transport");
    
    // Setup message handling
    if (this.transport.onMessage) {
      this.transport.onMessage(async (message: any) => {
        // Handle incoming messages
        try {
          // Check if this is a valid JSON-RPC 2.0 message
          if (!message || typeof message !== 'object' || message.jsonrpc !== '2.0') {
            console.error(`Invalid JSON-RPC message:`, message);
            return;
          }

          console.error(`Received request: ${message.method} (ID: ${message.id})`);
          
          if (message.method === "initialize") {
            // Handle initialize request
            const protocolVersion = message.params?.protocolVersion || "unknown";
            const clientName = message.params?.clientInfo?.name || "unknown";
            const clientVersion = message.params?.clientInfo?.version || "unknown";
            
            console.error(`Client connected: ${clientName} v${clientVersion} using protocol ${protocolVersion}`);
            
            // Respond with server capabilities
            await this.transport.sendResponse({
              id: message.id,
              result: {
                protocolVersion: "2024-11-05",
                serverInfo: {
                  name: "knesset-parliament-info",
                  version: "1.0.0"
                },
                capabilities: {
                  resources: { subscribe: true, listChanged: true },
                  tools: { listChanged: true },
                  prompts: { listChanged: true }
                }
              }
            });
          } else if (message.method === "listResources") {
            // Handle listResources request
            const resources = Array.from(this.resources.entries()).map(([uri, resource]) => ({
              uriTemplate: resource.template.uriTemplate,
              name: resource.template.name,
              description: resource.template.description
            }));
            
            await this.transport.sendResponse({
              id: message.id,
              result: { resources }
            });
          } else if (message.method === "listTools") {
            // Handle listTools request
            const tools = Array.from(this.tools.entries()).map(([name, tool]) => ({
              name: tool.name,
              description: tool.description,
              parameters: tool.params
            }));
            
            await this.transport.sendResponse({
              id: message.id,
              result: { tools }
            });
          } else if (message.method === "listPrompts") {
            // Handle listPrompts request
            const prompts = Array.from(this.prompts.entries()).map(([name, prompt]) => ({
              name: prompt.name,
              description: prompt.description,
              arguments: prompt.args
            }));
            
            await this.transport.sendResponse({
              id: message.id,
              result: { prompts }
            });
          } else if (message.method === "getResourceContent") {
            // Handle getResourceContent request
            const uri = message.params?.uri;
            if (!uri) {
              throw new Error("Missing required parameter 'uri'");
            }
            
            // Find matching resource handler based on URI pattern
            let handler = null;
            
            for (const [uriTemplate, resource] of this.resources.entries()) {
              // Convert uriTemplate like "knesset://committees/{knessetNum}" 
              // to regex pattern like "knesset://committees/([^/]+)"
              const pattern = uriTemplate.replace(/\{([^}]+)\}/g, '([^/]+)');
              const regex = new RegExp(`^${pattern}$`);
              const match = uri.match(regex);
              
              if (match) {
                handler = resource.handler;
                break;
              }
            }
            
            if (!handler) {
              throw new Error(`No handler found for URI: ${uri}`);
            }
            
            const response = await handler({ uri });
            await this.transport.sendResponse({
              id: message.id,
              result: response
            });
          } else if (message.method === "invokeTool") {
            // Handle invokeTool request
            const name = message.params?.name;
            const args = message.params?.arguments || {};
            
            if (!name) {
              throw new Error("Missing required parameter 'name'");
            }
            
            const tool = this.tools.get(name);
            if (!tool) {
              throw new Error(`Tool not found: ${name}`);
            }
            
            const response = await tool.handler(args);
            await this.transport.sendResponse({
              id: message.id,
              result: response
            });
          } else if (message.method === "getPrompt") {
            // Handle getPrompt request
            const name = message.params?.name;
            const args = message.params?.arguments || {};
            
            if (!name) {
              throw new Error("Missing required parameter 'name'");
            }
            
            const prompt = this.prompts.get(name);
            if (!prompt) {
              throw new Error(`Prompt not found: ${name}`);
            }
            
            const response = await prompt.handler({ arguments: args });
            await this.transport.sendResponse({
              id: message.id,
              result: response
            });
          } else {
            // Handle unknown method
            throw new Error(`Unknown method: ${message.method}`);
          }
        } catch (error: any) {
          console.error("Error handling message:", error);
          await this.transport.sendError(message.id, {
            code: -32603,
            message: error.message || "Internal error"
          });
        }
      });
    }
    
    return this;
  }
}

// Improved StdioServerTransport implementation following JSON-RPC 2.0 protocol
class StdioServerTransport {
  private messageHandlers: Array<(message: any) => void> = [];
  private debug: boolean = true;

  constructor() {
    // Set up stdin/stdout handling
    process.stdin.setEncoding('utf8');
    
    let buffer = '';
    process.stdin.on('data', (chunk: string) => {
      try {
        buffer += chunk;
        
        // Process complete messages (may have multiple messages or partial messages)
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          
          if (line.trim()) {
            if (this.debug) console.error(`[DEBUG] Received: ${line}`);
            try {
              const message = JSON.parse(line);
              this.messageHandlers.forEach(handler => handler(message));
            } catch (jsonError) {
              console.error('Error parsing JSON message:', jsonError);
            }
          }
        }
      } catch (error) {
        console.error('Error processing input data:', error);
      }
    });
    
    // Handle stdin closing
    process.stdin.on('end', () => {
      console.error('stdin stream ended');
    });
    
    process.stdin.on('error', (err) => {
      console.error('stdin error:', err);
    });
    
    // Keep the process alive
    setInterval(() => {}, 10000);
  }

  onMessage(handler: (message: any) => void) {
    this.messageHandlers.push(handler);
  }

  async sendResponse(response: any) {
    try {
      // Format as proper JSON-RPC 2.0 response
      const jsonRpcResponse = {
        jsonrpc: "2.0",
        id: response.id,
        result: response.result
      };
      
      const responseText = JSON.stringify(jsonRpcResponse);
      if (this.debug) console.error(`[DEBUG] Sending: ${responseText}`);
      process.stdout.write(responseText + '\n');
      return true;
    } catch (error) {
      console.error("Error sending response:", error);
      return false;
    }
  }

  async sendError(id: string | number | null, error: any) {
    try {
      // Format as proper JSON-RPC 2.0 error response
      const jsonRpcError = {
        jsonrpc: "2.0",
        id: id,
        error: {
          code: error.code || -32603,
          message: error.message || "Internal error",
          data: error.data
        }
      };
      
      const errorText = JSON.stringify(jsonRpcError);
      if (this.debug) console.error(`[DEBUG] Sending error: ${errorText}`);
      process.stdout.write(errorText + '\n');
      return true;
    } catch (error) {
      console.error("Error sending error response:", error);
      return false;
    }
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

// Main function to run the server
async function main() {
  try {
    console.error("Starting Knesset MCP Server...");
    
    // Prevent the process from exiting when an uncaught exception occurs
    process.on('uncaughtException', (err) => {
      console.error('Uncaught exception:', err);
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled rejection at:', promise, 'reason:', reason);
    });
    
    // Make stdin non-blocking and ensure it stays open
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    
    // Make sure process doesn't exit on SIGINT
    process.on('SIGINT', () => {
      console.error('Received SIGINT, ignoring...');
    });
    
    process.on('exit', (code) => {
      console.error(`Process exiting with code: ${code}`);
    });
    
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    console.error("Knesset MCP Server running on stdio");
    
    // Keep the process alive
    setInterval(() => {
      // Heartbeat
    }, 1000);
  } catch (error) {
    console.error("Error in main:", error);
  }
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
});