class BufferReader {
    constructor(buffer) {
        this.buffer = buffer;
        this.offset = 0;
    }

    readByte() {
        if (this.offset >= this.buffer.length) throw new Error('Read beyond buffer');
        return this.buffer[this.offset++];
    }

    readShort() {
        if (this.offset + 2 > this.buffer.length) throw new Error('Out of range readShort');
        const value = this.buffer.readInt16BE(this.offset);
        this.offset += 2;
        return value;
    }

    readUShort() {
        if (this.offset + 2 > this.buffer.length) throw new Error('Out of range readUShort');
        const value = this.buffer.readUInt16BE(this.offset);
        this.offset += 2;
        return value;
    }

    readUInt() {
        if (this.offset + 4 > this.buffer.length) throw new Error('Out of range readUInt');
        const value = this.buffer.readUInt32BE(this.offset);
        this.offset += 4;
        return value;
    }

    readFloat() {
        if (this.offset + 4 > this.buffer.length) throw new Error('Out of range readFloat');
        const value = this.buffer.readFloatBE(this.offset);
        this.offset += 4;
        return value;
    }

    skip(bytes) {
        this.offset += bytes;
    }

    readString() {
        const len = this.readShort();
        if (len < 0 || len > this.buffer.length - this.offset)
            throw new Error("Nonsense string parsed");

        const str = this.buffer.toString(
            "utf8",
            this.offset,
            this.offset + len
        );
        this.offset += len;
        return str;
    }

    readCompressedInt() {
        if (this.remaining() <= 0) throw new Error('No bytes left for compressed int');
        let byte = this.readByte();
        const negative = (byte & 64) !== 0; //sign bit (01000000), only first byte
        let value = byte & 63;
        let shift = 6;
        let bytesRead = 1;

        while ((byte & 128) !== 0) { //continuation bit (10000000)
            if (bytesRead++ >= 5) {
                throw new Error("Too big int parsed");
            }
            if (this.remaining() <= 0) throw new Error('Truncated compressed int');
            byte = this.readByte();
            value |= (byte & 127) << shift;
            shift += 7;
        }

        return negative ? -value : value;
    }

    remaining() {
        return this.buffer.length - this.offset;
    }

    inspect(bytes) {
        return this.buffer.subarray(this.offset, this.offset+bytes);
    }
}

module.exports = BufferReader;