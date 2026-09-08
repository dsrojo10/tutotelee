import { describe, expect, it } from 'vitest';
import { claimPhoneUid, classifySessionState } from '../src/pairing.js';

const now = 1_000;
const availableSession = {
  tvUid: 'tv-1',
  connected: false,
  expiresAt: now + 1_000,
};

describe('estado de reclamación de una sesión', () => {
  it('acepta una sesión vigente y libre del TV esperado', () => {
    expect(classifySessionState(availableSession, 'tv-1', now)).toBeNull();
  });

  it('diferencia una sesión inexistente', () => {
    expect(classifySessionState(null, 'tv-1', now)).toBe('missing');
  });

  it('diferencia una sesión expirada', () => {
    expect(classifySessionState({ ...availableSession, expiresAt: now }, 'tv-1', now)).toBe('expired');
  });

  it('diferencia una sesión ocupada', () => {
    expect(classifySessionState({ ...availableSession, phoneUid: 'phone-1', connected: true }, 'tv-1', now))
      .toBe('occupied');
  });

  it('rechaza una sesión que no pertenece al TV del pairing', () => {
    expect(classifySessionState(availableSession, 'tv-2', now)).toBe('mismatch');
  });

  it('permite ganar el claim real cuando la sesión existe y phoneUid está ausente', () => {
    const phoneUid = 'phone-different-from-tv';

    expect(classifySessionState(availableSession, 'tv-1', now)).toBeNull();
    expect(claimPhoneUid(null, phoneUid)).toBe(phoneUid);
  });

  it('impide reemplazar atómicamente un phoneUid existente', () => {
    expect(claimPhoneUid('first-phone', 'second-phone')).toBeUndefined();
  });
});
