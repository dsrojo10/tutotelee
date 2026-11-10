import { forceWebSockets } from 'firebase/database';

// A remembered WebSocket failure can make RTDB start with long polling. Its
// assigned backend can change and fall outside our strict script/frame CSP.
// Use the supported WebSocket transport on Samsung TVs before creating RTDB.
export function configureTvTransport(environment, diagnostics) {
  const agent = environment.navigator?.userAgent || '';
  const samsungTv = /SMART-TV/i.test(agent) && /Tizen/i.test(agent);
  if (samsungTv && typeof environment.WebSocket === 'function') {
    forceWebSockets();
    diagnostics?.update({ transport: 'websocket' });
  } else {
    diagnostics?.update({ transport: 'auto' });
  }
}
