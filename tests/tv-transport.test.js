import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('firebase/database', () => ({ forceWebSockets: vi.fn() }));
import { forceWebSockets } from 'firebase/database';
import { configureTvTransport } from '../src/tv-transport.js';

const samsung = 'Mozilla/5.0 (SMART-TV; Linux; Tizen 5.5) SamsungBrowser/3.0 Chrome/94.0.4606.31 TV Safari/537.36';
beforeEach(() => vi.clearAllMocks());

it('selecciona WebSocket antes de iniciar Firebase en el Samsung reportado', () => {
  const diagnostics = { update: vi.fn() };
  configureTvTransport({ navigator: { userAgent: samsung }, WebSocket: function WebSocket() {} }, diagnostics);
  expect(forceWebSockets).toHaveBeenCalledOnce();
  expect(diagnostics.update).toHaveBeenCalledExactlyOnceWith({ transport: 'websocket' });
});

it.each([
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit Safari',
  'Mozilla/5.0 (Linux; Android 15) AppleWebKit Chrome/130 Mobile Safari',
  'Mozilla/5.0 (Linux; Android 15) SamsungBrowser/27.0 Mobile Safari',
  'Mozilla/5.0 (Windows NT 10.0) Chrome/130 Safari',
  'Mozilla/5.0 (SMART-TV; Linux; WebOS) AppleWebKit',
])('conserva selección automática en %s', userAgent => {
  const diagnostics = { update: vi.fn() };
  configureTvTransport({ navigator: { userAgent }, WebSocket: function WebSocket() {} }, diagnostics);
  expect(forceWebSockets).not.toHaveBeenCalled();
  expect(diagnostics.update).toHaveBeenCalledWith({ transport: 'auto' });
});

it('no fuerza WebSocket cuando el TV no ofrece la API y tolera diagnóstico desactivado', () => {
  configureTvTransport({ navigator: { userAgent: samsung } });
  expect(forceWebSockets).not.toHaveBeenCalled();
});
