import { onValue, ref } from 'firebase/database';

export const SERVER_TIME_TIMEOUT_MS = 5_000;

function readServerOffset(database) {
  return new Promise((resolve, reject) => {
    let unsubscribe;
    let settled = false;
    function finish(error, offset) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe?.();
      if (error) reject(error);
      else resolve(offset);
    }
    const timer = setTimeout(() => {
      const error = new Error('Tiempo de espera agotado al leer el reloj del servidor.');
      error.code = 'SERVER_TIME_TIMEOUT';
      finish(error);
    }, SERVER_TIME_TIMEOUT_MS);
    try {
      unsubscribe = onValue(ref(database, '.info/serverTimeOffset'), snapshot => {
        try {
          const offset = snapshot.val();
          // null, strings and non-finite values are not clock samples.
          if (typeof offset === 'number' && Number.isFinite(offset)) finish(null, offset);
        } catch (error) {
          finish(error);
        }
      }, error => finish(error));
      // Firebase can deliver a cached value synchronously, before returning unsubscribe.
      if (settled) unsubscribe();
    } catch (error) {
      finish(error);
    }
  });
}

export async function getServerNow(database, diagnostics) {
  diagnostics?.stage('server-time');
  try {
    const offset = await readServerOffset(database);
    const localNow = Date.now();
    const now = localNow + offset;
    diagnostics?.update({ serverTimeSource: 'server-offset', serverTimeOffset: offset,
      localNow, serverNow: now, offset, localMinusServer: -offset });
    return { now, source: 'server-offset' };
  } catch (error) {
    const now = Date.now();
    diagnostics?.update({ serverTimeSource: 'local-fallback', serverTimeOffset: 'falló; fallback local',
      localNow: now, serverNow: 'desconocido', offset: 'desconocido', localMinusServer: 'desconocido' });
    diagnostics?.error(error, 'server-time');
    return { now, source: 'local-fallback' };
  }
}
