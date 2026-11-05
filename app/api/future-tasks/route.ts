import { revalidatePath } from "next/cache";
import { validateTask } from "@/lib/future-tasks";
import { addTask } from "@/lib/future-tasks-db";
import {
  BadInput,
  checkBuilding,
  errorReply,
  ok,
  readJson,
  requireCtx,
  sendNowIfDue,
} from "@/lib/future-tasks-api";

export const runtime = "nodejs";

/** Add a task. Body: { title, show_on, repeat, link, notes, building } */
export async function POST(req: Request) {
  try {
    const { sb, userId, blueprintId } = await requireCtx();
    const v = validateTask(await readJson(req));
    if (!v.ok) throw new BadInput(v.error);
    await checkBuilding(sb, blueprintId, v.value.building);
    const task = await addTask(sb, blueprintId, userId, v.value);
    const sentToFieldNotes = await sendNowIfDue(blueprintId);
    revalidatePath("/future-tasks");
    if (sentToFieldNotes) revalidatePath("/field-notes");
    return ok({ id: task.id, sent_to_field_notes: sentToFieldNotes > 0 });
  } catch (e) {
    return errorReply(e);
  }
}
