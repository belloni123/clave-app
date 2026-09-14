// Limite por usuário no processo do servidor Coolify. Não é quota de faturamento.
const buckets = new Map<string, { minute: number; count: number; day: number; daily: number; busy: boolean }>()
export function acquireHelpSlot(userId: string, now = Date.now()) {
  for (const [key, bucket] of buckets) if (!bucket.busy && now - bucket.day > 86_400_000) buckets.delete(key)
  const bucket = buckets.get(userId) ?? { minute: now, count: 0, day: now, daily: 0, busy: false }
  if (now - bucket.minute >= 60_000) { bucket.minute = now; bucket.count = 0 }
  if (now - bucket.day >= 86_400_000) { bucket.day = now; bucket.daily = 0 }
  if (bucket.busy || bucket.count >= 12 || bucket.daily >= 100) return null
  bucket.count++; bucket.daily++; bucket.busy = true
  buckets.set(userId, bucket)
  return () => { bucket.busy = false }
}
