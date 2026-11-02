// Used by scripts/smoke-pack.sh against the installed tarball. Written in the
// import-free form the record-video skill documents, so it runs from a temp
// folder where nothing but the installed package is available.
// demo-app.html is copied next to this file.
export default {
  name: 'smoke',
  setup: async ({ page }: { page: any }) => {
    await page.goto(`file://${__dirname}/demo-app.html`)
  },
  run: async ({ page, recorder }: { page: any; recorder: any }) => {
    await recorder.click(page.getByRole('link', { name: 'About' }))
  },
}
