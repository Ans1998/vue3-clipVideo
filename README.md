# CLIPFORGE

[中文](#中文) | [English](#english)

浏览器端 Vue 3 视频剪辑器 / In-browser Vue 3 video editor.

**v1 已完成** · Vue 3 · TypeScript · Vite · Pinia · IndexedDB · Canvas · WebCodecs

<p align="center">
  <img src="https://github.com/Ans1998/vue3-clipVideo/blob/master/img/f4d95768-0315-4260-b0bd-2b0be574782f.png?raw=true" alt="CLIPFORGE screenshot" />
</p>

<p align="center">
  <a href="https://github.com/Ans1998/vue3-clipVideo/blob/master/img/f4d95768-0315-4260-b0bd-2b0be574782f.png">项目截图 / Screenshot</a>
</p>

---

## 中文

### 简介

CLIPFORGE 是运行在浏览器里的非线性剪辑器。素材、时间轴、预览和导出都在本地完成，项目保存在 IndexedDB，不依赖后端。

v1 覆盖：素材导入、时间轴剪辑（分割 / 向左裁剪 / 向右裁剪、波纹、变速、转场、滤镜）、主视图预览、成片导出、剪映草稿导出。

### 快速开始

```bash
pnpm install
pnpm dev
```

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 启动开发服务 |
| `pnpm test` | 运行测试 |
| `pnpm typecheck` | 类型检查 |
| `pnpm build` | 生产构建 |

### 项目架构

界面是经典四区剪辑台：**顶栏 / 素材 / 主视图 / 属性 / 时间轴**。状态集中在 Pinia `editor` store，时间轴和主视图读同一份 `EditorProject`。

```text
EditorLayout
├── TopToolbar              项目切换、撤销重做、导出
├── MaterialPanel           素材库（视频 / 图片 / 音频 / 文字）
├── PreviewStage            主视图：Canvas 合成当前帧
├── InspectorPanel          选中片段属性
└── Timeline                轨道：DOM（div）排版与交互

Pinia  useEditorStore
        └── EditorProject（materials / tracks / clips / settings）
                │
                ├── Timeline.vue        用 div 画轨道、片段、播放头
                └── PreviewStage.vue    按 currentFrame 把 clips 交给 Canvas 渲染

IndexedDB  clip-forge
├── projects     项目 JSON
├── materials    素材 Blob
├── thumbnails   项目封面
└── trash        回收站

导出
├── WebCodecs / WebM muxer    成片
└── JianYingExporter          剪映草稿 zip
```

**时间轴与主视图的分工：**

- **轨道用 div 排版渲染。** `Timeline.vue` 把每条轨道、每个片段做成 DOM 节点，负责缩放、拖拽、框选、右键菜单、波形等交互。片段在时间轴上的位置由 `startFrame`、`durationFrames` 和 `pixelsPerFrame` 换算成 CSS。
- **数据再传到主视图做 Canvas 渲染。** 时间轴并不画画面。`PreviewStage` 读取同一份 `project.clips` 和 `currentFrame`，经 `resolveActiveClips` 筛出当前帧可见片段，由 `CanvasSceneRenderer` 按 `zIndex` 合成到 canvas。导出走同一套渲染器，保证预览和成片一致。

```text
用户拖动时间轴片段
        ↓
  更新 EditorProject.clips
        ↓
  Timeline：只更新 div 布局
  PreviewStage：按 currentFrame 重绘 canvas
```

| 目录 | 职责 |
| --- | --- |
| `src/components/` | 界面：素材、预览、属性、时间轴、导出对话框 |
| `src/stores/` | Pinia：工程状态、导出任务、通知 |
| `src/services/renderer/` | Canvas 场景合成、素材解码 |
| `src/services/playback/` | 预览播放、预览音频 |
| `src/services/export/` | 成片编码与混音 |
| `src/services/jianying/` | 剪映草稿映射与打包 |
| `src/services/storage/` | IndexedDB 持久化 |
| `src/utils/timeline/` | 帧对齐、裁剪、波纹、缩放坐标 |

### 数据结构设计

工程的唯一真相是 `EditorProject`。时间轴、主视图、导出都消费这份结构。

```ts
EditorProject
├── id / name / createdAt / updatedAt
├── currentFrame                 // 播放头（帧）
├── settings                     // 画布与时间
│     width / height / fps / durationFrames / rippleEdit
├── materials[]                  // 导入的视频、图片、音频
├── tracks[]                     // 轨道（画面 / 文字 / 音频）
└── clips[]                      // 片段：挂到轨道，引用素材或文字
```

```ts
interface EditorProject {
  id: string
  name: string
  settings: ProjectSettings
  materials: Material[]
  tracks: TimelineTrack[]
  clips: TimelineClip[]
  currentFrame: number
  createdAt: number
  updatedAt: number
}

interface ProjectSettings {
  width: number
  height: number
  fps: 24 | 25 | 30 | 50 | 60
  durationFrames: number
  rippleEdit?: boolean
}

interface Material {
  id: string
  type: 'video' | 'image' | 'audio'
  name: string
  mimeType: string
  size: number
  durationFrames?: number
  width?: number
  height?: number
  objectUrl?: string              // 运行时 Blob URL，不写入工程 JSON
  missing?: boolean
}

interface TimelineTrack {
  id: string
  name: string
  type: 'visual' | 'text' | 'audio'
  order: number
  locked: boolean
  hidden: boolean
  muted: boolean
}

interface TimelineClip {
  id: string
  trackId: string                 // 所属轨道
  type: 'video' | 'image' | 'audio' | 'text'
  materialId?: string              // 视频 / 图片 / 音频引用 materials[]
  startFrame: number              // 时间轴入点
  durationFrames: number          // 时间轴长度
  offsetFrame: number             // 素材内部偏移（裁切入点）
  name: string
  zIndex: number                   // 主视图叠放顺序
  locked: boolean
  transform: Transform            // 主视图位置、缩放、旋转、透明度
  speed?: number
  fadeInFrames?: number
  fadeOutFrames?: number
  transitionIn?: ClipTransition
  transitionOut?: ClipTransition
  filter?: ClipFilter
  text?: TextConfig               // 仅文字片段
  audio?: AudioConfig             // 音量 / 静音 / 淡入淡出
}

interface Transform {
  x: number
  y: number
  width: number
  height: number
  scaleX: number
  scaleY: number
  rotation: number
  opacity: number
}
```

**关系：**

- `Track` 只描述轨道本身（类型、锁定、隐藏），不内嵌片段。
- `Clip` 通过 `trackId` 挂到轨道，通过 `materialId` 引用素材。文字片段没有 `materialId`，内容在 `text` 里。
- 时间轴用 `startFrame + durationFrames` 排 div；主视图用 `currentFrame` 判断片段是否可见，再用 `transform` 画到 canvas。
- 素材文件存在 IndexedDB `materials` 表，工程 JSON 只存元数据。打开项目时再生成 `objectUrl`。

IndexedDB 记录：

```ts
StoredProjectRecord { id, name, payload: EditorProject, width, height, fps, ... }
StoredMaterial      { id, blob, projectId, type, name, ... }   // 去掉 objectUrl
StoredThumbnail     { projectId, blob }
StoredTrashRecord   { ...StoredProjectRecord, deletedAt, materialIds }
```

### 技术栈

Vue 3、TypeScript、Vite、Pinia、Dexie、Canvas 2D、WebCodecs、mp4-muxer / webm-muxer、JSZip。

---

## English

### Overview

CLIPFORGE is a nonlinear video editor that runs entirely in the browser. Import, timeline editing, preview, and export stay on the client. Projects are stored in IndexedDB. There is no backend.

v1 covers media import, timeline editing (split / trim left / trim right, ripple, speed, transitions, filters), canvas preview, video export, and JianYing draft export.

### Quick start

```bash
pnpm install
pnpm dev
```

| Command | Description |
| --- | --- |
| `pnpm dev` | Dev server |
| `pnpm test` | Tests |
| `pnpm typecheck` | Typecheck |
| `pnpm build` | Production build |

### Architecture

The UI is a classic editor chrome: **toolbar / media / preview / inspector / timeline**. Pinia `editor` holds one `EditorProject`. The timeline and the preview both read that document.

```text
EditorLayout
├── TopToolbar              project switch, undo/redo, export
├── MaterialPanel           media library
├── PreviewStage            main view: Canvas composite of the current frame
├── InspectorPanel          selected clip properties
└── Timeline                tracks: DOM (div) layout and interaction

Pinia  useEditorStore
        └── EditorProject (materials / tracks / clips / settings)
                │
                ├── Timeline.vue        DIV layout for tracks, clips, playhead
                └── PreviewStage.vue  Canvas render of clips at currentFrame

IndexedDB  clip-forge
├── projects / materials / thumbnails / trash

Export
├── WebCodecs / WebM muxer    finished video
└── JianYingExporter          JianYing draft zip
```

**How the timeline and the main view share work:**

- **Tracks are laid out with divs.** `Timeline.vue` renders each track and clip as DOM nodes. Zoom, drag, marquee, context menu, and waveforms all live here. Clip position on the ruler is `startFrame` / `durationFrames` converted through `pixelsPerFrame` into CSS.
- **Those same records are passed to the main view for Canvas rendering.** The timeline never paints pixels of the program. `PreviewStage` reads `project.clips` and `currentFrame`, `resolveActiveClips` keeps clips that cover the playhead, and `CanvasSceneRenderer` composites them by `zIndex`. Export uses the same renderer so preview and output match.

```text
User drags a clip on the timeline
        ↓
  EditorProject.clips is updated
        ↓
  Timeline: restyle DIV layout only
  PreviewStage: redraw canvas for currentFrame
```

| Path | Role |
| --- | --- |
| `src/components/` | UI shells |
| `src/stores/` | project state, export, toasts |
| `src/services/renderer/` | Canvas scene + media decode |
| `src/services/playback/` | preview clock and audio |
| `src/services/export/` | encode and mix |
| `src/services/jianying/` | JianYing draft pack |
| `src/services/storage/` | IndexedDB |
| `src/utils/timeline/` | frame math, trim, ripple |

### Data model

`EditorProject` is the source of truth. Timeline, preview, and export all consume it.

```ts
EditorProject
├── id / name / createdAt / updatedAt
├── currentFrame                 // playhead in frames
├── settings                     // canvas size, fps, duration, ripple
├── materials[]                  // imported video / image / audio
├── tracks[]                     // visual / text / audio tracks
└── clips[]                      // clips on tracks; media ref or text
```

```ts
interface EditorProject {
  id: string
  name: string
  settings: ProjectSettings
  materials: Material[]
  tracks: TimelineTrack[]
  clips: TimelineClip[]
  currentFrame: number
  createdAt: number
  updatedAt: number
}

interface TimelineClip {
  id: string
  trackId: string                 // parent track
  type: 'video' | 'image' | 'audio' | 'text'
  materialId?: string              // points at materials[]
  startFrame: number              // timeline in-point
  durationFrames: number          // timeline length
  offsetFrame: number             // source in-point inside the media
  zIndex: number                   // draw order on the canvas
  transform: Transform            // preview position / scale / rotation
  text?: TextConfig
  audio?: AudioConfig
  // speed, fades, transitions, filter...
}
```

**Relations:**

- A `Track` describes the lane only (type, lock, hide). Clips are not nested inside it.
- A `Clip` joins a track with `trackId` and a material with `materialId`. Text clips have no `materialId`; copy lives in `text`.
- The timeline places divs with `startFrame + durationFrames`. The main view tests `currentFrame` for visibility and draws `transform` onto the canvas.
- Media blobs live in IndexedDB `materials`. The project JSON stores metadata only. `objectUrl` is created when a project is opened.

### Stack

Vue 3, TypeScript, Vite, Pinia, Dexie, Canvas 2D, WebCodecs, mp4-muxer / webm-muxer, JSZip.
