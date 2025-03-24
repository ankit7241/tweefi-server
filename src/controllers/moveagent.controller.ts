import { Request, Response } from "express";
import { AptosService } from "../services/aptos.service.js";

export class MoveAgentController {
  private aptosService: AptosService;
  private static instance: MoveAgentController;

  constructor() {
    this.aptosService = new AptosService();
  }

  // Singleton pattern to avoid multiple instances
  public static getInstance(): MoveAgentController {
    if (!MoveAgentController.instance) {
      MoveAgentController.instance = new MoveAgentController();
    }
    return MoveAgentController.instance;
  }

  public async handleTransfer(req: Request, res: Response): Promise<void> {
    try {
      const { prompt, userId, accessToken } = req.body;

      // Input validation
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

      // Process the transfer request
      const result = await this.aptosService.processRequest(
        userId,
        accessToken,
        prompt
      );

      res.json({
        success: true,
        message: result,
      });
    } catch (error) {
      console.error("❌ Transfer processing error:", error);

      // Handle specific error types
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

      // Generic error response
      res.status(500).json({
        success: false,
        message: "Failed to process transfer request",
      });
    }
  }
}
