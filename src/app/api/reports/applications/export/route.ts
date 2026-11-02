import { requireUser } from "@/server/auth/session";
import { parseQuery, route } from "@/server/http";
import { getApplicationsReport, reportQuerySchema } from "@/server/queries/applications";
import { APPLICATION_STATUS_LABEL, DECISION_LABEL, formatDateTime } from "@/lib/labels";
import { getSetting } from "@/server/settings";
import { audit } from "@/server/audit";
import { prisma } from "@/server/db";

function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  // Защита от CSV-инъекций в Excel.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export const GET = route(async (req) => {
  const user = await requireUser("applications.reports.view");
  const q = parseQuery(req, reportQuerySchema);
  const tz = await getSetting("timezone");
  const lines = [["ID", "Ник", "ФИО", "VK ID", "VK", "Дата подачи", "Статус", "Решение", "Кто принял / отказал", "Дата решения", "Причина"].map(csvCell).join(";")];
  let page = 1;
  for (;;) {
    const r = await getApplicationsReport({ ...q, page, pageSize: 100 });
    for (const a of r.rows) {
      lines.push(
        [
          a.id,
          a.nickname,
          a.fullName,
          a.vkId,
          a.vkId ? `https://vk.com/id${a.vkId}` : a.vkProfileRaw,
          formatDateTime(a.submittedAt, tz),
          APPLICATION_STATUS_LABEL[a.status],
          a.decision ? DECISION_LABEL[a.decision] : "",
          a.decisionSource === "SYSTEM" ? "Система" : (a.decidedBy?.nickname ?? ""),
          a.decidedAt ? formatDateTime(a.decidedAt, tz) : "",
          a.reason,
        ]
          .map(csvCell)
          .join(";"),
      );
    }
    if (page * 100 >= r.total || page > 200) break;
    page++;
  }
  await audit(prisma, { actor: { type: "USER", id: user.id, label: user.nickname }, action: "report.exported", details: q });
  return new Response("\uFEFF" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="antyobzhelp-report-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});
