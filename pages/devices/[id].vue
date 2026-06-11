<script setup lang="ts">
import { formatRelativeIso } from "~/composables/useFormat";

interface DeviceData {
  id: string;
  nickname: string;
  lastMountPath?: string;
  registeredAt: string;
  mounted: boolean;
  currentMountPath?: string;
  retroarchActivityDir?: string;
  activityCacheKey: string;
  romsRootRelPath?: string;
  romsCacheKey: string;
  launcherKind?: "es-de" | "muos";
  esDeRootRelPath?: string;
  artMaxEdgePx?: number;
  muosRootRelPath?: string;
}
interface SlotRef {
  profileName: string;
  slotId: string;
  fileRelPath: string;
  isDirectory?: boolean;
  lastSyncedAt?: string;
}
interface ScanResultRow {
  cacheKey: string;
  sourceLabel: string;
  summary?: {
    totalEntries?: number;
    totalFiles?: number;
    parsed: number;
    reused: number;
    scannedAt: string;
  };
  error?: string;
  skippedReason?: string;
}

const route = useRoute();
const router = useRouter();
const id = computed(() => route.params.id as string);

const device = ref<DeviceData | null>(null);
const slots = ref<SlotRef[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

const editing = ref(false);
const editBusy = ref(false);
const editError = ref<string | null>(null);

const scanning = ref(false);
const scanResult = ref<ScanResultRow | null>(null);

// ROM-library editor + scan state, parallel to the activity ones above.
const editingRoms = ref(false);
const romsBusy = ref(false);
const romsError = ref<string | null>(null);
const romsScanning = ref(false);
const romsScanResult = ref<ScanResultRow | null>(null);

async function refresh() {
  loading.value = true;
  error.value = null;
  try {
    const res = await $fetch<{ device: DeviceData; slots: SlotRef[] }>(
      `/api/devices/${id.value}`,
    );
    device.value = res.device;
    slots.value = res.slots;
  } catch (e) {
    error.value = (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);
watch(id, refresh);

async function renameDevice() {
  if (!device.value) return;
  const next = prompt("New nickname:", device.value.nickname);
  if (!next || next.trim() === device.value.nickname) return;
  try {
    await $fetch(`/api/devices/${id.value}`, {
      method: "PATCH",
      body: { nickname: next.trim() },
    });
    await refresh();
  } catch (e) {
    error.value = (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  }
}

async function forgetDevice() {
  if (!device.value) return;
  if (
    !confirm(
      `Forget "${device.value.nickname}"? Profiles referencing it will show as unknown until you re-register.`,
    )
  )
    return;
  try {
    await $fetch(`/api/devices/${id.value}`, { method: "DELETE" });
    router.push("/devices");
  } catch (e) {
    error.value = (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  }
}

function openActivityEditor() {
  if (!device.value?.mounted) return;
  editing.value = true;
  editError.value = null;
}

function cancelActivityEdit() {
  editing.value = false;
  editError.value = null;
}

async function applyActivityDir(value: string | null) {
  editBusy.value = true;
  editError.value = null;
  try {
    await $fetch(`/api/devices/${id.value}`, {
      method: "PATCH",
      body: { retroarchActivityDir: value },
    });
    editing.value = false;
    await refresh();
  } catch (e) {
    editError.value = (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  } finally {
    editBusy.value = false;
  }
}

async function runScan() {
  if (!device.value) return;
  scanning.value = true;
  try {
    const res = await $fetch<{ results: ScanResultRow[] }>("/api/activity/scan", {
      method: "POST",
      body: { cacheKey: device.value.activityCacheKey },
    });
    scanResult.value = res.results[0] ?? null;
  } catch (e) {
    scanResult.value = {
      cacheKey: device.value.activityCacheKey,
      sourceLabel: device.value.nickname,
      error: (e as { statusMessage?: string }).statusMessage ?? (e as Error).message,
    };
  } finally {
    scanning.value = false;
  }
}

function openRomsEditor() {
  if (!device.value?.mounted) return;
  editingRoms.value = true;
  romsError.value = null;
}

function cancelRomsEdit() {
  editingRoms.value = false;
  romsError.value = null;
}

async function applyRomsDir(value: string | null) {
  romsBusy.value = true;
  romsError.value = null;
  try {
    await $fetch(`/api/devices/${id.value}`, {
      method: "PATCH",
      body: { romsRootRelPath: value },
    });
    editingRoms.value = false;
    await refresh();
  } catch (e) {
    romsError.value = (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  } finally {
    romsBusy.value = false;
  }
}

const launcherOptions = [
  { value: "", label: "None (don't write names)" },
  { value: "es-de", label: "ES-DE (gamelist.xml)" },
  { value: "muos", label: "muOS (names coming soon)" },
];
const launcherBusy = ref(false);

async function applyLauncher(value: string) {
  romsError.value = null;
  launcherBusy.value = true;
  try {
    await $fetch(`/api/devices/${id.value}`, {
      method: "PATCH",
      body: { launcherKind: value || null },
    });
    await refresh();
  } catch (e) {
    romsError.value = (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  } finally {
    launcherBusy.value = false;
  }
}

// ES-DE keeps its data in its own folder, separate from the ROMs. The user
// points us at <mount>/ES-DE; gamelists and downloaded_media live under it, so
// name writes and art land where ES-DE reads them.
const editingEsDeRoot = ref(false);
const esDeRootBusy = ref(false);

function openEsDeRootEditor() {
  if (!device.value?.mounted) return;
  editingEsDeRoot.value = true;
  romsError.value = null;
}

async function applyEsDeRoot(value: string | null) {
  esDeRootBusy.value = true;
  romsError.value = null;
  try {
    await $fetch(`/api/devices/${id.value}`, {
      method: "PATCH",
      body: { esDeRootRelPath: value },
    });
    editingEsDeRoot.value = false;
    await refresh();
  } catch (e) {
    romsError.value = (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  } finally {
    esDeRootBusy.value = false;
  }
}

// Launcher metadata actions for this device. Names push clean display names
// into the launcher; art import pulls the launcher's scraped box art into the
// server cache so it shows app-wide.
const syncingNames = ref(false);
const harvestingArt = ref(false);
const launcherNote = ref<string | null>(null);

async function syncNames() {
  if (!device.value) return;
  syncingNames.value = true;
  romsError.value = null;
  launcherNote.value = null;
  try {
    const res = await $fetch<{ entryCount: number; results: { written: number }[] }>(
      "/api/roms/metadata/sync",
      { method: "POST", body: { destCacheKey: device.value.romsCacheKey } },
    );
    const written = res.results.reduce((s, r) => s + r.written, 0);
    launcherNote.value =
      res.entryCount === 0
        ? "No games installed on this device yet."
        : `Wrote ${written} name${written === 1 ? "" : "s"} to the launcher.`;
  } catch (e) {
    romsError.value = (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  } finally {
    syncingNames.value = false;
  }
}

// muOS data folder (the MUOS/ dir). muOS reads names + art from under info/.
const editingMuosRoot = ref(false);
const muosRootBusy = ref(false);

function openMuosRootEditor() {
  if (!device.value?.mounted) return;
  editingMuosRoot.value = true;
  romsError.value = null;
}

async function applyMuosRoot(value: string | null) {
  muosRootBusy.value = true;
  romsError.value = null;
  try {
    await $fetch(`/api/devices/${id.value}`, {
      method: "PATCH",
      body: { muosRootRelPath: value },
    });
    editingMuosRoot.value = false;
    await refresh();
  } catch (e) {
    romsError.value = (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  } finally {
    muosRootBusy.value = false;
  }
}

// Per-device art downscale cap (blank = full size).
const artMaxEdgeDraft = ref<string>("");
const artSizeBusy = ref(false);
watch(
  () => device.value?.artMaxEdgePx,
  (v) => {
    artMaxEdgeDraft.value = v ? String(v) : "";
  },
  { immediate: true },
);

async function applyArtMaxEdge() {
  artSizeBusy.value = true;
  romsError.value = null;
  try {
    const n = parseInt(artMaxEdgeDraft.value, 10);
    await $fetch(`/api/devices/${id.value}`, {
      method: "PATCH",
      body: { artMaxEdgePx: Number.isFinite(n) && n > 0 ? n : null },
    });
    await refresh();
  } catch (e) {
    romsError.value = (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  } finally {
    artSizeBusy.value = false;
  }
}

async function harvestArt() {
  if (!device.value) return;
  harvestingArt.value = true;
  romsError.value = null;
  launcherNote.value = null;
  try {
    const res = await $fetch<{
      imported: number;
      skippedExisting: number;
      unmatched: number;
      reason?: string;
    }>("/api/roms/art/harvest", {
      method: "POST",
      body: { destCacheKey: device.value.romsCacheKey },
    });
    launcherNote.value = res.reason
      ? res.reason
      : `Imported ${res.imported} cover${res.imported === 1 ? "" : "s"} ` +
        `(${res.skippedExisting} already had art, ${res.unmatched} unmatched).`;
  } catch (e) {
    romsError.value = (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  } finally {
    harvestingArt.value = false;
  }
}

async function runRomsScan() {
  if (!device.value) return;
  romsScanning.value = true;
  try {
    const res = await $fetch<{ results: ScanResultRow[] }>("/api/roms/scan", {
      method: "POST",
      body: { cacheKey: device.value.romsCacheKey },
    });
    romsScanResult.value = res.results[0] ?? null;
  } catch (e) {
    romsScanResult.value = {
      cacheKey: device.value.romsCacheKey,
      sourceLabel: device.value.nickname,
      error: (e as { statusMessage?: string }).statusMessage ?? (e as Error).message,
    };
  } finally {
    romsScanning.value = false;
  }
}

</script>

<template>
  <div class="flex flex-col gap-4">
    <div v-if="loading" class="flex items-center justify-center gap-3 py-8 text-fg-dim">
      <Spinner /> <span>Loading device…</span>
    </div>
    <p v-else-if="error" class="text-danger">{{ error }}</p>

    <template v-else-if="device">
      <header class="flex flex-col gap-1">
        <div class="flex items-center justify-between gap-2">
          <h1 class="truncate text-xl font-bold">{{ device.nickname }}</h1>
          <span
            class="pill"
            :class="
              device.mounted
                ? 'bg-[color-mix(in_oklab,var(--color-ok)_25%,transparent)] text-ok'
                : 'bg-surface-2 text-fg-dim'
            "
            >{{ device.mounted ? "mounted" : "absent" }}</span
          >
        </div>
        <p class="truncate text-xs text-fg-dim">
          id={{ device.id.slice(0, 8) }}… · last seen
          {{ device.lastMountPath ?? "?" }}
          <span v-if="device.mounted && device.currentMountPath">
            · now at <span class="font-mono">{{ device.currentMountPath }}</span>
          </span>
        </p>
        <div class="pt-2">
          <button class="btn-ghost text-sm" @click="renameDevice">Rename</button>
        </div>
      </header>

      <section class="card flex flex-col gap-2">
        <div class="flex items-center justify-between gap-2">
          <h2 class="font-semibold">RetroArch activity</h2>
          <span
            v-if="device.retroarchActivityDir"
            class="pill bg-[color-mix(in_oklab,var(--color-ok)_25%,transparent)] text-ok"
            >configured</span
          >
          <span v-else class="pill bg-surface-2 text-fg-dim">not set</span>
        </div>
        <p class="break-all text-sm text-fg-dim">
          {{
            device.retroarchActivityDir
              ? `/${device.retroarchActivityDir}`
              : "Browse to your RetroArch playlists/logs folder to enable activity tracking."
          }}
        </p>

        <div v-if="editing" class="flex flex-col gap-2">
          <p v-if="editError" class="text-danger text-sm">{{ editError }}</p>
          <FolderPicker
            v-if="device.currentMountPath"
            :mount-path="device.currentMountPath"
            :initial-rel-path="device.retroarchActivityDir"
            commit-label="Use this folder"
            @select="applyActivityDir($event)"
            @cancel="cancelActivityEdit"
          />
        </div>

        <p
          v-if="scanResult"
          class="text-xs"
          :class="
            scanResult.error || scanResult.skippedReason ? 'text-warn' : 'text-ok'
          "
        >
          <template v-if="scanResult.error">Scan error: {{ scanResult.error }}</template>
          <template v-else-if="scanResult.skippedReason">
            Skipped: {{ scanResult.skippedReason }}
          </template>
          <template v-else-if="scanResult.summary">
            Scanned {{ scanResult.summary.totalEntries }} games
            ({{ scanResult.summary.parsed }} new/changed)
          </template>
        </p>

        <div v-if="!editing" class="flex flex-wrap gap-2 pt-1">
          <button
            class="btn-secondary text-sm"
            :disabled="!device.mounted"
            :title="device.mounted ? '' : 'Mount this device to browse'"
            @click="openActivityEditor"
          >
            {{ device.retroarchActivityDir ? "Change folder" : "Set activity folder" }}
          </button>
          <button
            v-if="device.retroarchActivityDir"
            class="btn-ghost text-sm"
            :disabled="!device.mounted || scanning"
            :title="device.mounted ? '' : 'Mount this device to scan'"
            @click="runScan"
          >
            <Spinner v-if="scanning" size="sm" />
            <span>{{ scanning ? "Scanning…" : "Scan activity" }}</span>
          </button>
          <button
            v-if="device.retroarchActivityDir"
            class="btn-ghost text-sm"
            :disabled="editBusy"
            @click="applyActivityDir(null)"
          >
            Clear
          </button>
        </div>
      </section>

      <section class="card flex flex-col gap-2">
        <div class="flex items-center justify-between gap-2">
          <h2 class="font-semibold">ROM library</h2>
          <span
            v-if="device.romsRootRelPath"
            class="pill bg-[color-mix(in_oklab,var(--color-ok)_25%,transparent)] text-ok"
            >configured</span
          >
          <span v-else class="pill bg-surface-2 text-fg-dim">not set</span>
        </div>
        <p class="break-all text-sm text-fg-dim">
          {{
            device.romsRootRelPath
              ? `/${device.romsRootRelPath}`
              : "Browse to the folder whose subfolders are per-system ROM folders (gba, snes, …)."
          }}
        </p>

        <div v-if="editingRoms" class="flex flex-col gap-2">
          <p v-if="romsError" class="text-danger text-sm">{{ romsError }}</p>
          <FolderPicker
            v-if="device.currentMountPath"
            :mount-path="device.currentMountPath"
            :initial-rel-path="device.romsRootRelPath"
            commit-label="Use this folder"
            @select="applyRomsDir($event)"
            @cancel="cancelRomsEdit"
          />
        </div>

        <p v-if="device.romsRootRelPath && !editingRoms" class="text-xs text-fg-dim">
          Choose which device is your library on the
          <NuxtLink to="/roms" class="underline hover:text-fg">ROM library</NuxtLink>
          page.
        </p>

        <div v-if="device.romsRootRelPath && !editingRoms" class="flex flex-col gap-1 pt-1">
          <span class="label">Launcher on this device</span>
          <AppSelect
            :model-value="device.launcherKind ?? ''"
            :options="launcherOptions"
            :disabled="launcherBusy"
            aria-label="Launcher"
            @update:model-value="applyLauncher"
          />
          <p class="text-xs text-fg-dim">
            Sets which metadata file gets clean game names when you transfer ROMs here.
          </p>
        </div>

        <div
          v-if="device.romsRootRelPath && !editingRoms && device.launcherKind === 'es-de'"
          class="flex flex-col gap-2 rounded-xl bg-surface-2 p-3"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="label">ES-DE folder</span>
            <span
              v-if="device.esDeRootRelPath"
              class="pill bg-[color-mix(in_oklab,var(--color-ok)_25%,transparent)] text-ok"
              >set</span
            >
            <span v-else class="pill bg-surface-1 text-fg-dim">not set</span>
          </div>
          <p class="break-all text-sm text-fg-dim">
            {{
              device.esDeRootRelPath
                ? `/${device.esDeRootRelPath}`
                : "Point to ES-DE's data folder (usually ES-DE at the SD root). Gamelists and scraped art live under it, so we can write clean names and sync box art."
            }}
          </p>

          <div v-if="editingEsDeRoot" class="flex flex-col gap-2">
            <FolderPicker
              v-if="device.currentMountPath"
              :mount-path="device.currentMountPath"
              :initial-rel-path="device.esDeRootRelPath"
              commit-label="Use this folder"
              @select="applyEsDeRoot($event)"
              @cancel="editingEsDeRoot = false"
            />
          </div>

          <div v-if="!editingEsDeRoot" class="flex flex-wrap gap-2">
            <button
              class="btn-secondary text-sm"
              :disabled="!device.mounted || esDeRootBusy"
              :title="device.mounted ? '' : 'Mount this device to browse'"
              @click="openEsDeRootEditor"
            >
              {{ device.esDeRootRelPath ? "Change folder" : "Set ES-DE folder" }}
            </button>
            <button
              v-if="device.esDeRootRelPath"
              class="btn-ghost text-sm"
              :disabled="esDeRootBusy"
              @click="applyEsDeRoot(null)"
            >
              Clear
            </button>
          </div>

          <div
            v-if="device.esDeRootRelPath && !editingEsDeRoot"
            class="flex flex-col gap-2 border-t border-border pt-2"
          >
            <span class="label">Names &amp; art</span>
            <div class="flex flex-wrap gap-2">
              <button
                class="btn-secondary text-sm"
                :disabled="!device.mounted || syncingNames || harvestingArt"
                :title="device.mounted ? '' : 'Mount this device first'"
                @click="syncNames"
              >
                <Spinner v-if="syncingNames" size="sm" />
                <span>{{ syncingNames ? "Syncing…" : "Sync names to launcher" }}</span>
              </button>
              <button
                class="btn-secondary text-sm"
                :disabled="!device.mounted || harvestingArt || syncingNames"
                :title="device.mounted ? '' : 'Mount this device first'"
                @click="harvestArt"
              >
                <Spinner v-if="harvestingArt" size="sm" />
                <span>{{ harvestingArt ? "Importing…" : "Import art to app" }}</span>
              </button>
            </div>
            <p class="text-xs text-fg-dim">
              <span class="font-medium text-fg">Sync names</span> writes clean display names
              for games installed here.
              <span class="font-medium text-fg">Import art</span> pulls ES-DE's scraped box art
              into the app so it shows in activity and the library.
            </p>

            <div class="flex flex-col gap-1 pt-1">
              <span class="label">Push art max size (px)</span>
              <div class="flex gap-2">
                <input
                  v-model="artMaxEdgeDraft"
                  class="input flex-1"
                  inputmode="numeric"
                  placeholder="Blank = full size"
                />
                <button
                  class="btn-secondary text-sm"
                  :disabled="artSizeBusy"
                  @click="applyArtMaxEdge"
                >
                  Save
                </button>
              </div>
              <span class="text-xs text-fg-dim">
                Box art pushed to this device is downscaled to this longest edge —
                set it for small screens that don't resize art themselves.
              </span>
            </div>

            <p v-if="launcherNote" class="text-xs text-ok">{{ launcherNote }}</p>
          </div>

          <details class="text-xs text-fg-dim">
            <summary class="cursor-pointer select-none font-medium text-fg">
              ES-DE on Android: how to get gamelists onto the SD card
            </summary>
            <ol class="mt-2 flex list-decimal flex-col gap-1 pl-4">
              <li>Close ES-DE fully.</li>
              <li>
                Copy the existing <span class="font-mono">ES-DE</span> folder from internal
                storage to the <span class="font-semibold text-fg">root of the SD card</span>
                (keeps your scraped names &amp; art).
              </li>
              <li>
                Re-trigger ES-DE's first-run setup: revoke its storage permission in Android
                Settings → Apps → ES-DE (or rename the internal <span class="font-mono">ES-DE</span>
                folder). Don't use “Clear storage” — that wipes themes.
              </li>
              <li>
                Relaunch ES-DE. When asked for the
                <span class="font-semibold text-fg">application data directory</span>, browse to
                the SD card and pick its <span class="font-mono">ES-DE</span> folder. Point the
                ROM directory at your existing SD ROMs folder.
              </li>
              <li>
                Finish setup, then set the folder above to the
                <span class="font-mono">ES-DE</span> folder on the SD.
              </li>
            </ol>
          </details>
        </div>

        <div
          v-if="device.romsRootRelPath && !editingRoms && device.launcherKind === 'muos'"
          class="flex flex-col gap-2 rounded-xl bg-surface-2 p-3"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="label">muOS folder</span>
            <span
              v-if="device.muosRootRelPath"
              class="pill bg-[color-mix(in_oklab,var(--color-ok)_25%,transparent)] text-ok"
              >set</span
            >
            <span v-else class="pill bg-surface-1 text-fg-dim">not set</span>
          </div>
          <p class="break-all text-sm text-fg-dim">
            {{
              device.muosRootRelPath
                ? `/${device.muosRootRelPath}`
                : "Point to the MUOS folder on the SD (the one containing info/). muOS reads clean game names from info/name/global.json."
            }}
          </p>

          <div v-if="editingMuosRoot" class="flex flex-col gap-2">
            <FolderPicker
              v-if="device.currentMountPath"
              :mount-path="device.currentMountPath"
              :initial-rel-path="device.muosRootRelPath"
              commit-label="Use this folder"
              @select="applyMuosRoot($event)"
              @cancel="editingMuosRoot = false"
            />
          </div>

          <div v-if="!editingMuosRoot" class="flex flex-wrap gap-2">
            <button
              class="btn-secondary text-sm"
              :disabled="!device.mounted || muosRootBusy"
              :title="device.mounted ? '' : 'Mount this device to browse'"
              @click="openMuosRootEditor"
            >
              {{ device.muosRootRelPath ? "Change folder" : "Set muOS folder" }}
            </button>
            <button
              v-if="device.muosRootRelPath"
              class="btn-ghost text-sm"
              :disabled="muosRootBusy"
              @click="applyMuosRoot(null)"
            >
              Clear
            </button>
          </div>

          <div
            v-if="device.muosRootRelPath && !editingMuosRoot"
            class="flex flex-col gap-2 border-t border-border pt-2"
          >
            <span class="label">Names &amp; art</span>
            <div class="flex flex-wrap gap-2">
              <button
                class="btn-secondary text-sm"
                :disabled="!device.mounted || syncingNames || harvestingArt"
                :title="device.mounted ? '' : 'Mount this device first'"
                @click="syncNames"
              >
                <Spinner v-if="syncingNames" size="sm" />
                <span>{{ syncingNames ? "Syncing…" : "Sync names to launcher" }}</span>
              </button>
              <button
                class="btn-secondary text-sm"
                :disabled="!device.mounted || harvestingArt || syncingNames"
                :title="device.mounted ? '' : 'Mount this device first'"
                @click="harvestArt"
              >
                <Spinner v-if="harvestingArt" size="sm" />
                <span>{{ harvestingArt ? "Importing…" : "Import art to app" }}</span>
              </button>
            </div>
            <p class="text-xs text-fg-dim">
              <span class="font-medium text-fg">Sync names</span> writes clean display
              names into <span class="font-mono">info/name/global.json</span>.
              <span class="font-medium text-fg">Import art</span> pulls muOS box art into
              the app. Push art to this device from the Transfer page's Art tab.
            </p>

            <div class="flex flex-col gap-1 pt-1">
              <span class="label">Push art max size (px)</span>
              <div class="flex gap-2">
                <input
                  v-model="artMaxEdgeDraft"
                  class="input flex-1"
                  inputmode="numeric"
                  placeholder="Blank = full size"
                />
                <button
                  class="btn-secondary text-sm"
                  :disabled="artSizeBusy"
                  @click="applyArtMaxEdge"
                >
                  Save
                </button>
              </div>
            </div>

            <p v-if="launcherNote" class="text-xs text-ok">{{ launcherNote }}</p>
          </div>
        </div>

        <p
          v-if="romsScanResult"
          class="text-xs"
          :class="romsScanResult.error || romsScanResult.skippedReason ? 'text-warn' : 'text-ok'"
        >
          <template v-if="romsScanResult.error">Scan error: {{ romsScanResult.error }}</template>
          <template v-else-if="romsScanResult.skippedReason">
            Skipped: {{ romsScanResult.skippedReason }}
          </template>
          <template v-else-if="romsScanResult.summary">
            Scanned {{ romsScanResult.summary.totalFiles }} ROM files
            ({{ romsScanResult.summary.parsed }} new/changed)
          </template>
        </p>

        <div v-if="!editingRoms" class="flex flex-wrap gap-2 pt-1">
          <button
            class="btn-secondary text-sm"
            :disabled="!device.mounted"
            :title="device.mounted ? '' : 'Mount this device to browse'"
            @click="openRomsEditor"
          >
            {{ device.romsRootRelPath ? "Change folder" : "Set library folder" }}
          </button>
          <button
            v-if="device.romsRootRelPath"
            class="btn-ghost text-sm"
            :disabled="!device.mounted || romsScanning"
            :title="device.mounted ? '' : 'Mount this device to scan'"
            @click="runRomsScan"
          >
            <Spinner v-if="romsScanning" size="sm" />
            <span>{{ romsScanning ? "Scanning…" : "Scan ROMs" }}</span>
          </button>
          <NuxtLink v-if="device.romsRootRelPath" to="/roms" class="btn-ghost text-sm">
            View library
          </NuxtLink>
          <button
            v-if="device.romsRootRelPath"
            class="btn-ghost text-sm"
            :disabled="romsBusy"
            @click="applyRomsDir(null)"
          >
            Clear
          </button>
        </div>
      </section>

      <section class="flex flex-col gap-2">
        <h2 class="font-semibold">Save slots on this device</h2>
        <ul v-if="slots.length > 0" class="flex flex-col gap-2">
          <li v-for="s in slots" :key="`${s.profileName}-${s.slotId}`">
            <NuxtLink
              :to="`/profiles/${encodeURIComponent(s.profileName)}`"
              class="row-button"
            >
              <div class="flex min-w-0 flex-1 flex-col">
                <span class="truncate font-semibold">{{ s.profileName }}</span>
                <span class="truncate text-xs text-fg-dim">
                  {{ s.isDirectory ? "📂 " : "" }}/{{ s.fileRelPath }}
                </span>
              </div>
              <span aria-hidden="true" class="text-fg-dim">›</span>
            </NuxtLink>
          </li>
        </ul>
        <p v-else class="card text-center text-sm text-fg-dim">
          No save slots use this device yet.
        </p>
        <NuxtLink to="/profiles/new" class="btn-secondary self-start text-sm">
          + Add to a new profile
        </NuxtLink>
      </section>

      <section class="card flex flex-col gap-2">
        <h2 class="font-semibold text-danger">Danger zone</h2>
        <p class="text-xs text-fg-dim">
          Forgetting removes this device from the app. The marker file on the device
          is left in place so you can re-register later by mounting it.
        </p>
        <button class="btn-ghost self-start text-sm text-danger" @click="forgetDevice">
          Forget this device
        </button>
      </section>
    </template>
  </div>
</template>
