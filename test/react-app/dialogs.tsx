import { useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import type { Project } from './types'

const SAVE_DELAY_MS = 1000
const CLOSE_ANIMATION_MS = 180

/** Portal-based modal with enter and exit animations. */
function Modal(props: {
  labelledBy: string
  closing: boolean
  onBackdrop: () => void
  children: ReactNode
}) {
  return createPortal(
    <div
      className={props.closing ? 'backdrop closing' : 'backdrop'}
      onMouseDown={(e) => e.target === e.currentTarget && props.onBackdrop()}
    >
      <div
        className='dialog'
        role='dialog'
        aria-modal='true'
        aria-labelledby={props.labelledBy}
      >
        {props.children}
      </div>
    </div>,
    document.body,
  )
}

/** Plays the exit animation, then unmounts via onClose. */
function useClosing(onClose: () => void) {
  const [closing, setClosing] = useState(false)
  const close = () => {
    setClosing(true)
    setTimeout(onClose, CLOSE_ANIMATION_MS)
  }
  return { closing, close }
}

export function NewProjectDialog(props: {
  onClose: () => void
  onCreated: (project: Omit<Project, 'id' | 'archived'>) => void
}) {
  const { closing, close } = useClosing(props.onClose)
  const [name, setName] = useState('')
  const [template, setTemplate] = useState('Blank')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState('team')
  const [notify, setNotify] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) {
      setError('Give the project a name.')
      return
    }
    setError(null)
    setSaving(true)
    setTimeout(() => {
      props.onCreated({ name: name.trim(), template, owner: 'Demo User' })
      close()
    }, SAVE_DELAY_MS)
  }

  return (
    <Modal labelledBy='new-project-title' closing={closing} onBackdrop={close}>
      <header>
        <h2 id='new-project-title'>New project</h2>
        <p>Projects group tasks, files and people.</p>
      </header>
      <form onSubmit={submit} noValidate>
        <div className={error ? 'field invalid' : 'field'}>
          <label htmlFor='project-name'>Project name</label>
          <input
            id='project-name'
            type='text'
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
            }}
          />
          {error && <span className='error'>{error}</span>}
        </div>
        <div className='field'>
          <label htmlFor='project-template'>Template</label>
          <select
            id='project-template'
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
          >
            <option>Blank</option>
            <option>Kanban</option>
            <option>Roadmap</option>
          </select>
        </div>
        <div className='field'>
          <label htmlFor='project-description'>Description</label>
          <textarea
            id='project-description'
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <fieldset className='field'>
          <legend>Visibility</legend>
          <div className='choices'>
            {[
              ['team', 'Whole team'],
              ['private', 'Only me'],
            ].map(([value, label]) => (
              <label key={value} className='choice'>
                <input
                  type='radio'
                  name='visibility'
                  value={value}
                  checked={visibility === value}
                  onChange={() => setVisibility(value ?? 'team')}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <label className='checkbox'>
          <input
            type='checkbox'
            checked={notify}
            onChange={(e) => setNotify(e.target.checked)}
          />
          Notify the team by email
        </label>
        <div className='actions'>
          <button type='button' className='btn btn-secondary' onClick={close}>
            Cancel
          </button>
          <button type='submit' className='btn btn-primary' disabled={saving}>
            {saving && <span className='spinner' />}
            {saving ? 'Creating…' : 'Create project'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export function ConfirmDialog(props: {
  title: string
  body: string
  confirmLabel: string
  onClose: () => void
  onConfirm: () => void
}) {
  const { closing, close } = useClosing(props.onClose)
  return (
    <Modal labelledBy='confirm-title' closing={closing} onBackdrop={close}>
      <header>
        <h2 id='confirm-title'>{props.title}</h2>
        <p>{props.body}</p>
      </header>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          props.onConfirm()
          close()
        }}
      >
        <div className='actions'>
          <button type='button' className='btn btn-secondary' onClick={close}>
            Cancel
          </button>
          <button type='submit' className='btn btn-danger'>
            {props.confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  )
}
