import { BaseService } from "./base.service.js";
export class NgrokService extends BaseService {
    constructor() {
        super();
    }
    static getInstance() {
        if (!NgrokService.instance) {
            NgrokService.instance = new NgrokService();
        }
        return NgrokService.instance;
    }
    async start() {
    }
    getUrl() {
        return process.env.NGROK_URL;
    }
    async stop() {
    }
}
//# sourceMappingURL=ngrok.service.js.map