function djb2Hash(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i)
  }
  return hash >>> 0
}

/**
 * Extract 1-2 uppercase initials from a name.
 * - Empty / whitespace-only → "?"
 * - Strips non-ASCII before extracting
 * - Single word → first letter; multi-word → first letter of first two words
 */
export function getInitials(name: string): string {
  const ascii = name.replace(/[^\x20-\x7E]/g, "").trim()
  if (!ascii) return "?"
  const words = ascii.split(/\s+/).filter(Boolean)
  if (words.length === 0) return "?"
  if (words.length === 1) return words[0][0].toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

/**
 * Deterministic HSL color from a name string.
 * Same name always produces the same color.
 * Returns an `hsl(H, 65%, 45%)` string.
 */
export function getAvatarColor(name: string): string {
  const hue = djb2Hash(name) % 360
  return `hsl(${hue}, 65%, 45%)`
}
