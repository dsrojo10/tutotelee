import { describe, expect, it } from 'vitest';
import {
  canClaimPairing,
  formatPairingCode,
  generatePairingCode,
  generateSessionId,
  isExpired,
  isValidPairingCode,
  MAX_TEXT_LENGTH,
  normalizeText,
} from '../src/core.js';

function fakeCrypto(...values) {
  let index = 0;
  return {
    getRandomValues(buffer) {
      const value = values[index] ?? values.at(-1) ?? 0;
      index += 1;
      if (buffer instanceof Uint32Array) buffer[0] = value;
      else buffer.forEach((_, byteIndex) => { buffer[byteIndex] = (value + byteIndex) % 256; });
      return buffer;
    },
  };
}

describe('códigos de emparejamiento', () => {
  it.each(['000000', '123456', '999999'])('acepta seis dígitos: %s', (code) => {
    expect(isValidPairingCode(code)).toBe(true);
  });

  it.each(['12345', '1234567', '12 345', 'abcdef', 123456, ''])('rechaza un código inválido: %s', (code) => {
    expect(isValidPairingCode(code)).toBe(false);
  });

  it('genera exactamente seis dígitos y conserva ceros iniciales', () => {
    expect(generatePairingCode(fakeCrypto(42))).toBe('000042');
  });

  it('descarta valores para evitar sesgo de módulo', () => {
    expect(generatePairingCode(fakeCrypto(4_294_000_000, 123456))).toBe('123456');
  });

  it('formatea el código para leerlo a distancia', () => {
    expect(formatPairingCode('123456')).toBe('123 456');
  });
});

describe('identificadores de sesión', () => {
  it('genera 128 bits como 32 caracteres hexadecimales', () => {
    const sessionId = generateSessionId(fakeCrypto(0));
    expect(sessionId).toMatch(/^[a-f0-9]{32}$/);
    expect(sessionId).toBe('000102030405060708090a0b0c0d0e0f');
  });

  it('falla si no existe un generador seguro', () => {
    expect(() => generateSessionId({})).toThrow(/aleatorio seguro/);
  });
});

describe('expiración', () => {
  it('considera vigente una fecha futura', () => expect(isExpired(1_001, 1_000)).toBe(false));
  it('considera expirada una fecha igual o pasada', () => {
    expect(isExpired(1_000, 1_000)).toBe(true);
    expect(isExpired(999, 1_000)).toBe(true);
  });
  it('considera inválida una expiración no numérica', () => expect(isExpired(undefined, 1_000)).toBe(true));
});

describe('reclamación de pairings', () => {
  it('permite reclamar una ruta vacía', () => {
    expect(canClaimPairing(null, 1_000)).toBe(true);
  });

  it('permite reemplazar un pairing estrictamente expirado', () => {
    expect(canClaimPairing({ expiresAt: 999 }, 1_000)).toBe(true);
  });

  it('no sobrescribe un pairing vigente ni uno que vence justo ahora', () => {
    expect(canClaimPairing({ expiresAt: 1_000 }, 1_000)).toBe(false);
    expect(canClaimPairing({ expiresAt: 1_001 }, 1_000)).toBe(false);
  });

  it('no reemplaza datos malformados como si estuvieran expirados', () => {
    expect(canClaimPairing({}, 1_000)).toBe(false);
  });
});

describe('normalización del texto', () => {
  it('conserva los saltos de línea y compacta espacios dentro de cada línea', () => {
    expect(normalizeText('  Hola   a todos\n\n  querida   familia  ')).toBe('Hola a todos\n\nquerida familia');
  });

  it('normaliza saltos de línea de Windows y retornos antiguos', () => {
    expect(normalizeText('Uno\r\nDos\rTres')).toBe('Uno\nDos\nTres');
  });

  it('limita a una sola línea vacía consecutiva para proteger el layout', () => {
    expect(normalizeText('Uno\n\n\n\n\nDos')).toBe('Uno\n\nDos');
  });

  it('conserva el formato del ejemplo de texto manual', () => {
    expect(normalizeText('Helloooooo\n\nComo estas?\n\nPapiiiiii'))
      .toBe('Helloooooo\n\nComo estas?\n\nPapiiiiii');
  });

  it('limita el texto al máximo permitido', () => {
    expect(normalizeText('a'.repeat(MAX_TEXT_LENGTH + 20))).toHaveLength(MAX_TEXT_LENGTH);
  });

  it('tolera valores que no son texto', () => expect(normalizeText(null)).toBe(''));
});
