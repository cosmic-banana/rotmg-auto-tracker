const { chromium } = require("playwright");
const config = require("../config.json");
const Debug = require("./debug");

class RotmgBuilds {

    static URL_HOME = "https://www.rotmg-builds.com/"
    masterlistItems; //all items listed on rotmg-builds.com

    constructor() {
        this.logQueue = Promise.resolve(); //does this need http error handling?
    }

    //Intended to do a diff check and error correction against realm.wiki-scraped data
    getUnrecognizedItems(wikiItems) {
        const wikiItemsByName = {};
        for (const [id, name] of Object.entries(wikiItems)) { //reverse lookup once
            wikiItemsByName[name] = id;
        }

        let unrecognized = [];
        for (const name of this.masterlistItems) {
            if (!wikiItemsByName[name])
                unrecognized.push(name);
        }

        return unrecognized;
    }
    
    async setMasterlistItems() {
        let browser;
        try {
            browser = await chromium.launch();
            const page = await browser.newPage();
            await page.goto(RotmgBuilds.URL_HOME + 'pages/tracker.html');
            await page.waitForLoadState("networkidle"); //wait for html doc to be populated with data
            
            const html = await page.content();
            const items = this.traverseHtml(html);
            this.masterlistItems = items;
        } finally {
            await browser.close();
        }
    }

    traverseHtml(html) {
        let itemNames = []
        let pos = html.indexOf('<div class="item-section">');
        do {
            const start = html.indexOf('<div class="item-tile', pos);
            if (start === -1) break;
            const nameStart = html.indexOf('id="count-', start) + 'id="count-'.length;
            if (nameStart === -1 + 'id="count-'.length) break;
            const nameEnd = html.indexOf('"', nameStart);
            const name = html.substring(nameStart, nameEnd);

            itemNames.push(name);
            pos = nameEnd;
        } while (true)
        return itemNames;
    } 

    logItem(itemName, rarity) {
        Debug.rotmgBuildsLog(`Queued for logging: ${itemName}`);
        this.logQueue = this.logQueue.then(async () => {
            let collections = await this.getCollections();
            const collection = collections.find(e => e.name === config.collectionName);
            if (collection === undefined) {
                console.error(`Unknown collection name: ${config.collectionName} - can't log item`);
                return;
            }
            
            if (!("rarities" in collection)) { collection["rarities"] = {}; } //older collections may not have this attribute
    
            let currentRarity = collection.rarities[itemName];
            if (!currentRarity) currentRarity = 0;
            let currentCount = collection.counts[itemName];
            if (!currentCount) currentCount = 0;
    
            collection.counts[itemName] = currentCount+1;
            collection.rarities[itemName] = Math.max(rarity, currentRarity);
            await this.saveCollections(collections);
            console.log(`Added to collection: ${itemName} ${rarity}s`);
        });
    }

    async makeRequest(endpoint, body) {
        const response = await fetch(
            RotmgBuilds.URL_HOME + endpoint,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(body)
            }
        );
        if (!response.ok)
            throw new Error(`HttpError (${response.status})`);
        return await response.json();
    }

    async login() {
        this.jwt = (await this.makeRequest("api/login", {
            username: config.username,
            password: config.password
        })).token;
    }

    async getCollections() {
        return (await this.makeRequest("api/getCollections", {
            username: config.username,
            token: this.jwt
        })).collections;
    }

    async saveCollections(collections) {
        return this.makeRequest("api/saveCollections", { //returns output for async purposes
            username: config.username,
            token: this.jwt,
            collections: collections
        });
    }
}

module.exports = RotmgBuilds;