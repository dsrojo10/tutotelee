import './styles.css';
import { onValue } from 'firebase/database';
import { createVoiceRecognition } from './voice-recognition.js';
import { normalizeText } from './core.js';
import { ensureAnonymousUser, getFirebaseServices } from './firebase.js';
import { claimSession, disconnectPhone, sendCurrentText } from './pairing.js';

const setupPanel = document.querySelector('#setup-panel');
const conversationPanel = document.querySelector('#conversation-panel');
const connectForm = document.querySelector('#connect-form');
const codeInput = document.querySelector('#pairing-code');
const connectButton = document.querySelector('#connect-button');
const speakButton = document.querySelector('#speak-button');
const speechHelp = document.querySelector('#speech-help');
const speechPreview = document.querySelector('#speech-preview');
const manualForm = document.querySelector('#manual-form');
const manualText = document.querySelector('#manual-text');
const clearButton = document.querySelector('#clear-button');
const disconnectButton = document.querySelector('#disconnect-button');
const appMessage = document.querySelector('#app-message');

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;
let voice;
let activeSession;
let unsubscribeSession;
let user;
const userPromise = ensureAnonymousUser().then((authenticatedUser) => {
  user = authenticatedUser;
  return authenticatedUser;
});

function setMessage(message = '', isError = false) {
  appMessage.textContent = message;
  appMessage.classList.toggle('is-error', isError);
}

function setBusy(isBusy) {
  connectButton.disabled = isBusy;
  codeInput.disabled = isBusy;
  connectButton.textContent = isBusy ? 'CONECTANDO…' : 'CONECTAR';
}

function setListening(value) {
  speakButton.classList.toggle('is-listening', value);
  speakButton.setAttribute('aria-pressed', String(value));
  speakButton.textContent = value ? 'DETENER' : 'HABLAR';
  if (Recognition) speechHelp.textContent = value ? 'Escuchando… pulsa para detener.' : 'Pulsa para comenzar a hablar.';
}

function showConversation() {
  setupPanel.hidden = true;
  conversationPanel.hidden = false;
  setMessage('');
  speakButton.focus();
}

function showSetup(message = '') {
  stopRecognition();
  setupPanel.hidden = false;
  conversationPanel.hidden = true;
  codeInput.value = '';
  setMessage(message, Boolean(message));
  codeInput.focus();
}

function explainSpeechSupport() {
  if (Recognition) return;
  speakButton.disabled = true;
  speakButton.textContent = 'VOZ NO DISPONIBLE';
  speechHelp.textContent =
    'Este navegador no ofrece reconocimiento de voz. Puedes usar el micrófono del teclado para dictar en el cuadro de texto.';
}

async function publishSpeech(text, isFinal) {
  const normalized = normalizeText(text);
  speechPreview.textContent = normalized || 'Aquí aparecerá lo que dices.';
  if (!normalized || !activeSession) return;
  try {
    await sendCurrentText(activeSession.sessionRef, normalized, isFinal);
  } catch {
    setMessage('No se pudo enviar el texto al TV. Revisa la conexión.', true);
  }
}

function configureRecognition() {
  if (!Recognition) return;
  recognition = new Recognition();
  recognition.lang = 'es-CO';
  recognition.interimResults = true;
  recognition.continuous = true;

  voice = createVoiceRecognition(recognition, {
    onText: publishSpeech,
    onListening: setListening,
    onError: error => {
      const denied = ['not-allowed', 'service-not-allowed', 'permission-denied'].includes(error);
      setMessage(denied
        ? 'El navegador no tiene permiso para usar el micrófono.'
        : 'El reconocimiento se detuvo. Pulsa HABLAR para reintentar o usa el texto manual.', true);
    },
  });
}

function stopRecognition() {
  voice?.stop();
}

async function leaveSession(message = '') {
  stopRecognition();
  unsubscribeSession?.();
  unsubscribeSession = undefined;
  const session = activeSession;
  activeSession = undefined;
  if (session) await disconnectPhone(session.sessionRef, session.disconnectOperation).catch(() => {});
  showSetup(message);
}

connectForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage('');
  setBusy(true);
  try {
    const { database } = getFirebaseServices();
    user ||= await userPromise;
    activeSession = await claimSession(database, codeInput.value, user.uid);
    showConversation();
    unsubscribeSession = onValue(activeSession.sessionRef, (snapshot) => {
      const session = snapshot.val();
      if (!session || !session.connected || session.phoneUid !== user.uid) {
        leaveSession('La conexión con el TV terminó. Usa el nuevo código para volver a conectar.');
      }
    });
  } catch (error) {
    setMessage(error?.message || 'No se pudo conectar con el TV.', true);
  } finally {
    setBusy(false);
  }
});

codeInput.addEventListener('input', () => {
  codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
});

speakButton.addEventListener('click', () => {
  if (!voice || !activeSession) return;
  setMessage('');
  if (voice.userWantsListening) stopRecognition();
  else voice.start();
});

manualForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = normalizeText(manualText.value);
  if (!text) {
    setMessage('Escribe un texto antes de mostrarlo en el TV.', true);
    manualText.focus();
    return;
  }
  try {
    await sendCurrentText(activeSession.sessionRef, text, true);
    speechPreview.textContent = text;
    setMessage('Texto mostrado en el TV.');
  } catch {
    setMessage('No se pudo mostrar el texto. Revisa la conexión.', true);
  }
});

clearButton.addEventListener('click', async () => {
  stopRecognition();
  try {
    await sendCurrentText(activeSession.sessionRef, '', true);
    speechPreview.textContent = 'Aquí aparecerá lo que dices.';
    manualText.value = '';
    setMessage('Pantalla del TV borrada.');
  } catch {
    setMessage('No se pudo borrar el TV. Revisa la conexión.', true);
  }
});

disconnectButton.addEventListener('click', () => leaveSession());

window.addEventListener('pagehide', stopRecognition);

configureRecognition();
explainSpeechSupport();

userPromise.catch((error) => {
  setMessage(error?.message || 'No fue posible iniciar Firebase.', true);
  connectButton.disabled = true;
});
