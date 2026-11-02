import { useState } from 'react'

import type { Project } from './types'

export function ProjectsView(props: {
  projects: Project[]
  onCreate: () => void
  onArchive: (project: Project) => void
}) {
  return (
    <>
      <div className='page-header'>
        <div>
          <h1>Projects</h1>
          <p>Everything your team is working on.</p>
        </div>
        <button className='btn btn-primary' onClick={props.onCreate}>
          + New project
        </button>
      </div>
      <div className='card'>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Template</th>
              <th>Owner</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {props.projects.map((project) => (
              <tr
                key={project.id}
                className={project.isNew ? 'new' : undefined}
              >
                <td>
                  <strong>{project.name}</strong>
                </td>
                <td>{project.template}</td>
                <td>{project.owner}</td>
                <td>
                  <span
                    className={`badge ${project.archived ? 'badge-archived' : 'badge-active'}`}
                  >
                    {project.archived ? 'Archived' : 'Active'}
                  </span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  {!project.archived && (
                    <button
                      className='btn btn-ghost'
                      aria-label={`Archive ${project.name}`}
                      onClick={() => props.onArchive(project)}
                    >
                      Archive
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

export function TeamView() {
  const members = [
    ['Maya Chen', 'Design lead'],
    ['Leo Park', 'Product manager'],
    ['Ana Ruiz', 'Researcher'],
  ]
  return (
    <>
      <div className='page-header'>
        <div>
          <h1>Team</h1>
          <p>Three people, one workspace.</p>
        </div>
      </div>
      <div className='grid'>
        {members.map(([name, role]) => (
          <div key={name} className='card member'>
            <div className='avatar' style={{ marginLeft: 0 }}>
              {name
                ?.split(' ')
                .map((part) => part[0])
                .join('')}
            </div>
            <div>
              <strong>{name}</strong>
              <div style={{ color: 'var(--muted)' }}>{role}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

export function SettingsView() {
  const [digest, setDigest] = useState(true)
  return (
    <>
      <div className='page-header'>
        <div>
          <h1>Settings</h1>
          <p>Workspace preferences.</p>
        </div>
      </div>
      <div className='card'>
        <div className='setting'>
          <div>
            <strong>Weekly digest</strong>
            <div style={{ color: 'var(--muted)' }}>
              A Monday summary of every project.
            </div>
          </div>
          <button
            className='switch'
            role='switch'
            aria-checked={digest}
            aria-label='Weekly digest'
            onClick={() => setDigest(!digest)}
          />
        </div>
      </div>
    </>
  )
}
