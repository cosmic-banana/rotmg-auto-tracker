const { execFileSync, spawn } = require("child_process");
const TcpReassembler = require("./tcpReassembler");
const Debug = require("./debug");
const fs = require("fs");
const os = require("os");

class Listener {

    tcpReassemblers = new Map(); //Only 1 connection is ever active at a time, but there may be overlap between ending an old connection and starting a new one.

    constructor(app) {
        this.app = app;
        this.partial = "";
        this.tshark = null;
    }

    static parseDefaultRouteInterfaceAlias(output) {
        const lines = output.split(/\r?\n/);

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("InterfaceAlias") || trimmed.includes("----"))
                continue;

            const tokens = trimmed.split(/\s+/);
            if (tokens.length >= 2 && tokens[0] && tokens[0] !== "IfIndex" && tokens[0] !== "DestinationPrefix") {
                return tokens[0];
            }
        }

        return null;
    }

    static pickFallbackInterfaceName(networkInterfaces = os.networkInterfaces()) {
        return networkInterfaces.Ethernet ? "Ethernet" : "Wi-Fi";
    }

    findDefaultRouteInterfaceName() {
        try {
            const output = execFileSync(
                "powershell.exe",
                [
                    "-NoProfile",
                    "-Command",
                    "Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object RouteMetric | Select-Object -First 1 -ExpandProperty InterfaceAlias"
                ],
                { encoding: "utf8" }
            );

            const interfaceAlias = output.trim();
            if (interfaceAlias) {
                return interfaceAlias;
            }
        } catch (error) {
            Debug.listenerLog(`Could not resolve default route interface via PowerShell: ${error.message}`);
        }

        return Listener.pickFallbackInterfaceName();
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
        const interfaceName = this.findDefaultRouteInterfaceName();

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
        this.tshark = spawn(this.findTshark(), [
            "-i", this.findInterfaceNumber().toString(),
            "-f", "tcp src port 2050", //only server messages for now
            "-T", "fields",
            "-e", "tcp.stream",
            "-e", "tcp.seq",
            "-e", "tcp.payload"
        ]);

        this.tshark.stdout.setEncoding("utf8");
        this.tshark.stdout.on("data", data => {
            this.handleStdoutChunk(data);
        });

        setInterval(() => { //start thread to clean up idle connections
            const now = Date.now()
            for (const [stream, c] of this.tcpReassemblers) {
                if (now - c.lastActivity > 90000) { //set high to avoid killing active connection when idling in-game
                    this.tcpReassemblers.delete(stream);
                    Debug.listenerLog(`Deleted old connection: ${stream}`);
                    continue;
                }
            }
        }, 30000)

        this.tshark.stderr.on("data", data => {
            console.error("[tshark]", data.toString().trim());
        });

        this.tshark.on("close", code => {
            console.log("tshark exited with code", code);
            this.tshark = null;
        });
    }

    stop() {
        if (this.tshark) {
            try { this.tshark.kill(); } catch (e) { /* ignore */ }
            this.tshark = null;
        }
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
            Debug.listenerLog(`New Stream [${tcpSegment.stream}], ISN [${tcpSegment.seq}], ${tcpSegment.payload.subarray(0,9).toString("hex")}`);
            this.tcpReassemblers.set(tcpSegment.stream, new TcpReassembler(tcpSegment.seq, session.handlePacket.bind(session)));
        }
        this.tcpReassemblers.get(tcpSegment.stream).addPacket(tcpSegment);
    }
    
}

module.exports = Listener;