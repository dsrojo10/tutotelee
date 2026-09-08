import { appendFinalVoiceSegment, fitVoiceWindow } from './voice-window.js';

export const VOICE_RESTART_DELAY_MS = 750;
export const VOICE_MAX_EMPTY_RESTARTS = 3;
const RECOVERABLE_ERRORS = new Set(['no-speech', 'network', 'aborted']);

// One recognizer, one restart timer. Browser events and user intent are separate.
export function createVoiceRecognition(recognition, { onText, onListening, onError }) {
  let userWantsListening = false;
  let phase = 'idle';
  let restartTimer;
  let emptyRestarts = 0;
  let nextFinalIndex = 0;
  let finalSegments = [];
  let interim = '';

  function clearRestart() {
    clearTimeout(restartTimer);
    restartTimer = undefined;
  }
  function stop() {
    userWantsListening = false;
    clearRestart();
    finalSegments = [];
    interim = '';
    onListening(false);
    if (phase === 'starting' || phase === 'listening') {
      phase = 'stopping';
      try { recognition.abort(); } catch { phase = 'idle'; }
    }
  }
  function begin() {
    if (!userWantsListening || phase !== 'idle') return;
    nextFinalIndex = 0;
    phase = 'starting';
    try { recognition.start(); } catch {
      phase = 'idle';
      stop();
      onError('start-failed');
    }
  }
  function scheduleRestart() {
    if (!userWantsListening || restartTimer !== undefined || phase !== 'idle') return;
    if (emptyRestarts >= VOICE_MAX_EMPTY_RESTARTS) {
      stop();
      onError('retry-limit');
      return;
    }
    emptyRestarts += 1;
    restartTimer = setTimeout(() => {
      restartTimer = undefined;
      begin();
    }, VOICE_RESTART_DELAY_MS * emptyRestarts);
  }
  recognition.addEventListener('start', () => {
    if (!userWantsListening || phase === 'stopping') {
      phase = 'stopping';
      try { recognition.abort(); } catch { phase = 'idle'; }
      return;
    }
    phase = 'listening';
  });
  recognition.addEventListener('result', event => {
    if (!userWantsListening || phase === 'stopping') return;
    interim = '';
    // Final results never change within a recognition run. Consume each once,
    // without copying the browser's entire cumulative results into app state.
    for (let i = nextFinalIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const text = result[0]?.transcript || '';
      if (result.isFinal) {
        finalSegments = appendFinalVoiceSegment(finalSegments, text);
        nextFinalIndex = i + 1;
      } else {
        interim += ` ${text}`;
      }
      if (text.trim()) emptyRestarts = 0;
    }
    const window = fitVoiceWindow(finalSegments, interim);
    finalSegments = window.finalSegments;
    interim = window.interim;
    onText(window.text, !interim);
  });
  recognition.addEventListener('error', event => {
    if (!userWantsListening) return;
    interim = '';
    if (!RECOVERABLE_ERRORS.has(event.error)) {
      stop();
      onError(event.error);
    }
    // Recoverable errors wait for end before restarting; never start concurrently.
  });
  recognition.addEventListener('end', () => {
    phase = 'idle';
    interim = '';
    scheduleRestart();
  });
  return {
    start() {
      if (userWantsListening) return;
      userWantsListening = true;
      emptyRestarts = 0;
      finalSegments = [];
      interim = '';
      onListening(true);
      begin(); // If still stopping, end will schedule the next start.
    },
    stop,
    get userWantsListening() { return userWantsListening; },
  };
}
