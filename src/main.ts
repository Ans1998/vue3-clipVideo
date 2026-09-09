import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { useNotifyStore } from '@/stores/notify'
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/jetbrains-mono/latin-400.css'
import '@fontsource/jetbrains-mono/latin-500.css'
import './styles/main.scss'

const pinia = createPinia()
const app = createApp(App)
app.use(pinia)
app.config.errorHandler = (error) => {
  const notify = useNotifyStore(pinia)
  notify.push('error', error instanceof Error ? error.message : '发生未知错误')
}
window.addEventListener('unhandledrejection', (event) => {
  const notify = useNotifyStore(pinia)
  const reason = event.reason
  notify.push('error', reason instanceof Error ? reason.message : '异步任务失败')
})
app.mount('#app')
