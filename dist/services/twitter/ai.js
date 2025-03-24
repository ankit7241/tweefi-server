import axios from "axios";
import dotenv from "dotenv";
dotenv.config();
export const getAIRecommendation = async (text, userId, accessToken) => {
    try {
        if (!text || typeof text !== "string") {
            throw new Error("Invalid input: text must be a non-empty string");
        }
        const AI_API_URL = process.env.AI_API_URL || "http://localhost:8081/api";
        const { data } = await axios.post(`${AI_API_URL}/invoke`, {
            prompt: text,
            userId: userId,
            accessToken: accessToken,
        }, {
            timeout: 90000,
            headers: {
                "Content-Type": "application/json",
            },
        });
        if (!data || !data.message) {
            return "Invalid response from AI service";
        }
        return data.message;
    }
    catch (err) {
        console.error("❌ Failed to get AI recommendation:", err);
        if (axios.isAxiosError(err)) {
            if (err.code === "ECONNREFUSED") {
                console.error("AI service is not running");
            }
            else if (err.response) {
                console.error("AI service error:", err.response.status, err.response.data);
            }
        }
        return "Thanks for reaching out! Try again later.";
    }
};
//# sourceMappingURL=ai.js.map