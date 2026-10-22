import { handleQuestionGenerate } from '../../server/mimo-question.mjs'

/**
 * Netlify Functions v2 entry. The shared handler keeps the same origin,
 * validation, SSE and fallback behavior as the Node/VPS/Edge adapters.
 */
export default async function handler(request) {
  return handleQuestionGenerate(request, process.env)
}
