<script setup lang="ts">
import Modal from '@/components/layout/Modal.vue'

defineEmits<{ close: [] }>()

const groups = [
  {
    title: '编辑',
    items: [
      ['Ctrl+Z', '撤销'],
      ['Ctrl+Y / Ctrl+Shift+Z', '重做'],
      ['Ctrl+C', '复制'],
      ['Ctrl+X', '剪切'],
      ['Ctrl+V', '粘贴'],
      ['Ctrl+D', '创建副本'],
      ['Ctrl+B / 主视图 ][', '分割（在播放头处一分为二）'],
      ['[ / 主视图 向左裁剪', '向左裁剪（去掉播放头左边）'],
      ['] / 主视图 向右裁剪', '向右裁剪（去掉播放头右边）'],
      ['Delete', '删除（波纹开启时后面的片段会前移）'],
      ['Ctrl+A', '全选'],
    ],
  },
  {
    title: '预览',
    items: [
      ['空格', '播放 / 暂停'],
      ['方向键', '微调画面位置'],
      ['Shift+方向键', '大幅移动'],
      ['双击文字', '在画布上直接改字'],
    ],
  },
  {
    title: '时间轴',
    items: [
      ['选中轨道后滚轮', '放大 / 缩小时间轴'],
      ['Ctrl+滚轮', '放大 / 缩小时间轴'],
    ],
  },
  {
    title: '其它',
    items: [
      ['?', '打开本说明'],
      ['Ctrl+/', '打开本说明'],
    ],
  },
]
</script>

<template>
  <Modal title="快捷键" closable @close="$emit('close')">
    <div v-for="group in groups" :key="group.title" class="shortcut-group">
      <h3>{{ group.title }}</h3>
      <p v-for="item in group.items" :key="item[0]" class="shortcut-row">
        <kbd>{{ item[0] }}</kbd>
        <span>{{ item[1] }}</span>
      </p>
    </div>
    <p class="hint">片段变速、转场（左进 / 右进 / 上进 / 下进 / 淡入）和滤镜在右侧属性里。时间轴上的「波纹」开启后，删除会把后面的片段往前收拢。</p>
    <template #footer>
      <button type="button" class="primary-button" @click="$emit('close')">知道了</button>
    </template>
  </Modal>
</template>
