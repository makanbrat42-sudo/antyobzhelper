import { cookies } from "next/headers";
import { json, route } from "@/server/http";
import { LINK_COOKIE, readLinkCookie } from "@/server/services/candidate-link";
import { env } from "@/server/env";

export const GET = route(async () => {
  const jar = await cookies();
  const data = readLinkCookie(jar.get(LINK_COOKIE)?.value);
  return json({ link: data, vkConfigured: !!env.vkIdClientId });
});
