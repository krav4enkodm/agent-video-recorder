// Logs from the scenario and removes the in-page runtime, so every overlay
// effect and settle wait after that fails and is logged. stdout must still
// hold only the result JSON.
export default {
  name: 'noisy',
  setup: async ({ page }: { page: any }) => {
    await page.goto(`file://${__dirname}/demo-app.html`)
  },
  run: async ({ page, recorder }: { page: any; recorder: any }) => {
    console.log('log from the scenario')
    await page.evaluate(() => {
      delete (window as any).__agentVideoRecorder
    })
    await recorder.click(page.getByRole('link', { name: 'About' }))
  },
}
