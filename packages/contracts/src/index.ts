import { z } from "zod";

export const DEFAULT_BROKER_HOST = "127.0.0.1" as const;
export const DEFAULT_BROKER_PORT = 32145;
export const MAX_MESSAGE_BYTES = 4_096;

export const errorCodeSchema = z.enum([
  "MALFORMED_MESSAGE",
  "UNKNOWN_MESSAGE",
  "INVALID_PAIRING_CODE",
  "PAIRING_CODE_EXPIRED",
  "PAIRING_CODE_USED",
  "NOT_PAIRED",
  "BINDING_REVOKED",
  "WRONG_STATE",
  "INTERNAL_ERROR",
  "SESSION_NOT_ACTIVE",
  "SESSION_ALREADY_ACTIVE",
  "TAB_NOT_CLAIMED",
  "TAB_NOT_FOUND",
  "INVALID_URL",
  "NAVIGATION_FAILED",
  "DRIVER_UNAVAILABLE",
  "DRIVER_TIMEOUT"
]);

export type ErrorCode = z.infer<typeof errorCodeSchema>;

const pairingCodeSchema = z.string().min(16).max(128);
const bindingTokenSchema = z.string().min(32).max(256);
export const requestIdSchema = z.string().uuid();
export const sessionIdSchema = z.string().uuid();
export const tabIdSchema = z.number().int().nonnegative();
export const intentSchema = z.string().trim().min(1).max(1_000);

export const navigationUrlSchema = z.string().max(2_048).refine(isNavigationUrl, {
  message: "URL must be an absolute http or https URL"
});

export const tabSchema = z.object({
  id: tabIdSchema,
  title: z.string().max(1_000),
  url: z.string().max(2_048),
  active: z.boolean()
});

export type BrowserTab = z.infer<typeof tabSchema>;

export const startSessionInputSchema = z.object({ intent: intentSchema }).strict();
export const endSessionInputSchema = z.object({ session_id: sessionIdSchema }).strict();
export const listTabsInputSchema = z.object({ session_id: sessionIdSchema }).strict();
export const claimTabInputSchema = z.object({ session_id: sessionIdSchema, tab_id: tabIdSchema }).strict();
export const openTabInputSchema = z.object({ session_id: sessionIdSchema, url: navigationUrlSchema }).strict();
export const navigateTabInputSchema = z
  .object({ session_id: sessionIdSchema, tab_id: tabIdSchema, url: navigationUrlSchema })
  .strict();

export const browserCommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("list-tabs") }).strict(),
  z.object({ kind: z.literal("get-tab"), tabId: tabIdSchema }).strict(),
  z.object({ kind: z.literal("open-tab"), url: navigationUrlSchema }).strict(),
  z.object({ kind: z.literal("navigate-tab"), tabId: tabIdSchema, url: navigationUrlSchema }).strict()
]);

export type BrowserCommand = z.infer<typeof browserCommandSchema>;

export const browserCommandResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tabs"), tabs: z.array(tabSchema).max(200) }).strict(),
  z.object({ kind: z.literal("tab"), tab: tabSchema }).strict(),
  z.object({ kind: z.literal("error"), code: errorCodeSchema }).strict()
]);

export type BrowserCommandResult = z.infer<typeof browserCommandResultSchema>;

export const sessionStateSchema = z
  .object({ status: z.enum(["idle", "active"]), claimedTab: tabSchema.optional() })
  .strict()
  .superRefine((value, context) => {
    if (value.status === "idle" && value.claimedTab !== undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Idle sessions cannot have a claimed tab" });
    }
  });

export type SessionState = z.infer<typeof sessionStateSchema>;

export const clientMessageSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pair"), code: pairingCodeSchema }).strict(),
  z.object({ kind: z.literal("authenticate"), token: bindingTokenSchema }).strict(),
  z.object({ kind: z.literal("revoke"), token: bindingTokenSchema }).strict(),
  z.object({ kind: z.literal("command-result"), requestId: requestIdSchema, result: browserCommandResultSchema }).strict(),
  z.object({ kind: z.literal("tab-removed"), tabId: tabIdSchema }).strict()
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export const serverMessageSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("paired"), token: bindingTokenSchema }).strict(),
  z.object({ kind: z.literal("authenticated") }).strict(),
  z.object({ kind: z.literal("revoked") }).strict(),
  z.object({ kind: z.literal("error"), code: errorCodeSchema }).strict(),
  z.object({ kind: z.literal("command"), requestId: requestIdSchema, command: browserCommandSchema }).strict(),
  z.object({ kind: z.literal("session-state"), state: sessionStateSchema }).strict()
]);

export type ServerMessage = z.infer<typeof serverMessageSchema>;

export function errorMessage(code: ErrorCode): ServerMessage {
  return { kind: "error", code };
}

export function isNavigationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isCrossOrigin(from: string, destination: string): boolean {
  try {
    return new URL(from).origin !== new URL(destination).origin;
  } catch {
    return true;
  }
}
