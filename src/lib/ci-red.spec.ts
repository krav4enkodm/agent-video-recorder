// Throwaway: proves a failing unit test turns CI red. Never merge.
it('fails on purpose', () => {
  expect(1).toBe(2)
})
