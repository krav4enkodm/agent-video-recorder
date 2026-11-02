import * as path from 'path'
import { pathToFileURL } from 'url'

import { defineScenario } from '../../src'

// The MVP validation flow (requirements §8) against the static fixture app.
const APP_URL = pathToFileURL(path.join(__dirname, 'demo-app.html')).href

export default defineScenario({
  name: 'demo-app',
  setup: async ({ page }) => {
    await page.goto(APP_URL)
  },
  run: async ({ page, recorder }) => {
    await recorder.narrate('A tiny project tracker, recorded end to end.')
    await recorder.pause(1000)

    await recorder.step('Navigation jumps between sections.', async () => {
      await recorder.click(page.getByRole('link', { name: 'About' }))
      await recorder.click(page.getByRole('link', { name: 'Create project' }))
    })

    await recorder.step('Name the project and pick a template.', async () => {
      await recorder.type(page.getByLabel('Project name'), 'Apollo')
      await recorder.selectOption(page.getByLabel('Template'), 'kanban')
    })

    await recorder.click(page.getByRole('button', { name: 'Create project' }), {
      important: true,
    })
    await recorder.waitFor(page.getByRole('status'))
    await recorder.narrate('The project is ready to use.')
  },
})
