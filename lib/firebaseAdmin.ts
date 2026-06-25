import { cert, getApps, initializeApp, App, ServiceAccount } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";

let db: Firestore | null = null;

// Aceita a chave colada de qualquer jeito: com aspas em volta, com \n literal,
// ou já com quebras de linha reais.
function normalizarChave(raw: string): string {
  let k = raw.trim();
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
    k = k.slice(1, -1);
  }
  return k.replace(/\\n/g, "\n");
}

function carregarCredencial(): ServiceAccount | null {
  // Opção 1 (recomendada): o JSON inteiro da conta de serviço em base64.
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (b64) {
    try {
      const j = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
      return { projectId: j.project_id, clientEmail: j.client_email, privateKey: j.private_key };
    } catch (e) {
      console.error("FIREBASE_SERVICE_ACCOUNT_BASE64 inválido:", e);
      return null;
    }
  }
  // Opção 2: as três variáveis separadas.
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
  if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
    return {
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey: normalizarChave(FIREBASE_PRIVATE_KEY),
    };
  }
  return null;
}

export function getDb(): Firestore | null {
  if (db) return db;
  const credencial = carregarCredencial();
  if (!credencial) return null;
  const app: App = getApps().length ? getApps()[0] : initializeApp({ credential: cert(credencial) });
  db = getFirestore(app);
  return db;
}
