import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { get, ref, runTransaction, set, update } from 'firebase/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { calculateExpiresAt, PAIRING_TTL_MS, SESSION_TTL_MS } from '../../src/core.js';

const PROJECT_ID = 'demo-tutotelee';
const TV_UID = 'tv-owner';
const OTHER_TV_UID = 'other-tv';
const PHONE_UID = 'phone-owner';
const OTHER_PHONE_UID = 'other-phone';
const SESSION_ID = '0123456789abcdef0123456789abcdef';
const OTHER_SESSION_ID = 'fedcba9876543210fedcba9876543210';
const CODE = '123456';

let testEnvironment;

function sessionData(tvUid = TV_UID, overrides = {}) {
  const now = Date.now();
  return {
    tvUid,
    connected: false,
    currentText: '',
    isFinal: true,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + 60 * 60 * 1000,
    ...overrides,
  };
}

function pairingData(sessionId = SESSION_ID, tvUid = TV_UID, overrides = {}) {
  const now = Date.now();
  return {
    sessionId,
    tvUid,
    createdAt: now,
    expiresAt: now + 5 * 60 * 1000,
    ...overrides,
  };
}

function databaseFor(uid) {
  return testEnvironment.authenticatedContext(uid).database();
}

async function seed(path, value) {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await set(ref(context.database(), path), value);
  });
}

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    database: {
      host: '127.0.0.1',
      port: 9000,
      rules: readFileSync('database.rules.json', 'utf8'),
    },
  });
});

beforeEach(async () => {
  await testEnvironment.clearDatabase();
});

afterAll(async () => {
  await testEnvironment.cleanup();
});

describe('reglas de pairings', () => {
  it('rechaza la lectura sin autenticación', async () => {
    await seed(`pairings/${CODE}`, pairingData());
    await assertFails(get(ref(testEnvironment.unauthenticatedContext().database(), `pairings/${CODE}`)));
  });

  it('permite a un usuario autenticado leer un código exacto válido', async () => {
    await seed(`pairings/${CODE}`, pairingData());
    await assertSucceeds(get(ref(databaseFor(PHONE_UID), `pairings/${CODE}`)));
  });

  it('impide listar pairings', async () => {
    await seed(`pairings/${CODE}`, pairingData());
    await assertFails(get(ref(databaseFor(PHONE_UID), 'pairings')));
  });

  it('permite al TV crear un pairing válido para su sesión', async () => {
    const tvDatabase = databaseFor(TV_UID);
    await assertSucceeds(set(ref(tvDatabase, `sessions/${SESSION_ID}`), sessionData()));
    await assertSucceeds(set(ref(tvDatabase, `pairings/${CODE}`), pairingData()));
  });

  it('impide sobrescribir un pairing vigente de otro TV', async () => {
    await seed(`pairings/${CODE}`, pairingData(OTHER_SESSION_ID, OTHER_TV_UID));
    await seed(`sessions/${SESSION_ID}`, sessionData());
    await assertFails(set(ref(databaseFor(TV_UID), `pairings/${CODE}`), pairingData()));
  });

  it('permite reemplazar atómicamente un pairing expirado', async () => {
    await seed(`pairings/${CODE}`, pairingData(OTHER_SESSION_ID, OTHER_TV_UID, { expiresAt: Date.now() - 1_000 }));
    await seed(`sessions/${SESSION_ID}`, sessionData());
    await assertSucceeds(runTransaction(ref(databaseFor(TV_UID), `pairings/${CODE}`), () => pairingData()));
  });

  it('rechaza un código con formato inválido', async () => {
    await seed(`sessions/${SESSION_ID}`, sessionData());
    await assertFails(set(ref(databaseFor(TV_UID), 'pairings/12345'), pairingData()));
  });

  it('rechaza un TTL superior a diez minutos', async () => {
    await seed(`sessions/${SESSION_ID}`, sessionData());
    const tooLate = Date.now() + 11 * 60 * 1000;
    await assertFails(set(ref(databaseFor(TV_UID), `pairings/${CODE}`), pairingData(SESSION_ID, TV_UID, { expiresAt: tooLate })));
  });
});

describe('reglas de sessions', () => {
  it('impide listar sessions', async () => {
    await seed(`sessions/${SESSION_ID}`, sessionData());
    await assertFails(get(ref(databaseFor(PHONE_UID), 'sessions')));
  });

  it('permite al TV crear su propia sesión', async () => {
    await assertSucceeds(set(ref(databaseFor(TV_UID), `sessions/${SESSION_ID}`), sessionData()));
  });

  it('impide que otro usuario modifique tvUid', async () => {
    await seed(`sessions/${SESSION_ID}`, sessionData());
    await assertFails(update(ref(databaseFor(OTHER_TV_UID), `sessions/${SESSION_ID}`), { tvUid: OTHER_TV_UID }));
  });

  it('permite reclamar phoneUid una sola vez', async () => {
    await seed(`sessions/${SESSION_ID}`, sessionData());
    await assertSucceeds(set(ref(databaseFor(PHONE_UID), `sessions/${SESSION_ID}/phoneUid`), PHONE_UID));
    await assertFails(set(ref(databaseFor(OTHER_PHONE_UID), `sessions/${SESSION_ID}/phoneUid`), OTHER_PHONE_UID));
  });

  it('permite al celular dueño modificar currentText', async () => {
    await seed(`sessions/${SESSION_ID}`, sessionData(TV_UID, { phoneUid: PHONE_UID, connected: true }));
    await assertSucceeds(update(ref(databaseFor(PHONE_UID), `sessions/${SESSION_ID}`), {
      currentText: 'Hola',
      isFinal: true,
      updatedAt: Date.now(),
    }));
  });

  it('impide que otro celular modifique currentText', async () => {
    await seed(`sessions/${SESSION_ID}`, sessionData(TV_UID, { phoneUid: PHONE_UID, connected: true }));
    await assertFails(update(ref(databaseFor(OTHER_PHONE_UID), `sessions/${SESSION_ID}`), { currentText: 'Ataque' }));
  });

  it('rechaza currentText de más de 500 caracteres', async () => {
    await seed(`sessions/${SESSION_ID}`, sessionData(TV_UID, { phoneUid: PHONE_UID, connected: true }));
    await assertFails(update(ref(databaseFor(PHONE_UID), `sessions/${SESSION_ID}`), {
      currentText: 'a'.repeat(501),
    }));
  });

  it('rechaza campos adicionales', async () => {
    await seed(`sessions/${SESSION_ID}`, sessionData(TV_UID, { phoneUid: PHONE_UID, connected: true }));
    await assertFails(update(ref(databaseFor(PHONE_UID), `sessions/${SESSION_ID}`), { unexpected: true }));
  });

  it('impide reclamar una sesión expirada', async () => {
    await seed(`sessions/${SESSION_ID}`, sessionData(TV_UID, { expiresAt: Date.now() - 1_000 }));
    await assertFails(set(ref(databaseFor(PHONE_UID), `sessions/${SESSION_ID}/phoneUid`), PHONE_UID));
  });

  it('conocer un sessionId no permite leer o escribir una sesión ocupada ajena', async () => {
    await seed(`sessions/${SESSION_ID}`, sessionData(TV_UID, { phoneUid: PHONE_UID, connected: true }));
    const attackerDatabase = databaseFor(OTHER_PHONE_UID);
    await assertFails(get(ref(attackerDatabase, `sessions/${SESSION_ID}`)));
    await assertFails(update(ref(attackerDatabase, `sessions/${SESSION_ID}`), { currentText: 'Ataque' }));
  });
});


describe('borde de expiración con reloj local adelantado', () => {
  it.each([
    ['sesión', SESSION_TTL_MS],
    ['pairing', PAIRING_TTL_MS],
  ])('rechaza TTL exacto de %s y acepta fallback con margen', async (kind, ttl) => {
    const database = databaseFor(TV_UID);
    if (kind === 'pairing') await seed(`sessions/${SESSION_ID}`, sessionData());
    // 30s avoids a race with test execution while representing a modest client skew.
    const clock = { now: Date.now() + 30_000, source: 'local-fallback' };
    const path = kind === 'sesión' ? `sessions/${SESSION_ID}` : `pairings/${CODE}`;
    const payload = expiresAt => kind === 'sesión'
      ? sessionData(TV_UID, { expiresAt })
      : pairingData(SESSION_ID, TV_UID, { expiresAt });
    const rejected = await assertFails(set(ref(database, path), payload(clock.now + ttl)));
    expect(rejected.code).toBe('PERMISSION_DENIED');
    await assertSucceeds(set(ref(database, path), payload(calculateExpiresAt(clock, ttl))));
  });
});
