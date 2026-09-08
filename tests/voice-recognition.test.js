import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVoiceRecognition, VOICE_RESTART_DELAY_MS } from '../src/voice-recognition.js';

export class FakeRecognition {
  callbacks = {};
  start = vi.fn();
  abort = vi.fn();
  addEventListener(type, callback) { this.callbacks[type] = callback; }
  emit(type, event = {}) { this.callbacks[type]?.(event); }
}
const result = (transcript, isFinal = true) => Object.assign([{ transcript }], { isFinal });
let recognition, voice, onText, onError, onListening;
beforeEach(() => {
  vi.useFakeTimers();
  recognition = new FakeRecognition();
  onText = vi.fn(); onError = vi.fn(); onListening = vi.fn();
  voice = createVoiceRecognition(recognition, { onText, onError, onListening });
});
afterEach(() => vi.useRealTimers());

describe('ciclo de reconocimiento de voz', () => {
  it('no inicia dos veces durante starting o listening', () => {
    voice.start(); voice.start(); recognition.emit('start'); voice.start();
    expect(recognition.start).toHaveBeenCalledTimes(1);
  });
  it('reanuda tras end normal con espera y conserva contexto de finales', () => {
    voice.start(); recognition.emit('start');
    recognition.emit('result', { results: [result('Primera.')] });
    recognition.emit('end');
    expect(voice.userWantsListening).toBe(true);
    expect(recognition.start).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(VOICE_RESTART_DELAY_MS);
    recognition.emit('start');
    recognition.emit('result', { results: [result('Segunda.', false)] });
    expect(onText).toHaveBeenLastCalledWith('Primera.\nSegunda.', false);
  });
  it('procesa finales acumulados una sola vez y reemplaza interim', () => {
    voice.start();
    recognition.emit('result', { results: [result('Uno.'), result('do', false)] });
    recognition.emit('result', { results: [result('Uno.'), result('dos', false)] });
    expect(onText).toHaveBeenLastCalledWith('Uno.\ndos', false);
    recognition.emit('result', { results: [result('Uno.'), result('Dos.')] });
    expect(onText).toHaveBeenLastCalledWith('Uno.\nDos.', true);
  });
  it('elimina interim retirado por el navegador sin perder finales', () => {
    voice.start();
    recognition.emit('result', { results: [result('Uno.'), result('interim', false)] });
    recognition.emit('result', { results: [result('Uno.')], resultIndex: 1 });
    expect(onText).toHaveBeenLastCalledWith('Uno.', true);
  });
  it('DETENER cancela restart pendiente e ignora resultados tardíos', () => {
    voice.start(); recognition.emit('end'); voice.stop();
    vi.runAllTimers();
    recognition.emit('result', { results: [result('tardío')] });
    expect(onText).not.toHaveBeenCalled();
    expect(recognition.start).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('detener durante inicio impide reinicio incluso con start tardío', () => {
    voice.start(); voice.stop(); recognition.emit('start'); recognition.emit('end');
    vi.runAllTimers();
    expect(voice.userWantsListening).toBe(false);
    expect(recognition.start).toHaveBeenCalledTimes(1);
  });
  it('espera end en ciclos rápidos detener/iniciar y limpia contexto anterior', () => {
    voice.start(); recognition.emit('start');
    recognition.emit('result', { results: [result('Anterior.')] });
    voice.stop(); voice.start();
    expect(recognition.start).toHaveBeenCalledTimes(1);
    recognition.emit('end'); vi.advanceTimersByTime(VOICE_RESTART_DELAY_MS);
    recognition.emit('result', { results: [result('Nueva.')] });
    expect(recognition.start).toHaveBeenCalledTimes(2);
    expect(onText).toHaveBeenLastCalledWith('Nueva.', true);
  });
  it.each(['not-allowed', 'service-not-allowed', 'permission-denied', 'audio-capture', 'language-not-supported', 'unknown'])('no reinicia tras error fatal %s', error => {
    voice.start(); recognition.emit('error', { error }); recognition.emit('end'); vi.runAllTimers();
    expect(recognition.start).toHaveBeenCalledTimes(1);
    expect(voice.userWantsListening).toBe(false);
    expect(onError).toHaveBeenCalledWith(error);
  });
  it.each(['network', 'no-speech', 'aborted'])('recupera cuidadosamente %s solo después de end', error => {
    voice.start(); recognition.emit('error', { error }); vi.runAllTimers();
    expect(recognition.start).toHaveBeenCalledTimes(1);
    recognition.emit('end'); vi.advanceTimersByTime(VOICE_RESTART_DELAY_MS);
    expect(recognition.start).toHaveBeenCalledTimes(2);
  });
  it('limita reinicios sin resultados y no crea timers duplicados', () => {
    voice.start();
    for (let i = 0; i < 5; i += 1) { recognition.emit('end'); recognition.emit('end'); vi.runAllTimers(); }
    expect(recognition.start).toHaveBeenCalledTimes(4);
    expect(onError).toHaveBeenCalledWith('retry-limit');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('no reinicia en bucle si start lanza una excepción', () => {
    recognition.start.mockImplementation(() => { throw new Error('not allowed'); });
    voice.start(); vi.runAllTimers();
    expect(voice.userWantsListening).toBe(false);
    expect(onError).toHaveBeenCalledWith('start-failed');
  });
});
