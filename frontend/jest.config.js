module.exports = {
  testMatch: ['<rootDir>/src/**/*.test.js', '<rootDir>/src/**/*.test.ts'],
  transform: {
    '^.+\\.[jt]sx?$': 'babel-jest',
  },
};
