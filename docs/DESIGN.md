# Design Principles

**Glance** follows calm technology principles: technology that informs but doesn't demand attention, that stays on the periphery of awareness, and respects human attention.

## Core Philosophy

### Calm Technology
- Technology should inform without demanding attention
- The display exists on the periphery of awareness
- Updates happen silently, without alerts or notifications
- The device respects human time and attention

### Minimalism
- Remove everything unnecessary
- Focus on content, not interface
- Simple interactions with clear purpose
- No decorative elements without function

### Intentional Design
- Every feature serves a clear purpose
- Complexity is hidden behind simple interfaces
- Power users can access advanced options
- Default settings work for most use cases

## User Interface

### Visual Design

**Monochrome Aesthetic**
- Clean black and white interface
- Gray for secondary information
- Subtle borders and spacing
- Typography as primary design element

**Hidden Complexity**
- Advanced options hidden by default
- "Show Details" pattern for optional information
- Progressive disclosure of complexity
- Essential controls always visible

**Typography**
- System fonts for familiarity
- Small uppercase labels for hierarchy
- Comfortable reading size (0.9rem base)
- Letter-spacing for clarity

**Spacing & Rhythm**
- Generous white space
- Consistent padding (12-20px)
- Clear visual grouping
- Breathing room around elements

### Interaction Design

**Subtle Feedback**
- Soft hover states
- Smooth transitions (0.2s ease)
- Non-intrusive status messages
- Inline validation

**Progressive Enhancement**
- Core functionality works without JavaScript
- Enhanced features layer on top
- Graceful degradation
- Mobile-responsive by default

**Smart Defaults**
- Sensible default values
- Common workflows optimized
- Minimal required decisions
- Easy to undo and retry

## Content Strategy

### AI Art Generation

**Prompt Philosophy**
- Full-bleed compositions that fill the frame
- High contrast optimized for e-ink displays
- Bold, striking artwork suitable for wall display
- Edge-to-edge detail without empty margins

**"Feeling Lucky" Feature**
- Expands simple ideas into detailed prompts
- Emphasizes e-ink display characteristics
- Surprises with creative interpretations
- Removes creative blocks

**Prompt Display**
- Original prompts shown subtly below preview
- Italic gray text in contained box
- Only visible for AI-generated images
- Helps users learn effective prompting

### Image Processing

**Quality Over Speed**
- Floyd-Steinberg dithering for best reproduction
- Auto-crop whitespace for better framing
- Contrast enhancement for e-ink clarity
- Process once, display for weeks

**Spectra 6 Palette**
- Exact hardware color matching
- No dithering artifacts from mismatched colors
- Six pure colors: black, white, yellow, red, blue, green
- Artistic quality reproduction

## Hardware Interaction

### Power Management

**Ultra-Low Power Operation**
- Deep sleep between updates (~10μA)
- Wake only when necessary
- Battery life measured in months, not days
- Solar charging compatible

**Intelligent Scheduling**
- Server controls sleep duration
- Dynamic adjustment based on content
- Remote wake-up commands
- Graceful battery level handling

### Display Characteristics

**E-Ink Advantages**
- Zero power to maintain image
- Readable in direct sunlight
- Paper-like aesthetic quality
- Slow refresh encourages contemplation

**E-Ink Constraints**
- 30-45 second full refresh time
- Limited to 6 colors on Spectra 6
- Best for static content
- Embrace the limitations

## Development Principles

### Code Quality

**Readability First**
- Clear variable names
- Commented complex logic
- Consistent formatting
- Self-documenting code

**Minimal Dependencies**
- Only essential packages
- Prefer standard library
- Regular security updates
- Audit dependency tree

**Testing**
- Comprehensive test coverage
- Edge case handling
- Integration tests for critical paths
- Manual testing on real hardware

### Architecture

**Server-Side Processing**
- Heavy computation on Raspberry Pi
- ESP32 as thin display client
- Reduces memory requirements
- Easier updates and debugging

**Local-First**
- No cloud dependencies required
- OpenAI API optional for AI features
- Works on local network
- Privacy by default

**Stateless API**
- RESTful endpoints
- JSON responses
- Clear error messages
- Idempotent operations

## Content Guidelines

### Image Selection

**Recommended Subjects**
- Bold, high-contrast artwork
- Full-frame compositions
- Line art and ink drawings
- Minimalist designs
- Nature close-ups
- Geometric patterns

**Avoid**
- Small text or fine details
- Low contrast photographs
- Images with important margins
- Busy, cluttered compositions
- Gradients (will dither)

### Prompt Writing

**Effective Prompts**
- Describe composition: "close-up", "full-frame", "edge-to-edge"
- Specify contrast: "bold", "high contrast", "dramatic lighting"
- Mention style: "ink drawing", "woodcut", "minimalist"
- Set mood: "serene", "striking", "contemplative"

**Example Prompts**
- "Close-up of a sunflower filling the entire frame with bold contrast"
- "Japanese wave in the style of Hokusai, edge-to-edge detail"
- "Minimalist mountain peaks under dramatic stormy clouds"
- "Geometric mandala pattern with high contrast black and white"

## Maintenance Philosophy

### Long-Term Thinking

**Built to Last**
- Quality components
- Repairable design
- Standard connectors
- Open source software

**Low Maintenance**
- Automatic updates via Docker
- Self-healing (reconnects after errors)
- Battery monitoring
- Remote diagnostics

**Sustainable**
- Ultra-low power consumption
- Solar charging compatible
- Recyclable components
- Years of operation expected

## Future Direction

### Planned Enhancements

**Stay True to Principles**
- New features must maintain simplicity
- Complexity hidden in advanced settings
- Core experience stays minimal
- Calendar and weather widgets (optional)

**What We Won't Add**
- Push notifications or alerts
- Social media integration
- Advertising or tracking
- Unnecessary animations
- Auto-play anything

### Community Values

**Open Source**
- Transparent development
- Community contributions welcome
- Document design decisions
- Share learnings publicly

**Privacy First**
- No user tracking
- No data collection
- No cloud accounts required
- OpenAI API key stored locally

**Accessibility**
- Works without JavaScript (core features)
- Keyboard navigation
- Screen reader compatible
- Clear error messages

---

## Summary

**Glance is calm technology:** It displays beautiful artwork without demanding attention. It respects your time with long battery life and autonomous operation. The interface is minimal because the content is what matters. Every design decision serves the goal of creating a peaceful, ambient display that enriches your environment without adding stress or distraction.

**If a feature doesn't serve this goal, it doesn't belong in Glance.**
