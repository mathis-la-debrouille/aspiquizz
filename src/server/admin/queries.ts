import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { users, categories, media, questions, type UserRole } from "@/server/db/schema";

export interface AdminUserRow {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
}

export async function listAllUsers(): Promise<AdminUserRow[]> {
  return db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
      isActive: users.isActive,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt));
}

export interface AdminCategoryRow {
  id: string;
  name: string;
  slug: string;
  colorToken: "moss" | "gold" | "clay" | "plum";
  description: string | null;
  position: number;
  questionCount: number;
}

export async function listAllCategories(): Promise<AdminCategoryRow[]> {
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      colorToken: categories.colorToken,
      description: categories.description,
      position: categories.position,
      questionCount: sql<number>`count(${questions.id})`,
    })
    .from(categories)
    .leftJoin(questions, eq(questions.categoryId, categories.id))
    .groupBy(categories.id)
    .orderBy(categories.position);

  return rows.map((r) => ({ ...r, questionCount: Number(r.questionCount) }));
}

export interface AdminMediaRow {
  id: string;
  filename: string;
  originalName: string;
  mime: string;
  sizeBytes: number;
  uploaderUsername: string;
  createdAt: Date;
  /** How many questions reference this media — deletion is blocked while it's > 0. */
  inUseCount: number;
}

export async function listAllMedia(): Promise<AdminMediaRow[]> {
  const rows = await db
    .select({
      id: media.id,
      filename: media.filename,
      originalName: media.originalName,
      mime: media.mime,
      sizeBytes: media.sizeBytes,
      uploaderUsername: users.username,
      createdAt: media.createdAt,
      inUseCount: sql<number>`count(${questions.id})`,
    })
    .from(media)
    .innerJoin(users, eq(media.uploaderId, users.id))
    .leftJoin(questions, eq(questions.mediaId, media.id))
    .groupBy(media.id)
    .orderBy(desc(media.createdAt));

  return rows.map((r) => ({ ...r, inUseCount: Number(r.inUseCount) }));
}
