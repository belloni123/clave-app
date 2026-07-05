import { create } from 'zustand'

export type UserRole = 'admin' | 'client' | 'colab' | 'student'
export type MaturityLevel = 'newbie' | 'soft' | 'hard' | 'pro' | 'master'

export interface Project {
  id: string
  name: string
  color: string
  level: MaturityLevel
  user_id: string
  created_at: string
}

export interface UserProfile {
  id: string
  role: UserRole
  plan: string
  max_projects: number
  agency_id?: string | null
}

interface ToastState {
  message: string | null
  type: 'info' | 'err' | null
}

interface AppState {
  // Authentication & Profile
  profile: UserProfile | null
  setProfile: (profile: UserProfile | null) => void

  // Projects
  projects: Project[]
  setProjects: (projects: Project[]) => void
  activeProjectId: string | null
  setActiveProjectId: (id: string | null) => void
  getActiveProject: () => Project | undefined

  // Level selector
  currentLevel: MaturityLevel
  setCurrentLevel: (level: MaturityLevel) => void

  // Navigation
  activeModule: string
  setActiveModule: (module: string) => void
  activeTab: string
  setActiveTab: (tab: string) => void

  // Sidebar state
  sidebarCollapsed: boolean
  toggleSidebar: () => void

  // Theme settings
  theme: 'light' | 'dark'
  setTheme: (theme: 'light' | 'dark') => void
  toggleTheme: () => void

  // Toast notifications
  toast: ToastState
  showToast: (message: string, type?: 'info' | 'err') => void
  clearToast: () => void
}

export const useAppStore = create<AppState>((set, get) => ({
  profile: null,
  setProfile: (profile) => set({ profile }),

  projects: [],
  setProjects: (projects) => set({ projects }),
  activeProjectId: null,
  setActiveProjectId: (id) => set({ activeProjectId: id }),
  getActiveProject: () => {
    const { projects, activeProjectId } = get()
    return projects.find((p) => p.id === activeProjectId) || projects[0]
  },

  currentLevel: 'newbie',
  setCurrentLevel: (level) => set({ currentLevel: level }),

  activeModule: 'home',
  setActiveModule: (module) => set({ activeModule: module }),
  activeTab: '0',
  setActiveTab: (tab) => set({ activeTab: tab }),

  sidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  theme: 'dark',
  setTheme: (theme) => set({ theme }),
  toggleTheme: () => set((state) => {
    const nextTheme = state.theme === 'light' ? 'dark' : 'light'
    if (typeof window !== 'undefined') {
      localStorage.setItem('clave_theme', nextTheme)
      if (nextTheme === 'dark') {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
    }
    return { theme: nextTheme }
  }),

  toast: { message: null, type: null },
  showToast: (message, type = 'info') => {
    set({ toast: { message, type } })
    // Auto clear toast after 2.2 seconds as specified in prototype
    setTimeout(() => {
      const currentToast = get().toast
      if (currentToast.message === message) {
        get().clearToast()
      }
    }, 2200)
  },
  clearToast: () => set({ toast: { message: null, type: null } }),
}))
