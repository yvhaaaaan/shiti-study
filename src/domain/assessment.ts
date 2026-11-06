/** Conservative objective grading. Unsupported answers must be reviewed, never guessed. */
export interface AssessmentResult {
  verdict: 'correct' | 'wrong' | 'unresolved'
  method: 'objective' | 'ai'
  feedback: string
}

function plain(value: string) {
  return value.normalize('NFKC').trim().replace(/\$/g, '').replace(/[。.]$/, '').trim()
}
function choice(value: string): string | undefined {
  const text = plain(value).replace(/^(?:答案|选项|选|选择)\s*[:：]?\s*/, '').toUpperCase()
  return /^[A-H]$/.test(text) ? text : undefined
}
function number(value: string): [bigint, bigint] | undefined {
  const text = plain(value).replace(/−/g, '-')
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:\s*\/\s*[+-]?\d+|%)?$/.test(text)) return undefined
  const parts = text.split('/')
  // Exact rational arithmetic avoids accepting nearby but unequal answers,
  // including very small decimals and integers outside Number's safe range.
  const numeratorText = parts[0]!.trim().replace(/%$/, '')
  const decimalPlaces = numeratorText.split('.')[1]?.length ?? 0
  const numerator = BigInt(numeratorText.replace('.', ''))
  const denominator = BigInt('1' + '0'.repeat(decimalPlaces)) * (parts.length === 2 ? BigInt(parts[1]!.trim()) : text.endsWith('%') ? BigInt(100) : BigInt(1))
  return denominator === BigInt(0) ? undefined : [numerator, denominator]
}

export function assessObjective(answer: string, reference: string): AssessmentResult {
  if (!answer.trim()) return { verdict: 'unresolved', method: 'objective', feedback: '请先填写你的答案。' }
  const selected = choice(answer)
  const expectedChoice = choice(reference)
  const actualNumber = number(answer)
  const expectedNumber = number(reference)
  let correct: boolean | undefined
  if (selected && expectedChoice) correct = selected === expectedChoice
  else if (actualNumber !== undefined && expectedNumber !== undefined) correct = actualNumber[0] * expectedNumber[1] === expectedNumber[0] * actualNumber[1]
  if (correct === undefined) return { verdict: 'unresolved', method: 'objective', feedback: '这份答案需要进一步核验，暂不推进锻造。' }
  return { verdict: correct ? 'correct' : 'wrong', method: 'objective', feedback: correct ? '答案核对正确，可以记录心得并完成本次锻造。' : '答案与参考结果不一致。先看解析、订正，再重新测试。' }
}

/** A correct final number cannot replace reasoning explicitly requested by the question. */
export function requiresSemanticGrading(stem: string, images: readonly string[] = []): boolean {
  return images.length > 0 || /证明|求证|推导|论述|简答|解释|说明.{0,8}(理由|原因|依据)|写出.{0,12}(步骤|过程)|解题过程|计算过程|show.{0,15}work|justify|explain|prove/i.test(stem)
}
