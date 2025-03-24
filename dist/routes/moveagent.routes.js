import { Router } from "express";
import { MoveAgentController } from "../controllers/moveagent.controller.js";
const router = Router();
const agentController = MoveAgentController.getInstance();
router.post("/invoke", async (req, res) => {
    await agentController.handleTransfer(req, res);
});
export default router;
//# sourceMappingURL=moveagent.routes.js.map