// Voice alone uses a short tail, leaving room below Firebase's 500-character limit.
export const VOICE_WINDOW_MAX_CHARS = 420;
export const VOICE_MAX_FINAL_SEGMENTS = 4;

export function trimVoiceSegmentFromStart(text, maxChars = VOICE_WINDOW_MAX_CHARS) {
  const normalized = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
  if (maxChars <= 0) return '';
  if (normalized.length <= maxChars) return normalized;
  const start = normalized.length - maxChars;
  let tail = normalized.slice(start);
  if (normalized[start - 1] !== ' ' && tail[0] !== ' ') {
    const boundary = tail.indexOf(' ');
    if (boundary >= 0) tail = tail.slice(boundary + 1);
    // An unbroken word must be truncated to honor the hard limit.
  }
  // Avoid leaving half a UTF-16 surrogate pair after an unavoidable cut.
  return tail.replace(/^[\uDC00-\uDFFF]/, '').trim();
}

export function fitVoiceWindow(finalSegments, interimText = '', maxChars = VOICE_WINDOW_MAX_CHARS) {
  const interim = trimVoiceSegmentFromStart(interimText, maxChars);
  const finals = finalSegments.map(text => trimVoiceSegmentFromStart(text, maxChars))
    .filter(Boolean).slice(-VOICE_MAX_FINAL_SEGMENTS);
  const combine = () => [...finals, interim].filter(Boolean).join('\n');
  while (finals.length && combine().length > maxChars) finals.shift();
  return { finalSegments: finals, interim, text: combine() };
}

export function appendFinalVoiceSegment(finalSegments, segment, maxChars = VOICE_WINDOW_MAX_CHARS) {
  return fitVoiceWindow([...finalSegments, segment], '', maxChars).finalSegments;
}

export function buildVoiceWindow(finalSegments, interimText = '', maxChars = VOICE_WINDOW_MAX_CHARS) {
  return fitVoiceWindow(finalSegments, interimText, maxChars).text;
}
