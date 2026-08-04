const { execFileSync, spawn } = require("child_process");
const TcpReassembler = require("./tcpReassembler");
const fs = require("fs");
const os = require("os");

class Listener {

    tcpReassemblers = new Map(); //Only 1 connection is ever active at a time, but there may be overlap between ending an old connection and starting a new one.

    constructor(app) {
        this.app = app;
    }

    findTshark() {
        const tsharkCandidates = [
            "C:\\Program Files\\Wireshark\\tshark.exe",
            "C:\\Program Files (x86)\\Wireshark\\tshark.exe"
        ];
        if (fs.existsSync(tsharkCandidates[0])) {
            return tsharkCandidates[0];
        } else if (fs.existsSync(tsharkCandidates[1])) {
            return tsharkCandidates[1];
        } else {
            throw new Error("Could not locate tshark.exe in default installation path");
        }
    }

    findInterfaceNumber() {
        var interfaceName = os.networkInterfaces()['Ethernet'] ? 'Ethernet' : 'Wi-Fi' //blind assumption that the correct interface is one of these and that ethernet > wifi

        const output = execFileSync(
            this.findTshark(),
            ["-D"],
            { encoding: "utf8" }
        );

        const lines = output.split(/\r?\n/);

        for (const line of lines) {
            const match = line.match(/^(\d+)\.\s+(.*)$/);
            if (!match)
                continue;
            const number = Number(match[1]);
            const name = match[2];

            if (name.includes(interfaceName))
                return number;
        }

        throw new Error(`Could not find interface "${interfaceName}"`);
    }

    start() {
        const tshark = spawn(this.findTshark(), [
            "-i", this.findInterfaceNumber().toString(),
            "-f", "tcp src port 2050", //only server messages for now
            "-T", "fields",
            "-e", "tcp.stream",
            "-e", "tcp.seq",
            "-e", "tcp.payload"
        ]);

        tshark.stdout.setEncoding("utf8");
        tshark.stdout.on("data", data => {
            this.handleStdoutChunk(data);
        });

        setInterval(() => { //start thread to clean up idle connections
            const now = Date.now()
            for (const [stream, c] of this.tcpReassemblers) {
                if (now - c.lastActivity > 90000) { //set high to avoid killing active connection when idling in-game
                    this.tcpReassemblers.delete(stream);
                    console.log(`Deleted old connection: ${stream}`); //dev logging
                    continue;
                }
            }
        }, 30000)

        tshark.stderr.on("data", data => {
            console.error("[tshark]", data.toString().trim());
        });

        tshark.on("close", code => {
            console.log("tshark exited with code", code);
        });
    }

    handleStdoutChunk(chunk) {
        this.partial += chunk;
        const lines = this.partial.split(/\r?\n/); //OS agnostic newline split
        this.partial = lines.pop(); //keep incomplete line

        for (const line of lines) {
            const [stream, seq, payloadHex] = line.split("\t"); //split on tabs
            if (!payloadHex) 
                continue;
            const packet = {
                stream: Number(stream),
                seq: Number(seq),
                payload: Buffer.from(payloadHex, "hex")
            };
            this.handleTcpSegment(packet);
        }
    }

    handleTcpSegment(tcpSegment) {
        if (!this.tcpReassemblers.has(tcpSegment.stream)) { //New connection detected
            const session = this.app.newConnection();
            console.log(`=====================New Stream [${tcpSegment.stream}]======================`); //dev logging
            this.tcpReassemblers.set(tcpSegment.stream, new TcpReassembler(tcpSegment.seq, session.handlePacket.bind(session)));
            //issue when tabbed out and lastActivity might not update?
        }
        this.tcpReassemblers.get(tcpSegment.stream).addPacket(tcpSegment);
    }
    
}

module.exports = Listener;