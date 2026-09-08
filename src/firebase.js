import { initializeApp } from 'firebase/app';
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

export function getFirebaseServices() {
  if (missingVariables.length > 0) {
    throw new Error(
      `Falta configurar Firebase: ${missingVariables.join(', ')}. Copia .env.example a .env.local y completa sus valores.`,
    );
  }

  if (!services) {
    const app = initializeApp(firebaseConfig);
    services = { app, auth: getAuth(app), database: getDatabase(app) };
  }
  return services;
}

export async function ensureAnonymousUser() {
  const { auth } = getFirebaseServices();
  if (auth.currentUser) return auth.currentUser;

  await signInAnonymously(auth);
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
        reject(error);
      },
    );
  });
}
