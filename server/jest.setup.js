// Jest setup file
const path = require('path');
const fs = require('fs').promises;

// Setup test environment
process.env.NODE_ENV = 'test';
process.env.PORT = '0'; // Use random port for testing

// Global test timeout
jest.setTimeout(30000);

// Clean up test files after each test
afterEach(async () => {
    try {
        // Clean up any test files in uploads directory
        const uploadsDir = path.join(__dirname, 'uploads');
        const files = await fs.readdir(uploadsDir).catch(() => []);
        const testFiles = files.filter(file => file.includes('test-'));
        
        for (const file of testFiles) {
            await fs.unlink(path.join(uploadsDir, file)).catch(() => {});
        }
    } catch (error) {
        // Ignore cleanup errors
    }
});

// Mock console methods to reduce test noise
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

beforeAll(() => {
    console.log = jest.fn();
    console.error = jest.fn();
});

afterAll(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
});