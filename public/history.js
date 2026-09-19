// Pure history-attribution helper — no DOM, no sessionStorage.
// Imported by both app.js (browser) and test/client.test.js (Node).

/**
 * Given a raw history array and an optional confirmed name, return an array
 * of { from, text, isMe } objects ready to pass to addMessage().
 *
 * @param {Array<{from: *, text: *, ts: number, isMe?: boolean}>} history
 * @param {string|null} confirmedName
 *   - string: name was just confirmed via claim — derive isMe by name comparison
 *   - null:   use the stored isMe flag (myName is already correct at replay time)
 * @returns {Array<{from: string, text: string, isMe: boolean}>}
 */
export function buildHistoryAttribution(history, confirmedName) {
  return history
    .filter(e => typeof e.from === 'string' && typeof e.text === 'string')
    .map(e => ({
      from: e.from,
      text: e.text,
      isMe: confirmedName !== null ? e.from === confirmedName : !!e.isMe,
    }));
}
