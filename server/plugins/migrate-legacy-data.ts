import { existsSync } from "node:fs";
import { rename } from "node:fs/promises";
import { dirname } from "node:path";
import envPaths from "env-paths";

// One-shot rename of the pre-Pocket-Quartermaster data directories on startup.
// The app was previously published as `savesmanager`; env-paths used that as
// the directory name. Move the whole legacy parent dirs into the new ones so
// every leaf (Config, Data, Cache, Log) comes along. Idempotent; safe on every
// boot.
export default defineNitroPlugin(async () => {
  const legacy = envPaths("savesmanager", { suffix: "" });
  const current = envPaths("pocket-quartermaster", { suffix: "" });
  // env-paths returns leaves (e.g. ...\<name>\Config); migrate the *parent*
  // directory so we don't have to mkdir the destination first.
  const pairs = [
    [dirname(legacy.config), dirname(current.config)],
    [dirname(legacy.data), dirname(current.data)],
  ] as const;
  const seen = new Set<string>();
  for (const [oldRoot, newRoot] of pairs) {
    if (seen.has(oldRoot)) continue;
    seen.add(oldRoot);
    if (!existsSync(oldRoot) || existsSync(newRoot)) continue;
    try {
      await rename(oldRoot, newRoot);
      console.log(`[migrate-legacy-data] moved ${oldRoot} -> ${newRoot}`);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") continue;
      console.warn(
        `[migrate-legacy-data] failed to move ${oldRoot}: ${(err as Error).message}`,
      );
    }
  }
});
