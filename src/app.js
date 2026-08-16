const Listener = require("./networking/listener");
const WikiScraper = require("./wikiScraper");
const Session = require("./game/session");
const RotmgBuilds = require("./rotmgBuilds");
const Debug = require("./debug");

class App {
    async start() {
        const ws = new WikiScraper();
        const rb = new RotmgBuilds();
        const masterlistItemsPromise = rb.setMasterlistItems();
        rb.login();
        const gameUpdateExists = true;

        if (gameUpdateExists) {
            await Promise.all([
                ws.setWikiItems(),
                masterlistItemsPromise
            ]);
            ws.errorCorrectSkins(rb.getUnrecognizedItems(ws.wikiItems));
            if (Debug.config.startup.enabled) {
                ws.newItemsSinceLastUpdate();
                Debug.startupLog("Unrecognized items from Rotmg-builds.com:");
                Debug.startupLog(rb.getUnrecognizedItems(ws.wikiItems));
            }
            ws.saveItems();
        } else {
            ws.loadItems();
            await masterlistItemsPromise; //Each session needs access to this, so wait
        }

        this.rotmgBuilds = rb;
        this.wikiScraper = ws;
        new Listener(this).start();
    }

    newConnection() {
        return new Session(this);
    }
}

new App().start();