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
            if (this.buffer.length < packetLength) //Wait for remaining bytes in packet
                return;

            const packet = this.buffer.subarray(0, packetLength); //Complete packet
            this.buffer = this.buffer.subarray(packetLength); //Remove it from the receive buffer
            var decrypted = this.in.decrypt(packet.subarray(5));
         
            try {
                this.packetEvent(packet.readUInt8(4), decrypted);
            } catch (e) { //Will likely occur if stream desyncs for any reason. Could then recover on reload or crash from buffer overflow. Caught here for logging decrypted bytes.
                console.error(`[ERROR] len=${packetLength} headers=${packet.subarray(0,5).toString("hex")} decrypted_bytes=${decrypted.toString("hex")}`);
                throw e;
            }
        }
    }

}

module.exports = RotmgPacketParser;