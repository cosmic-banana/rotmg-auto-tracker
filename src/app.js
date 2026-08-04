const Listener = require("./listener");
const WikiScraper = require("./wikiScraper");
const Session = require("./session");
const RotmgBuilds = require("./rotmgBuilds");

class App {
    async start() {
        const ws = new WikiScraper();
        const rb = new RotmgBuilds();
        const trackedItemsPromise = rb.setAllTrackedItems();
        const gameUpdateExists = false;

        if (gameUpdateExists) {
            await Promise.all([
                ws.setCompletionTrackedItems(),
                trackedItemsPromise
            ]);
            ws.newItemsSinceLastUpdate();
            const unrecognizedItems = rb.getUnrecognizedItems(ws.completionTrackedItems, rb.masterList);
            ws.errorCorrectSkins(unrecognizedItems);
            console.log("Unrecognized items from Rotmg-builds.com:")
            console.log(rb.getUnrecognizedItems(ws.completionTrackedItems, rb.masterList));
            ws.saveItems();
        } else {
            ws.loadItems();
        }

        await rb.login();
        this.rotmgBuilds = rb;
        this.wikiScraper = ws;
        new Listener(this).start();
    }

    newConnection() {
        return new Session(this);
    }
}

new App().start();