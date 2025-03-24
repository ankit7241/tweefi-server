import { StorageService } from "../services/storage.service.js";
export const gateDataProvider = {
    get: async (_runtime, message, _state) => {
        try {
            if (!message.embedding) {
                return "";
            }
            else {
                const storageService = StorageService.getInstance();
                if (!storageService.isConfigured()) {
                    return "";
                }
                const additionalContext = await storageService.getEmbeddingContext(message.embedding);
                if (additionalContext) {
                    return ("[Important information from gated memory]: " + additionalContext);
                }
            }
            return "";
        }
        catch (error) {
            return error instanceof Error
                ? error.message
                : "Unable to get storage provider";
        }
    },
};
//# sourceMappingURL=provider.js.map