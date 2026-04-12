export {};

declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
      actor: {
        type: "board" | "agent" | "none";
        userId?: string;
        agentId?: string;
        companyId?: string;
        companyIds?: string[];
        isInstanceAdmin?: boolean;
        keyId?: string;
        runId?: string;
        source?: "local_implicit" | "session" | "mini_app_jwt" | "agent_key" | "agent_jwt" | "none";
      };
    }
  }
}
