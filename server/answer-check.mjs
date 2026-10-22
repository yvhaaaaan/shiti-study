/** Reject only explicit contradictions in single-choice answers. This does not
 * certify mathematical correctness or infer a student's personal mistake. */
export function hasChoiceContradiction(answer, analysis) {
  if (/[A-H]\s*[,，、/]\s*[A-H]/u.test(answer)) return false
  const selected = /^\s*(?:(?:选(?:择)?|选项|答案(?:为|是|[:：])?)\s*)?([A-H])(?=$|[\s.、，,：:（(])/u.exec(answer)?.[1]
  if (!selected) return false
  const conclusions = [...analysis.matchAll(/【(?:最终答案|最终结论|答案)】\s*(?:(?:应?选(?:择)?|选项|答案(?:为|是|[:：])?)\s*)?([A-H])(?=$|[\s.。、，,：:（(])/gu)]
  return conclusions.length > 0 && conclusions.at(-1)[1] !== selected
}
