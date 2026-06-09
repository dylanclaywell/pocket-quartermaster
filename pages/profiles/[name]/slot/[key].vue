<script setup lang="ts">
import { formatBytes } from "~/composables/useFormat";

const route = useRoute();
const router = useRouter();
const rawName = computed(() => decodeURIComponent(route.params.name as string));
const encName = computed(() => encodeURIComponent(rawName.value));
const slotIdParam = computed(() => route.params.key as string);
const isNewSlot = computed(() => slotIdParam.value === "new");
const pageTitle = computed(() => (isNewSlot.value ? "Add device slot" : "Replace device slot"));

const SAVE_EXTENSIONS = [
  ".srm", ".sav", ".sa1", ".sa2", ".sa3", ".sa4", ".state", ".st0", ".st1", ".st2",
  ".st3", ".st4", ".st5", ".st6", ".st7", ".st8", ".st9", ".dsv", ".eep", ".fla",
  ".mcr", ".mcd", ".gci", ".dat",
];

interface KnownDevice {
  id: string;
  nickname: string;
  lastMountPath?: string;
  mounted: boolean;
  currentMountPath?: string;
}
interface BrowseEntry {
  name: string;
  relPath: string;
  isDirectory: boolean;
  sizeBytes?: number;
  mtimeMs?: number;
}
interface BrowseResult {
  mountPath: string;
  relPath: string;
  breadcrumbs: { name: string; relPath: string }[];
  entries: BrowseEntry[];
}

type Step = "device" | "browse" | "save";
const step = ref<Step>("device");
const error = ref<string | null>(null);
const busy = ref(true);

const devices = ref<KnownDevice[]>([]);
const selectedDevice = ref<KnownDevice | null>(null);

const browse = ref<BrowseResult | null>(null);
const onlySaveExts = ref(true);
const selectedFile = ref<BrowseEntry | null>(null);
/** Set when the user chose "use this folder" instead of picking a file. */
const selectedFolder = ref<{ name: string; relPath: string } | null>(null);

async function loadDevices() {
  busy.value = true;
  error.value = null;
  try {
    const res = await $fetch<{ devices: KnownDevice[] }>("/api/devices/known");
    devices.value = res.devices;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

onMounted(loadDevices);

async function pickDevice(d: KnownDevice) {
  if (!d.mounted || !d.currentMountPath) {
    // Disabled in template — guard anyway.
    return;
  }
  error.value = null;
  selectedDevice.value = d;
  await openBrowse(d.currentMountPath, "");
}

async function openBrowse(mountPath: string, path: string) {
  busy.value = true;
  error.value = null;
  step.value = "browse";
  try {
    browse.value = await $fetch<BrowseResult>("/api/browse", {
      params: { mount: mountPath, path },
    });
  } catch (e) {
    error.value = (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  } finally {
    busy.value = false;
  }
}

function isSelectable(e: BrowseEntry): boolean {
  if (e.isDirectory) return true;
  if (!onlySaveExts.value) return true;
  return SAVE_EXTENSIONS.some((ext) => e.name.toLowerCase().endsWith(ext));
}

async function entryTapped(e: BrowseEntry) {
  if (e.isDirectory) {
    if (!selectedDevice.value?.currentMountPath) return;
    await openBrowse(selectedDevice.value.currentMountPath, e.relPath);
    return;
  }
  if (!isSelectable(e)) return;
  selectedFile.value = e;
  selectedFolder.value = null;
  step.value = "save";
}

function useCurrentFolder() {
  if (!browse.value) return;
  const rel = browse.value.relPath;
  const name = rel ? rel.split("/").filter(Boolean).pop() ?? rel : "(device root)";
  selectedFolder.value = { name, relPath: rel };
  selectedFile.value = null;
  step.value = "save";
}

async function saveSlot() {
  if (!selectedDevice.value) return;
  const isDirectory = selectedFolder.value !== null;
  const fileRelPath = isDirectory
    ? selectedFolder.value!.relPath
    : selectedFile.value?.relPath;
  if (fileRelPath === undefined) return;
  busy.value = true;
  error.value = null;
  try {
    await $fetch(`/api/profiles/${encName.value}/slot`, {
      method: "POST",
      body: {
        ...(isNewSlot.value ? {} : { slotId: slotIdParam.value }),
        deviceId: selectedDevice.value.id,
        fileRelPath,
        ...(isDirectory ? { isDirectory: true } : {}),
      },
    });
    router.push(`/profiles/${encName.value}`);
  } catch (e) {
    error.value = (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <header>
      <p class="text-xs uppercase tracking-wide text-fg-dim">{{ rawName }}</p>
      <h1 class="text-xl font-bold">{{ pageTitle }}</h1>
    </header>

    <p v-if="error" class="text-danger">{{ error }}</p>

    <!-- Step 1: pick a registered device -->
    <section v-if="step === 'device'" class="flex flex-col gap-3">
      <p class="text-sm text-fg-dim">
        Pick a registered device for this slot. To add a new device, head to
        <NuxtLink to="/devices" class="text-accent underline">Devices</NuxtLink>
        and register it first.
      </p>
      <div class="flex items-center justify-between">
        <p class="font-semibold">Devices</p>
        <button class="btn-ghost text-sm" :disabled="busy" @click="loadDevices">
          <Spinner v-if="busy" size="sm" />
          <span>{{ busy ? "Loading…" : "Refresh" }}</span>
        </button>
      </div>
      <div
        v-if="busy && devices.length === 0"
        class="flex items-center justify-center gap-3 py-6 text-fg-dim"
      >
        <Spinner /> <span>Loading devices…</span>
      </div>
      <ul v-else class="flex flex-col gap-2">
        <li v-for="d in devices" :key="d.id">
          <button
            class="row-button"
            :class="!d.mounted ? 'opacity-60' : ''"
            :disabled="!d.mounted"
            :title="d.mounted ? '' : 'Mount this device to use it for this slot'"
            @click="pickDevice(d)"
          >
            <div class="flex min-w-0 flex-1 flex-col">
              <span class="truncate font-semibold">{{ d.nickname }}</span>
              <span class="truncate text-xs text-fg-dim">
                <span v-if="d.mounted && d.currentMountPath">
                  at {{ d.currentMountPath }}
                </span>
                <span v-else>last seen {{ d.lastMountPath ?? "?" }}</span>
              </span>
            </div>
            <span
              class="pill"
              :class="
                d.mounted
                  ? 'bg-[color-mix(in_oklab,var(--color-ok)_25%,transparent)] text-ok'
                  : 'bg-surface-2 text-fg-dim'
              "
              >{{ d.mounted ? "mounted" : "mount to use" }}</span
            >
          </button>
        </li>
        <li v-if="devices.length === 0 && !busy" class="card text-center text-fg-dim">
          No devices yet.
          <NuxtLink to="/devices" class="text-accent underline">
            Register one in Devices
          </NuxtLink>
          to continue.
        </li>
      </ul>
    </section>

    <!-- Step 2: browse for file -->
    <section v-else-if="step === 'browse'" class="flex flex-col gap-3">
      <div class="card flex flex-col gap-1">
        <p class="text-xs uppercase tracking-wide text-fg-dim">Device</p>
        <p class="font-semibold">{{ selectedDevice?.nickname }}</p>
        <p class="text-xs text-fg-dim">{{ selectedDevice?.currentMountPath }}</p>
      </div>

      <label class="flex items-center gap-2 text-sm">
        <input v-model="onlySaveExts" type="checkbox" class="size-5 accent-accent" />
        Only show save-file extensions
      </label>

      <nav class="flex flex-wrap items-center gap-1 text-sm">
        <template v-for="(bc, i) in browse?.breadcrumbs ?? []" :key="bc.relPath">
          <button
            class="btn-ghost px-2 py-1 text-sm"
            :class="i === (browse?.breadcrumbs.length ?? 1) - 1 ? 'font-bold text-fg' : ''"
            @click="openBrowse(selectedDevice!.currentMountPath!, bc.relPath)"
          >
            {{ bc.name }}
          </button>
          <span v-if="i < (browse?.breadcrumbs.length ?? 1) - 1" class="text-fg-dim">/</span>
        </template>
      </nav>

      <button
        class="card flex w-full items-center justify-between gap-3 text-left transition active:scale-[0.99] hover:bg-surface-2"
        @click="useCurrentFolder"
      >
        <div class="flex min-w-0 flex-col">
          <span class="font-semibold">Use this folder as the slot target</span>
          <span class="text-xs text-fg-dim">
            The filename will be filled in from the other side at transfer time.
            Useful when this device doesn't have the save yet.
          </span>
        </div>
        <span aria-hidden="true" class="text-2xl">📂</span>
      </button>

      <div v-if="busy" class="flex items-center justify-center gap-3 py-6 text-fg-dim">
        <Spinner /> <span>Loading directory…</span>
      </div>
      <ul v-else class="flex flex-col gap-1.5">
        <li v-for="e in browse?.entries ?? []" :key="e.relPath">
          <button
            class="row-button"
            :class="!isSelectable(e) ? 'opacity-50' : ''"
            :disabled="!isSelectable(e)"
            @click="entryTapped(e)"
          >
            <div class="flex min-w-0 flex-1 items-center gap-3">
              <span aria-hidden="true" class="text-lg">
                {{ e.isDirectory ? "📁" : "📄" }}
              </span>
              <div class="min-w-0">
                <p class="truncate">{{ e.name }}{{ e.isDirectory ? "/" : "" }}</p>
                <p v-if="!e.isDirectory" class="text-xs text-fg-dim">
                  {{ formatBytes(e.sizeBytes) }}
                </p>
              </div>
            </div>
          </button>
        </li>
        <li v-if="(browse?.entries.length ?? 0) === 0 && !busy" class="card text-center text-fg-dim">
          Empty directory.
        </li>
      </ul>

      <button class="btn-ghost self-start text-sm" @click="step = 'device'">
        Change device
      </button>
    </section>

    <!-- Step 3: confirm -->
    <section v-else-if="step === 'save'" class="flex flex-col gap-3">
      <div class="card flex flex-col gap-2">
        <p class="text-xs uppercase tracking-wide text-fg-dim">{{ pageTitle }}</p>
        <p class="font-semibold">{{ selectedDevice?.nickname }}</p>

        <template v-if="selectedFolder">
          <p class="break-all text-sm text-fg-dim">
            📂 /{{ selectedFolder.relPath || "(device root)" }}/
          </p>
          <p class="text-xs text-warn">
            Folder target. The filename will be taken from the other slot when
            you transfer into this slot — nothing happens to the folder until
            then.
          </p>
        </template>
        <template v-else>
          <p class="break-all text-sm text-fg-dim">/{{ selectedFile?.relPath }}</p>
          <p class="text-xs text-fg-dim">
            {{ formatBytes(selectedFile?.sizeBytes) }}
          </p>
        </template>
      </div>
      <div class="flex gap-2">
        <button class="btn-primary flex-1" :disabled="busy" @click="saveSlot">
          <Spinner v-if="busy" size="sm" />
          <span>{{ busy ? "Saving…" : (isNewSlot ? "Add slot" : "Save changes") }}</span>
        </button>
        <button class="btn-secondary" @click="step = 'browse'">Back</button>
      </div>
    </section>
  </div>
</template>
