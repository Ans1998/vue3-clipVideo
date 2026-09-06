<script setup lang="ts">
import { useNotifyStore } from '@/stores/notify'

const notify = useNotifyStore()
</script>

<template>
  <div class="toast-host" aria-live="polite">
    <p v-for="item in notify.notices" :key="item.id" :class="['toast', item.kind]" @click="notify.dismiss(item.id)">{{ item.text }}</p>
  </div>
</template>
