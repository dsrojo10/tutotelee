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
  canClaimPairing,
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

export function releaseOwnedPhoneUid(currentPhoneUid, phoneUid) {
  return currentPhoneUid === phoneUid ? null : undefined;
}

function userFacingFirebaseError(publicMessage, error) {
  if (import.meta.env?.DEV && error?.code) return new Error(`${publicMessage} (${error.code})`);
  return new Error(publicMessage);
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

  try {
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
  } catch (error) {
    throw userFacingFirebaseError('No fue posible crear la sesión del TV. Intenta recargar la página.', error);
  }

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const code = generatePairingCode();
    const pairingRef = ref(database, `pairings/${code}`);
    const pairingNow = await getServerNow(database);
    const expiresAt = pairingNow + PAIRING_TTL_MS;
    let result;
    try {
      result = await runTransaction(pairingRef, (current) => {
        if (!canClaimPairing(current, pairingNow)) return;
        return { sessionId, tvUid, expiresAt, createdAt: Date.now() };
      }, { applyLocally: false });
    } catch (error) {
      await remove(sessionRef).catch(() => {});
      throw userFacingFirebaseError('No fue posible reservar un código para el TV. Intenta recargar la página.', error);
    }

    if (result.committed) {
      const disconnectPairing = onDisconnect(pairingRef);
      const disconnectSession = onDisconnect(sessionRef);
      try {
        await disconnectPairing.remove();
        await disconnectSession.remove();
      } catch (error) {
        await disconnectPairing.cancel().catch(() => {});
        await disconnectSession.cancel().catch(() => {});
        await remove(pairingRef).catch(() => {});
        await remove(sessionRef).catch(() => {});
        throw userFacingFirebaseError('No fue posible preparar la sesión del TV. Intenta recargar la página.', error);
      }
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
  let pairingSnapshot;
  try {
    pairingSnapshot = await get(pairingRef);
  } catch (error) {
    if (error?.code === 'PERMISSION_DENIED' || error?.code === 'permission-denied') {
      throw userFacingFirebaseError('No se pudo consultar ese código. Verifica los 6 dígitos.', error);
    }
    throw userFacingFirebaseError('No se pudo consultar el TV. Revisa la conexión e intenta de nuevo.', error);
  }
  const pairing = pairingSnapshot.val();
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
      throw userFacingFirebaseError('No se pudo acceder a la sesión. Puede que otro celular ya se haya conectado.', error);
    }
    throw userFacingFirebaseError('No se pudo leer la sesión del TV. Intenta de nuevo.', error);
  }

  const initialProblem = classifySessionState(sessionSnapshot.val(), pairing.tvUid, now);
  if (initialProblem) throw sessionClaimError(initialProblem);

  let claim;
  try {
    claim = await runTransaction(phoneUidRef, (currentPhoneUid) => {
      return claimPhoneUid(currentPhoneUid, phoneUid);
    }, { applyLocally: false });
  } catch (error) {
    if (error?.code === 'PERMISSION_DENIED' || error?.code === 'permission-denied') {
      throw userFacingFirebaseError('No se pudo conectar con el TV. La sesión puede haber expirado.', error);
    }
    throw userFacingFirebaseError('No se pudo completar la conexión. Intenta de nuevo.', error);
  }

  if (!claim.committed) {
    throw sessionClaimError(claim.snapshot.exists() ? 'occupied' : 'missing');
  }

  const disconnectOperation = onDisconnect(sessionRef);
  try {
    // Register cleanup immediately after winning phoneUid, before any other remote write.
    await disconnectOperation.update({
      connected: false,
      currentText: '',
      isFinal: true,
      updatedAt: serverTimestamp(),
    });
    await update(sessionRef, {
      connected: true,
      updatedAt: serverTimestamp(),
      expiresAt: (await getServerNow(database)) + SESSION_TTL_MS,
    });
  } catch (error) {
    await disconnectOperation.cancel().catch(() => {});
    await runTransaction(
      phoneUidRef,
      (currentPhoneUid) => releaseOwnedPhoneUid(currentPhoneUid, phoneUid),
      { applyLocally: false },
    ).catch(() => {});

    if (error?.code === 'PERMISSION_DENIED' || error?.code === 'permission-denied') {
      throw userFacingFirebaseError('No se pudo activar la conexión con el TV.', error);
    }
    throw userFacingFirebaseError('La conexión no pudo completarse. Intenta de nuevo.', error);
  }

  await remove(pairingRef).catch(() => {});

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
