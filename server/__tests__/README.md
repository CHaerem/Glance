# Testing Guide

This document describes the testing setup for the Glance Server.

## Test Structure

```
server/
├── __tests__/
│   ├── fixtures/           # Test data and sample images
│   ├── api.test.js         # API endpoint integration tests
│   ├── image-processing.test.js  # Unit tests for image processing
│   ├── eink-conversion.test.js   # E-ink specific tests
│   └── full-pipeline.test.js     # End-to-end pipeline tests
├── jest.setup.js           # Jest configuration and setup
├── audit-ci.json          # Security audit configuration
└── package.json           # Test scripts and dependencies
```

## Running Tests

### Local Development

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run tests for CI (with coverage, no watch)
npm run test:ci
```

### Test Categories

1. **Unit Tests** (`image-processing.test.js`)
   - Tests individual functions like `findClosestColor` and `applyFloydSteinbergDithering`
   - Validates color palette correctness
   - Tests edge cases and error handling

2. **E-ink Conversion Tests** (`eink-conversion.test.js`)
   - Tests Waveshare 13.3" Spectra 6 display compliance
   - Validates color distance calculations
   - Tests image resolution handling
   - Performance and memory efficiency tests

3. **API Integration Tests** (`api.test.js`)
   - Tests REST API endpoints
   - Validates request/response formats
   - Tests error handling and validation
   - CORS and security headers

4. **Full Pipeline Tests** (`full-pipeline.test.js`)
   - End-to-end image processing tests
   - Uses real test images (created dynamically)
   - Tests complete workflow from upload to e-ink format

## Test Coverage

The test suite aims for high coverage across:

- **Image Processing Functions**: 95%+ coverage
- **API Endpoints**: 90%+ coverage
- **Error Handling**: 85%+ coverage
- **Edge Cases**: Comprehensive coverage

Coverage reports are generated in the `coverage/` directory:
- `coverage/lcov-report/index.html` - HTML coverage report
- `coverage/lcov.info` - LCOV format for CI integration

## Continuous Integration

### GitHub Actions

The `.github/workflows/test-and-build.yml` workflow:

1. **Test Job**: Runs on every push and PR
   - Installs dependencies
   - Runs full test suite with coverage
   - Uploads coverage to Codecov

2. **Build Job**: Runs on main branch pushes after tests pass
   - Builds multi-architecture Docker images
   - Pushes to Docker Hub

3. **Security Scan Job**: Runs security audits
   - npm audit for vulnerabilities
   - Dependency security checks

### Pre-Build Testing

Build scripts automatically run tests before creating Docker images:

```bash
# Local build (runs tests first)
./scripts/local-build.sh

# Production build and push (runs tests first)
./scripts/build-and-push.sh your-username
```

If tests fail, the build process stops and no Docker image is created.

## Test Data

### Generated Test Images

Tests create various test images:
- `solid-black.png` - Pure black image
- `solid-white.png` - Pure white image  
- `solid-red.png` - Pure red image
- `gradient.png` - Grayscale gradient
- `color-stripes.png` - Multi-color stripes

These are created during test setup and cleaned up after.

### Expected Outputs

Tests validate:
- Correct e-ink color indices (0x0, 0x1, 0x2, 0x3, 0x5, 0x6)
- Proper image dimensions (1150x1550 for production)
- Valid Base64 encoding for API responses
- Dithering algorithm behavior

## Writing New Tests

### Test File Naming

- Unit tests: `*.test.js`
- Integration tests: `*.integration.test.js`
- Fixtures: `__tests__/fixtures/*`

### Test Structure

```javascript
describe('Feature Name', () => {
    beforeAll(async () => {
        // Setup that runs once before all tests
    });

    beforeEach(() => {
        // Setup that runs before each test
    });

    afterEach(() => {
        // Cleanup after each test
    });

    afterAll(async () => {
        // Cleanup that runs once after all tests
    });

    describe('Sub-feature', () => {
        test('should do something specific', () => {
            // Test implementation
            expect(result).toBe(expected);
        });
    });
});
```

### Best Practices

1. **Descriptive Test Names**: Use "should" statements
2. **Arrange-Act-Assert**: Structure tests clearly
3. **Mock External Dependencies**: Use Jest mocks for file system, network
4. **Test Edge Cases**: Include error conditions and boundary values
5. **Clean Up**: Remove test files and reset state

## Performance Testing

### Benchmarks

- Image processing: Should complete within 5 seconds for 200x200 images
- Memory usage: Should handle multiple concurrent operations
- API response time: Should respond within 1 second for typical requests

### Load Testing

```bash
# Example load test (install artillery first)
npm install -g artillery
artillery quick --count 10 --num 5 http://localhost:3000/api/current.json
```

## Debugging Tests

### Running Individual Tests

```bash
# Run specific test file
npm test -- image-processing.test.js

# Run tests matching pattern
npm test -- --testNamePattern="color conversion"

# Run with verbose output
npm test -- --verbose
```

### Debug Mode

```bash
# Run with Node.js debugger
node --inspect-brk node_modules/.bin/jest --runInBand
```

## Security Testing

### Dependency Auditing

```bash
# Run security audit
npm audit

# Fix auto-fixable vulnerabilities
npm audit fix

# Run audit CI check
npx audit-ci --config audit-ci.json
```

The build process will fail if high or critical vulnerabilities are found.

## Contributing

When adding new features:

1. Write tests first (TDD approach)
2. Ensure all tests pass locally
3. Check test coverage doesn't decrease
4. Update this documentation if needed

Test coverage reports help identify untested code paths and ensure new features are properly tested.