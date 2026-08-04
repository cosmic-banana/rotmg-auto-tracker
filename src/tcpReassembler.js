const RotmgPacketParser = require("./rotmgPacketParser");

class TcpReassembler {

    constructor(isn, packetEvent) { 
        this.seq = isn;
        this.pending = new Map(); //seq -> Buffer
        this.rotmgPacketParser = new RotmgPacketParser(packetEvent);
        this.lastActivity = Date.now();
    }

    addPacket(packet) {
        this.lastActivity = Date.now();        

        //Retransmissions/already processed
        if (packet.seq < this.seq)
            return;

        //Future packet, buffer it
        if (packet.seq > this.seq) {
            if (!this.pending.has(packet.seq))
                this.pending.set(packet.seq, packet.payload);
            return;
        }

        //Expected packet
        this.rotmgPacketParser.feed(packet.payload);
        this.seq += packet.payload.length;

        //Flush any buffered contiguous packets
        while (this.pending.has(this.seq)) {
            const payload = this.pending.get(this.seq);
            this.pending.delete(this.seq);
            this.rotmgPacketParser.feed(payload);
            this.seq += payload.length;
        }
    }

}

module.exports = TcpReassembler;