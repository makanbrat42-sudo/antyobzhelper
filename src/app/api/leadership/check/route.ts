import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { json, parseBody, route } from "@/server/http";
import { checkMessagesAllowed, sendStaffMessage } from "@/server/services/vk-bot";
import { audit } from "@/server/audit";
import { prisma } from "@/server/db";
import { actorOf } from "@/server/services/staff";

// Проверка доставки: разрешены ли сообщения от сообщества + тестовое сообщение сотруднику.
export const POST = route(async (req) => {
  const me = await requireUser("leadership.manage");
  const { userId, test } = await parseBody(req, z.object({ userId: z.string().max(64), test: z.boolean().default(false) }));
  const allowed = await checkMessagesAllowed(userId);
  let delivery = null;
  if (test) {
    delivery = await sendStaffMessage({
      recipientUserId: userId,
      text: "AntyObzhelp: тестовое сообщение. Если вы его видите — бот может присылать вам заявки.",
      kind: "TEST",
    });
    await audit(prisma, { actor: actorOf(me), action: "vkbot.test_message", entityType: "User", entityId: userId, details: { status: delivery.status } });
  }
  return json({ allowed, delivery: delivery ? { status: delivery.status, error: delivery.lastError } : null });
});
