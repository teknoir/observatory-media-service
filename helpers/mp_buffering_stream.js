const { Transform } = require('stream');
const logger = require('./logger');

class MP4BufferingStream extends Transform {
    constructor(options) {
        super(options);
        this.buffer = null; // Pre-allocated buffer for current fragment
        this.bufferFilled = 0; // How much of the buffer is filled
        this.expectedFragmentSize = null; // Cache the expected fragment size
        this.headerBuffer = Buffer.alloc(0); // Small buffer for reading headers
    }

    _transform(chunk, encoding, callback) {
        let chunkOffset = 0;

        while (chunkOffset < chunk.length) {
            // If we don't know the fragment size yet, accumulate header data
            if (this.expectedFragmentSize === null) {
                // Need to read at least 8 bytes for the header
                const headerBytesNeeded = 8 - this.headerBuffer.length;

                if (headerBytesNeeded > 0) {
                    const headerBytesToCopy = Math.min(headerBytesNeeded, chunk.length - chunkOffset);
                    const newHeaderData = chunk.slice(chunkOffset, chunkOffset + headerBytesToCopy);
                    this.headerBuffer = Buffer.concat([this.headerBuffer, newHeaderData]);
                    chunkOffset += headerBytesToCopy;
                }

                // Try to read the fragment size
                if (this.headerBuffer.length >= 8) {
                    this.expectedFragmentSize = this.getFragmentSize(this.headerBuffer, 0);

                    if (this.expectedFragmentSize !== null) {
                        // Pre-allocate buffer for the entire fragment
                        this.buffer = Buffer.alloc(this.expectedFragmentSize);
                        this.bufferFilled = 0;

                        // Copy header data into the fragment buffer
                        this.headerBuffer.copy(this.buffer, 0);
                        this.bufferFilled = this.headerBuffer.length;
                        logger.debug(`Pre-allocated buffer for fragment: ${this.expectedFragmentSize} bytes`);

                        // Clear header buffer
                        this.headerBuffer = Buffer.alloc(0);
                        // Continue to fill the rest of the fragment
                    } else {
                        // Header parsed but fragment size still null (shouldn't happen)
                        break;
                    }
                } else {
                    // Not enough data yet, wait for more
                    break;
                }
            }

            // We know the fragment size, fill the pre-allocated buffer
            if (this.expectedFragmentSize !== null && chunkOffset < chunk.length) {
                const remainingFragmentSpace = this.expectedFragmentSize - this.bufferFilled;
                const remainingChunkData = chunk.length - chunkOffset;
                const bytesToCopy = Math.min(remainingFragmentSpace, remainingChunkData);

                chunk.copy(this.buffer, this.bufferFilled, chunkOffset, chunkOffset + bytesToCopy);
                this.bufferFilled += bytesToCopy;
                chunkOffset += bytesToCopy;

                logger.debug(`Buffer filled: ${this.bufferFilled} / ${this.expectedFragmentSize} bytes`);

                // Check if fragment is complete
                if (this.bufferFilled === this.expectedFragmentSize) {
                    // Push the complete fragment downstream
                    this.push(this.buffer);
                    logger.debug(`Pushed fragment of size: ${this.expectedFragmentSize} bytes`);

                    // Reset for next fragment
                    this.buffer = null;
                    this.bufferFilled = 0;
                    this.expectedFragmentSize = null;
                }
            }
        }

        callback();
    }

    getFragmentSize(buffer, offset) {
        // Ensure there are at least 8 bytes to read the size and type
        if (buffer.length - offset < 8) {
            logger.debug('Not enough data to determine fragment size');
            return null;
        }

        // Read the 4-byte size field (big-endian)
        const size = buffer.readUInt32BE(offset);

        // Read the 4-byte type field
        const type = buffer.toString('utf8', offset + 4, offset + 8);

        // Validate the size (e.g., ensure it is reasonable)
        if (size < 8) { // Minimum size is 8 bytes (size + type)
            logger.error(`Invalid fragment size: ${size}, type: ${type}`);
            return null;
        }

        // Handle the `mdat` atom
        if (type === 'mdat') {
            logger.debug(`Detected mdat atom of size: ${size}`);
            return size; // Return the size - caller will check if buffer has enough data
        }

        // Handle the `free` atom
        if (type === 'free') {
            logger.debug(`Skipping free atom of size: ${size}`);
            return size; // Treat `free` as a valid atom and skip it
        }

        // For other atom types, apply a higher maximum size limit (e.g., 1 GB)
        const maxSize = 1 * 1024 * 1024 * 1024; // 1 GB
        if (size > maxSize) {
            logger.error(`Fragment size exceeds maximum limit: ${size}, type: ${type}`);
            return null;
        }

        // Validate the type (optional, but useful for debugging)
        logger.debug(`Fragment type: ${type}, size: ${size}`);
        return size;
    }
}

module.exports = { MP4BufferingStream };
