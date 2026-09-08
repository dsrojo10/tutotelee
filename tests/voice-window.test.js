import { describe, expect, it } from 'vitest';
import { appendFinalVoiceSegment, buildVoiceWindow, fitVoiceWindow, trimVoiceSegmentFromStart, VOICE_WINDOW_MAX_CHARS } from '../src/voice-window.js';
import { normalizeText } from '../src/core.js';

describe('ventana rodante de voz', () => {
  it('admite una ventana vacía', () => expect(buildVoiceWindow([], '')).toBe(''));
  it('muestra un transcript corto', () => expect(buildVoiceWindow([], '  Hola   familia ')).toBe('Hola familia'));
  it('conserva varias frases y un interim vacío', () => expect(buildVoiceWindow(['Uno.', 'Dos.', 'Tres.'])).toBe('Uno.\nDos.\nTres.'));
  it('elimina primero la frase más antigua al superar el límite', () => {
    expect(buildVoiceWindow(['Primera frase.', 'Segunda frase.', 'Tercera frase.'], '', 29)).toBe('Segunda frase.\nTercera frase.');
  });
  it('da prioridad al interim sacrificando contexto viejo', () => {
    expect(fitVoiceWindow(['Primera.', 'Segunda.'], 'Ahora hablo.', 21))
      .toEqual({ finalSegments: ['Segunda.'], interim: 'Ahora hablo.', text: 'Segunda.\nAhora hablo.' });
  });
  it('conserva la parte reciente de un segmento gigante', () => {
    const text = 'antiguo '.repeat(100) + 'Esta es la información nueva.';
    const result = buildVoiceWindow([text]);
    expect(result.endsWith('Esta es la información nueva.')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(VOICE_WINDOW_MAX_CHARS);
  });
  it('recorta una palabra parcial si hay un límite de palabra disponible', () => {
    expect(trimVoiceSegmentFromStart('primera segunda tercera', 12)).toBe('tercera');
    expect(trimVoiceSegmentFromStart('primera segunda tercera', 15)).toBe('segunda tercera');
  });
  it('tolera palabras mayores que toda la ventana y no pierde su final', () => {
    expect(trimVoiceSegmentFromStart('a'.repeat(500) + 'z', 420)).toBe('a'.repeat(419) + 'z');
  });
  it('interim gigante desplaza todos los finales', () => {
    const window = fitVoiceWindow(['Contexto viejo'], 'nuevo '.repeat(100) + 'último');
    expect(window.finalSegments).toEqual([]);
    expect(window.text.endsWith('último')).toBe(true);
    expect(window.text.length).toBeLessThanOrEqual(420);
  });
  it('mantiene memoria acotada con muchos segmentos cortos', () => {
    let segments = [];
    for (let i = 0; i < 1000; i += 1) segments = appendFinalVoiceSegment(segments, `Idea ${i}`);
    expect(segments).toEqual(['Idea 996', 'Idea 997', 'Idea 998', 'Idea 999']);
  });
  it('nunca supera 420 ni pierde el segmento nuevo en una secuencia larga', () => {
    let segments = [];
    for (let i = 1; i < 800; i += 1) {
      segments = appendFinalVoiceSegment(segments, 'palabra '.repeat(i % 80) + `final${i}`);
      expect(buildVoiceWindow(segments).endsWith(`final${i}`)).toBe(true);
      expect(buildVoiceWindow(segments).length).toBeLessThanOrEqual(420);
      expect(buildVoiceWindow(segments, 'interim '.repeat(i % 90)).length).toBeLessThanOrEqual(420);
    }
  });
  it('no muta el array original', () => {
    const segments = Object.freeze(['uno', 'dos']);
    appendFinalVoiceSegment(segments, 'tres');
    expect(segments).toEqual(['uno', 'dos']);
  });
  it('texto manual mantiene saltos y primeros 500 caracteres', () => {
    const manual = '  Uno   dos\n\nTres\r\nCuatro ';
    expect(normalizeText(manual)).toBe('Uno dos\n\nTres\nCuatro');
    expect(normalizeText('a'.repeat(500) + 'nuevo')).toBe('a'.repeat(500));
  });
});
