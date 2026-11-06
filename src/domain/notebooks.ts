import { normalizeSubject } from './taxonomy'
import type { Notebook, NotebookAudience, NotebookInput, Question } from './types'

export const NOTEBOOK_AUDIENCES: readonly NotebookAudience[] = ['k12', 'computer', 'civil', 'general']
export const NOTEBOOK_COVERS = [
  { id: 'math', name: '数学', audience: 'k12', color: '#324e49', ink: '#f2ead8', art: '#b3c4a3', symbol: 'π', pattern: 'orbit' },
  { id: 'english', name: '英语', audience: 'k12', color: '#c5a673', ink: '#302e27', art: '#645b41', symbol: 'Aa', pattern: 'square' },
  { id: 'chinese', name: '语文', audience: 'k12', color: '#73765b', ink: '#f9f2df', art: '#d0cfb0', symbol: '文', pattern: 'leaf' },
  { id: 'physics', name: '物理', audience: 'k12', color: '#344c67', ink: '#e9edf0', art: '#9bb9d0', symbol: 'φ', pattern: 'orbit' },
  { id: 'chemistry', name: '化学', audience: 'k12', color: '#a05642', ink: '#fff0dc', art: '#dfb197', symbol: 'H', pattern: 'hexagon' },
  { id: 'science', name: '科学综合', audience: 'k12', color: '#586a57', ink: '#f5efdd', art: '#c8d9ad', symbol: '✦', pattern: 'orbit' },
  { id: 'coding', name: '编程开发', audience: 'computer', color: '#273b4a', ink: '#e7f1e8', art: '#8dbfb1', symbol: '</>', pattern: 'code' },
  { id: 'algorithms', name: '数据结构与算法', audience: 'computer', color: '#4d4d6b', ink: '#f4efdf', art: '#bcb4e0', symbol: 'O(n)', pattern: 'network' },
  { id: 'database', name: '数据库', audience: 'computer', color: '#416c68', ink: '#f1f1de', art: '#a8d4b8', symbol: 'SQL', pattern: 'database' },
  { id: 'network', name: '计算机网络', audience: 'computer', color: '#3b5f7c', ink: '#eef4ec', art: '#aecde0', symbol: 'IP', pattern: 'network' },
  { id: 'systems', name: '操作系统', audience: 'computer', color: '#57574e', ink: '#f4eedb', art: '#c3c6a6', symbol: 'OS', pattern: 'code' },
  { id: 'aptitude', name: '行测', audience: 'civil', color: '#6a4c3e', ink: '#f8edda', art: '#d8b58c', symbol: '策', pattern: 'square' },
  { id: 'essay', name: '申论', audience: 'civil', color: '#663e48', ink: '#f6ebdf', art: '#d9acb3', symbol: '论', pattern: 'leaf' },
  { id: 'public', name: '公共基础', audience: 'civil', color: '#375b59', ink: '#f1eddb', art: '#a8c8b2', symbol: '知', pattern: 'square' },
  { id: 'forest', name: '森林手记', audience: 'general', color: '#345348', ink: '#f5efdb', art: '#afc7a1', symbol: '✧', pattern: 'leaf' },
  { id: 'linen', name: '亚麻原色', audience: 'general', color: '#c3ae88', ink: '#3e392e', art: '#766646', symbol: '∴', pattern: 'square' },
  { id: 'midnight', name: '午夜星图', audience: 'general', color: '#29394e', ink: '#f3ecdc', art: '#a9b9d3', symbol: '✦', pattern: 'orbit' },
  { id: 'clay', name: '陶色随记', audience: 'general', color: '#a7634c', ink: '#fff0dc', art: '#e0b69b', symbol: '∞', pattern: 'square' },
] as const

export function notebookCover(id: string) { return NOTEBOOK_COVERS.find(cover => cover.id === id) || NOTEBOOK_COVERS.find(cover => cover.id === 'forest')! }

export function normalizeNotebook(input: NotebookInput): Omit<Notebook, 'id' | 'createdAt' | 'updatedAt'> {
  if (typeof input.title !== 'string' || !input.title.trim() || input.title.trim().length > 40) throw new Error('错题本名称不能为空，最多 40 字。')
  if (!NOTEBOOK_AUDIENCES.includes(input.audience)) throw new Error('请选择有效的学习方向。')
  if (!NOTEBOOK_COVERS.some(cover => cover.id === input.coverId)) throw new Error('请选择有效的错题本封面。')
  if (input.subject !== undefined && (typeof input.subject !== 'string' || input.subject.trim().length > 20 || /[\r\n]/.test(input.subject))) throw new Error('默认科目最多 20 字，不能换行。')
  return { title: input.title.trim(), audience: input.audience, coverId: input.coverId, subject: input.subject?.trim() ? normalizeSubject(input.subject) : '' }
}

export function defaultNotebookId(subject: string) { return `notebook-subject-${encodeURIComponent(subject || '__unclassified')}` }
export function defaultNotebook(subject: string, at: string): Notebook {
  const known: Record<string, string> = { 数学: 'math', 英语: 'english', 语文: 'chinese', 物理: 'physics', 化学: 'chemistry', 科学: 'science', 计算机: 'coding', 编程: 'coding', 数据结构: 'algorithms', 算法: 'algorithms', 数据库: 'database', 计算机网络: 'network', 操作系统: 'systems', 行测: 'aptitude', 申论: 'essay', 公共基础: 'public' }
  const cover = notebookCover(known[subject] || 'forest')
  return { id: defaultNotebookId(subject), title: subject ? `${subject}错题本` : '待分类收录夹', subject, audience: cover.audience, coverId: cover.id, automatic: true, createdAt: at, updatedAt: at }
}

/** Migrate detached snapshots, retaining all empty/custom books and every old question. */
export function migrateNotebooks<T extends { questions: Question[]; notebooks?: Notebook[] }>(data: T): T & { notebooks: Notebook[] } {
  if (data.notebooks !== undefined && !Array.isArray(data.notebooks)) throw new Error('错题本列表格式不正确。')
  const notebooks = (data.notebooks || []).map(book => {
    if (!book || typeof book.id !== 'string' || !book.id.trim() || book.id.length > 200 || typeof book.createdAt !== 'string' || typeof book.updatedAt !== 'string' || !Number.isFinite(Date.parse(book.createdAt)) || !Number.isFinite(Date.parse(book.updatedAt)) || book.automatic !== undefined && typeof book.automatic !== 'boolean') throw new Error('错题本记录格式不正确。')
    return { ...normalizeNotebook(book), id: book.id, createdAt: book.createdAt, updatedAt: book.updatedAt, ...(book.automatic !== undefined ? { automatic: book.automatic } : {}) }
  })
  if (notebooks.length > 2000 || new Set(notebooks.map(book => book.id)).size !== notebooks.length) throw new Error('错题本数量过多或标识重复。')
  const map = new Map(notebooks.map(book => [book.id, book]))
  const questions = data.questions.map(q => {
    if (q.notebookId !== undefined) {
      if (typeof q.notebookId !== 'string' || !map.has(q.notebookId)) throw new Error('题目引用了不存在的错题本。')
      return { ...q }
    }
    const id = defaultNotebookId(q.subject)
    if (!map.has(id)) { const book = defaultNotebook(q.subject, q.createdAt); notebooks.push(book); map.set(id, book) }
    return { ...q, notebookId: id }
  })
  if (notebooks.length > 2000) throw new Error('错题本数量超过 2000 本。')
  return { ...data, notebooks, questions }
}
