export function formatLocalDate(value: string, includeTime = false): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  const pad = (v: number) => String(v).padStart(2, '0')
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return includeTime ? `${day.slice(5)} ${pad(d.getHours())}:${pad(d.getMinutes())}` : day
}
