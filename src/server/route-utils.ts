import { errors } from "./http";

export type IdCtx = { params: Promise<{ id: string }> };

export async function intId(ctx: IdCtx): Promise<number> {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0 || n > 2_147_483_647) throw errors.notFound("Заявка не найдена");
  return n;
}

export async function strId(ctx: IdCtx): Promise<string> {
  const { id } = await ctx.params;
  if (!id || id.length > 64) throw errors.notFound();
  return id;
}
