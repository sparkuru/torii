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
  "INTERNAL_ERROR"
]);

export type ErrorCode = z.infer<typeof errorCodeSchema>;

const pairingCodeSchema = z.string().min(16).max(128);
const bindingTokenSchema = z.string().min(32).max(256);

export const clientMessageSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pair"), code: pairingCodeSchema }),
  z.object({ kind: z.literal("authenticate"), token: bindingTokenSchema }),
  z.object({ kind: z.literal("revoke"), token: bindingTokenSchema })
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export const serverMessageSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("paired"), token: bindingTokenSchema }),
  z.object({ kind: z.literal("authenticated") }),
  z.object({ kind: z.literal("revoked") }),
  z.object({ kind: z.literal("error"), code: errorCodeSchema })
]);

export type ServerMessage = z.infer<typeof serverMessageSchema>;

export function errorMessage(code: ErrorCode): ServerMessage {
  return { kind: "error", code };
}
