/**
 * Mock for @xenova/transformers
 * Used to avoid ESM import issues in Jest tests
 */

module.exports = {
    AutoModel: {
        from_pretrained: jest.fn().mockResolvedValue({
            // Mock model
        })
    },
    AutoProcessor: {
        from_pretrained: jest.fn().mockResolvedValue({
            // Mock processor
        })
    },
    RawImage: {
        fromURL: jest.fn().mockResolvedValue({
            // Mock raw image
        }),
        read: jest.fn().mockResolvedValue({
            // Mock raw image from file
        })
    },
    pipeline: jest.fn().mockResolvedValue(() => Promise.resolve({
        // Mock pipeline output
    }))
};
