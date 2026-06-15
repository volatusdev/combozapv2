import admin from "firebase-admin";

let _app: admin.app.App | null = null;

function getApp(): admin.app.App {
  if (_app) return _app;

  const projectId   = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // Node.js --env-file may expand \n already; handle both literal and real newlines
  const rawKey      = process.env.FIREBASE_PRIVATE_KEY ?? "";
  const privateKey  = rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      `Firebase Admin não configurado — vars: PROJECT_ID=${!!projectId} CLIENT_EMAIL=${!!clientEmail} PRIVATE_KEY=${!!privateKey}`
    );
  }

  // Always init fresh — do not reuse a stale admin.apps[0] from a failed init
  const existing = admin.apps.find(a => a?.name === "[DEFAULT]");
  if (existing) {
    _app = existing;
    return _app;
  }

  _app = admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });

  return _app;
}

export async function verifyFirebaseToken(idToken: string) {
  const app = getApp();
  return admin.auth(app).verifyIdToken(idToken);
}
