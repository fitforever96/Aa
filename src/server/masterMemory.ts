import "server-only";
import { GENERIC_STANDARD } from "@/lib/ai/standard";

/**
 * Anthony Acosta's proposal-development master memory (server deployments).
 * The full text is customer-confidential and is NOT stored in this public
 * repository: set it as the MASTER_MEMORY environment variable. In direct
 * (on-device) mode the app uses the copy unlocked from the private data pack.
 */
export const MASTER_MEMORY = (process.env.MASTER_MEMORY || "").trim() || GENERIC_STANDARD;
