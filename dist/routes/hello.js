import { Router } from "express";
const router = Router();
const checkNodeEnv = (_req, res, next) => {
    if (process.env.NODE_ENV !== "development") {
        res.status(403).json({ error: "Forbidden" });
        return;
    }
    next();
};
const handlePostCollabLand = async (_req, res) => {
    console.log("Getting AI Agent Starter Kit ...");
    res.status(200).json({
        message: "AI Agent Starter Kit",
        timestamp: new Date().toISOString(),
    });
};
router.get("/collabland", checkNodeEnv, handlePostCollabLand);
export default router;
//# sourceMappingURL=hello.js.map