import { getCollablandApiUrl } from "../../utils.js";
import axios from "axios";
export class CollabLandBaseAction {
    constructor(name, description, similes, examples, handler, validate) {
        this.name = name;
        this.description = description;
        this.similes = similes;
        this.examples = examples;
        this.handler = handler;
        this.validate = validate;
        this.name = name;
        this.description = description;
        this.similes = similes;
        this.examples = examples;
        this.handler = handler;
        this.validate = validate;
        this.client = axios.create({
            baseURL: getCollablandApiUrl(),
            headers: {
                "X-API-KEY": process.env.COLLABLAND_API_KEY || "",
                "X-TG-BOT-TOKEN": process.env.TELEGRAM_BOT_TOKEN || "",
                "Content-Type": "application/json",
            },
            timeout: 5 * 60 * 1000,
        });
    }
    handleError(error) {
        var _a, _b, _c;
        console.log(error);
        if (axios.isAxiosError(error)) {
            console.dir((_a = error.response) === null || _a === void 0 ? void 0 : _a.data, { depth: null });
            throw new Error(`CollabLand API error: ${((_c = (_b = error.response) === null || _b === void 0 ? void 0 : _b.data) === null || _c === void 0 ? void 0 : _c.message) || error.message}`);
        }
    }
}
//# sourceMappingURL=collabland.action.js.map