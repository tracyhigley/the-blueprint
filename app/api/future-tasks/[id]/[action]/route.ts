import { revalidatePath } from "next/cache";
import { validateTask } from "@/lib/future-tasks";
import { deleteTask, editTask, markDone, putBack } from "@/lib/future-tasks-db";
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** POST /api/future-tasks/<id>/<edit|done|undo|delete> */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  try {
    const { id, action } = await params;
    if (!UUID_RE.test(id))
      throw new BadInput("that task isn't on this list any more");
    const { sb, userId, blueprintId } = await requireCtx();
    let extra: Record<string, unknown> = {};

    switch (action) {
      case "edit": {
        const v = validateTask(await readJson(req));
        if (!v.ok) throw new BadInput(v.error);
        await checkBuilding(sb, blueprintId, v.value.building);
        await editTask(sb, blueprintId, id, v.value);
        extra.sent_to_field_notes = (await sendNowIfDue(blueprintId)) > 0;
        break;
      }
      case "done":
        extra = await markDone(sb, blueprintId, id, userId);
        break;
      case "undo":
        await putBack(sb, blueprintId, id);
        break;
      case "delete":
        await deleteTask(sb, blueprintId, id);
        break;
      default:
        throw new BadInput("unknown action");
    }

    revalidatePath("/future-tasks");
    revalidatePath("/field-notes");
    return ok({ id, ...extra });
  } catch (e) {
    return errorReply(e);
  }
}
