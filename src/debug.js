class Debug {
    static config = {
        packet2A: {
            enabled: false,
            objectLimit: Number.MAX_SAFE_INTEGER
        },
        listener: {
            enabled: false
        },
        rotmgBuilds: {
            enabled: false
        },
        tcpReassembler: {
            enabled: false
        },
        session: {
            enabled: false
        },
        startup: {
            enabled: false
        }
    };

    static startupLog(msg) {
        if (Debug.config.startup.enabled) console.log(msg);
    }
    static sessionLog(msg) {
        if (Debug.config.session.enabled) console.log(msg);
    }
    static tcpReassemblerLog(msg) {
        if (Debug.config.tcpReassembler.enabled) console.log(msg);
    }
    static rotmgBuildsLog(msg) {
        if (Debug.config.rotmgBuilds.enabled) console.log(msg);
    }
    static listenerLog(msg) {
        if (Debug.config.listener.enabled) console.log(msg);
    }
    static packet2ALog(msg) {
        if (Debug.config.packet2A.enabled) console.log("[Packet2A] " + msg);
    }
    static dev(msg) {
        console.log(msg);
    }

    static packet2AObject(index, object) {
        const config = Debug.config.packet2A;
        if (!config.enabled)
            return;

        if (index < config.objectLimit) {
            console.dir(object, {
                depth: null,
                maxArrayLength: null
            });
        }
    }
}

module.exports = Debug;