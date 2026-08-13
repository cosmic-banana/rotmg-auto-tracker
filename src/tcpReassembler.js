const RotmgPacketParser = require("./rotmgPacketParser");
const Debug = require("./debug");


class TcpReassembler {

    constructor(isn, packetEvent) { 
        this.seq = isn;
        this.pending = new Map(); //seq -> Buffer
        this.rotmgPacketParser = new RotmgPacketParser(packetEvent);
        this.lastActivity = Date.now();
        this.gapped = false;
    }

    addPacket(packet) {
        this.lastActivity = Date.now();

        //Retransmissions/already processed
        if (packet.seq < this.seq) { //this block would discard overlapping packets, but no such occurrences seen
            Debug.tcpReassemblerLog(`===== [TCP RETRANSMISSION] =====`);
            return;
        }

        //Future packet, buffer it
        if (packet.seq > this.seq) {
            this.gapped = true;
            if (!this.pending.has(packet.seq)) {
                this.pending.set(packet.seq, packet.payload);
            }
            Debug.tcpReassemblerLog(`===== [TCP GAP] seq=${packet.seq} expected=${this.seq} len=${packet.payload.length} bufferSize=${this.pending.size} timestamp=${Date.now()%100000} =====`);
            return;
        }

        //Expected packet
        if (this.gapped) {
            this.gapped = false;
            Debug.tcpReassemblerLog(`===== [TCP RECOVERY] seq=${packet.seq} expected=${this.seq} len=${packet.payload.length} timestamp=${Date.now()%100000} =====`);
        }
        this.feedPacket(packet.payload, packet.stream);
        this.seq += packet.payload.length;

        //Flush any buffered contiguous packets
        while (this.pending.has(this.seq)) {
            const payload = this.pending.get(this.seq);
            this.pending.delete(this.seq);
            this.feedPacket(payload, packet.stream);
            Debug.tcpReassemblerLog(`===== [TCP FLUSH] seq=${this.seq} len=${payload.length} timestamp=${Date.now()%100000}`);
            this.seq += payload.length;
        }
    }

    feedPacket(payload, stream) {
        try {
            this.rotmgPacketParser.feed(payload);
        } catch (e) {
            console.error(e);
            console.error(`Error occurred in stream ${stream}`);
        }
    }

}

module.exports = TcpReassembler;