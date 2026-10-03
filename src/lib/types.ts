// Hand-written types mirroring the existing Supabase schema used by the
// original admin-5.html / class-23.html. Extend these as you add features
// (exercises, quizzes, competitions, ...).

export interface ClassSession {
  id: string;
  code: string;
  title: string;
  admin_pin_hash: string;
  created_by: string | null;
  /** Teacher account that owns the class (set by a DB trigger on insert). */
  teacher_id?: string | null;
  created_at: string;
}

/**
 * A «جلسه» (lesson) inside a class — see supabase/LESSONS.sql.
 * A class is split into lessons so the workspace only ever shows one session
 * at a time instead of every cell of the whole term on a single page.
 */
export interface Lesson {
  id: string;
  class_id: string;
  title: string;
  description: string | null;
  /** Ordering among the class's lessons (same idea as cells.position). */
  position: number | null;
  /** Unpublished lessons stay hidden from students. */
  is_published: boolean;
  created_at: string;
  updated_at?: string | null;
}

export interface Team {
  id: string;
  class_id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface TeamMember {
  team_id: string;
  user_id: string;
  display_name: string;
  joined_at: string;
}

export interface Cell {
  id: string;
  class_id: string;
  team_id: string | null;
  team_name: string | null;
  author_id: string;
  author_name: string;
  code: string;
  output: string | null;
  tags: string[] | null;
  position?: number | null;
  /** Which lesson (جلسه) this cell belongs to — null for legacy/unsorted cells. */
  lesson_id?: string | null;
  created_at: string;
  updated_at: string | null;
  comments_count?: number;
}

export interface Comment {
  id: string;
  cell_id: string;
  author_id: string;
  author_name: string;
  text: string;
  created_at: string;
}

export type UserRole = "student" | "teacher";

export interface UserProfile {
  user_id: string;
  display_name: string;
  avatar: string;
  /** Real email for teachers, `<student_code>@students.local` for students. */
  email?: string | null;
  /** Student code (local part of the fake email), null for teachers. */
  username?: string | null;
  /** Server-granted role: only a teacher invite code produces "teacher". */
  role?: UserRole | null;
  full_name?: string | null;
  updated_at: string;
}

export interface TestCase {
  input: string;
  expected: string;
}

export interface TestResult {
  input: string;
  expected: string;
  actual: string;
  passed: boolean;
  error?: string | null;
}

export interface Exercise {
  id: string;
  class_id: string;
  title: string;
  description: string | null;
  hint: string | null;
  test_cases: TestCase[];
  shared_exercise_id?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export type SubmissionStatus = "pending" | "correct" | "partial" | "wrong" | "error";

export interface ExerciseSubmission {
  id?: string;
  exercise_id: string;
  user_id: string;
  author_name: string;
  code: string;
  output: string;
  status: SubmissionStatus;
  score: number;
  passed_tests: number;
  total_tests: number;
  test_results: TestResult[];
  submitted_at: string;
}

export interface SharedExercise {
  id: string;
  title: string;
  description: string | null;
  hint: string | null;
  test_cases: TestCase[];
  created_by_name: string | null;
  use_count: number;
  created_at: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correct: number;
}

export type QuizStatus = "draft" | "active" | "ended";

export interface Quiz {
  id: string;
  class_id: string;
  title: string;
  time_limit: number; // minutes
  questions: QuizQuestion[];
  status: QuizStatus;
  started_at?: string | null;
  created_at: string;
}

export interface QuizAnswer {
  id?: string;
  quiz_id: string;
  user_id: string;
  author_name: string;
  answers: number[];
  score: number;
  total_questions: number;
  submitted_at: string;
}

export type CompetitionStatus = "draft" | "active" | "ended";

export interface Competition {
  id: string;
  class_id: string;
  title: string;
  description: string | null;
  time_limit: number; // minutes
  status: CompetitionStatus;
  started_at?: string | null;
  created_at: string;
}

export interface CompetitionSubmission {
  id?: string;
  competition_id: string;
  team_id: string;
  team_name: string;
  user_id: string;
  author_name: string;
  code: string;
  submitted_at: string;
  submitter_key: string;
}

// ---------------------------------------------------------------------------
// 🧪 Playground — personal notebooks (code without joining any class)
// See supabase/PLAYGROUND.sql
// ---------------------------------------------------------------------------

export interface Notebook {
  id: string;
  user_id: string;
  title: string;
  position: number | null;
  created_at: string;
  updated_at?: string | null;
}

export interface NotebookCell {
  id: string;
  notebook_id: string;
  user_id: string;
  code: string | null;
  output: string | null;
  tags: string[] | null;
  position: number | null;
  created_at: string;
  updated_at: string | null;
}

// Minimal Database type so `createClient<Database>()` gets some type-safety.
// Not exhaustive — add exercises/quizzes/competitions tables here as you
// bring those features over.
export interface Database {
  public: {
    Tables: {
      class_sessions: { Row: ClassSession; Insert: Partial<ClassSession>; Update: Partial<ClassSession> };
      teams: { Row: Team; Insert: Partial<Team>; Update: Partial<Team> };
      team_members: { Row: TeamMember; Insert: Partial<TeamMember>; Update: Partial<TeamMember> };
      cells: { Row: Cell; Insert: Partial<Cell>; Update: Partial<Cell> };
      comments: { Row: Comment; Insert: Partial<Comment>; Update: Partial<Comment> };
      user_profiles: { Row: UserProfile; Insert: Partial<UserProfile>; Update: Partial<UserProfile> };
    };
  };
}

export interface TeamMessage {
  id: string;
  team_id: string;
  class_id: string;
  user_id: string;
  author_name: string;
  avatar: string | null;
  text: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// ⚔️ 1v1 Code Battle (see supabase/BATTLE.sql)
// ---------------------------------------------------------------------------

export type BattleStatus = "waiting" | "ready" | "active" | "finished" | "cancelled";

export interface Battle {
  id: string;
  class_id: string;
  exercise_id: string | null;
  host_id: string;
  guest_id: string | null;
  room_code: string;
  status: BattleStatus;
  time_limit: number;
  host_ready: boolean;
  guest_ready: boolean;
  host_last_ping: string | null;
  guest_last_ping: string | null;
  started_at: string | null;
  finished_at: string | null;
  winner_id: string | null;
  created_at: string;
}

export interface BattleSubmission {
  id?: string;
  battle_id: string;
  user_id: string;
  code: string;
  passed_tests: number;
  total_tests: number;
  test_results: TestResult[];
  is_final: boolean;
  submitted_at: string;
}

/** One side of a battle as the state endpoint reports it. */
export interface BattlePlayer {
  id: string;
  name: string;
  avatar: string;
  ready: boolean;
  passed: number;
  total: number;
  isFinal: boolean;
  connected: boolean;
}

export interface BattleStateResponse {
  battle: Battle;
  exercise: Exercise | null;
  me: BattlePlayer;
  opponent: BattlePlayer | null;
  remainingMs: number;
  countdownMs: number;
  outcome: "win" | "lose" | "draw" | null;
}

export interface BattleStats {
  played: number;
  wins: number;
  losses: number;
  draws: number;
  xp: number;
}

// ---------------------------------------------------------------------------
// 🏆 Tournament system (see supabase/TOURNAMENT.sql)
// ---------------------------------------------------------------------------

export type BattleDifficulty = "easy" | "medium" | "hard";
export type TournamentStatus = "registering" | "active" | "finished" | "cancelled";
export type TournamentStage = "group" | "knockout";
export type TournamentQuestionMode = "random" | "difficulty_based" | "fixed";

/** بانک سوال مسابقه — منبع سوالِ تورنمنت (جدا از exercises). */
export interface BattleQuestion {
  id: string;
  class_id: string;
  teacher_id: string;
  title: string;
  description: string;
  hint: string;
  difficulty: BattleDifficulty;
  test_cases: TestCase[];
  tags: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Tournament {
  id: string;
  class_id: string;
  teacher_id: string;
  title: string;
  description: string;
  time_limit: number;
  max_participants: number;
  is_group_stage: boolean;
  group_size: number | null;
  groups_count: number | null;
  question_mode: TournamentQuestionMode;
  fixed_question_id: string | null;
  status: TournamentStatus;
  current_round: number;
  current_stage: TournamentStage;
  winner_id: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface TournamentParticipant {
  id: string;
  tournament_id: string;
  user_id: string;
  group_number: number | null;
  eliminated_at_round: number | null;
  eliminated_at_stage: string | null;
  joined_at: string;
}

export interface TournamentBattle {
  id: string;
  class_id: string;
  tournament_id: string;
  stage: TournamentStage;
  group_number: number | null;
  round_number: number;
  bracket_position: number;
  battle_question_id: string;
  host_id: string;
  guest_id: string;
  status: "active" | "finished" | "cancelled";
  time_limit: number;
  started_at: string;
  finished_at: string | null;
  winner_id: string | null;
  created_at: string;
}

export interface TournamentBattleSubmission {
  id?: string;
  battle_id: string;
  user_id: string;
  code: string;
  passed_tests: number;
  total_tests: number;
  test_results: TestResult[];
  is_final: boolean;
  submitted_at: string;
}

/** پاسخ GET /api/tournament/battle/[id]/state */
export interface TournamentBattleState {
  battle: TournamentBattle;
  question: BattleQuestion | null;
  tournament: Tournament | null;
  me: BattlePlayer;
  opponent: BattlePlayer | null;
  remainingMs: number;
  countdownMs: number;
  outcome: "win" | "lose" | "draw" | null;
}



export interface AiHintRequest {
  id: string;
  user_id: string;
  exercise_id: string;
  code: string;
  user_message: string | null;
  ai_response: string;
  created_at: string;
}
