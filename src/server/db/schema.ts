/**
 * Drizzle schema — see brief §5 for the source-of-truth data model and
 * DECISIONS.md for judgement calls (overseas territories, country naming
 * convention, …). SQLite/libSQL. Text ULIDs for ids, integer timestamps.
 */
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { ulid } from "ulid";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => ulid());

const createdAt = () =>
  integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date());

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export type UserRole = "admin" | "player";

export const users = sqliteTable(
  "users",
  {
    id: id(),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").$type<UserRole>().notNull().default("player"),
    avatarSeed: text("avatar_seed").notNull(),
    bio: text("bio"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    lastLoginAt: integer("last_login_at", { mode: "timestamp" }),
    createdBy: text("created_by"),
  },
  (t) => [
    uniqueIndex("users_username_idx").on(t.username),
    index("users_created_by_idx").on(t.createdBy),
  ],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    createdAt: createdAt(),
    userAgent: text("user_agent"),
    ipHash: text("ip_hash"),
  },
  (t) => [
    index("sessions_user_id_idx").on(t.userId),
    index("sessions_expires_at_idx").on(t.expiresAt),
  ],
);

// ---------------------------------------------------------------------------
// Content taxonomy
// ---------------------------------------------------------------------------

export type ColorToken = "moss" | "gold" | "clay" | "plum";

export const categories = sqliteTable(
  "categories",
  {
    id: id(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    colorToken: text("color_token").$type<ColorToken>().notNull(),
    description: text("description"),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("categories_slug_idx").on(t.slug)],
);

export const media = sqliteTable(
  "media",
  {
    id: id(),
    filename: text("filename").notNull(),
    originalName: text("original_name").notNull(),
    mime: text("mime").notNull(),
    width: integer("width"),
    height: integer("height"),
    sizeBytes: integer("size_bytes").notNull(),
    dominantColor: text("dominant_color"),
    uploaderId: text("uploader_id")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("media_uploader_id_idx").on(t.uploaderId)],
);

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export type QuestionType = "open" | "mcq" | "image" | "geo";
export type QuestionStatus = "draft" | "published" | "archived";
export type AnswerMode = "mcq" | "open";

export const questions = sqliteTable(
  "questions",
  {
    id: id(),
    type: text("type").$type<QuestionType>().notNull(),
    prompt: text("prompt").notNull(),
    hint: text("hint"),
    explanation: text("explanation"),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id),
    difficulty: integer("difficulty").notNull().default(1),
    timeLimitS: integer("time_limit_s").notNull().default(20),
    pointsBase: integer("points_base").notNull().default(1000),
    mediaId: text("media_id").references(() => media.id),
    /** Only meaningful for type='image' — the author's chosen answering mechanic. */
    answerMode: text("answer_mode").$type<AnswerMode>(),
    /** Damerau-Levenshtein fuzzy matching disabled when true — see grading.ts (Phase 5). */
    strict: integer("strict", { mode: "boolean" }).notNull().default(false),
    status: text("status").$type<QuestionStatus>().notNull().default("draft"),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("questions_category_id_idx").on(t.categoryId),
    index("questions_author_id_idx").on(t.authorId),
    index("questions_status_idx").on(t.status),
    index("questions_type_idx").on(t.type),
    index("questions_media_id_idx").on(t.mediaId),
  ],
);

export const questionChoices = sqliteTable(
  "question_choices",
  {
    id: id(),
    questionId: text("question_id")
      .notNull()
      .references(() => questions.id),
    label: text("label").notNull(),
    isCorrect: integer("is_correct", { mode: "boolean" }).notNull().default(false),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("question_choices_question_id_idx").on(t.questionId)],
);

export const questionOpenAnswers = sqliteTable(
  "question_open_answers",
  {
    id: id(),
    questionId: text("question_id")
      .notNull()
      .references(() => questions.id),
    value: text("value").notNull(),
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [index("question_open_answers_question_id_idx").on(t.questionId)],
);

export type GeoMode =
  "locate_country" | "name_country" | "find_capital" | "capital_of" | "name_from_shape";

/** [west, south, east, north] in degrees — camera framing for the geo reveal/preview. */
export type ViewBbox = [number, number, number, number];

export const questionGeo = sqliteTable("question_geo", {
  questionId: text("question_id")
    .primaryKey()
    .references(() => questions.id),
  mode: text("mode").$type<GeoMode>().notNull(),
  targetIso3: text("target_iso3").notNull(),
  extraIso3: text("extra_iso3", { mode: "json" }).$type<string[]>().notNull().default([]),
  viewBbox: text("view_bbox", { mode: "json" }).$type<ViewBbox | null>(),
  showLabels: integer("show_labels", { mode: "boolean" }).notNull().default(false),
  showNeighbours: integer("show_neighbours", { mode: "boolean" }).notNull().default(true),
  toleranceKm: integer("tolerance_km"),
});

// ---------------------------------------------------------------------------
// Reference data — seeded, see scripts/seed-countries.ts
// ---------------------------------------------------------------------------

export const countries = sqliteTable("countries", {
  iso3: text("iso3").primaryKey(),
  iso2: text("iso2").notNull(),
  unNumeric: text("un_numeric").notNull(),
  nameFr: text("name_fr").notNull(),
  nameEn: text("name_en").notNull(),
  officialNameFr: text("official_name_fr").notNull(),
  capitalFr: text("capital_fr"),
  capitalIsoLat: real("capital_iso_lat"),
  capitalIsoLon: real("capital_iso_lon"),
  population: integer("population"),
  areaKm2: integer("area_km2"),
  regionFr: text("region_fr").notNull(),
  subregionFr: text("subregion_fr").notNull(),
  continentFr: text("continent_fr").notNull(),
  centroidLon: real("centroid_lon").notNull(),
  centroidLat: real("centroid_lat").notNull(),
  flagEmoji: text("flag_emoji").notNull(),
  isSovereign: integer("is_sovereign", { mode: "boolean" }).notNull().default(true),
});

// ---------------------------------------------------------------------------
// Quizzes
// ---------------------------------------------------------------------------

export type ContentStatus = "draft" | "published";

export const quizzes = sqliteTable(
  "quizzes",
  {
    id: id(),
    title: text("title").notNull(),
    description: text("description"),
    coverMediaId: text("cover_media_id").references(() => media.id),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id),
    categoryId: text("category_id").references(() => categories.id),
    status: text("status").$type<ContentStatus>().notNull().default("draft"),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("quizzes_author_id_idx").on(t.authorId),
    index("quizzes_category_id_idx").on(t.categoryId),
    index("quizzes_status_idx").on(t.status),
  ],
);

export const quizQuestions = sqliteTable(
  "quiz_questions",
  {
    quizId: text("quiz_id")
      .notNull()
      .references(() => quizzes.id),
    questionId: text("question_id")
      .notNull()
      .references(() => questions.id),
    position: integer("position").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.quizId, t.questionId] }),
    index("quiz_questions_question_id_idx").on(t.questionId),
  ],
);

// ---------------------------------------------------------------------------
// Rooms / live games
// ---------------------------------------------------------------------------

export type RoomSource = "quiz" | "random";
export type RoomStatus = "lobby" | "running" | "finished" | "abandoned";
export type RoomVisibility = "public" | "private";
export type ScoringMode = "speed" | "flat";

export interface RoomConfig {
  questionCount: number;
  defaultTimeLimitS: number;
  categoryIds: string[];
  difficultyMin: number;
  difficultyMax: number;
  allowLateJoin: boolean;
  maxPlayers: number;
  revealDurationS: number;
  scoringMode: ScoringMode;
}

export const rooms = sqliteTable(
  "rooms",
  {
    id: id(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    hostId: text("host_id")
      .notNull()
      .references(() => users.id),
    quizId: text("quiz_id").references(() => quizzes.id),
    source: text("source").$type<RoomSource>().notNull(),
    config: text("config", { mode: "json" }).$type<RoomConfig>().notNull(),
    status: text("status").$type<RoomStatus>().notNull().default("lobby"),
    visibility: text("visibility").$type<RoomVisibility>().notNull().default("public"),
    currentIndex: integer("current_index").notNull().default(-1),
    createdAt: createdAt(),
    startedAt: integer("started_at", { mode: "timestamp" }),
    endedAt: integer("ended_at", { mode: "timestamp" }),
  },
  (t) => [
    uniqueIndex("rooms_code_idx").on(t.code),
    index("rooms_host_id_idx").on(t.hostId),
    index("rooms_quiz_id_idx").on(t.quizId),
    index("rooms_status_idx").on(t.status),
    index("rooms_visibility_idx").on(t.visibility),
  ],
);

export const roomQuestions = sqliteTable(
  "room_questions",
  {
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id),
    position: integer("position").notNull(),
    questionId: text("question_id")
      .notNull()
      .references(() => questions.id),
    timeLimitS: integer("time_limit_s").notNull(),
    revealedAt: integer("revealed_at", { mode: "timestamp" }),
    closedAt: integer("closed_at", { mode: "timestamp" }),
  },
  (t) => [
    primaryKey({ columns: [t.roomId, t.position] }),
    index("room_questions_question_id_idx").on(t.questionId),
  ],
);

export const roomPlayers = sqliteTable(
  "room_players",
  {
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    joinedAt: createdAt(),
    leftAt: integer("left_at", { mode: "timestamp" }),
    isConnected: integer("is_connected", { mode: "boolean" }).notNull().default(true),
    score: integer("score").notNull().default(0),
    streak: integer("streak").notNull().default(0),
    bestStreak: integer("best_streak").notNull().default(0),
    correctCount: integer("correct_count").notNull().default(0),
    finalRank: integer("final_rank"),
  },
  (t) => [
    primaryKey({ columns: [t.roomId, t.userId] }),
    index("room_players_user_id_idx").on(t.userId),
  ],
);

export interface OpenAnswerPayload {
  text: string;
}
export interface McqAnswerPayload {
  choiceIds: string[];
}
export interface GeoAnswerPayload {
  iso3?: string;
  text?: string;
}
export type AnswerPayload = OpenAnswerPayload | McqAnswerPayload | GeoAnswerPayload;

export const answers = sqliteTable(
  "answers",
  {
    id: id(),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id),
    questionId: text("question_id")
      .notNull()
      .references(() => questions.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    position: integer("position").notNull(),
    payload: text("payload", { mode: "json" }).$type<AnswerPayload>().notNull(),
    isCorrect: integer("is_correct", { mode: "boolean" }).notNull(),
    msTaken: integer("ms_taken").notNull(),
    pointsAwarded: integer("points_awarded").notNull(),
    submittedAt: createdAt(),
  },
  (t) => [
    uniqueIndex("answers_room_position_user_idx").on(t.roomId, t.position, t.userId),
    index("answers_question_id_idx").on(t.questionId),
    index("answers_user_id_idx").on(t.userId),
  ],
);

// ---------------------------------------------------------------------------
// Progression
// ---------------------------------------------------------------------------

export const userStats = sqliteTable("user_stats", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id),
  gamesPlayed: integer("games_played").notNull().default(0),
  questionsAnswered: integer("questions_answered").notNull().default(0),
  correctAnswers: integer("correct_answers").notNull().default(0),
  totalPoints: integer("total_points").notNull().default(0),
  bestStreak: integer("best_streak").notNull().default(0),
  xp: integer("xp").notNull().default(0),
  level: integer("level").notNull().default(1),
  wins: integer("wins").notNull().default(0),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const userCategoryStats = sqliteTable(
  "user_category_stats",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id),
    answered: integer("answered").notNull().default(0),
    correct: integer("correct").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.categoryId] }),
    index("user_category_stats_category_id_idx").on(t.categoryId),
  ],
);

export type BadgeTier = "bronze" | "silver" | "gold";

export const badges = sqliteTable("badges", {
  id: text("id").primaryKey(),
  nameFr: text("name_fr").notNull(),
  descriptionFr: text("description_fr").notNull(),
  iconKey: text("icon_key").notNull(),
  tier: text("tier").$type<BadgeTier>().notNull(),
});

export const userBadges = sqliteTable(
  "user_badges",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    badgeId: text("badge_id")
      .notNull()
      .references(() => badges.id),
    earnedAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.badgeId] }),
    index("user_badges_badge_id_idx").on(t.badgeId),
  ],
);
