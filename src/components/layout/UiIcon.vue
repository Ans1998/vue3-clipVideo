<script setup lang="ts">
import { computed, type Component } from 'vue'
import {
  Undo2, Redo2, CircleQuestionMark, Play, Pause, ChevronLeft, ChevronRight,
  Plus, Type, Eye, EyeOff, Volume2, VolumeX, Lock, Unlock, Trash2,
  Minus, Maximize2, Minimize2, Scan, PanelLeftClose, PanelRightClose,
  FolderOpen, ChevronsUp, ChevronUp, ChevronDown, ChevronsDown, X,
  FilePlus, Clapperboard, Image, Music, RotateCw, Triangle, Upload,
  PanelLeft, PanelRight,
} from 'lucide-vue-next'

const ICONS = {
  undo: Undo2,
  redo: Redo2,
  help: CircleQuestionMark,
  play: Play,
  pause: Pause,
  prev: ChevronLeft,
  next: ChevronRight,
  plus: Plus,
  upload: Upload,
  type: Type,
  eye: Eye,
  eyeOff: EyeOff,
  volume: Volume2,
  volumeOff: VolumeX,
  lock: Lock,
  unlock: Unlock,
  trash: Trash2,
  minus: Minus,
  expand: Maximize2,
  restore: Minimize2,
  fit: Scan,
  panelLeft: PanelLeftClose,
  panelRight: PanelRightClose,
  panelLeftOpen: PanelLeft,
  panelRightOpen: PanelRight,
  chevron: ChevronDown,
  folder: FolderOpen,
  front: ChevronsUp,
  forward: ChevronUp,
  backward: ChevronDown,
  back: ChevronsDown,
  close: X,
  filePlus: FilePlus,
  video: Clapperboard,
  image: Image,
  audio: Music,
  rotate: RotateCw,
  brand: Triangle,
} as const

export type IconName = keyof typeof ICONS | 'splitClip' | 'trimLeft' | 'trimRight'

const props = withDefaults(defineProps<{ name: IconName; size?: number }>(), { size: 14 })
const lucide = computed(() => (props.name in ICONS ? ICONS[props.name as keyof typeof ICONS] : null) as Component | null)
</script>

<template>
  <svg
    v-if="name === 'splitClip' || name === 'trimLeft' || name === 'trimRight'"
    class="ui-icon clip-edit-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <!-- ] 左半段 -->
    <path d="M9.5 5V19M9.5 5H5M9.5 19H5" :stroke-dasharray="name === 'trimLeft' ? '2.8 2.2' : undefined" :opacity="name === 'trimLeft' ? 0.5 : 1" />
    <!-- 播放头 -->
    <path d="M12 3.25V20.75" stroke-width="1.4" :opacity="name === 'splitClip' ? 0.9 : 0.4" />
    <!-- [ 右半段 -->
    <path d="M14.5 5V19M14.5 5H19M14.5 19H19" :stroke-dasharray="name === 'trimRight' ? '2.8 2.2' : undefined" :opacity="name === 'trimRight' ? 0.5 : 1" />
  </svg>
  <component v-else :is="lucide" :size="size" :stroke-width="1.75" class="ui-icon" aria-hidden="true" />
</template>
