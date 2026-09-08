import {
  get,
  onDisconnect,
  ref,
  remove,
  runTransaction,
  serverTimestamp,
  set,
  update,
} from 'firebase/database';
import {
  generatePairingCode,
  generateSessionId,
  isExpired,
  isValidPairingCode,
  normalizeText,
  PAIRING_TTL_MS,
  SESSION_TTL_MS,
} from './core.js';

const MAX_CODE_ATTEMPTS = 12;

export function classifySessionState(session, expectedTvUid, now = Date.now()) {
  if (!session) return 'missing';
  if (isExpired(session.expiresAt, now)) return 'expired';
  if (session.tvUid !== expectedTvUid) return 'mismatch';
  if (session.phoneUid || session.connected === true) return 'occupied';
  return null;
}

export function claimPhoneUid(currentPhoneUid, phoneUid) {
  return currentPhoneUid === null ? phoneUid : undefined;
}

function diagnosticLog(label, value) {
  if (import.meta.env?.DEV) console.debug(`[TutoTeLee claim] ${label}`, value);
}

function sessionClaimError(problem) {
  switch (problem) {
    case 'missing':
      return new Error('La sesión del TV ya no existe. Recarga TutoTeLee en el TV para obtener un código nuevo.');
    case 'expired':
      return new Error('La sesión del TV expiró. Recarga TutoTeLee en el TV para obtener un código nuevo.');
    case 'occupied':
      return new Error('Ese TV ya está conectado a otro celular.');
    case 'mismatch':
      return new Error('El código ya no corresponde a la sesión activa del TV.');
    default:
      return new Error('No fue posible reclamar la sesión del TV. Intenta con el código nuevo.');
  }
}

export async function getServerNow(database) {
  try {
    const snapshot = await get(ref(database, '.info/serverTimeOffset'));
    return Date.now() + (snapshot.val() || 0);
  } catch {
    return Date.now();
  }
}

export async function createTvSession(database, tvUid) {
  const sessionId = generateSessionId();
  const sessionRef = ref(database, `sessions/${sessionId}`);
  const now = await getServerNow(database);

  await set(sessionRef, {
    tvUid,
    phoneUid: null,
    connected: false,
    currentText: '',
    isFinal: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    expiresAt: now + SESSION_TTL_MS,
  });

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const code = generatePairingCode();
    const pairingRef = ref(database, `pairings/${code}`);
    const expiresAt = (await getServerNow(database)) + PAIRING_TTL_MS;
    const result = await runTransaction(pairingRef, (current) => {
      if (current !== null) return;
      return { sessionId, tvUid, expiresAt, createdAt: Date.now() };
    }, { applyLocally: false });

    if (result.committed) {
      const disconnectPairing = onDisconnect(pairingRef);
      const disconnectSession = onDisconnect(sessionRef);
      await disconnectPairing.remove();
      await disconnectSession.remove();
      return {
        sessionId,
        code,
        expiresAt,
        sessionRef,
        pairingRef,
        disconnectPairing,
        disconnectSession,
      };
    }
  }

  await remove(sessionRef);
  throw new Error('No fue posible reservar un código. Intenta recargar la página.');
}

export async function claimSession(database, rawCode, phoneUid) {
  const code = String(rawCode).trim();
  if (!isValidPairingCode(code)) {
    throw new Error('Escribe exactamente los 6 dígitos del TV.');
  }

  const pairingRef = ref(database, `pairings/${code}`);
  const pairingSnapshot = await get(pairingRef);
  const pairing = pairingSnapshot.val();
  diagnosticLog('pairing leído', pairing);
  const now = await getServerNow(database);

  if (!pairing || !pairing.sessionId) throw new Error('El código no existe o ya fue utilizado.');
  if (isExpired(pairing.expiresAt, now)) {
    await remove(pairingRef).catch(() => {});
    throw new Error('El código expiró. Recarga TutoTeLee en el TV para obtener uno nuevo.');
  }

  const sessionRef = ref(database, `sessions/${pairing.sessionId}`);
  const phoneUidRef = ref(database, `sessions/${pairing.sessionId}/phoneUid`);
  let sessionSnapshot;
  try {
    sessionSnapshot = await get(sessionRef);
  } catch (error) {
    if (error?.code === 'PERMISSION_DENIED' || error?.code === 'permission-denied') {
      throw new Error(
        'Firebase rechazó la lectura de la sesión. Puede haber sido reclamada por otro celular o las reglas publicadas no permiten el acceso.',
      );
    }
    throw new Error(`No se pudo leer la sesión del TV (${error?.code || 'error de Firebase'}).`);
  }

  diagnosticLog('sessionSnapshot.exists()', sessionSnapshot.exists());
  diagnosticLog('sessionSnapshot.val()', sessionSnapshot.val());
  const initialProblem = classifySessionState(sessionSnapshot.val(), pairing.tvUid, now);
  diagnosticLog('classifySessionState()', initialProblem);
  if (initialProblem) throw sessionClaimError(initialProblem);

  let claim;
  try {
    claim = await runTransaction(phoneUidRef, (currentPhoneUid) => {
      diagnosticLog('callback runTransaction phoneUid', currentPhoneUid);
      return claimPhoneUid(currentPhoneUid, phoneUid);
    }, { applyLocally: false });
  } catch (error) {
    if (error?.code === 'PERMISSION_DENIED' || error?.code === 'permission-denied') {
      throw new Error(
        'Firebase rechazó la reclamación. Verifica que las reglas publicadas estén actualizadas y que la sesión siga vigente.',
      );
    }
    throw new Error(`Falló la transacción de conexión (${error?.code || 'error de Firebase'}).`);
  }

  diagnosticLog('claim.committed', claim.committed);
  diagnosticLog('claim.snapshot.exists()', claim.snapshot.exists());
  diagnosticLog('claim.snapshot.val()', claim.snapshot.val());

  if (!claim.committed) {
    throw sessionClaimError(claim.snapshot.exists() ? 'occupied' : 'missing');
  }

  try {
    await update(sessionRef, {
      connected: true,
      updatedAt: serverTimestamp(),
      expiresAt: (await getServerNow(database)) + SESSION_TTL_MS,
    });
  } catch (error) {
    await runTransaction(phoneUidRef, (currentPhoneUid) => (
      currentPhoneUid === phoneUid ? null : undefined
    ), { applyLocally: false }).catch(() => {});

    if (error?.code === 'PERMISSION_DENIED' || error?.code === 'permission-denied') {
      throw new Error('Firebase permitió reservar el celular, pero rechazó activar la sesión. Revisa las reglas publicadas.');
    }
    throw new Error(`No se pudo activar la sesión después de reclamarla (${error?.code || 'error de Firebase'}).`);
  }

  await remove(pairingRef).catch(() => {});
  const disconnectOperation = onDisconnect(sessionRef);
  await disconnectOperation.update({ connected: false, currentText: '', isFinal: true, updatedAt: serverTimestamp() });

  return { sessionId: pairing.sessionId, sessionRef, disconnectOperation };
}

export async function sendCurrentText(sessionRef, text, isFinal) {
  await update(sessionRef, {
    currentText: normalizeText(text),
    isFinal: Boolean(isFinal),
    updatedAt: serverTimestamp(),
  });
}

export async function disconnectPhone(sessionRef, disconnectOperation) {
  await disconnectOperation?.cancel().catch(() => {});
  await update(sessionRef, {
    connected: false,
    currentText: '',
    isFinal: true,
    updatedAt: serverTimestamp(),
  });
}
