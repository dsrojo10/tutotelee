import { describe, expect, it, vi } from 'vitest';
import { createTvDiagnostics, debugEnabled } from '../src/diagnostics.js';

vi.mock('firebase/database', () => ({
  onValue: vi.fn(), get: vi.fn(), ref: vi.fn((db, path) => path), set: vi.fn(),
  runTransaction: vi.fn(), remove: vi.fn().mockResolvedValue(),
  onDisconnect: vi.fn(), serverTimestamp: () => 1, update: vi.fn(),
}));
import { onValue, set, runTransaction, onDisconnect } from 'firebase/database';
import { createTvSession, getServerNow } from '../src/pairing.js';
import { CLOCK_SKEW_SAFETY_MS, PAIRING_TTL_MS, SESSION_TTL_MS } from '../src/core.js';

function fixture(search = '?debug=1') {
  const element = { hidden: true, textContent: '' };
  const environment = { navigator: { userAgent: 'Samsung test', platform: 'Tizen', onLine: false },
    get localStorage() { throw new Error('denied'); } };
  return { element, diagnostics: createTvDiagnostics(search, element, environment) };
}

describe('diagnóstico temporal del TV', () => {
  it('solo acepta el parámetro explícito debug=1 y no toca el DOM sin él', () => {
    for (const search of ['', '?debug=0', '?debug=10', '?x=debug=1', '?debug=true']) {
      expect(debugEnabled(search)).toBe(false);
      const { diagnostics, element } = fixture(search);
      expect(diagnostics).toBeUndefined();
      expect(element).toEqual({ hidden: true, textContent: '' });
    }
    expect(debugEnabled('?x=2&debug=1')).toBe(true);
  });

  it('tolera APIs ausentes y redacta secretos incluso dentro de errores', () => {
    const { diagnostics, element } = fixture();
    diagnostics.protect('short-uid', 'secret-key');
    diagnostics.error({ code: 'PERMISSION_DENIED', name: 'Error',
      message: 'Denied short-uid secret-key sessions/abc pairings/123456 https://host/?token=secret' });
    expect(element.textContent).toContain('PERMISSION_DENIED');
    expect(element.textContent).toContain('localStorage: no disponible (excepción)');
    for (const secret of ['short-uid', 'secret-key', '123456', 'token=secret', 'sessions/abc']) {
      expect(element.textContent).not.toContain(secret);
    }
  });

  it('conserva el fallo del reloj y el fallback, aunque luego falle set', async () => {
    const { diagnostics, element } = fixture();
    onValue.mockImplementation((reference, callback, cancel) => { cancel(new Error('clock unavailable')); return vi.fn(); });
    set.mockRejectedValue(Object.assign(new Error('Permission denied'), { code: 'PERMISSION_DENIED' }));
    await expect(getServerNow({}, diagnostics)).resolves.toMatchObject({ source: 'local-fallback', now: expect.any(Number) });
    try { await createTvSession({}, 'private-uid', diagnostics); } catch (error) { diagnostics.error(error); }
    expect(element.textContent).toContain('failureStage: create-session');
    expect(element.textContent).toContain('error.code: PERMISSION_DENIED');
    expect(element.textContent).toContain('serverTimeError:');
    expect(element.textContent).toContain('serverNow: desconocido');
    expect(element.textContent).toContain('serverTimeSource: local-fallback');
    expect(element.textContent).not.toContain('private-uid');
  });

  it.each(['create-pairing', 'onDisconnect'])('identifica fallos de %s y conserva su causa', async stage => {
    const { diagnostics, element } = fixture();
    onValue.mockImplementation((reference, callback) => { callback({ val: () => 250 }); return vi.fn(); });
    set.mockResolvedValue();
    const error = Object.assign(new Error('Network failed'), { code: 'NETWORK_ERROR' });
    runTransaction.mockResolvedValue({ committed: true });
    if (stage === 'create-pairing') runTransaction.mockRejectedValue(error);
    onDisconnect.mockReturnValue({ remove: vi.fn().mockRejectedValue(error), cancel: vi.fn().mockResolvedValue() });
    try { await createTvSession({}, 'private-uid', diagnostics); } catch (caught) { diagnostics.error(caught); }
    expect(element.textContent).toContain(`failureStage: ${stage}`);
    expect(element.textContent).toContain('error.code: NETWORK_ERROR');
    expect(element.textContent).toContain('serverTimeSource: server-offset');
    expect(element.textContent).toContain('offset: 250');
    expect(element.textContent).toContain('localMinusServer: -250');
  });
});


it.each(['server-offset', 'local-fallback'])('createTvSession aplica expiraciones según %s', async source => {
  const localNow = 1_800_000_000_000;
  const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(localNow);
  try {
    onValue.mockImplementation((reference, callback, cancel) => {
      if (source === 'server-offset') callback({ val: () => -5_000 });
      else cancel(new Error('clock unavailable'));
      return vi.fn();
    });
    set.mockResolvedValue();
    let pairingPayload;
    runTransaction.mockImplementation(async (reference, transform) => {
      pairingPayload = transform(null);
      return { committed: true };
    });
    onDisconnect.mockReturnValue({ remove: vi.fn().mockResolvedValue(), cancel: vi.fn().mockResolvedValue() });
    await createTvSession({}, 'private-uid');
    const base = source === 'server-offset' ? localNow - 5_000 : localNow - CLOCK_SKEW_SAFETY_MS;
    expect(set.mock.lastCall[1].expiresAt).toBe(base + SESSION_TTL_MS);
    expect(pairingPayload.expiresAt).toBe(base + PAIRING_TTL_MS);
  } finally {
    dateSpy.mockRestore();
  }
});
