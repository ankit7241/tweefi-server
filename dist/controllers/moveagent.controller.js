import { AptosService } from "../services/aptos.service.js";
export class MoveAgentController {
    constructor() {
        this.aptosService = new AptosService();
    }
    static getInstance() {
        if (!MoveAgentController.instance) {
            MoveAgentController.instance = new MoveAgentController();
        }
        return MoveAgentController.instance;
    }
    async handleTransfer(req, res) {
        try {
            const { prompt, userId, accessToken } = req.body;
            if (!prompt || typeof prompt !== "string") {
                res.status(400).json({
                    success: false,
                    message: "Invalid request: prompt must be a non-empty string",
                });
                return;
            }
            if (!userId || !accessToken) {
                res.status(400).json({
                    success: false,
                    message: "Invalid request: userId and accessToken are required",
                });
                return;
            }
            const result = await this.aptosService.processRequest(userId, accessToken, prompt);
            res.json({
                success: true,
                message: result,
            });
        }
        catch (error) {
            console.error("❌ Transfer processing error:", error);
            if (error instanceof Error) {
                if (error.message.includes("insufficient funds")) {
                    res.status(400).json({
                        success: false,
                        message: "Insufficient funds for transfer",
                    });
                    return;
                }
                if (error.message.includes("invalid address")) {
                    res.status(400).json({
                        success: false,
                        message: "Invalid Aptos address provided",
                    });
                    return;
                }
                if (error.message.includes("not found in database")) {
                    res.status(404).json({
                        success: false,
                        message: "User not found",
                    });
                    return;
                }
            }
            res.status(500).json({
                success: false,
                message: "Failed to process transfer request",
            });
        }
    }
}
//# sourceMappingURL=moveagent.controller.js.map