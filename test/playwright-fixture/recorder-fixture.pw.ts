import * as path from 'path'
import { pathToFileURL } from 'url'

import { expect, test } from '../../src/test'

const APP_URL = pathToFileURL(
  path.join(__dirname, '../fixtures/demo-app.html'),
).href

test('records through the recorder fixture', async ({ page, recorder }) => {
  await page.goto(APP_URL)
  await recorder.start()
  await recorder.type(page.getByLabel('Project name'), 'Fixture')
  await recorder.click(page.getByRole('button', { name: 'Create project' }))
  await recorder.waitFor(page.getByRole('status'))
  await expect(page.getByRole('status')).toContainText('Fixture')
})
