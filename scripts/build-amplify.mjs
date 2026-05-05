import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const rootDir = fileURLToPath(new URL("..", import.meta.url));
const hostingDir = join(rootDir, ".amplify-hosting");
const computeDir = join(hostingDir, "compute", "default");
const staticDir = join(hostingDir, "static");
const packageJson = require("../package.json");

await rm(hostingDir, { force: true, recursive: true });
await mkdir(computeDir, { recursive: true });

await cp(join(rootDir, "dist", "client"), staticDir, { recursive: true });
await cp(join(rootDir, "dist"), join(computeDir, "dist"), { recursive: true });

await writeFile(
  join(computeDir, "server.mjs"),
  `import http from "node:http";
import startServer from "./dist/server/server.js";

const port = Number(process.env.PORT ?? 3000);

function requestBody(request) {
  if (request.method === "GET" || request.method === "HEAD") {
    return undefined;
  }

  return request;
}

function requestHeaders(headers) {
  const result = new Headers();

  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        result.append(key, item);
      }
    } else if (value !== undefined) {
      result.set(key, value);
    }
  }

  return result;
}

function writeHeaders(response, outgoing) {
  const setCookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [];

  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie" && setCookies.length > 0) {
      return;
    }

    outgoing.setHeader(key, value);
  });

  if (setCookies.length > 0) {
    outgoing.setHeader("set-cookie", setCookies);
  }
}

http
  .createServer(async (incoming, outgoing) => {
    try {
      const host = incoming.headers.host ?? "localhost:3000";
      const url = new URL(incoming.url ?? "/", \`http://\${host}\`);
      const request = new Request(url, {
        method: incoming.method,
        headers: requestHeaders(incoming.headers),
        body: requestBody(incoming),
        duplex: "half",
      });
      const response = await startServer.fetch(request);

      outgoing.statusCode = response.status;
      outgoing.statusMessage = response.statusText;
      writeHeaders(response, outgoing);

      if (!response.body) {
        outgoing.end();
        return;
      }

      for await (const chunk of response.body) {
        outgoing.write(chunk);
      }

      outgoing.end();
    } catch (error) {
      console.error(error);
      outgoing.statusCode = 500;
      outgoing.end("Internal Server Error");
    }
  })
  .listen(port, "0.0.0.0", () => {
    console.log(\`server is listening on \${port}\`);
  });
`,
);

await writeFile(
  join(computeDir, "package.json"),
  JSON.stringify(
    {
      private: true,
      type: "module",
      scripts: {
        start: "node server.mjs",
      },
      dependencies: packageJson.dependencies,
    },
    null,
    2,
  ),
);

execFileSync("npm", ["install", "--omit=dev", "--package-lock=false"], {
  cwd: computeDir,
  stdio: "inherit",
});

await writeFile(
  join(hostingDir, "deploy-manifest.json"),
  JSON.stringify(
    {
      version: 1,
      framework: {
        name: "tanstack-start",
        version: packageJson.dependencies["@tanstack/react-start"],
      },
      routes: [
        {
          path: "/*.*",
          target: {
            kind: "Static",
            cacheControl: "public, max-age=31536000, immutable",
          },
          fallback: {
            kind: "Compute",
            src: "default",
          },
        },
        {
          path: "/*",
          target: {
            kind: "Compute",
            src: "default",
          },
        },
      ],
      computeResources: [
        {
          name: "default",
          runtime: "nodejs22.x",
          entrypoint: "server.mjs",
        },
      ],
    },
    null,
    2,
  ),
);

console.log("Prepared Amplify Hosting SSR bundle in .amplify-hosting");
