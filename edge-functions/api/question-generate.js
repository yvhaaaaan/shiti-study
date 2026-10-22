import { handleQuestionGenerate } from '../../server/mimo-question.mjs'

/** EdgeOne injects private environment variables through context.env. */
export default function onRequest(context) {
  return handleQuestionGenerate(context.request, context.env || {}, {
    // EdgeOne otherwise stops outbound fetch after its 15-second default.
    // The shared handler still enforces the configured 60-second deadline.
    fetchImpl: (url, init) => fetch(url, {
      ...init,
      eo: { timeoutSetting: { connectTimeout: 90000, readTimeout: 90000, writeTimeout: 90000 } },
    }),
  })
}
