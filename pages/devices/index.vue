<script setup lang="ts">
import { formatBytes } from "~/composables/useFormat";

interface MountedDevice {
  mountPath: string;
  label?: string;
  driveType?: string;
  sizeBytes?: number;
  freeBytes?: number;
  virtual?: boolean;
  marker: { id: string; nickname: string; registeredAt?: string } | null;
  knownNickname?: string | null;
}
interface KnownDevice {
  id: string;
  nickname: string;
  lastMountPath?: string;
  registeredAt: string;
  mounted: boolean;
  currentMountPath?: string;
  ejectable?: boolean;
  retroarchActivityDir?: string;
  activityCacheKey: string;
}
interface VirtualMount {
  path: string;
  label?: string;
  addedAt: string;
  exists: boolean;
  isDirectory: boolean;
  retroarchActivityDir?: string;
  activityCacheKey: string;
  romsRootRelPath?: string;
  romsCacheKey: string;
}
interface ConfigInfo {
  configPath: string;
  configDir: string;
  backupDir: string;
  platform: string;
  isDev: boolean;
  virtualMountManagementEnabled: boolean;
}

const mounts = ref<MountedDevice[]>([]);
const known = ref<KnownDevice[]>([]);
const virtualMounts = ref<VirtualMount[]>([]);
const configInfo = ref<ConfigInfo | null>(null);
const busy = ref(true);
const error = ref<string | null>(null);

// Per-mount registration form state.
const registeringMount = ref<string | null>(null);
const nicknameDraft = ref("");
const registerBusy = ref(false);
const registerError = ref<string | null>(null);

// Virtual mount creation form state.
const showAdd = ref(false);
const newPath = ref("");
const newLabel = ref("");
const addBusy = ref(false);
const addError = ref<string | null>(null);

// Per-virtual-mount inline activity editor state. Real devices delegate this
// to /devices/[id]; virtual mounts stay inline since they're a testing surface.
const editingVmPath = ref<string | null>(null);
const vmActivityBusy = ref(false);
const vmActivityError = ref<string | null>(null);

// Per-virtual-mount inline ROM-library editor state, parallel to the activity one.
const editingVmRomsPath = ref<string | null>(null);
const vmRomsBusy = ref(false);
const vmRomsError = ref<string | null>(null);
const vmRomsScanningPath = ref<string | null>(null);
const vmRomsScanMsg = ref<string | null>(null);

async function refresh() {
  busy.value = true;
  error.value = null;
  try {
    const [a, b, c, d] = await Promise.all([
      $fetch<{ mounts: MountedDevice[] }>("/api/devices"),
      $fetch<{ devices: KnownDevice[] }>("/api/devices/known"),
      $fetch<{ virtualMounts: VirtualMount[] }>("/api/virtual-mounts"),
      $fetch<ConfigInfo>("/api/config-info"),
    ]);
    mounts.value = a.mounts;
    known.value = b.devices;
    virtualMounts.value = c.virtualMounts;
    configInfo.value = d;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

onMounted(refresh);

// Mounts that are physically present but have no Pocket Quartermaster marker —
// the user needs to register these before they can be used in profiles/activity.
const unregisteredMounts = computed(() =>
  mounts.value.filter((m) => !m.marker),
);

// Mounts that carry a marker file whose id isn't in the current config —
// orphaned after a config reset or a "forget". They can be reconnected
// (adopted) without losing their stable id.
const orphanedMounts = computed(() =>
  mounts.value.filter((m) => m.marker && !m.knownNickname),
);

const adoptingMount = ref<string | null>(null);

// Per-device eject state, keyed by device id.
const ejectingId = ref<string | null>(null);
const ejectNote = ref<string | null>(null);

async function ejectDevice(d: KnownDevice) {
  if (!d.ejectable || ejectingId.value) return;
  if (!confirm(`Eject "${d.nickname}"? Make sure no transfer is running.`)) return;
  ejectingId.value = d.id;
  error.value = null;
  ejectNote.value = null;
  try {
    const res = await $fetch<{ message: string }>(`/api/devices/${d.id}/eject`, {
      method: "POST",
    });
    ejectNote.value = `${d.nickname}: ${res.message}`;
    await refresh();
  } catch (e) {
    error.value = (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  } finally {
    ejectingId.value = null;
  }
}

async function reconnect(m: MountedDevice) {
  adoptingMount.value = m.mountPath;
  error.value = null;
  try {
    const res = await $fetch<{ device: { id: string } }>("/api/devices/adopt", {
      method: "POST",
      body: { mountPath: m.mountPath },
    });
    await navigateTo(`/devices/${res.device.id}`);
  } catch (e) {
    error.value = (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  } finally {
    adoptingMount.value = null;
  }
}

function openRegisterForm(m: MountedDevice) {
  registeringMount.value = m.mountPath;
  nicknameDraft.value = m.label || m.mountPath;
  registerError.value = null;
}

function cancelRegister() {
  registeringMount.value = null;
  nicknameDraft.value = "";
  registerError.value = null;
}

async function submitRegister(m: MountedDevice) {
  const nickname = nicknameDraft.value.trim();
  if (!nickname) {
    registerError.value = "Nickname required";
    return;
  }
  registerBusy.value = true;
  registerError.value = null;
  try {
    const res = await $fetch<{ device: { id: string } }>("/api/devices/register", {
      method: "POST",
      body: { mountPath: m.mountPath, nickname },
    });
    cancelRegister();
    await navigateTo(`/devices/${res.device.id}`);
  } catch (e) {
    registerError.value = (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  } finally {
    registerBusy.value = false;
  }
}

async function addVirtual() {
  if (!newPath.value.trim()) {
    addError.value = "Path is required";
    return;
  }
  addBusy.value = true;
  addError.value = null;
  try {
    await $fetch("/api/virtual-mounts", {
      method: "POST",
      body: { path: newPath.value.trim(), label: newLabel.value.trim() || undefined },
    });
    newPath.value = "";
    newLabel.value = "";
    showAdd.value = false;
    await refresh();
  } catch (e) {
    addError.value = (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  } finally {
    addBusy.value = false;
  }
}

async function removeVirtual(v: VirtualMount) {
  if (
    !confirm(
      `Remove virtual mount "${v.label ?? v.path}"? Marker files and folder contents are untouched.`,
    )
  )
    return;
  try {
    await $fetch("/api/virtual-mounts", { method: "DELETE", body: { path: v.path } });
    await refresh();
  } catch (e) {
    error.value = (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  }
}

function openVmEditor(v: VirtualMount) {
  editingVmPath.value = v.path;
  vmActivityError.value = null;
}

function cancelVmEdit() {
  editingVmPath.value = null;
  vmActivityError.value = null;
}

async function applyVmActivityDir(v: VirtualMount, value: string | null) {
  vmActivityBusy.value = true;
  vmActivityError.value = null;
  try {
    await $fetch(`/api/virtual-mounts`, {
      method: "PATCH",
      body: { path: v.path, retroarchActivityDir: value },
    });
    cancelVmEdit();
    await refresh();
  } catch (e) {
    vmActivityError.value =
      (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  } finally {
    vmActivityBusy.value = false;
  }
}

function openVmRomsEditor(v: VirtualMount) {
  editingVmRomsPath.value = v.path;
  vmRomsError.value = null;
}

function cancelVmRomsEdit() {
  editingVmRomsPath.value = null;
  vmRomsError.value = null;
}

async function applyVmRomsDir(v: VirtualMount, value: string | null) {
  vmRomsBusy.value = true;
  vmRomsError.value = null;
  try {
    await $fetch(`/api/virtual-mounts`, {
      method: "PATCH",
      body: { path: v.path, romsRootRelPath: value },
    });
    cancelVmRomsEdit();
    await refresh();
  } catch (e) {
    vmRomsError.value =
      (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  } finally {
    vmRomsBusy.value = false;
  }
}

async function scanVmRoms(v: VirtualMount) {
  vmRomsScanningPath.value = v.path;
  vmRomsScanMsg.value = null;
  try {
    const res = await $fetch<{
      results: { summary?: { totalFiles: number; parsed: number }; error?: string; skippedReason?: string }[];
    }>("/api/roms/scan", { method: "POST", body: { cacheKey: v.romsCacheKey } });
    const r = res.results[0];
    if (r?.error) vmRomsScanMsg.value = `Error: ${r.error}`;
    else if (r?.skippedReason) vmRomsScanMsg.value = `Skipped: ${r.skippedReason}`;
    else if (r?.summary) vmRomsScanMsg.value = `Scanned ${r.summary.totalFiles} ROM files (${r.summary.parsed} new/changed)`;
  } catch (e) {
    vmRomsScanMsg.value = (e as { statusMessage?: string }).statusMessage ?? (e as Error).message;
  } finally {
    vmRomsScanningPath.value = null;
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <header class="flex items-center justify-between">
      <h1 class="text-xl font-bold">Devices</h1>
      <button class="btn-ghost text-sm" :disabled="busy" @click="refresh">
        <Spinner v-if="busy" size="sm" />
        <span>{{ busy ? "Scanning…" : "Refresh" }}</span>
      </button>
    </header>

    <p v-if="error" class="text-danger">{{ error }}</p>

    <!-- Section: brand new mounts that need registering -->
    <section v-if="unregisteredMounts.length > 0" class="flex flex-col gap-2">
      <h2 class="font-semibold">New mounts</h2>
      <p class="text-xs text-fg-dim">
        Plugged-in volumes that aren't registered yet. Give one a nickname to start
        using it with Pocket Quartermaster.
      </p>
      <ul class="flex flex-col gap-2">
        <li
          v-for="m in unregisteredMounts"
          :key="m.mountPath"
          class="card flex flex-col gap-2"
        >
          <div class="flex items-center justify-between gap-2">
            <p class="truncate font-semibold">{{ m.label ?? m.mountPath }}</p>
            <span class="pill bg-surface-2 text-fg-dim">unregistered</span>
          </div>
          <p class="truncate text-xs text-fg-dim">
            {{ m.mountPath }} · {{ m.driveType ?? "?" }} ·
            {{ formatBytes(m.freeBytes) }} / {{ formatBytes(m.sizeBytes) }}
          </p>

          <div v-if="registeringMount === m.mountPath" class="flex flex-col gap-2">
            <label class="label" :for="`nick-${m.mountPath}`">Nickname</label>
            <input
              :id="`nick-${m.mountPath}`"
              v-model="nicknameDraft"
              class="input"
              autocapitalize="words"
              autocomplete="off"
              @keyup.enter="submitRegister(m)"
            />
            <p v-if="registerError" class="text-danger text-sm">{{ registerError }}</p>
            <div class="flex gap-2">
              <button
                class="btn-primary flex-1"
                :disabled="registerBusy"
                @click="submitRegister(m)"
              >
                <Spinner v-if="registerBusy" size="sm" />
                <span>{{ registerBusy ? "Registering…" : "Register" }}</span>
              </button>
              <button class="btn-secondary" @click="cancelRegister">Cancel</button>
            </div>
          </div>
          <div v-else class="flex gap-2">
            <button class="btn-primary text-sm" @click="openRegisterForm(m)">
              Register this device
            </button>
          </div>
        </li>
      </ul>
    </section>

    <!-- Section: mounts with an orphaned marker — present on disk but missing
         from config. Reconnect re-adopts them with their original id. -->
    <section v-if="orphanedMounts.length > 0" class="flex flex-col gap-2">
      <h2 class="font-semibold">Previously registered</h2>
      <p class="text-xs text-fg-dim">
        These mounts carry a Pocket Quartermaster marker but aren't in this
        computer's config — usually because they were registered on another
        computer. Reconnect to use them here with their original id.
      </p>
      <ul class="flex flex-col gap-2">
        <li v-for="m in orphanedMounts" :key="m.mountPath" class="card flex flex-col gap-2">
          <div class="flex items-center justify-between gap-2">
            <p class="truncate font-semibold">{{ m.marker?.nickname ?? m.label ?? m.mountPath }}</p>
            <span class="pill bg-[color-mix(in_oklab,var(--color-warn)_25%,transparent)] text-warn">
              not in config
            </span>
          </div>
          <p class="truncate text-xs text-fg-dim">
            {{ m.mountPath }} · {{ m.driveType ?? "?" }} ·
            {{ formatBytes(m.freeBytes) }} / {{ formatBytes(m.sizeBytes) }}
          </p>
          <button
            class="btn-primary self-start text-sm"
            :disabled="adoptingMount === m.mountPath"
            @click="reconnect(m)"
          >
            <Spinner v-if="adoptingMount === m.mountPath" size="sm" />
            <span>{{ adoptingMount === m.mountPath ? "Reconnecting…" : "Reconnect" }}</span>
          </button>
        </li>
      </ul>
    </section>

    <!-- Section: every registered device. Click row → device detail. -->
    <section class="flex flex-col gap-2">
      <h2 class="font-semibold">Registered devices</h2>
      <div v-if="busy && known.length === 0" class="flex items-center justify-center gap-3 py-6 text-fg-dim">
        <Spinner /> <span>Loading…</span>
      </div>
      <ul v-else class="flex flex-col gap-2">
        <li v-for="d in known" :key="d.id" class="flex items-stretch gap-2">
          <NuxtLink :to="`/devices/${d.id}`" class="row-button flex-1">
            <div class="flex min-w-0 flex-1 flex-col">
              <span class="truncate font-semibold">{{ d.nickname }}</span>
              <span class="truncate text-xs text-fg-dim">
                <span v-if="d.mounted && d.currentMountPath">
                  at {{ d.currentMountPath }}
                </span>
                <span v-else>last seen {{ d.lastMountPath ?? "?" }}</span>
                <span v-if="d.retroarchActivityDir"> · activity ✓</span>
              </span>
            </div>
            <span
              class="pill"
              :class="
                d.mounted
                  ? 'bg-[color-mix(in_oklab,var(--color-ok)_25%,transparent)] text-ok'
                  : 'bg-surface-2 text-fg-dim'
              "
              >{{ d.mounted ? "mounted" : "absent" }}</span
            >
            <span aria-hidden="true" class="text-fg-dim">›</span>
          </NuxtLink>
          <button
            v-if="d.ejectable"
            class="btn-secondary shrink-0 self-stretch text-sm"
            :disabled="ejectingId === d.id"
            :title="`Eject ${d.nickname}`"
            @click="ejectDevice(d)"
          >
            <Spinner v-if="ejectingId === d.id" size="sm" />
            <span>{{ ejectingId === d.id ? "Ejecting…" : "⏏ Eject" }}</span>
          </button>
        </li>
        <li v-if="known.length === 0 && !busy" class="card text-center text-fg-dim">
          No devices yet. Plug one in and register it above.
        </li>
      </ul>
      <p v-if="ejectNote" class="text-xs text-ok">{{ ejectNote }}</p>
    </section>

    <!-- Section: virtual mounts (folders treated as fake devices for testing) -->
    <section class="flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <h2 class="font-semibold">Virtual mounts</h2>
        <button
          v-if="configInfo?.virtualMountManagementEnabled"
          class="btn-ghost text-sm"
          @click="showAdd = !showAdd"
        >
          {{ showAdd ? "Cancel" : "+ Add" }}
        </button>
      </div>
      <p class="text-xs text-fg-dim">
        Folders treated as if they were mounted devices. Handy for testing without
        hardware.
        <span v-if="configInfo && !configInfo.virtualMountManagementEnabled">
          Adding new mounts is disabled in production — run in dev or set
          <span class="font-mono">PQM_ALLOW_VIRTUAL_MOUNTS=1</span> to enable.
        </span>
      </p>

      <form v-if="showAdd" class="card flex flex-col gap-3" @submit.prevent="addVirtual">
        <div>
          <label class="label" for="vm-path">Folder path</label>
          <input
            id="vm-path"
            v-model="newPath"
            class="input"
            placeholder="C:\temp\fake-sd-a"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
          />
        </div>
        <div>
          <label class="label" for="vm-label">Label (optional)</label>
          <input
            id="vm-label"
            v-model="newLabel"
            class="input"
            placeholder="Fake SD A"
            autocapitalize="words"
          />
        </div>
        <p v-if="addError" class="text-danger">{{ addError }}</p>
        <button type="submit" class="btn-primary" :disabled="addBusy">
          <Spinner v-if="addBusy" size="sm" />
          <span>{{ addBusy ? "Adding…" : "Add virtual mount" }}</span>
        </button>
      </form>

      <ul class="flex flex-col gap-2">
        <li v-for="v in virtualMounts" :key="v.path" class="card flex flex-col gap-2">
          <div class="flex items-center justify-between gap-2">
            <p class="truncate font-semibold">{{ v.label || v.path }}</p>
            <span
              class="pill"
              :class="
                v.exists && v.isDirectory
                  ? 'bg-[color-mix(in_oklab,var(--color-ok)_25%,transparent)] text-ok'
                  : 'bg-[color-mix(in_oklab,var(--color-danger)_25%,transparent)] text-danger'
              "
            >
              {{ v.exists ? (v.isDirectory ? "ok" : "not a dir") : "missing" }}
            </span>
          </div>
          <p class="break-all text-xs text-fg-dim">{{ v.path }}</p>
          <p class="break-all text-xs text-fg-dim">
            <span class="font-semibold text-fg">RetroArch activity:</span>
            {{ v.retroarchActivityDir ? `/${v.retroarchActivityDir}` : "not set" }}
          </p>
          <p class="break-all text-xs text-fg-dim">
            <span class="font-semibold text-fg">ROM library:</span>
            {{ v.romsRootRelPath ? `/${v.romsRootRelPath}` : "not set" }}
          </p>
          <p v-if="v.romsRootRelPath" class="text-xs text-fg-dim">
            Pick your library source on the
            <NuxtLink to="/roms" class="underline hover:text-fg">ROM library</NuxtLink> page.
          </p>

          <div v-if="editingVmPath === v.path" class="flex flex-col gap-2">
            <p v-if="vmActivityError" class="text-danger text-sm">{{ vmActivityError }}</p>
            <FolderPicker
              v-if="v.exists && v.isDirectory"
              :mount-path="v.path"
              :initial-rel-path="v.retroarchActivityDir"
              commit-label="Use this folder"
              @select="applyVmActivityDir(v, $event)"
              @cancel="cancelVmEdit"
            />
            <p v-else class="text-warn text-sm">
              Virtual mount path is missing — fix the folder before configuring.
            </p>
          </div>

          <div v-if="editingVmRomsPath === v.path" class="flex flex-col gap-2">
            <p v-if="vmRomsError" class="text-danger text-sm">{{ vmRomsError }}</p>
            <FolderPicker
              v-if="v.exists && v.isDirectory"
              :mount-path="v.path"
              :initial-rel-path="v.romsRootRelPath"
              commit-label="Use this folder"
              @select="applyVmRomsDir(v, $event)"
              @cancel="cancelVmRomsEdit"
            />
            <p v-else class="text-warn text-sm">
              Virtual mount path is missing — fix the folder before configuring.
            </p>
          </div>

          <p v-if="vmRomsScanMsg && editingVmRomsPath !== v.path" class="text-xs text-fg-dim">
            {{ vmRomsScanMsg }}
          </p>

          <div class="flex flex-wrap gap-2 pt-1">
            <button
              v-if="editingVmPath !== v.path"
              class="btn-secondary text-sm"
              :disabled="!v.exists || !v.isDirectory"
              @click="openVmEditor(v)"
            >
              {{ v.retroarchActivityDir ? "Change activity folder" : "Set activity folder" }}
            </button>
            <button
              v-if="v.retroarchActivityDir && editingVmPath !== v.path"
              class="btn-ghost text-sm"
              :disabled="vmActivityBusy"
              @click="applyVmActivityDir(v, null)"
            >
              Clear activity
            </button>
            <button
              v-if="editingVmRomsPath !== v.path"
              class="btn-secondary text-sm"
              :disabled="!v.exists || !v.isDirectory"
              @click="openVmRomsEditor(v)"
            >
              {{ v.romsRootRelPath ? "Change ROM folder" : "Set ROM folder" }}
            </button>
            <button
              v-if="v.romsRootRelPath && editingVmRomsPath !== v.path"
              class="btn-ghost text-sm"
              :disabled="vmRomsScanningPath === v.path"
              @click="scanVmRoms(v)"
            >
              <Spinner v-if="vmRomsScanningPath === v.path" size="sm" />
              <span>{{ vmRomsScanningPath === v.path ? "Scanning…" : "Scan ROMs" }}</span>
            </button>
            <button
              v-if="v.romsRootRelPath && editingVmRomsPath !== v.path"
              class="btn-ghost text-sm"
              :disabled="vmRomsBusy"
              @click="applyVmRomsDir(v, null)"
            >
              Clear ROM
            </button>
            <button class="btn-ghost text-sm text-danger" @click="removeVirtual(v)">
              Remove
            </button>
          </div>
        </li>
        <li v-if="virtualMounts.length === 0 && !busy" class="card text-center text-fg-dim">
          None configured.
        </li>
      </ul>
    </section>

    <section v-if="configInfo" class="card flex flex-col gap-1 text-xs text-fg-dim">
      <p>
        <span class="font-semibold text-fg">Config:</span>
        <span class="break-all">{{ configInfo.configPath }}</span>
      </p>
      <p>
        <span class="font-semibold text-fg">Backups:</span>
        <span class="break-all">{{ configInfo.backupDir }}</span>
      </p>
      <p>Platform: {{ configInfo.platform }}</p>
    </section>
  </div>
</template>
