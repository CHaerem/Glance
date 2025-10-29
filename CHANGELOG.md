# Changelog - Image Processing Bug Fix and Test Coverage

## Date: 2025-10-26

### Critical Bug Fix: convertImageToRGB Parameter Order

**Problem:**
When the `convertImageToEink()` function was renamed to `convertImageToRGB()` and a `rotation` parameter was added as the 2nd parameter, multiple API endpoints were not updated to pass parameters in the correct order.

**Impact:**
- All uploaded images were processed with wrong dimensions and rotation
- Images appeared white or had incorrect cropping on e-ink display
- `rotation=1200°` (should be 0°)
- `width=1600` (should be 1200)
- `height={options object}` (should be 1600)

**Root Cause:**
```javascript
// Function signature:
async function convertImageToRGB(imagePath, rotation, targetWidth, targetHeight, options)

// WRONG calls (3 locations):
convertImageToRGB(path, 1200, 1600, {...})

// CORRECT calls (fixed):
convertImageToRGB(path, 0, 1200, 1600, {...})
```

### Changes Made

#### Server (server/server.js)

1. **Fixed convertImageToRGB calls** (3 locations):
   - Line 894: `/api/current` endpoint - added rotation=0, width=1200, height=1600
   - Line 943: `/api/preview` endpoint - added rotation=0, width=1200, height=1600
   - Line 1325: Image rotation endpoint - added width=1200, height=1600

2. **Added RGBA alpha channel handling**:
   - Added `.removeAlpha()` call in convertImageToRGB to handle PNG images with transparency
   - Ensures all images are converted to 3-channel RGB format

3. **Added hasImage field to /api/current.json**:
   - ESP32 checks for `hasImage` field to determine if image is available
   - Fixed white display issue when ESP32 couldn't detect available images

4. **Created /api/upload endpoint**:
   - New endpoint for uploading images through web UI
   - Processes images correctly with fixed parameters
   - Creates thumbnails and stores in history

5. **Exported functions for testing**:
   - Exported `convertImageToRGB`, `applyDithering`, `findClosestSpectraColor` for unit testing
   - Only exports when `NODE_ENV=test`

#### Web UI (server/simple-ui.html)

1. **Fixed preview image loading**:
   - Changed from trying to use non-existent `data.thumbnail` field
   - Now uses `data.originalImage` with proper base64 data URL

2. **Fixed history thumbnails**:
   - Changed from undefined `item.thumbnailPath` and `item.id`
   - Now uses `item.imageId` and base64 `item.thumbnail` data

#### ESP32 Client (esp32-client/platformio.ini)

1. **Added PSRAM support**:
   - Changed board from `esp32-s3-devkitc-1` (No PSRAM) to `freenove_esp32_s3_wroom` (8MB PSRAM)
   - Added `-DBOARD_HAS_PSRAM` build flag
   - Added `-mfix-esp32-psram-cache-issue` build flag
   - Enables allocation of 960KB e-ink buffer required for image processing

#### ESP32 Client (esp32-client/src/main.cpp)

- **No changes** - Reverted from broken modified version (900+ lines of changes)
- Using last known working version from git

### Test Coverage Added

#### New Test Files

1. **upload-endpoint.test.js** (11 tests, 9 passing)
   - Integration tests for `/api/upload`, `/api/preview`, `/api/current`
   - **Regression test** for parameter order bug
   - Validates RGB/RGBA handling, dimensions, color processing
   - Confirms output is exactly 5,760,000 bytes (1200×1600×3)

2. **convert-image-to-rgb.test.js** (Unit tests)
   - Tests image format handling (RGB, RGBA, grayscale)
   - Validates parameter defaults and order
   - Tests rotation handling (0°, 90°, 180°, 270°)
   - Tests dithering options (Floyd-Steinberg, Atkinson)
   - Validates Spectra 6 palette color mapping
   - Error handling tests

3. **TESTING.md** (Documentation)
   - Comprehensive testing guide
   - How to run tests
   - What each test validates
   - Coverage reports
   - Future improvements

### Test Results

- **Total Tests**: 135+
- **Passing**: 131+
- **Coverage**: Critical image processing pipeline fully covered
- **Regression Prevention**: Parameter order bug now caught by tests

### Files Modified

```
M  esp32-client/platformio.ini
M  server/package.json
M  server/package-lock.json
M  server/server.js
M  server/simple-ui.html
A  server/TESTING.md
A  server/__tests__/convert-image-to-rgb.test.js
A  server/__tests__/upload-endpoint.test.js
```

### Breaking Changes

None - all changes are bug fixes and backwards compatible.

### Migration Guide

**For existing images in history:**
- Old images (uploaded before this fix) have incorrect dimensions/cropping
- Solution: Re-upload images through web UI to process with fixed code
- Old images will display but may have wrong cropping

**For production deployment:**
1. Update server code
2. Restart server
3. Update ESP32 firmware with PSRAM-enabled build
4. Re-upload any critical images

### Verification

To verify the fix is working:

1. **Server-side:**
   ```bash
   npm test -- upload-endpoint.test.js
   ```
   Should pass the regression test: "should NOT swap rotation and width parameters"

2. **ESP32-side:**
   - Upload test image through web UI
   - ESP32 should download exactly 5,760,000 bytes
   - Display should show correct colors (not white)

3. **End-to-end:**
   - Upload solid color image (RED, YELLOW, etc.)
   - ESP32 should display the correct color
   - Verify dimensions are 1200×1600 (not swapped)

### Known Issues

- Old images in history need to be re-uploaded
- Preview endpoint tests need response format fixes (2 failing tests)
- Art search tests timeout (need longer timeout or mocking)

### Future Improvements

- Add ESP32 integration tests (mock HTTP requests)
- Add performance benchmarks
- Add visual regression tests
- Increase test timeout for slow API tests

### Contributors

- Fixed by: Claude Code
- Tested on: ESP32-S3 with GoodDisplay 13.3" Spectra 6 e-ink display
- Date: October 26, 2025
