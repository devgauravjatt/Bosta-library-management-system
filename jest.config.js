export default {
	testEnvironment: "node",
	testMatch: ["**/tests/**/*.test.js"],
	collectCoverageFrom: ["controllers/**/*.js", "utils/**/*.js", "!**/node_modules/**"],
	testTimeout: 30000,
	verbose: true,
};
