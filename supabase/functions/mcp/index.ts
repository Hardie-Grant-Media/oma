import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  AccessError,
  authenticate,
  type Backend,
  type Config,
} from "./backend.ts";
import { createServer } from "./tools.ts";

export type Dependencies = {
  config: () => Config;
  authenticate: (token: string, config: Config) => Promise<Backend>;
};
function config(): Config {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  const resourceUrl = Deno.env.get("OMA_MCP_URL")?.replace(/\/$/, "");
  const publicKey = Deno.env.get("SUPABASE_ANON_KEY");
  const clientIds = (Deno.env.get("OMA_MCP_CLIENT_IDS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (
    Deno.env.get("OMA_MCP_ENABLED") !== "true" ||
    !supabaseUrl ||
    !resourceUrl ||
    !publicKey ||
    !clientIds.length
  )
    throw new AccessError(503, "OMA ChatGPT connection is not enabled.");
  for (const value of [supabaseUrl, resourceUrl]) {
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.protocol !== "https:" &&
        !(
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(url.hostname)
        ))
    )
      throw new AccessError(503, "OMA connection configuration is invalid.");
  }
  return {
    supabaseUrl,
    resourceUrl,
    publicKey,
    clientIds,
    origins: (Deno.env.get("APP_ORIGINS") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}
export function createHandler(deps: Dependencies = { config, authenticate }) {
  return async (req: Request): Promise<Response> => {
    const headers = new Headers({
      "Cache-Control": "no-store, private",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      Vary: "Origin",
    });
    const json = (body: unknown, status: number) =>
      Response.json(body, { status, headers });
    try {
      const settings = deps.config();
      const origin = req.headers.get("origin");
      if (origin && !settings.origins.includes(origin))
        return json({ error: "Origin denied." }, 403);
      if (origin) headers.set("Access-Control-Allow-Origin", origin);
      headers.set(
        "Access-Control-Allow-Headers",
        "authorization, content-type, mcp-protocol-version, mcp-session-id",
      );
      headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      headers.set("Access-Control-Expose-Headers", "WWW-Authenticate");
      if (req.method === "OPTIONS")
        return new Response(null, { status: 204, headers });
      const path = new URL(req.url).pathname.replace(/\/$/, "");
      const resourcePath = new URL(settings.resourceUrl).pathname;
      // The hosted gateway strips /functions/v1 before invoking the function.
      const runtimePath = resourcePath.replace(/^\/functions\/v1(?=\/)/, "");
      const paths = [resourcePath, runtimePath];
      const metadata = `${settings.resourceUrl}/.well-known/oauth-protected-resource`;
      if (
        paths.some(
          (base) => path === `${base}/.well-known/oauth-protected-resource`,
        ) &&
        req.method === "GET"
      ) {
        return json(
          {
            resource: settings.resourceUrl,
            resource_name: "OMA by Reload Media",
            authorization_servers: [`${settings.supabaseUrl}/auth/v1`],
            scopes_supported: ["email"],
            bearer_methods_supported: ["header"],
          },
          200,
        );
      }
      if (!paths.includes(path)) return json({ error: "Not found." }, 404);
      headers.set(
        "WWW-Authenticate",
        `Bearer resource_metadata="${metadata}", scope="email"`,
      );
      const token = req.headers
        .get("authorization")
        ?.match(/^Bearer ([^\s]+)$/i)?.[1];
      if (!token) return json({ error: "Connect your OMA account." }, 401);
      const backend = await deps.authenticate(token, settings);
      if (req.method !== "POST")
        return new Response(null, { status: 405, headers });
      if (
        !req.headers
          .get("content-type")
          ?.toLowerCase()
          .startsWith("application/json")
      )
        return json({ error: "JSON required." }, 415);
      const maxBytes = 29_000_000;
      if (Number(req.headers.get("content-length")) > maxBytes)
        return json({ error: "Request too large." }, 413);
      let bytes = 0;
      const body = req.body?.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            bytes += chunk.length;
            if (bytes > maxBytes)
              throw new AccessError(413, "Request too large.");
            controller.enqueue(chunk);
          },
        }),
      );
      let parsed;
      try {
        parsed = await new Response(body).json();
      } catch (error) {
        if (error instanceof AccessError) throw error;
        return json({ error: "Invalid JSON." }, 400);
      }
      if (Array.isArray(parsed))
        return json({ error: "Batch requests are not supported." }, 400);
      const server = createServer(backend);
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      try {
        await server.connect(transport);
        const response = await transport.handleRequest(req, {
          parsedBody: parsed,
        });
        const responseHeaders = new Headers(response.headers);
        headers.delete("WWW-Authenticate");
        headers.forEach((value, key) => responseHeaders.set(key, value));
        // Materialize stateless JSON before closing request-owned resources.
        return new Response(await response.arrayBuffer(), {
          status: response.status,
          headers: responseHeaders,
        });
      } finally {
        await server.close();
      }
    } catch (error) {
      if (error instanceof AccessError)
        return json({ error: error.message }, error.status);
      return json(
        {
          error:
            "OMA connection failed. Check the audit before retrying a change.",
        },
        502,
      );
    }
  };
}
export const handler = createHandler();
if (import.meta.main) Deno.serve(handler);
