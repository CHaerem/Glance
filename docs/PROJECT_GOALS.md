# Glance Project - Goals and Vision

## Primary Goal

Create an autonomous, battery-powered e-ink art display system that seamlessly integrates into living spaces, providing a constantly evolving digital art gallery with months of battery life and minimal user intervention.

## Core Objectives

### 1. Ultra-Low Power Art Display
- **Target**: 6+ months battery life on single 20Ah charge
- **Method**: Deep sleep between updates, efficient display refresh cycles
- **Metric**: <10mWh per day average consumption

### 2. Seamless Art Updates
- **Two Update Pathways**:
  1. **Automatic Server Fetch**: Periodic wake and check for new artwork
  2. **NFC-Triggered**: Instant wake via iPhone tap for immediate updates
- **User Experience**: Zero-configuration after initial setup

### 3. High-Quality Art Reproduction
- **Color Accuracy**: Optimized dithering for Spectra 6 palette
- **Art Styles**: Focus on styles that excel on e-ink:
  - Line art and ink drawings
  - High-contrast illustrations
  - Minimalist designs
  - Wireframe and architectural drawings
- **Processing**: Server-side optimization to minimize ESP32 workload

## Technical Implementation Goals

### Phase 1: Core Functionality (Current)
- [x] ESP32 to e-ink display communication
- [x] WiFi connectivity and server fetch
- [x] Basic power management with deep sleep
- [x] Server-side image processing with dithering
- [x] Web interface for image upload
- [ ] Stable 30-day battery operation

### Phase 2: NFC Integration (Next)
- [ ] ST25R3916 module hardware integration
- [ ] Wake-on-NFC interrupt implementation
- [ ] iPhone NFC app development or web NFC
- [ ] Bluetooth image transfer protocol
- [ ] Power optimization with NFC wake

### Phase 3: Enhanced Features
- [ ] AI-generated art integration
- [ ] Multiple display coordination
- [ ] Adaptive update scheduling
- [ ] Battery level monitoring and alerts
- [ ] Cloud backup and sync

### Phase 4: User Experience
- [ ] Mobile app for iOS/Android
- [ ] Gallery curation features
- [ ] Social sharing capabilities
- [ ] Remote management interface

## Use Cases

### Primary Use Case: Personal Art Gallery
- Display rotating artwork in home/office
- Update frequency: Daily to weekly
- Control: Automatic with occasional manual updates
- Power: Months between charges

### Secondary Use Cases

1. **Interactive Exhibition**
   - Visitors tap NFC to change artwork
   - Instant feedback and engagement
   - Artist information display

2. **Information Display**
   - Weather, calendar, or news updates
   - Low-frequency updates (2-4 times daily)
   - Always-readable without backlight

3. **Digital Photo Frame**
   - Family photos with long retention
   - Special occasion updates via NFC
   - No screen glow in bedroom

## Success Metrics

### Technical Metrics
- **Battery Life**: >180 days on full charge
- **Update Reliability**: >99% successful updates
- **Response Time**: <2 seconds from NFC tap to update start
- **Image Quality**: Recognizable art reproduction at 3+ feet

### User Experience Metrics
- **Setup Time**: <5 minutes from unbox to first image
- **Maintenance**: <1 interaction per month required
- **Update Methods**: Both automatic and manual working seamlessly
- **Error Recovery**: Automatic retry and fallback mechanisms

## Design Principles

### 1. Invisibility
The technology should disappear, leaving only the art visible. No cables, no frequent charging, no complex interfaces.

### 2. Reliability
Once configured, the system should run for months without intervention, gracefully handling network issues and power constraints.

### 3. Flexibility
Support multiple update mechanisms (scheduled, NFC, web) to accommodate different usage patterns and preferences.

### 4. Efficiency
Every component optimized for minimum power consumption while maintaining functionality and user experience.

### 5. Simplicity
User interactions should be intuitive - tap phone to change art, visit website to manage gallery, forget about it otherwise.

## Long-term Vision

### Year 1: Foundation
- Single display perfected
- Core features stable
- 6+ month battery life achieved

### Year 2: Ecosystem
- Multi-display support
- Mobile apps released
- AI art generation integrated
- Community gallery sharing

### Year 3: Platform
- Developer API
- Third-party integrations
- Commercial deployment options
- Educational/museum applications

## Constraints and Considerations

### Technical Constraints
- **Display Refresh**: 19-second full update limits animation
- **Color Palette**: Limited to 6 colors requires careful art selection
- **Processing Power**: ESP32 limitations require server-side processing
- **Network**: WiFi-only limits placement options

### Environmental Constraints
- **Temperature**: 0-50°C operating range
- **Lighting**: Requires ambient light (no backlight)
- **Humidity**: Not waterproof, indoor use only

### User Constraints
- **Initial Setup**: Requires technical knowledge for WiFi config
- **Server Requirement**: Needs always-on Raspberry Pi or cloud server
- **Art Curation**: User must select/create appropriate artwork

## Risk Mitigation

### Technical Risks
1. **Power Failure During Update**
   - Solution: Capacitor bank for stable refresh
   - Fallback: Resume from last known good state

2. **Network Connectivity Loss**
   - Solution: Local image cache on SD card
   - Fallback: Display last successful image

3. **Display Degradation**
   - Solution: Refresh cycling and ghost prevention
   - Monitoring: Track refresh count and quality

### User Experience Risks
1. **Complex Setup**
   - Solution: Detailed documentation and setup wizard
   - Future: Pre-configured units

2. **Battery Management**
   - Solution: Low battery warnings via web interface
   - Future: Solar charging option

## Project Philosophy

Glance represents the intersection of art and technology, where the technology becomes invisible and only the art remains. It's not about having another screen in our lives, but about having art that changes as subtly and naturally as the light throughout the day. The e-ink display provides a paper-like quality that integrates into any space without the harsh glow of traditional displays, while the battery operation ensures complete freedom of placement without the tyranny of power outlets.

The ultimate success of Glance will be measured not in its technical specifications, but in how completely it disappears into the background of daily life while continuously providing moments of visual interest and beauty.