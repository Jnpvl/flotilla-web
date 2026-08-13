import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, "../src/environments/environment.ts");

const apiUrl = (
  process.env.API_URL ||
  process.env.NG_APP_API_URL ||
  "http://localhost:3001/api/v1"
).replace(/\/$/, "");

const production =
  process.env.NODE_ENV === "production" ||
  process.env.VERCEL === "1" ||
  process.env.VERCEL === "true";

const contents = `/** Generado por scripts/set-env.mjs — no editar a mano en CI. */
export const environment = {
  production: ${production ? "true" : "false"},
  apiUrl: ${JSON.stringify(apiUrl)},
};
`;

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, contents, "utf8");
console.log(`[set-env] apiUrl=${apiUrl} production=${production}`);
