class BufferReader {
    constructor(buffer) {
        this.buffer = buffer;
        this.offset = 0;
    }

    readByte() {
        return this.buffer[this.offset++];
    }

    readShort() {
        const value = this.buffer.readInt16BE(this.offset);
        this.offset += 2;
        return value;
    }

    readUShort() {
        const value = this.buffer.readUInt16BE(this.offset);
        this.offset += 2;
        return value;
    }

    readUInt() {
        const value = this.buffer.readUInt32BE(this.offset);
        this.offset += 4;
        return value;
    }

    readFloat() {
        const value = this.buffer.readFloatBE(this.offset);
        this.offset += 4;
        return value;
    }

    skip(bytes) {
        this.offset += bytes;
    }

    readString() {
        const len = this.readShort();
        const str = this.buffer.toString(
            "utf8",
            this.offset,
            this.offset + len
        );
        this.offset += len;
        return str;
    }

    readCompressedInt() {
        let byte = this.readByte();
        const negative = (byte & 64) !== 0; //sign, only first byte
        let value = byte & 63;
        let shift = 6;

        while ((byte & 128) !== 0) { //continuation bit
            byte = this.readByte();
            value |= (byte & 127) << shift;
            shift += 7;
        }

        return negative ? -value : value;
    }

    remaining() {
        return this.buffer.length - this.offset;
    }
}

module.exports = BufferReader;