<script setup lang="ts">
interface ProfileSummary {
  name: string;
  notes?: string;
  ready: boolean;
  slots: { id: string; deviceId: string; fileRelPath: string }[];
  updatedAt: string;
}
interface KnownDevice {
  id: string;
  nickname: string;
}
const { data, refresh, pending } = await useFetch<{ profiles: ProfileSummary[]; devices: KnownDevice[] }>(
  "/api/profiles",
);

const profiles = computed(() => data.value?.profiles ?? []);
const devices = computed(() => data.value?.devices ?? []);

function deviceName(id: string): string {
  return devices.value.find((d) => d.id === id)?.nickname ?? "(unknown)";
}

function profileDevicesSummary(p: ProfileSummary): string {
  if (p.slots.length === 0) return "(no devices)";
  return p.slots.map((s) => deviceName(s.deviceId)).join(" ⇄ ");
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <section>
      <div class="mb-3 flex items-center justify-between">
        <h1 class="text-xl font-bold">Profiles</h1>
        <NuxtLink to="/profiles/new" class="btn-primary">+ New</NuxtLink>
      </div>

      <div v-if="pending" class="flex items-center justify-center gap-3 py-8 text-fg-dim">
        <Spinner /> <span>Loading profiles…</span>
      </div>

      <div v-else-if="profiles.length === 0" class="card text-center">
        <p class="mb-3 text-fg-dim">
          No profiles yet. Create one to start syncing a save between devices.
        </p>
        <NuxtLink to="/profiles/new" class="btn-primary">Create your first profile</NuxtLink>
      </div>

      <ul v-else class="flex flex-col gap-2">
        <li v-for="p in profiles" :key="p.name">
          <NuxtLink :to="`/profiles/${encodeURIComponent(p.name)}`" class="row-button">
            <div class="flex min-w-0 flex-1 flex-col">
              <span class="truncate text-base font-semibold">{{ p.name }}</span>
              <span class="truncate text-xs text-fg-dim">
                {{ profileDevicesSummary(p) }}
              </span>
            </div>
            <span
              class="pill"
              :class="
                p.ready
                  ? 'bg-[color-mix(in_oklab,var(--color-ok)_25%,transparent)] text-ok'
                  : 'bg-[color-mix(in_oklab,var(--color-warn)_25%,transparent)] text-warn'
              "
            >
              {{ p.ready ? "ready" : "incomplete" }}
            </span>
          </NuxtLink>
        </li>
      </ul>
    </section>

    <section>
      <div class="card flex items-center justify-between">
        <div>
          <p class="font-semibold">Known devices</p>
          <p class="text-xs text-fg-dim">
            {{ devices.length }} registered
          </p>
        </div>
        <NuxtLink to="/devices" class="btn-secondary">Manage</NuxtLink>
      </div>
    </section>

    <button class="btn-ghost self-start text-sm" :disabled="pending" @click="refresh()">
      <Spinner v-if="pending" size="sm" />
      <span>{{ pending ? "Refreshing…" : "Refresh" }}</span>
    </button>
  </div>
</template>
