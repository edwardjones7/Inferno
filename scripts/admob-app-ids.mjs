// Writes the AdMob *app* ids into the native projects, from env vars (or .env files, loaded the
// same way `next build` loads them). Runs as part of `npm run cap:sync`.
//
//   NEXT_PUBLIC_ADMOB_IOS_APP_ID      -> ios/App/App/Info.plist  (GADApplicationIdentifier)
//   NEXT_PUBLIC_ADMOB_ANDROID_APP_ID  -> android/app/src/main/res/values/strings.xml (admob_app_id)
//
// Without them it writes Google's test app ids, so the SDK still starts (Android crashes on
// launch without an app id) but no real ads are served. Ad *unit* ids are read by the web code
// (src/lib/ads.ts) at build time instead.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
nextEnv.loadEnvConfig(root, false, { info: () => {}, error: console.error });

const TEST = { ios: "ca-app-pub-3940256099942544~1458002511", android: "ca-app-pub-3940256099942544~3347511713" };
const APP_ID = /^ca-app-pub-\d{16}~\d{10}$/;

function pick(name, fallback) {
  const v = process.env[name]?.trim();
  if (!v) {
    console.warn(`[admob] ${name} not set: using Google's test app id (no real ads).`);
    return fallback;
  }
  if (!APP_ID.test(v)) throw new Error(`[admob] ${name}="${v}" doesn't look like an AdMob app id (ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX)`);
  return v;
}

function patch(file, pattern, value) {
  const path = join(root, file);
  const before = readFileSync(path, "utf8");
  if (!pattern.test(before)) throw new Error(`[admob] couldn't find the app id entry in ${file}`);
  const after = before.replace(pattern, (_m, open, _old, close) => `${open}${value}${close}`);
  if (after !== before) writeFileSync(path, after);
  console.log(`[admob] ${file}: ${value}`);
}

patch(
  "ios/App/App/Info.plist",
  /(<key>GADApplicationIdentifier<\/key>\s*<string>)([^<]*)(<\/string>)/,
  pick("NEXT_PUBLIC_ADMOB_IOS_APP_ID", TEST.ios),
);
patch(
  "android/app/src/main/res/values/strings.xml",
  /(<string name="admob_app_id">)([^<]*)(<\/string>)/,
  pick("NEXT_PUBLIC_ADMOB_ANDROID_APP_ID", TEST.android),
);
