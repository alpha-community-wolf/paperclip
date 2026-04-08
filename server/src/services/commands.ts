import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { commands } from "@paperclipai/db";
import type { CreateCommand, UpdateCommand } from "@paperclipai/shared";

export function commandService(db: Db) {
  async function list(companyId: string) {
    return db
      .select()
      .from(commands)
      .where(eq(commands.companyId, companyId))
      .orderBy(asc(commands.trigger));
  }

  async function getById(id: string) {
    return db
      .select()
      .from(commands)
      .where(eq(commands.id, id))
      .then((rows) => rows[0] ?? null);
  }

  async function getByTrigger(companyId: string, trigger: string) {
    return db
      .select()
      .from(commands)
      .where(and(eq(commands.companyId, companyId), eq(commands.trigger, trigger)))
      .then((rows) => rows[0] ?? null);
  }

  async function create(companyId: string, data: CreateCommand) {
    return db
      .insert(commands)
      .values({
        companyId,
        trigger: data.trigger.trim(),
        label: data.label.trim(),
        content: data.content,
      })
      .returning()
      .then((rows) => rows[0]!);
  }

  async function update(id: string, data: UpdateCommand) {
    const patch: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (data.trigger !== undefined) patch.trigger = data.trigger.trim();
    if (data.label !== undefined) patch.label = data.label.trim();
    if (data.content !== undefined) patch.content = data.content;

    return db
      .update(commands)
      .set(patch)
      .where(eq(commands.id, id))
      .returning()
      .then((rows) => rows[0] ?? null);
  }

  async function remove(id: string) {
    await db.delete(commands).where(eq(commands.id, id));
  }

  return {
    list,
    getById,
    getByTrigger,
    create,
    update,
    remove,
  };
}
