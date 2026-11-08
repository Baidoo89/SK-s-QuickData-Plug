export default {
  experimental: { externalDir: true },
  distDir: process.env.UX_TEST_RUN === "1" ? ".next-tests" : ".next",
}
