const Util = require("../util");
const Packet_2A = require("../packet_2a");
const Debug = require("../debug");

/**
 * Each map change opens a new connection, represented by this class
 */
class Session {

    seenLootbags = [] //discount lootbags which have already been rendered once
    saveToCollectionLog; //function
    wikiItems = {}; //a superset of items tracked by rotmg-builds.com
    masterItems = {}; //Exclusively and entirely every item tracked by rotmg-builds.com

    constructor(app) {
        this.saveToCollectionLog = app.rotmgBuilds.logItem.bind(app.rotmgBuilds);
        this.wikiItems = app.wikiScraper.wikiItems;
        this.masterItems = Object.fromEntries(
            app.rotmgBuilds.masterlistItems.map(value => [value, true])
        );
    }

    handlePacket(packetId, payload) {
        if (packetId !== 0x2A)
            return

        const packet = new Packet_2A(payload);
        if (!packet.hasLoot())
            return;

        for (let id of packet.getLootBagIds()) {
            if (this.isNewLootBag(id)) {
                this.addLootBag(id);
                let loot = packet.getLootBagContentsById(id);
                for (let item of loot) {
                    if (this.wikiItems[item[0]]) item[0] = this.wikiItems[item[0]];
                    item[1] = Util.getItemRarity(item[1]);
                }
                Debug.sessionLog(`item count in bag ${id}: ${loot.length}`);
                const potentialLoot = loot.filter(e => isNaN(e[0]));
                for(let i=0; i<potentialLoot.length; i++) {
                    if (potentialLoot[i][0] in this.masterItems) {
                        Debug.sessionLog(`saveToCollectionLog() invoked`);
                        this.saveToCollectionLog(potentialLoot[i][0], potentialLoot[i][1]);
                    } else {
                        Debug.sessionLog(`Item not logged: ${potentialLoot[i][0]}`);
                    }
                }
            }
        }
    }

    isNewLootBag(objectId) {
        return !this.seenLootbags.includes(objectId);
    }

    addLootBag(objectId) {
        this.seenLootbags.push(objectId);
    }
}

module.exports = Session;