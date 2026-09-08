import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const environmentVariables = {
  VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  VITE_FIREBASE_DATABASE_URL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
};

const firebaseConfig = {
  apiKey: environmentVariables.VITE_FIREBASE_API_KEY,
  authDomain: environmentVariables.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: environmentVariables.VITE_FIREBASE_DATABASE_URL,
  projectId: environmentVariables.VITE_FIREBASE_PROJECT_ID,
  storageBucket: environmentVariables.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: environmentVariables.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: environmentVariables.VITE_FIREBASE_APP_ID,
};

const missingVariables = Object.entries(environmentVariables)
  .filter(([, value]) => !value)
  .map(([name]) => name);

let services;

function firebaseStartupError(message, error) {
  if (import.meta.env.DEV && error?.code) return new Error(`${message} (${error.code})`);
  return new Error(message);
}

function initializeOptionalAppCheck(app) {
  const siteKey = import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY;
  if (!siteKey) return null;

  if (import.meta.env.DEV && import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN;
  }

  return initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

export function getFirebaseServices() {
  if (missingVariables.length > 0) {
    throw new Error(import.meta.env.DEV
      ? `Falta configurar Firebase: ${missingVariables.join(', ')}. Copia .env.example a .env.local y completa sus valores.`
      : 'Falta completar la configuración de TutoTeLee.');
  }

  if (!services) {
    try {
      const app = initializeApp(firebaseConfig);
      const appCheck = initializeOptionalAppCheck(app);
      services = { app, appCheck, auth: getAuth(app), database: getDatabase(app) };
    } catch (error) {
      throw firebaseStartupError('No fue posible iniciar Firebase. Revisa la configuración.', error);
    }
  }
  return services;
}

export async function ensureAnonymousUser() {
  const { auth } = getFirebaseServices();
  if (auth.currentUser) return auth.currentUser;

  try {
    await signInAnonymously(auth);
  } catch (error) {
    throw firebaseStartupError('No fue posible iniciar la conexión segura. Intenta de nuevo.', error);
  }
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        if (user) {
          unsubscribe();
          resolve(user);
        }
      },
      (error) => {
        unsubscribe();
        reject(firebaseStartupError('No fue posible confirmar la conexión segura. Intenta de nuevo.', error));
      },
    );
  });
}
