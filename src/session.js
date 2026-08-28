const Util = require("./util");
const Packet_2A = require("./packet_2a");
const Debug = require("./debug");

/**
 * Each map change opens a new connection, represented by this class
 */
class Session {

    seenLootbags = [] //discount lootbags which have already been rendered once
    saveToCollectionLog; //function
    wikiItems = {}; //a superset of items tracked by rotmg-builds.com
    masterItems = {}; //Exclusively and entirely every item tracked by rotmg-builds.com

    constructor(app) {
        this.app = app;
        this.saveToCollectionLog = app.rotmgBuilds.logItem.bind(app.rotmgBuilds);
        this.wikiItems = app.wikiScraper.wikiItems;
        this.masterItems = Object.fromEntries(
            app.rotmgBuilds.masterlistItems.map(value => [value, true])
        );
    }

    handlePacket(packetId, payload) {
        if (packetId !== 0x2A)
            return

        let packet;
        try {
            packet = new Packet_2A(payload);
        } catch (e) {
            Debug.sessionLog(`Packet_2A parse error: ${String(e)}`);
            return;
        }

        if (!packet.hasLoot())
            return;

        for (let id of packet.getLootBagIds()) {
            if (this.isNewLootBag(id)) {
                this.addLootBag(id);
                let loot = packet.getLootBagContentsById(id);
                const seenNames = new Set()
                for (let item of loot) {
                    if (this.wikiItems[item[0]]) item[0] = this.wikiItems[item[0]];
                    item[1] = Util.getItemRarity(item[1]);
                }
                Debug.sessionLog(`item count in bag ${id}: ${loot.length}`);
                for (let i = 0; i < loot.length; i++) {
                    let itemName = loot[i][0]
                    const rarity = loot[i][1]

                    // If item is a numeric ID that we cannot resolve to a wiki name, skip it.
                    const isNumericOrig = !isNaN(itemName)
                    if (isNumericOrig && (!this.wikiItems || !this.wikiItems[String(itemName)])) {
                        Debug.sessionLog(`Unresolved numeric item id skipped: ${itemName}`)
                        continue
                    }

                    // canonicalize numeric ids to names where possible so dedupe works across both forms
                    let canonical = String(itemName)
                    if (isNumericOrig && this.wikiItems && this.wikiItems[String(itemName)]) {
                        canonical = this.wikiItems[String(itemName)]
                    }

                    const inMasterStatic = (canonical in this.masterItems)
                    const inMasterDynamic = Array.isArray(this.app.rotmgBuilds.masterlistItems) && this.app.rotmgBuilds.masterlistItems.includes(canonical)

                    // If we have a masterlist available, only log items present there. If masterlist is empty, log everything.
                    const shouldLog = (inMasterStatic || inMasterDynamic) || (Array.isArray(this.app.rotmgBuilds.masterlistItems) && this.app.rotmgBuilds.masterlistItems.length === 0)

                    if (shouldLog) {
                        // Deduplicate by canonical name within this loot bag to avoid multiple saves for the same item
                        if (!seenNames.has(canonical)) {
                            seenNames.add(canonical)
                            Debug.sessionLog(`saveToCollectionLog() invoked for ${canonical} (raw: ${itemName})`);
                            this.saveToCollectionLog(canonical, rarity);
                        } else {
                            Debug.sessionLog(`Duplicate item in bag suppressed: ${canonical} (raw: ${itemName})`);
                        }
                    } else {
                        Debug.sessionLog(`Item not logged (not in masterlist): ${canonical} (raw: ${itemName})`);
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