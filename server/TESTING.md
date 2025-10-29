# Test Coverage for Glance Image Processing

## Overview

This document describes the test coverage for the Glance e-ink display system, particularly focusing on the critical `convertImageToRGB` function that processes images for display.

## Test Suites

### 1. Upload Endpoint Tests (`upload-endpoint.test.js`)

**Purpose**: Ensure all API endpoints that call `convertImageToRGB` pass parameters in the correct order.

**Critical Bug Prevented**:
```javascript
// WRONG (the bug we had):
convertImageToRGB(path, 1200, 1600, {...})
// This passed: rotation=1200°, width=1600, height={...} ❌

// CORRECT (fixed):
convertImageToRGB(path, 0, 1200, 1600, {...})
// This passes: rotation=0°, width=1200, height=1600, options={...} ✅
```

**Tests**:
- ✅ Upload RGB images (3 channels)
- ✅ Upload RGBA images (4 channels with alpha)
- ✅ Verify output dimensions are correct (1200x1600x3 = 5.76MB)
- ✅ Verify rotation parameter defaults to 0 (not 1200)
- ✅ Reject uploads without files
- ✅ **Regression test**: Verify parameters are NOT swapped
- ✅ Handle all 6 Spectra colors correctly

### 2. Image Processing Tests (`convert-image-to-rgb.test.js`)

**Purpose**: Unit tests for the `convertImageToRGB` function itself.

**Tests**:
- Image format handling (RGB, RGBA, grayscale)
- Parameter validation (rotation, dimensions, options)
- Output validation (exact size, RGB triplets)
- Rotation handling (0°, 90°, 180°, 270°)
- Dithering options (Floyd-Steinberg, Atkinson)
- Spectra 6 palette color mapping
- Error handling (missing files, corrupt images, oversized images)

### 3. Existing Test Suites

**From previous test run**:
- ✅ `eink-conversion.test.js` - E-ink color conversion tests
- ✅ `image-processing.test.js` - General image processing
- ✅ `full-pipeline.test.js` - End-to-end pipeline tests
- ✅ `api.test.js` - API endpoint tests

## Test Statistics

**Total Tests**: 135+ tests
- **Passing**: 131+ tests
- **Failing**: 4 tests (2 preview format tests, 2 timeout tests)
- **Coverage**: Critical image processing pipeline fully covered

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test upload-endpoint.test.js

# Run tests with coverage
npm test -- --coverage

# Run tests in watch mode
npm test -- --watch
```

## CI/CD Integration

### Pre-commit Checks
```bash
# Run before committing code
npm test:ci
```

### Automated Testing
- Tests run automatically on every commit
- Pull requests require all tests to pass
- Test failures block deployment

## Critical Test Cases

### 1. Parameter Order Regression Test

**File**: `upload-endpoint.test.js`
**Test**: "should NOT swap rotation and width parameters"

This test specifically validates the bug fix where `convertImageToRGB` was being called with parameters in the wrong order.

**Validation**:
- Upload a test image
- Verify output is exactly 5,760,000 bytes (1200×1600×3)
- Confirms dimensions are correct, not swapped

### 2. RGBA Alpha Channel Handling

**File**: `upload-endpoint.test.js`
**Test**: "should upload RGBA image (with alpha) and handle correctly"

This test validates the fix for PNG images with transparency (alpha channel).

**Validation**:
- Upload PNG with 4 channels (RGBA)
- Verify it's converted to 3 channels (RGB)
- Confirm `.removeAlpha()` is called correctly

### 3. Multi-Color Validation

**File**: `upload-endpoint.test.js`
**Test**: "should handle all color channels correctly"

This test ensures all 6 Spectra colors are processed correctly:
- Black (0,0,0)
- White (255,255,255)
- Yellow (255,255,0)
- Red (255,0,0)
- Blue (0,0,255)
- Green (0,255,0)

## Future Test Improvements

### ESP32 Integration Tests
- [ ] Mock ESP32 HTTP requests
- [ ] Test `/api/image.bin` binary format
- [ ] Verify e-ink color mapping matches server palette
- [ ] Test memory allocation scenarios

### Performance Tests
- [ ] Benchmark image processing times
- [ ] Test large file uploads (>10MB)
- [ ] Verify memory usage during processing
- [ ] Test concurrent upload handling

### Visual Regression Tests
- [ ] Compare dithered output against expected images
- [ ] Verify color accuracy after processing
- [ ] Test edge cases (solid colors, gradients, patterns)

## Known Issues

1. **Preview endpoint tests fail** - Response format mismatch (returns JSON instead of PNG)
2. **Art search timeout** - External API tests timing out (needs longer timeout or mocking)

## Test Maintenance

### When to Update Tests

**Add new tests when**:
- Adding new image processing features
- Modifying `convertImageToRGB` signature
- Adding new API endpoints that process images
- Fixing bugs (add regression test)

**Update existing tests when**:
- Changing default parameters
- Modifying image dimensions
- Updating color palette
- Changing output format

### Test Data

Test images are located in:
- `__tests__/fixtures/` - Permanent test images
- `__tests__/output/` - Generated during tests (cleaned up after)

## Debugging Failed Tests

```bash
# Run tests with verbose output
npm test -- --verbose

# Run single test
npm test -- --testNamePattern="should NOT swap"

# Debug with Node inspector
node --inspect-brk node_modules/.bin/jest upload-endpoint.test.js
```

## Coverage Reports

```bash
# Generate coverage report
npm test -- --coverage

# View HTML coverage report
open coverage/lcov-report/index.html
```

## Contact

For questions about tests, see:
- Test files in `__tests__/` directory
- This documentation: `TESTING.md`
- Main README: `README.md`
