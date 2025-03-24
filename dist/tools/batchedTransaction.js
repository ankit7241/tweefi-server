import { AccountAddress, convertAmountFromHumanReadableToOnChain, AptosConfig, Network, Aptos, } from "@aptos-labs/ts-sdk";
import { Tool } from "@langchain/core/tools";
import { parseJson } from "move-agent-kit";
export class AptosBatchTransferTool extends Tool {
    constructor(agent) {
        super();
        this.agent = agent;
        this.name = "aptos_batch_transfer";
        this.description = `This tool can be used to transfer APT, any token, or fungible assets to multiple recipients in a single transaction.
  
    Inputs (input is a JSON string):
    recipients: Array<{ to: string, amount: number }>, required
    mint: string, required, specifies the token to be transferred`;
    }
    async _call(input) {
        try {
            console.log("Received input:", input);
            const parsedInput = parseJson(input);
            const { recipients, mint } = parsedInput;
            console.log("Called Batch Transfer Tool");
            console.log("Recipients:", recipients);
            console.log("Mint Details:", mint);
            if (!Array.isArray(recipients) || recipients.length === 0) {
                throw new Error("Recipients list must be a non-empty array.");
            }
            const config = new AptosConfig({ network: Network.TESTNET });
            const aptos = new Aptos(config);
            const mintDetail = await this.agent.getTokenDetails(mint);
            const senderAddress = await this.agent.account.getAddress();
            const transaction = await aptos.transaction.build.simple({
                sender: senderAddress,
                data: {
                    function: "0x1::aptos_account::batch_transfer",
                    functionArguments: [
                        recipients.map((r) => AccountAddress.from(r.to)),
                        recipients.map((r) => convertAmountFromHumanReadableToOnChain(r.amount, mintDetail.decimals || 6)),
                    ],
                },
            });
            const transactionHash = await this.agent.account.sendTransaction(transaction);
            return JSON.stringify({
                status: "success",
                transactionHash,
                token: {
                    name: mintDetail.name,
                    decimals: mintDetail.decimals,
                },
            });
        }
        catch (error) {
            return JSON.stringify({
                status: "error",
                message: error.message,
                code: error.code || "UNKNOWN_ERROR",
            });
        }
    }
}
//# sourceMappingURL=batchedTransaction.js.map