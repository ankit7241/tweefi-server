import { gateDataAction } from "./actions/gate-action.js";
import { knowledgeEvaluator } from "./evaluators/knowledge.js";
import { gateDataProvider } from "./providers/provider.js";
export const gateDataPlugin = {
    name: "gated",
    description: "Gate data plugin",
    actions: [gateDataAction],
    evaluators: [knowledgeEvaluator],
    providers: [gateDataProvider],
};
export default gateDataPlugin;
//# sourceMappingURL=index.js.map