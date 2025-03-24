import { elizaLogger, } from "@ai16z/eliza";
import { StorageService } from "../services/storage.service.js";
export const gateDataAction = {
    name: "GATE_DATA",
    description: "Encrypts important data using a secret key and stores it in a decentralized database",
    similes: ["GATE_DATA", "ENCRYPT_DATA", "PROTECT_DATA"],
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Please protect the data from our conversation",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Gating data now...",
                    action: "GATE_DATA",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Please encrypt the data from our conversation",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Gating data now...",
                    action: "GATE_DATA",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "I have important data to encrypt",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Gating data now...",
                    action: "GATE_DATA",
                },
            },
        ],
    ],
    validate: async (_runtime, message, _state) => {
        return (StorageService.getInstance().isConfigured() &&
            StorageService.isMemoryStorable(message));
    },
    handler: async (_runtime, message, state) => {
        try {
            elizaLogger.log("[gateDataAction] Gating data now...");
            const { content, embedding } = message;
            const storageService = StorageService.getInstance();
            await storageService.start();
            if (embedding && state && !state.hasGatedAndStored) {
                const doc1 = await storageService.storeMessageWithEmbedding(content.text, embedding, true);
                if (!doc1) {
                    return;
                }
                if (state) {
                    state.hasGatedAndStored = true;
                }
                elizaLogger.debug(`[gateDataAction] Stored message with embedding with stream ID ${doc1.id}`);
                return;
            }
            elizaLogger.error("[gateDataAction] no embedding included in the message", message);
        }
        catch (error) {
            elizaLogger.error("[gateDataAction] error ", JSON.stringify(error, null, 2));
        }
    },
};
//# sourceMappingURL=gate-action.js.map