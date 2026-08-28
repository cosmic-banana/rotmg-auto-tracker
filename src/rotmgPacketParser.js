const RC4 = require("./RC4");

/**
 * Packet framing for RotMG is
 * [4-byte packet length, including these headers]
 * [1-byte packet type]
 * [RC4-encrypted payload]
 */
class RotmgPacketParser {
    constructor(packetEvent) {
        this.packetEvent = packetEvent;
        this.in = new RC4(0);
        this.buffer = Buffer.alloc(0);
    }

    feed(bytes) {
        this.buffer = Buffer.concat([this.buffer, bytes]);

        while (true) {
            if (this.buffer.length < 4)
                return;

            const packetLength = this.buffer.readUInt32BE(0);

            // Defensive checks to avoid attempting to allocate or process absurd sizes
            const MIN_PACKET_LEN = 5; // 4-byte length + 1-byte type
            const MAX_PACKET_LEN = 2 * 1024 * 1024; // 2 MB safety cap

            if (packetLength < MIN_PACKET_LEN || packetLength > MAX_PACKET_LEN) {
                console.error(`[DESYNC] suspicious packetLength=${packetLength} bufferLen=${this.buffer.length}. Dropping one byte to resync.`);
                // Drop first byte and try to resync
                this.buffer = this.buffer.subarray(1);
                continue;
            }

            if (this.buffer.length < packetLength) //Wait for remaining bytes in packet
                return;

            const packet = this.buffer.subarray(0, packetLength); //Complete packet
            this.buffer = this.buffer.subarray(packetLength); //Remove it from the receive buffer

            let decrypted;
            try {
                decrypted = this.in.decrypt(packet.subarray(5));
            } catch (decErr) {
                console.error(`[ERROR] decryption failed for packet headers=${packet.subarray(0,5).toString("hex")} err=${decErr}`);
                continue; //skip this packet but keep processing
            }

            try {
                this.packetEvent(packet.readUInt8(4), decrypted);
            } catch (e) { //Will likely occur if stream desyncs for any reason. Log and continue to avoid crashing.
                try {
                    const hexPreview = decrypted && decrypted.length ? decrypted.subarray(0,64).toString('hex') + (decrypted.length > 64 ? '...' : '') : '<empty>';
                    console.error(`[ERROR] len=${packetLength} headers=${packet.subarray(0,5).toString("hex")} decrypted_bytes=${hexPreview}`);
                } catch (inner) { /* ignore logging errors */ }
                console.error(e);
                // continue processing remaining buffered data instead of throwing
                continue;
            }
        }
    }

}

module.exports = RotmgPacketParser;