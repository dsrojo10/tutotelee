import './styles.css';
import { onValue, remove } from 'firebase/database';
import { formatPairingCode, isExpired } from './core.js';
import { ensureAnonymousUser, getFirebaseServices } from './firebase.js';
import { createTvSession, getServerNow } from './pairing.js';

const statusElement = document.querySelector('#tv-status');
const pairingView = document.querySelector('#pairing-view');
const codeElement = document.querySelector('#tv-code');
const textView = document.querySelector('#text-view');
const textElement = document.querySelector('#tv-text');
const partialLabel = document.querySelector('#partial-label');
const errorView = document.querySelector('#tv-error');
const errorDetail = document.querySelector('#tv-error-detail');

let activeSession;
let unsubscribeSession;
let expiryTimer;
let restarting = false;
let hasConnected = false;

function showPairing(code) {
  pairingView.hidden = false;
  textView.hidden = true;
  errorView.hidden = true;
  codeElement.textContent = formatPairingCode(code);
  statusElement.textContent = 'Esperando un celular';
}

function showConversation(session) {
  pairingView.hidden = true;
  textView.hidden = false;
  errorView.hidden = true;
  statusElement.textContent = 'Conectado';

  const hasText = Boolean(session.currentText);
  textElement.textContent = hasText ? session.currentText : 'Esperando que hablen…';
  textElement.classList.toggle('is-placeholder', !hasText);
  textElement.classList.toggle('is-partial', hasText && !session.isFinal);
  partialLabel.hidden = !hasText || session.isFinal;
}

function showError(error) {
  pairingView.hidden = true;
  textView.hidden = true;
  errorView.hidden = false;
  statusElement.textContent = 'Sin conexión';
  errorDetail.textContent = error?.message || 'Revisa la conexión y vuelve a cargar la página.';
}

async function cleanActiveSession() {
  clearTimeout(expiryTimer);
  unsubscribeSession?.();
  unsubscribeSession = undefined;
  if (!activeSession) return;

  await activeSession.disconnectPairing?.cancel().catch(() => {});
  await activeSession.disconnectSession?.cancel().catch(() => {});
  await remove(activeSession.pairingRef).catch(() => {});
  await remove(activeSession.sessionRef).catch(() => {});
  activeSession = undefined;
}

async function restartPairing(database, tvUid) {
  if (restarting) return;
  restarting = true;
  try {
    await cleanActiveSession();
    hasConnected = false;
    statusElement.textContent = 'Creando un código nuevo…';
    activeSession = await createTvSession(database, tvUid);
    showPairing(activeSession.code);

    const delay = Math.max(0, activeSession.expiresAt - (await getServerNow(database)));
    expiryTimer = window.setTimeout(() => restartPairing(database, tvUid), delay + 100);

    unsubscribeSession = onValue(
      activeSession.sessionRef,
      (snapshot) => {
        const session = snapshot.val();
        if (!session) return;
        if (session.connected) {
          hasConnected = true;
          clearTimeout(expiryTimer);
          expiryTimer = window.setTimeout(
            () => restartPairing(database, tvUid),
            Math.max(0, session.expiresAt - Date.now()) + 100,
          );
          remove(activeSession.pairingRef).catch(() => {});
          showConversation(session);
        } else if (hasConnected) {
          statusElement.textContent = 'Celular desconectado. Creando un código nuevo…';
          restartPairing(database, tvUid);
        } else if (isExpired(activeSession.expiresAt)) {
          restartPairing(database, tvUid);
        }
      },
      showError,
    );
  } catch (error) {
    showError(error);
  } finally {
    restarting = false;
  }
}

async function start() {
  try {
    const { database } = getFirebaseServices();
    const user = await ensureAnonymousUser();
    await restartPairing(database, user.uid);
  } catch (error) {
    showError(error);
  }
}

start();
