import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { useNotifyStore } from '@/stores/notify'
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
