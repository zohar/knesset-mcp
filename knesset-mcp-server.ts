import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fetch from "node-fetch";

// Define interfaces for request and error handling
interface ResourceRequest {
  uri: string;
  [key: string]: any;
}

interface ToolRequest<T> {
  [key: string]: T;
}

interface PromptRequest {
  arguments?: {
    [key: string]: any;
  };
}

// Create server instance
const server = new Server({
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
}) as any; // Using 'as any' temporarily to bypass type checking for addResourceTemplate, tool, and prompt

// Utility function to make ODATA API requests
async function fetchOdataApi(endpoint: string, params?: Record<string, string>): Promise<any> {
  const BASE_URL = "http://knesset.gov.il/Odata/ParliamentInfo.svc";
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

// Resource definitions
server.addResourceTemplate({
  uriTemplate: "knesset://committees/{knessetNum}",
  name: "Knesset Committees",
  description: "Get committees for a specific Knesset number",
}, async (request: ResourceRequest) => {
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
  } catch (error: unknown) {
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

server.addResourceTemplate({
  uriTemplate: "knesset://committee/{committeeId}/sessions",
  name: "Committee Sessions",
  description: "Get sessions for a specific committee by ID",
}, async (request: ResourceRequest) => {
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
  } catch (error: unknown) {
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

server.addResourceTemplate({
  uriTemplate: "knesset://bills/{billType}",
  name: "Knesset Bills",
  description: "Get bills by type (e.g., private, government, committee)",
}, async (request: ResourceRequest) => {
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
  } catch (error: unknown) {
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

server.addResourceTemplate({
  uriTemplate: "knesset://knesset-members/{knessetNum}",
  name: "Knesset Members",
  description: "Get members of a specific Knesset by Knesset number",
}, async (request: ResourceRequest) => {
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
  } catch (error: unknown) {
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

server.tool(
  "get-bill-info",
  "Get detailed information about a specific bill by ID",
  {
    billId: z.number().int().positive().describe("The unique identifier of the bill"),
  },
  async ({ billId }: ToolRequest<BillInfoParams>) => {
    try {
      const data = await fetchOdataApi(`KNS_Bill(${billId})`);
      
      if (!data) {
        return {
          content: [
            {
              type: "text",
              text: `No bill found with ID ${billId}`
            }
          ],
          isError: false
        };
      }
      
      // Get the bill initiators if available
      let initiators: any[] = [];
      try {
        const initiatorsData = await fetchOdataApi(`KNS_Bill(${billId})`, { $expand: 'KNS_BillInitiators' });
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
    } catch (error: unknown) {
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

server.tool(
  "search-bills-by-name",
  "Search for bills by keyword in their name",
  {
    keyword: z.string().min(2).describe("Keyword to search for in bill names"),
    knessetNum: z.number().int().positive().optional().describe("Optional Knesset number to filter by"),
  },
  async ({ keyword, knessetNum }: ToolRequest<SearchBillsParams>) => {
    try {
      let filter = `substringof('${keyword}', Name)`;
      if (knessetNum) {
        filter += ` and KnessetNum eq ${knessetNum}`;
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
              text: `No bills found matching keyword "${keyword}"`
            }
          ],
          isError: false
        };
      }
      
      const response = [`Found ${data.value.length} bills matching "${keyword}":\n`];
      
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
    } catch (error: unknown) {
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

server.tool(
  "get-committee-info",
  "Get information about a specific committee by ID",
  {
    committeeId: z.number().int().positive().describe("The unique identifier of the committee"),
  },
  async ({ committeeId }: ToolRequest<CommitteeInfoParams>) => {
    try {
      const data = await fetchOdataApi(`KNS_Committee(${committeeId})`);
      
      if (!data) {
        return {
          content: [
            {
              type: "text",
              text: `No committee found with ID ${committeeId}`
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
    } catch (error: unknown) {
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

interface KnessetMemberParams {
  personId: number;
}

server.tool(
  "get-knesset-member",
  "Get information about a specific Knesset member by ID",
  {
    personId: z.number().int().positive().describe("The unique identifier of the Knesset member"),
  },
  async ({ personId }: ToolRequest<KnessetMemberParams>) => {
    try {
      const data = await fetchOdataApi(`KNS_Person(${personId})`);
      
      if (!data) {
        return {
          content: [
            {
              type: "text",
              text: `No Knesset member found with ID ${personId}`
            }
          ],
          isError: false
        };
      }
      
      // Get the positions for this person
      let positions: any[] = [];
      try {
        const positionsData = await fetchOdataApi(`KNS_PersonToPosition()`, { 
          $filter: `PersonID eq ${personId}`,
          $orderby: 'KnessetNum desc'
        });
        
        if (positionsData && positionsData.value) {
          positions = positionsData.value;
        }
      } catch (error) {
        console.error("Error fetching positions:", error);
      }
      
      // Format the response
      const response = [
        `Person ID: ${data.PersonID}`,
        `Name: ${data.FirstName || ''} ${data.LastName || ''}`,
        `Gender: ${data.GenderDesc || 'N/A'}`,
        `Email: ${data.Email || 'N/A'}`,
        `Is Current: ${data.IsCurrent ? 'Yes' : 'No'}`
      ];
      
      if (positions.length > 0) {
        response.push("\nPositions:");
        positions.forEach((position: any, index: number) => {
          response.push(`${index + 1}. Knesset #: ${position.KnessetNum}, Position: ${position.PositionID}`);
          if (position.FactionName) response.push(`   Faction: ${position.FactionName}`);
          if (position.GovMinistryName) response.push(`   Ministry: ${position.GovMinistryName}`);
          if (position.DutyDesc) response.push(`   Duty: ${position.DutyDesc}`);
          response.push(`   Start Date: ${position.StartDate || 'N/A'}`);
          response.push(`   Finish Date: ${position.FinishDate || 'N/A'}`);
          response.push(``);
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
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Error fetching Knesset member information: ${errorMessage}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "get-current-knesset-number",
  "Get the number of the current Knesset",
  {},
  async () => {
    try {
      // Get the latest Knesset dates to determine the current Knesset
      const data = await fetchOdataApi(`KNS_KnessetDates()`, { 
        $filter: `IsCurrent eq true`
      });
      
      if (!data.value || data.value.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "Could not determine the current Knesset number"
            }
          ],
          isError: false
        };
      }
      
      const currentKnesset = data.value[0];
      
      return {
        content: [
          {
            type: "text",
            text: `The current Knesset is number ${currentKnesset.KnessetNum}.\nName: ${currentKnesset.Name || 'N/A'}\nStart Date: ${currentKnesset.PlenumStart || 'N/A'}`
          }
        ],
        isError: false
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Error fetching current Knesset information: ${errorMessage}`
          }
        ],
        isError: true
      };
    }
  }
);

// Prompt definitions
server.prompt(
  "analyze-legislation-process",
  "Analyze the legislative process of a bill",
  [
    {
      name: "billId",
      description: "The ID of the bill to analyze",
      required: true
    }
  ],
  async (request: PromptRequest) => {
    const billId = request.arguments?.billId;
    
    try {
      // Fetch the bill information
      const billData = await fetchOdataApi(`KNS_Bill(${billId})`);
      
      if (!billData) {
        return {
          description: "Error: Bill not found",
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Please analyze the legislative process of bill ID ${billId}, but I couldn't find any information for this bill.`
              }
            }
          ]
        };
      }
      
      // Get additional bill information
      let initiators: any[] = [];
      try {
        const initiatorsData = await fetchOdataApi(`KNS_Bill(${billId})`, { $expand: 'KNS_BillInitiators' });
        if (initiatorsData && initiatorsData.KNS_BillInitiators) {
          initiators = initiatorsData.KNS_BillInitiators;
        }
      } catch (error) {
        console.error("Error fetching initiators:", error);
      }
      
      // Format bill data
      const billDetails = [
        `Bill ID: ${billData.BillID}`,
        `Name: ${billData.Name || 'N/A'}`,
        `Knesset #: ${billData.KnessetNum || 'N/A'}`,
        `Type: ${billData.SubTypeDesc || 'N/A'}`,
        `Status: ${billData.StatusID || 'N/A'}`,
        `Private Number: ${billData.PrivateNumber || 'N/A'}`,
        `Committee ID: ${billData.CommitteeID || 'N/A'}`,
        `Publication Date: ${billData.PublicationDate || 'N/A'}`,
        `Publication Series: ${billData.PublicationSeriesDesc || 'N/A'}`
      ];
      
      if (initiators.length > 0) {
        billDetails.push("\nInitiators:");
        initiators.forEach((initiator: any, index: number) => {
          billDetails.push(`${index + 1}. PersonID: ${initiator.PersonID}, Is Primary Initiator: ${initiator.IsInitiator ? 'Yes' : 'No'}`);
        });
      }
      
      return {
        description: `Analysis of legislative process for bill ${billId}`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Please analyze the legislative process of bill ID ${billId}. Here is the information about the bill:\n\n${billDetails.join("\n")}\n\nPlease explain the current status of this bill, what stages it has gone through in the legislative process, and what might happen next based on the available information.`
            }
          }
        ]
      };
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        description: "Error fetching bill information",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `I intended to analyze the legislative process of bill ID ${billId}, but encountered this error: ${errorMessage}`
            }
          }
        ]
      };
    }
  }
);

server.prompt(
  "search-related-legislation",
  "Search for legislation related to a specific topic",
  [
    {
      name: "topic",
      description: "The topic to search for",
      required: true
    },
    {
      name: "knessetNum",
      description: "Optional Knesset number to filter by",
      required: false
    }
  ],
  async (request: PromptRequest) => {
    const topic = request.arguments?.topic;
    const knessetNum = request.arguments?.knessetNum;
    
    try {
      let filter = `substringof('${topic}', Name)`;
      if (knessetNum) {
        filter += ` and KnessetNum eq ${knessetNum}`;
      }
      
      const data = await fetchOdataApi(`KNS_Bill()`, { 
        $filter: filter,
        $top: '20',
        $orderby: 'KnessetNum desc'
      });
      
      if (!data.value || data.value.length === 0) {
        return {
          description: "No results found",
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `I'd like to learn about legislation related to "${topic}" ${knessetNum ? `from Knesset #${knessetNum}` : ''}, but no bills were found matching this search.`
              }
            }
          ]
        };
      }
      
      const bills = data.value.map((bill: any, index: number) => {
        return `${index + 1}. Bill ID: ${bill.BillID}\n   Name: ${bill.Name || 'N/A'}\n   Knesset #: ${bill.KnessetNum || 'N/A'}\n   Type: ${bill.SubTypeDesc || 'N/A'}\n`;
      });
      
      return {
        description: `Search results for legislation about "${topic}"`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `I'd like you to analyze legislation related to "${topic}" ${knessetNum ? `from Knesset #${knessetNum}` : ''}. Here are the search results:\n\n${bills.join("\n")}\n\nPlease analyze these bills and tell me about the key trends, important legislation, and how this topic has been addressed by the Knesset.`
            }
          }
        ]
      };
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        description: "Error searching for legislation",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `I intended to search for legislation related to "${topic}" ${knessetNum ? `from Knesset #${knessetNum}` : ''}, but encountered this error: ${errorMessage}`
            }
          }
        ]
      };
    }
  }
);

server.prompt(
  "mk-voting-record",
  "Analyze the voting record of a Knesset member",
  [
    {
      name: "personId",
      description: "The ID of the Knesset member",
      required: true
    }
  ],
  async (request: PromptRequest) => {
    const personId = request.arguments?.personId;
    
    try {
      // First get information about the Knesset member
      const personData = await fetchOdataApi(`KNS_Person(${personId})`);
      
      if (!personData) {
        return {
          description: "Error: Knesset member not found",
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `I wanted to analyze the voting record of Knesset member with ID ${personId}, but no information was found for this person.`
              }
            }
          ]
        };
      }
      
      const personName = `${personData.FirstName || ''} ${personData.LastName || ''}`;
      
      // For a comprehensive analysis, we would need to query a voting API
      // This is a placeholder as the voting data might be in a different endpoint or require additional processing
      
      return {
        description: `Analysis of voting record for ${personName}`,
        messages: [
          {
            role: "user",
            content: {
                              type: "text",
              text: `Please analyze the voting record and legislative activity of Knesset member ${personName} (ID: ${personId}).\n\nPersonal details:\n- Name: ${personName}\n- Gender: ${personData.GenderDesc || 'N/A'}\n- Email: ${personData.Email || 'N/A'}\n- Currently serving: ${personData.IsCurrent ? 'Yes' : 'No'}\n\nBased on this information, please provide an analysis of this Knesset member's political background, committees they might have served on, and notable legislative contributions. Note that comprehensive voting data is not available in this request, so please focus on what can be inferred from their basic information.`
              }
            }
          ]
        };
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        description: "Error fetching Knesset member information",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `I intended to analyze the voting record of Knesset member with ID ${personId}, but encountered this error: ${errorMessage}`
            }
          }
        ]
      };
    }
  }
);

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