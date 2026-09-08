// Temporary TV-only diagnostics. Never log or persist raw errors or identifiers.
export function debugEnabled(search) {
  return /(?:^|[?&])debug=1(?:&|$)/.test(search);
}

export function safeErrorText(value, secrets = []) {
  let text = typeof value === 'string' ? value : '';
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret) text = text.split(secret).join('[redactado]');
  }
  return text
    .replace(/\{[^}]*\}/g, '[objeto redactado]')
    .replace(/["'][^"']*["']/g, '[valor redactado]')
    .replace(/https?:\/\/[^\s)]+/gi, '[URL redactada]')
    .replace(/(?:sessions|pairings)\/[^\s)'",]+/gi, '[ruta redactada]')
    .replace(/(?:api[_-]?key|(?:access|refresh|id)[_-]?token|token|credential|password|uid|sessionId)\s*[=:]\s*[^\s,;)]+/gi, '[credencial redactada]')
    .replace(/[A-Za-z0-9_\-.]{24,}/g, '[identificador redactado]')
    .replace(/\b\d{6}\b/g, '[código redactado]')
    .slice(0, 700);
}

export function createTvDiagnostics(search, element, environment = window) {
  if (!debugEnabled(search)) return undefined;
  const state = {
    stage: 'firebase-init', auth: 'pendiente', connected: 'pendiente',
    serverTimeSource: 'pendiente', serverTimeOffset: 'pendiente', localNow: Date.now(), serverNow: 'desconocido',
    offset: 'desconocido', localMinusServer: 'desconocido',
  };
  const secrets = [];
  let visible = false;
  function probe(callback) {
    try { return callback(); } catch { return 'no disponible (excepción)'; }
  }
  function render() {
    if (!visible) return;
    const nav = environment.navigator;
    const lines = {
      userAgent: probe(() => nav.userAgent),
      platform: probe(() => nav.platform || 'no existe'),
      'Date.now()': Date.now(),
      ISO: probe(() => new Date().toISOString()),
      crypto: probe(() => Boolean(environment.crypto)),
      getRandomValues: probe(() => typeof environment.crypto.getRandomValues === 'function'),
      WebSocket: probe(() => typeof environment.WebSocket !== 'undefined'),
      indexedDB: probe(() => Boolean(environment.indexedDB)),
      localStorage: probe(() => { const storage = environment.localStorage; storage.getItem('__tutotelee_diagnostic_probe__'); return Boolean(storage); }),
      onLine: probe(() => typeof nav.onLine === 'undefined' ? 'no existe' : nav.onLine),
      ...state,
    };
    element.hidden = false;
    element.textContent = 'Diagnóstico temporal (debug=1)\n' + Object.entries(lines)
      .map(([key, value]) => `${key}: ${value}`).join('\n');
  }
  return {
    protect(...values) { secrets.push(...values.filter(value => typeof value === 'string')); },
    stage(stage) { state.stage = stage; },
    update(values) { Object.assign(state, values); render(); },
    error(error, stage = state.stage) {
      const cause = error?.cause || error;
      state.failureStage = stage;
      if (stage === 'anonymous-auth') state.auth = 'falló';
      state['error.code'] = safeErrorText(cause?.code, secrets) || '(sin code)';
      state['error.name'] = safeErrorText(cause?.name, secrets) || '(sin name)';
      state['error.message'] = safeErrorText(cause?.message, secrets) || '(sin message)';
      // Retain clock read failures even if a later write also fails.
      if (stage === 'server-time') state.serverTimeError = `${state['error.code']} / ${state['error.name']}: ${state['error.message']}`;
      visible = true;
      render();
    },
  };
}
