import { type AgentRuntime, parseJson } from "move-agent-kit";
import { AnyType } from "src/utils.js";
import { Tool } from "@langchain/core/tools";

/**
 * Create a fungible asset token
 * @param agent MoveAgentKit instance
 * @param name Name of the token
 * @param symbol Symbol of the token
 * @param iconURI URI of the token icon
 * @param projectURI URI of the token project
 * @param network Network to create token on
 */
export async function createToken(
  agent: AgentRuntime,
  name: string,
  symbol: string,
  iconURI: string,
  projectURI: string,
  network: string
): Promise<{
  hash: string;
  token: AnyType;
}> {
  try {
    if (network !== "mainnet" && network !== "testnet") {
      throw new Error("Invalid network");
    }
    const transaction = await agent.aptos.transaction.build.simple({
      sender: agent.account.getAddress(),
      data: {
        function: `${network === "mainnet" ? "0x67c8564aee3799e9ac669553fdef3a3828d4626f24786b6a5642152fa09469dd" : "0xe522476ab48374606d11cc8e7a360e229e37fd84fb533fcde63e091090c62149"}::launchpad::create_fa_simple`,
        functionArguments: [name, symbol, iconURI, projectURI],
      },
    });

    const committedTransactionHash =
      await agent.account.sendTransaction(transaction);

    const signedTransaction = await agent.aptos.waitForTransaction({
      transactionHash: committedTransactionHash,
    });

    if (!signedTransaction.success) {
      console.error(signedTransaction, "Token creation failed");
      throw new Error("Token creation failed");
    }

    return {
      hash: signedTransaction.hash,
      // @ts-expect-error Type 'AnyType' is not assignable to type 'AnyType'.
      token: signedTransaction.events[0].data.fa_obj.inner,
    };
  } catch (error: AnyType) {
    throw new Error(`Token creation failed: ${error.message}`);
  }
}

export class AptosCreateTokenTool extends Tool {
  name = "aptos_create_token";
  description = `this tool can be used to create fungible asset to a recipient either on aptos mainnet or testnet

  Inputs ( input is a JSON string ):
  name: string, eg "USDT" (required)
  symbol: string, eg "USDT" (required)
  iconURI: string, eg "https://example.com/icon.png" (required)
  projectURI: string, eg "https://example.com/project" (required)
  network: string, eg "mainnet" or "testnet" (required)
  `;

  constructor(private _agent: AgentRuntime) {
    super();
  }

  protected async _call(input: string): Promise<string> {
    try {
      const parsedInput = parseJson(input);

      const createTokenTransactionHash = await createToken(
        this._agent,
        parsedInput.name,
        parsedInput.symbol,
        parsedInput.iconURI,
        parsedInput.projectURI,
        parsedInput.network
      );

      return JSON.stringify({
        status: "success",
        createTokenTransactionHash,
        token: {
          name: parsedInput.name,
          decimals: 8,
        },
      });
    } catch (error: AnyType) {
      return JSON.stringify({
        status: "error",
        message: error.message,
        code: error.code || "UNKNOWN_ERROR",
      });
    }
  }
}
