import * as path from 'path'
import { pathToFileURL } from 'url'

import { defineScenario } from '../../src'

export default defineScenario({
  setup: async ({ page }) => {
    await page.goto(pathToFileURL(path.join(__dirname, 'demo-app.html')).href)
  },
  run: async ({ page, recorder }) => {
    await recorder.click(page.getByRole('button', { name: 'Create project' }))
    throw new Error('scenario step failed on purpose')
  },
})
