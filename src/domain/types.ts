export const SUBJECTS = ['数学', '英语', '物理', '化学', '语文', '生物', '历史', '地理', '道德与法治', '政治', '科学', '信息技术', '通用技术', '计算机', '专业课', '其他'] as const
/** Runtime validation also accepts custom names, excluding reserved filter labels. */
export type Subject = (typeof SUBJECTS)[number] | (string & {})
export type PaperSubject = Subject | '综合'
export type Difficulty = '基础' | '进阶' | '挑战'
export type OrganizationStatus = 'pending' | 'ready'
export type QuestionStatus = 'reinforce' | 'mastered'
export type ReviewRating = 'wrong' | 'correct' | 'mastered'

/** YYYY-MM-DD in the user's local calendar, never an ISO UTC day slice. */
export type LocalDate = string

export interface Question {
  id: string
  title: string
  subject: Subject
  stem: string
  answer: string
  analysis: string
  userAnswer: string
  remark?: string
  remarkImages?: string[]
  tags: string[]
  difficulty: Difficulty | ''
  source: string
  favorite: boolean
  status: QuestionStatus
  organizationStatus: OrganizationStatus
  organizedAt?: string
  createdAt: string
  updatedAt: string
  deletedAt?: string
  images: string[]
  nextReviewDate?: LocalDate
  reviewCount: number
  lastReviewedAt?: string
}

export interface QuestionInput {
  title?: string
  subject: Subject
  stem: string
  answer?: string
  analysis?: string
  userAnswer?: string
  remark?: string
  remarkImages?: string[]
  tags?: string[]
  difficulty?: Difficulty | ''
  source?: string
  favorite?: boolean
  status?: QuestionStatus
  organizationStatus?: OrganizationStatus
  images?: string[]
  nextReviewDate?: LocalDate
}

export interface Note {
  id: string
  title: string
  subject: Subject
  content: string
  images?: string[]
  questionIds: string[]
  createdAt: string
  updatedAt: string
}

export interface NoteInput {
  id?: string
  title: string
  subject: Subject
  content: string
  images?: string[]
  questionIds?: string[]
}

export interface Paper {
  id: string
  title: string
  subject: PaperSubject
  questionIds: string[]
  createdAt: string
  updatedAt: string
}

export interface PaperInput {
  id?: string
  title: string
  subject: PaperSubject
  questionIds: string[]
}

export interface Profile {
  nickname: string
  school: string
  grade: string
  goal: string
  avatarColor: string
}

export interface ReviewInput {
  answer: string
  rating: ReviewRating
  /** Unique per submit action. Reuse it when retrying the same action. */
  requestId: string
  planDate?: LocalDate
}

/** The question as it appeared when the review was submitted. */
export interface QuestionSnapshot {
  readonly title: string
  readonly stem: string
  readonly answer: string
  readonly analysis: string
  readonly images: readonly string[]
}

export interface ReviewRecord extends ReviewInput {
  id: string
  questionId: string
  reviewedAt: string
  /** Absent on legacy records; do not invent historical contents on migration. */
  questionSnapshot?: QuestionSnapshot
}

export interface StudyState {
  version: 1
  questions: Question[]
  notes: Note[]
  papers: Paper[]
  reviews: ReviewRecord[]
  profile: Profile
  storageError: string | null
}

export interface BackupCounts {
  /** Includes questions in the recycle bin. */
  questions: number
  notes: number
  papers: number
  reviews: number
}

export interface BackupEnvelope {
  format: 'shiti-backup'
  schemaVersion: 1
  exportedAt: string
  data: Omit<StudyState, 'storageError'>
}

export interface BackupValidationResult {
  counts: BackupCounts
  warnings: string[]
  /** Unique local image references across questions and review snapshots. */
  localImageCount: number
  /** Detached, fully validated replacement state; no mutation has occurred. */
  data: StudyState
}

export interface DailyHistory {
  date: LocalDate
  label: string
  reviewed: number
  correct: number
  wrong: number
  mastered: number
  added: number
}

export interface SubjectCount {
  subject: Subject
  total: number
  reinforce: number
  mastered: number
}

export interface StudyStats {
  total: number
  pending: number
  ready: number
  reinforce: number
  mastered: number
  favorites: number
  dueToday: number
  reviewCount: number
  todayReviewCount: number
  /** Percentage (0–100), based on review records of active, organized questions. */
  accuracy: number
  /** Consecutive local days with a review, counting today or yesterday. */
  streak: number
  noteCount: number
  paperCount: number
  subjectCounts: SubjectCount[]
  weeklyHistory: DailyHistory[]
}
