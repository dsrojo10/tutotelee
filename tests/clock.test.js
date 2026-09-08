import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('firebase/database', () => ({ onValue: vi.fn(), ref: vi.fn((database, path) => path) }));
import { onValue } from 'firebase/database';
import { getServerNow, SERVER_TIME_TIMEOUT_MS } from '../src/clock.js';
import { calculateExpiresAt, CLOCK_SKEW_SAFETY_MS, PAIRING_TTL_MS, SESSION_TTL_MS } from '../src/core.js';

const SERVER_NOW = 1_800_000_000_000;
let unsubscribe;
let value;
let cancel;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(SERVER_NOW);
  unsubscribe = vi.fn();
  onValue.mockImplementation((reference, callback, onCancel) => {
    expect(reference).toBe('.info/serverTimeOffset');
    value = callback;
    cancel = onCancel;
    return unsubscribe;
  });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('lectura one-shot del reloj', () => {
  it('usa el offset del servidor y limpia listener y timeout tras el primer valor válido', async () => {
    const pending = getServerNow({});
    value({ val: () => -5_000 });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    value({ val: () => 8_000 });
    expect(await pending).toEqual({ now: SERVER_NOW - 5_000, source: 'server-offset' });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('acepta offset cero y limpia incluso con entrega síncrona desde caché', async () => {
    onValue.mockImplementation((reference, callback) => {
      callback({ val: () => 0 });
      return unsubscribe;
    });
    expect(await getServerNow({})).toEqual({ now: SERVER_NOW, source: 'server-offset' });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignora snapshots inválidos hasta recibir un número finito', async () => {
    const pending = getServerNow({});
    for (const invalid of [null, '0', NaN, Infinity, undefined]) value({ val: () => invalid });
    expect(unsubscribe).not.toHaveBeenCalled();
    value({ val: () => 200 });
    expect(await pending).toEqual({ now: SERVER_NOW + 200, source: 'server-offset' });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('usa fallback local y limpia después de un error del listener', async () => {
    const pending = getServerNow({});
    cancel(new Error('read failed'));
    expect(await pending).toEqual({ now: SERVER_NOW, source: 'local-fallback' });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('resuelve con fallback y limpia al vencer el timeout, ignorando valores tardíos', async () => {
    const diagnostics = { stage: vi.fn(), update: vi.fn(), error: vi.fn() };
    const pending = getServerNow({}, diagnostics);
    await vi.advanceTimersByTimeAsync(SERVER_TIME_TIMEOUT_MS);
    value({ val: () => 500 });
    expect(await pending).toEqual({ now: SERVER_NOW + SERVER_TIME_TIMEOUT_MS, source: 'local-fallback' });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(diagnostics.error).toHaveBeenCalledWith(expect.objectContaining({ code: 'SERVER_TIME_TIMEOUT' }), 'server-time');
  });

  it('no deja timeout pendiente si registrar el listener lanza una excepción', async () => {
    onValue.mockImplementation(() => { throw new Error('registration failed'); });
    expect(await getServerNow({})).toEqual({ now: SERVER_NOW, source: 'local-fallback' });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe.each([['sesión', SESSION_TTL_MS], ['pairing', PAIRING_TTL_MS]])('expiración de %s', (name, ttl) => {
  it('mantiene el TTL normal con reloj del servidor', () => {
    expect(calculateExpiresAt({ now: SERVER_NOW, source: 'server-offset' }, ttl)).toBe(SERVER_NOW + ttl);
  });
  it.each([-5_000, 0, 5_000, 30_000, CLOCK_SKEW_SAFETY_MS])('fallback con desfase %i ms permanece vigente y dentro de rules', skew => {
    const localNow = SERVER_NOW + skew;
    const expiresAt = calculateExpiresAt({ now: localNow, source: 'local-fallback' }, ttl);
    expect(expiresAt).toBe(localNow + ttl - CLOCK_SKEW_SAFETY_MS);
    expect(expiresAt).toBeGreaterThan(SERVER_NOW);
    expect(expiresAt).toBeGreaterThan(localNow);
    expect(expiresAt).toBeLessThanOrEqual(SERVER_NOW + ttl);
  });
  it('demuestra que el cálculo anterior excedía el límite con solo 1 ms de adelanto', () => {
    expect(SERVER_NOW + 1 + ttl).toBeGreaterThan(SERVER_NOW + ttl);
  });
});
