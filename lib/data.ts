import { getDb } from "./firebaseAdmin";
import { mockPainel } from "./mock";
import { Painel } from "./types";

export async function getPainel(): Promise<{ data: Painel; fonte: "firestore" | "mock" }> {
  const db = getDb();
  if (db) {
    try {
      const snap = await db.collection("painel").doc("atual").get();
      if (snap.exists) {
        return { data: snap.data() as Painel, fonte: "firestore" };
      }
    } catch {
      // cai no mock abaixo
    }
  }
  return { data: mockPainel, fonte: "mock" };
}
