// A single-page React app for recording tests: views switch, dialogs open and
// close, forms validate and submit, and toasts appear without a page load.
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { ConfirmDialog, NewProjectDialog } from './dialogs'
import { ProjectsView, SettingsView, TeamView } from './views'
import type { Project } from './types'

type View = 'projects' | 'team' | 'settings'

const TOAST_MS = 4000

const INITIAL_PROJECTS: Project[] = [
  {
    id: 1,
    name: 'Website redesign',
    template: 'Kanban',
    owner: 'Maya Chen',
    archived: false,
  },
  {
    id: 2,
    name: 'Q4 launch plan',
    template: 'Roadmap',
    owner: 'Leo Park',
    archived: false,
  },
  {
    id: 3,
    name: 'Customer interviews',
    template: 'Blank',
    owner: 'Ana Ruiz',
    archived: false,
  },
]

function App() {
  const [view, setView] = useState<View>('projects')
  const [projects, setProjects] = useState(INITIAL_PROJECTS)
  const [creating, setCreating] = useState(false)
  const [archiving, setArchiving] = useState<Project | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast])

  const addProject = (project: Omit<Project, 'id' | 'archived'>) => {
    setProjects((current) => [
      { ...project, id: Date.now(), archived: false, isNew: true },
      ...current.map((p) => ({ ...p, isNew: false })),
    ])
    setToast(`Project “${project.name}” created`)
  }

  const archive = (project: Project) => {
    setProjects((current) =>
      current.map((p) => (p.id === project.id ? { ...p, archived: true } : p)),
    )
    setToast(`“${project.name}” archived`)
  }

  return (
    <>
      <header className='topbar'>
        <div className='logo'>
          <span className='logo-mark' /> Acme Projects
        </div>
        <nav className='nav' aria-label='Main'>
          {(['projects', 'team', 'settings'] as const).map((v) => (
            <button
              key={v}
              aria-current={view === v ? 'page' : undefined}
              onClick={() => setView(v)}
            >
              {v[0]?.toUpperCase() + v.slice(1)}
            </button>
          ))}
        </nav>
        <div className='avatar' aria-label='Signed in as Demo User'>
          DU
        </div>
      </header>

      <main key={view}>
        {view === 'projects' && (
          <ProjectsView
            projects={projects}
            onCreate={() => setCreating(true)}
            onArchive={setArchiving}
          />
        )}
        {view === 'team' && <TeamView />}
        {view === 'settings' && <SettingsView />}
      </main>

      {creating && (
        <NewProjectDialog
          onClose={() => setCreating(false)}
          onCreated={addProject}
        />
      )}
      {archiving && (
        <ConfirmDialog
          title={`Archive “${archiving.name}”?`}
          body='The project becomes read-only. You can restore it later.'
          confirmLabel='Archive'
          onClose={() => setArchiving(null)}
          onConfirm={() => archive(archiving)}
        />
      )}
      {toast && (
        <div className='toast' role='status'>
          <span className='toast-icon'>✓</span>
          {toast}
        </div>
      )}
    </>
  )
}

const container = document.getElementById('root')
if (container) createRoot(container).render(<App />)
