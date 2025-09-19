const { Transform } = require('stream');
const logger = require('./logger');

class MP4BufferingStream extends Transform {
    constructor(options) {
        super(options);
        this.buffer = Buffer.alloc(0); // Initialize an empty buffer
    }

    _transform(chunk, encoding, callback) {
        // Append the new chunk to the buffer
        this.buffer = Buffer.concat([this.buffer, chunk]);
        logger.debug(`Buffer size: ${this.buffer.length} bytes`);

        let offset = 0;
        while (offset < this.buffer.length) {
            // Determine the size of the next MP4 fragment
            const fragmentSize = this.getFragmentSize(this.buffer, offset);

            if (fragmentSize === null || offset + fragmentSize > this.buffer.length) {
                // Not enough data for a complete fragment, wait for more data
                break;
            }

            // Push the complete fragment downstream
            this.push(this.buffer.slice(offset, offset + fragmentSize));
            logger.debug(`Pushed fragment of size: ${fragmentSize} bytes`);
            offset += fragmentSize;
        }

        // Retain the remaining incomplete data in the buffer
        this.buffer = this.buffer.slice(offset);
        logger.debug(`Remaining buffer size: ${this.buffer.length} bytes`);

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
            if (buffer.length - offset < size) {
                logger.debug(`Waiting for full mdat atom: ${size} bytes`);
                return null; // Wait for the full `mdat` atom
            }
            return size; // Return the size of the `mdat` atom
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
