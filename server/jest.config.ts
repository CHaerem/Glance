import type { Config } from 'jest';

const config: Config = {
  // Use ts-jest for TypeScript files
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Test timeout (same as before)
  testTimeout: 60000,

  // Support both .ts and .js test files during migration
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/__tests__/**/*.test.js',
    '**/*.test.ts',
    '**/*.test.js',
  ],

  // Module file extensions
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],

  // Transform settings - ts-jest for .ts, passthrough for .js
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
    }],
  },

  // Coverage configuration
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.ts',
    '*.js',
    'services/**/*.js',
    'utils/**/*.js',
    'routes/**/*.js',
    '!coverage/**',
    '!node_modules/**',
    '!jest.setup.js',
    '!jest.config.ts',
    '!**/*.test.ts',
    '!**/*.test.js',
    '!src/types/**',
  ],
  coverageReporters: ['text', 'lcov', 'html'],

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],

  // Roots for test discovery
  roots: ['<rootDir>'],

  // Module path aliases (if needed later)
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@types/(.*)$': '<rootDir>/src/types/$1',
  },

  // Ignore patterns
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/coverage/'],

  // Clear mocks between tests
  clearMocks: true,

  // Verbose output
  verbose: true,
};

export default config;
