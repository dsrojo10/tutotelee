import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase/database', () => ({ onValue: vi.fn() }));
vi.mock('../src/firebase.js', () => ({ ensureAnonymousUser: vi.fn(), getFirebaseServices: () => ({ database: {} }) }));
vi.mock('../src/pairing.js', () => ({ claimSession: vi.fn(), disconnectPhone: vi.fn(), sendCurrentText: vi.fn() }));
import { onValue } from 'firebase/database';
import { ensureAnonymousUser } from '../src/firebase.js';
import { claimSession, disconnectPhone, sendCurrentText } from '../src/pairing.js';

let elements, recognizer, sessionListener, pagehide;
const session = { sessionRef: 'test-ref', disconnectOperation: {} };
function element() {
  return { callbacks: {}, value: '', textContent: '', hidden: false,
    classList: { toggle: vi.fn() }, setAttribute: vi.fn(), focus: vi.fn(),
    addEventListener(type, callback) { this.callbacks[type] = callback; } };
}
async function event(id, type) { await elements[id].callbacks[type]({ preventDefault() {} }); }
function speech(text, isFinal = false) {
  recognizer.callbacks.result({ results: [Object.assign([{ transcript: text }], { isFinal })] });
}
beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks(); vi.useFakeTimers();
  elements = {};
  class Recognition {
    callbacks = {};
    start = vi.fn(); abort = vi.fn();
    constructor() { recognizer = this; }
    addEventListener(type, callback) { this.callbacks[type] = callback; }
  }
  vi.stubGlobal('document', { querySelector: id => elements[id] ||= element() });
  vi.stubGlobal('window', { SpeechRecognition: Recognition, addEventListener: (type, callback) => { if (type === 'pagehide') pagehide = callback; } });
  ensureAnonymousUser.mockResolvedValue({ uid: 'test-user' });
  claimSession.mockResolvedValue(session);
  sendCurrentText.mockResolvedValue(); disconnectPhone.mockResolvedValue();
  onValue.mockImplementation((reference, callback) => { sessionListener = callback; return vi.fn(); });
  await import('../src/phone.js');
  elements['#pairing-code'].value = '123456';
  await event('#connect-form', 'submit');
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('regresión del flujo del celular con voz experimental', () => {
  it('conecta y conserva exactamente la normalización manual de 500 caracteres', async () => {
    expect(claimSession).toHaveBeenCalledWith({}, '123456', 'test-user');
    expect(elements['#conversation-panel'].hidden).toBe(false);
    elements['#manual-text'].value = '  Uno   dos\r\n\nTres';
    await event('#manual-form', 'submit');
    expect(sendCurrentText).toHaveBeenLastCalledWith('test-ref', 'Uno dos\n\nTres', true);
    elements['#manual-text'].value = 'a'.repeat(500) + 'nuevo';
    await event('#manual-form', 'submit');
    expect(sendCurrentText).toHaveBeenLastCalledWith('test-ref', 'a'.repeat(500), true);
  });
  it('envía la cola de voz, <=420 y <=500, y BORRAR impide que reaparezca voz tardía', async () => {
    await event('#speak-button', 'click');
    speech('antiguo '.repeat(100) + 'lo último');
    const sent = sendCurrentText.mock.lastCall[1];
    expect(sent.endsWith('lo último')).toBe(true);
    expect(sent.length).toBeLessThanOrEqual(420);
    await event('#clear-button', 'click');
    speech('tardío');
    expect(sendCurrentText).toHaveBeenLastCalledWith('test-ref', '', true);
    expect(recognizer.abort).toHaveBeenCalled();
  });
  it('desconectar cancela reinicio, limpia escucha y vuelve a conectar sin contexto anterior', async () => {
    await event('#speak-button', 'click'); speech('Anterior', true);
    recognizer.callbacks.end();
    await event('#disconnect-button', 'click');
    await Promise.resolve();
    vi.runAllTimers();
    expect(disconnectPhone).toHaveBeenCalledWith('test-ref', session.disconnectOperation);
    expect(recognizer.start).toHaveBeenCalledTimes(1);
    await event('#connect-form', 'submit');
    await event('#speak-button', 'click'); speech('Nueva', true);
    expect(sendCurrentText).toHaveBeenLastCalledWith('test-ref', 'Nueva', true);
  });
  it('sesión terminada cancela voz y timer de reinicio', async () => {
    await event('#speak-button', 'click'); recognizer.callbacks.end();
    sessionListener({ val: () => null });
    vi.runAllTimers();
    await Promise.resolve(); await Promise.resolve();
    expect(elements['#speak-button'].textContent).toBe('HABLAR');
    expect(recognizer.start).toHaveBeenCalledTimes(1);
  });
  it('salir de la página cancela reinicio pendiente', async () => {
    await event('#speak-button', 'click'); recognizer.callbacks.end(); pagehide(); vi.runAllTimers();
    expect(recognizer.start).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
