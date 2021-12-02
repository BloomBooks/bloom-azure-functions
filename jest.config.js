module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: [
    "**/?(*.)(spec|test).ts?(x)",
    "**/?(*.)(spec|test).js?(x)",
    "!**/dist/**",
  ],
  // It's easy to overwhelm our little ParseServer with parallel requests such that
  // tests don't complete any resonable time. Here are two fixes you can use:
   testTimeout: 1000 * 10,
  // and you can prevent parallel tests:
  maxWorkers: 1
};
