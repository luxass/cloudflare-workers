import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

export interface HonoContext {
  Bindings: {
    ENVIRONMENT: string;
  };
}

const app = new Hono<HonoContext>();

app.get("/view-source", (c) => {
  return c.redirect("https://github.com/luxass/assets", 301);
});

app.get("/ping", (c) => {
  c.status(418);
  return c.text("pong!");
});

app.get(
  "/api/fonts/*",
  async (c, next) => {
    if (c.env.ENVIRONMENT !== "production" && c.env.ENVIRONMENT !== "staging") {
      return await next();
    }
    const key = c.req.url;
    const cache = await caches.open("fonts");

    const response = await cache.match(key);
    if (!response) {
      // eslint-disable-next-line no-console
      console.info("serving font from network");
      await next();
      if (!c.res.ok) {
        console.error("failed to fetch font, skipping caching");
        return;
      }

      c.res.headers.set("Cache-Control", "public, max-age=3600");

      const response = c.res.clone();
      c.executionCtx.waitUntil(cache.put(key, response));
    } else {
      // eslint-disable-next-line no-console
      console.info("serving font from cache");
      return new Response(response.body, response);
    }
  },
);

app.get("/api/fonts/:family/:weight/:text?", async (c) => {
  const url = new URL(c.req.url);
  const { family: _family, weight, text } = c.req.param();

  const family = _family[0].toUpperCase() + _family.slice(1);

  let fontsUrl = `https://fonts.googleapis.com/css2?family=${family}:wght@${weight}`;
  if (text) {
    // allow font optimization if we pass text => only getting the characters we need
    fontsUrl += `&text=${encodeURIComponent(text)}`;
  }

  const css = await (
    await fetch(fontsUrl, {
      headers: {
        // Make sure it returns TTF.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1",
      },
    })
  ).text();

  const resource = css.match(
    /src: url\((.+)\) format\('(opentype|truetype)'\)/,
  );

  if (!resource || !resource[1]) {
    return new Response("No resource found", { status: 404 });
  }

  const res = await fetch(resource[1]);

  const arrayBuffer = await res.arrayBuffer();
  const body = new Uint8Array(arrayBuffer);

  const response = new Response(body, res);

  if (url.hostname === "localhost") {
    response.headers.delete("content-encoding");
    response.headers.delete("content-length");
  }

  return response;
});

app.use(async (c) => {
  const url = new URL(c.req.url);

  if (url.pathname === "/") {
    url.pathname = "/README.md";
  }

  const branch = url.searchParams.get("branch") || "main";
  return fetch(`https://raw.githubusercontent.com/luxass/assets/${branch}/${url.pathname}`);
});

app.onError(async (err, c) => {
  console.error(err);
  const url = new URL(c.req.url);
  if (err instanceof HTTPException) {
    return c.json({
      path: url.pathname,
      status: err.status,
      message: err.message,
      timestamp: new Date().toISOString(),
    });
  }

  return c.json({
    path: url.pathname,
    status: 500,
    message: "Internal server error",
    timestamp: new Date().toISOString(),
  });
});

app.notFound(async (c) => {
  const url = new URL(c.req.url);
  return c.json({
    path: url.pathname,
    status: 404,
    message: "Not found",
    timestamp: new Date().toISOString(),
  });
});

export default app;
