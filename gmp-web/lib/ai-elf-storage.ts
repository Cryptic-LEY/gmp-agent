const AI_ELF_STORAGE_PREFIX = 'gmp.aiElf.'

export function clearLocalStoragePreservingAiElf() {
  if (typeof window === 'undefined') return

  const preserved: Array<[string, string]> = []
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (!key || !key.startsWith(AI_ELF_STORAGE_PREFIX)) continue
    const value = localStorage.getItem(key)
    if (value !== null) preserved.push([key, value])
  }

  localStorage.clear()
  preserved.forEach(([key, value]) => localStorage.setItem(key, value))
}
