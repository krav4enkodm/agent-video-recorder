import { defineScenario } from '../../src'
import { buildTestApp } from './build'

// A single-page flow: views, a dialog with validation, async submit, toast and
// a confirmation dialog, all without a page load.
export default defineScenario({
  name: 'react-app',
  setup: async ({ page }) => {
    await page.goto(await buildTestApp())
  },
  run: async ({ page, recorder }) => {
    await recorder.narrate(
      'Acme Projects is a single-page app: nothing reloads.',
    )
    await recorder.pause(1200)

    await recorder.step('Views switch instantly in the browser.', async () => {
      await recorder.click(page.getByRole('button', { name: 'Team' }))
      await recorder.click(page.getByRole('button', { name: 'Settings' }))
      await recorder.click(page.getByRole('switch', { name: 'Weekly digest' }))
      await recorder.click(page.getByRole('button', { name: 'Projects' }))
    })

    await recorder.click(page.getByRole('button', { name: '+ New project' }))
    const dialog = page.getByRole('dialog', { name: 'New project' })
    await recorder.waitFor(dialog)

    await recorder.step('The form checks required fields.', async () => {
      await recorder.click(
        dialog.getByRole('button', { name: 'Create project' }),
      )
      await recorder.waitFor(dialog.getByText('Give the project a name.'))
    })

    await recorder.step('Fill in the details.', async () => {
      await recorder.type(dialog.getByLabel('Project name'), 'Mobile app beta')
      await recorder.selectOption(dialog.getByLabel('Template'), 'Roadmap')
      await recorder.type(
        dialog.getByLabel('Description'),
        'Ship the beta to 200 testers.',
      )
      await recorder.click(dialog.getByLabel('Only me'))
      await recorder.click(dialog.getByLabel('Notify the team by email'))
    })

    await recorder.click(
      dialog.getByRole('button', { name: 'Create project' }),
      {
        important: true,
      },
    )
    await recorder.waitFor(page.getByRole('status'))
    await recorder.narrate('The new project lands at the top of the list.')
    await recorder.highlight(page.getByRole('row', { name: /Mobile app beta/ }))

    await recorder.step('Archiving asks for confirmation first.', async () => {
      await recorder.click(
        page.getByRole('button', { name: 'Archive Website redesign' }),
      )
      const confirm = page.getByRole('dialog')
      await recorder.waitFor(confirm)
      await recorder.click(confirm.getByRole('button', { name: 'Archive' }))
      await recorder.waitFor(
        page
          .getByRole('row', { name: /Website redesign/ })
          .getByText('Archived'),
      )
    })
    await recorder.narrate(
      'Done: created, archived, and the page never reloaded.',
    )
  },
})
