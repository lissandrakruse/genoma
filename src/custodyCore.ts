import { createHash, createHmac } from "crypto";

export type CustodySignedEntry = {
  prevHash: string;
  payloadHash: string;
  signature: string;
  entryHash: string;
};

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

export function buildCustodySignedEntry(payload: Record<string, unknown>, prevHash: string, hmacKey: string): CustodySignedEntry {
  const prev = String(prevHash || "GENESIS");
  const payloadHash = createHash("sha256").update(stableJson(payload)).digest("hex");
  const signature = createHmac("sha256", hmacKey).update(`${prev}:${payloadHash}`).digest("hex");
  const entryHash = createHash("sha256").update(`${prev}:${payloadHash}:${signature}`).digest("hex");
  return { prevHash: prev, payloadHash, signature, entryHash };
}

export function verifyCustodySignedEntry(
  payload: Record<string, unknown>,
  signed: CustodySignedEntry,
  expectedPrevHash: string,
  hmacKey: string
): boolean {
  const rebuilt = buildCustodySignedEntry(payload, expectedPrevHash, hmacKey);
  return (
    rebuilt.prevHash === String(signed.prevHash || "") &&
    rebuilt.payloadHash === String(signed.payloadHash || "") &&
    rebuilt.signature === String(signed.signature || "") &&
    rebuilt.entryHash === String(signed.entryHash || "")
  );
}
