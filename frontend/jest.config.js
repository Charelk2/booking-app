module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/src/**/*.test.ts?(x)'],
  transform: {
    '^.+\\.[jt]sx?$': [
      'babel-jest',
      {
        presets: [
          '@babel/preset-env',
          ['@babel/preset-react', { runtime: 'automatic' }],
          '@babel/preset-typescript',
        ],
      },
    ],
    '^.+\\.mjs$': 'babel-jest',
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(dexie|react-calendar|@wojtekmaj/date-utils|get-user-locale|warning|memoize|mimic-function)/)',
  ],
  moduleNameMapper: {
    '^@/tests/(.*)$': '<rootDir>/tests/$1',
    '^@/test/(.*)$': '<rootDir>/test/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@/styles/.*\\.css$': '<rootDir>/__mocks__/styleMock.js',
    '^@/styles/datepicker\\.css$': '<rootDir>/__mocks__/styleMock.js',
    '^react-datepicker$': '<rootDir>/__mocks__/react-datepicker.tsx',
    '^dexie$': '<rootDir>/__mocks__/dexie.ts',
    '^@vercel/analytics/react$': '<rootDir>/__mocks__/vercelAnalytics.ts',
    '\\.(css|less|scss|sass)$': '<rootDir>/__mocks__/styleMock.js',
    '\\.module\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts', '<rootDir>/test/setup-network.ts'],
  testTimeout: 30000,
};
